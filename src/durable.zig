//! Durable commits: a file written beside its target and renamed over it
//! survives a power cut once the commit returns, not just a crash of the
//! app.
//!
//! A write commits in three steps, each of which the platform can otherwise
//! leave in a volatile cache:
//!
//!   1. the temporary file's bytes reach the disk (`syncFile`);
//!   2. the rename replaces the target (`renameIn`, `renameAbsolute`);
//!   3. the directory entry the rename changed reaches the disk.
//!
//! Per platform:
//!
//!   macOS    fsync only hands the data to the drive, whose cache may lose
//!            it; `fcntl(F_FULLFSYNC)` asks the drive to write it to the
//!            medium. Used for the file and, after the rename, for the
//!            parent directory; where a file system does not support it
//!            (some network and FAT volumes), plain fsync instead.
//!   Linux    fsync on the file, then fsync on the parent directory (and on
//!            the source's directory when it differs) after the rename.
//!   Windows  FlushFileBuffers on the file. A directory cannot be flushed,
//!            so the rename itself is `MoveFileExW(MOVEFILE_WRITE_THROUGH)`,
//!            which returns only once the move is on disk.
//!
//! A file system that cannot sync a directory at all (EINVAL, ENOTSUP) is
//! taken as it is; an I/O error is a failed commit.

const std = @import("std");
const builtin = @import("builtin");

const is_windows = builtin.os.tag == .windows;
const is_darwin = builtin.os.tag.isDarwin();

pub const SyncError = error{SyncFailed};

pub const RenameError = error{
    /// Windows: another process (a virus scanner, the indexer, a backup
    /// tool) has the target open for a moment; worth a short retry.
    Busy,
    /// The rename did not happen, or did and could not be made durable.
    RenameFailed,
};

// ------------------------------------------------------------- flushing

/// The two ways to flush a POSIX descriptor, as the plain functions the
/// platform has. Tests swap in fakes to check the order they are tried in.
const PosixFlush = struct {
    /// macOS `fcntl(fd, F_FULLFSYNC)`: 0 or an errno.
    full: ?*const fn (fd: std.posix.fd_t) std.posix.E,
    fsync: *const fn (fd: std.posix.fd_t) std.posix.E,
};

fn fullFsyncDarwin(fd: std.posix.fd_t) std.posix.E {
    if (!is_darwin) unreachable;
    return std.posix.errno(std.c.fcntl(fd, std.c.F.FULLFSYNC));
}

fn fsyncPosix(fd: std.posix.fd_t) std.posix.E {
    while (true) {
        const e = std.posix.errno(std.posix.system.fsync(fd));
        if (e != .INTR) return e;
    }
}

const posix_flush: PosixFlush = .{
    .full = if (is_darwin) &fullFsyncDarwin else null,
    .fsync = &fsyncPosix,
};

/// Does this errno mean "this file system cannot do that" rather than
/// "the data did not get there"?
fn unsupported(e: std.posix.E) bool {
    return switch (e) {
        .INVAL, .OPNOTSUPP, .ROFS => true,
        else => @intFromEnum(e) == @intFromEnum(enotsup),
    };
}

/// ENOTSUP is its own number on macOS and the same as EOPNOTSUPP on Linux.
const enotsup: std.posix.E = if (@hasField(std.posix.E, "NOTSUP")) .NOTSUP else .OPNOTSUPP;

/// Flush `fd` with the strongest call that works: F_FULLFSYNC where there
/// is one, fsync when it fails or there is none. `allow_unsupported` lets a
/// file system that cannot flush this kind of descriptor (a directory on
/// some volumes) through.
fn flushFd(ops: PosixFlush, fd: std.posix.fd_t, allow_unsupported: bool) SyncError!void {
    if (ops.full) |full| {
        if (full(fd) == .SUCCESS) return;
    }
    const e = ops.fsync(fd);
    if (e == .SUCCESS) return;
    if (allow_unsupported and unsupported(e)) return;
    return error.SyncFailed;
}

/// Make `file`'s bytes durable.
pub fn syncFile(io: std.Io, file: std.Io.File) SyncError!void {
    if (is_windows) {
        // NtFlushBuffersFile: what FlushFileBuffers calls.
        file.sync(io) catch return error.SyncFailed;
    } else {
        try flushFd(posix_flush, file.handle, false);
    }
}

/// Make the entries of the directory `sub` (relative to `dir`; "" for
/// `dir` itself) durable. Nothing to do on Windows (see the file comment).
pub fn syncDir(io: std.Io, dir: std.Io.Dir, sub: []const u8) SyncError!void {
    if (is_windows) return;
    return syncDirPosix(io, dir, sub);
}

fn syncDirPosix(io: std.Io, dir: std.Io.Dir, sub: []const u8) SyncError!void {
    // `iterate` opens a real descriptor: without it Linux opens the
    // directory O_PATH, and fsync on that fails with EBADF.
    const d = dir.openDir(io, if (sub.len == 0) "." else sub, .{ .iterate = true }) catch return error.SyncFailed;
    defer d.close(io);
    return flushFd(posix_flush, d.handle, true);
}

fn syncDirAbsolute(io: std.Io, path: []const u8) SyncError!void {
    return syncDir(io, std.Io.Dir.cwd(), path);
}

// ------------------------------------------------------------- renaming

/// Rename `from` over `to`, both relative to `dir`, whose absolute path is
/// `dir_path` (Windows moves by path), and make the rename durable.
pub fn renameIn(io: std.Io, dir: std.Io.Dir, dir_path: []const u8, from: []const u8, to: []const u8) RenameError!void {
    if (is_windows) {
        var from_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var to_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const from_abs = std.fmt.bufPrint(&from_buf, "{s}{c}{s}", .{ dir_path, std.fs.path.sep, from }) catch return error.RenameFailed;
        const to_abs = std.fmt.bufPrint(&to_buf, "{s}{c}{s}", .{ dir_path, std.fs.path.sep, to }) catch return error.RenameFailed;
        return moveWriteThrough(from_abs, to_abs);
    }
    return renameInPosix(io, dir, from, to);
}

fn renameInPosix(io: std.Io, dir: std.Io.Dir, from: []const u8, to: []const u8) RenameError!void {
    dir.rename(from, dir, to, io) catch |err| return renameError(err);
    const to_parent = std.fs.path.dirname(to) orelse "";
    syncDir(io, dir, to_parent) catch return error.RenameFailed;
    const from_parent = std.fs.path.dirname(from) orelse "";
    if (!std.mem.eql(u8, from_parent, to_parent)) syncDir(io, dir, from_parent) catch return error.RenameFailed;
}

/// Rename the absolute path `from` over `to` and make the rename durable.
pub fn renameAbsolute(io: std.Io, from: []const u8, to: []const u8) RenameError!void {
    if (is_windows) return moveWriteThrough(from, to);
    return renameAbsolutePosix(io, from, to);
}

fn renameAbsolutePosix(io: std.Io, from: []const u8, to: []const u8) RenameError!void {
    std.Io.Dir.renameAbsolute(from, to, io) catch |err| return renameError(err);
    const to_parent = std.fs.path.dirname(to) orelse return error.RenameFailed;
    syncDirAbsolute(io, to_parent) catch return error.RenameFailed;
    const from_parent = std.fs.path.dirname(from) orelse return error.RenameFailed;
    if (!std.mem.eql(u8, from_parent, to_parent)) syncDirAbsolute(io, from_parent) catch return error.RenameFailed;
}

fn renameError(err: std.Io.Dir.RenameError) RenameError {
    return switch (err) {
        error.AccessDenied, error.PermissionDenied, error.FileBusy, error.AntivirusInterference => error.Busy,
        else => error.RenameFailed,
    };
}

const win = if (is_windows) struct {
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    extern "kernel32" fn MoveFileExW(existing: [*:0]const u16, new: [*:0]const u16, flags: u32) callconv(.winapi) std.os.windows.BOOL;
} else struct {};

/// The longest path the Win32 file functions take without the `\\?\` prefix.
const win_max_path = 260;

/// `path` as the Win32 file functions take it: as is when it is short
/// enough, otherwise with the `\\?\` (or `\\?\UNC\`) prefix that lifts the
/// length limit, which also turns off the separator clean-up, so `/` is
/// written as `\`.
fn win32Path(out: []u8, path: []const u8) ?[]const u8 {
    if (path.len < win_max_path or std.mem.startsWith(u8, path, "\\\\?\\")) {
        if (path.len > out.len) return null;
        @memcpy(out[0..path.len], path);
        return out[0..path.len];
    }
    const unc = path.len >= 2 and (path[0] == '\\' or path[0] == '/') and (path[1] == '\\' or path[1] == '/');
    const prefix = if (unc) "\\\\?\\UNC\\" else "\\\\?\\";
    const rest = if (unc) path[2..] else path;
    if (prefix.len + rest.len > out.len) return null;
    @memcpy(out[0..prefix.len], prefix);
    for (rest, 0..) |c, i| out[prefix.len + i] = if (c == '/') '\\' else c;
    return out[0 .. prefix.len + rest.len];
}

fn moveWriteThrough(from: []const u8, to: []const u8) RenameError!void {
    if (!is_windows) unreachable;
    const W = std.os.windows;
    var from_w: [std.Io.Dir.max_path_bytes + 16:0]u16 = undefined;
    var to_w: [std.Io.Dir.max_path_bytes + 16:0]u16 = undefined;
    toWide(&from_w, from) orelse return error.RenameFailed;
    toWide(&to_w, to) orelse return error.RenameFailed;
    if (win.MoveFileExW(&from_w, &to_w, win.MOVEFILE_REPLACE_EXISTING | win.MOVEFILE_WRITE_THROUGH).toBool()) return;
    return switch (W.GetLastError()) {
        .ACCESS_DENIED, .SHARING_VIOLATION, .LOCK_VIOLATION => error.Busy,
        else => error.RenameFailed,
    };
}

fn toWide(out: *[std.Io.Dir.max_path_bytes + 16:0]u16, path: []const u8) ?void {
    var buf: [std.Io.Dir.max_path_bytes + 16]u8 = undefined;
    const p = win32Path(&buf, path) orelse return null;
    const n = std.unicode.wtf8ToWtf16Le(out[0..out.len], p) catch return null;
    if (n >= out.len) return null;
    out[n] = 0;
}

// ---------------------------------------------------------------- tests

const testing = std.testing;

var fake_calls: [4]u8 = undefined;
var fake_n: usize = 0;
var fake_full_result: std.posix.E = .SUCCESS;
var fake_fsync_result: std.posix.E = .SUCCESS;

fn fakeFull(fd: std.posix.fd_t) std.posix.E {
    _ = fd;
    fake_calls[fake_n] = 'F';
    fake_n += 1;
    return fake_full_result;
}

fn fakeFsync(fd: std.posix.fd_t) std.posix.E {
    _ = fd;
    fake_calls[fake_n] = 's';
    fake_n += 1;
    return fake_fsync_result;
}

fn runFake(full: bool, full_result: std.posix.E, fsync_result: std.posix.E, allow_unsupported: bool) struct { []const u8, SyncError!void } {
    fake_n = 0;
    fake_full_result = full_result;
    fake_fsync_result = fsync_result;
    const ops: PosixFlush = .{ .full = if (full) &fakeFull else null, .fsync = &fakeFsync };
    // The fakes never use the descriptor; on Windows a descriptor is a handle, not a number.
    const fake_fd: std.posix.fd_t = if (@typeInfo(std.posix.fd_t) == .pointer) @ptrFromInt(8) else 0;
    const r = flushFd(ops, fake_fd, allow_unsupported);
    return .{ fake_calls[0..fake_n], r };
}

test "F_FULLFSYNC is tried first, and plain fsync only when it fails" {
    // macOS, a volume that supports it: one call.
    var got = runFake(true, .SUCCESS, .SUCCESS, false);
    try testing.expectEqualStrings("F", got[0]);
    try got[1];
    // A volume that does not (ENOTSUP, EINVAL): fsync instead.
    got = runFake(true, enotsup, .SUCCESS, false);
    try testing.expectEqualStrings("Fs", got[0]);
    try got[1];
    // No F_FULLFSYNC on this platform: fsync alone.
    got = runFake(false, .SUCCESS, .SUCCESS, false);
    try testing.expectEqualStrings("s", got[0]);
    try got[1];
    // Both fail: the commit fails.
    got = runFake(true, .IO, .IO, false);
    try testing.expectEqualStrings("Fs", got[0]);
    try testing.expectError(error.SyncFailed, got[1]);
}

test "a directory a file system cannot sync is let through, an I/O error is not" {
    var got = runFake(false, .SUCCESS, .INVAL, true);
    try got[1];
    got = runFake(false, .SUCCESS, enotsup, true);
    try got[1];
    got = runFake(false, .SUCCESS, .IO, true);
    try testing.expectError(error.SyncFailed, got[1]);
    // A file is never let through.
    got = runFake(false, .SUCCESS, .INVAL, false);
    try testing.expectError(error.SyncFailed, got[1]);
}

test "long Windows paths get the prefix that lifts the length limit" {
    var buf: [600]u8 = undefined;
    try testing.expectEqualStrings("C:\\Users\\a\\data\\x.json", win32Path(&buf, "C:\\Users\\a\\data\\x.json").?);
    try testing.expectEqualStrings("\\\\?\\C:\\x", win32Path(&buf, "\\\\?\\C:\\x").?);
    const long_dir = "C:\\" ++ "d" ** 300;
    const long = win32Path(&buf, long_dir ++ "/x.json").?;
    try testing.expectEqualStrings("\\\\?\\" ++ long_dir ++ "\\x.json", long);
    const unc = win32Path(&buf, "\\\\server\\share\\" ++ "d" ** 300).?;
    try testing.expectEqualStrings("\\\\?\\UNC\\server\\share\\" ++ "d" ** 300, unc);
    var small: [8]u8 = undefined;
    try testing.expect(win32Path(&small, "C:\\too-long") == null);
}

test "a file and its directory sync, and a rename replaces the target durably" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_path = dir_buf[0..try tmp.dir.realPath(io, &dir_buf)];

    try tmp.dir.createDirPath(io, "games");
    {
        const f = try tmp.dir.createFile(io, "games" ++ std.fs.path.sep_str ++ "g.json.tmp", .{});
        defer f.close(io);
        try f.writeStreamingAll(io, "new");
        try syncFile(io, f);
    }
    try tmp.dir.writeFile(io, .{ .sub_path = "games" ++ std.fs.path.sep_str ++ "g.json", .data = "old" });
    try syncDir(io, tmp.dir, "");
    try syncDir(io, tmp.dir, "games");
    try renameIn(io, tmp.dir, dir_path, "games" ++ std.fs.path.sep_str ++ "g.json.tmp", "games" ++ std.fs.path.sep_str ++ "g.json");
    var buf: [16]u8 = undefined;
    try testing.expectEqualStrings("new", try tmp.dir.readFile(io, "games" ++ std.fs.path.sep_str ++ "g.json", &buf));
    try testing.expectError(error.FileNotFound, tmp.dir.access(io, "games" ++ std.fs.path.sep_str ++ "g.json.tmp", .{}));
    // Across directories: both sides' entries are synced.
    try tmp.dir.writeFile(io, .{ .sub_path = "top.tmp", .data = "x" });
    try renameIn(io, tmp.dir, dir_path, "top.tmp", "games" ++ std.fs.path.sep_str ++ "top.json");
    try testing.expectEqualStrings("x", try tmp.dir.readFile(io, "games" ++ std.fs.path.sep_str ++ "top.json", &buf));
    // A missing source is a failed rename, not a busy one.
    try testing.expectError(error.RenameFailed, renameIn(io, tmp.dir, dir_path, "missing.tmp", "m.json"));
}

test "an absolute rename replaces the target and leaves no source" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_path = dir_buf[0..try tmp.dir.realPath(io, &dir_buf)];
    var from_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var to_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const from = try std.fmt.bufPrint(&from_buf, "{s}{c}model.bin.part", .{ dir_path, std.fs.path.sep });
    const to = try std.fmt.bufPrint(&to_buf, "{s}{c}model.bin", .{ dir_path, std.fs.path.sep });
    try tmp.dir.writeFile(io, .{ .sub_path = "model.bin.part", .data = "weights" });
    try renameAbsolute(io, from, to);
    var buf: [16]u8 = undefined;
    try testing.expectEqualStrings("weights", try tmp.dir.readFile(io, "model.bin", &buf));
    try testing.expectError(error.FileNotFound, tmp.dir.access(io, "model.bin.part", .{}));
}
