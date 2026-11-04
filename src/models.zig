//! Optional KataGo networks (v5): downloaded only when the player asks.
//!
//! The app ships the small b6c96 network and is complete without anything
//! here. In Settings the player may fetch two more:
//!
//!   * `human`   KataGo's human SL model (b18c384nbt-humanv0), which makes
//!               the opponent play like a human of a given rank;
//!   * `strong`  a larger standard network (g170e b15c192) for analysis,
//!               review and the top ladder level.
//!
//! Rules this module keeps:
//!
//!   * Only the URLs pinned in `specs` are ever fetched. The page names a
//!     model by kind ("human" / "strong"), never by address.
//!   * Files live in the app's data directory (`<data>/models`), never in
//!     the signed app bundle.
//!   * A download streams into `<file>.part`, hashing as it goes; the file
//!     becomes `<file>` (one rename in the same directory) only when its
//!     size and SHA-256 match the pinned values. A model is never used
//!     before that rename.
//!   * A stopped or failed download keeps its `.part`; the next download
//!     resumes it with an HTTP Range request (and starts over when the
//!     server ignores the range).
//!   * Free space is checked before the transfer starts (macOS, Windows).
//!
//! Threads: one short-lived thread per download. The UI thread reads the
//! state with `snapshot` (the page polls `studio.modelStatus`), and
//! `cancel` / `remove` take effect at once: a cancelled thread is
//! "detached" by bumping the kind's generation, and every write it makes
//! is checked against that generation under the lock, so a thread stuck
//! in a network read can never touch the file again once it wakes up.
//! `std.http.Client` has no socket timeout; the page shows a stalled
//! download from `idleMs` and the player can cancel and retry.
const std = @import("std");
const builtin = @import("builtin");

pub const Kind = enum(u2) { human = 0, strong = 1 };
pub const kind_count = 2;

pub const Spec = struct {
    kind: Kind,
    /// File name inside the models directory.
    file: []const u8,
    /// KataGo's own name for the network (shown in Settings).
    name: []const u8,
    url: []const u8,
    /// Lower-case hex SHA-256 of the whole file.
    sha256: []const u8,
    size: u64,
};

/// The only two files this module can fetch. Both come from KataGo's
/// official GitHub releases (MIT; see engine/model/LICENSE-KataGo.txt).
pub const specs = [kind_count]Spec{
    .{
        .kind = .human,
        .file = "b18c384nbt-humanv0.bin.gz",
        .name = "b18c384nbt-humanv0",
        .url = "https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz",
        .sha256 = "637746e44f0efe00ad1245a50aa9bbf0716efe364c43965ead97bd6835d84ab5",
        .size = 99_066_230,
    },
    .{
        .kind = .strong,
        .file = "g170e-b15c192-s1672170752-d466197061.txt.gz",
        .name = "g170e-b15c192-s1672170752-d466197061",
        .url = "https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz",
        .sha256 = "09456899f1b9155217f4ca059cf8a68f79b7eba22cf6b7c00ffb7f17ce067967",
        .size = 48_038_914,
    },
};

pub fn spec(kind: Kind) *const Spec {
    return &specs[@intFromEnum(kind)];
}

pub fn parseKind(text: []const u8) ?Kind {
    if (std.mem.eql(u8, text, "human")) return .human;
    if (std.mem.eql(u8, text, "strong")) return .strong;
    return null;
}

pub const Status = enum {
    /// Nothing on disk.
    absent,
    /// A `.part` from an earlier attempt; `bytes` says how much.
    partial,
    downloading,
    /// Transfer done, checking the hash and renaming.
    verifying,
    ready,
    /// The last attempt failed; `error` says why (a `.part` may remain).
    failed,
};

/// Room kept free beyond the file itself.
pub const disk_margin_bytes: u64 = 64 * 1024 * 1024;
/// Threads that may still be running (cancelled, stalled) before a new
/// download is refused with `Busy`.
const max_running: u32 = 4;
const chunk_bytes = 256 * 1024;
const user_agent = "GobanStudio-model-download";

pub const WakeFn = *const fn (context: ?*anyopaque) anyerror!void;

const Slot = struct {
    status: Status = .absent,
    bytes: u64 = 0,
    error_name: []const u8 = "",
    /// The underlying error (diagnostics only, e.g. TlsInitializationFailed).
    detail: []const u8 = "",
    /// Bytes the disk would need (DiskFull).
    needed: u64 = 0,
    gen: u64 = 0,
    /// The thread of generation `gen` is alive.
    active: bool = false,
    last_progress_ms: i64 = 0,
};

pub const Manager = struct {
    io: std.Io = undefined,
    lock: std.Io.Mutex = .init,
    dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    dir_len: usize = 0,
    /// Tests behind a proxy: use the environment's proxy settings. The app
    /// leaves this null (no proxy, like the update check).
    proxy_env: ?*std.process.Environ.Map = null,

    // --- guarded by `lock`
    slots: [kind_count]Slot = [_]Slot{.{}} ** kind_count,
    running: u32 = 0,
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,

    /// `dir` is the absolute models directory (created on first download).
    /// An empty `dir` disables downloads (`NoDataDir`). UI thread, once.
    pub fn init(self: *Manager, io: std.Io, dir: []const u8) void {
        self.* = .{};
        self.io = io;
        if (dir.len <= self.dir_buf.len) {
            @memcpy(self.dir_buf[0..dir.len], dir);
            self.dir_len = dir.len;
        }
        for (0..kind_count) |i| self.slots[i] = self.scan(@enumFromInt(i));
    }

    pub fn dirPath(self: *const Manager) []const u8 {
        return self.dir_buf[0..self.dir_len];
    }

    pub fn setWake(self: *Manager, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    /// Absolute path of `kind`'s file (whether or not it exists).
    pub fn modelPath(self: *const Manager, kind: Kind, out: []u8) ?[]const u8 {
        if (self.dir_len == 0) return null;
        return std.fmt.bufPrint(out, "{s}{c}{s}", .{ self.dirPath(), std.fs.path.sep, spec(kind).file }) catch null;
    }

    fn partPath(self: *const Manager, kind: Kind, out: []u8) ?[]const u8 {
        if (self.dir_len == 0) return null;
        return std.fmt.bufPrint(out, "{s}{c}{s}.part", .{ self.dirPath(), std.fs.path.sep, spec(kind).file }) catch null;
    }

    /// What is on disk for `kind`: a complete file of the pinned size is
    /// ready (it was verified before it got its name); a `.part` is
    /// partial. A final file of the wrong size is reported as failed
    /// (`Corrupt`); remove or download again replaces it.
    fn scan(self: *Manager, kind: Kind) Slot {
        var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        if (self.modelPath(kind, &buf)) |path| {
            if (fileSize(self.io, path)) |size| {
                if (size == spec(kind).size) return .{ .status = .ready, .bytes = size };
                return .{ .status = .failed, .error_name = "Corrupt" };
            }
        }
        if (self.partPath(kind, &buf)) |path| {
            if (fileSize(self.io, path)) |size| {
                if (size > 0 and size <= spec(kind).size) return .{ .status = .partial, .bytes = size };
            }
        }
        return .{};
    }

    pub fn isReady(self: *Manager, kind: Kind) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.slots[@intFromEnum(kind)].status == .ready;
    }

    pub const Snapshot = struct {
        status: Status,
        bytes: u64,
        total: u64,
        error_name: []const u8,
        detail: []const u8,
        needed: u64,
        idle_ms: i64,
    };

    pub fn snapshot(self: *Manager, kind: Kind) Snapshot {
        const now = nowMs(self.io);
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const s = self.slots[@intFromEnum(kind)];
        return .{
            .status = s.status,
            .bytes = s.bytes,
            .total = spec(kind).size,
            .error_name = s.error_name,
            .detail = s.detail,
            .needed = s.needed,
            .idle_ms = if (s.status == .downloading and s.last_progress_ms > 0) now - s.last_progress_ms else 0,
        };
    }

    /// Start (or resume) downloading `kind`. UI thread. A model that is
    /// already ready or downloading is left alone.
    pub fn start(self: *Manager, kind: Kind) !void {
        if (self.dir_len == 0) return error.NoDataDir;
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const slot = &self.slots[@intFromEnum(kind)];
        switch (slot.status) {
            .ready, .downloading, .verifying => return,
            else => {},
        }
        if (self.running >= max_running) return error.Busy;
        slot.gen += 1;
        slot.status = .downloading;
        slot.error_name = "";
        slot.detail = "";
        slot.needed = 0;
        slot.active = true;
        slot.last_progress_ms = nowMs(self.io);
        const thread = std.Thread.spawn(.{ .stack_size = 4 * 1024 * 1024 }, run, .{ self, kind, slot.gen }) catch |err| {
            slot.active = false;
            slot.status = .failed;
            slot.error_name = "ThreadFailed";
            return err;
        };
        thread.detach();
        self.running += 1;
    }

    /// Stop downloading `kind`; the `.part` stays for a later resume.
    /// Takes effect at once (the thread is detached). UI thread.
    pub fn cancel(self: *Manager, kind: Kind) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const slot = &self.slots[@intFromEnum(kind)];
        if (slot.status != .downloading and slot.status != .verifying) return false;
        slot.gen += 1;
        slot.active = false;
        slot.status = if (slot.bytes > 0) .partial else .absent;
        slot.error_name = "";
        return true;
    }

    /// Delete `kind`'s file and any `.part` (cancelling a download first).
    /// The caller has stopped every KataGo process that uses the file.
    /// UI thread.
    pub fn remove(self: *Manager, kind: Kind) !void {
        _ = self.cancel(kind);
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var failed = false;
        if (self.modelPath(kind, &buf)) |path| deleteIfExists(self.io, path) catch {
            failed = true;
        };
        if (self.partPath(kind, &buf)) |path| deleteIfExists(self.io, path) catch {
            failed = true;
        };
        const slot = &self.slots[@intFromEnum(kind)];
        slot.gen += 1;
        if (failed) {
            slot.status = .failed;
            slot.error_name = "RemoveFailed";
            return error.RemoveFailed;
        }
        slot.* = .{ .gen = slot.gen };
    }

    // ------------------------------------------------------ download thread

    /// Lock held: is `gen` still the live attempt for `kind`?
    fn currentLocked(self: *Manager, kind: Kind, gen: u64) bool {
        const slot = &self.slots[@intFromEnum(kind)];
        return slot.gen == gen and slot.active;
    }

    fn progress(self: *Manager, kind: Kind, gen: u64, bytes: u64) bool {
        const now = nowMs(self.io);
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return false;
        const slot = &self.slots[@intFromEnum(kind)];
        slot.bytes = bytes;
        slot.last_progress_ms = now;
        return true;
    }

    fn setStatus(self: *Manager, kind: Kind, gen: u64, status: Status) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return false;
        self.slots[@intFromEnum(kind)].status = status;
        return true;
    }

    fn finish(self: *Manager, kind: Kind, gen: u64, outcome: Outcome) void {
        self.lock.lockUncancelable(self.io);
        self.running -= 1;
        const slot = &self.slots[@intFromEnum(kind)];
        const current = slot.gen == gen and slot.active;
        if (current) {
            slot.active = false;
            switch (outcome) {
                .ready => {
                    slot.status = .ready;
                    slot.bytes = spec(kind).size;
                    slot.error_name = "";
                },
                .failed => |f| {
                    slot.status = .failed;
                    slot.error_name = f.name;
                    slot.detail = f.detail;
                    slot.needed = f.needed;
                    slot.bytes = f.kept;
                },
            }
        }
        const wake_fn = self.wake_fn;
        const wake_context = self.wake_context;
        self.lock.unlock(self.io);
        if (current) {
            if (wake_fn) |f| f(wake_context) catch {};
        }
    }

    fn run(self: *Manager, kind: Kind, gen: u64) void {
        const outcome = self.download(kind, gen);
        self.finish(kind, gen, outcome);
    }

    /// Write `bytes` at `offset` only while `gen` is the live attempt.
    fn writeChunk(self: *Manager, kind: Kind, gen: u64, file: std.Io.File, bytes: []const u8, offset: u64) !void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return error.Cancelled;
        file.writePositionalAll(self.io, bytes, offset) catch |err| return switch (err) {
            error.NoSpaceLeft => error.DiskFull,
            else => error.WriteFailed,
        };
    }

    /// Empty the `.part`, again only for the live attempt.
    fn truncate(self: *Manager, kind: Kind, gen: u64, file: std.Io.File) !void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return error.Cancelled;
        file.setLength(self.io, 0) catch return error.WriteFailed;
    }

    fn download(self: *Manager, kind: Kind, gen: u64) Outcome {
        const s = spec(kind);
        var part_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var final_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const part = self.partPath(kind, &part_buf) orelse return Outcome.fail("NoDataDir", 0);
        const final = self.modelPath(kind, &final_buf) orelse return Outcome.fail("NoDataDir", 0);
        std.Io.Dir.cwd().createDirPath(self.io, self.dirPath()) catch return Outcome.fail("NoDataDir", 0);

        // Only the live attempt opens the `.part` (a detached one returns).
        var file = blk: {
            self.lock.lockUncancelable(self.io);
            defer self.lock.unlock(self.io);
            if (!self.currentLocked(kind, gen)) return Outcome.fail("Cancelled", 0);
            break :blk std.Io.Dir.createFileAbsolute(self.io, part, .{ .read = true, .truncate = false }) catch
                return Outcome.fail("WriteFailed", 0);
        };
        defer file.close(self.io);

        var offset: u64 = file.length(self.io) catch 0;
        if (offset > s.size) {
            self.truncate(kind, gen, file) catch |err| return Outcome.fail(transferErrorName(err), 0);
            offset = 0;
        }
        if (freeBytes(self.io, self.dirPath())) |free| {
            const needed = s.size - offset + disk_margin_bytes;
            if (free < needed) return Outcome.failNeeded("DiskFull", offset, needed);
        }

        const allocator = std.heap.page_allocator;
        const chunk = allocator.alloc(u8, chunk_bytes) catch return Outcome.fail("OutOfMemory", offset);
        defer allocator.free(chunk);

        var hasher = std.crypto.hash.sha2.Sha256.init(.{});
        // Resume: the bytes already on disk are part of the hash.
        var hashed: u64 = 0;
        while (hashed < offset) {
            const want: usize = @intCast(@min(@as(u64, chunk.len), offset - hashed));
            const n = file.readPositionalAll(self.io, chunk[0..want], hashed) catch return Outcome.fail("ReadFailed", offset);
            if (n == 0) break;
            hasher.update(chunk[0..n]);
            hashed += n;
        }
        if (hashed != offset) {
            // Shorter than its length said: start over.
            self.truncate(kind, gen, file) catch |err| return Outcome.fail(transferErrorName(err), 0);
            offset = 0;
            hasher = std.crypto.hash.sha2.Sha256.init(.{});
        }
        _ = self.progress(kind, gen, offset);

        if (offset < s.size) {
            var client: std.http.Client = .{ .allocator = allocator, .io = self.io };
            defer client.deinit();
            var arena: std.heap.ArenaAllocator = .init(allocator);
            defer arena.deinit();
            if (self.proxy_env) |env| client.initDefaultProxies(arena.allocator(), env) catch {};
            self.transfer(&client, kind, gen, file, chunk, &offset, &hasher) catch |err| {
                var outcome = Outcome.fail(transferErrorName(err), offset);
                outcome.failed.detail = @errorName(err);
                return outcome;
            };
        }

        if (!self.setStatus(kind, gen, .verifying)) return Outcome.fail("Cancelled", offset);
        if (offset != s.size) return Outcome.fail("SizeMismatch", offset);
        var digest: [32]u8 = undefined;
        hasher.final(&digest);
        const hex = std.fmt.bytesToHex(digest, .lower);
        if (!std.mem.eql(u8, &hex, s.sha256)) {
            // Wrong bytes cannot be resumed into right ones.
            self.truncate(kind, gen, file) catch {};
            return Outcome.fail("ChecksumMismatch", 0);
        }
        file.sync(self.io) catch {};
        return self.activate(kind, gen, part, final);
    }

    /// The one step that makes a model usable: rename the verified `.part`.
    fn activate(self: *Manager, kind: Kind, gen: u64, part: []const u8, final: []const u8) Outcome {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return Outcome.fail("Cancelled", 0);
        std.Io.Dir.renameAbsolute(part, final, self.io) catch return Outcome.fail("RenameFailed", spec(kind).size);
        return .ready;
    }

    /// GET (or resume) the pinned URL into `file` from `offset.*`.
    fn transfer(
        self: *Manager,
        client: *std.http.Client,
        kind: Kind,
        gen: u64,
        file: std.Io.File,
        chunk: []u8,
        offset: *u64,
        hasher: *std.crypto.hash.sha2.Sha256,
    ) !void {
        const s = spec(kind);
        var range_buf: [64]u8 = undefined;
        const range = try std.fmt.bufPrint(&range_buf, "bytes={d}-", .{offset.*});
        const resume_headers = [_]std.http.Header{.{ .name = "range", .value = range }};
        const uri = try std.Uri.parse(s.url);
        var req = try client.request(.GET, uri, .{
            .keep_alive = false,
            .redirect_behavior = @enumFromInt(5),
            .headers = .{
                .user_agent = .{ .override = user_agent },
                .accept_encoding = .omit,
            },
            // Kept across the redirect to GitHub's asset host.
            .extra_headers = if (offset.* > 0) &resume_headers else &.{},
        });
        defer req.deinit();
        try req.sendBodiless();
        var redirect_buf: [8 * 1024]u8 = undefined;
        var response = try req.receiveHead(&redirect_buf);
        const status = @intFromEnum(response.head.status);
        if (status == 416 and offset.* == s.size) return;
        if (status == 200) {
            if (offset.* > 0) {
                // The server ignored the range: start over.
                try self.truncate(kind, gen, file);
                offset.* = 0;
                hasher.* = std.crypto.hash.sha2.Sha256.init(.{});
            }
            if (response.head.content_length) |len| {
                if (len != s.size) return error.SizeMismatch;
            }
        } else if (status == 206) {
            if (!contentRangeMatches(response.head, offset.*, s.size)) return error.SizeMismatch;
        } else return error.HttpStatus;
        if (response.head.content_encoding != .identity) return error.HttpStatus;

        var transfer_buf: [64]u8 = undefined;
        const reader = response.reader(&transfer_buf);
        while (true) {
            const n = reader.readSliceShort(chunk) catch return error.Network;
            if (n == 0) break;
            if (offset.* + n > s.size) return error.SizeMismatch;
            try self.writeChunk(kind, gen, file, chunk[0..n], offset.*);
            hasher.update(chunk[0..n]);
            offset.* += n;
            if (!self.progress(kind, gen, offset.*)) return error.Cancelled;
        }
        if (offset.* != s.size) return error.Network;
    }
};

const Outcome = union(enum) {
    ready,
    failed: struct { name: []const u8, kept: u64, needed: u64 = 0, detail: []const u8 = "" },

    fn fail(name: []const u8, kept: u64) Outcome {
        return .{ .failed = .{ .name = name, .kept = kept } };
    }
    fn failNeeded(name: []const u8, kept: u64, needed: u64) Outcome {
        return .{ .failed = .{ .name = name, .kept = kept, .needed = needed } };
    }
};

fn transferErrorName(err: anyerror) []const u8 {
    return switch (err) {
        error.Cancelled => "Cancelled",
        error.DiskFull => "DiskFull",
        error.WriteFailed => "WriteFailed",
        error.SizeMismatch => "SizeMismatch",
        error.HttpStatus => "HttpStatus",
        error.TooManyHttpRedirects => "HttpStatus",
        error.OutOfMemory => "OutOfMemory",
        else => "Network",
    };
}

/// `Content-Range: bytes <offset>-<size-1>/<size>`.
fn contentRangeMatches(head: std.http.Client.Response.Head, offset: u64, size: u64) bool {
    var it = head.iterateHeaders();
    while (it.next()) |h| {
        if (!std.ascii.eqlIgnoreCase(h.name, "content-range")) continue;
        return parseContentRange(h.value, offset, size);
    }
    return false;
}

pub fn parseContentRange(value: []const u8, offset: u64, size: u64) bool {
    const v = std.mem.trim(u8, value, " \t");
    if (!std.mem.startsWith(u8, v, "bytes ")) return false;
    const rest = v["bytes ".len..];
    const dash = std.mem.indexOfScalar(u8, rest, '-') orelse return false;
    const slash = std.mem.indexOfScalar(u8, rest, '/') orelse return false;
    if (slash < dash) return false;
    const first = std.fmt.parseInt(u64, rest[0..dash], 10) catch return false;
    const last = std.fmt.parseInt(u64, rest[dash + 1 .. slash], 10) catch return false;
    const total = std.fmt.parseInt(u64, rest[slash + 1 ..], 10) catch return false;
    return first == offset and total == size and last + 1 == size;
}

fn nowMs(io: std.Io) i64 {
    return std.Io.Timestamp.now(io, .awake).toMilliseconds();
}

fn fileSize(io: std.Io, path: []const u8) ?u64 {
    var file = std.Io.Dir.openFileAbsolute(io, path, .{}) catch return null;
    defer file.close(io);
    return file.length(io) catch null;
}

fn deleteIfExists(io: std.Io, path: []const u8) !void {
    std.Io.Dir.deleteFileAbsolute(io, path) catch |err| switch (err) {
        error.FileNotFound => {},
        else => return err,
    };
}

// ------------------------------------------------------------ free space

const DarwinStatvfs = extern struct {
    f_bsize: c_ulong,
    f_frsize: c_ulong,
    f_blocks: c_uint,
    f_bfree: c_uint,
    f_bavail: c_uint,
    f_files: c_uint,
    f_ffree: c_uint,
    f_favail: c_uint,
    f_fsid: c_ulong,
    f_flag: c_ulong,
    f_namemax: c_ulong,
};

const darwin = struct {
    extern "c" fn statvfs(path: [*:0]const u8, buf: *DarwinStatvfs) c_int;
};

const win = struct {
    extern "kernel32" fn GetDiskFreeSpaceExW(
        directory: [*:0]const u16,
        free_to_caller: ?*u64,
        total: ?*u64,
        total_free: ?*u64,
    ) callconv(.winapi) c_int;
};

/// Bytes available to this user on the volume holding `path`, or null when
/// the platform cannot say (then the write itself reports DiskFull).
pub fn freeBytes(io: std.Io, path: []const u8) ?u64 {
    _ = io;
    switch (builtin.os.tag) {
        .macos => {
            var z: [std.Io.Dir.max_path_bytes + 1]u8 = undefined;
            if (path.len >= z.len) return null;
            @memcpy(z[0..path.len], path);
            z[path.len] = 0;
            var st: DarwinStatvfs = undefined;
            if (darwin.statvfs(@ptrCast(&z), &st) != 0) return null;
            const unit: u64 = if (st.f_frsize != 0) st.f_frsize else st.f_bsize;
            return @as(u64, st.f_bavail) * unit;
        },
        .windows => {
            var w: [std.Io.Dir.max_path_bytes + 1]u16 = undefined;
            const n = std.unicode.wtf8ToWtf16Le(w[0 .. w.len - 1], path) catch return null;
            w[n] = 0;
            var free: u64 = 0;
            if (win.GetDiskFreeSpaceExW(@ptrCast(&w), &free, null, null) == 0) return null;
            return free;
        },
        else => return null,
    }
}

// ------------------------------------------------------------ status JSON

/// `{"human":{...},"strong":{...},"dir":"…"}` for `studio.modelStatus`.
pub fn statusJson(self: *Manager, out: []u8) ?[]const u8 {
    var n: usize = 0;
    if (!append(out, &n, "{\"available\":")) return null;
    if (!append(out, &n, if (self.dir_len > 0) "true" else "false")) return null;
    for (specs) |s| {
        const snap = self.snapshot(s.kind);
        const part = std.fmt.bufPrint(out[n..], ",\"{s}\":{{\"status\":\"{s}\",\"bytes\":{d},\"total\":{d},\"idleMs\":{d},\"needed\":{d},\"name\":\"{s}\",\"error\":\"{s}\",\"detail\":\"{s}\"}}", .{
            @tagName(s.kind),
            @tagName(snap.status),
            snap.bytes,
            snap.total,
            snap.idle_ms,
            snap.needed,
            s.name,
            snap.error_name,
            snap.detail,
        }) catch return null;
        n += part.len;
    }
    if (!append(out, &n, "}")) return null;
    return out[0..n];
}

fn append(buf: []u8, n: *usize, text: []const u8) bool {
    if (n.* + text.len > buf.len) return false;
    @memcpy(buf[n.*..][0..text.len], text);
    n.* += text.len;
    return true;
}

// ------------------------------------------------------------------ tests

test "pinned specs are well formed" {
    for (specs, 0..) |s, i| {
        try std.testing.expectEqual(@as(usize, i), @intFromEnum(s.kind));
        try std.testing.expectEqual(@as(usize, 64), s.sha256.len);
        for (s.sha256) |c| try std.testing.expect(std.ascii.isDigit(c) or (c >= 'a' and c <= 'f'));
        try std.testing.expect(std.mem.startsWith(u8, s.url, "https://github.com/lightvector/KataGo/releases/download/"));
        try std.testing.expect(std.mem.endsWith(u8, s.url, s.file));
        try std.testing.expect(s.size > 1024 * 1024);
    }
    try std.testing.expectEqual(Kind.human, parseKind("human").?);
    try std.testing.expectEqual(Kind.strong, parseKind("strong").?);
    try std.testing.expect(parseKind("https://evil.example/x.bin.gz") == null);
    try std.testing.expect(parseKind("") == null);
}

test "content range must resume exactly where the part ends" {
    try std.testing.expect(parseContentRange("bytes 100-999/1000", 100, 1000));
    try std.testing.expect(!parseContentRange("bytes 0-999/1000", 100, 1000));
    try std.testing.expect(!parseContentRange("bytes 100-998/1000", 100, 1000));
    try std.testing.expect(!parseContentRange("bytes 100-999/*", 100, 1000));
    try std.testing.expect(!parseContentRange("items 100-999/1000", 100, 1000));
}

test "scan reports ready, partial and corrupt files; remove clears them" {
    const io = std.testing.io;
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_len = try tmp.dir.realPath(io, &dir_buf);
    const dir_path = dir_buf[0..dir_len];

    const m = try std.testing.allocator.create(Manager);
    defer std.testing.allocator.destroy(m);
    m.init(io, dir_path);
    try std.testing.expectEqual(Status.absent, m.snapshot(.human).status);

    // A partial download of the strong network.
    try tmp.dir.writeFile(io, .{ .sub_path = specs[1].file ++ ".part", .data = "0123456789" });
    // A final human file of the wrong size (not one this module renamed).
    try tmp.dir.writeFile(io, .{ .sub_path = specs[0].file, .data = "short" });
    m.init(io, dir_path);
    const strong = m.snapshot(.strong);
    try std.testing.expectEqual(Status.partial, strong.status);
    try std.testing.expectEqual(@as(u64, 10), strong.bytes);
    try std.testing.expectEqual(spec(.strong).size, strong.total);
    const human = m.snapshot(.human);
    try std.testing.expectEqual(Status.failed, human.status);
    try std.testing.expectEqualStrings("Corrupt", human.error_name);
    try std.testing.expect(!m.isReady(.human));

    var json_buf: [2048]u8 = undefined;
    const json = statusJson(m, &json_buf).?;
    try std.testing.expect(std.mem.indexOf(u8, json, "\"strong\":{\"status\":\"partial\",\"bytes\":10,") != null);

    try m.remove(.human);
    try m.remove(.strong);
    try std.testing.expectEqual(Status.absent, m.snapshot(.human).status);
    try std.testing.expectEqual(Status.absent, m.snapshot(.strong).status);
    try std.testing.expectError(error.FileNotFound, tmp.dir.access(io, specs[1].file ++ ".part", .{}));
    try std.testing.expectError(error.FileNotFound, tmp.dir.access(io, specs[0].file, .{}));
}

test "no data directory: downloads are refused" {
    const m = try std.testing.allocator.create(Manager);
    defer std.testing.allocator.destroy(m);
    m.init(std.testing.io, "");
    try std.testing.expectError(error.NoDataDir, m.start(.human));
    var json_buf: [2048]u8 = undefined;
    try std.testing.expect(std.mem.startsWith(u8, statusJson(m, &json_buf).?, "{\"available\":false"));
}
