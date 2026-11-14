//! Optional KataGo networks: downloaded only when the player asks.
//!
//! The app ships the small b6c96 network and is complete without anything
//! here. In Settings the player may fetch two more:
//!
//!   * `human`   KataGo's human SL model (b18c384nbt-humanv0), which makes
//!               the opponent play like a human of a given rank;
//!   * `strong`  a current standard network (kata1 b18c384nbt) for
//!               analysis, review and the top ladder level.
//!
//! Rules this module keeps:
//!
//!   * Only the URLs pinned in `specs` are ever fetched. The page names a
//!     model by kind ("human" / "strong"), never by address.
//!   * Two hosts only: KataGo's GitHub releases (the human model) and
//!     KataGo's own network server, media.katagotraining.org (the strong
//!     network, which is not on GitHub). Both over HTTPS.
//!   * Files live in the app's data directory (`<data>/models`), never in
//!     the signed app bundle.
//!   * A download streams into `<file>.part`, hashing as it goes; the file
//!     becomes `<file>` (one rename in the same directory) only when its
//!     size and SHA-256 match the pinned values. A model is never used
//!     before that rename. The bytes and the rename are flushed to the disk
//!     (durable.zig), so a power cut cannot leave a short or empty `<file>`
//!     that looks finished.
//!   * A stopped or failed download keeps its `.part`; the next download
//!     resumes it with an HTTP Range request (and starts over when the
//!     server ignores the range). A connection that breaks off mid-file is
//!     retried a few times by the same download, continuing where it
//!     stopped.
//!   * Requests go through the proxy the environment or the system names
//!     (net_proxy.zig), and follow redirects only over HTTPS to `download_hosts`.
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
const json = @import("json.zig");
const net = @import("net.zig");
const net_tunnel = @import("net_tunnel.zig");
const durable = @import("durable.zig");

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

/// The hosts a model download may reach, first request or redirect:
/// GitHub's release-download hosts, and KataGo's network server.
pub const download_hosts = net.github_hosts ++ [_][]const u8{katago_network_host};
const katago_network_host = "media.katagotraining.org";

/// The only two files this module can fetch. The human model is from
/// KataGo's GitHub releases; the strong network from katagotraining.org,
/// under the KataGo Neural Network License (engine/model/LICENSE-KataGo-networks.txt).
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
        .file = "kata1-b18c384nbt-s9996604416-d4316597426.bin.gz",
        .name = "kata1-b18c384nbt-s9996604416-d4316597426",
        .url = "https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz",
        .sha256 = "9d7a6afed8ff5b74894727e156f04f0cd36060a24824892008fbb6e0cba51f1d",
        .size = 97_898_094,
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
/// Broken connections in a row (without a byte) before a download fails.
const max_network_retries: u32 = 4;
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
    /// Where the proxy settings are read from (net_proxy.zig); set once by
    /// `main`. Null: always connect directly.
    env: ?*const std.process.Environ.Map = null,

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
            // Through the proxy the environment or the system names, if any.
            var session: net_tunnel.Session = undefined;
            session.init(allocator, self.io, self.env, net.httpsHost(s.url) orelse "github.com");
            defer session.deinit();
            var failures: u32 = 0;
            while (true) {
                const before = offset;
                self.transfer(&session, kind, gen, file, chunk, &offset, &hasher) catch |err| {
                    // A connection that broke off: ask for the rest, a few
                    // times, as long as this is still the live attempt.
                    if (err == error.Network) {
                        failures = if (offset > before) 1 else failures + 1;
                        if (failures <= max_network_retries and self.waitRetry(kind, gen, net.retryDelayMs(failures))) continue;
                    }
                    var outcome = Outcome.fail(transferErrorName(err), offset);
                    outcome.failed.detail = @errorName(err);
                    return outcome;
                };
                break;
            }
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
        durable.syncFile(self.io, file) catch return Outcome.fail("SyncFailed", offset);
        return self.activate(kind, gen, part, final);
    }

    /// The one step that makes a model usable: rename the verified `.part`.
    fn activate(self: *Manager, kind: Kind, gen: u64, part: []const u8, final: []const u8) Outcome {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.currentLocked(kind, gen)) return Outcome.fail("Cancelled", 0);
        durable.renameAbsolute(self.io, part, final) catch return Outcome.fail("RenameFailed", spec(kind).size);
        return .ready;
    }

    /// Sleep `ms` before a retry, in short steps. False: cancelled.
    fn waitRetry(self: *Manager, kind: Kind, gen: u64, ms: i64) bool {
        var left = ms;
        while (left > 0) : (left -= 250) {
            if (!self.setStatus(kind, gen, .downloading)) return false;
            std.Io.sleep(self.io, .fromMilliseconds(250), .awake) catch {};
        }
        return self.setStatus(kind, gen, .downloading);
    }

    /// Where a transfer's bytes go: the `.part`, written (and hashed) only
    /// while this is the live attempt.
    const PartSink = struct {
        manager: *Manager,
        kind: Kind,
        gen: u64,
        file: std.Io.File,
        offset: *u64,
        hasher: *std.crypto.hash.sha2.Sha256,

        fn sinkWrite(context: *anyopaque, bytes: []const u8, at: u64) anyerror!void {
            const ctx: *PartSink = @ptrCast(@alignCast(context));
            try ctx.manager.writeChunk(ctx.kind, ctx.gen, ctx.file, bytes, at);
            ctx.hasher.update(bytes);
            ctx.offset.* = at + bytes.len;
        }

        fn sinkRestart(context: *anyopaque) anyerror!void {
            const ctx: *PartSink = @ptrCast(@alignCast(context));
            try ctx.manager.truncate(ctx.kind, ctx.gen, ctx.file);
            ctx.offset.* = 0;
            ctx.hasher.* = std.crypto.hash.sha2.Sha256.init(.{});
        }

        fn sinkProgress(context: *anyopaque, received: u64, total: u64) bool {
            _ = total;
            const ctx: *PartSink = @ptrCast(@alignCast(context));
            return ctx.manager.progress(ctx.kind, ctx.gen, received);
        }
    };

    /// GET (or resume) the pinned URL into `file` from `offset.*`, which
    /// follows the bytes as they are stored.
    fn transfer(
        self: *Manager,
        session: *net_tunnel.Session,
        kind: Kind,
        gen: u64,
        file: std.Io.File,
        chunk: []u8,
        offset: *u64,
        hasher: *std.crypto.hash.sha2.Sha256,
    ) !void {
        const s = spec(kind);
        var ctx: PartSink = .{ .manager = self, .kind = kind, .gen = gen, .file = file, .offset = offset, .hasher = hasher };
        const stored = try net.fetch(session, .{
            .url = s.url,
            .user_agent = user_agent,
            .offset = offset.*,
            .expected_size = s.size,
            .max_bytes = s.size,
            .redirect_hosts = &download_hosts,
        }, .{
            .context = &ctx,
            .write = PartSink.sinkWrite,
            .restart = PartSink.sinkRestart,
            .progress = PartSink.sinkProgress,
        }, chunk);
        offset.* = stored;
        if (stored != s.size) return error.Network;
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
        error.BadRedirect, error.NoAsset, error.TooLarge => "HttpStatus",
        error.OutOfMemory => "OutOfMemory",
        else => "Network",
    };
}

/// `Content-Range: bytes <offset>-<size-1>/<size>`.
pub fn parseContentRange(value: []const u8, offset: u64, size: u64) bool {
    const range = net.parseContentRange(value) orelse return false;
    return range.first == offset and range.total == size and range.last + 1 == size;
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
    if (!json.append(out, &n, "{\"available\":")) return null;
    if (!json.appendBool(out, &n, self.dir_len > 0)) return null;
    for (specs) |s| {
        const snap = self.snapshot(s.kind);
        const ok = json.append(out, &n, ",") and
            json.appendString(out, &n, @tagName(s.kind)) and
            json.append(out, &n, ":{\"status\":") and
            json.appendString(out, &n, @tagName(snap.status)) and
            json.append(out, &n, ",\"bytes\":") and json.appendInt(out, &n, snap.bytes) and
            json.append(out, &n, ",\"total\":") and json.appendInt(out, &n, snap.total) and
            json.append(out, &n, ",\"idleMs\":") and json.appendInt(out, &n, snap.idle_ms) and
            json.append(out, &n, ",\"needed\":") and json.appendInt(out, &n, snap.needed) and
            json.append(out, &n, ",\"name\":") and json.appendString(out, &n, s.name) and
            json.append(out, &n, ",\"error\":") and json.appendString(out, &n, snap.error_name) and
            json.append(out, &n, ",\"detail\":") and json.appendString(out, &n, snap.detail) and
            json.append(out, &n, "}");
        if (!ok) return null;
    }
    if (!json.append(out, &n, "}")) return null;
    return out[0..n];
}

// ------------------------------------------------------------------ tests

test "pinned specs are well formed" {
    for (specs, 0..) |s, i| {
        try std.testing.expectEqual(@as(usize, i), @intFromEnum(s.kind));
        try std.testing.expectEqual(@as(usize, 64), s.sha256.len);
        for (s.sha256) |c| try std.testing.expect(std.ascii.isDigit(c) or (c >= 'a' and c <= 'f'));
        try std.testing.expect(net.allowedUrl(s.url, &download_hosts));
        try std.testing.expect(std.mem.endsWith(u8, s.url, s.file));
        try std.testing.expect(s.size > 1024 * 1024);
    }
    // Each from its own place, and nowhere else.
    try std.testing.expect(std.mem.startsWith(u8, spec(.human).url, "https://github.com/lightvector/KataGo/releases/download/"));
    try std.testing.expect(std.mem.startsWith(u8, spec(.strong).url, "https://media.katagotraining.org/uploaded/networks/models/kata1/"));
    // A model redirect may reach GitHub and KataGo's network server, over
    // HTTPS only; an update request (net.allowedRedirect) still only GitHub.
    try std.testing.expect(net.allowedUrl("https://release-assets.githubusercontent.com/x", &download_hosts));
    try std.testing.expect(!net.allowedUrl("http://media.katagotraining.org/x", &download_hosts));
    try std.testing.expect(!net.allowedUrl("https://katagotraining.org/x", &download_hosts));
    try std.testing.expect(!net.allowedRedirect(spec(.strong).url));
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
    const status_text = statusJson(m, &json_buf).?;
    try std.testing.expect(std.mem.indexOf(u8, status_text, "\"strong\":{\"status\":\"partial\",\"bytes\":10,") != null);

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
