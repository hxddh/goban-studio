/*
 * macOS document-open events.
 *
 * Native SDK's macOS host does not install an Apple Event handler for
 * kAEOpenDocuments. The bundle advertises .sgf in Info.plist, but a
 * double-clicked document otherwise reaches an app that never answers the
 * event — LaunchServices then reports that Goban Studio cannot open the
 * format.
 *
 * This file installs the one handler the app needs. It only forwards the
 * selected paths to Zig; reading and parsing stay in the web layer.
 */
#import <Cocoa/Cocoa.h>

typedef void (*GobanOpenCallback)(void *context, const char *path);

static GobanOpenCallback goban_callback = NULL;
static void *goban_callback_context = NULL;

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
        if (url == nil) continue;
        const char *path = [url fileSystemRepresentation];
        if (path != NULL && goban_callback != NULL) goban_callback(goban_callback_context, path);
    }
}
@end

void goban_install_open_handler(void *context, GobanOpenCallback callback) {
    goban_callback = callback;
    goban_callback_context = context;
    static GobanOpenHandler *handler = nil;
    if (handler == nil) handler = [[GobanOpenHandler alloc] init];
    NSAppleEventManager *manager = [NSAppleEventManager sharedAppleEventManager];
    [manager setEventHandler:handler
                 andSelector:@selector(handleOpenDocuments:withReplyEvent:)
               forEventClass:kCoreEventClass
                  andEventID:kAEOpenDocuments];
}
