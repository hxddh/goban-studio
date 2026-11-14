//! Bridge commands for the player's files: the two user-file commands and
//! their dialogs (files.zig grants), the data folder, the v9 store
//! (store.zig), the queue of files the OS opened, and the release
//! self-test and screenshot tour (the report files they may write).
const std = @import("std");
const builtin = @import("builtin");
const native_sdk = @import("native_sdk");
const install_mod = @import("install.zig");
const store_mod = @import("store.zig");
const files_mod = @import("files.zig");
const json = @import("json.zig");
const shell = @import("shell.zig");
const App = shell.App;

/// The payload of the two user-file commands.
const FilePayload = struct {
    path: []const u8 = "",
    b64: []const u8 = "",
    offset: u64 = 0,
    done: bool = true,
};

/// `studio.writeTextFile {path, b64, offset?, done?}` → true. Without
/// `offset` and `done` it is one write of at most `store.chunk_bytes`
/// (written beside, then renamed over); a larger file is sent as chunks from
/// offset 0 in order, the last with `done: true` (as `studio.storeWrite`).
/// v13: only a path a save dialog returned (or the self-test's report
/// files) — `AccessDenied` for anything else (files.zig).
pub fn writeTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(FilePayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const v = parsed.value;
    if (v.path.len == 0 or v.path.len > 4096) return error.InvalidRequest;
    if (!self.grants.allows(v.path, .write)) return error.AccessDenied;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(v.b64) catch return error.InvalidRequest;
    if (n > store_mod.chunk_bytes) return error.TooLarge;
    const bytes = try self.allocator.alloc(u8, n);
    defer self.allocator.free(bytes);
    dec.decode(bytes, v.b64) catch return error.InvalidRequest;
    store_mod.writePath(self.io, v.path, bytes, v.offset, v.done) catch return error.HandlerFailed;
    return "true";
}

/// `studio.readTextFile {path, offset?}` → `{size, b64}`: the file's size
/// and up to `store.chunk_bytes` of it from `offset`, as base64. A larger
/// file is read in several calls (as `studio.storeRead`). v13: only a path
/// an open dialog returned, a document the OS opened with the app, a file
/// dropped on the window, or the tour's acknowledgement file.
pub fn readTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(FilePayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const v = parsed.value;
    if (v.path.len == 0 or v.path.len > 4096) return error.InvalidRequest;
    if (!self.grants.allows(v.path, .read)) return error.AccessDenied;
    const raw = try self.allocator.alloc(u8, store_mod.chunk_bytes);
    defer self.allocator.free(raw);
    const chunk = store_mod.readPath(self.io, v.path, v.offset, raw) catch return error.HandlerFailed;
    const enc = std.base64.standard.Encoder;
    const b64_len = enc.calcSize(chunk.bytes.len);
    const head = std.fmt.bufPrint(output, "{{\"size\":{d},\"b64\":\"", .{chunk.size}) catch return error.TooLarge;
    if (head.len + b64_len + 2 > output.len) return error.TooLarge;
    _ = enc.encode(output[head.len..][0..b64_len], chunk.bytes);
    @memcpy(output[head.len + b64_len ..][0..2], "\"}");
    return output[0 .. head.len + b64_len + 2];
}

const DialogPayload = struct {
    title: []const u8 = "",
    defaultName: []const u8 = "",
    defaultPath: []const u8 = "",
    allowMultiple: bool = false,
};

/// `studio.openFileDialog {title?, defaultPath?, allowMultiple?}` → the
/// chosen paths (an array) or null when cancelled. v13: the page's way to
/// let the user pick a file to import (an SGF, a backup); every path it
/// returns may then be read through `studio.readTextFile` if it is one of
/// the app's file types (files.zig); any other pick is returned but stays
/// unreadable, so the page reports a failed import.
pub fn openFileDialog(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    const parsed = std.json.parseFromSlice(DialogPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    const buffer = try self.allocator.alloc(u8, native_sdk.platform.max_dialog_paths_bytes);
    defer self.allocator.free(buffer);
    const result = try runtime.showOpenDialog(.{
        .title = p.title,
        .default_path = p.defaultPath,
        .allow_multiple = p.allowMultiple,
    }, buffer);
    if (result.count == 0) return "null";
    var n: usize = 0;
    if (!json.append(output, &n, "[")) return error.HandlerFailed;
    var count: usize = 0;
    var it = std.mem.splitScalar(u8, result.paths, '\n');
    while (it.next()) |path| {
        if (path.len == 0 or !std.unicode.utf8ValidateSlice(path)) continue;
        // A file the app does not read (a .txt, say) is still returned, so
        // the page can say it could not import it; it is just not granted.
        _ = self.grants.grant(path, .read, false);
        const mark = n;
        if (count > 0 and !json.append(output, &n, ",")) break;
        if (!json.appendString(output, &n, path)) {
            n = mark;
            break;
        }
        count += 1;
    }
    if (count == 0) return "null";
    if (!json.append(output, &n, "]")) return error.HandlerFailed;
    return output[0..n];
}

/// `studio.saveFileDialog {title?, defaultName, defaultPath?}` → the chosen
/// path, or null when cancelled. `defaultName` must end in one of the app's
/// extensions (.sgf, .json, .png); if the user types a name without one,
/// that extension is added, and if a file of that full name already exists
/// the path gets a number instead of replacing it ("game (2).sgf"): the
/// page should show the path it got back. The path may then be written through
/// `studio.writeTextFile` (files.zig). A name the app will not write (a
/// dotfile, a device name) answers `InvalidPath`.
pub fn saveFileDialog(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    const parsed = std.json.parseFromSlice(DialogPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    const ext = files_mod.allowedExtension(p.defaultName) orelse return error.InvalidRequest;
    var buffer: [native_sdk.platform.max_dialog_path_bytes]u8 = undefined;
    const chosen = (try runtime.showSaveDialog(.{
        .title = p.title,
        .default_path = p.defaultPath,
        .default_name = p.defaultName,
    }, &buffer)) orelse return "null";
    var fixed_buf: [files_mod.max_path_bytes + 8]u8 = undefined;
    var path = files_mod.fixSavePath(chosen, ext, &fixed_buf) orelse return error.InvalidPath;
    // The dialog asked about replacing the name the user typed. When the
    // extension was added here, the file that will really be written was
    // never asked about: an existing one is kept, and this one gets the
    // next free name ("game (2).sgf").
    var free_buf: [files_mod.max_path_bytes + 16]u8 = undefined;
    if (path.len != chosen.len) path = files_mod.freeSavePath(self.io, path, &free_buf) orelse return error.InvalidPath;
    if (!std.unicode.utf8ValidateSlice(path)) return error.InvalidPath;
    if (!self.grants.grant(path, .write, false)) return error.InvalidPath;
    var n: usize = 0;
    if (!json.appendString(output, &n, path)) return error.HandlerFailed;
    return output[0..n];
}

/// `studio.revealDataDir` {}: show the folder that holds the player's
/// settings, progress and games in Finder / Explorer (paths.zig). The page
/// never names a path: it is always the app's own data directory. Replies
/// `{ok, path}` or `{ok:false, error:"NoDataDir"}`.
pub fn revealDataDir(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    const dir = self.store.root();
    if (dir.len == 0 or !std.fs.path.isAbsolute(dir)) return "{\"ok\":false,\"error\":\"NoDataDir\"}";
    // Nothing was saved yet: the folder is made so there is one to show.
    std.Io.Dir.cwd().createDirPath(self.io, dir) catch {};
    var opened = false;
    if (self.runtime) |runtime| {
        if (runtime.options.platform.services.revealPath(dir)) |_| {
            opened = true;
        } else |_| {}
    }
    if (!opened) opened = spawnFolder(self.io, dir);
    var n: usize = 0;
    const ok = json.append(output, &n, "{\"ok\":") and json.appendBool(output, &n, opened) and
        json.append(output, &n, ",\"path\":") and json.appendString(output, &n, dir) and json.append(output, &n, "}");
    if (!ok) return error.HandlerFailed;
    return output[0..n];
}

/// Fallback when the platform's reveal service is missing or fails: open
/// the folder itself with `open` (macOS), Explorer (Windows) or `xdg-open`.
fn spawnFolder(io: std.Io, dir: []const u8) bool {
    const argv: []const []const u8 = switch (builtin.os.tag) {
        .macos => &.{ "/usr/bin/open", dir },
        .windows => &.{ "explorer.exe", dir },
        else => &.{ "xdg-open", dir },
    };
    var child = std.process.spawn(io, .{
        .argv = argv,
        .stdin = .ignore,
        .stdout = .ignore,
        .stderr = .ignore,
        .create_no_window = true,
    }) catch return false;
    _ = child.wait(io) catch {};
    return true;
}

// ------------------------------------------------------- v9 file storage

/// The payload of the four store commands (each reads the fields it needs).
const StorePayload = struct {
    key: []const u8 = "",
    prefix: []const u8 = "",
    b64: []const u8 = "",
    offset: u64 = 0,
    done: bool = true,
};

fn parseStorePayload(self: *App, payload: []const u8) !std.json.Parsed(StorePayload) {
    return std.json.parseFromSlice(StorePayload, self.allocator, payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
}

/// `studio.storeRead {key, offset?}` → null when the file does not exist,
/// else `{size, b64}`: the file's size and up to `store.chunk_bytes` of it
/// from `offset`, as base64. A larger file is read in several calls.
pub fn storeRead(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    const raw = try self.allocator.alloc(u8, store_mod.chunk_bytes);
    defer self.allocator.free(raw);
    const chunk = (try self.store.read(parsed.value.key, parsed.value.offset, raw)) orelse return "null";
    const enc = std.base64.standard.Encoder;
    const b64_len = enc.calcSize(chunk.bytes.len);
    const head = std.fmt.bufPrint(output, "{{\"size\":{d},\"b64\":\"", .{chunk.size}) catch return error.TooLarge;
    if (head.len + b64_len + 2 > output.len) return error.TooLarge;
    _ = enc.encode(output[head.len..][0..b64_len], chunk.bytes);
    @memcpy(output[head.len + b64_len ..][0..2], "\"}");
    return output[0 .. head.len + b64_len + 2];
}

/// `studio.storeWrite {key, b64, offset?, done?}` → true. Without `offset`
/// and `done` it is one atomic write (temporary file, then rename). A file
/// larger than one chunk is sent as chunks from offset 0 in order, the last
/// with `done: true`; the target changes only then.
pub fn storeWrite(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    const v = parsed.value;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(v.b64) catch return error.InvalidRequest;
    if (n > store_mod.chunk_bytes) return error.TooLarge;
    const bytes = try self.allocator.alloc(u8, n);
    defer self.allocator.free(bytes);
    dec.decode(bytes, v.b64) catch return error.InvalidRequest;
    try self.store.write(v.key, bytes, v.offset, v.done);
    return "true";
}

/// `studio.storeList {prefix}` → the keys under `prefix` ("" for all,
/// "games/" for the games), as a JSON array.
pub fn storeList(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    return self.store.listJson(parsed.value.prefix, output);
}

/// `studio.storeRemove {key}` → true (also when there was nothing to remove).
pub fn storeRemove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    try self.store.remove(parsed.value.key);
    return "true";
}

/// The page polls this once after boot (and while running) instead of relying
/// on an event that may fire before the webview exists. The queue is consumed
/// on read; a path never opens twice. v13: the queue is cleared whatever
/// happens, and a path that cannot be sent (not UTF-8, or past the reply's
/// room) is dropped alone instead of failing every later call.
pub fn takeOpenFiles(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    defer {
        for (self.open_paths.items) |path| self.allocator.free(path);
        self.open_paths.clearRetainingCapacity();
    }
    return openPathsJson(self.open_paths.items, output) orelse error.HandlerFailed;
}

/// `{"paths":[…]}` with every path that is valid UTF-8 and fits.
fn openPathsJson(paths: []const []const u8, output: []u8) ?[]const u8 {
    const tail = "]}";
    if (output.len < tail.len) return null;
    const room = output[0 .. output.len - tail.len];
    var n: usize = 0;
    if (!json.append(room, &n, "{\"paths\":[")) return null;
    var count: usize = 0;
    for (paths) |path| {
        if (!std.unicode.utf8ValidateSlice(path)) continue;
        const mark = n;
        const ok = (count == 0 or json.append(room, &n, ",")) and json.appendString(room, &n, path);
        if (!ok) {
            n = mark;
            continue;
        }
        count += 1;
    }
    @memcpy(output[n..][0..tail.len], tail);
    return output[0 .. n + tail.len];
}

/// A closed packaged app can be launched with GOBAN_SELFTEST_OUT set by the
/// release job. The page writes a small report to that path after the real
/// WebView, bridge and engine are up; the platform workflow waits for it.
///
/// GOBAN_TOUR_OUT (v4) asks for the screenshot tour instead: the page walks
/// through its main screens (src/web/js/tour.js), writing its progress to
/// that path and waiting for scripts/tour-app.mjs to capture each one.
pub fn selftestConfig(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    // The page is up: tell a waiting update helper (if it launched us).
    install_mod.writeAck(self.io, &self.installer.note);
    const path = self.env_map.get("GOBAN_SELFTEST_OUT") orelse "";
    const tour = self.env_map.get("GOBAN_TOUR_OUT") orelse "";
    var n: usize = 0;
    if (path.len == 0) {
        if (!json.append(output, &n, "{\"enabled\":false")) return error.HandlerFailed;
    } else {
        if (!json.append(output, &n, "{\"enabled\":true,\"path\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, path)) return error.HandlerFailed;
    }
    // v5: also exercise the optional downloads (GOBAN_MODELS_DIR should
    // point at an empty temporary folder).
    const models = self.env_map.get("GOBAN_SELFTEST_MODELS") orelse "";
    if (path.len > 0 and std.mem.eql(u8, models, "1")) {
        if (!json.append(output, &n, ",\"models\":true")) return error.HandlerFailed;
    }
    if (tour.len > 0) {
        if (!json.append(output, &n, ",\"tour\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, tour)) return error.HandlerFailed;
    }
    // v5: GOBAN_UPDATE_PROBE_OUT asks the page for the updater probe
    // (selftest.js; scripts/test-updater.mjs), GOBAN_UPDATE_PROBE_TAG for a
    // real download of that release. The download address is still built
    // and checked by install.zig; the tag is only a tag.
    const probe = self.env_map.get("GOBAN_UPDATE_PROBE_OUT") orelse "";
    if (probe.len > 0) {
        if (!json.append(output, &n, ",\"updateProbe\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, probe)) return error.HandlerFailed;
        const probe_tag = self.env_map.get("GOBAN_UPDATE_PROBE_TAG") orelse "";
        if (install_mod.validTag(probe_tag)) {
            if (!json.append(output, &n, ",\"updateProbeTag\":")) return error.HandlerFailed;
            if (!json.appendString(output, &n, probe_tag)) return error.HandlerFailed;
        }
    }
    if (!json.append(output, &n, "}")) return error.HandlerFailed;
    return output[0..n];
}

/// The release self-test and the screenshot tour write their reports to
/// files the launcher names in the environment (and the tour waits for an
/// acknowledgement file beside its report). These are the only paths the
/// page may use without a dialog; they are trusted because the
/// environment already is (whoever sets it can run anything as the user).
pub fn grantReportFiles(self: *App) void {
    var buf: [files_mod.max_path_bytes + 16]u8 = undefined;
    if (self.env_map.get("GOBAN_SELFTEST_OUT")) |p| {
        if (p.len > 0) {
            _ = self.grants.grant(p, .write, true);
            if (std.fmt.bufPrint(&buf, "{s}.progress", .{p})) |progress| {
                _ = self.grants.grant(progress, .write, true);
            } else |_| {}
        }
    }
    if (self.env_map.get("GOBAN_UPDATE_PROBE_OUT")) |p| {
        if (p.len > 0) _ = self.grants.grant(p, .write, true);
    }
    if (self.env_map.get("GOBAN_TOUR_OUT")) |p| {
        if (p.len > 0) {
            _ = self.grants.grant(p, .write, true);
            if (std.fmt.bufPrint(&buf, "{s}.ack", .{p})) |ack| {
                _ = self.grants.grant(ack, .read, true);
            } else |_| {}
        }
    }
}

test "open paths are sent escaped; one bad path never blocks the others" {
    var out: [256]u8 = undefined;
    const paths = [_][]const u8{ "/a/x.sgf", "/a/tab\there.sgf", "/a/bell\x07.sgf", "/a/bad\xff.sgf", "/a/q\"uote.sgf" };
    const got = openPathsJson(&paths, &out).?;
    try std.testing.expectEqualStrings("{\"paths\":[\"/a/x.sgf\",\"/a/tab\\there.sgf\",\"/a/bell\\u0007.sgf\",\"/a/q\\\"uote.sgf\"]}", got);
    // The reply is valid JSON.
    const parsed = try std.json.parseFromSlice(struct { paths: []const []const u8 }, std.testing.allocator, got, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(usize, 4), parsed.value.paths.len);
    try std.testing.expectEqualStrings("/a/bell\x07.sgf", parsed.value.paths[2]);
    // Paths that do not fit are dropped one by one, the reply stays whole.
    var small: [30]u8 = undefined;
    const some = openPathsJson(&paths, &small).?;
    try std.testing.expectEqualStrings("{\"paths\":[\"/a/x.sgf\"]}", some);
    var tiny: [12]u8 = undefined;
    try std.testing.expectEqualStrings("{\"paths\":[]}", openPathsJson(&paths, &tiny).?);
}
