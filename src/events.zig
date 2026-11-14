//! Platform events: lifecycle, timers (which collect the KataGo, update,
//! install, quit-gate and inbox results), menu and shortcut commands, and
//! files the OS opens with the app.
const std = @import("std");
const native_sdk = @import("native_sdk");
const json = @import("json.zig");
const bridge_katago = @import("bridge_katago.zig");
const bridge_update = @import("bridge_update.zig");
const lifecycle = @import("lifecycle.zig");
const shell = @import("shell.zig");
const App = shell.App;

/// OS "open with" / document-open events. The page subscribes to the
/// window event "open:files" and imports the first .sgf path. The event may
/// arrive before the page has subscribed; that is a platform limitation, not
/// a reason to keep a second copy of the file in native state.
const OPEN_FILE_VARIANTS = [_][]const u8{ "open_files", "open_file", "open_urls", "open_documents" };

fn forwardOpenFiles(self: *App, runtime: *native_sdk.Runtime, event: native_sdk.Event) void {
    inline for (OPEN_FILE_VARIANTS) |variant| {
        if (comptime @hasField(native_sdk.Event, variant)) {
            if (event == @field(std.meta.Tag(native_sdk.Event), variant)) {
                emitOpenFiles(self, runtime, @field(event, variant));
            }
        }
    }
}

fn openFilePathOf(item: anytype) ?[]const u8 {
    const T = @TypeOf(item);
    if (comptime @typeInfo(T) == .pointer) {
        const value: []const u8 = item;
        return value;
    }
    if (comptime @typeInfo(T) == .@"struct" and @hasField(T, "path")) {
        const value: []const u8 = item.path;
        return value;
    }
    return null;
}

fn emitOpenFiles(self: *App, runtime: *native_sdk.Runtime, payload: anytype) void {
    const P = @TypeOf(payload);
    var detail_buf: [8192]u8 = undefined;
    var n: usize = 0;
    if (!json.append(&detail_buf, &n, "{\"paths\":[")) return;
    var count: usize = 0;
    if (comptime @typeInfo(P) == .pointer) {
        for (payload) |item| {
            if (openFilePathOf(item)) |path| {
                if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
            }
        }
    } else if (comptime @typeInfo(P) == .@"struct") {
        if (comptime @hasField(P, "paths")) {
            for (payload.paths) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "files")) {
            for (payload.files) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "path")) {
            if (openFilePathOf(payload.path)) |path| {
                if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
            }
        } else return;
    } else return;
    if (count == 0) return;
    if (!json.append(&detail_buf, &n, "]}")) return;
    runtime.emitWindowEvent(1, "open:files", detail_buf[0..n]) catch {};
}

/// One opened document into the event detail (and the page may read it).
/// A path that cannot be sent (empty, too long, not UTF-8) is skipped,
/// never the whole event.
pub fn appendOpenPath(self: *App, buf: []u8, n: *usize, count: *usize, path: []const u8) bool {
    if (path.len == 0 or path.len > 4096 or !std.unicode.utf8ValidateSlice(path)) return true;
    const mark = n.*;
    if (count.* > 0 and !json.append(buf, n, ",")) return false;
    if (!json.appendString(buf, n, path)) {
        n.* = mark;
        return false;
    }
    _ = self.grants.grant(path, .read, false);
    count.* += 1;
    return true;
}

pub fn onEvent(context: *anyopaque, runtime: *native_sdk.Runtime, event: native_sdk.Event) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    self.runtime = runtime;
    lifecycle.startInboxTimer(self);
    forwardOpenFiles(self, runtime, event);
    switch (event) {
        .command => |cmd| forwardCommand(runtime, cmd.name, cmd.window_id),
        // Dropped on the window: the user chose these, the page may read
        // them (the runtime emits `drop:files` to the page right after).
        .files_dropped => |drop| {
            for (drop.paths) |path| _ = self.grants.grant(path, .read, false);
        },
        // A KataGo worker result or partial report is waiting (the worker
        // nudged the loop through PlatformServices.wake), or the fallback
        // collection timer fired.
        .effects_wake => {
            bridge_katago.drainKatago(self);
            bridge_update.drainUpdate(self);
            bridge_update.drainInstall(self);
        },
        .timer => |timer| {
            if (timer.id == shell.katago_timer_id) bridge_katago.drainKatago(self);
            if (timer.id == shell.update_timer_id) bridge_update.drainUpdate(self);
            if (timer.id == shell.install_timer_id) bridge_update.drainInstall(self);
            if (timer.id == shell.gate_timer_id) lifecycle.runGate(self);
            if (timer.id == shell.inbox_timer_id) lifecycle.pollInbox(self);
        },
        else => {},
    }
}

/// Native menu picks reach the page as `menu:command` ({command, windowId});
/// the same pick also goes out as a `shortcut` event ({id, command, key,
/// windowId, modifiers}), for listeners that still use that name.
fn forwardCommand(runtime: *native_sdk.Runtime, name: []const u8, window_id: u64) void {
    const wid: native_sdk.WindowId = if (window_id == 0) 1 else window_id;
    var buf: [512]u8 = undefined;
    var n: usize = 0;
    if (!json.append(&buf, &n, "{\"command\":")) return;
    if (!json.appendString(&buf, &n, name)) return;
    const tail = std.fmt.bufPrint(buf[n..], ",\"windowId\":{d}}}", .{wid}) catch return;
    n += tail.len;
    runtime.emitWindowEvent(wid, "menu:command", buf[0..n]) catch {};

    var legacy: [640]u8 = undefined;
    var m: usize = 0;
    if (!json.append(&legacy, &m, "{\"id\":")) return;
    if (!json.appendString(&legacy, &m, name)) return;
    if (!json.append(&legacy, &m, ",\"command\":")) return;
    if (!json.appendString(&legacy, &m, name)) return;
    const rest = std.fmt.bufPrint(legacy[m..], ",\"key\":\"\",\"windowId\":{d},\"modifiers\":{{\"primary\":false,\"command\":false,\"control\":false,\"option\":false,\"shift\":false}}}}", .{wid}) catch return;
    m += rest.len;
    runtime.emitWindowEvent(wid, "shortcut", legacy[0..m]) catch {};
}
