//! Every bridge command in one place: the registry and the policy
//! (which origins may call it) are both built from these two tables.
const std = @import("std");
const native_sdk = @import("native_sdk");
const app_options = @import("app_options");
const bridge_files = @import("bridge_files.zig");
const bridge_katago = @import("bridge_katago.zig");
const bridge_models = @import("bridge_models.zig");
const bridge_update = @import("bridge_update.zig");
const bridge_window = @import("bridge_window.zig");
const lifecycle = @import("lifecycle.zig");

/// The Vite dev server's origin. Only development builds let it call the
/// bridge (`-Ddev-origin`, default: on in Debug, off in every release
/// mode): in a released app any local process listening on that port
/// could otherwise serve a page with the app's file and update commands.
const dev_server_origin = "http://127.0.0.1:5173";
pub const allowed_origins = if (app_options.dev_origin)
    [_][]const u8{ "zero://app", "zero://inline", dev_server_origin }
else
    [_][]const u8{ "zero://app", "zero://inline" };

const SyncCommand = struct { name: []const u8, invoke: native_sdk.bridge.HandlerFn };
const AsyncCommand = struct { name: []const u8, invoke: native_sdk.bridge.AsyncHandlerFn };

/// Every bridge command in one place: the registry and the policy
/// (which origins may call it) are both built from these two tables, so a
/// command can never be registered without its policy, or the other way
/// round, and adding one is a one-line change.
pub const sync_commands = [_]SyncCommand{
    // The user's own files, only those native code handed out (files.zig).
    .{ .name = "studio.openFileDialog", .invoke = bridge_files.openFileDialog },
    .{ .name = "studio.saveFileDialog", .invoke = bridge_files.saveFileDialog },
    .{ .name = "studio.writeTextFile", .invoke = bridge_files.writeTextFile },
    .{ .name = "studio.readTextFile", .invoke = bridge_files.readTextFile },
    .{ .name = "studio.takeOpenFiles", .invoke = bridge_files.takeOpenFiles },
    .{ .name = "studio.revealDataDir", .invoke = bridge_files.revealDataDir },
    // Window chrome and menus.
    .{ .name = "studio.windowDrag", .invoke = bridge_window.windowDrag },
    .{ .name = "studio.windowChrome", .invoke = bridge_window.windowChrome },
    .{ .name = "studio.windowTheme", .invoke = bridge_window.windowTheme },
    .{ .name = "studio.setMenus", .invoke = bridge_window.setMenus },
    // The quit gate (lifecycle.zig).
    .{ .name = "studio.flushHook", .invoke = lifecycle.flushHook },
    .{ .name = "studio.flushDone", .invoke = lifecycle.flushDone },
    // KataGo (searches are async, below).
    .{ .name = "studio.katagoStatus", .invoke = bridge_katago.katagoStatus },
    .{ .name = "studio.katagoCancel", .invoke = bridge_katago.katagoCancel },
    // Release self-test and screenshot tour.
    .{ .name = "studio.selftest", .invoke = bridge_files.selftestConfig },
    // Updates.
    .{ .name = "studio.openReleasePage", .invoke = bridge_update.openReleasePage },
    .{ .name = "studio.updateStatus", .invoke = bridge_update.updateStatus },
    .{ .name = "studio.updateCancel", .invoke = bridge_update.updateCancel },
    // Optional networks.
    .{ .name = "studio.modelStatus", .invoke = bridge_models.modelStatus },
    .{ .name = "studio.modelDownload", .invoke = bridge_models.modelDownload },
    .{ .name = "studio.modelCancel", .invoke = bridge_models.modelCancel },
    .{ .name = "studio.modelRemove", .invoke = bridge_models.modelRemove },
    // File storage (store.zig).
    .{ .name = "studio.storeRead", .invoke = bridge_files.storeRead },
    .{ .name = "studio.storeWrite", .invoke = bridge_files.storeWrite },
    .{ .name = "studio.storeList", .invoke = bridge_files.storeList },
    .{ .name = "studio.storeRemove", .invoke = bridge_files.storeRemove },
};

pub const async_commands = [_]AsyncCommand{
    .{ .name = "studio.katagoAnalyzeAsync", .invoke = bridge_katago.katagoAnalyzeAsync },
    .{ .name = "studio.katagoHumanPolicy", .invoke = bridge_katago.katagoHumanPolicy },
    .{ .name = "studio.checkUpdate", .invoke = bridge_update.checkUpdate },
    .{ .name = "studio.updateDownload", .invoke = bridge_update.updateDownload },
    .{ .name = "studio.updateApply", .invoke = bridge_update.updateApply },
};

test "every bridge command is registered once, with the same origins" {
    inline for (sync_commands ++ .{}) |c| try std.testing.expect(std.mem.startsWith(u8, c.name, "studio."));
    var names: [sync_commands.len + async_commands.len][]const u8 = undefined;
    for (sync_commands, 0..) |c, i| names[i] = c.name;
    for (async_commands, 0..) |c, i| names[sync_commands.len + i] = c.name;
    for (names, 0..) |a, i| {
        for (names[i + 1 ..]) |b| try std.testing.expect(!std.mem.eql(u8, a, b));
    }
    // The data folder can be shown; the command takes no path from the page.
    var has_reveal = false;
    for (names) |n| has_reveal = has_reveal or std.mem.eql(u8, n, "studio.revealDataDir");
    try std.testing.expect(has_reveal);
    // No synchronous KataGo command: a search never blocks the UI thread.
    for (names) |n| {
        try std.testing.expect(!std.mem.eql(u8, n, "studio.katagoMove"));
        try std.testing.expect(!std.mem.eql(u8, n, "studio.katagoAnalyze"));
    }
    // The dev server origin only in development builds.
    var has_dev = false;
    for (allowed_origins) |o| has_dev = has_dev or std.mem.eql(u8, o, dev_server_origin);
    try std.testing.expectEqual(app_options.dev_origin, has_dev);
}
