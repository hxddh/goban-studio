//! v9 file storage (docs/v9.md, "Storage"): the page's data as JSON files
//! under `<app data>/data`, read and written through four bridge commands
//! (`studio.storeRead`, `studio.storeWrite`, `studio.storeList`,
//! `studio.storeRemove`; see bridge_files.zig).
//!
//! Keys are relative paths of `[a-z0-9_-]+` segments separated by `/`,
//! ending in `.json` (`profile.json`, `games/g-1730000000000.json`). Nothing
//! else can be named: no `..`, no absolute path, no backslash, no drive.
//!
//! A bridge message is at most 1 MB (the SDK's `max_message_bytes`), so a
//! file moves in chunks of `chunk_bytes`: a write sends its chunks in order
//! (`offset` 0 truncates the temporary file, later chunks must start where
//! the previous one ended) and the last one (`done`) renames the temporary
//! file over the target, so a reader never sees half a file. A read returns
//! the file's size with one chunk from `offset`. One file is at most
//! `max_file_bytes`.

const std = @import("std");
const json = @import("json.zig");
const builtin = @import("builtin");

/// Largest file the store keeps (a game with its full analysis is well under).
pub const max_file_bytes: u64 = 8 * 1024 * 1024;
/// Raw bytes per bridge call; as base64 (512 KB) it fits one bridge message.
pub const chunk_bytes: usize = 384 * 1024;
pub const max_key_bytes: usize = 200;
/// Directory levels a key may have (`games/x.json` is two).
pub const max_depth: usize = 4;
/// Suffix of the temporary file a write goes to before its rename.
pub const temp_suffix = ".tmp";

pub const Error = error{
    InvalidKey,
    TooLarge,
    /// A chunk that does not start where the temporary file ends.
    OutOfOrder,
    NoDataDir,
    Disk,
    /// The list does not fit the bridge reply.
    TooMany,
};

fn segmentChar(c: u8) bool {
    return (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '_' or c == '-';
}

/// `a/b/c`: one or more `[a-z0-9_-]+` segments separated by single `/`.
fn validPath(p: []const u8) bool {
    if (p.len == 0) return false;
    var seg: usize = 0;
    var depth: usize = 1;
    for (p) |c| {
        if (c == '/') {
            if (seg == 0) return false;
            seg = 0;
            depth += 1;
            if (depth > max_depth) return false;
            continue;
        }
        if (!segmentChar(c)) return false;
        seg += 1;
    }
    return seg > 0;
}

/// Windows reserves these names in every directory, with or without an
/// extension (`con.json` opens the console, `nul/x.json` cannot exist):
/// CON, PRN, AUX, NUL, COM1-9, LPT1-9, in any letter case. `name` is one
/// path segment; anything from its first dot on is the extension.
pub fn isDeviceName(name: []const u8) bool {
    const stem_end = std.mem.indexOfScalar(u8, name, '.') orelse name.len;
    // "con " and "con  .txt" are the device too: Windows drops trailing spaces.
    const stem = std.mem.trimEnd(u8, name[0..stem_end], " ");
    if (stem.len == 3) {
        for ([_][]const u8{ "con", "prn", "aux", "nul" }) |dev| {
            if (std.ascii.eqlIgnoreCase(stem, dev)) return true;
        }
        return false;
    }
    if (stem.len == 4 and stem[3] >= '1' and stem[3] <= '9') {
        return std.ascii.eqlIgnoreCase(stem[0..3], "com") or std.ascii.eqlIgnoreCase(stem[0..3], "lpt");
    }
    return false;
}

/// No segment of `p` (separated by `/`) is a Windows device name.
fn noDeviceSegment(p: []const u8) bool {
    var it = std.mem.splitScalar(u8, p, '/');
    while (it.next()) |seg| {
        if (isDeviceName(seg)) return false;
    }
    return true;
}

/// A storable key: `[a-z0-9_-]+` segments separated by `/`, ending in
/// `.json`, none of them a Windows device name (the same key must work on
/// both platforms: a backup made on macOS is restored on Windows).
pub fn validKey(key: []const u8) bool {
    if (key.len <= ".json".len or key.len > max_key_bytes) return false;
    if (!std.mem.endsWith(u8, key, ".json")) return false;
    const p = key[0 .. key.len - ".json".len];
    return validPath(p) and noDeviceSegment(p);
}

/// A list prefix: empty (everything), or a directory (`games` or `games/`).
pub fn validPrefix(prefix: []const u8) bool {
    if (prefix.len == 0) return true;
    if (prefix.len > max_key_bytes) return false;
    const p = if (prefix[prefix.len - 1] == '/') prefix[0 .. prefix.len - 1] else prefix;
    return validPath(p) and noDeviceSegment(p);
}

/// Rename `from` over `to` in `dir`. On Windows a rename over a file that
/// an antivirus scanner, the search indexer or a backup tool has open for a
/// moment fails with AccessDenied / sharing violation; a few short retries
/// (10, 20, 40, 80, 160 ms: about 0.3 s in all) ride that out instead of
/// failing the write. Elsewhere a rename either works or does not.
fn renameRetrying(io: std.Io, dir: std.Io.Dir, from: []const u8, to: []const u8) Error!void {
    const attempts: u32 = if (builtin.os.tag == .windows) 6 else 1;
    var delay_ms: i64 = 10;
    var i: u32 = 0;
    while (true) : (i += 1) {
        dir.rename(from, dir, to, io) catch |err| {
            if (i + 1 >= attempts) return error.Disk;
            switch (err) {
                error.AccessDenied, error.PermissionDenied, error.FileBusy, error.AntivirusInterference => {},
                else => return error.Disk,
            }
            std.Io.sleep(io, .fromMilliseconds(delay_ms), .awake) catch {};
            delay_ms *= 2;
            continue;
        };
        return;
    }
}

/// A key's path relative to the root, with the platform's separator.
fn nativeSub(key: []const u8, buf: []u8) Error![]const u8 {
    if (key.len > buf.len) return error.InvalidKey;
    for (key, 0..) |c, i| buf[i] = if (c == '/') std.fs.path.sep else c;
    return buf[0..key.len];
}

fn tempSub(key: []const u8, buf: []u8) Error![]const u8 {
    if (key.len + temp_suffix.len > buf.len) return error.InvalidKey;
    const sub = try nativeSub(key, buf);
    @memcpy(buf[sub.len..][0..temp_suffix.len], temp_suffix);
    return buf[0 .. sub.len + temp_suffix.len];
}

pub const Chunk = struct {
    /// Size of the whole file.
    size: u64,
    /// The bytes read, a prefix of the caller's buffer.
    bytes: []u8,
};

pub const Store = struct {
    io: std.Io,
    root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    root_len: usize = 0,

    /// `dir_path` is the absolute data directory; empty when there is none.
    pub fn init(self: *Store, io: std.Io, dir_path: []const u8) void {
        self.io = io;
        self.root_len = 0;
        if (dir_path.len == 0 or dir_path.len > self.root_buf.len or !std.fs.path.isAbsolute(dir_path)) return;
        @memcpy(self.root_buf[0..dir_path.len], dir_path);
        self.root_len = dir_path.len;
    }

    pub fn root(self: *const Store) []const u8 {
        return self.root_buf[0..self.root_len];
    }

    /// The root, opened; null when it does not exist (nothing stored yet).
    fn openRoot(self: *Store, create: bool, iterate: bool) Error!?std.Io.Dir {
        if (self.root_len == 0) return error.NoDataDir;
        const cwd = std.Io.Dir.cwd();
        if (create) cwd.createDirPath(self.io, self.root()) catch return error.Disk;
        const dir = cwd.openDir(self.io, self.root(), .{ .iterate = iterate }) catch |err| switch (err) {
            error.FileNotFound => {
                if (create) return error.Disk;
                return null;
            },
            else => return error.Disk,
        };
        return dir;
    }

    /// One chunk of `key` from `offset` into `buf` (at most `buf.len`
    /// bytes); null when the file does not exist.
    pub fn read(self: *Store, key: []const u8, offset: u64, buf: []u8) Error!?Chunk {
        if (!validKey(key)) return error.InvalidKey;
        const dir = (try self.openRoot(false, false)) orelse return null;
        defer dir.close(self.io);
        var sub_buf: [max_key_bytes + 16]u8 = undefined;
        const sub = try nativeSub(key, &sub_buf);
        const file = dir.openFile(self.io, sub, .{}) catch |err| switch (err) {
            error.FileNotFound => return null,
            else => return error.Disk,
        };
        defer file.close(self.io);
        const size = file.length(self.io) catch return error.Disk;
        if (size > max_file_bytes) return error.TooLarge;
        if (offset > size) return error.OutOfOrder;
        const want: usize = @intCast(@min(@as(u64, buf.len), size - offset));
        const n = file.readPositionalAll(self.io, buf[0..want], offset) catch return error.Disk;
        return .{ .size = size, .bytes = buf[0..n] };
    }

    /// Write one chunk of `key`. `offset` 0 starts a new temporary file;
    /// a later chunk must start where the temporary file ends. With `done`
    /// the temporary file replaces the target in one rename.
    pub fn write(self: *Store, key: []const u8, bytes: []const u8, offset: u64, done: bool) Error!void {
        if (!validKey(key)) return error.InvalidKey;
        if (offset + bytes.len > max_file_bytes) return error.TooLarge;
        const dir = (try self.openRoot(true, false)).?;
        defer dir.close(self.io);
        var sub_buf: [max_key_bytes + 16]u8 = undefined;
        var tmp_buf: [max_key_bytes + 16]u8 = undefined;
        const sub = try nativeSub(key, &sub_buf);
        const tmp = try tempSub(key, &tmp_buf);
        if (std.fs.path.dirname(sub)) |parent| dir.createDirPath(self.io, parent) catch return error.Disk;
        {
            const file = blk: {
                if (offset == 0) break :blk dir.createFile(self.io, tmp, .{ .truncate = true }) catch return error.Disk;
                break :blk dir.openFile(self.io, tmp, .{ .mode = .read_write }) catch |err| switch (err) {
                    error.FileNotFound => return error.OutOfOrder,
                    else => return error.Disk,
                };
            };
            defer file.close(self.io);
            if (offset > 0) {
                const len = file.length(self.io) catch return error.Disk;
                if (len != offset) return error.OutOfOrder;
            }
            if (bytes.len > 0) file.writePositionalAll(self.io, bytes, offset) catch return error.Disk;
            if (done) file.sync(self.io) catch return error.Disk;
        }
        if (done) try renameRetrying(self.io, dir, tmp, sub);
    }

    /// Remove `key` (and any unfinished write of it). A missing key is fine.
    pub fn remove(self: *Store, key: []const u8) Error!void {
        if (!validKey(key)) return error.InvalidKey;
        const dir = (try self.openRoot(false, false)) orelse return;
        defer dir.close(self.io);
        var sub_buf: [max_key_bytes + 16]u8 = undefined;
        var tmp_buf: [max_key_bytes + 16]u8 = undefined;
        const sub = try nativeSub(key, &sub_buf);
        const tmp = try tempSub(key, &tmp_buf);
        dir.deleteFile(self.io, tmp) catch {};
        dir.deleteFile(self.io, sub) catch |err| switch (err) {
            error.FileNotFound => {},
            else => return error.Disk,
        };
    }

    /// The keys under `prefix` (see validPrefix) as a JSON array of
    /// strings, written into `out`. Files that are not valid keys
    /// (temporary files, anything put there by hand) are left out.
    pub fn listJson(self: *Store, prefix: []const u8, out: []u8) Error![]const u8 {
        if (!validPrefix(prefix)) return error.InvalidKey;
        var w = Out{ .buf = out };
        try w.put("[");
        const p = if (prefix.len > 0 and prefix[prefix.len - 1] == '/') prefix[0 .. prefix.len - 1] else prefix;
        if (try self.openRoot(false, false)) |rd| {
            defer rd.close(self.io);
            var key_buf: [max_key_bytes + 1]u8 = undefined;
            @memcpy(key_buf[0..p.len], p);
            var sub_buf: [max_key_bytes + 16]u8 = undefined;
            const start = if (p.len == 0) "." else try nativeSub(p, &sub_buf);
            const depth: usize = if (p.len == 0) 0 else std.mem.count(u8, p, "/") + 1;
            const maybe: ?std.Io.Dir = blk: {
                break :blk rd.openDir(self.io, start, .{ .iterate = true }) catch |err| switch (err) {
                    error.FileNotFound, error.NotDir => break :blk null,
                    else => return error.Disk,
                };
            };
            if (maybe) |d| {
                defer d.close(self.io);
                try self.walk(d, &key_buf, p.len, depth, &w);
            }
        }
        try w.put("]");
        return w.buf[0..w.n];
    }

    fn walk(self: *Store, dir: std.Io.Dir, key_buf: *[max_key_bytes + 1]u8, key_len: usize, depth: usize, w: *Out) Error!void {
        var it = dir.iterate();
        while (it.next(self.io) catch return error.Disk) |entry| {
            const sep: usize = if (key_len > 0) 1 else 0;
            if (key_len + sep + entry.name.len > max_key_bytes) continue;
            if (sep == 1) key_buf[key_len] = '/';
            @memcpy(key_buf[key_len + sep ..][0..entry.name.len], entry.name);
            const key = key_buf[0 .. key_len + sep + entry.name.len];
            // Some file systems do not report the kind: a name decides then.
            const is_file = entry.kind == .file or (entry.kind == .unknown and validKey(key));
            const is_dir = entry.kind == .directory or (entry.kind == .unknown and !is_file);
            if (is_file and validKey(key)) {
                if (w.n > 1) try w.put(",");
                try w.putString(key);
            } else if (is_dir and depth + 1 < max_depth and validPath(key)) {
                const child = dir.openDir(self.io, entry.name, .{ .iterate = true }) catch continue;
                defer child.close(self.io);
                try self.walk(child, key_buf, key.len, depth + 1, w);
            }
        }
    }
};

const Out = struct {
    buf: []u8,
    n: usize = 0,

    fn put(self: *Out, text: []const u8) Error!void {
        if (!json.append(self.buf, &self.n, text)) return error.TooMany;
    }

    fn putString(self: *Out, text: []const u8) Error!void {
        const mark = self.n;
        if (!json.appendString(self.buf, &self.n, text)) {
            self.n = mark;
            return error.TooMany;
        }
    }
};

// ------------------------------------------------------------------ tests

const testing = std.testing;

test "store keys are validated strictly" {
    const good = [_][]const u8{ "settings.json", "profile.json", "current.json", "games/g-1730000000000.json", "games/a_b-9.json", "a/b/c.json" };
    for (good) |k| try testing.expect(validKey(k));
    const bad = [_][]const u8{
        "",                    ".json",              "profile",          "profile.txt",       "Profile.json",
        "/profile.json",       "../profile.json",    "games/../x.json",  "games/./x.json",    "games//x.json",
        "games/.json",         "games/x.json/",      "a\\b.json",        "c:/x.json",         "C:\\x.json",
        "games/x.json.tmp",    "x.y.json",           "sp ace.json",      "a/b/c/d/e.json",    "\x00.json",
        "games/\xc3\xa9.json", "profile.JSON",
        // Windows device names, as a file or a directory.
        "con.json",            "nul.json",           "aux.json",         "prn.json",          "com1.json",
        "lpt9.json",           "games/con.json",     "con/x.json",       "games/lpt1.json",
    };
    for (bad) |k| try testing.expect(!validKey(k));
    var long: [max_key_bytes + 1]u8 = @splat('a');
    @memcpy(long[long.len - 5 ..], ".json");
    try testing.expect(!validKey(&long));
    try testing.expect(validKey(long[1..]));

    try testing.expect(validPrefix(""));
    try testing.expect(validPrefix("games"));
    try testing.expect(validPrefix("games/"));
    try testing.expect(!validPrefix("/"));
    try testing.expect(!validPrefix("../"));
    try testing.expect(!validPrefix("games//"));
    try testing.expect(!validPrefix("/games/"));
    try testing.expect(!validPrefix("con/"));
    // Names that only start like a device are ordinary.
    for ([_][]const u8{ "console.json", "com.json", "com0.json", "com10.json", "lpt.json", "nul-1.json", "auxiliary.json" }) |k| try testing.expect(validKey(k));
}

test "Windows device names are recognised in any case, with or without an extension" {
    const devices = [_][]const u8{ "con", "CON", "Con", "prn", "aux", "nul", "NUL.txt", "com1", "COM9", "lpt1", "LPT9.json", "con.tar.gz", "con ", "aux .json" };
    for (devices) |n| try testing.expect(isDeviceName(n));
    const ordinary = [_][]const u8{ "", "co", "conn", "com", "com0", "com10", "lpt0", "lptx", "nul_", "x.con", "console.json", ".con" };
    for (ordinary) |n| try testing.expect(!isDeviceName(n));
}

// ------------------------------------------------ files the user picks

/// Largest file the user's own files (backups, SGF, images) may be.
pub const max_user_file_bytes: u64 = 64 * 1024 * 1024;
/// Suffix of the temporary file a chunked user-file write goes to.
pub const part_suffix = ".part";

fn openParent(io: std.Io, path: []const u8) Error!std.Io.Dir {
    const parent = std.fs.path.dirname(path) orelse return error.InvalidKey;
    return std.Io.Dir.cwd().openDir(io, parent, .{}) catch return error.Disk;
}

/// One chunk of the file at `path` (absolute) from `offset` into `buf`.
pub fn readPath(io: std.Io, path: []const u8, offset: u64, buf: []u8) Error!Chunk {
    if (!std.fs.path.isAbsolute(path)) return error.InvalidKey;
    const dir = try openParent(io, path);
    defer dir.close(io);
    const file = dir.openFile(io, std.fs.path.basename(path), .{}) catch return error.Disk;
    defer file.close(io);
    const size = file.length(io) catch return error.Disk;
    if (size > max_user_file_bytes) return error.TooLarge;
    if (offset > size) return error.OutOfOrder;
    const want: usize = @intCast(@min(@as(u64, buf.len), size - offset));
    const n = file.readPositionalAll(io, buf[0..want], offset) catch return error.Disk;
    return .{ .size = size, .bytes = buf[0..n] };
}

/// Write one chunk of the file at `path` (absolute), as `Store.write` does:
/// offset 0 starts `<name>.part` beside it, later chunks must follow on, and
/// `done` renames it over the target.
pub fn writePath(io: std.Io, path: []const u8, bytes: []const u8, offset: u64, done: bool) Error!void {
    if (!std.fs.path.isAbsolute(path)) return error.InvalidKey;
    if (offset + bytes.len > max_user_file_bytes) return error.TooLarge;
    const name = std.fs.path.basename(path);
    if (name.len == 0 or name.len + part_suffix.len > 255) return error.InvalidKey;
    var tmp_buf: [256]u8 = undefined;
    const tmp = std.fmt.bufPrint(&tmp_buf, "{s}{s}", .{ name, part_suffix }) catch return error.InvalidKey;
    const dir = try openParent(io, path);
    defer dir.close(io);
    {
        const file = blk: {
            if (offset == 0) break :blk dir.createFile(io, tmp, .{ .truncate = true }) catch return error.Disk;
            break :blk dir.openFile(io, tmp, .{ .mode = .read_write }) catch |err| switch (err) {
                error.FileNotFound => return error.OutOfOrder,
                else => return error.Disk,
            };
        };
        defer file.close(io);
        if (offset > 0) {
            const len = file.length(io) catch return error.Disk;
            if (len != offset) return error.OutOfOrder;
        }
        if (bytes.len > 0) file.writePositionalAll(io, bytes, offset) catch return error.Disk;
        if (done) file.sync(io) catch return error.Disk;
    }
    if (done) try renameRetrying(io, dir, tmp, name);
}

test "a user file is written in chunks beside its target and read back from offsets" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_len = try tmp.dir.realPath(io, &dir_buf);
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&path_buf, "{s}{c}backup.json", .{ dir_buf[0..dir_len], std.fs.path.sep });
    try tmp.dir.writeFile(io, .{ .sub_path = "backup.json", .data = "old" });

    try writePath(io, path, "0123456789", 0, false);
    var buf: [64]u8 = undefined;
    try testing.expectEqualStrings("old", (try readPath(io, path, 0, &buf)).bytes);
    try testing.expectError(error.OutOfOrder, writePath(io, path, "x", 3, false));
    try writePath(io, path, "abcdef", 10, true);
    const whole = try readPath(io, path, 0, &buf);
    try testing.expectEqual(@as(u64, 16), whole.size);
    try testing.expectEqualStrings("0123456789abcdef", whole.bytes);
    try testing.expectEqualStrings("abcd", (try readPath(io, path, 10, buf[0..4])).bytes);
    try testing.expectEqual(@as(usize, 0), (try readPath(io, path, 16, &buf)).bytes.len);
    try testing.expectError(error.OutOfOrder, readPath(io, path, 17, &buf));
    try testing.expectError(error.FileNotFound, tmp.dir.access(io, "backup.json.part", .{}));
    // One-shot writes replace the whole file; relative paths are refused.
    try writePath(io, path, "{}", 0, true);
    try testing.expectEqualStrings("{}", (try readPath(io, path, 0, &buf)).bytes);
    try testing.expectError(error.InvalidKey, writePath(io, "backup.json", "x", 0, true));
}

test "store writes atomically, reads in chunks, lists and removes in a temp dir" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_len = try tmp.dir.realPath(io, &dir_buf);
    var root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const root_path = try std.fmt.bufPrint(&root_buf, "{s}{c}data", .{ dir_buf[0..dir_len], std.fs.path.sep });

    var store: Store = .{ .io = io };
    store.init(io, root_path);
    var buf: [64]u8 = undefined;
    var list_buf: [1024]u8 = undefined;

    // Nothing yet: reads are null, the list is empty, removing is fine.
    try testing.expect((try store.read("profile.json", 0, &buf)) == null);
    try testing.expectEqualStrings("[]", try store.listJson("", &list_buf));
    try testing.expectEqualStrings("[]", try store.listJson("games/", &list_buf));
    try store.remove("profile.json");

    // One-shot writes create the root and parent directories.
    try store.write("profile.json", "{\"v\":9}", 0, true);
    try store.write("games/g-1.json", "{\"id\":\"g-1\"}", 0, true);
    try store.write("games/g-2.json", "{}", 0, true);
    const got = (try store.read("profile.json", 0, &buf)).?;
    try testing.expectEqual(@as(u64, 7), got.size);
    try testing.expectEqualStrings("{\"v\":9}", got.bytes);

    // Overwrite replaces the whole file (shorter content, no leftover bytes).
    try store.write("profile.json", "{}", 0, true);
    try testing.expectEqualStrings("{}", (try store.read("profile.json", 0, &buf)).?.bytes);

    // A chunked write: the target keeps its old content until `done`.
    try store.write("games/g-1.json", "0123456789", 0, false);
    try testing.expectEqualStrings("{\"id\":\"g-1\"}", (try store.read("games/g-1.json", 0, &buf)).?.bytes);
    try testing.expectError(error.OutOfOrder, store.write("games/g-1.json", "x", 3, false));
    try store.write("games/g-1.json", "abcdef", 10, true);
    const whole = (try store.read("games/g-1.json", 0, &buf)).?;
    try testing.expectEqual(@as(u64, 16), whole.size);
    try testing.expectEqualStrings("0123456789abcdef", whole.bytes);
    // Reading from an offset, at most the buffer's length.
    const part = (try store.read("games/g-1.json", 10, buf[0..4])).?;
    try testing.expectEqual(@as(u64, 16), part.size);
    try testing.expectEqualStrings("abcd", part.bytes);
    try testing.expectEqual(@as(usize, 0), (try store.read("games/g-1.json", 16, &buf)).?.bytes.len);
    try testing.expectError(error.OutOfOrder, store.read("games/g-1.json", 17, &buf));
    // A later chunk without a first one is refused.
    try testing.expectError(error.OutOfOrder, store.write("games/g-3.json", "x", 5, true));

    // No temporary file is left behind or listed.
    try testing.expectError(error.FileNotFound, tmp.dir.access(io, "data" ++ std.fs.path.sep_str ++ "games" ++ std.fs.path.sep_str ++ "g-1.json.tmp", .{}));
    // A stray file that is not a key is never listed.
    try tmp.dir.writeFile(io, .{ .sub_path = "data" ++ std.fs.path.sep_str ++ "games" ++ std.fs.path.sep_str ++ "Notes.txt", .data = "x" });
    try tmp.dir.writeFile(io, .{ .sub_path = "data" ++ std.fs.path.sep_str ++ "games" ++ std.fs.path.sep_str ++ "g-9.json.tmp", .data = "x" });

    const all = try store.listJson("", &list_buf);
    for ([_][]const u8{ "\"profile.json\"", "\"games/g-1.json\"", "\"games/g-2.json\"" }) |k| try testing.expect(std.mem.indexOf(u8, all, k) != null);
    try testing.expectEqual(@as(usize, 3), std.mem.count(u8, all, ".json\""));
    const games = try store.listJson("games/", &list_buf);
    try testing.expectEqual(@as(usize, 2), std.mem.count(u8, games, ".json\""));
    try testing.expect(std.mem.indexOf(u8, games, "profile") == null);
    var list_buf2: [1024]u8 = undefined;
    try testing.expectEqualStrings(games, try store.listJson("games", &list_buf2));
    try testing.expectError(error.TooMany, store.listJson("", list_buf[0..8]));

    // Remove.
    try store.remove("games/g-1.json");
    try testing.expect((try store.read("games/g-1.json", 0, &buf)) == null);
    try store.remove("games/g-1.json");
    try testing.expectEqual(@as(usize, 1), std.mem.count(u8, try store.listJson("games/", &list_buf), ".json\""));

    // Invalid keys never reach the disk.
    try testing.expectError(error.InvalidKey, store.write("../escape.json", "x", 0, true));
    try testing.expectError(error.InvalidKey, store.read("/etc/passwd", 0, &buf));
    try testing.expectError(error.InvalidKey, store.remove("games/../profile.json"));
    try testing.expectError(error.InvalidKey, store.listJson("../", &list_buf));
    try testing.expectError(error.FileNotFound, tmp.dir.access(io, "escape.json", .{}));
    // The size limit.
    try testing.expectError(error.TooLarge, store.write("big.json", "x", max_file_bytes, true));

    // No data directory: every command says so.
    var none: Store = .{ .io = io };
    none.init(io, "");
    try testing.expectError(error.NoDataDir, none.read("profile.json", 0, &buf));
    try testing.expectError(error.NoDataDir, none.write("profile.json", "x", 0, true));
}
