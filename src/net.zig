//! What the app's three kinds of network request share: the update check
//! (update.zig), the update download (install.zig) and the optional model
//! downloads (models.zig).
//!
//!   * Proxy. Many players reach GitHub only through a proxy. Each request
//!     uses, in this order: the environment (`HTTPS_PROXY`, `https_proxy`,
//!     `ALL_PROXY`, `all_proxy`, unless `NO_PROXY` names the host), then
//!     the system's manual HTTPS proxy (macOS: `scutil --proxy`; Windows:
//!     the Internet Settings registry values, read with `reg.exe`). Only
//!     plain HTTP proxies are used (`http://host:port`): the app asks the
//!     proxy for a tunnel (CONNECT) and speaks TLS with GitHub through it,
//!     so the proxy sees the host name and nothing else. SOCKS proxies,
//!     TLS-to-the-proxy (`https://`) and proxy auto-config (PAC) scripts
//!     are not. No proxy found means a direct connection, and when no
//!     tunnel can be set up (the proxy is not there, refuses, or the TLS
//!     handshake through it fails) the request goes out directly, as every
//!     request did before the app read proxy settings.
//!   * One GET. `fetch` follows redirects by hand, only over HTTPS and only
//!     to the hosts the request names (GitHub's own download hosts unless
//!     the caller says otherwise: models.zig adds KataGo's network
//!     server, nothing else does), and can continue a file that is
//!     partly on disk with an HTTP Range request; when the server ignores
//!     the range it starts over. The bytes go to a `Sink`, which is also
//!     how a transfer is cancelled. `get` is the same for a small reply
//!     that is kept in memory (the update check).
//!
//! A direct request is made by `std.http.Client`. That client cannot speak
//! TLS through a CONNECT tunnel (it would send the request in the clear
//! into the tunnel), so a proxied request is made here: a TCP connection
//! to the proxy, CONNECT, then `std.crypto.tls.Client` with the same
//! certificate bundle and host verification as the direct path, and
//! `std.http.Reader` for the response.
//!
//! Nothing here has a socket timeout: the callers watch for stalls from
//! another thread and abandon the request.
//!
//! The rest is split by concern:
//!
//!   net_proxy.zig   which proxy a request uses: environment, macOS, Windows
//!   net_tunnel.zig  the session, and a TLS connection through a proxy's tunnel

const std = @import("std");
const net_proxy = @import("net_proxy.zig");
const net_tunnel = @import("net_tunnel.zig");

/// GitHub answers a release download with a redirect to one of these.
pub const github_hosts = [_][]const u8{
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
};
pub const max_redirects = 5;

/// The host of an HTTPS address with a path: no user info or port,
/// printable ASCII without spaces or backslashes. Null for anything else.
pub fn httpsHost(url: []const u8) ?[]const u8 {
    const scheme = "https://";
    if (url.len > 4096 or !std.mem.startsWith(u8, url, scheme)) return null;
    for (url) |c| {
        if (c <= 0x20 or c >= 0x7f or c == '\\') return null;
    }
    const rest = url[scheme.len..];
    const end = std.mem.indexOfAny(u8, rest, "/?#") orelse rest.len;
    if (end == rest.len or rest[end] != '/') return null;
    return rest[0..end];
}

/// An HTTPS address whose host is exactly one of `hosts`.
pub fn allowedUrl(url: []const u8, hosts: []const []const u8) bool {
    const host = httpsHost(url) orelse return false;
    for (hosts) |allowed| {
        if (std.mem.eql(u8, host, allowed)) return true;
    }
    return false;
}

/// A redirect target for an update request: HTTPS, host exactly one of
/// GitHub's download hosts.
pub fn allowedRedirect(url: []const u8) bool {
    return allowedUrl(url, &github_hosts);
}

// ------------------------------------------------------------------ fetch// ------------------------------------------------------------------ fetch

pub const ContentRange = struct { first: u64, last: u64, total: u64 };

/// `bytes <first>-<last>/<total>`.
pub fn parseContentRange(value: []const u8) ?ContentRange {
    const v = std.mem.trim(u8, value, " \t");
    if (!std.mem.startsWith(u8, v, "bytes ")) return null;
    const rest = v["bytes ".len..];
    const dash = std.mem.indexOfScalar(u8, rest, '-') orelse return null;
    const slash = std.mem.indexOfScalar(u8, rest, '/') orelse return null;
    if (slash < dash) return null;
    const first = std.fmt.parseInt(u64, rest[0..dash], 10) catch return null;
    const last = std.fmt.parseInt(u64, rest[dash + 1 .. slash], 10) catch return null;
    const total = std.fmt.parseInt(u64, rest[slash + 1 ..], 10) catch return null;
    if (last < first or last >= total) return null;
    return .{ .first = first, .last = last, .total = total };
}

pub const Plan = union(enum) {
    /// Nothing more to fetch: the bytes on disk are the whole file.
    complete,
    /// The range cannot be served (the file on disk is not a prefix of
    /// what the server has): forget it and ask again from the start.
    refetch,
    /// A body follows. `restart`: it is the whole file, not the rest.
    /// `total` is the file's full size, 0 when the server did not say.
    body: struct { restart: bool, total: u64 },
};

/// What a response to a GET that asked for `bytes=<offset>-` (no range
/// when `offset` is 0) means. `expected_size` is the file's size when it
/// is known beforehand.
pub fn planBody(
    status: u16,
    offset: u64,
    content_length: ?u64,
    content_range: ?[]const u8,
    expected_size: ?u64,
) error{ HttpStatus, SizeMismatch }!Plan {
    switch (status) {
        200 => {
            if (expected_size) |size| {
                if (content_length) |len| {
                    if (len != size) return error.SizeMismatch;
                }
            }
            return .{ .body = .{ .restart = offset > 0, .total = content_length orelse (expected_size orelse 0) } };
        },
        206 => {
            if (offset == 0) return error.HttpStatus;
            const range = parseContentRange(content_range orelse return error.SizeMismatch) orelse return error.SizeMismatch;
            if (range.first != offset or range.last + 1 != range.total) return error.SizeMismatch;
            if (expected_size) |size| {
                if (range.total != size) return error.SizeMismatch;
            }
            return .{ .body = .{ .restart = false, .total = range.total } };
        },
        416 => {
            if (offset == 0) return error.HttpStatus;
            if (expected_size) |size| {
                if (offset == size) return .complete;
            }
            return .refetch;
        },
        else => return error.HttpStatus,
    }
}

/// Where the bytes go. Every function may refuse with `error.Cancelled`
/// (the transfer was cancelled or replaced), which `fetch` passes on.
pub const Sink = struct {
    context: *anyopaque,
    /// Store `bytes` at `offset`.
    write: *const fn (context: *anyopaque, bytes: []const u8, offset: u64) anyerror!void,
    /// The server sends the file from the start: forget what is stored.
    restart: *const fn (context: *anyopaque) anyerror!void,
    /// `received` bytes are stored; `total` is the full size (0: unknown).
    /// Also called before each request. False cancels.
    progress: *const fn (context: *anyopaque, received: u64, total: u64) bool,
};

pub const Request = struct {
    url: []const u8,
    user_agent: []const u8,
    /// Bytes already stored; the transfer continues after them.
    offset: u64 = 0,
    expected_size: ?u64 = null,
    /// More than this is refused (`TooLarge`).
    max_bytes: u64,
    /// The hosts a redirect may lead to (always over HTTPS).
    redirect_hosts: []const []const u8 = &github_hosts,
};

pub const FetchError = error{
    Cancelled,
    Network,
    BadRedirect,
    HttpStatus,
    NoAsset,
    TooLarge,
    SizeMismatch,
};

/// One GET and the start of its answer, over either transport. Must stay
/// where it is between `open` and `close`.
const Exchange = struct {
    request: ?std.http.Client.Request = null,
    response: std.http.Client.Response = undefined,
    tunnel: ?*net_tunnel.Tunnel = null,
    status: u16 = 0,
    content_length: ?u64 = null,
    transfer_encoding: std.http.TransferEncoding = .none,
    identity: bool = true,
    location_buf: [4096]u8 = undefined,
    location_len: ?usize = null,
    range_buf: [96]u8 = undefined,
    range_len: ?usize = null,

    fn location(self: *const Exchange) ?[]const u8 {
        return if (self.location_len) |n| self.location_buf[0..n] else null;
    }

    fn contentRange(self: *const Exchange) ?[]const u8 {
        return if (self.range_len) |n| self.range_buf[0..n] else null;
    }

    /// Keep what `fetch` needs of the head (its bytes do not outlive the
    /// first read of the body).
    fn note(self: *Exchange, head: std.http.Client.Response.Head) void {
        self.status = @intFromEnum(head.status);
        self.content_length = head.content_length;
        self.transfer_encoding = head.transfer_encoding;
        self.identity = head.content_encoding == .identity;
        if (head.location) |l| {
            // One that does not fit is no acceptable target anyway.
            self.location_len = @min(l.len, self.location_buf.len);
            @memcpy(self.location_buf[0..self.location_len.?], l[0..self.location_len.?]);
            if (l.len > self.location_buf.len) self.location_len = 0;
        }
        var it = head.iterateHeaders();
        while (it.next()) |h| {
            if (!std.ascii.eqlIgnoreCase(h.name, "content-range")) continue;
            if (h.value.len > self.range_buf.len) continue;
            @memcpy(self.range_buf[0..h.value.len], h.value);
            self.range_len = h.value.len;
        }
    }

    fn open(self: *Exchange, session: *net_tunnel.Session, url: []const u8, user_agent: []const u8, headers: []const std.http.Header) !void {
        const uri = std.Uri.parse(url) catch return error.BadRedirect;
        if (!std.ascii.eqlIgnoreCase(uri.scheme, "https")) return error.BadRedirect;
        if (session.proxy) |*proxy| {
            var host_buf: [std.Io.net.HostName.max_len]u8 = undefined;
            const host = uri.getHost(&host_buf) catch return error.BadRedirect;
            if (net_tunnel.Tunnel.create(session, proxy, host.bytes, uri.port orelse 443, user_agent)) |tunnel| {
                self.tunnel = tunnel;
                errdefer {
                    tunnel.destroy();
                    self.tunnel = null;
                }
                const head_bytes = try tunnel.get(uri, user_agent, headers);
                self.note(std.http.Client.Response.Head.parse(head_bytes) catch return error.Network);
                return;
            } else |_| {
                // No tunnel (the proxy is not there, it refused, or the
                // handshake through it failed): a proxy setting must never
                // be worse than none, which is what the app had before it
                // read any. This session asks directly from now on.
                session.proxy = null;
            }
        }
        self.request = session.client.request(.GET, uri, .{
            .redirect_behavior = .unhandled,
            .keep_alive = false,
            .headers = .{
                .user_agent = .{ .override = user_agent },
                .accept_encoding = .omit,
            },
            .extra_headers = headers,
        }) catch return error.Network;
        errdefer {
            self.request.?.deinit();
            self.request = null;
        }
        const req = &self.request.?;
        req.sendBodiless() catch return error.Network;
        self.response = req.receiveHead(&.{}) catch return error.Network;
        // Never drain an unwanted body on the way out.
        if (req.connection) |c| c.closing = true;
        self.note(self.response.head);
    }

    fn body(self: *Exchange, transfer_buffer: []u8) *std.Io.Reader {
        if (self.tunnel) |tunnel| return tunnel.http.bodyReader(transfer_buffer, self.transfer_encoding, self.content_length);
        return self.response.reader(transfer_buffer);
    }

    fn close(self: *Exchange) void {
        if (self.tunnel) |tunnel| tunnel.destroy();
        if (self.request) |*req| req.deinit();
        self.tunnel = null;
        self.request = null;
    }
};

pub const Reply = struct {
    status: u16,
    body: []const u8,
};

/// GET a small document into `out`; redirects are not followed.
/// `error.TooLarge` when it does not fit.
pub fn get(session: *net_tunnel.Session, url: []const u8, user_agent: []const u8, headers: []const std.http.Header, out: []u8) !Reply {
    var exchange: Exchange = .{};
    try exchange.open(session, url, user_agent, headers);
    defer exchange.close();
    if (!exchange.identity) return error.HttpStatus;
    var transfer: [16 * 1024]u8 = undefined;
    const reader = exchange.body(&transfer);
    const n = reader.readSliceShort(out) catch return error.Network;
    if (n == out.len) {
        var one: [1]u8 = undefined;
        const more = reader.readSliceShort(&one) catch return error.Network;
        if (more != 0) return error.TooLarge;
    }
    return .{ .status = exchange.status, .body = out[0..n] };
}

/// GET `request.url` into `sink`. Returns the number of bytes stored in
/// all (`request.offset` plus what arrived). `error.Network` after some
/// bytes arrived can be retried with the new offset.
pub fn fetch(session: *net_tunnel.Session, request: Request, sink: Sink, chunk: []u8) anyerror!u64 {
    var bufs: [2][4096]u8 = undefined;
    var url: []const u8 = request.url;
    var offset = request.offset;
    var hops: usize = 0;
    var refetched = false;
    while (true) {
        if (!sink.progress(sink.context, offset, request.expected_size orelse 0)) return error.Cancelled;
        var range_buf: [48]u8 = undefined;
        const range = std.fmt.bufPrint(&range_buf, "bytes={d}-", .{offset}) catch return error.Network;
        const resume_headers = [_]std.http.Header{.{ .name = "range", .value = range }};
        var exchange: Exchange = .{};
        try exchange.open(session, url, request.user_agent, if (offset > 0) &resume_headers else &.{});
        defer exchange.close();
        const status = exchange.status;
        if (status == 301 or status == 302 or status == 303 or status == 307 or status == 308) {
            hops += 1;
            if (hops > max_redirects) return error.BadRedirect;
            const target = exchange.location() orelse return error.BadRedirect;
            if (!allowedUrl(target, request.redirect_hosts)) return error.BadRedirect;
            const next = &bufs[hops % 2];
            @memcpy(next[0..target.len], target);
            url = next[0..target.len];
            continue;
        }
        if (status == 404) return error.NoAsset;
        const plan = try planBody(status, offset, exchange.content_length, exchange.contentRange(), request.expected_size);
        const total: u64 = switch (plan) {
            .complete => return offset,
            .refetch => {
                // Once: a server that refuses the whole file too is broken.
                if (refetched) return error.HttpStatus;
                refetched = true;
                try sink.restart(sink.context);
                offset = 0;
                url = request.url;
                hops = 0;
                continue;
            },
            .body => |b| blk: {
                if (b.restart) {
                    try sink.restart(sink.context);
                    offset = 0;
                }
                break :blk b.total;
            },
        };
        if (total > request.max_bytes) return error.TooLarge;
        if (!exchange.identity) return error.HttpStatus;
        if (!sink.progress(sink.context, offset, total)) return error.Cancelled;

        var transfer: [16 * 1024]u8 = undefined;
        const reader = exchange.body(&transfer);
        while (true) {
            const n = reader.readSliceShort(chunk) catch return error.Network;
            if (n == 0) break;
            if (offset + n > request.max_bytes) return error.TooLarge;
            if (total != 0 and offset + n > total) return error.SizeMismatch;
            try sink.write(sink.context, chunk[0..n], offset);
            offset += n;
            if (!sink.progress(sink.context, offset, total)) return error.Cancelled;
            if (n < chunk.len) break;
        }
        // Cut short: the caller may ask for the rest.
        if (total != 0 and offset != total) return error.Network;
        return offset;
    }
}

/// How long to wait before retry number `attempt` (1, 2, 3 …) of a
/// transfer that broke off: 2 s, 4 s, 8 s, then 15 s.
pub fn retryDelayMs(attempt: u32) i64 {
    return switch (attempt) {
        0, 1 => 2_000,
        2 => 4_000,
        3 => 8_000,
        else => 15_000,
    };
}

// ------------------------------------------------------------------ tests

const testing = std.testing;

test "redirects only over HTTPS, only to the hosts a request names (GitHub by default)" {
    try testing.expect(allowedRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r&sv=2018-11-09&sig=a%2Bb%3D"));
    try testing.expect(allowedRedirect("https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2?X-Amz-Algorithm=AWS4"));
    try testing.expect(allowedRedirect("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
    try testing.expect(!allowedRedirect("http://objects.githubusercontent.com/x"));
    try testing.expect(!allowedRedirect("https://objects.githubusercontent.com.evil.example/x"));
    try testing.expect(!allowedRedirect("https://github.com@evil.example/x"));
    try testing.expect(!allowedRedirect("https://github.com:8443/x"));
    try testing.expect(!allowedRedirect("https://evil.example/https://github.com/x"));
    try testing.expect(!allowedRedirect("https://github.com"));
    try testing.expect(!allowedRedirect("https://github.com/a b"));
    try testing.expect(!allowedRedirect("/relative/path"));
    try testing.expect(!allowedRedirect("file:///etc/passwd"));
    // KataGo's network server is not a GitHub host: an update request never
    // follows a redirect there, a request that names it may.
    try testing.expect(!allowedRedirect("https://media.katagotraining.org/uploaded/networks/models/kata1/x.bin.gz"));
    const with_katago = [_][]const u8{ "github.com", "media.katagotraining.org" };
    try testing.expect(allowedUrl("https://media.katagotraining.org/uploaded/networks/models/kata1/x.bin.gz", &with_katago));
    try testing.expect(!allowedUrl("http://media.katagotraining.org/x", &with_katago));
    try testing.expect(!allowedUrl("https://katagotraining.org/x", &with_katago));
    try testing.expect(!allowedUrl("https://media.katagotraining.org.evil.example/x", &with_katago));
    try testing.expect(!allowedUrl("https://objects.githubusercontent.com/x", &with_katago));
    try testing.expectEqualStrings("github.com", httpsHost("https://github.com/x").?);
    try testing.expect(httpsHost("https://github.com") == null);
}

test "content ranges" {
    const r = parseContentRange("bytes 100-999/1000").?;
    try testing.expectEqual(@as(u64, 100), r.first);
    try testing.expectEqual(@as(u64, 999), r.last);
    try testing.expectEqual(@as(u64, 1000), r.total);
    try testing.expect(parseContentRange("bytes 100-999/*") == null);
    try testing.expect(parseContentRange("items 100-999/1000") == null);
    try testing.expect(parseContentRange("bytes 999-100/1000") == null);
    try testing.expect(parseContentRange("bytes 0-1000/1000") == null);
}

test "resume bookkeeping: what each answer to a ranged GET means" {
    // A fresh download.
    try testing.expectEqual(Plan{ .body = .{ .restart = false, .total = 1000 } }, try planBody(200, 0, 1000, null, null));
    try testing.expectEqual(Plan{ .body = .{ .restart = false, .total = 0 } }, try planBody(200, 0, null, null, null));
    try testing.expectEqual(Plan{ .body = .{ .restart = false, .total = 1000 } }, try planBody(200, 0, null, null, 1000));
    try testing.expectError(error.SizeMismatch, planBody(200, 0, 999, null, 1000));
    // The server continues where the file on disk ends.
    try testing.expectEqual(Plan{ .body = .{ .restart = false, .total = 1000 } }, try planBody(206, 400, 600, "bytes 400-999/1000", null));
    try testing.expectEqual(Plan{ .body = .{ .restart = false, .total = 1000 } }, try planBody(206, 400, 600, "bytes 400-999/1000", 1000));
    // … or not exactly there, or of a different file: refused.
    try testing.expectError(error.SizeMismatch, planBody(206, 400, 600, "bytes 0-999/1000", null));
    try testing.expectError(error.SizeMismatch, planBody(206, 400, 600, "bytes 400-998/1000", null));
    try testing.expectError(error.SizeMismatch, planBody(206, 400, 600, "bytes 400-1999/2000", 1000));
    try testing.expectError(error.SizeMismatch, planBody(206, 400, 600, null, null));
    try testing.expectError(error.HttpStatus, planBody(206, 0, 600, "bytes 0-599/600", null));
    // The server ignored the range: the whole file comes again.
    try testing.expectEqual(Plan{ .body = .{ .restart = true, .total = 1000 } }, try planBody(200, 400, 1000, null, null));
    // Nothing after what is on disk.
    try testing.expectEqual(Plan.complete, try planBody(416, 1000, null, null, 1000));
    try testing.expectEqual(Plan.refetch, try planBody(416, 1000, null, null, null));
    try testing.expectEqual(Plan.refetch, try planBody(416, 1200, null, null, 1000));
    try testing.expectError(error.HttpStatus, planBody(416, 0, null, null, null));
    try testing.expectError(error.HttpStatus, planBody(500, 0, null, null, null));
    try testing.expectError(error.HttpStatus, planBody(403, 400, null, null, null));

    try testing.expectEqual(@as(i64, 2_000), retryDelayMs(1));
    try testing.expectEqual(@as(i64, 8_000), retryDelayMs(3));
    try testing.expectEqual(@as(i64, 15_000), retryDelayMs(9));
}

const MemorySink = struct {
    buf: [4096]u8 = undefined,
    len: usize = 0,
    restarts: usize = 0,

    fn sinkWrite(context: *anyopaque, bytes: []const u8, offset: u64) anyerror!void {
        const self: *MemorySink = @ptrCast(@alignCast(context));
        const at: usize = @intCast(offset);
        if (at + bytes.len > self.buf.len) return error.TooLarge;
        @memcpy(self.buf[at..][0..bytes.len], bytes);
        self.len = at + bytes.len;
    }
    fn sinkRestart(context: *anyopaque) anyerror!void {
        const self: *MemorySink = @ptrCast(@alignCast(context));
        self.len = 0;
        self.restarts += 1;
    }
    fn sinkProgress(context: *anyopaque, received: u64, total: u64) bool {
        _ = context;
        _ = received;
        _ = total;
        return true;
    }
    fn sink(self: *MemorySink) Sink {
        return .{ .context = self, .write = sinkWrite, .restart = sinkRestart, .progress = sinkProgress };
    }
};

test "live (GOBAN_NET_LIVE=1): a release file arrives through the proxy, whole and resumed" {
    // Needs the network: `GOBAN_NET_LIVE=1 zig build test …`. It fetches a
    // few hundred bytes of a published release and asks the releases API,
    // through the environment's proxy when there is one and directly
    // otherwise.
    var env = try testing.environ.createMap(testing.allocator);
    defer env.deinit();
    if (!std.mem.eql(u8, env.get("GOBAN_NET_LIVE") orelse "", "1")) return error.SkipZigTest;
    const io = testing.io;
    const agent = "GobanStudio-updater";
    const url = "https://github.com/hxddh/goban-studio/releases/download/v13.0.0/SHA256SUMS";
    var chunk: [1024]u8 = undefined;

    var session: net_tunnel.Session = undefined;
    session.init(testing.allocator, io, &env, "github.com");
    defer session.deinit();
    std.debug.print("live: {s}\n", .{if (session.proxy != null) "through the proxy" else "direct"});

    var whole: MemorySink = .{};
    const n = try fetch(&session, .{ .url = url, .user_agent = agent, .max_bytes = 4096 }, whole.sink(), &chunk);
    try testing.expectEqual(@as(u64, whole.len), n);
    try testing.expect(whole.len > 200);
    try testing.expect(std.mem.indexOf(u8, whole.buf[0..whole.len], "  GobanStudio-Windows-x64.zip") != null);

    // The first 100 bytes are "on disk": only the rest is asked for.
    var rest: MemorySink = .{};
    @memcpy(rest.buf[0..100], whole.buf[0..100]);
    rest.len = 100;
    const resumed = try fetch(&session, .{ .url = url, .user_agent = agent, .offset = 100, .max_bytes = 4096 }, rest.sink(), &chunk);
    try testing.expectEqual(@as(u64, whole.len), resumed);
    try testing.expectEqualStrings(whole.buf[0..whole.len], rest.buf[0..rest.len]);
    try testing.expectEqual(@as(usize, 0), rest.restarts);

    // Everything is already there: nothing to fetch, nothing changed.
    var done: MemorySink = .{};
    @memcpy(done.buf[0..whole.len], whole.buf[0..whole.len]);
    done.len = whole.len;
    const again = try fetch(&session, .{ .url = url, .user_agent = agent, .offset = whole.len, .expected_size = whole.len, .max_bytes = 4096 }, done.sink(), &chunk);
    try testing.expectEqual(@as(u64, whole.len), again);
    try testing.expectEqual(@as(usize, 0), done.restarts);

    // More on disk than the file has: it is fetched again from the start.
    var over: MemorySink = .{};
    over.len = whole.len + 10;
    const refetched = try fetch(&session, .{ .url = url, .user_agent = agent, .offset = whole.len + 10, .max_bytes = 4096 }, over.sink(), &chunk);
    try testing.expectEqual(@as(u64, whole.len), refetched);
    try testing.expectEqual(@as(usize, 1), over.restarts);
    try testing.expectEqualStrings(whole.buf[0..whole.len], over.buf[0..over.len]);

    // A file that is not there, and a size limit.
    var none: MemorySink = .{};
    try testing.expectError(error.NoAsset, fetch(&session, .{
        .url = "https://github.com/hxddh/goban-studio/releases/download/v13.0.0/NO-SUCH-FILE",
        .user_agent = agent,
        .max_bytes = 4096,
    }, none.sink(), &chunk));
    try testing.expectError(error.TooLarge, fetch(&session, .{ .url = url, .user_agent = agent, .max_bytes = 64 }, none.sink(), &chunk));

    // KataGo's network server (models.zig, the strong network): its last
    // 100 bytes, resumed from where a nearly finished download stopped.
    {
        const net_url = "https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz";
        const net_size: u64 = 97_898_094;
        const hosts = github_hosts ++ [_][]const u8{"media.katagotraining.org"};
        var katago: net_tunnel.Session = undefined;
        katago.init(testing.allocator, io, &env, "media.katagotraining.org");
        defer katago.deinit();
        // Counts what arrives after the first `base` bytes (already on disk).
        const Tail = struct {
            base: u64,
            stored: u64 = 0,
            restarts: usize = 0,
            fn write(context: *anyopaque, bytes: []const u8, at: u64) anyerror!void {
                const self: *@This() = @ptrCast(@alignCast(context));
                if (at < self.base) return error.TooLarge;
                self.stored = at + bytes.len - self.base;
            }
            fn restart(context: *anyopaque) anyerror!void {
                const self: *@This() = @ptrCast(@alignCast(context));
                self.restarts += 1;
            }
            fn progress(context: *anyopaque, received: u64, total: u64) bool {
                _ = context;
                _ = received;
                _ = total;
                return true;
            }
        };
        var tail: Tail = .{ .base = net_size - 100 };
        const got = try fetch(&katago, .{ .url = net_url, .user_agent = "GobanStudio-models", .offset = net_size - 100, .expected_size = net_size, .max_bytes = net_size, .redirect_hosts = &hosts }, .{ .context = &tail, .write = Tail.write, .restart = Tail.restart, .progress = Tail.progress }, &chunk);
        try testing.expectEqual(net_size, got);
        try testing.expectEqual(@as(u64, 100), tail.stored);
        try testing.expectEqual(@as(usize, 0), tail.restarts);
    }

    // The update check's document.
    const big = try testing.allocator.alloc(u8, 512 * 1024);
    defer testing.allocator.free(big);
    const reply = try get(&session, "https://api.github.com/repos/hxddh/goban-studio/releases/latest", "GobanStudio-update-check", &.{
        .{ .name = "accept", .value = "application/vnd.github+json" },
    }, big);
    // An address that asked too often is refused (403); that is an answer too.
    try testing.expect(reply.status == 200 or reply.status == 403 or reply.status == 429);
    if (reply.status == 200) try testing.expect(std.mem.indexOf(u8, reply.body, "\"tag_name\"") != null);
    var tiny: [16]u8 = undefined;
    try testing.expectError(error.TooLarge, get(&session, "https://api.github.com/repos/hxddh/goban-studio/releases/latest", "GobanStudio-update-check", &.{}, &tiny));

    // A proxy that is not there: the request goes out directly instead.
    if (session.proxy == null) {
        var stale: net_tunnel.Session = undefined;
        stale.init(testing.allocator, io, null, "github.com");
        defer stale.deinit();
        var gone: net_proxy.Proxy = .{};
        try testing.expect(net_proxy.parseProxy("http://127.0.0.1:9", &gone));
        stale.proxy = gone;
        var direct: MemorySink = .{};
        _ = try fetch(&stale, .{ .url = url, .user_agent = agent, .max_bytes = 4096 }, direct.sink(), &chunk);
        try testing.expectEqualStrings(whole.buf[0..whole.len], direct.buf[0..direct.len]);
        try testing.expect(stale.proxy == null);
    }
}
