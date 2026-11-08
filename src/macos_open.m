/*
 * macOS document-open events, and (v13) a flush before the app quits.
 *
 * Native SDK's macOS host does not install an Apple Event handler for
 * kAEOpenDocuments. The bundle advertises .sgf in Info.plist, but a
 * double-clicked document otherwise reaches an app that never answers the
 * event — LaunchServices then reports that Goban Studio cannot open the
 * format.
 *
 * NSApplication installs its own default Apple Event handlers while it
 * finishes launching, so registering ours before `NSApp run` is not enough:
 * the default can replace it. We register at will/did-finish notifications as
 * well as installing delegate methods for the two messages AppKit sends for
 * opened documents. Both paths only forward paths to Zig; reading and parsing
 * stay in the web layer.
 *
 * Quit (v13): the host has no hook between "the user asked to quit" (⌘Q, the
 * Dock, AppleScript, SIGTERM — all [NSApp terminate:]) and the process
 * exiting, so the page's last debounced writes could be lost. We add
 * applicationShouldTerminate: to the delegate (only if it has none): when
 * Zig's callback says so, Zig asks the page to flush and the run loop is
 * spun until goban_reply_quit or GOBAN_QUIT_BACKSTOP seconds, then the quit
 * goes on (NSTerminateNow), so nothing can keep the app from quitting.
 * Windows hidden by the close policy are not affected.
 */
#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

typedef void (*GobanOpenCallback)(void *context, const char *path);

static GobanOpenCallback goban_callback = NULL;
static void *goban_callback_context = NULL;

typedef int (*GobanQuitCallback)(void *context);
static GobanQuitCallback goban_quit_callback = NULL;
static void *goban_quit_context = NULL;
/* A quit is being held until goban_reply_quit (or the backstop). */
static BOOL goban_quit_waiting = NO;
/* Zig's quit gate ends after 1.5 s; this bounds the hold if it never runs. */
#define GOBAN_QUIT_BACKSTOP 3.0

static void GobanForwardPath(NSString *path) {
    if (path.length == 0 || goban_callback == NULL) return;
    const char *utf8 = path.fileSystemRepresentation;
    if (utf8 != NULL) goban_callback(goban_callback_context, utf8);
}

@interface GobanOpenHandler : NSObject
- (void)handleOpenDocuments:(NSAppleEventDescriptor *)event
            withReplyEvent:(NSAppleEventDescriptor *)replyEvent;
@end

@implementation GobanOpenHandler
- (void)handleOpenDocuments:(NSAppleEventDescriptor *)event
            withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
    (void)replyEvent;
    NSAppleEventDescriptor *list = [event paramDescriptorForKeyword:keyDirectObject];
    if (list == nil) return;
    NSInteger count = [list numberOfItems];
    for (NSInteger index = 1; index <= count; index++) {
        NSAppleEventDescriptor *item = [list descriptorAtIndex:index];
        NSURL *url = [item fileURLValue];
        if (url != nil) GobanForwardPath(url.path);
    }
}
@end

static void GobanInstallEventManager(void) {
    static GobanOpenHandler *handler = nil;
    if (handler == nil) handler = [[GobanOpenHandler alloc] init];
    NSAppleEventManager *manager = [NSAppleEventManager sharedAppleEventManager];
    [manager setEventHandler:handler
                 andSelector:@selector(handleOpenDocuments:withReplyEvent:)
               forEventClass:kCoreEventClass
                  andEventID:kAEOpenDocuments];
}

static BOOL GobanApplicationOpenFile(id self, SEL _cmd, NSApplication *sender, NSString *filename) {
    (void)self;
    (void)_cmd;
    (void)sender;
    GobanForwardPath(filename);
    return YES;
}

static void GobanApplicationOpenFiles(id self, SEL _cmd, NSApplication *sender, NSArray<NSString *> *filenames) {
    (void)self;
    (void)_cmd;
    (void)sender;
    for (NSString *filename in filenames) GobanForwardPath(filename);
}

/* Let a waiting quit go on. Called on the main thread (Zig's flush gate);
 * safe to call twice or when nothing waits. */
static volatile BOOL goban_quit_replied = NO;

void goban_reply_quit(void) {
    goban_quit_replied = YES;
}

/* v13: the quit is held synchronously, not with NSTerminateLater. A
 * NSTerminateLater reply depends on the main queue and timers being served
 * while AppKit waits in its modal loop, which the SDK's event loop does not
 * guarantee: in the release self-test a SIGTERM'd app never quit. Instead
 * the run loop is spun here in the default mode (WebKit's bridge replies,
 * the page's flush and Zig's gate timer all run in it) until the page has
 * flushed or the backstop passes, and the answer is always NSTerminateNow:
 * a quit can be late by at most GOBAN_QUIT_BACKSTOP, never lost. */
static NSUInteger GobanApplicationShouldTerminate(id self, SEL _cmd, NSApplication *sender) {
    (void)self;
    (void)_cmd;
    (void)sender;
    /* A second quit while the first is being held: the first one quits. */
    if (goban_quit_waiting) return NSTerminateCancel;
    if (goban_quit_callback == NULL) return NSTerminateNow;
    goban_quit_waiting = YES;
    goban_quit_replied = NO;
    if (goban_quit_callback(goban_quit_context)) {
        NSDate *limit = [NSDate dateWithTimeIntervalSinceNow:GOBAN_QUIT_BACKSTOP];
        while (!goban_quit_replied && [limit timeIntervalSinceNow] > 0) {
            @autoreleasepool {
                [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                         beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
            }
        }
    }
    goban_quit_waiting = NO;
    return NSTerminateNow;
}

static void GobanInstallDelegateMethods(void) {
    id delegate = NSApp.delegate;
    if (delegate == nil) return;
    Class cls = [delegate class];
    class_addMethod(cls, @selector(application:openFile:), (IMP)GobanApplicationOpenFile, "c@:@@");
    class_addMethod(cls, @selector(application:openFiles:), (IMP)GobanApplicationOpenFiles, "v@:@@");
    /* NSApplicationTerminateReply is an NSUInteger ("Q"). Added only when
     * the delegate has no method of its own (class_addMethod refuses). */
    if (goban_quit_callback != NULL) {
        class_addMethod(cls, @selector(applicationShouldTerminate:), (IMP)GobanApplicationShouldTerminate, "Q@:@");
    }
}

void goban_install_quit_handler(void *context, GobanQuitCallback callback) {
    goban_quit_callback = callback;
    goban_quit_context = context;
    /* goban_install_open_handler (called just before) registered the launch
     * observers; installing again now covers a delegate that already exists. */
    GobanInstallDelegateMethods();
}

void goban_install_open_handler(void *context, GobanOpenCallback callback) {
    goban_callback = callback;
    goban_callback_context = context;

    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        [center addObserverForName:NSApplicationWillFinishLaunchingNotification
                            object:nil
                             queue:[NSOperationQueue mainQueue]
                        usingBlock:^(NSNotification *note) {
                            (void)note;
                            GobanInstallEventManager();
                            GobanInstallDelegateMethods();
                        }];
        [center addObserverForName:NSApplicationDidFinishLaunchingNotification
                            object:nil
                             queue:[NSOperationQueue mainQueue]
                        usingBlock:^(NSNotification *note) {
                            (void)note;
                            GobanInstallEventManager();
                            GobanInstallDelegateMethods();
                        }];
    });

    // Also try now; if the app is already running this takes effect at once.
    GobanInstallEventManager();
    GobanInstallDelegateMethods();
}
