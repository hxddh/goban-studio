//! What a KataGo request and its result are: moves, positions and rules
//! as the page sends them, the human-policy rows, and what a finished
//! search hands back to the UI thread. engine.zig has the overview.
const std = @import("std");
const engine_mod = @import("engine.zig");

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
    slot: engine_mod.Slot = .standard,
    /// Human slot only: a `validProfile` and the move-choice style.
    profile: [engine_mod.max_profile]u8 = undefined,
    profile_len: usize = 0,
    style: engine_mod.HumanStyle = .raw,
    /// Human policy only: the profiles to read (each a `validProfile`), the
    /// first move index to score, and the positions to score at most.
    policy_profiles: [max_policy_profiles][engine_mod.max_profile]u8 = undefined,
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
    names: [max_policy_profiles][engine_mod.max_profile]u8 = undefined,
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
