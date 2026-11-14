//! KataGo sidecar for every board size.
//!
//! The web layer owns the game; this module owns the persistent KataGo GTP
//! processes. One way in, the `Worker` (v3): a dedicated thread owns the
//! GTP conversation. The UI thread hands it a structured position
//! (`Request`), the worker brings KataGo's board there incrementally
//! (undo/play from the last position it sent), searches with
//! `kata-search_analyze_cancellable`, and queues partial reports and the
//! final result for the UI thread to collect after a platform wake.
//! Nothing here touches the webview or the runtime. (v13 removed the v2
//! synchronous path, a GTP script from the page run on the UI thread: the
//! page has used the worker since v3, and the script path could block the
//! window for a whole search.)
//!
//! v13 watchdog: KataGo is a separate program and can hang (a stuck GPU
//! driver, a network that never finishes loading, a pipe that stops). The
//! worker gives every request a deadline (`deadlineMs`): its own `maxTime`
//! plus a grace, much longer when the process still has to start and load
//! its network. The UI thread's drain calls `Worker.checkDeadline`; past
//! the deadline the process is killed. The worker's blocked read then ends,
//! the request fails with `Timeout` through the ordinary failure path
//! (process discarded, the next request starts a fresh one), and the page
//! falls back to its offline engine.
//!
//! v5: up to three KataGo processes, one per `Slot`, all driven by the same
//! worker thread (the page runs one search at a time anyway):
//!
//!   * `standard`  the shipped b6c96 network: the opponent ladder (its
//!                 labels are measured with this network) and the fallback
//!                 for everything else;
//!   * `strong`    the optional larger network (models.zig), started on
//!                 first use: analysis, review, hints and the top level;
//!   * `human`     the optional human SL model (`-human-model`, with the
//!                 b6c96 network for the short search that decides passes),
//!                 started only when a human-style game asks for a move.
//!
//! The optional networks live in the app's data directory; their paths are
//! fixed at start-up and a process is only started when its file exists.
//!
//! A missing or unusable engine is not fatal: the bridge returns an error
//! and the page falls back to its local opponent.
//!
//! The code is in three files: this one (the slots and one KataGo
//! process), engine_request.zig (what a request and its result are) and
//! engine_worker.zig (the worker thread and its watchdog).
const std = @import("std");
const builtin = @import("builtin");
const engine_build = @import("engine_build.zig");
const engine_request = @import("engine_request.zig");
const engine_worker = @import("engine_worker.zig");

/// Development builds also look for the engine relative to the current
/// directory (the checkout); a released app never runs whatever binary
/// happens to sit in the folder it was started from.
const dev_paths = builtin.mode == .Debug;

const bin_name = if (@import("builtin").os.tag == .windows) "katago.exe" else "katago";

/// Which KataGo process serves a request.
pub const Slot = enum(u2) {
    standard = 0,
    strong = 1,
    human = 2,

    pub fn parse(text: []const u8) ?Slot {
        inline for (.{ "standard", "strong", "human" }, 0..) |name, i| {
            if (std.mem.eql(u8, text, name)) return @enumFromInt(i);
        }
        return null;
    }
};
pub const slot_count = 3;

/// Which executable the slots start, shared by them (engine_build.zig):
/// whether this machine can run the faster build, and whether it already
/// failed to start this session (then every slot uses the plain one).
pub const BuildState = struct {
    capable: bool = false,
    failed: std.atomic.Value(bool) = .init(false),

    pub fn detect() BuildState {
        return .{ .capable = engine_build.hostCapable() };
    }
};

/// How the human SL model picks its move (see engine/model/human.cfg):
/// `raw` follows the human policy of the profile at one network
/// evaluation (KataGo's gtp_human5k_example.cfg); `search` keeps the
/// human style but lets a search veto losing moves (KataGo's
/// gtp_human9d_search_example.cfg), for ranks the raw policy cannot reach.
pub const HumanStyle = enum(u1) { raw = 0, search = 1 };

const StyleParam = struct { name: []const u8, raw: []const u8, search: []const u8 };
pub const style_params = [_]StyleParam{
    .{ .name = "humanSLChosenMovePiklLambda", .raw = "100000000", .search = "0.08" },
    .{ .name = "humanSLRootExploreProbWeightless", .raw = "0.0", .search = "0.8" },
    .{ .name = "humanSLCpuctPermanent", .raw = "0.2", .search = "2.0" },
    .{ .name = "chosenMoveTemperatureEarly", .raw = "0.85", .search = "0.70" },
    .{ .name = "chosenMoveTemperature", .raw = "0.70", .search = "0.25" },
    .{ .name = "chosenMoveTemperatureHalflife", .raw = "80", .search = "30" },
    .{ .name = "chosenMoveTemperatureOnlyBelowProb", .raw = "0.01", .search = "1.0" },
    .{ .name = "staticScoreUtilityFactor", .raw = "0.30", .search = "0.5" },
    .{ .name = "dynamicScoreUtilityFactor", .raw = "0.0", .search = "0.5" },
};

pub const max_profile = 16;

/// A human SL profile KataGo knows: `rank_` or `preaz_` and 20k…1k or
/// 1d…9d. Anything else never reaches KataGo.
pub fn validProfile(text: []const u8) bool {
    const rest = if (std.mem.startsWith(u8, text, "rank_"))
        text[5..]
    else if (std.mem.startsWith(u8, text, "preaz_"))
        text[6..]
    else
        return false;
    if (rest.len < 2 or rest.len > 3) return false;
    if (rest[0] == '0') return false;
    const unit = rest[rest.len - 1];
    const n = std.fmt.parseInt(u8, rest[0 .. rest.len - 1], 10) catch return false;
    return switch (unit) {
        'k' => n >= 1 and n <= 20,
        'd' => n >= 1 and n <= 9,
        else => false,
    };
}

pub const Engine = struct {
    io: std.Io = undefined,
    slot: Slot = .standard,
    /// The downloaded network this slot needs (strong: `-model`, human:
    /// `-human-model`); empty for the standard slot.
    extra_model: [std.Io.Dir.max_path_bytes]u8 = undefined,
    extra_model_len: usize = 0,
    env_map: *std.process.Environ.Map = undefined,
    child: ?std.process.Child = null,
    /// Shared with the other slots (Worker.build); null: plain build only.
    build: ?*BuildState = null,
    /// The faster build's file name beside the plain one (a test sets its own).
    preferred_name: ?[]const u8 = engine_build.preferred_name,
    /// The process running now is the faster build (engine_build.zig).
    running_preferred: bool = false,
    /// The watchdog killed the current process (under `write_lock`).
    killed: bool = false,
    /// The running process, for the watchdog's kill from the UI thread.
    /// Set and cleared under `write_lock`, and cleared before the child is
    /// reaped, so the handle (pid / process HANDLE) is still valid
    /// whenever it is visible here.
    kill_id: ?std.process.Child.Id = null,
    stdin: ?std.Io.File = null,
    stdout: ?std.Io.File = null,
    reader: std.Io.File.Reader = undefined,
    reader_ready: bool = false,
    /// Bumped every time a new KataGo process starts: a position cached for
    /// an older process is meaningless.
    generation: u32 = 0,
    /// Serialises writes to KataGo's stdin between the worker thread and a
    /// cancel coming from the UI thread (see `Worker.lock`).
    write_lock: ?*std.Io.Mutex = null,
    read_buf: [256 * 1024]u8 = undefined,
    exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    bin_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    preferred_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    model_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    config_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    version_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    human_config_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    info_buf: [256 * 1024]u8 = undefined,
    info_len: usize = 0,
    play_buf: [16]u8 = undefined,
    play_len: usize = 0,

    pub fn init(self: *@This(), io: std.Io, env_map: *std.process.Environ.Map) void {
        self.io = io;
        self.env_map = env_map;
    }

    pub fn deinit(self: *@This(), io: std.Io) void {
        // `stdin` is also read by the UI thread (cancel newline) under
        // `write_lock`; retract it before the process goes away.
        self.setStdin(null);
        self.setKillId(null);
        if (self.child) |*child| {
            // std's kill sends SIGTERM and then waits; a KataGo that does not
            // exit on SIGTERM (it may still be blocked reading our stdin)
            // would block the caller forever. SIGKILL cannot be caught, so
            // the wait that follows only reaps. Windows terminates outright.
            if (comptime @import("builtin").os.tag != .windows) {
                if (child.id) |pid| std.posix.kill(pid, std.posix.SIG.KILL) catch {};
            }
            child.kill(io);
            self.child = null;
        }
        self.stdout = null;
        self.reader_ready = false;
    }

    fn setKillId(self: *@This(), id: ?std.process.Child.Id) void {
        if (self.write_lock) |lock| {
            lock.lockUncancelable(self.io);
            defer lock.unlock(self.io);
            self.kill_id = id;
        } else {
            self.kill_id = id;
        }
    }

    /// Kill the process without waiting for it (the watchdog, UI thread).
    /// Caller holds `write_lock`. The worker, blocked reading its output,
    /// sees the end of the stream and reaps it.
    pub fn killUnlocked(self: *@This()) void {
        const id = self.kill_id orelse return;
        self.killed = true;
        switch (builtin.os.tag) {
            .windows => _ = std.os.windows.ntdll.NtTerminateProcess(id, @enumFromInt(1)),
            .wasi => {},
            else => std.posix.kill(id, std.posix.SIG.KILL) catch {},
        }
    }

    fn setStdin(self: *@This(), file: ?std.Io.File) void {
        if (self.write_lock) |lock| {
            lock.lockUncancelable(self.io);
            defer lock.unlock(self.io);
            self.stdin = file;
        } else {
            self.stdin = file;
        }
    }

    const Paths = struct {
        binary: []const u8,
        /// The faster build beside it, when the package has one.
        preferred: ?[]const u8 = null,
        model: []const u8,
        config: []const u8,
        version: []const u8,
        human_config: []const u8,
    };

    /// Set the slot and its downloaded network before the worker starts.
    pub fn setSlot(self: *@This(), slot: Slot, extra_model: []const u8) void {
        self.slot = slot;
        const n = @min(extra_model.len, self.extra_model.len);
        @memcpy(self.extra_model[0..n], extra_model[0..n]);
        self.extra_model_len = if (n == extra_model.len) n else 0;
    }

    pub fn extraModel(self: *const @This()) []const u8 {
        return self.extra_model[0..self.extra_model_len];
    }

    fn exists(io: std.Io, path: []const u8) bool {
        var file = std.Io.Dir.openFileAbsolute(io, path, .{}) catch return false;
        file.close(io);
        return true;
    }

    fn join(buf: []u8, parts: []const []const u8) ?[]const u8 {
        var n: usize = 0;
        for (parts, 0..) |part, index| {
            if (index > 0) {
                if (n >= buf.len) return null;
                buf[n] = std.fs.path.sep;
                n += 1;
            }
            if (n + part.len > buf.len) return null;
            @memcpy(buf[n..][0..part.len], part);
            n += part.len;
        }
        return buf[0..n];
    }

    /// Try the packaged layout first, then the development tree, then an
    /// explicit environment override. Each candidate is a complete engine
    /// root (binary + model + config), so a half-copied release cannot be
    /// mistaken for a working one.
    pub fn paths(self: *@This()) ?Paths {
        var root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var bin_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var preferred_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var model_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var cfg_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var version_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var human_cfg_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var abs_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        var cwd_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const platform = @tagName(@import("builtin").os.tag);
        const cwd_len = std.process.currentPath(self.io, &cwd_buf) catch 0;

        var candidates: [8][]const u8 = undefined;
        var count: usize = 0;
        if (self.env_map.get("GOBAN_KATAGO_DIR")) |dir| {
            candidates[count] = dir;
            count += 1;
        }
        const exe_len = std.process.executablePath(self.io, &self.exe_buf) catch 0;
        if (exe_len > 0) {
            if (std.fs.path.dirname(self.exe_buf[0..exe_len])) |exe_dir| {
                const up = std.fs.path.dirname(exe_dir) orelse exe_dir;
                if (join(&root_buf, &.{ up, "Resources", "frontend", "dist", "engine" })) |p| {
                    candidates[count] = p;
                    count += 1;
                }
                var root2_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
                if (join(&root2_buf, &.{ up, "resources", "frontend", "dist", "engine" })) |p| {
                    candidates[count] = p;
                    count += 1;
                }
            }
        }
        if (dev_paths) {
            candidates[count] = "frontend/dist/engine";
            count += 1;
            candidates[count] = "engine";
            count += 1;
        }

        for (candidates[0..count]) |root| {
            const abs_root = if (std.fs.path.isAbsolute(root)) root else if (dev_paths and cwd_len > 0)
                (join(&abs_buf, &.{ cwd_buf[0..cwd_len], root }) orelse continue)
            else
                continue;
            const bin = join(&bin_buf, &.{ abs_root, platform, bin_name }) orelse continue;
            const model = join(&model_buf, &.{ abs_root, "model", "model.txt.gz" }) orelse continue;
            const config = join(&cfg_buf, &.{ abs_root, "model", "gtp.cfg" }) orelse continue;
            const version = join(&version_buf, &.{ abs_root, "model", "version.txt" }) orelse continue;
            const human_config = join(&human_cfg_buf, &.{ abs_root, "model", "human.cfg" }) orelse continue;
            if (!exists(self.io, bin)) continue;
            if (!exists(self.io, model)) continue;
            if (!exists(self.io, config)) continue;
            @memcpy(self.bin_path[0..bin.len], bin);
            var preferred: ?[]const u8 = null;
            if (self.preferred_name) |name| {
                if (join(&preferred_buf, &.{ abs_root, platform, name })) |fast| {
                    if (exists(self.io, fast)) {
                        @memcpy(self.preferred_path[0..fast.len], fast);
                        preferred = self.preferred_path[0..fast.len];
                    }
                }
            }
            @memcpy(self.model_path[0..model.len], model);
            @memcpy(self.config_path[0..config.len], config);
            @memcpy(self.version_path[0..version.len], version);
            @memcpy(self.human_config_path[0..human_config.len], human_config);
            return .{
                .binary = self.bin_path[0..bin.len],
                .preferred = preferred,
                .model = self.model_path[0..model.len],
                .config = self.config_path[0..config.len],
                .version = if (exists(self.io, version)) self.version_path[0..version.len] else "KataGo",
                .human_config = self.human_config_path[0..human_config.len],
            };
        }
        return null;
    }

    pub fn available(self: *@This()) bool {
        return self.paths() != null;
    }

    pub fn versionText(self: *@This(), output: []u8) []const u8 {
        const resolved = self.paths() orelse return "KataGo 19x19";
        var file = std.Io.Dir.openFileAbsolute(self.io, resolved.version, .{}) catch return "KataGo 19x19";
        defer file.close(self.io);
        const n = file.readPositionalAll(self.io, output, 0) catch return "KataGo 19x19";
        const text = std.mem.trim(u8, output[0..n], " \t\r\n");
        return if (text.len == 0) "KataGo 19x19" else text;
    }

    pub fn start(self: *@This()) !void {
        if (self.child != null) return;
        const resolved = self.paths() orelse return error.EngineMissing;

        var override_buf: [std.Io.Dir.max_path_bytes + 512]u8 = undefined;
        const override = overrideConfig(self.env_map, &override_buf) orelse return error.EngineMissing;

        // Only fixed arguments and paths the host resolved itself: the page
        // chooses a slot, never a file.
        const extra = self.extraModel();
        if (self.slot != .standard and (extra.len == 0 or !exists(self.io, extra))) return error.ModelMissing;
        if (self.slot == .human and !exists(self.io, resolved.human_config)) return error.EngineMissing;

        // v15: the faster build first, when this machine can run it
        // (engine_build.zig). It must answer one GTP command, which it does
        // only once its backend is up and the network loaded; if it does
        // not, every slot uses the plain build from now on.
        if (self.build) |build| {
            const choice = engine_build.choose(resolved.preferred != null, build.capable, build.failed.load(.acquire));
            if (choice == .preferred) {
                if (self.spawn(resolved.preferred.?, &resolved, extra, override)) |_| {
                    if (self.command("name")) |_| {
                        self.running_preferred = true;
                        return;
                    } else |err| {
                        try self.preferredFailed(err);
                    }
                } else |err| {
                    try self.preferredFailed(err);
                }
            }
        }
        try self.spawn(resolved.binary, &resolved, extra, override);
        self.running_preferred = false;
    }

    /// The faster build did not start: remember it for every slot, and go
    /// on with the plain build, unless the watchdog killed it (the request
    /// has used up its time; it is answered Timeout, and the next one
    /// starts the plain build).
    fn preferredFailed(self: *@This(), err: anyerror) !void {
        var killed = false;
        if (self.write_lock) |lock| {
            lock.lockUncancelable(self.io);
            killed = self.killed;
            lock.unlock(self.io);
        } else killed = self.killed;
        self.deinit(self.io);
        if (self.build) |build| build.failed.store(true, .release);
        if (killed) return err;
    }

    fn spawn(self: *@This(), binary: []const u8, resolved: *const Paths, extra: []const u8, override: []const u8) !void {
        const standard_argv = [_][]const u8{ binary, "gtp", "-model", resolved.model, "-config", resolved.config, "-override-config", override };
        const strong_argv = [_][]const u8{ binary, "gtp", "-model", extra, "-config", resolved.config, "-override-config", override };
        const human_argv = [_][]const u8{ binary, "gtp", "-model", resolved.model, "-human-model", extra, "-config", resolved.human_config, "-override-config", override };
        var child = try std.process.spawn(self.io, .{
            .argv = switch (self.slot) {
                .standard => &standard_argv,
                .strong => &strong_argv,
                .human => &human_argv,
            },
            .stdin = .pipe,
            .stdout = .pipe,
            .stderr = .ignore,
            .create_no_window = true,
        });
        errdefer child.kill(self.io);
        const stdin = child.stdin orelse return error.EngineProtocol;
        const stdout = child.stdout orelse return error.EngineProtocol;
        self.child = child;
        if (self.write_lock) |lock| {
            lock.lockUncancelable(self.io);
            self.killed = false;
            lock.unlock(self.io);
        } else self.killed = false;
        self.setKillId(child.id);
        self.setStdin(stdin);
        self.stdout = stdout;
        self.reader = std.Io.File.Reader.init(stdout, self.io, &self.read_buf);
        self.reader_ready = true;
        self.generation +%= 1;
    }

    /// Write without taking `write_lock`; the caller holds it.
    pub fn writeUnlocked(self: *@This(), text: []const u8) !void {
        const file = self.stdin orelse return error.EngineMissing;
        try file.writeStreamingAll(self.io, text);
    }

    fn writeAll(self: *@This(), text: []const u8) !void {
        if (self.write_lock) |lock| {
            lock.lockUncancelable(self.io);
            defer lock.unlock(self.io);
            return self.writeUnlocked(text);
        }
        return self.writeUnlocked(text);
    }

    /// One command line in one write, so a concurrent cancel newline can
    /// only land between lines, never inside one.
    pub fn writeLine(self: *@This(), text: []const u8) !void {
        var buf: [256]u8 = undefined;
        if (text.len + 1 > buf.len) return error.InvalidRequest;
        @memcpy(buf[0..text.len], text);
        buf[text.len] = '\n';
        return self.writeAll(buf[0 .. text.len + 1]);
    }

    fn readReply(self: *@This()) ![]const u8 {
        if (!self.reader_ready) return error.EngineMissing;
        var lines: usize = 0;
        while (lines < 256) : (lines += 1) {
            const raw = self.reader.interface.takeDelimiterInclusive('\n') catch |err| switch (err) {
                error.EndOfStream => return error.EngineExited,
                else => return err,
            };
            const line = std.mem.trim(u8, raw, " \t\r\n");
            if (line.len == 0) continue;
            if (line[0] == '=') return std.mem.trim(u8, line[1..], " \t");
            if (line[0] == '?') return error.EngineRejected;
        }
        return error.EngineProtocol;
    }

    /// A multi-line GTP response (`=` then lines, closed by an empty
    /// line), joined with '\n' into `out`. Too long for `out` is a
    /// protocol error (the caller then discards the process).
    pub fn readBlock(self: *@This(), out: []u8) ![]const u8 {
        if (!self.reader_ready) return error.EngineMissing;
        var n: usize = 0;
        var started = false;
        var lines: usize = 0;
        while (lines < 10_000) : (lines += 1) {
            const raw = self.reader.interface.takeDelimiterInclusive('\n') catch |err| switch (err) {
                error.EndOfStream => return error.EngineExited,
                else => return err,
            };
            var line = std.mem.trim(u8, raw, " \t\r\n");
            if (!started) {
                if (line.len == 0) continue;
                if (line[0] == '?') return error.EngineRejected;
                if (line[0] != '=') continue;
                started = true;
                line = std.mem.trim(u8, line[1..], " \t");
            } else if (line.len == 0) {
                return out[0..n];
            }
            if (n + line.len + 1 > out.len) return error.EngineProtocol;
            @memcpy(out[n..][0..line.len], line);
            out[n + line.len] = '\n';
            n += line.len + 1;
        }
        return error.EngineProtocol;
    }

    pub fn command(self: *@This(), text: []const u8) ![]const u8 {
        try self.writeLine(text);
        return self.readReply();
    }

    fn keepLine(self: *@This(), line: []const u8) void {
        if (std.mem.startsWith(u8, line, "info ")) {
            // Keep only the latest report: it has the most visits.
            if (line.len <= self.info_buf.len) {
                @memcpy(self.info_buf[0..line.len], line);
                self.info_len = line.len;
            }
        } else if (std.mem.startsWith(u8, line, "play ")) {
            const mv = std.mem.trim(u8, line[5..], " \t");
            const n = @min(mv.len, self.play_buf.len);
            @memcpy(self.play_buf[0..n], mv[0..n]);
            self.play_len = n;
        }
    }

    /// Receives every `info` line as it arrives (streaming).
    pub const InfoSink = struct {
        context: *anyopaque,
        on_info: *const fn (context: *anyopaque, line: []const u8) void,
    };

    /// A GTP response is "=" followed by lines and closed by an empty line.
    pub fn readAnalysis(self: *@This(), sink: ?InfoSink) !void {
        if (!self.reader_ready) return error.EngineMissing;
        self.info_len = 0;
        self.play_len = 0;
        var started = false;
        var lines: usize = 0;
        while (lines < 200_000) : (lines += 1) {
            const raw = self.reader.interface.takeDelimiterInclusive('\n') catch |err| switch (err) {
                error.EndOfStream => return error.EngineExited,
                else => return err,
            };
            const line = std.mem.trim(u8, raw, " \t\r\n");
            if (!started) {
                if (line.len == 0) continue;
                if (line[0] == '?') return error.EngineRejected;
                if (line[0] != '=') continue;
                started = true;
                const rest = std.mem.trim(u8, line[1..], " \t");
                if (rest.len > 0) self.keepLine(rest);
                continue;
            }
            if (line.len == 0) {
                if (self.play_len == 0 and self.info_len == 0) return error.EngineProtocol;
                return;
            }
            self.keepLine(line);
            if (sink) |s| {
                if (std.mem.startsWith(u8, line, "info ")) s.on_info(s.context, line);
            }
        }
        return error.EngineProtocol;
    }
};

/// A value KataGo can take in `-override-config`. KataGo splits that
/// argument at commas, each item at its first `=`, and trims spaces, with
/// no quoting or escaping; so a directory containing any of those (or a
/// quote, a comment `#`, a control character) would be cut short or turn
/// into a different setting. Such a directory is skipped, never passed.
pub fn safeOverrideValue(v: []const u8) bool {
    if (v.len == 0 or v.len > 1024) return false;
    if (v[0] == ' ' or v[v.len - 1] == ' ') return false;
    for (v) |c| {
        if (c < 0x20 or c == 0x7f or c == ',' or c == '=' or c == '"' or c == '\'' or c == '#') return false;
    }
    return true;
}

const override_fixed = "logAllGTPCommunication=false,logSearchInfo=false,logToStderr=false,ponderingEnabled=false,allowResignation=false";

/// The `-override-config` argument: logs and KataGo's own data (tuning
/// files) in the user's temp directory, never beside a read-only packaged
/// executable. The first temp directory that `safeOverrideValue` accepts
/// is used; without one, only the fixed switches are passed.
pub fn overrideConfig(env: *const std.process.Environ.Map, buf: []u8) ?[]const u8 {
    const keys = [_][]const u8{ "TMPDIR", "TEMP", "TMP" };
    var dir: ?[]const u8 = null;
    for (keys) |key| {
        const v = env.get(key) orelse continue;
        if (safeOverrideValue(v) and std.fs.path.isAbsolute(v)) {
            dir = v;
            break;
        }
    }
    if (dir == null and builtin.os.tag != .windows) dir = "/tmp";
    if (dir) |d| {
        return std.fmt.bufPrint(buf, "logDir={s},homeDataDir={s},{s}", .{ d, d, override_fixed }) catch null;
    }
    return std.fmt.bufPrint(buf, "{s}", .{override_fixed}) catch null;
}

test "human profiles are validated before they reach KataGo" {
    try std.testing.expect(validProfile("rank_20k"));
    try std.testing.expect(validProfile("rank_1k"));
    try std.testing.expect(validProfile("rank_4d"));
    try std.testing.expect(validProfile("preaz_9d"));
    try std.testing.expect(!validProfile("rank_21k"));
    try std.testing.expect(!validProfile("rank_10d"));
    try std.testing.expect(!validProfile("rank_0k"));
    try std.testing.expect(!validProfile("rank_05k"));
    try std.testing.expect(!validProfile("rank_5k maxVisits 1"));
    try std.testing.expect(!validProfile("proyear_2020"));
    try std.testing.expect(!validProfile(""));
    try std.testing.expectEqual(Slot.human, Slot.parse("human").?);
    try std.testing.expectEqual(Slot.standard, Slot.parse("standard").?);
    try std.testing.expect(Slot.parse("/tmp/x.bin.gz") == null);
}

test "stopping a process that ignores SIGTERM does not hang" {
    if (@import("builtin").os.tag == .windows) return error.SkipZigTest;
    const io = std.testing.io;
    var engine: Engine = .{};
    // A stand-in for a KataGo that catches SIGTERM and keeps reading stdin.
    const argv = [_][]const u8{ "/bin/sh", "-c", "trap '' TERM; while :; do sleep 1; done" };
    engine.child = try std.process.spawn(io, .{ .argv = &argv, .stdin = .pipe, .stdout = .pipe, .stderr = .ignore });
    engine.stdin = engine.child.?.stdin;
    engine.stdout = engine.child.?.stdout;
    const started = std.Io.Timestamp.now(io, .awake);
    engine.deinit(io);
    const elapsed = started.durationTo(std.Io.Timestamp.now(io, .awake)).toMilliseconds();
    try std.testing.expect(engine.child == null);
    try std.testing.expect(elapsed < 5000);
}

test "override-config values never carry a separator" {
    try std.testing.expect(safeOverrideValue("/var/folders/x/T/"));
    try std.testing.expect(safeOverrideValue("C:\\Users\\Kim Lee\\AppData\\Local\\Temp"));
    for ([_][]const u8{ "", "/tmp/a,logDir=/etc", "/tmp/a=b", "/tmp/\"x\"", "/tmp/#x", "/tmp/a\nb", " /tmp", "/tmp " }) |v| {
        try std.testing.expect(!safeOverrideValue(v));
    }
    var env = std.process.Environ.Map.init(std.testing.allocator);
    defer env.deinit();
    var buf: [2048]u8 = undefined;
    try env.put("TMPDIR", "/tmp/evil,logToStderr=true");
    try env.put("TEMP", "/var/tmp/goban");
    const got = overrideConfig(&env, &buf).?;
    try std.testing.expect(std.mem.startsWith(u8, got, "logDir=/var/tmp/goban,homeDataDir=/var/tmp/goban,"));
    try std.testing.expect(std.mem.indexOf(u8, got, "evil") == null);
    try std.testing.expect(std.mem.endsWith(u8, got, "allowResignation=false"));
}

test "the watchdog kills a process that stops answering" {
    if (builtin.os.tag == .windows) return error.SkipZigTest;
    const io = std.testing.io;
    var engine: Engine = .{};
    engine.io = io;
    // A stand-in for a KataGo that never answers.
    const argv = [_][]const u8{ "/bin/sh", "-c", "trap '' TERM; while :; do sleep 1; done" };
    var child = try std.process.spawn(io, .{ .argv = &argv, .stdin = .pipe, .stdout = .pipe, .stderr = .ignore });
    engine.child = child;
    engine.kill_id = child.id;
    engine.stdin = child.stdin;
    engine.stdout = child.stdout;
    engine.reader = std.Io.File.Reader.init(child.stdout.?, io, &engine.read_buf);
    engine.reader_ready = true;
    const started = std.Io.Timestamp.now(io, .awake);
    engine.killUnlocked();
    // The blocked read ends instead of hanging.
    try std.testing.expectError(error.EngineExited, engine.readReply());
    const elapsed = started.durationTo(std.Io.Timestamp.now(io, .awake)).toMilliseconds();
    try std.testing.expect(elapsed < 5000);
    engine.deinit(io);
    _ = &child;
    try std.testing.expect(engine.child == null);
    try std.testing.expect(engine.kill_id == null);
}

test "the faster build is tried first; when it does not start, every slot uses the plain one" {
    if (builtin.os.tag == .windows) return error.SkipZigTest;
    const io = std.testing.io;
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir_len = try tmp.dir.realPath(io, &dir_buf);
    const root = dir_buf[0..dir_len];
    const platform = @tagName(builtin.os.tag);
    try tmp.dir.createDirPath(io, "model");
    try tmp.dir.createDirPath(io, platform);
    try tmp.dir.writeFile(io, .{ .sub_path = "model/model.txt.gz", .data = "x" });
    try tmp.dir.writeFile(io, .{ .sub_path = "model/gtp.cfg", .data = "x" });
    // Stand-ins: the plain build answers `name`; the faster one that cannot
    // run exits at once (as an illegal instruction or a missing GPU would),
    // and one that can answers too.
    const answers = "#!/bin/sh\nwhile read -r line; do echo \"= KataGo\"; echo; done\n";
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    try tmp.dir.writeFile(io, .{ .sub_path = try std.fmt.bufPrint(&path_buf, "{s}/katago", .{platform}), .data = answers, .flags = .{ .permissions = .executable_file } });
    try tmp.dir.writeFile(io, .{ .sub_path = try std.fmt.bufPrint(&path_buf, "{s}/katago-broken", .{platform}), .data = "#!/bin/sh\nexit 132\n", .flags = .{ .permissions = .executable_file } });
    try tmp.dir.writeFile(io, .{ .sub_path = try std.fmt.bufPrint(&path_buf, "{s}/katago-fast", .{platform}), .data = answers, .flags = .{ .permissions = .executable_file } });

    var env = std.process.Environ.Map.init(std.testing.allocator);
    defer env.deinit();
    try env.put("GOBAN_KATAGO_DIR", root);
    try env.put("TMPDIR", root);

    // A machine that can run it, and a faster build that does not start.
    var build: BuildState = .{ .capable = true };
    var engine: Engine = .{};
    engine.init(io, &env);
    engine.build = &build;
    engine.preferred_name = "katago-broken";
    try engine.start();
    try std.testing.expect(!engine.running_preferred);
    try std.testing.expect(build.failed.load(.acquire));
    try std.testing.expectEqualStrings("KataGo", try engine.command("name"));
    engine.deinit(io);
    // Remembered: the next start (of any slot sharing `build`) goes straight
    // to the plain build, even with a faster build that would work.
    engine.preferred_name = "katago-fast";
    try engine.start();
    try std.testing.expect(!engine.running_preferred);
    engine.deinit(io);

    // A faster build that starts is the one used.
    build = .{ .capable = true };
    try engine.start();
    try std.testing.expect(engine.running_preferred);
    try std.testing.expectEqualStrings("KataGo", try engine.command("name"));
    engine.deinit(io);

    // A machine that cannot run it never tries.
    build = .{ .capable = false };
    try engine.start();
    try std.testing.expect(!engine.running_preferred);
    try std.testing.expect(!build.failed.load(.acquire));
    engine.deinit(io);
}

