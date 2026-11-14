//! In-app update install (v5).
//!
//! After an update check found a newer release, the player may choose
//! "Download and install". Everything here happens only on that request:
//!
//!   1. Download — one asset for this platform and architecture, plus the
//!      release's SHA256SUMS, both from
//!      `https://github.com/hxddh/goban-studio/releases/download/<tag>/<name>`.
//!      The address is built here from a validated tag and a fixed asset
//!      name; the page never supplies a URL. Redirects are followed by hand
//!      and only to GitHub's own download hosts, always over HTTPS.
//!   2. Verify — the asset's SHA-256 must equal its line in SHA256SUMS.
//!      On its own that catches corruption, truncation and a wrong file,
//!      but it is not a signature: SHA256SUMS comes from the same release
//!      over the same TLS connection to GitHub, so whoever can publish a
//!      release can publish matching sums. v13: a build made with
//!      `-Dupdate-pubkey=<base64 Ed25519 public key>` (docs/signing.md)
//!      also downloads `SHA256SUMS.sig` — the base64 of a 64-byte Ed25519
//!      signature over the exact bytes of SHA256SUMS — and refuses the
//!      update without a valid one (`NoSignature`, `BadSignature`). The
//!      private key never touches GitHub's release storage; it lives in the
//!      release job's secrets. A build without the option behaves as
//!      before (checksums only), and says so nowhere it could mislead.
//!   3. Unpack into a per-user staging directory under the temp dir
//!      (macOS: `ditto -x -k`, then `codesign --verify --deep --strict`;
//!      Windows: std.zip with every entry name checked first), and check
//!      the layout, the bundle id and the executable's CPU architecture.
//!   4. Apply — on "Restart to update" the app writes its *embedded* helper
//!      script (src/updater/) next to the staging directory and starts it
//!      detached. v13: the helper takes an exclusive lock for the
//!      installation (`.<name>.goban-lock` beside it: a second helper for
//!      the same app refuses) and then creates a "started" marker in the
//!      staging directory. The app quits only once that marker exists; if
//!      it does not appear within `helper_start_timeout_ms` the app claims
//!      the marker itself (so a late helper gives up), stays open and
//!      reports `HelperNotStarted`. The helper waits for this process to exit,
//!      swaps the installation (keeping a backup), launches the new app
//!      with `--goban-update-ack=<file>` and waits for the new app to write
//!      that file; without it, it rolls back and relaunches the old app with
//!      `--goban-update-failed`.
//!
//! Nothing downloaded is ever executed except the verified new app, and
//! only by the helper after the swap. If the installation cannot be
//! replaced (read-only location, App Translocation, a development build),
//! the status says so and the page offers "Open download page" instead.
//!
//! Threading follows update.zig: a download runs on its own thread and
//! publishes progress in a locked slot; the UI thread reads snapshots and
//! answers the waiting `studio.updateDownload` call when the thread is done.
//!
//! The code is in four files: this one (the download thread and its
//! state), install_verify.zig (the address, the signature, the version and
//! the checksums), install_package.zig (the package: its layout, its CPU,
//! unzipping, the checks) and install_apply.zig (the installation, the
//! helper, the launch arguments, the bridge replies).
const std = @import("std");
const builtin = @import("builtin");
const update = @import("update.zig");
const json = @import("json.zig");
const net = @import("net.zig");
const paths = @import("paths.zig");
const install_verify = @import("install_verify.zig");
const install_package = @import("install_package.zig");
const install_apply = @import("install_apply.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;

const max_sig_bytes: u64 = 1024;
const user_agent = "GobanStudio-updater";

/// Hard limits: the packages are ~100 MB; SHA256SUMS is a few lines.
pub const max_asset_bytes: u64 = 1024 * 1024 * 1024;
const max_sums_bytes: u64 = 64 * 1024;
/// No byte for this long while downloading: the connection is abandoned
/// (std.http has no socket timeout; the UI thread enforces it) and the
/// download continues on a new one from the bytes already on disk, up to
/// `max_stall_retries` times; then it fails with `Stalled`.
pub const stall_timeout_ms: i64 = 60_000;
pub const max_stall_retries: u32 = 3;
/// A connection that breaks off is retried this many times, each
/// continuing the file where it stopped.
pub const max_network_retries: u32 = 4;
/// Download threads that may exist at once: the live one and the
/// abandoned ones still stuck in a read.
const max_running: u32 = max_stall_retries + 3;

// ------------------------------------------------------------ platform

pub const Platform = enum {
    macos_arm64,
    macos_x64,
    windows_x64,
    unsupported,

    pub fn assetName(p: Platform) ?[]const u8 {
        return switch (p) {
            .macos_arm64 => "GobanStudio-macOS-arm64.zip",
            .macos_x64 => "GobanStudio-macOS-x64.zip",
            .windows_x64 => "GobanStudio-Windows-x64.zip",
            .unsupported => null,
        };
    }

    pub fn label(p: Platform) []const u8 {
        return switch (p) {
            .macos_arm64 => "macos-arm64",
            .macos_x64 => "macos-x64",
            .windows_x64 => "windows-x64",
            .unsupported => "unsupported",
        };
    }

    /// The executable inside the staged package must be built for this.
    pub fn arch(p: Platform) ?std.Target.Cpu.Arch {
        return switch (p) {
            .macos_arm64 => .aarch64,
            .macos_x64, .windows_x64 => .x86_64,
            .unsupported => null,
        };
    }
};

/// Which package replaces this one. An Intel build running under Rosetta
/// on Apple Silicon is moved to the native arm64 package. Windows on ARM
/// runs the x64 build under emulation (there is no ARM64 KataGo for
/// Windows), so it stays on x64.
pub fn currentPlatform() Platform {
    return switch (builtin.os.tag) {
        .macos => switch (builtin.cpu.arch) {
            .aarch64 => .macos_arm64,
            .x86_64 => if (runningUnderRosetta()) .macos_arm64 else .macos_x64,
            else => .unsupported,
        },
        .windows => switch (builtin.cpu.arch) {
            .x86_64, .aarch64 => .windows_x64,
            else => .unsupported,
        },
        else => .unsupported,
    };
}

pub fn runningUnderRosetta() bool {
    if (comptime builtin.os.tag != .macos) return false;
    var value: c_int = 0;
    var len: usize = @sizeOf(c_int);
    if (std.c.sysctlbyname("sysctl.proc_translated", &value, &len, null, 0) != 0) return false;
    return value == 1;
}

// ------------------------------------------------------------ state

pub const Phase = enum { idle, downloading, verifying, unpacking, ready, installing, failed, cancelled };

pub const WakeFn = update.WakeFn;

pub const path_cap = std.Io.Dir.max_path_bytes;

pub const Snapshot = struct {
    phase: Phase = .idle,
    gen: u64 = 0,
    tag_buf: [64]u8 = undefined,
    tag_len: usize = 0,
    received: u64 = 0,
    total: u64 = 0,
    error_name: []const u8 = "",
    last_activity_ms: i64 = 0,
    /// Times this download was continued on a new connection after the
    /// old one went silent.
    retries: u32 = 0,

    pub fn tag(self: *const Snapshot) []const u8 {
        return self.tag_buf[0..self.tag_len];
    }
};

pub const Installer = struct {
    io: std.Io = undefined,
    lock: std.Io.Mutex = .init,
    platform: Platform = .unsupported,
    note: install_apply.LaunchNote = .{},
    /// Set once before the first download (`setPublicKey`): when present,
    /// SHA256SUMS must carry a valid signature by it.
    public_key: ?[install_verify.Ed25519.PublicKey.encoded_length]u8 = null,
    /// Set once before the first download (`setEnv`): where the proxy
    /// settings are read from (net.zig). Null: always connect directly.
    env: ?*const std.process.Environ.Map = null,
    /// Tests: called instead of starting a download thread.
    spawn_hook: ?*const fn (self: *Installer, job: *Job) void = null,

    // --- guarded by `lock`
    snap: Snapshot = .{},
    cancel_requested: bool = false,
    running: u32 = 0,
    /// Which thread of the current generation is the live one: a stalled
    /// connection is abandoned by starting the next attempt.
    attempt: u64 = 0,
    stall_retries: u32 = 0,
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,
    /// The staging directory for the current generation (`<root>/<token>`).
    job_dir_buf: [path_cap]u8 = undefined,
    job_dir_len: usize = 0,
    /// The verified, unpacked package (`<job>/unpacked/<GobanStudio[.app]>`).
    staged_buf: [path_cap]u8 = undefined,
    staged_len: usize = 0,
    /// The root was emptied once this session (before the first download).
    root_cleaned: bool = false,

    pub fn init(self: *Installer, io: std.Io) void {
        self.* = .{};
        self.io = io;
        self.platform = currentPlatform();
    }

    pub fn setWake(self: *Installer, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    pub fn setPublicKey(self: *Installer, key: ?[install_verify.Ed25519.PublicKey.encoded_length]u8) void {
        self.public_key = key;
    }

    pub fn setEnv(self: *Installer, env: ?*const std.process.Environ.Map) void {
        self.env = env;
    }

    pub fn snapshot(self: *Installer) Snapshot {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.snap;
    }

    pub fn stagedPath(self: *Installer, out: []u8) ?[]const u8 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase != .ready or self.staged_len == 0 or out.len < self.staged_len) return null;
        @memcpy(out[0..self.staged_len], self.staged_buf[0..self.staged_len]);
        return out[0..self.staged_len];
    }

    /// Start downloading `tag` into a fresh directory under `root`. UI thread.
    pub fn start(self: *Installer, root: []const u8, tag: []const u8, now_ms: i64) !u64 {
        if (!install_verify.validTag(tag)) return error.BadTag;
        const asset = self.platform.assetName() orelse return error.Unsupported;
        _ = asset;
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        switch (self.snap.phase) {
            .downloading, .verifying, .unpacking, .installing => return error.Busy,
            else => {},
        }
        // Threads abandoned earlier (stalled sockets) may still be running;
        // they only ever touch their own directory, and never write once
        // they are not the live attempt.
        if (self.running >= max_running) return error.Busy;
        if (!self.root_cleaned and self.running == 0) {
            std.Io.Dir.cwd().deleteTree(self.io, root) catch {};
            self.root_cleaned = true;
        } else if (self.job_dir_len > 0) {
            std.Io.Dir.cwd().deleteTree(self.io, self.job_dir_buf[0..self.job_dir_len]) catch {};
        }
        var token_bytes: [8]u8 = undefined;
        self.io.random(&token_bytes);
        const token = std.fmt.bytesToHex(token_bytes, .lower);
        const job_dir = std.fmt.bufPrint(&self.job_dir_buf, "{s}{c}{s}", .{ root, std.fs.path.sep, &token }) catch return error.NoTempDir;
        self.job_dir_len = job_dir.len;
        std.Io.Dir.cwd().createDirPath(self.io, job_dir) catch return error.Disk;
        self.staged_len = 0;
        self.cancel_requested = false;
        self.snap.gen += 1;
        self.attempt += 1;
        self.stall_retries = 0;
        self.snap.retries = 0;
        self.snap.phase = .downloading;
        self.snap.received = 0;
        self.snap.total = 0;
        self.snap.error_name = "";
        self.snap.last_activity_ms = now_ms;
        @memcpy(self.snap.tag_buf[0..tag.len], tag);
        self.snap.tag_len = tag.len;
        self.spawnLocked() catch |err| {
            self.snap.phase = .failed;
            self.snap.error_name = "Unavailable";
            return err;
        };
        return self.snap.gen;
    }

    /// Lock held: start a thread for the current generation and attempt,
    /// working in the current job directory.
    fn spawnLocked(self: *Installer) !void {
        const job = try std.heap.page_allocator.create(Job);
        job.* = .{ .gen = self.snap.gen, .attempt = self.attempt, .platform = self.platform, .public_key = self.public_key };
        const tag = self.snap.tag();
        @memcpy(job.tag_buf[0..tag.len], tag);
        job.tag_len = tag.len;
        @memcpy(job.dir_buf[0..self.job_dir_len], self.job_dir_buf[0..self.job_dir_len]);
        job.dir_len = self.job_dir_len;
        if (self.spawn_hook) |hook| {
            hook(self, job);
        } else {
            const thread = std.Thread.spawn(.{ .stack_size = 16 * 1024 * 1024 }, run, .{ self, job }) catch |err| {
                std.heap.page_allocator.destroy(job);
                return err;
            };
            thread.detach();
        }
        self.running += 1;
    }

    /// Stop the download, or discard a staged update. UI thread.
    pub fn cancel(self: *Installer) Phase {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        switch (self.snap.phase) {
            .downloading, .verifying, .unpacking => {
                // The thread notices at its next chunk and removes its
                // directory; the page is answered now.
                self.cancel_requested = true;
                self.snap.gen += 1;
                self.snap.phase = .cancelled;
                self.snap.error_name = "Cancelled";
                self.job_dir_len = 0;
            },
            .ready, .failed, .cancelled => {
                if (self.job_dir_len > 0) std.Io.Dir.cwd().deleteTree(self.io, self.job_dir_buf[0..self.job_dir_len]) catch {};
                self.job_dir_len = 0;
                self.staged_len = 0;
                self.snap.phase = .idle;
                self.snap.error_name = "";
            },
            .idle, .installing => {},
        }
        return self.snap.phase;
    }

    /// The UI thread's watchdog. A download without a byte for
    /// `stall_timeout_ms` is stuck on a dead connection: its thread is
    /// abandoned and a new one continues from the bytes on disk. After
    /// `max_stall_retries` of those the download fails as `Stalled` (true).
    pub fn checkStall(self: *Installer, now_ms: i64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase != .downloading) return false;
        if (now_ms - self.snap.last_activity_ms < stall_timeout_ms) return false;
        if (self.stall_retries < max_stall_retries and self.running < max_running and self.job_dir_len > 0) {
            const previous = self.attempt;
            self.attempt += 1;
            if (self.spawnLocked()) |_| {
                self.stall_retries += 1;
                self.snap.retries = self.stall_retries;
                self.snap.last_activity_ms = now_ms;
                return false;
            } else |_| {
                self.attempt = previous;
            }
        }
        self.cancel_requested = true;
        self.snap.gen += 1;
        self.snap.phase = .failed;
        self.snap.error_name = "Stalled";
        self.job_dir_len = 0;
        return true;
    }

    pub fn markInstalling(self: *Installer) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.snap.phase = .installing;
    }

    pub fn markApplyFailed(self: *Installer, name: []const u8) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase == .installing) self.snap.phase = .ready;
        self.snap.error_name = name;
    }

    // -------------------------------------------------- download thread

    pub const Job = struct {
        gen: u64,
        attempt: u64 = 0,
        platform: Platform,
        public_key: ?[install_verify.Ed25519.PublicKey.encoded_length]u8 = null,
        tag_buf: [64]u8 = undefined,
        tag_len: usize = 0,
        dir_buf: [path_cap]u8 = undefined,
        dir_len: usize = 0,

        fn tag(self: *const Job) []const u8 {
            return self.tag_buf[0..self.tag_len];
        }
        fn dir(self: *const Job) []const u8 {
            return self.dir_buf[0..self.dir_len];
        }
    };

    /// Lock held: is `job` the thread the UI is waiting for?
    fn liveLocked(self: *Installer, job: *const Job) bool {
        return self.snap.gen == job.gen and self.attempt == job.attempt and !self.cancel_requested;
    }

    fn current(self: *Installer, job: *const Job) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.liveLocked(job);
    }

    fn setPhase(self: *Installer, job: *const Job, phase: Phase) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.liveLocked(job)) self.snap.phase = phase;
    }

    /// Note that bytes arrived (the stall watchdog reads the time); with
    /// `report` also how many, for the page. False: `job` is not live.
    fn progress(self: *Installer, job: *const Job, report: bool, received: u64, total: u64) bool {
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.liveLocked(job)) return false;
        if (report) {
            self.snap.received = received;
            self.snap.total = total;
        }
        self.snap.last_activity_ms = now;
        return true;
    }

    fn finish(self: *Installer, job: *Job, outcome: anyerror!void, staged: []const u8) void {
        self.lock.lockUncancelable(self.io);
        self.running -= 1;
        const same_gen = self.snap.gen == job.gen and !self.cancel_requested;
        const wanted = same_gen and self.attempt == job.attempt;
        // Replaced by a later attempt of the same download, which works in
        // the same directory: this thread leaves everything as it is.
        const superseded = same_gen and !wanted;
        if (wanted) {
            if (outcome) |_| {
                @memcpy(self.staged_buf[0..staged.len], staged);
                self.staged_len = staged.len;
                self.snap.phase = .ready;
                self.snap.error_name = "";
            } else |err| {
                self.snap.phase = .failed;
                self.snap.error_name = install_apply.errorName(err);
            }
        }
        const wake_fn = self.wake_fn;
        const wake_context = self.wake_context;
        self.lock.unlock(self.io);
        // Cancelled, abandoned or failed: nothing in the directory is kept.
        const failed = if (outcome) |_| false else |_| true;
        if (!superseded and (!wanted or failed)) std.Io.Dir.cwd().deleteTree(self.io, job.dir()) catch {};
        std.heap.page_allocator.destroy(job);
        if (wanted) {
            if (wake_fn) |f| f(wake_context) catch {};
        }
    }

    fn run(self: *Installer, job: *Job) void {
        var staged_buf: [path_cap]u8 = undefined;
        var staged: []const u8 = "";
        const outcome = self.work(job, &staged_buf, &staged);
        self.finish(job, outcome, staged);
    }

    fn work(self: *Installer, job: *Job, staged_buf: []u8, staged: *[]const u8) !void {
        const io = self.io;
        const asset = job.platform.assetName() orelse return error.Unsupported;
        // Through the proxy the environment or the system names, if any.
        var session: net.Session = undefined;
        session.init(std.heap.page_allocator, io, self.env, "github.com");
        defer session.deinit();

        var url_buf: [512]u8 = undefined;
        var path_buf: [path_cap]u8 = undefined;

        // SHA256SUMS first: small, and a release without it is refused
        // before the large download starts.
        const sums_url = try install_verify.downloadUrl(&url_buf, job.tag(), install_verify.sums_name);
        const sums_path = std.fmt.bufPrint(&path_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, install_verify.sums_name }) catch return error.Disk;
        try self.fetchFile(&session, job, sums_url, sums_path, max_sums_bytes, false, false);
        var sums_text_buf: [max_sums_bytes]u8 = undefined;
        const sums_text = install_package.readHead(io, sums_path, &sums_text_buf) orelse return error.Disk;
        // Signed builds: the sums must be signed by the build's key before
        // anything in them is believed (and before the large download).
        if (job.public_key) |key| {
            var sig_path_buf: [path_cap]u8 = undefined;
            const sig_url = try install_verify.downloadUrl(&url_buf, job.tag(), install_verify.sig_name);
            const sig_path = std.fmt.bufPrint(&sig_path_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, install_verify.sig_name }) catch return error.Disk;
            self.fetchFile(&session, job, sig_url, sig_path, max_sig_bytes, false, false) catch |err| switch (err) {
                error.NoAsset => return error.NoSignature,
                else => return err,
            };
            var sig_text_buf: [max_sig_bytes]u8 = undefined;
            const sig_text = install_package.readHead(io, sig_path, &sig_text_buf) orelse return error.Disk;
            try install_verify.verifySums(sums_text, sig_text, key);
        }
        // The (signed) sums must be the ones of the tag being installed.
        try install_verify.checkBinding(sums_text, job.tag(), job.public_key != null);
        const expected = install_verify.findSum(sums_text, asset) orelse return error.NoChecksum;

        // The package. A thread that takes over a stalled download finds
        // the file and continues it.
        const asset_url = try install_verify.downloadUrl(&url_buf, job.tag(), asset);
        var zip_buf: [path_cap]u8 = undefined;
        const zip_path = std.fmt.bufPrint(&zip_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, asset }) catch return error.Disk;
        try self.fetchFile(&session, job, asset_url, zip_path, max_asset_bytes, true, true);

        self.setPhase(job, .verifying);
        if (!self.current(job)) return error.Cancelled;
        // Hashed from disk: what gets unpacked is what was verified,
        // however many connections its bytes arrived on.
        const on_disk = install_verify.hashFile(io, zip_path) catch return error.Disk;
        if (!install_verify.sumsMatch(expected, on_disk)) return error.ChecksumMismatch;

        self.setPhase(job, .unpacking);
        if (!self.current(job)) return error.Cancelled;
        var unpack_buf: [path_cap]u8 = undefined;
        const unpacked = std.fmt.bufPrint(&unpack_buf, "{s}{c}unpacked", .{ job.dir(), std.fs.path.sep }) catch return error.Disk;
        // A second attempt starts from a clean tree.
        std.Io.Dir.cwd().deleteTree(io, unpacked) catch {};
        try install_package.unpack(io, job.platform, zip_path, unpacked);
        var staged_root: []const u8 = "";
        for (install_package.stagedRootNames(job.platform)) |root_name| {
            const candidate = std.fmt.bufPrint(staged_buf, "{s}{c}{s}", .{ unpacked, std.fs.path.sep, root_name }) catch return error.Disk;
            if (install_package.fileExists(io, candidate)) {
                staged_root = candidate;
                break;
            }
        }
        if (staged_root.len == 0) return error.BadPackage;
        if (!install_package.checkStaged(io, job.platform, staged_root)) return error.BadPackage;
        // The package itself must say it is the version that was asked for.
        if (!install_package.stagedVersionMatches(io, job.platform, staged_root, job.tag())) return error.VersionMismatch;
        if (builtin.os.tag == .macos) {
            if (!install_package.runTool(io, &.{ "/usr/bin/codesign", "--verify", "--deep", "--strict", staged_root })) return error.BadPackage;
        }
        // The zip is no longer needed; the staged tree is.
        std.Io.Dir.deleteFileAbsolute(io, zip_path) catch {};
        if (!self.current(job)) return error.Cancelled;
        staged.* = staged_root;
    }

    /// Where a download's bytes go: a file only the live attempt writes.
    const FileSink = struct {
        installer: *Installer,
        job: *const Job,
        file: std.Io.File,
        report: bool,
        /// Bytes on disk so far.
        stored: u64 = 0,

        fn sinkWrite(context: *anyopaque, bytes: []const u8, offset: u64) anyerror!void {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            const self = ctx.installer;
            self.lock.lockUncancelable(self.io);
            defer self.lock.unlock(self.io);
            if (!self.liveLocked(ctx.job)) return error.Cancelled;
            ctx.file.writePositionalAll(self.io, bytes, offset) catch return error.Disk;
            ctx.stored = offset + bytes.len;
        }

        fn sinkRestart(context: *anyopaque) anyerror!void {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            const self = ctx.installer;
            self.lock.lockUncancelable(self.io);
            defer self.lock.unlock(self.io);
            if (!self.liveLocked(ctx.job)) return error.Cancelled;
            ctx.file.setLength(self.io, 0) catch return error.Disk;
            ctx.stored = 0;
        }

        fn sinkProgress(context: *anyopaque, received: u64, total: u64) bool {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            return ctx.installer.progress(ctx.job, ctx.report, received, total);
        }

        fn sink(ctx: *FileSink) net.Sink {
            return .{ .context = ctx, .write = sinkWrite, .restart = sinkRestart, .progress = sinkProgress };
        }
    };

    /// Sleep `ms` before a retry, in short steps. False: no longer live.
    fn waitRetry(self: *Installer, job: *const Job, ms: i64) bool {
        var left = ms;
        while (left > 0) : (left -= 250) {
            if (!self.current(job)) return false;
            std.Io.sleep(self.io, .fromMilliseconds(250), .awake) catch {};
        }
        return self.current(job);
    }

    /// GET `url` (one of this repository's release downloads) into
    /// `out_path`, following redirects only to GitHub's download hosts.
    /// With `resume_existing` a file already there is continued with a
    /// Range request. A connection that breaks off is retried
    /// (`max_network_retries` times in a row without a byte), each time
    /// asking only for the rest.
    fn fetchFile(
        self: *Installer,
        session: *net.Session,
        job: *const Job,
        url: []const u8,
        out_path: []const u8,
        max_bytes: u64,
        report: bool,
        resume_existing: bool,
    ) !void {
        if (!install_verify.validDownloadUrl(url)) return error.BadTag;
        const io = self.io;
        // Only the live attempt opens (and may empty) the file.
        const file = blk: {
            self.lock.lockUncancelable(io);
            defer self.lock.unlock(io);
            if (!self.liveLocked(job)) return error.Cancelled;
            break :blk std.Io.Dir.createFileAbsolute(io, out_path, .{ .read = true, .truncate = !resume_existing }) catch return error.Disk;
        };
        defer file.close(io);
        var ctx: FileSink = .{ .installer = self, .job = job, .file = file, .report = report };
        var offset: u64 = if (resume_existing) (file.length(io) catch 0) else 0;
        if (offset > max_bytes) {
            try FileSink.sinkRestart(&ctx);
            offset = 0;
        }
        const chunk = std.heap.page_allocator.alloc(u8, 64 * 1024) catch return error.OutOfMemory;
        defer std.heap.page_allocator.free(chunk);
        var failures: u32 = 0;
        var requests: u32 = 0;
        while (true) {
            ctx.stored = offset;
            requests += 1;
            _ = net.fetch(session, .{
                .url = url,
                .user_agent = user_agent,
                .offset = offset,
                .max_bytes = max_bytes,
            }, ctx.sink(), chunk) catch |err| switch (err) {
                error.Network => {
                    // What arrived is on disk; ask for the rest.
                    failures = nextFailureCount(failures, ctx.stored > offset);
                    if (failures > max_network_retries or requests > 64) return error.Network;
                    offset = ctx.stored;
                    if (!self.waitRetry(job, net.retryDelayMs(failures))) return error.Cancelled;
                    continue;
                },
                else => return err,
            };
            return;
        }
    }
};

/// Broken connections in a row that brought nothing: one that did bring
/// bytes starts the count again.
pub fn nextFailureCount(failures: u32, made_progress: bool) u32 {
    return if (made_progress) 1 else failures + 1;
}

// ------------------------------------------------------------ tests

const testing = std.testing;

const TestSpawn = struct {
    var jobs: [8]*Installer.Job = undefined;
    var count: usize = 0;

    fn hook(self: *Installer, job: *Installer.Job) void {
        _ = self;
        jobs[count] = job;
        count += 1;
    }
};

test "a stalled download continues on a new connection, a few times, then fails" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const root = try install_package.testTempDir(io, &tmp, &dir_buf);

    const inst = try testing.allocator.create(Installer);
    defer testing.allocator.destroy(inst);
    inst.init(io);
    inst.platform = .windows_x64;
    inst.spawn_hook = TestSpawn.hook;
    TestSpawn.count = 0;

    const gen = try inst.start(root, "v14.0.0", 1_000);
    try testing.expectEqual(@as(usize, 1), TestSpawn.count);
    const first = TestSpawn.jobs[0];
    try testing.expect(inst.current(first));
    // Bytes arrive: no stall.
    try testing.expect(inst.progress(first, true, 500, 1000));
    const t0 = inst.snapshot().last_activity_ms;
    try testing.expect(!inst.checkStall(t0 + stall_timeout_ms - 1));
    try testing.expectEqual(@as(usize, 1), TestSpawn.count);

    // Silence: the first thread is replaced, the download goes on.
    try testing.expect(!inst.checkStall(t0 + stall_timeout_ms));
    try testing.expectEqual(@as(usize, 2), TestSpawn.count);
    const second = TestSpawn.jobs[1];
    var snap = inst.snapshot();
    try testing.expectEqual(Phase.downloading, snap.phase);
    try testing.expectEqual(gen, snap.gen);
    try testing.expectEqual(@as(u32, 1), snap.retries);
    try testing.expectEqual(@as(u64, 500), snap.received);
    try testing.expect(!inst.current(first));
    try testing.expect(inst.current(second));
    // Same directory: the new thread finds the partial file.
    try testing.expectEqualStrings(first.dir(), second.dir());
    // The abandoned thread wakes up: it may not report or write, and when
    // it ends it leaves the directory and the state alone.
    try testing.expect(!inst.progress(first, true, 600, 1000));
    try testing.expectEqual(@as(u64, 500), inst.snapshot().received);
    inst.finish(first, error.Cancelled, "");
    try testing.expect(install_package.fileExists(io, second.dir()));
    try testing.expectEqual(Phase.downloading, inst.snapshot().phase);

    // The watchdog starts counting again from the takeover.
    const t1 = inst.snapshot().last_activity_ms;
    try testing.expect(!inst.checkStall(t1 + stall_timeout_ms - 1));
    var now = t1;
    var n: u32 = 1;
    while (n < max_stall_retries) : (n += 1) {
        now += stall_timeout_ms;
        try testing.expect(!inst.checkStall(now));
        inst.finish(TestSpawn.jobs[TestSpawn.count - 2], error.Cancelled, "");
    }
    try testing.expectEqual(@as(usize, 1 + max_stall_retries), TestSpawn.count);
    try testing.expectEqual(max_stall_retries, inst.snapshot().retries);
    // Out of retries.
    now += stall_timeout_ms;
    try testing.expect(inst.checkStall(now));
    snap = inst.snapshot();
    try testing.expectEqual(Phase.failed, snap.phase);
    try testing.expectEqualStrings("Stalled", snap.error_name);
    // The last thread ends: nothing of the failed download is kept.
    const last = TestSpawn.jobs[TestSpawn.count - 1];
    var last_dir_buf: [path_cap]u8 = undefined;
    const last_dir = try std.fmt.bufPrint(&last_dir_buf, "{s}", .{last.dir()});
    inst.finish(last, error.Cancelled, "");
    try testing.expect(!install_package.fileExists(io, last_dir));
    try testing.expectEqual(@as(u32, 0), inst.running);

    // Broken connections: bytes that arrived reset the count.
    try testing.expectEqual(@as(u32, 1), nextFailureCount(0, false));
    try testing.expectEqual(@as(u32, 3), nextFailureCount(2, false));
    try testing.expectEqual(@as(u32, 1), nextFailureCount(3, true));
    try testing.expect(install_apply.helper_start_timeout_ms >= 20_000);
}

test "live (GOBAN_NET_LIVE=package): a published package is downloaded, verified, unpacked and checked" {
    // Needs the network and about 16 MB: `GOBAN_NET_LIVE=package zig build
    // test …`. The Windows package of a published release goes through the
    // same thread the app runs (std.zip unpacks it on any system), through
    // the environment's proxy when there is one.
    var env = try testing.environ.createMap(testing.allocator);
    defer env.deinit();
    if (!std.mem.eql(u8, env.get("GOBAN_NET_LIVE") orelse "", "package")) return error.SkipZigTest;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const base = try install_package.testTempDir(io, &tmp, &dir_buf);
    var root_buf: [path_cap]u8 = undefined;
    const root = try std.fmt.bufPrint(&root_buf, "{s}{c}{s}", .{ base, std.fs.path.sep, install_apply.staging_dir_name });

    const inst = try testing.allocator.create(Installer);
    defer testing.allocator.destroy(inst);
    inst.init(io);
    inst.platform = .windows_x64;
    inst.setEnv(&env);
    const tag = "v13.0.0";
    const now = struct {
        fn ms(clock_io: std.Io) i64 {
            return std.Io.Timestamp.now(clock_io, .awake).toMilliseconds();
        }
    }.ms;
    _ = try inst.start(root, tag, now(io));
    const deadline = now(io) + 15 * 60 * 1000;
    var last_report: i64 = 0;
    while (true) {
        _ = inst.checkStall(now(io));
        const snap = inst.snapshot();
        if (snap.phase == .ready or snap.phase == .failed or snap.phase == .cancelled) break;
        if (now(io) - last_report > 5000) {
            last_report = now(io);
            std.debug.print("live: {s} {d} of {d} bytes, {d} retries\n", .{ @tagName(snap.phase), snap.received, snap.total, snap.retries });
        }
        try testing.expect(now(io) < deadline);
        std.Io.sleep(io, .fromMilliseconds(200), .awake) catch {};
    }
    const snap = inst.snapshot();
    std.debug.print("live: {s} {s}\n", .{ @tagName(snap.phase), snap.error_name });
    try testing.expectEqual(Phase.ready, snap.phase);
    try testing.expect(snap.received == snap.total and snap.total > 10 * 1024 * 1024);
    var staged_buf: [path_cap]u8 = undefined;
    const staged = inst.stagedPath(&staged_buf).?;
    try testing.expect(install_package.checkStaged(io, .windows_x64, staged));
    try testing.expect(install_package.stagedVersionMatches(io, .windows_x64, staged, tag));
    // The same package offered as a later release is not that release.
    try testing.expect(!install_package.stagedVersionMatches(io, .windows_x64, staged, "v99.0.0"));
    try testing.expectEqual(Phase.idle, inst.cancel());
    try testing.expect(!install_package.fileExists(io, staged));
}
