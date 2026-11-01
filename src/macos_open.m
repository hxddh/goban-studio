/*
 * macOS document-open events.
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
 */
#import <Cocoa/Cocoa.h>

typedef void (*GobanOpenCallback)(void *context, const char *path);

static GobanOpenCallback goban_callback = NULL;
static void *goban_callback_context = NULL;

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

static void GobanInstallDelegateMethods(void) {
    id delegate = NSApp.delegate;
    if (delegate == nil) return;
    Class cls = [delegate class];
    class_addMethod(cls, @selector(application:openFile:), (IMP)GobanApplicationOpenFile, "c@:@@");
    class_addMethod(cls, @selector(application:openFiles:), (IMP)GobanApplicationOpenFiles, "v@:@@");
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
