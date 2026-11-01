//! KataGo sidecar for every board size.
//!
//! The web layer owns the game; this module owns one persistent KataGo GTP
//! process. The page sends a short, validated GTP script describing the
//! position (clear_board / boardsize / komi / play ...), and gets either one
//! move back (`move`) or a full search report (`analyze`: win rate, score
//! lead, candidate moves and ownership) that drives the opponent, hints,
//! review and dead-stone marking. A missing or unusable engine is not fatal:
//! the bridge returns an error and the page falls back to its local opponent.
const std = @import("std");

const bin_name = if (@import("builtin").os.tag == .windows) "katago.exe" else "katago";

pub const Engine = struct {
    io: std.Io = undefined,
    env_map: *std.process.Environ.Map = undefined,
    child: ?std.process.Child = null,
    stdin: ?std.Io.File = null,
    stdout: ?std.Io.File = null,
    reader: std.Io.File.Reader = undefined,
    reader_ready: bool = false,
    read_buf: [64 * 1024]u8 = undefined,
    exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    bin_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    model_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    config_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    version_path: [std.Io.Dir.max_path_bytes]u8 = undefined,
    info_buf: [96 * 1024]u8 = undefined,
    info_len: usize = 0,
    play_buf: [16]u8 = undefined,
    play_len: usize = 0,

    pub fn init(self: *@This(), io: std.Io, env_map: *std.process.Environ.Map) void {
        self.io = io;
        self.env_map = env_map;
    }

    pub fn deinit(self: *@This(), io: std.Io) void {
        if (self.child) |*child| {
            child.kill(io);
            self.child = null;
        }
        self.stdin = null;
        self.stdout = null;
        self.reader_ready = false;
    }

    const Paths = struct {
        binary: []const u8,
        model: []const u8,
        config: []const u8,
        version: []const u8,
    };

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
        candidates[count] = "frontend/dist/engine";
        count += 1;
        candidates[count] = "engine";
        count += 1;

        for (candidates[0..count]) |root| {
            const abs_root = if (std.fs.path.isAbsolute(root)) root else if (cwd_len > 0)
                (join(&abs_buf, &.{ cwd_buf[0..cwd_len], root }) orelse continue)
            else
                continue;
            const bin = join(&bin_buf, &.{ abs_root, platform, bin_name }) orelse continue;
            const model = join(&model_buf, &.{ abs_root, "model", "model.txt.gz" }) orelse continue;
            const config = join(&cfg_buf, &.{ abs_root, "model", "gtp.cfg" }) orelse continue;
            const version = join(&version_buf, &.{ abs_root, "model", "version.txt" }) orelse continue;
            if (!exists(self.io, bin)) continue;
            if (!exists(self.io, model)) continue;
            if (!exists(self.io, config)) continue;
            @memcpy(self.bin_path[0..bin.len], bin);
            @memcpy(self.model_path[0..model.len], model);
            @memcpy(self.config_path[0..config.len], config);
            @memcpy(self.version_path[0..version.len], version);
            return .{
                .binary = self.bin_path[0..bin.len],
                .model = self.model_path[0..model.len],
                .config = self.config_path[0..config.len],
                .version = if (exists(self.io, version)) self.version_path[0..version.len] else "KataGo",
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

        var override_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const log_dir = self.env_map.get("TMPDIR") orelse self.env_map.get("TEMP") orelse self.env_map.get("TMP") orelse ".";
        const override = std.fmt.bufPrint(
            &override_buf,
            "logDir={s},homeDataDir={s},logAllGTPCommunication=false,logSearchInfo=false,logToStderr=false,ponderingEnabled=false,allowResignation=false",
            .{ log_dir, log_dir },
        ) catch return error.EngineMissing;

        var child = try std.process.spawn(self.io, .{
            .argv = &.{
                resolved.binary,
                "gtp",
                "-model",
                resolved.model,
                "-config",
                resolved.config,
                "-override-config",
                override,
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
        self.stdin = stdin;
        self.stdout = stdout;
        self.reader = std.Io.File.Reader.init(stdout, self.io, &self.read_buf);
        self.reader_ready = true;
    }

    fn writeAll(self: *@This(), text: []const u8) !void {
        const file = self.stdin orelse return error.EngineMissing;
        try file.writeStreamingAll(self.io, text);
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

    fn command(self: *@This(), text: []const u8) ![]const u8 {
        try self.writeAll(text);
        try self.writeAll("\n");
        return self.readReply();
    }

    pub fn validateLine(line: []const u8) bool {
        const allowed = [_][]const u8{
            "clear_board",
            "boardsize ",
            "komi ",
            "play ",
            "kata-set-param ",
            "kata-set-rules ",
            "time_settings ",
        };
        for (allowed) |prefix| {
            if (std.mem.eql(u8, line, prefix) or std.mem.startsWith(u8, line, prefix)) return true;
        }
        return false;
    }

    fn runScript(self: *@This(), script: []const u8) !void {
        var lines = std.mem.splitScalar(u8, script, '\n');
        var count: usize = 0;
        while (lines.next()) |raw| {
            const line = std.mem.trim(u8, raw, " \t\r");
            if (line.len == 0) continue;
            if (!validateLine(line)) return error.InvalidRequest;
            _ = try self.command(line);
            count += 1;
            if (count > 900) return error.InvalidRequest;
        }
    }

    /// `script` is newline-separated GTP setup commands generated by the
    /// page. Anything outside the narrow setup vocabulary is rejected before
    /// it reaches the child process.
    pub fn move(self: *@This(), script: []const u8, color: []const u8) ![]const u8 {
        if (!std.mem.eql(u8, color, "B") and !std.mem.eql(u8, color, "W")) return error.InvalidRequest;
        try self.start();
        errdefer self.deinit(self.io);
        try self.runScript(script);
        var cmd_buf: [32]u8 = undefined;
        const genmove = std.fmt.bufPrint(&cmd_buf, "genmove {s}", .{color}) catch return error.InvalidRequest;
        return self.command(genmove);
    }

    pub const Analysis = struct {
        info: []const u8,
        play: []const u8,
    };

    /// Set up the position and search it with ownership. The search budget
    /// comes from the script's `kata-set-param maxVisits` line. Prefers
    /// `kata-search_analyze` (one final report, no move played); older
    /// engines fall back to `kata-genmove_analyze` with frequent reports.
    /// Returns the final `info` report and, when the engine names one, the
    /// move it would play (otherwise the page takes the top candidate).
    pub fn analyze(self: *@This(), script: []const u8, color: []const u8) !Analysis {
        if (!std.mem.eql(u8, color, "B") and !std.mem.eql(u8, color, "W")) return error.InvalidRequest;
        try self.start();
        errdefer self.deinit(self.io);
        try self.runScript(script);
        var cmd_buf: [80]u8 = undefined;
        const search = std.fmt.bufPrint(&cmd_buf, "kata-search_analyze {s} ownership true", .{color}) catch return error.InvalidRequest;
        try self.writeAll(search);
        try self.writeAll("\n");
        self.readAnalysis() catch |err| switch (err) {
            error.EngineRejected => {
                const fallback = std.fmt.bufPrint(&cmd_buf, "kata-genmove_analyze {s} interval 1 ownership true", .{color}) catch return error.InvalidRequest;
                try self.writeAll(fallback);
                try self.writeAll("\n");
                try self.readAnalysis();
            },
            else => return err,
        };
        return .{ .info = self.info_buf[0..self.info_len], .play = self.play_buf[0..self.play_len] };
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

    /// A GTP response is "=" followed by lines and closed by an empty line.
    fn readAnalysis(self: *@This()) !void {
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
        }
        return error.EngineProtocol;
    }
};

test "engine script vocabulary is narrow" {
    try std.testing.expect(Engine.validateLine("clear_board"));
    try std.testing.expect(Engine.validateLine("boardsize 19"));
    try std.testing.expect(Engine.validateLine("kata-set-param maxVisits 200"));
    try std.testing.expect(!Engine.validateLine("genmove B"));
    try std.testing.expect(!Engine.validateLine("kata-genmove_analyze B"));
    try std.testing.expect(!Engine.validateLine("quit"));
    try std.testing.expect(!Engine.validateLine("loadsgf /etc/passwd"));
}
