//! One instance per data directory (instance.zig) and the quit gate:
//! the page's flush before a quit or window close, and the wait for the
//! update helper.
const std = @import("std");
const builtin = @import("builtin");
const native_sdk = @import("native_sdk");
const install_apply = @import("install_apply.zig");
const win_close = @import("win_close.zig");
const json = @import("json.zig");
const instance_mod = @import("instance.zig");
const bridge_update = @import("bridge_update.zig");
const events = @import("events.zig");
const shell = @import("shell.zig");
const App = shell.App;

// ------------------------------------------------------------ one instance
//
// instance.zig: this process holds the data directory's lock. A second
// launch leaves a request in the inbox (the .sgf files it was given, or
// none: "come to the front") and waits for it to be taken; a timer here
// takes it.

pub fn startInboxTimer(self: *App) void {
    if (self.inbox_timer_running or self.instance_lock == null) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.startTimer(shell.inbox_timer_id, shell.inbox_timer_interval_ns, true) catch return;
    self.inbox_timer_running = true;
}

const InboxBatch = struct {
    app: *App,
    buf: [8192]u8 = undefined,
    n: usize = 0,
    count: usize = 0,
    ok: bool = true,

    fn add(context: *anyopaque, path: []const u8) void {
        const batch: *InboxBatch = @ptrCast(@alignCast(context));
        const self = batch.app;
        // The page is not up yet: it asks for the queue when it is.
        if (!self.flush_hook_ready) return self.queueOpenPath(path);
        if (!batch.ok) return;
        if (batch.n == 0) batch.ok = json.append(&batch.buf, &batch.n, "{\"paths\":[");
        if (batch.ok) batch.ok = events.appendOpenPath(self, &batch.buf, &batch.n, &batch.count, path);
    }
};

pub fn pollInbox(self: *App) void {
    // On its way out: the other launch sees its request untouched and the
    // lock come free, and starts as the one instance.
    if (self.quitting or self.instance_lock == null) return;
    var batch: InboxBatch = .{ .app = self };
    const taken = instance_mod.takeRequests(self.io, self.store.root(), &batch, InboxBatch.add);
    if (taken.requests == 0) return;
    const runtime = self.runtime orelse return;
    // Someone opened the app again: show them the window that exists.
    runtime.options.platform.services.focusWindow(1) catch {};
    if (batch.count == 0 or !batch.ok) return;
    if (!json.append(&batch.buf, &batch.n, "]}")) return;
    runtime.emitWindowEvent(1, "open:files", batch.buf[0..batch.n]) catch {};
}

/// Make this process the one that uses `data_dir`, or hand its arguments
/// to the one that does. False: this launch has nothing more to do.
pub fn claimInstance(app_state: *App, init: std.process.Init, data_dir: []const u8) bool {
    const io = init.io;
    var note: install_apply.LaunchNote = .{};
    var paths: instance_mod.PathList = .{};
    var it: ?std.process.Args.Iterator = std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa) catch null;
    defer if (it) |*args| args.deinit();
    if (it) |*args| {
        _ = args.next(); // executable
        while (args.next()) |arg| {
            note.noteArg(arg);
            if (paths.len < paths.items.len and instance_mod.wantedPath(arg)) {
                paths.items[paths.len] = arg;
                paths.len += 1;
            }
        }
    }
    // An update helper is replacing this installation. It starts the app
    // itself when it is done (with one of its two arguments); any other
    // launch in between would hold files of the folder being swapped.
    const by_helper = note.just_updated or note.install_failed;
    if (!by_helper and install_apply.ownUpdateInProgress(io)) {
        std.debug.print("goban-studio: an update is being installed; this launch does nothing\n", .{});
        return false;
    }
    switch (instance_mod.acquire(io, data_dir)) {
        .owner => |file| {
            app_state.instance_lock = file;
            return true;
        },
        // No lock to be had (no data directory): run as before.
        .unavailable => return true,
        .busy => {},
    }
    var token_bytes: [8]u8 = undefined;
    io.random(&token_bytes);
    const token = std.fmt.bytesToHex(token_bytes, .lower);
    const result = instance_mod.handOver(io, data_dir, paths.slice(), &token);
    if (result.outcome == .became_owner) {
        app_state.instance_lock = result.lock;
        return true;
    }
    // The new version did start; the helper that launched it must not
    // take a second window for a failed update and roll back.
    install_apply.writeAck(io, &note);
    std.debug.print("goban-studio: already running; this launch {s}\n", .{
        if (result.outcome == .taken) "handed over to it" else "got no answer and does nothing",
    });
    return false;
}

// ------------------------------------------------------------ quit gate
//
// Two waits that must end before the app goes away, both run by one
// 100 ms timer on the UI thread:
//
//   * the update helper's "started" marker (`studio.updateApply`): the app
//     quits only once a helper is really there to finish the update;
//   * the page's flush: before a quit (⌘Q / the Dock on macOS, the
//     window's close button on Windows, an update restart) the page gets
//     an `app:flush` event and up to `flush_timeout_ms` to write what it
//     still holds (store.js debounces writes by 300 ms) and answer with
//     `studio.flushDone`. A page that never installed the hook, or does
//     not answer in time, does not keep the app open.

pub fn startGateTimer(self: *App) void {
    if (self.gate_timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.startTimer(shell.gate_timer_id, shell.gate_timer_interval_ns, true) catch return;
    self.gate_timer_running = true;
}

fn stopGateTimer(self: *App) void {
    if (!self.gate_timer_running or self.flush_active or self.apply_active) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(shell.gate_timer_id) catch {};
    self.gate_timer_running = false;
}

pub fn runGate(self: *App) void {
    const now = bridge_update.nowMs(self);
    if (self.apply_active) checkHelperStarted(self, now);
    if (self.flush_active and now >= self.flush_deadline_ms) finishFlush(self);
    stopGateTimer(self);
}

/// The update helper proved it runs (or did not, in time).
fn checkHelperStarted(self: *App, now: i64) void {
    const marker = self.apply_started_buf[0..self.apply_started_len];
    const id = self.apply_bridge_id[0..self.apply_bridge_id_len];
    var started = install_apply.helperStarted(self.io, marker);
    if (!started and now >= self.apply_deadline_ms) {
        // Claim the marker: if the helper got there first after all, it
        // did start; otherwise a late helper finds it taken and gives up.
        started = !install_apply.claimStarted(self.io, marker);
        if (!started) {
            self.apply_active = false;
            self.installer.markApplyFailed("HelperNotStarted");
            self.apply_responder.success(id, "{\"ok\":false,\"error\":\"HelperNotStarted\"}") catch {};
            return;
        }
    }
    if (!started) return;
    self.apply_active = false;
    self.apply_responder.success(id, "{\"ok\":true,\"phase\":\"installing\"}") catch {};
    // The helper waits for this process to exit (KataGo stops on the way);
    // the page writes what it holds first.
    beginFlush(self, .quit_app);
}

/// Ask the page to flush, then do `then`. Without a page hook (or before
/// the page is up) `then` happens at once.
fn beginFlush(self: *App, then: shell.AfterFlush) void {
    if (self.flush_active) {
        // A second request while one is open (⌘Q twice): the stronger
        // action wins; the open flush still ends it.
        if (then == .quit_app) self.after_flush = .quit_app;
        return;
    }
    self.after_flush = then;
    if (then != .none) self.quitting = true;
    const runtime = self.runtime orelse return finishFlush(self);
    if (!self.flush_hook_ready) return finishFlush(self);
    self.flush_id += 1;
    var buf: [64]u8 = undefined;
    const detail = std.fmt.bufPrint(&buf, "{{\"id\":{d}}}", .{self.flush_id}) catch return finishFlush(self);
    runtime.emitWindowEvent(1, "app:flush", detail) catch return finishFlush(self);
    self.flush_active = true;
    self.flush_deadline_ms = bridge_update.nowMs(self) + shell.flush_timeout_ms;
    startGateTimer(self);
}

fn finishFlush(self: *App) void {
    self.flush_active = false;
    const then = self.after_flush;
    self.after_flush = .none;
    switch (then) {
        .none => {},
        .reply_terminate => if (comptime builtin.os.tag == .macos) shell.goban_reply_quit(),
        .close_window => win_close.proceed(),
        .quit_app => {
            const runtime = self.runtime orelse return;
            runtime.quitApp() catch {
                // The helper keeps waiting; quitting by hand still
                // finishes the update.
                self.installer.markApplyFailed("QuitFailed");
            };
        },
    }
}

/// `studio.flushHook` {}: the page has a flush hook (store.js); from now on
/// a quit asks it first. Also installs the Windows close interception,
/// now that the window certainly exists. → `{ok}`.
pub fn flushHook(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    self.flush_hook_ready = true;
    if (!self.win_close_installed) self.win_close_installed = win_close.install(self, onWindowClose);
    return std.fmt.bufPrint(output, "{{\"ok\":true}}", .{}) catch error.HandlerFailed;
}

/// `studio.flushDone` {id}: the page wrote everything for flush `id`.
pub fn flushDone(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const FlushPayload = struct { id: u64 = 0 };
    const parsed = std.json.parseFromSlice(FlushPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const current = self.flush_active and parsed.value.id == self.flush_id;
    if (current) {
        finishFlush(self);
        stopGateTimer(self);
    }
    return std.fmt.bufPrint(output, "{{\"ok\":{s}}}", .{if (current) "true" else "false"}) catch error.HandlerFailed;
}

/// Windows: the user closed the window (close button, Alt+F4). True keeps
/// it open for now; `win_close.proceed` closes it once the page flushed.
fn onWindowClose(context: *anyopaque) bool {
    const self: *App = @ptrCast(@alignCast(context));
    if (!self.flush_hook_ready or self.runtime == null) return false;
    // Either the flush is open, or it ended at once and `proceed` already
    // queued the real close: this close is swallowed in both cases.
    beginFlush(self, .close_window);
    return true;
}

/// macOS: the app was asked to quit. 1 delays it until `goban_reply_quit`.
pub fn macQuitCallback(context: ?*anyopaque) callconv(.c) c_int {
    const self: *App = @ptrCast(@alignCast(context orelse return 0));
    if (!self.flush_hook_ready or self.runtime == null) return 0;
    // macos_open.m spins the run loop until goban_reply_quit (or its
    // backstop); a flush that ends right here simply ends the hold at once.
    beginFlush(self, .reply_terminate);
    return 1;
}
