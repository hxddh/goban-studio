//! Where the app keeps what it writes, and the one place its id is spelled.
//!
//!   macOS    ~/Library/Application Support/dev.hxddh.gobanstudio/
//!   Windows  %LOCALAPPDATA%\dev.hxddh.gobanstudio\Data\
//!
//! (the Native SDK's `app_dirs` `.data` directory for `bundle_id`). Inside:
//!
//!   data/      settings, profile, games (store.zig), the instance lock and
//!              the inbox of a second launch (instance.zig)
//!   models/    the optional KataGo networks (models.zig)
//!
//! Nothing here is inside the installed app, so replacing or deleting the
//! app keeps it. docs/storage.md and the packaged READMEs name the same
//! paths; scripts/tests/shell-files.mjs keeps them in step.

const std = @import("std");
const native_sdk = @import("native_sdk");

/// The app's bundle id (app.zon `.id`, Info.plist CFBundleIdentifier) and
/// the name of its folder under the user's application data.
pub const bundle_id = "dev.hxddh.gobanstudio";

/// An absolute directory named by `key` in the environment (tests, the
/// release self-test, development), copied into `out`.
fn override(env_map: *const std.process.Environ.Map, key: []const u8, out: []u8) ?[]const u8 {
    const dir = env_map.get(key) orelse return null;
    if (dir.len == 0 or dir.len > out.len or !std.fs.path.isAbsolute(dir)) return null;
    @memcpy(out[0..dir.len], dir);
    return out[0..dir.len];
}

/// The app's folder under the user's application data, or "" when the
/// environment does not say where that is.
pub fn appDataDir(env_map: *std.process.Environ.Map, out: []u8) []const u8 {
    return native_sdk.app_dirs.resolveOne(
        .{ .name = bundle_id },
        native_sdk.app_dirs.currentPlatform(),
        native_sdk.debug.envFromMap(env_map),
        .data,
        out,
    ) catch "";
}

fn child(env_map: *std.process.Environ.Map, name: []const u8, out: []u8) []const u8 {
    var data_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data = appDataDir(env_map, &data_buf);
    if (data.len == 0) return "";
    return std.fmt.bufPrint(out, "{s}{c}{s}", .{ data, std.fs.path.sep, name }) catch "";
}

/// `<app data>/data`, or GOBAN_DATA_DIR.
pub fn dataDir(env_map: *std.process.Environ.Map, out: []u8) []const u8 {
    return override(env_map, "GOBAN_DATA_DIR", out) orelse child(env_map, "data", out);
}

/// `<app data>/models`, or GOBAN_MODELS_DIR.
pub fn modelsDir(env_map: *std.process.Environ.Map, out: []u8) []const u8 {
    return override(env_map, "GOBAN_MODELS_DIR", out) orelse child(env_map, "models", out);
}

test "the data and models directories sit side by side under the app's folder" {
    var env = std.process.Environ.Map.init(std.testing.allocator);
    defer env.deinit();
    var a: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var b: [std.Io.Dir.max_path_bytes]u8 = undefined;
    // Nothing known about the user: no directory, never a relative one.
    try std.testing.expectEqualStrings("", dataDir(&env, &a));
    try std.testing.expectEqualStrings("", modelsDir(&env, &a));

    try env.put("HOME", "/Users/a");
    try env.put("LOCALAPPDATA", "C:\\Users\\a\\AppData\\Local");
    const root = appDataDir(&env, &a);
    switch (native_sdk.app_dirs.currentPlatform()) {
        .macos => try std.testing.expectEqualStrings("/Users/a/Library/Application Support/" ++ bundle_id, root),
        .windows => try std.testing.expectEqualStrings("C:\\Users\\a\\AppData\\Local\\" ++ bundle_id ++ "\\Data", root),
        .linux => try std.testing.expectEqualStrings("/Users/a/.local/share/" ++ bundle_id, root),
        else => {},
    }
    const data = dataDir(&env, &b);
    try std.testing.expect(std.mem.startsWith(u8, data, root));
    try std.testing.expect(std.mem.endsWith(u8, data, std.fs.path.sep_str ++ "data"));
    try std.testing.expect(std.mem.endsWith(u8, modelsDir(&env, &b), std.fs.path.sep_str ++ "models"));

    // The overrides must be absolute.
    const abs = if (@import("builtin").os.tag == .windows) "C:\\tmp\\goban-data" else "/tmp/goban-data";
    try env.put("GOBAN_DATA_DIR", abs);
    try std.testing.expectEqualStrings(abs, dataDir(&env, &b));
    try env.put("GOBAN_DATA_DIR", "relative/dir");
    try std.testing.expect(std.mem.startsWith(u8, dataDir(&env, &b), root));
    try env.put("GOBAN_MODELS_DIR", abs);
    try std.testing.expectEqualStrings(abs, modelsDir(&env, &b));
}

test "the SDK resolves the documented folders on macOS and Windows" {
    // What docs/storage.md and the packaged READMEs tell the user.
    const dirs = native_sdk.app_dirs;
    var buf: [256]u8 = undefined;
    try std.testing.expectEqualStrings(
        "/Users/a/Library/Application Support/dev.hxddh.gobanstudio",
        try dirs.resolveOne(.{ .name = bundle_id }, .macos, .{ .home = "/Users/a" }, .data, &buf),
    );
    try std.testing.expectEqualStrings(
        "C:\\Users\\a\\AppData\\Local\\dev.hxddh.gobanstudio\\Data",
        try dirs.resolveOne(.{ .name = bundle_id }, .windows, .{ .local_app_data = "C:\\Users\\a\\AppData\\Local" }, .data, &buf),
    );
}
