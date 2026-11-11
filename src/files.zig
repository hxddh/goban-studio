//! Which of the user's own files the page may read or write
//! (`studio.readTextFile` / `studio.writeTextFile`, main.zig).
//!
//! The page never names a file on its own authority. A path becomes usable
//! only when native code handed it out:
//!
//!   * the open / save dialogs (`studio.openFileDialog`,
//!     `studio.saveFileDialog`): the user picked it;
//!   * a document the operating system opened with the app, or files
//!     dropped on the window: the user chose them;
//!   * the release self-test and screenshot tour: the launcher named the
//!     report files in the environment (`trusted`, see below).
//!
//! Each grant is for exactly that path string and for reading or writing
//! (a dialog's "open" result cannot be overwritten, a "save" result cannot
//! be read back). On top of the grant every name must look like a file the
//! app produces or imports: an absolute path ending in one of
//! `allowed_extensions`, not a dotfile, not a Windows device name, no
//! control characters. So even a script that got into the page (an XSS in
//! an SGF comment, say) can at worst read a game the user just opened, or
//! overwrite the file the user just chose to save to; it cannot reach
//! `~/.ssh`, a LaunchAgent plist or the app itself.
//!
//! The set is small and in memory: the oldest grant goes when it is full,
//! and nothing survives a restart. UI thread only.

const std = @import("std");
const store = @import("store.zig");

/// What the app imports and exports: game records, backups, review images.
pub const allowed_extensions = [_][]const u8{ ".sgf", ".json", ".png" };
/// Grants kept at once (dialogs, drops and opened documents of a session).
pub const max_grants: usize = 32;
pub const max_path_bytes: usize = 4096;

pub const Access = enum { read, write };

/// The extension of `name` (".sgf"), or "" — lower-cased into `buf`.
fn extensionOf(name: []const u8, buf: []u8) []const u8 {
    const dot = std.mem.lastIndexOfScalar(u8, name, '.') orelse return "";
    const ext = name[dot..];
    if (ext.len > buf.len) return "";
    return std.ascii.lowerString(buf[0..ext.len], ext);
}

/// One of `allowed_extensions` (case-insensitive), or null.
pub fn allowedExtension(name: []const u8) ?[]const u8 {
    var buf: [8]u8 = undefined;
    const ext = extensionOf(name, &buf);
    for (allowed_extensions) |allowed| {
        if (std.mem.eql(u8, ext, allowed)) return allowed;
    }
    return null;
}

fn isSeparator(c: u8) bool {
    return c == '/' or c == '\\';
}

/// The last component of `path`, whichever separator the platform used.
pub fn baseName(path: []const u8) []const u8 {
    var i = path.len;
    while (i > 0) : (i -= 1) {
        if (isSeparator(path[i - 1])) return path[i..];
    }
    return path;
}

/// Absolute on this platform (`/…`, or `C:\…` / `\\server\…` on Windows).
fn isAbsolute(path: []const u8) bool {
    if (path.len > 0 and path[0] == '/') return true;
    if (path.len >= 3 and std.ascii.isAlphabetic(path[0]) and path[1] == ':' and isSeparator(path[2])) return true;
    return path.len >= 2 and path[0] == '\\' and path[1] == '\\';
}

/// A path the page may be granted at all: absolute, short enough, no
/// control characters, a name that is not hidden or a device, and one of
/// the app's extensions.
pub fn allowedName(path: []const u8) bool {
    if (path.len == 0 or path.len > max_path_bytes) return false;
    if (!isAbsolute(path)) return false;
    for (path) |c| {
        if (c < 0x20 or c == 0x7f) return false;
    }
    const name = baseName(path);
    if (name.len == 0 or name[0] == '.') return false;
    if (store.isDeviceName(name)) return false;
    // "x.sgf." and "x.sgf " are the same file as "x.sgf" on Windows.
    if (name[name.len - 1] == '.' or name[name.len - 1] == ' ') return false;
    return allowedExtension(name) != null;
}

const Entry = struct {
    path: []u8,
    read: bool,
    write: bool,
    /// Named by the launcher (self-test, tour): the name rules do not apply.
    trusted: bool,
};

pub const Grants = struct {
    allocator: std.mem.Allocator,
    entries: std.ArrayList(Entry) = .empty,

    pub fn init(allocator: std.mem.Allocator) Grants {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *Grants) void {
        for (self.entries.items) |e| self.allocator.free(e.path);
        self.entries.deinit(self.allocator);
    }

    fn find(self: *Grants, path: []const u8) ?*Entry {
        for (self.entries.items) |*e| {
            if (std.mem.eql(u8, e.path, path)) return e;
        }
        return null;
    }

    /// Allow `access` to exactly `path`. A path that breaks the name rules
    /// is refused (false) unless `trusted`. Granting again adds the access.
    pub fn grant(self: *Grants, path: []const u8, access: Access, trusted: bool) bool {
        if (path.len == 0 or path.len > max_path_bytes) return false;
        if (!trusted and !allowedName(path)) return false;
        if (self.find(path)) |e| {
            switch (access) {
                .read => e.read = true,
                .write => e.write = true,
            }
            e.trusted = e.trusted or trusted;
            return true;
        }
        const copy = self.allocator.dupe(u8, path) catch return false;
        if (self.entries.items.len >= max_grants) {
            // Oldest first out; trusted report paths are never evicted.
            var victim: ?usize = null;
            for (self.entries.items, 0..) |e, i| {
                if (!e.trusted) {
                    victim = i;
                    break;
                }
            }
            const v = victim orelse {
                self.allocator.free(copy);
                return false;
            };
            self.allocator.free(self.entries.items[v].path);
            _ = self.entries.orderedRemove(v);
        }
        self.entries.append(self.allocator, .{
            .path = copy,
            .read = access == .read,
            .write = access == .write,
            .trusted = trusted,
        }) catch {
            self.allocator.free(copy);
            return false;
        };
        return true;
    }

    /// May the page `access` exactly `path`?
    pub fn allows(self: *Grants, path: []const u8, access: Access) bool {
        const e = self.find(path) orelse return false;
        if (!e.trusted and !allowedName(path)) return false;
        return switch (access) {
            .read => e.read,
            .write => e.write,
        };
    }
};

/// The path a save dialog returned, made acceptable: when the user typed
/// a name without one of the app's extensions, `wanted_ext` (from the
/// suggested name) is appended, as the platform dialogs do when their
/// "hide extension" box is ticked. Null when the result still breaks the
/// name rules (a dotfile, a device name).
pub fn fixSavePath(path: []const u8, wanted_ext: []const u8, out: []u8) ?[]const u8 {
    const fixed = if (allowedExtension(baseName(path)) != null) path else blk: {
        if (path.len + wanted_ext.len > out.len) return null;
        @memcpy(out[0..path.len], path);
        @memcpy(out[path.len..][0..wanted_ext.len], wanted_ext);
        break :blk out[0 .. path.len + wanted_ext.len];
    };
    return if (allowedName(fixed)) fixed else null;
}

/// A name beside `path` that no file has yet: `path` itself when it is
/// free, else "<name> (2)<ext>", "(3)" … Used when the app, not the save
/// dialog, completed the file name, so nobody was asked about replacing
/// the file of that name. Null when a hundred are taken.
pub fn freeSavePath(io: std.Io, path: []const u8, out: []u8) ?[]const u8 {
    if (!pathExists(io, path)) return path;
    const ext = allowedExtension(baseName(path)) orelse return null;
    const stem = path[0 .. path.len - ext.len];
    const tail = path[path.len - ext.len ..];
    var n: usize = 2;
    while (n < 100) : (n += 1) {
        const candidate = std.fmt.bufPrint(out, "{s} ({d}){s}", .{ stem, n, tail }) catch return null;
        if (!allowedName(candidate)) return null;
        if (!pathExists(io, candidate)) return candidate;
    }
    return null;
}

fn pathExists(io: std.Io, path: []const u8) bool {
    if (!std.fs.path.isAbsolute(path)) return false;
    std.Io.Dir.accessAbsolute(io, path, .{}) catch |err| return err != error.FileNotFound;
    return true;
}

// ------------------------------------------------------------------ tests

const testing = std.testing;

test "only absolute paths of the app's own file types are grantable" {
    const good = [_][]const u8{
        "/Users/a/Desktop/game.sgf",
        "/Users/a/Desktop/GAME.SGF",
        "/tmp/goban-studio-backup-2026-11-08.json",
        "/tmp/review.png",
        "C:\\Users\\a\\Documents\\game.sgf",
        "c:/Users/a/game.json",
        "\\\\server\\share\\game.sgf",
        "/Users/a/.config/game.sgf", // a hidden directory is fine; the file is the user's pick
    };
    for (good) |p| try testing.expect(allowedName(p));
    const bad = [_][]const u8{
        "",
        "game.sgf",
        "relative/game.sgf",
        "/Users/a/.ssh/id_ed25519",
        "/Users/a/.zshrc",
        "/Users/a/.hidden.sgf",
        "/Users/a/Library/LaunchAgents/evil.plist",
        "/Applications/Goban Studio.app/Contents/MacOS/goban-studio",
        "/tmp/x.sgf.exe",
        "/tmp/x.txt",
        "/tmp/x.sgf\nquit",
        "/tmp/x\x00.sgf",
        "C:\\Users\\a\\con.sgf",
        "C:\\Users\\a\\NUL.json",
        "C:\\Users\\a\\lpt1.png",
        "C:\\Users\\a\\x.sgf.",
        "C:\\Users\\a\\x.sgf ",
        "/tmp/",
        "C:x.sgf",
    };
    for (bad) |p| try testing.expect(!allowedName(p));
}

test "a grant is for exactly one path and one kind of access" {
    var g = Grants.init(testing.allocator);
    defer g.deinit();
    try testing.expect(g.grant("/tmp/a.sgf", .read, false));
    try testing.expect(g.allows("/tmp/a.sgf", .read));
    try testing.expect(!g.allows("/tmp/a.sgf", .write));
    try testing.expect(!g.allows("/tmp/b.sgf", .read));
    try testing.expect(!g.allows("/tmp/./a.sgf", .read));
    try testing.expect(!g.allows("/tmp/A.sgf", .read));
    // A save grant adds writing.
    try testing.expect(g.grant("/tmp/a.sgf", .write, false));
    try testing.expect(g.allows("/tmp/a.sgf", .write));
    // Bad names are never granted.
    try testing.expect(!g.grant("/etc/passwd", .read, false));
    try testing.expect(!g.allows("/etc/passwd", .read));
    try testing.expect(!g.grant("/Users/a/.zshrc", .write, false));
}

test "launcher-named report files are trusted and never evicted" {
    var g = Grants.init(testing.allocator);
    defer g.deinit();
    try testing.expect(g.grant("/tmp/run/selftest.json.progress", .write, true));
    try testing.expect(g.allows("/tmp/run/selftest.json.progress", .write));
    try testing.expect(!g.allows("/tmp/run/selftest.json.progress", .read));
    var buf: [64]u8 = undefined;
    var i: usize = 0;
    while (i < max_grants + 5) : (i += 1) {
        const p = try std.fmt.bufPrint(&buf, "/tmp/g{d}.sgf", .{i});
        try testing.expect(g.grant(p, .read, false));
    }
    try testing.expectEqual(max_grants, g.entries.items.len);
    try testing.expect(g.allows("/tmp/run/selftest.json.progress", .write));
    // The oldest untrusted grants went first; the newest are there.
    try testing.expect(!g.allows("/tmp/g0.sgf", .read));
    const last = try std.fmt.bufPrint(&buf, "/tmp/g{d}.sgf", .{max_grants + 4});
    try testing.expect(g.allows(last, .read));
}

test "a save path without the app's extension gets the suggested one" {
    var buf: [128]u8 = undefined;
    try testing.expectEqualStrings("/tmp/game.sgf", fixSavePath("/tmp/game.sgf", ".sgf", &buf).?);
    try testing.expectEqualStrings("/tmp/game.sgf", fixSavePath("/tmp/game", ".sgf", &buf).?);
    try testing.expectEqualStrings("/tmp/game.txt.png", fixSavePath("/tmp/game.txt", ".png", &buf).?);
    try testing.expectEqualStrings("/tmp/Game.JSON", fixSavePath("/tmp/Game.JSON", ".json", &buf).?);
    try testing.expect(fixSavePath("/tmp/.profile", ".sgf", &buf) == null);
    try testing.expect(fixSavePath("C:\\x\\con", ".sgf", &buf) == null);
    try testing.expect(fixSavePath("relative", ".sgf", &buf) == null);
}

test "a completed save name never replaces a file nobody was asked about" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_len = try tmp.dir.realPath(io, &dir_buf);
    const dir = dir_buf[0..dir_len];
    const sep = std.fs.path.sep;
    var typed_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const typed = try std.fmt.bufPrint(&typed_buf, "{s}{c}game", .{ dir, sep });
    var fixed_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var free_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var want_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;

    // The user typed "game"; nothing is called game.sgf yet.
    const fixed = fixSavePath(typed, ".sgf", &fixed_buf).?;
    try testing.expect(fixed.len != typed.len);
    try testing.expectEqualStrings(fixed, freeSavePath(io, fixed, &free_buf).?);

    // There is a game.sgf (the dialog only asked about "game").
    try tmp.dir.writeFile(io, .{ .sub_path = "game.sgf", .data = "(;GM[1])" });
    const second = freeSavePath(io, fixed, &free_buf).?;
    try testing.expectEqualStrings(try std.fmt.bufPrint(&want_buf, "{s}{c}game (2).sgf", .{ dir, sep }), second);
    try testing.expect(allowedName(second));
    try tmp.dir.writeFile(io, .{ .sub_path = "game (2).sgf", .data = "x" });
    try testing.expectEqualStrings(try std.fmt.bufPrint(&want_buf, "{s}{c}game (3).sgf", .{ dir, sep }), freeSavePath(io, fixed, &free_buf).?);
    // The kept file is untouched.
    var read_buf: [16]u8 = undefined;
    try testing.expectEqualStrings("(;GM[1])", try tmp.dir.readFile(io, "game.sgf", &read_buf));

    // A name the user typed in full was the dialog's to ask about: it is
    // returned as it is, and main.zig does not call this at all.
    const full = try std.fmt.bufPrint(&typed_buf, "{s}{c}game.sgf", .{ dir, sep });
    try testing.expectEqualStrings(full, fixSavePath(full, ".sgf", &fixed_buf).?);
}
