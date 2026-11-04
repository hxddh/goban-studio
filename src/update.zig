//! Update check: one of the app's two kinds of network request (the other is
//! an optional model download the player starts, models.zig).
//!
//! The page asks for it (the user picks "Check for updates…", or turned on
//! the weekly check, which is off by default). A short-lived thread makes
//! one HTTPS GET to GitHub's "latest release" API for this repository and
//! nothing else: no identifiers, no version, no cookies. The result is
//! handed to the UI thread the same way KataGo results are (a locked slot
//! plus the platform's thread-safe `wake`), and the UI thread answers the
//! waiting `studio.checkUpdate` call. Nothing here touches the webview.
//!
//! `std.http.Client` has no socket timeout, so the deadline lives on the
//! UI side (`timeout_ms`): a check that outlives it is answered with
//! `Timeout`, and whatever its thread produces later is dropped.
const std = @import("std");

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

    // --- guarded by `lock`
    /// The generation the UI thread is waiting for; anything else is stale.
    wanted: u64 = 0,
    ready: bool = false,
    reply: [max_reply_bytes]u8 = undefined,
    reply_len: usize = 0,
    running: u32 = 0,
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,

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
        const reply = check(allocator, self.io, response_buf, reply_buf);
        self.finish(gen, reply);
    }
};

/// One GET of the latest-release document; returns the reply for the page.
pub fn check(allocator: std.mem.Allocator, io: std.Io, response_buf: []u8, reply_buf: []u8) []const u8 {
    // No proxy configuration: the app talks to GitHub directly or not at all.
    var client: std.http.Client = .{ .allocator = allocator, .io = io };
    defer client.deinit();
    return checkWith(&client, allocator, response_buf, reply_buf);
}

/// `check` with a caller-made client (tests behind a proxy).
pub fn checkWith(client: *std.http.Client, allocator: std.mem.Allocator, response_buf: []u8, reply_buf: []u8) []const u8 {
    var writer = std.Io.Writer.fixed(response_buf);
    const result = client.fetch(.{
        .location = .{ .url = releases_api_url },
        .method = .GET,
        .keep_alive = false,
        .headers = .{
            .user_agent = .{ .override = user_agent },
            .accept_encoding = .omit,
        },
        .extra_headers = &.{
            .{ .name = "accept", .value = "application/vnd.github+json" },
            .{ .name = "x-github-api-version", .value = "2022-11-28" },
        },
        .response_writer = &writer,
    }) catch |err| return errorReply(reply_buf, switch (err) {
        error.WriteFailed => "ResponseTooLarge",
        else => "Network",
    });
    const status = @intFromEnum(result.status);
    if (status == 404) return errorReply(reply_buf, "NoRelease");
    if (status == 403 or status == 429) return errorReply(reply_buf, "RateLimited");
    if (status != 200) return errorReply(reply_buf, "HttpStatus");
    return releaseReply(allocator, writer.buffered(), reply_buf);
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
    const ok = append(out, &n, "{\"ok\":true,\"latest\":") and
        appendString(out, &n, r.tag_name) and
        append(out, &n, ",\"url\":") and
        appendString(out, &n, url) and
        append(out, &n, ",\"notes\":") and
        appendString(out, &n, trimUtf8(r.body orelse "", max_notes_bytes)) and
        append(out, &n, ",\"publishedAt\":") and
        appendString(out, &n, if (r.published_at) |p| (if (p.len <= 40) p else "") else "") and
        append(out, &n, if (r.prerelease) ",\"prerelease\":true}" else ",\"prerelease\":false}");
    if (!ok) return errorReply(out, "ResponseTooLarge");
    return out[0..n];
}

fn errorReply(out: []u8, name: []const u8) []const u8 {
    var n: usize = 0;
    if (append(out, &n, "{\"ok\":false,\"error\":") and appendString(out, &n, name) and append(out, &n, "}")) return out[0..n];
    return "{\"ok\":false}";
}

fn validTag(tag: []const u8) bool {
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

fn append(buf: []u8, n: *usize, text: []const u8) bool {
    if (n.* + text.len > buf.len) return false;
    @memcpy(buf[n.*..][0..text.len], text);
    n.* += text.len;
    return true;
}

/// A JSON string; control characters become \u00XX.
fn appendString(buf: []u8, n: *usize, text: []const u8) bool {
    if (!append(buf, n, "\"")) return false;
    for (text) |c| {
        const ok = switch (c) {
            '"' => append(buf, n, "\\\""),
            '\\' => append(buf, n, "\\\\"),
            '\n' => append(buf, n, "\\n"),
            '\r' => append(buf, n, "\\r"),
            '\t' => append(buf, n, "\\t"),
            else => if (c < 0x20) blk: {
                var esc: [6]u8 = undefined;
                const s = std.fmt.bufPrint(&esc, "\\u{x:0>4}", .{c}) catch break :blk false;
                break :blk append(buf, n, s);
            } else append(buf, n, &[_]u8{c}),
        };
        if (!ok) return false;
    }
    return append(buf, n, "\"");
}

test "release reply keeps tag, url and notes" {
    var out: [4096]u8 = undefined;
    const json =
        \\{"tag_name":"v4.0.0","html_url":"https://github.com/hxddh/goban-studio/releases/tag/v4.0.0",
        \\ "body":"Line one\nLine \"two\"\u0001","published_at":"2026-11-01T00:00:00Z","author":{"login":"x"},"draft":false,"prerelease":false}
    ;
    const reply = releaseReply(std.testing.allocator, json, &out);
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
