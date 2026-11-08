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
const std = @import("std");
const builtin = @import("builtin");

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

/// How the human SL model picks its move (see engine/model/human.cfg):
/// `raw` follows the human policy of the profile at one network
/// evaluation (KataGo's gtp_human5k_example.cfg); `search` keeps the
/// human style but lets a search veto losing moves (KataGo's
/// gtp_human9d_search_example.cfg), for ranks the raw policy cannot reach.
pub const HumanStyle = enum(u1) { raw = 0, search = 1 };

const StyleParam = struct { name: []const u8, raw: []const u8, search: []const u8 };
const style_params = [_]StyleParam{
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
    fn killUnlocked(self: *@This()) void {
        const id = self.kill_id orelse return;
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
            @memcpy(self.model_path[0..model.len], model);
            @memcpy(self.config_path[0..config.len], config);
            @memcpy(self.version_path[0..version.len], version);
            @memcpy(self.human_config_path[0..human_config.len], human_config);
            return .{
                .binary = self.bin_path[0..bin.len],
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

    fn start(self: *@This()) !void {
        if (self.child != null) return;
        const resolved = self.paths() orelse return error.EngineMissing;

        var override_buf: [std.Io.Dir.max_path_bytes + 512]u8 = undefined;
        const override = overrideConfig(self.env_map, &override_buf) orelse return error.EngineMissing;

        // Only fixed arguments and paths the host resolved itself: the page
        // chooses a slot, never a file.
        const extra = self.extraModel();
        if (self.slot != .standard and (extra.len == 0 or !exists(self.io, extra))) return error.ModelMissing;
        if (self.slot == .human and !exists(self.io, resolved.human_config)) return error.EngineMissing;
        const standard_argv = [_][]const u8{ resolved.binary, "gtp", "-model", resolved.model, "-config", resolved.config, "-override-config", override };
        const strong_argv = [_][]const u8{ resolved.binary, "gtp", "-model", extra, "-config", resolved.config, "-override-config", override };
        const human_argv = [_][]const u8{ resolved.binary, "gtp", "-model", resolved.model, "-human-model", extra, "-config", resolved.human_config, "-override-config", override };
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
        self.setKillId(child.id);
        self.setStdin(stdin);
        self.stdout = stdout;
        self.reader = std.Io.File.Reader.init(stdout, self.io, &self.read_buf);
        self.reader_ready = true;
        self.generation +%= 1;
    }

    /// Write without taking `write_lock`; the caller holds it.
    fn writeUnlocked(self: *@This(), text: []const u8) !void {
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
    fn writeLine(self: *@This(), text: []const u8) !void {
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
    fn readBlock(self: *@This(), out: []u8) ![]const u8 {
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

    fn command(self: *@This(), text: []const u8) ![]const u8 {
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
    fn readAnalysis(self: *@This(), sink: ?InfoSink) !void {
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

// ---------------------------------------------------------------- async

pub const max_setup = 19 * 19;
pub const max_moves = 1200;
const columns = "ABCDEFGHJKLMNOPQRST";

/// One GTP stone or pass: `color` is 'B' or 'W', `vertex` is "D4", "Q16"
/// or "pass" (upper case, validated against the board size).
pub const Move = struct {
    color: u8 = 'B',
    len: u8 = 0,
    vertex: [4]u8 = undefined,

    pub fn text(self: *const Move) []const u8 {
        return self.vertex[0..self.len];
    }

    pub fn eql(a: Move, b: Move) bool {
        return a.color == b.color and std.mem.eql(u8, a.vertex[0..a.len], b.vertex[0..b.len]);
    }
};

/// Parse "B D4 W Q16 B pass" into `out`. Every vertex must be on a
/// `size`×`size` board; anything else is an invalid request, so nothing
/// but `play <color> <vertex>` can ever reach KataGo from these lists.
pub fn parseMoves(list: []const u8, size: u8, allow_pass: bool, out: []Move) error{InvalidRequest}!usize {
    var it = std.mem.tokenizeAny(u8, list, " \t\r\n");
    var n: usize = 0;
    while (it.next()) |color_token| {
        const vertex_token = it.next() orelse return error.InvalidRequest;
        if (n >= out.len) return error.InvalidRequest;
        if (color_token.len != 1) return error.InvalidRequest;
        const color = std.ascii.toUpper(color_token[0]);
        if (color != 'B' and color != 'W') return error.InvalidRequest;
        var move = Move{ .color = color };
        if (std.ascii.eqlIgnoreCase(vertex_token, "pass")) {
            if (!allow_pass) return error.InvalidRequest;
            @memcpy(move.vertex[0..4], "pass");
            move.len = 4;
        } else {
            if (vertex_token.len < 2 or vertex_token.len > 3) return error.InvalidRequest;
            const letter = std.ascii.toUpper(vertex_token[0]);
            const col = std.mem.indexOfScalar(u8, columns, letter) orelse return error.InvalidRequest;
            if (col >= size) return error.InvalidRequest;
            const row = std.fmt.parseInt(u8, vertex_token[1..], 10) catch return error.InvalidRequest;
            if (row < 1 or row > size) return error.InvalidRequest;
            move.vertex[0] = letter;
            @memcpy(move.vertex[1..vertex_token.len], vertex_token[1..]);
            move.len = @intCast(vertex_token.len);
        }
        out[n] = move;
        n += 1;
    }
    return n;
}

/// The rulesets the page can ask for (v5). Each maps to one KataGo
/// `kata-set-rules` preset; anything else is an invalid request.
pub const Rules = enum {
    japanese,
    chinese,
    korean,

    /// Exact, lower-case names only: the page sends what rules.js lists.
    pub fn parse(text: []const u8) ?Rules {
        if (std.mem.eql(u8, text, "japanese")) return .japanese;
        if (std.mem.eql(u8, text, "chinese")) return .chinese;
        if (std.mem.eql(u8, text, "korean")) return .korean;
        return null;
    }

    pub fn command(self: Rules) []const u8 {
        return switch (self) {
            .japanese => "kata-set-rules japanese",
            .chinese => "kata-set-rules chinese",
            .korean => "kata-set-rules korean",
        };
    }
};

pub const Position = struct {
    size: u8 = 19,
    komi: f64 = 6.5,
    rules: Rules = .japanese,
    setup: [max_setup]Move = undefined,
    setup_len: usize = 0,
    moves: [max_moves]Move = undefined,
    moves_len: usize = 0,

    /// Same board, komi, rules and root stones: only the move list may differ.
    pub fn sameBase(a: *const Position, b: *const Position) bool {
        if (a.size != b.size or a.komi != b.komi or a.rules != b.rules or a.setup_len != b.setup_len) return false;
        for (a.setup[0..a.setup_len], b.setup[0..b.setup_len]) |x, y| {
            if (!x.eql(y)) return false;
        }
        return true;
    }

    /// Length of the shared opening of the two move lists.
    pub fn commonPrefix(a: *const Position, b: *const Position) usize {
        const n = @min(a.moves_len, b.moves_len);
        var i: usize = 0;
        while (i < n and a.moves[i].eql(b.moves[i])) : (i += 1) {}
        return i;
    }
};

/// What a request asks of KataGo.
pub const Kind = enum { analyze, human_policy };

/// Human-policy requests (v13, docs/strength.md "your moves"): at most this
/// many positions and profiles, and this many network evaluations, per call.
pub const max_policy_positions = 200;
pub const max_policy_profiles = 8;
pub const max_policy_evals = 1600;
/// The watchdog's allowance for one evaluation (each one pushes the
/// deadline on; a stuck evaluation is caught, a long game is not).
pub const policy_eval_grace_ms: i64 = 20_000;

pub const Request = struct {
    seq: u64 = 0,
    kind: Kind = .analyze,
    position: Position = .{},
    color: u8 = 'B',
    visits: u32 = 64,
    max_time: f64 = 6.0,
    stream: bool = false,
    slot: Slot = .standard,
    /// Human slot only: a `validProfile` and the move-choice style.
    profile: [max_profile]u8 = undefined,
    profile_len: usize = 0,
    style: HumanStyle = .raw,
    /// Human policy only: the profiles to read (each a `validProfile`), the
    /// first move index to score, and the positions to score at most.
    policy_profiles: [max_policy_profiles][max_profile]u8 = undefined,
    policy_profile_lens: [max_policy_profiles]u8 = @splat(0),
    policy_profiles_len: usize = 0,
    policy_from: usize = 0,
    policy_max_positions: usize = max_policy_positions,

    pub fn profileText(self: *const Request) []const u8 {
        return self.profile[0..self.profile_len];
    }

    pub fn policyProfile(self: *const Request, i: usize) []const u8 {
        return self.policy_profiles[i][0..self.policy_profile_lens[i]];
    }
};

/// The probabilities a human-policy request found: for each scored move
/// (its index in the move list), the human SL policy's probability of the
/// move actually played, under each profile. Owned by `result_allocator`.
pub const PolicyRows = struct {
    count: usize = 0,
    profiles: usize = 0,
    /// More positions qualified than the request's bound allowed.
    truncated: bool = false,
    names: [max_policy_profiles][max_profile]u8 = undefined,
    name_lens: [max_policy_profiles]u8 = @splat(0),
    index: [max_policy_positions]u16 = undefined,
    p: [max_policy_positions * max_policy_profiles]f32 = undefined,

    pub fn name(self: *const PolicyRows, k: usize) []const u8 {
        return self.names[k][0..self.name_lens[k]];
    }

    pub fn prob(self: *const PolicyRows, row: usize, k: usize) f32 {
        return self.p[row * max_policy_profiles + k];
    }
};

/// The policy probability of `move` in a `kata-raw-human-nn` report
/// (KataGo 1.18.1 `rawNN`): `policy` is followed by size×size numbers,
/// row by row from the top (GTP row `size`), `NAN` for illegal points;
/// `policyPass` by one number. Null when the report does not have them.
pub fn policyAt(report: []const u8, size: u8, move: Move) ?f32 {
    var it = std.mem.tokenizeAny(u8, report, " \t\r\n");
    const pass = std.mem.eql(u8, move.text(), "pass");
    var target: usize = 0;
    if (!pass) {
        const v = move.text();
        if (v.len < 2) return null;
        const col = std.mem.indexOfScalar(u8, columns, v[0]) orelse return null;
        const row = std.fmt.parseInt(u8, v[1..], 10) catch return null;
        if (col >= size or row < 1 or row > size) return null;
        target = @as(usize, size - row) * size + col;
    }
    while (it.next()) |tok| {
        if (pass and std.mem.eql(u8, tok, "policyPass")) return parseProb(it.next() orelse return null);
        if (!pass and std.mem.eql(u8, tok, "policy")) {
            var i: usize = 0;
            while (i < target) : (i += 1) _ = it.next() orelse return null;
            return parseProb(it.next() orelse return null);
        }
    }
    return null;
}

fn parseProb(tok: []const u8) ?f32 {
    if (std.ascii.eqlIgnoreCase(tok, "nan")) return 0;
    const v = std.fmt.parseFloat(f32, tok) catch return null;
    if (!std.math.isFinite(v) or v < 0) return null;
    return @min(v, 1);
}

/// How the worker brought KataGo to the requested position.
pub const SyncStats = struct {
    reset: bool = false,
    undo: u32 = 0,
    play: u32 = 0,
};

pub const Outcome = enum { ok, cancelled, failed };

pub const Result = struct {
    seq: u64 = 0,
    outcome: Outcome = .failed,
    play_buf: [16]u8 = undefined,
    play_len: usize = 0,
    /// Final `info` line, owned by `result_allocator`; the collector frees it.
    info: ?[]u8 = null,
    /// Human policy requests: the rows, owned by `result_allocator`; the
    /// collector frees them.
    policy: ?*PolicyRows = null,
    sync: SyncStats = .{},
    error_name: []const u8 = "",

    pub fn play(self: *const Result) []const u8 {
        return self.play_buf[0..self.play_len];
    }
};

pub const StreamInfo = struct {
    seq: u64,
    /// Owned by `result_allocator`; the collector frees it.
    info: []u8,
};

/// Thread-safe allocator for everything that crosses threads.
pub const result_allocator = std.heap.page_allocator;

/// Minimum spacing of partial reports handed to the UI thread. KataGo is
/// asked for one every 200 ms (`interval 20`); this guards the UI against
/// bursts if reports queue up in the pipe.
const stream_min_gap_ms: i64 = 180;

/// A cross-thread nudge for the UI loop (PlatformServices.wake_fn).
pub const WakeFn = *const fn (context: ?*anyopaque) anyerror!void;

pub const CancelResult = enum { not_found, removed_pending, signalled_running };

/// How long a request may hold KataGo before the watchdog kills it.
/// KataGo stops a search at `maxTime` by itself; the grace covers setting
/// up the position (up to a few thousand GTP lines) and writing the
/// ownership report. A process that is not running yet must also start and
/// load its network first: the optional 40-block network on a slow CPU,
/// or a GPU backend tuning itself on first use, takes minutes, so the cold
/// budget is generous. Past either, something is wrong and waiting longer
/// only keeps the page (and every request queued behind it) stuck.
pub const warm_grace_ms: i64 = 20_000;
pub const cold_grace_ms: i64 = 240_000;

pub fn deadlineMs(max_time_s: f64, cold: bool) i64 {
    const t = if (std.math.isFinite(max_time_s) and max_time_s > 0) @min(max_time_s, 600) else 600;
    const search: i64 = @intFromFloat(t * 1000);
    return search + (if (cold) cold_grace_ms else warm_grace_ms);
}

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

/// The KataGo worker. Lives on the heap for the whole session.
///
/// Threads:
///   * UI thread: `submit`, `cancel`, `takeResults`, `takeStream`,
///     `checkDeadline` (the watchdog), `stopSlot`, `shutdown`.
///   * worker thread: `run` — the only code that talks to KataGo while an
///     async request is in flight.
///
/// `lock` guards the request/result state AND every write to KataGo's
/// stdin, so "is this search cancelled?" + "send the search command" on
/// the worker and "mark cancelled" + "send the cancel newline" on the UI
/// thread are each atomic: a cancel can never slip in between the check
/// and the search and be lost. `engine_lock` is held by whoever drives a
/// GTP exchange (the worker for a job; the UI thread only ever tries it,
/// in `stopSlot` and `shutdown`). The worker never waits for the UI thread
/// while holding either lock, and reaches it only through `wake_fn`
/// (documented thread-safe).
/// What one KataGo process has been told: owned by whoever holds
/// `engine_lock`.
const SlotState = struct {
    sent: Position = .{},
    sent_valid: bool = false,
    sent_generation: u32 = 0,
    params_valid: bool = false,
    sent_visits: u32 = 0,
    sent_max_time: f64 = 0,
    human_valid: bool = false,
    sent_profile: [max_profile]u8 = undefined,
    sent_profile_len: usize = 0,
    sent_style: HumanStyle = .raw,

    fn invalidate(self: *SlotState) void {
        self.sent_valid = false;
        self.params_valid = false;
        self.human_valid = false;
    }
};

pub const Worker = struct {
    engines: [slot_count]Engine = [_]Engine{.{}} ** slot_count,
    io: std.Io = undefined,

    lock: std.Io.Mutex = .init,
    cond: std.Io.Condition = .init,
    engine_lock: std.Io.Mutex = .init,

    // --- guarded by `lock`
    started: bool = false,
    quit: bool = false,
    has_pending: bool = false,
    pending: Request = .{},
    running_seq: u64 = 0,
    /// The process the running request talks to (cancel newline target).
    running_slot: Slot = .standard,
    cancel_seq: u64 = 0,
    results: [16]Result = undefined,
    results_len: usize = 0,
    stream: ?StreamInfo = null,
    /// Slots whose process must stop once the running request ends
    /// (`stopSlot` found the engine busy).
    stop_after: [slot_count]bool = [_]bool{false} ** slot_count,
    /// When the running request's process is killed (`checkDeadline`);
    /// 0 while the worker has not started on it yet.
    running_deadline_ms: i64 = 0,
    /// The request the watchdog killed: it fails with `Timeout`.
    timed_out_seq: u64 = 0,

    // --- set on the UI thread before the worker starts
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,

    // --- owned by whoever holds `engine_lock`
    current: Request = .{},
    states: [slot_count]SlotState = [_]SlotState{.{}} ** slot_count,
    last_stream_ms: i64 = 0,
    /// The current request got as far as talking to KataGo.
    touched: bool = false,
    /// Human policy: the position being stepped through, and one
    /// `kata-raw-human-nn` report.
    policy_target: Position = .{},
    block_buf: [64 * 1024]u8 = undefined,

    /// `strong_model` / `human_model`: absolute paths of the optional
    /// networks (they need not exist yet; empty disables the slot).
    pub fn init(self: *Worker, io: std.Io, env_map: *std.process.Environ.Map, strong_model: []const u8, human_model: []const u8) void {
        self.* = .{};
        self.io = io;
        for (&self.engines, 0..) |*engine, i| {
            engine.init(io, env_map);
            engine.write_lock = &self.lock;
            const slot: Slot = @enumFromInt(i);
            engine.setSlot(slot, switch (slot) {
                .standard => "",
                .strong => strong_model,
                .human => human_model,
            });
        }
    }

    /// The shipped engine (status, version).
    pub fn standard(self: *Worker) *Engine {
        return &self.engines[@intFromEnum(Slot.standard)];
    }

    pub fn setWake(self: *Worker, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    fn notify(self: *Worker) void {
        if (self.wake_fn) |f| f(self.wake_context) catch {};
    }

    /// Start the thread on first use. Caller holds `lock`.
    fn ensureStarted(self: *Worker) !void {
        if (self.started) return;
        const thread = try std.Thread.spawn(.{ .stack_size = 1024 * 1024 }, run, .{self});
        thread.detach();
        self.started = true;
    }

    /// Ask KataGo to stop the running search. Caller holds `lock`. A bare
    /// newline interrupts `kata-search_analyze_cancellable` and is ignored
    /// by KataGo's command loop at any other moment.
    fn signalCancelLocked(self: *Worker, seq: u64) void {
        self.cancel_seq = seq;
        self.engines[@intFromEnum(self.running_slot)].writeUnlocked("\n") catch {};
    }

    pub const Submitted = struct {
        /// A queued request that never started; reply "cancelled" for it.
        dropped_seq: u64 = 0,
        /// The running request that was told to stop; its result arrives
        /// as cancelled (or, if it finished in the same instant, ok).
        superseded_seq: u64 = 0,
    };

    /// Queue `req` (copied), superseding whatever is queued or running.
    /// UI thread.
    pub fn submit(self: *Worker, req: *const Request) !Submitted {
        var out = Submitted{};
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        try self.ensureStarted();
        if (self.has_pending) out.dropped_seq = self.pending.seq;
        if (self.running_seq != 0 and self.cancel_seq != self.running_seq) {
            out.superseded_seq = self.running_seq;
            self.signalCancelLocked(self.running_seq);
        }
        self.pending = req.*;
        self.has_pending = true;
        self.cond.signal(self.io);
        return out;
    }

    /// Cancel one request. UI thread.
    pub fn cancel(self: *Worker, seq: u64) CancelResult {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.has_pending and self.pending.seq == seq) {
            self.has_pending = false;
            return .removed_pending;
        }
        if (self.running_seq == seq) {
            if (self.cancel_seq != seq) self.signalCancelLocked(seq);
            return .signalled_running;
        }
        return .not_found;
    }

    /// Hand finished results to the UI thread. UI thread.
    pub fn takeResults(self: *Worker, out: []Result) usize {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const n = @min(out.len, self.results_len);
        @memcpy(out[0..n], self.results[0..n]);
        const rest = self.results_len - n;
        var i: usize = 0;
        while (i < rest) : (i += 1) self.results[i] = self.results[n + i];
        self.results_len = rest;
        return n;
    }

    /// The latest partial report, if any. UI thread.
    pub fn takeStream(self: *Worker) ?StreamInfo {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const value = self.stream;
        self.stream = null;
        return value;
    }

    /// The watchdog, from the UI thread's drain: if the running request is
    /// past its deadline, kill its KataGo process (the worker's read then
    /// fails and the request is answered `Timeout`). Returns the request's
    /// seq when it killed one. Never blocks on the worker.
    pub fn checkDeadline(self: *Worker, now_ms: i64) u64 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.running_seq == 0 or self.running_deadline_ms == 0) return 0;
        if (now_ms < self.running_deadline_ms) return 0;
        if (self.timed_out_seq == self.running_seq) return 0;
        self.timed_out_seq = self.running_seq;
        self.engines[@intFromEnum(self.running_slot)].killUnlocked();
        return self.running_seq;
    }

    /// Stop one slot's process (its network is being removed). Returns
    /// false when the worker is busy: the slot then stops as soon as the
    /// running request ends, and the caller should try again shortly.
    /// The next request for the slot starts it again if its file exists.
    /// UI thread; never blocks.
    pub fn stopSlot(self: *Worker, slot: Slot) bool {
        // Never wait on the worker from the UI thread: a search or a
        // network still loading can hold the engine for a long time.
        if (self.engine_lock.tryLock()) {
            defer self.engine_lock.unlock(self.io);
            self.engines[@intFromEnum(slot)].deinit(self.io);
            self.states[@intFromEnum(slot)].invalidate();
            return true;
        }
        self.lock.lockUncancelable(self.io);
        self.stop_after[@intFromEnum(slot)] = true;
        self.lock.unlock(self.io);
        return false;
    }

    /// App exit. Stops the worker without waiting for it; KataGo is told to
    /// quit (and exits with our stdin pipe in any case).
    pub fn shutdown(self: *Worker) void {
        self.lock.lockUncancelable(self.io);
        const started = self.started;
        self.quit = true;
        self.has_pending = false;
        if (started) {
            for (&self.engines) |*engine| engine.writeUnlocked("\nquit\n") catch {};
        }
        self.cond.signal(self.io);
        self.lock.unlock(self.io);
        if (!started) {
            for (&self.engines) |*engine| engine.deinit(self.io);
        } else if (self.engine_lock.tryLock()) {
            // Worker idle: reap the processes ourselves.
            for (&self.engines) |*engine| engine.deinit(self.io);
            self.engine_lock.unlock(self.io);
        }
    }

    // ------------------------------------------------------ worker thread

    fn run(self: *Worker) void {
        while (true) {
            self.lock.lockUncancelable(self.io);
            while (!self.has_pending and !self.quit) self.cond.waitUncancelable(self.io, &self.lock);
            if (self.quit) {
                self.lock.unlock(self.io);
                return;
            }
            // `current` is only touched by this thread (and read in
            // `onInfo`, also this thread), so it can be filled here.
            self.current = self.pending;
            self.has_pending = false;
            self.running_seq = self.current.seq;
            self.running_slot = self.current.slot;
            self.lock.unlock(self.io);

            // Lock order is engine_lock → lock everywhere (GTP writes take
            // `lock` while the driver holds `engine_lock`), so never take
            // engine_lock while holding `lock`.
            var result = Result{ .seq = self.current.seq };
            self.engine_lock.lockUncancelable(self.io);
            // The deadline starts now that the engine is ours, and is long
            // when the process must start (and load its network) first.
            const cold = self.engines[@intFromEnum(self.current.slot)].child == null;
            const budget = deadlineMs(self.current.max_time, cold);
            self.lock.lockUncancelable(self.io);
            self.running_deadline_ms = std.Io.Timestamp.now(self.io, .awake).toMilliseconds() + budget;
            self.lock.unlock(self.io);
            self.process(&self.current, &result);
            self.stopRequested();
            self.engine_lock.unlock(self.io);

            self.publish(result);
            self.notify();
        }
    }

    /// `engine_lock` held: stop the slots `stopSlot` could not stop at once.
    fn stopRequested(self: *Worker) void {
        self.lock.lockUncancelable(self.io);
        const stops = self.stop_after;
        self.stop_after = [_]bool{false} ** slot_count;
        self.lock.unlock(self.io);
        for (stops, 0..) |stop, i| {
            if (!stop) continue;
            self.engines[i].deinit(self.io);
            self.states[i].invalidate();
        }
    }

    fn publish(self: *Worker, result: Result) void {
        while (true) {
            self.lock.lockUncancelable(self.io);
            if (self.running_seq == result.seq) {
                self.running_seq = 0;
                self.running_deadline_ms = 0;
            }
            if (self.results_len < self.results.len) {
                self.results[self.results_len] = result;
                self.results_len += 1;
                self.lock.unlock(self.io);
                return;
            }
            if (self.quit) {
                self.lock.unlock(self.io);
                if (result.info) |info| result_allocator.free(info);
                if (result.policy) |rows| result_allocator.destroy(rows);
                return;
            }
            self.lock.unlock(self.io);
            // The UI thread has not collected for a while; let it catch up.
            self.notify();
            std.Io.sleep(self.io, .fromMilliseconds(20), .awake) catch {};
        }
    }

    fn isCancelled(self: *Worker, seq: u64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.cancel_seq == seq or self.quit;
    }

    fn timedOut(self: *Worker, seq: u64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.timed_out_seq == seq;
    }

    fn process(self: *Worker, req: *const Request, result: *Result) void {
        self.processInner(req, result) catch |err| {
            // Killed by the watchdog: whatever the read reported, the page
            // hears why.
            result.error_name = if (self.timedOut(req.seq)) "Timeout" else @errorName(err);
            if (result.info) |info| result_allocator.free(info);
            result.info = null;
            if (result.policy) |rows| result_allocator.destroy(rows);
            result.policy = null;
            if (err == error.Cancelled and !self.timedOut(req.seq)) {
                result.outcome = .cancelled;
                return;
            }
            result.outcome = .failed;
            // Refused before anything reached KataGo: the process is fine.
            if (err == error.InvalidRequest and !self.touched) return;
            result.outcome = .failed;
            // Unknown GTP state: start from a fresh process next time.
            self.engines[@intFromEnum(req.slot)].deinit(self.io);
            self.states[@intFromEnum(req.slot)].invalidate();
        };
    }

    /// Push the running request's deadline on (a long human-policy request
    /// that keeps making progress).
    fn extendDeadline(self: *Worker, ms: i64) void {
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.running_deadline_ms != 0) self.running_deadline_ms = @max(self.running_deadline_ms, now + ms);
    }

    /// Human policy (v13): for each move of `req.color` from `policy_from`
    /// on, bring the human slot's board to the position before it and read
    /// the raw human SL policy under each profile: `kata-set-param
    /// humanSLProfile <p>` then `kata-raw-human-nn <color> 0` (one
    /// symmetry: these are statistics, not a move choice).
    fn processPolicy(self: *Worker, req: *const Request, result: *Result) !void {
        if (req.slot != .human or req.policy_profiles_len == 0 or req.policy_profiles_len > max_policy_profiles) return error.InvalidRequest;
        for (0..req.policy_profiles_len) |k| {
            if (!validProfile(req.policyProfile(k))) return error.InvalidRequest;
        }
        const rows = try result_allocator.create(PolicyRows);
        rows.* = .{ .profiles = req.policy_profiles_len };
        for (0..req.policy_profiles_len) |k| {
            const p = req.policyProfile(k);
            @memcpy(rows.names[k][0..p.len], p);
            rows.name_lens[k] = @intCast(p.len);
        }
        result.policy = rows;
        self.touched = true;
        const engine = &self.engines[@intFromEnum(Slot.human)];
        const state = &self.states[@intFromEnum(Slot.human)];
        try engine.start();
        // The profile changes below: the next human-style search sets its own.
        state.human_valid = false;
        const target = &self.policy_target;
        target.* = req.position;
        const color: []const u8 = if (req.color == 'W') "W" else "B";
        const limit = @min(req.policy_max_positions, max_policy_positions);
        var i: usize = req.policy_from;
        while (i < req.position.moves_len) : (i += 1) {
            const move = req.position.moves[i];
            if (move.color != req.color) continue;
            if (rows.count >= limit) {
                rows.truncated = true;
                break;
            }
            if (self.isCancelled(req.seq)) return error.Cancelled;
            target.moves_len = i;
            _ = try syncPosition(engine, state, target);
            for (0..req.policy_profiles_len) |k| {
                if (self.isCancelled(req.seq)) return error.Cancelled;
                var buf: [96]u8 = undefined;
                _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param humanSLProfile {s}", .{req.policyProfile(k)}) catch return error.InvalidRequest);
                try engine.writeLine(std.fmt.bufPrint(&buf, "kata-raw-human-nn {s} 0", .{color}) catch return error.InvalidRequest);
                const report = try engine.readBlock(&self.block_buf);
                rows.p[rows.count * max_policy_profiles + k] = policyAt(report, req.position.size, move) orelse return error.EngineProtocol;
                self.extendDeadline(policy_eval_grace_ms);
            }
            rows.index[rows.count] = @intCast(i);
            rows.count += 1;
        }
        result.outcome = .ok;
    }

    fn processInner(self: *Worker, req: *const Request, result: *Result) !void {
        self.touched = false;
        if (self.isCancelled(req.seq)) return error.Cancelled;
        if (req.kind == .human_policy) return self.processPolicy(req, result);
        if (req.slot == .human and !validProfile(req.profileText())) return error.InvalidRequest;
        self.touched = true;
        const engine = &self.engines[@intFromEnum(req.slot)];
        const state = &self.states[@intFromEnum(req.slot)];
        try engine.start();
        result.sync = try syncPosition(engine, state, &req.position);
        try syncParams(engine, state, req.visits, req.max_time);
        if (req.slot == .human) try syncHuman(engine, state, req);

        var cmd_buf: [96]u8 = undefined;
        const color: []const u8 = if (req.color == 'W') "W" else "B";
        const interval: []const u8 = if (req.stream) " interval 20" else "";
        const search = std.fmt.bufPrint(&cmd_buf, "kata-search_analyze_cancellable {s}{s} ownership true\n", .{ color, interval }) catch return error.InvalidRequest;
        try self.launch(req.seq, search);

        self.last_stream_ms = 0;
        const sink: ?Engine.InfoSink = if (req.stream) .{ .context = self, .on_info = onInfo } else null;
        engine.readAnalysis(sink) catch |err| switch (err) {
            // An engine without the cancellable flavour: same search, not
            // interruptible (a cancel then waits for maxTime at worst).
            error.EngineRejected => {
                const fallback = std.fmt.bufPrint(&cmd_buf, "kata-search_analyze {s}{s} ownership true\n", .{ color, interval }) catch return error.InvalidRequest;
                try self.launch(req.seq, fallback);
                try engine.readAnalysis(sink);
            },
            else => return err,
        };
        const play = engine.play_buf[0..engine.play_len];
        if (std.mem.eql(u8, play, "cancelled") or self.isCancelled(req.seq)) return error.Cancelled;
        result.play_len = @min(play.len, result.play_buf.len);
        @memcpy(result.play_buf[0..result.play_len], play[0..result.play_len]);
        if (engine.info_len > 0) {
            result.info = try result_allocator.dupe(u8, engine.info_buf[0..engine.info_len]);
        }
        result.outcome = .ok;
    }

    /// Send the search command unless the request was cancelled meanwhile.
    fn launch(self: *Worker, seq: u64, command_line: []const u8) !void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.cancel_seq == seq or self.quit) return error.Cancelled;
        try self.engines[@intFromEnum(self.running_slot)].writeUnlocked(command_line);
    }

    fn onInfo(context: *anyopaque, line: []const u8) void {
        const self: *Worker = @ptrCast(@alignCast(context));
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        if (self.last_stream_ms != 0 and now - self.last_stream_ms < stream_min_gap_ms) return;
        const copy = result_allocator.dupe(u8, line) catch return;
        self.lock.lockUncancelable(self.io);
        if (self.cancel_seq == self.current.seq) {
            self.lock.unlock(self.io);
            result_allocator.free(copy);
            return;
        }
        if (self.stream) |old| result_allocator.free(old.info);
        self.stream = .{ .seq = self.current.seq, .info = copy };
        self.lock.unlock(self.io);
        self.last_stream_ms = now;
        self.notify();
    }

    fn playMove(engine: *Engine, move: *const Move) !void {
        var buf: [32]u8 = undefined;
        const line = std.fmt.bufPrint(&buf, "play {c} {s}", .{ move.color, move.text() }) catch return error.InvalidRequest;
        _ = try engine.command(line);
    }

    /// Bring KataGo's board to `target`, reusing what it already has:
    /// `undo` back to the common prefix of the move lists, then `play`
    /// forward. A different size, komi, ruleset or set of root stones (or a
    /// fresh process) starts over from `clear_board`.
    fn syncPosition(engine: *Engine, self: *SlotState, target: *const Position) !SyncStats {
        var stats = SyncStats{};
        const reusable = self.sent_valid and self.sent_generation == engine.generation and self.sent.sameBase(target);
        // Until the end of this function KataGo's board is in flux.
        self.sent_valid = false;
        var incremental = false;
        if (reusable) {
            const keep = self.sent.commonPrefix(target);
            const undo_count = self.sent.moves_len - keep;
            incremental = true;
            var i: usize = 0;
            while (i < undo_count) : (i += 1) {
                _ = engine.command("undo") catch |err| switch (err) {
                    error.EngineRejected => {
                        incremental = false;
                        break;
                    },
                    else => return err,
                };
                stats.undo += 1;
            }
            if (incremental) {
                for (target.moves[keep..target.moves_len]) |*move| {
                    try playMove(engine, move);
                    stats.play += 1;
                }
            }
        }
        if (!incremental) {
            stats = .{ .reset = true };
            var buf: [64]u8 = undefined;
            _ = try engine.command(std.fmt.bufPrint(&buf, "boardsize {d}", .{target.size}) catch return error.InvalidRequest);
            _ = try engine.command("clear_board");
            _ = try engine.command(std.fmt.bufPrint(&buf, "komi {d}", .{target.komi}) catch return error.InvalidRequest);
            _ = try engine.command(target.rules.command());
            // GTP `play` need not alternate, so root stones are simply
            // placed one by one before the game's own moves.
            for (target.setup[0..target.setup_len]) |*move| try playMove(engine, move);
            for (target.moves[0..target.moves_len]) |*move| {
                try playMove(engine, move);
                stats.play += 1;
            }
        }
        self.sent = target.*;
        self.sent_generation = engine.generation;
        self.sent_valid = true;
        return stats;
    }

    fn syncParams(engine: *Engine, self: *SlotState, visits: u32, max_time: f64) !void {
        const fresh = self.params_valid and self.sent_generation == engine.generation;
        var buf: [64]u8 = undefined;
        if (!fresh or self.sent_visits != visits) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param maxVisits {d}", .{visits}) catch return error.InvalidRequest);
            self.sent_visits = visits;
        }
        if (!fresh or self.sent_max_time != max_time) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param maxTime {d}", .{max_time}) catch return error.InvalidRequest);
            self.sent_max_time = max_time;
        }
        self.params_valid = true;
    }

    /// Profile and style of the human slot, sent only when they change
    /// (a fresh process starts from engine/model/human.cfg).
    fn syncHuman(engine: *Engine, self: *SlotState, req: *const Request) !void {
        const profile = req.profileText();
        if (!validProfile(profile)) return error.InvalidRequest;
        const fresh = self.human_valid and self.sent_generation == engine.generation;
        self.human_valid = false;
        var buf: [96]u8 = undefined;
        if (!fresh or !std.mem.eql(u8, self.sent_profile[0..self.sent_profile_len], profile)) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param humanSLProfile {s}", .{profile}) catch return error.InvalidRequest);
            @memcpy(self.sent_profile[0..profile.len], profile);
            self.sent_profile_len = profile.len;
        }
        if (!fresh or self.sent_style != req.style) {
            for (style_params) |p| {
                const value = if (req.style == .search) p.search else p.raw;
                _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param {s} {s}", .{ p.name, value }) catch return error.InvalidRequest);
            }
            self.sent_style = req.style;
        }
        self.human_valid = true;
    }
};

test "async positions parse and validate" {
    var moves: [8]Move = undefined;
    const n = try parseMoves("B D4 w q16 B pass", 19, true, &moves);
    try std.testing.expectEqual(@as(usize, 3), n);
    try std.testing.expectEqualStrings("Q16", moves[1].text());
    try std.testing.expectEqual(@as(u8, 'W'), moves[1].color);
    try std.testing.expectEqualStrings("pass", moves[2].text());
    try std.testing.expectError(error.InvalidRequest, parseMoves("B I4", 19, true, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("B K10", 9, true, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("B D20", 19, true, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("B pass", 19, false, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("B D4 W", 19, true, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("X D4", 19, true, &moves));
    try std.testing.expectError(error.InvalidRequest, parseMoves("B D4;quit", 19, true, &moves));
}

test "incremental sync reuses the common prefix" {
    const a = try std.testing.allocator.create(Position);
    defer std.testing.allocator.destroy(a);
    const b = try std.testing.allocator.create(Position);
    defer std.testing.allocator.destroy(b);
    a.* = .{};
    b.* = .{};
    a.moves_len = try parseMoves("B D4 W Q16 B C3", 19, true, &a.moves);
    b.moves_len = try parseMoves("B D4 W Q16 B D16 W pass", 19, true, &b.moves);
    try std.testing.expect(a.sameBase(b));
    try std.testing.expectEqual(@as(usize, 2), a.commonPrefix(b));
    b.komi = 0.5;
    try std.testing.expect(!a.sameBase(b));
    // A different ruleset starts over, so `kata-set-rules` is sent again.
    b.komi = a.komi;
    try std.testing.expect(a.sameBase(b));
    b.rules = .chinese;
    try std.testing.expect(!a.sameBase(b));
}

test "rules are one of three presets" {
    try std.testing.expectEqual(Rules.japanese, Rules.parse("japanese").?);
    try std.testing.expectEqual(Rules.chinese, Rules.parse("chinese").?);
    try std.testing.expectEqual(Rules.korean, Rules.parse("korean").?);
    try std.testing.expect(Rules.parse("aga") == null);
    try std.testing.expect(Rules.parse("Chinese") == null);
    try std.testing.expect(Rules.parse("chinese ") == null);
    try std.testing.expect(Rules.parse("") == null);
    try std.testing.expectEqualStrings("kata-set-rules chinese", Rules.chinese.command());
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

test "the watchdog budget is maxTime plus a grace, long for a cold start" {
    try std.testing.expectEqual(@as(i64, 6000 + warm_grace_ms), deadlineMs(6, false));
    try std.testing.expectEqual(@as(i64, 6000 + cold_grace_ms), deadlineMs(6, true));
    try std.testing.expectEqual(@as(i64, 500 + warm_grace_ms), deadlineMs(0.5, false));
    // Nonsense never means "no deadline".
    try std.testing.expectEqual(@as(i64, 600_000 + warm_grace_ms), deadlineMs(std.math.inf(f64), false));
    try std.testing.expectEqual(@as(i64, 600_000 + warm_grace_ms), deadlineMs(-1, false));
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

test "the played move's probability is read from a kata-raw-human-nn report" {
    // A 3x3 report as KataGo 1.18.1 prints it (rows from the top).
    const report =
        \\symmetry 0
        \\whiteWin 0.400000
        \\whiteLoss 0.600000
        \\noResult 0.000000
        \\whiteScore -1.500
        \\whiteScoreSq 9.000
        \\shorttermWinlossError 0.300
        \\shorttermScoreError 2.000
        \\policy
        \\0.010000 0.020000 0.030000
        \\0.040000 0.500000     NAN
        \\0.070000 0.080000 0.090000
        \\policyPass 0.150000
        \\whiteOwnership
        \\0.1 0.2 0.3
        \\0.4 0.5 0.6
        \\0.7 0.8 0.9
    ;
    var mv: [4]Move = undefined;
    _ = try parseMoves("B A3 W B2 B C2 W pass", 3, true, &mv);
    try std.testing.expectEqual(@as(f32, 0.01), policyAt(report, 3, mv[0]).?);
    try std.testing.expectEqual(@as(f32, 0.5), policyAt(report, 3, mv[1]).?);
    try std.testing.expectEqual(@as(f32, 0), policyAt(report, 3, mv[2]).?); // NAN (illegal) counts as 0
    try std.testing.expectEqual(@as(f32, 0.15), policyAt(report, 3, mv[3]).?);
    // A truncated or foreign report is not a probability.
    try std.testing.expect(policyAt("symmetry 0\npolicy\n0.1 0.2", 3, mv[1]) == null);
    try std.testing.expect(policyAt("whiteWin 0.5", 3, mv[0]) == null);
    try std.testing.expect(policyAt("policy -1 0 0 0 0 0 0 0 0", 3, mv[0]) == null);
}
