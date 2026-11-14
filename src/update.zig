//! Update check: one of the app's two kinds of network request (the other is
//! an optional model download the player starts, models.zig).
//!
//! The page asks for it (the user picks "Check for updates…", or turned on
//! the weekly check, which is off by default). A short-lived thread makes
//! one HTTPS GET to GitHub's "latest release" API for this repository and
//! nothing else: no identifiers, no version, no cookies. It goes through
//! the proxy the environment or the system names (net_proxy.zig), else directly. The result is
//! handed to the UI thread the same way KataGo results are (a locked slot
//! plus the platform's thread-safe `wake`), and the UI thread answers the
//! waiting `studio.checkUpdate` call. Nothing here touches the webview.
//!
//! `std.http.Client` has no socket timeout, so the deadline lives on the
//! UI side (`timeout_ms`): a check that outlives it is answered with
//! `Timeout`, and whatever its thread produces later is dropped.
//!
//! The checker also remembers the tag its own last successful check
//! returned (`lastTag`). The installer accepts only that tag, and only if
//! it is newer than the running version (`isNewer`): the page cannot ask
//! for an older release (a downgrade to a version with a known bug) or for
//! a tag nobody checked.
const std = @import("std");
const json = @import("json.zig");
const net = @import("net.zig");
const net_tunnel = @import("net_tunnel.zig");

pub const releases_api_url = "https://api.github.com/repos/hxddh/goban-studio/releases/latest";
/// The one page `studio.openReleasePage` opens.
pub const releases_page_url = "https://github.com/hxddh/goban-studio/releases/latest";
/// A release's own page is accepted as `url` only under this prefix.
const release_url_prefix = "https://github.com/hxddh/goban-studio/releases/";
const user_agent = "GobanStudio-update-check";

/// The UI gives up after this long.
pub const timeout_ms: i64 = 15_000;
/// Checks whose threads are still running (timed out, hung) before a new
/// one is refused with `Busy`.
const max_running: u32 = 3;
const max_response_bytes = 512 * 1024;
/// Release notes are trimmed to this many bytes (on a UTF-8 boundary).
pub const max_notes_bytes = 8 * 1024;
/// Worst case: every notes byte escaped as \u00XX.
pub const max_reply_bytes = max_notes_bytes * 6 + 2048;

pub const WakeFn = *const fn (context: ?*anyopaque) anyerror!void;

pub const Checker = struct {
    io: std.Io = undefined,
    lock: std.Io.Mutex = .init,
    /// Where the proxy settings are read from (net_proxy.zig); set once by
    /// `main`. Null: always connect directly.
    env: ?*const std.process.Environ.Map = null,

    // --- guarded by `lock`
    /// The generation the UI thread is waiting for; anything else is stale.
    wanted: u64 = 0,
    ready: bool = false,
    reply: [max_reply_bytes]u8 = undefined,
    reply_len: usize = 0,
    running: u32 = 0,
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,
    /// The `latest` tag of the last check the UI thread waited for and
    /// that succeeded; empty until then.
    last_tag: [64]u8 = undefined,
    last_tag_len: usize = 0,

    pub fn init(self: *Checker, io: std.Io) void {
        self.* = .{};
        self.io = io;
    }

    pub fn setWake(self: *Checker, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    /// Start a check on its own thread. UI thread. Returns its generation.
    pub fn start(self: *Checker) !u64 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.running >= max_running) return error.Busy;
        self.wanted += 1;
        self.ready = false;
        self.reply_len = 0;
        const gen = self.wanted;
        const thread = try std.Thread.spawn(.{ .stack_size = 4 * 1024 * 1024 }, run, .{ self, gen });
        thread.detach();
        self.running += 1;
        return gen;
    }

    /// Stop waiting for `gen` (timed out). UI thread.
    pub fn abandon(self: *Checker, gen: u64) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.wanted == gen) {
            self.wanted += 1;
            self.ready = false;
        }
    }

    /// The tag of the last successful check ("" before one). UI thread.
    pub fn lastTag(self: *Checker, out: *[64]u8) []const u8 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        @memcpy(out[0..self.last_tag_len], self.last_tag[0..self.last_tag_len]);
        return out[0..self.last_tag_len];
    }

    /// The finished reply for `gen`, copied into `out`. UI thread.
    pub fn take(self: *Checker, gen: u64, out: []u8) ?[]const u8 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.ready or self.wanted != gen) return null;
        const n = @min(self.reply_len, out.len);
        @memcpy(out[0..n], self.reply[0..n]);
        self.ready = false;
        return out[0..n];
    }

    // ------------------------------------------------------ check thread

    fn finish(self: *Checker, gen: u64, reply: []const u8) void {
        self.lock.lockUncancelable(self.io);
        self.running -= 1;
        const wanted = self.wanted == gen and reply.len <= self.reply.len;
        if (wanted) {
            @memcpy(self.reply[0..reply.len], reply);
            self.reply_len = reply.len;
            self.ready = true;
            if (replyTag(reply)) |tag| {
                @memcpy(self.last_tag[0..tag.len], tag);
                self.last_tag_len = tag.len;
            }
        }
        const wake_fn = self.wake_fn;
        const wake_context = self.wake_context;
        self.lock.unlock(self.io);
        if (wanted) {
            if (wake_fn) |f| f(wake_context) catch {};
        }
    }

    fn run(self: *Checker, gen: u64) void {
        const allocator = std.heap.page_allocator;
        const reply_buf = allocator.alloc(u8, max_reply_bytes) catch {
            self.finish(gen, "{\"ok\":false,\"error\":\"OutOfMemory\"}");
            return;
        };
        defer allocator.free(reply_buf);
        const response_buf = allocator.alloc(u8, max_response_bytes) catch {
            self.finish(gen, "{\"ok\":false,\"error\":\"OutOfMemory\"}");
            return;
        };
        defer allocator.free(response_buf);
        const reply = check(allocator, self.io, self.env, response_buf, reply_buf);
        self.finish(gen, reply);
    }
};

/// One GET of the latest-release document; returns the reply for the page.
pub fn check(
    allocator: std.mem.Allocator,
    io: std.Io,
    env: ?*const std.process.Environ.Map,
    response_buf: []u8,
    reply_buf: []u8,
) []const u8 {
    // Through the proxy the environment or the system names, if any.
    var session: net_tunnel.Session = undefined;
    session.init(allocator, io, env, "api.github.com");
    defer session.deinit();
    return checkWith(&session, allocator, response_buf, reply_buf);
}

/// `check` with a caller-made session.
pub fn checkWith(session: *net_tunnel.Session, allocator: std.mem.Allocator, response_buf: []u8, reply_buf: []u8) []const u8 {
    const result = net.get(session, releases_api_url, user_agent, &.{
        .{ .name = "accept", .value = "application/vnd.github+json" },
        .{ .name = "x-github-api-version", .value = "2022-11-28" },
    }, response_buf) catch |err| return errorReply(reply_buf, switch (err) {
        error.TooLarge => "ResponseTooLarge",
        else => "Network",
    });
    return statusReply(allocator, result.status, result.body, reply_buf);
}

/// The reply for an answer of the releases API.
pub fn statusReply(allocator: std.mem.Allocator, status: u16, body: []const u8, reply_buf: []u8) []const u8 {
    if (status == 404) return errorReply(reply_buf, "NoRelease");
    if (status == 403 or status == 429) return errorReply(reply_buf, "RateLimited");
    if (status != 200) return errorReply(reply_buf, "HttpStatus");
    return releaseReply(allocator, body, reply_buf);
}

const Release = struct {
    tag_name: []const u8 = "",
    html_url: []const u8 = "",
    body: ?[]const u8 = null,
    published_at: ?[]const u8 = null,
    draft: bool = false,
    prerelease: bool = false,
};

/// Turn GitHub's release JSON into `{ok, latest, url, notes, publishedAt}`.
pub fn releaseReply(allocator: std.mem.Allocator, json_text: []const u8, out: []u8) []const u8 {
    const parsed = std.json.parseFromSlice(Release, allocator, json_text, .{ .ignore_unknown_fields = true }) catch
        return errorReply(out, "BadResponse");
    defer parsed.deinit();
    const r = parsed.value;
    if (!validTag(r.tag_name)) return errorReply(out, "BadResponse");
    const url = if (validReleaseUrl(r.html_url)) r.html_url else releases_page_url;
    var n: usize = 0;
    const ok = json.append(out, &n, "{\"ok\":true,\"latest\":") and
        json.appendString(out, &n, r.tag_name) and
        json.append(out, &n, ",\"url\":") and
        json.appendString(out, &n, url) and
        json.append(out, &n, ",\"notes\":") and
        json.appendString(out, &n, trimUtf8(r.body orelse "", max_notes_bytes)) and
        json.append(out, &n, ",\"publishedAt\":") and
        json.appendString(out, &n, if (r.published_at) |p| (if (p.len <= 40) p else "") else "") and
        json.append(out, &n, if (r.prerelease) ",\"prerelease\":true}" else ",\"prerelease\":false}");
    if (!ok) return errorReply(out, "ResponseTooLarge");
    return out[0..n];
}

fn errorReply(out: []u8, name: []const u8) []const u8 {
    var n: usize = 0;
    if (json.append(out, &n, "{\"ok\":false,\"error\":") and json.appendString(out, &n, name) and json.append(out, &n, "}")) return out[0..n];
    return "{\"ok\":false}";
}

/// The `latest` tag of a successful reply built by `releaseReply` (it
/// starts with exactly this and the tag needs no escaping), else null.
pub fn replyTag(reply: []const u8) ?[]const u8 {
    const head = "{\"ok\":true,\"latest\":\"";
    if (!std.mem.startsWith(u8, reply, head)) return null;
    const rest = reply[head.len..];
    const end = std.mem.indexOfScalar(u8, rest, '"') orelse return null;
    const tag = rest[0..end];
    return if (validTag(tag)) tag else null;
}

/// A version as update.js parses it: "v4.1.0", "4.1", "4.1.0-beta.2",
/// build metadata ignored.
pub const Version = struct {
    major: u64 = 0,
    minor: u64 = 0,
    patch: u64 = 0,
    /// The pre-release, without the dash ("" for a release).
    pre: []const u8 = "",

    pub fn parse(text: []const u8) ?Version {
        var t = std.mem.trim(u8, text, " \t");
        if (t.len > 0 and t[0] == 'v') t = t[1..];
        if (std.mem.indexOfScalar(u8, t, '+')) |plus| {
            if (!validIdents(t[plus + 1 ..])) return null;
            t = t[0..plus];
        }
        var v = Version{};
        if (std.mem.indexOfScalar(u8, t, '-')) |dash| {
            v.pre = t[dash + 1 ..];
            if (!validIdents(v.pre)) return null;
            t = t[0..dash];
        }
        var parts = std.mem.splitScalar(u8, t, '.');
        const fields = [_]*u64{ &v.major, &v.minor, &v.patch };
        var i: usize = 0;
        while (parts.next()) |p| : (i += 1) {
            if (i >= fields.len or p.len == 0) return null;
            for (p) |c| if (!std.ascii.isDigit(c)) return null;
            fields[i].* = std.fmt.parseInt(u64, p, 10) catch return null;
        }
        if (i == 0) return null;
        return v;
    }

    fn validIdents(s: []const u8) bool {
        if (s.len == 0) return false;
        for (s) |c| if (!(std.ascii.isAlphanumeric(c) or c == '.' or c == '-')) return false;
        return true;
    }

    fn isNumeric(s: []const u8) bool {
        if (s.len == 0) return false;
        for (s) |c| if (!std.ascii.isDigit(c)) return false;
        return true;
    }

    /// Semver order: a release outranks its pre-releases; pre-release
    /// identifiers compare numerically when both are numbers, a number
    /// sorts before a word, words compare as ASCII.
    pub fn order(a: Version, b: Version) std.math.Order {
        inline for (.{ "major", "minor", "patch" }) |k| {
            const o = std.math.order(@field(a, k), @field(b, k));
            if (o != .eq) return o;
        }
        if (a.pre.len == 0 and b.pre.len == 0) return .eq;
        if (a.pre.len == 0) return .gt;
        if (b.pre.len == 0) return .lt;
        var ia = std.mem.splitScalar(u8, a.pre, '.');
        var ib = std.mem.splitScalar(u8, b.pre, '.');
        while (true) {
            const x = ia.next();
            const y = ib.next();
            if (x == null and y == null) return .eq;
            if (x == null) return .lt;
            if (y == null) return .gt;
            const nx = isNumeric(x.?);
            const ny = isNumeric(y.?);
            if (nx and ny) {
                const vx = std.fmt.parseInt(u64, x.?, 10) catch return .eq;
                const vy = std.fmt.parseInt(u64, y.?, 10) catch return .eq;
                const o = std.math.order(vx, vy);
                if (o != .eq) return o;
            } else if (nx != ny) {
                return if (nx) .lt else .gt;
            } else {
                const o = std.mem.order(u8, x.?, y.?);
                if (o != .eq) return o;
            }
        }
    }
};

/// Is `latest` a newer version than `current`? False when either does not
/// parse: an unknown version is never an upgrade.
pub fn isNewer(latest: []const u8, current: []const u8) bool {
    const a = Version.parse(latest) orelse return false;
    const b = Version.parse(current) orelse return false;
    return a.order(b) == .gt;
}

pub fn validTag(tag: []const u8) bool {
    if (tag.len == 0 or tag.len > 64) return false;
    for (tag) |c| {
        if (!(std.ascii.isAlphanumeric(c) or c == '.' or c == '-' or c == '+' or c == '_')) return false;
    }
    return true;
}

fn validReleaseUrl(url: []const u8) bool {
    if (url.len > 256 or !std.mem.startsWith(u8, url, release_url_prefix)) return false;
    for (url[release_url_prefix.len..]) |c| {
        if (!(std.ascii.isAlphanumeric(c) or c == '.' or c == '-' or c == '+' or c == '_' or c == '/')) return false;
    }
    return true;
}

/// At most `max` bytes of `text`, not cutting a UTF-8 sequence.
pub fn trimUtf8(text: []const u8, max: usize) []const u8 {
    if (text.len <= max) return text;
    var end = max;
    while (end > 0 and (text[end] & 0xC0) == 0x80) end -= 1;
    return text[0..end];
}

test "release reply keeps tag, url and notes" {
    var out: [4096]u8 = undefined;
    const release_json =
        \\{"tag_name":"v4.0.0","html_url":"https://github.com/hxddh/goban-studio/releases/tag/v4.0.0",
        \\ "body":"Line one\nLine \"two\"\u0001","published_at":"2026-11-01T00:00:00Z","author":{"login":"x"},"draft":false,"prerelease":false}
    ;
    const reply = releaseReply(std.testing.allocator, release_json, &out);
    try std.testing.expectEqualStrings(
        "{\"ok\":true,\"latest\":\"v4.0.0\",\"url\":\"https://github.com/hxddh/goban-studio/releases/tag/v4.0.0\",\"notes\":\"Line one\\nLine \\\"two\\\"\\u0001\",\"publishedAt\":\"2026-11-01T00:00:00Z\",\"prerelease\":false}",
        reply,
    );
}

test "a foreign url falls back to the fixed releases page" {
    var out: [4096]u8 = undefined;
    const reply = releaseReply(std.testing.allocator, "{\"tag_name\":\"v4.0.1\",\"html_url\":\"https://evil.example/x\"}", &out);
    try std.testing.expect(std.mem.indexOf(u8, reply, "\"url\":\"" ++ releases_page_url ++ "\"") != null);
}

test "a bad tag or body is an error reply" {
    var out: [512]u8 = undefined;
    try std.testing.expectEqualStrings("{\"ok\":false,\"error\":\"BadResponse\"}", releaseReply(std.testing.allocator, "{\"tag_name\":\"<script>\"}", &out));
    try std.testing.expectEqualStrings("{\"ok\":false,\"error\":\"BadResponse\"}", releaseReply(std.testing.allocator, "not json", &out));
}

test "notes are trimmed on a UTF-8 boundary" {
    try std.testing.expectEqualStrings("ab", trimUtf8("ab\xe5\x9b\xb4", 4));
    try std.testing.expectEqualStrings("ab\xe5\x9b\xb4", trimUtf8("ab\xe5\x9b\xb4", 5));
}

test "the tag of a successful reply is remembered, nothing else" {
    var out: [4096]u8 = undefined;
    const reply = releaseReply(std.testing.allocator, "{\"tag_name\":\"v13.1.0\"}", &out);
    try std.testing.expectEqualStrings("v13.1.0", replyTag(reply).?);
    try std.testing.expect(replyTag("{\"ok\":false,\"error\":\"Network\"}") == null);
    try std.testing.expect(replyTag("{\"ok\":true,\"latest\":\"<x>\"}") == null);

    var c: Checker = .{};
    c.init(std.testing.io);
    var tag_buf: [64]u8 = undefined;
    try std.testing.expectEqualStrings("", c.lastTag(&tag_buf));
    // A reply nobody waits for (abandoned, stale) is not remembered.
    c.running = 1;
    c.wanted = 2;
    c.finish(1, reply);
    try std.testing.expectEqualStrings("", c.lastTag(&tag_buf));
    c.running = 1;
    c.finish(2, reply);
    try std.testing.expectEqualStrings("v13.1.0", c.lastTag(&tag_buf));
    // A failed check keeps the last good tag.
    c.running = 1;
    c.wanted = 3;
    c.finish(3, "{\"ok\":false,\"error\":\"Network\"}");
    try std.testing.expectEqualStrings("v13.1.0", c.lastTag(&tag_buf));
}

test "versions compare as semver, like update.js" {
    try std.testing.expect(isNewer("v13.0.0", "12.0.0"));
    try std.testing.expect(isNewer("v12.0.1", "12.0.0"));
    try std.testing.expect(isNewer("v12.1", "12.0.9"));
    try std.testing.expect(!isNewer("v12.0.0", "12.0.0"));
    try std.testing.expect(!isNewer("v11.9.9", "12.0.0"));
    try std.testing.expect(!isNewer("v12.0.0-beta.1", "12.0.0"));
    try std.testing.expect(isNewer("v12.0.0", "12.0.0-rc.1"));
    try std.testing.expect(isNewer("v12.0.0-rc.2", "12.0.0-rc.1"));
    try std.testing.expect(isNewer("v12.0.0-rc.10", "12.0.0-rc.9"));
    try std.testing.expect(isNewer("v12.0.0-rc", "12.0.0-1"));
    try std.testing.expect(isNewer("v12.0.0-rc.1.1", "12.0.0-rc.1"));
    try std.testing.expect(!isNewer("v12.0.0+build.5", "12.0.0"));
    for ([_][]const u8{ "", "v", "latest", "v1..2", "v1.2.3.4", "v1.x", "v1.2.3-", "v-1" }) |bad| {
        try std.testing.expect(!isNewer(bad, "0.0.1"));
        try std.testing.expect(Version.parse(bad) == null);
    }
}
