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
//!   * One GET. `fetch` follows redirects by hand, only to GitHub's own
//!     download hosts and only over HTTPS, and can continue a file that is
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

const std = @import("std");
const builtin = @import("builtin");

/// GitHub answers a release download with a redirect to one of these.
const redirect_hosts = [_][]const u8{
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
};
pub const max_redirects = 5;

/// A redirect target: HTTPS, no user info or port, host exactly one of
/// GitHub's download hosts, printable ASCII without spaces.
pub fn allowedRedirect(url: []const u8) bool {
    const scheme = "https://";
    if (url.len > 4096 or !std.mem.startsWith(u8, url, scheme)) return false;
    for (url) |c| {
        if (c <= 0x20 or c >= 0x7f or c == '\\') return false;
    }
    const rest = url[scheme.len..];
    const end = std.mem.indexOfAny(u8, rest, "/?#") orelse rest.len;
    const host = rest[0..end];
    if (end == rest.len or rest[end] != '/') return false;
    for (redirect_hosts) |allowed| {
        if (std.mem.eql(u8, host, allowed)) return true;
    }
    return false;
}

// ------------------------------------------------------------------ proxy

/// Does a `NO_PROXY` list exempt `host`? Entries are separated by commas
/// or spaces; `*` is every host; `example.com` and `.example.com` match the
/// domain and its subdomains; a `:port` suffix is ignored.
pub fn noProxyMatches(list: []const u8, host: []const u8) bool {
    var it = std.mem.tokenizeAny(u8, list, ", \t");
    while (it.next()) |raw| {
        var entry = raw;
        if (std.mem.eql(u8, entry, "*")) return true;
        if (std.mem.lastIndexOfScalar(u8, entry, ':')) |colon| entry = entry[0..colon];
        if (std.mem.startsWith(u8, entry, "*.")) entry = entry[1..];
        if (entry.len > 0 and entry[0] == '.') entry = entry[1..];
        if (entry.len == 0) continue;
        if (std.ascii.eqlIgnoreCase(entry, host)) return true;
        if (host.len > entry.len and host[host.len - entry.len - 1] == '.' and
            std.ascii.eqlIgnoreCase(host[host.len - entry.len ..], entry)) return true;
    }
    return false;
}

pub const ProxyChoice = union(enum) {
    /// Use this proxy (a URL or `host:port`).
    proxy: []const u8,
    /// The environment says: connect directly (NO_PROXY).
    direct,
    /// The environment says nothing: ask the system.
    unset,
};

/// The environment's proxy for an HTTPS request to `host`.
pub fn envProxy(env: *const std.process.Environ.Map, host: []const u8) ProxyChoice {
    for ([_][]const u8{ "no_proxy", "NO_PROXY" }) |key| {
        if (env.get(key)) |list| {
            if (noProxyMatches(list, host)) return .direct;
        }
    }
    for ([_][]const u8{ "https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY" }) |key| {
        const value = std.mem.trim(u8, env.get(key) orelse continue, " \t\r\n");
        if (value.len > 0) return .{ .proxy = value };
    }
    return .unset;
}

/// A proxy the app can use: `http://[user:password@]host[:port]` or a
/// bare `host:port` (taken as HTTP). SOCKS, `https://` and anything else
/// is not.
pub fn usableProxy(value: []const u8) bool {
    if (value.len == 0 or value.len > 512) return false;
    for (value) |c| {
        if (c <= 0x20 or c >= 0x7f) return false;
    }
    if (std.mem.indexOf(u8, value, "://")) |i| {
        return std.ascii.eqlIgnoreCase(value[0..i], "http");
    }
    return true;
}

const basic = std.http.Client.basic_authorization;

/// Where to ask for a tunnel.
pub const Proxy = struct {
    host_buf: [std.Io.net.HostName.max_len]u8 = undefined,
    host_len: usize = 0,
    port: u16 = 0,
    /// The `Proxy-Authorization` value (`Basic …`), or empty.
    auth_buf: [basic.max_value_len]u8 = undefined,
    auth_len: usize = 0,

    pub fn host(self: *const Proxy) []const u8 {
        return self.host_buf[0..self.host_len];
    }

    pub fn authorization(self: *const Proxy) []const u8 {
        return self.auth_buf[0..self.auth_len];
    }
};

/// Read a proxy setting (`usableProxy`) into `out`. The port defaults to 80.
pub fn parseProxy(value: []const u8, out: *Proxy) bool {
    if (!usableProxy(value)) return false;
    var full_buf: [520]u8 = undefined;
    const full = if (std.mem.indexOf(u8, value, "://") != null)
        value
    else
        std.fmt.bufPrint(&full_buf, "http://{s}", .{value}) catch return false;
    const uri = std.Uri.parse(full) catch return false;
    const name = uri.getHost(&out.host_buf) catch return false;
    if (name.bytes.len == 0) return false;
    _ = std.Io.net.HostName.init(name.bytes) catch return false;
    // `getHost` may hand back the original text instead of the buffer.
    if (name.bytes.ptr != &out.host_buf) @memcpy(out.host_buf[0..name.bytes.len], name.bytes);
    out.host_len = name.bytes.len;
    out.port = uri.port orelse 80;
    out.auth_len = 0;
    if (uri.user != null or uri.password != null) {
        // "user:password" as the user typed it (percent-escapes resolved).
        var user_buf: [basic.max_user_len]u8 = undefined;
        var password_buf: [basic.max_password_len]u8 = undefined;
        const user = (uri.user orelse std.Uri.Component.empty).toRaw(&user_buf) catch return false;
        const password = (uri.password orelse std.Uri.Component.empty).toRaw(&password_buf) catch return false;
        var pair_buf: [basic.max_user_len + 1 + basic.max_password_len]u8 = undefined;
        const pair = std.fmt.bufPrint(&pair_buf, "{s}:{s}", .{ user, password }) catch return false;
        const enc = std.base64.standard.Encoder;
        const prefix = "Basic ";
        if (prefix.len + enc.calcSize(pair.len) > out.auth_buf.len) return false;
        @memcpy(out.auth_buf[0..prefix.len], prefix);
        out.auth_len = prefix.len + enc.encode(out.auth_buf[prefix.len..], pair).len;
    }
    return out.port != 0;
}

fn validHostPort(host: []const u8, port: []const u8) bool {
    if (host.len == 0 or host.len > 253 or port.len == 0 or port.len > 5) return false;
    for (host) |c| {
        if (!(std.ascii.isAlphanumeric(c) or c == '.' or c == '-' or c == ':' or c == '[' or c == ']')) return false;
    }
    for (port) |c| {
        if (!std.ascii.isDigit(c)) return false;
    }
    const n = std.fmt.parseInt(u32, port, 10) catch return false;
    return n > 0 and n <= 65535;
}

/// The value of `key` in `scutil --proxy` output (`  Key : value` lines).
fn scutilValue(text: []const u8, key: []const u8) ?[]const u8 {
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trim(u8, raw, " \t\r");
        const colon = std.mem.indexOf(u8, line, " : ") orelse continue;
        if (!std.mem.eql(u8, line[0..colon], key)) continue;
        return std.mem.trim(u8, line[colon + 3 ..], " \t");
    }
    return null;
}

/// macOS: the manual HTTPS proxy in `scutil --proxy` output, as
/// `http://host:port`; null when none is switched on.
pub fn parseScutilProxy(text: []const u8, out: []u8) ?[]const u8 {
    const enabled = scutilValue(text, "HTTPSEnable") orelse return null;
    if (!std.mem.eql(u8, enabled, "1")) return null;
    const host = scutilValue(text, "HTTPSProxy") orelse return null;
    const port = scutilValue(text, "HTTPSPort") orelse "8080";
    if (!validHostPort(host, port)) return null;
    return std.fmt.bufPrint(out, "http://{s}:{s}", .{ host, port }) catch null;
}

/// The data of value `name` in `reg query … /v name` output:
/// `    name    REG_SZ    data`.
fn regValue(text: []const u8, name: []const u8) ?[]const u8 {
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trim(u8, raw, " \t\r");
        if (line.len <= name.len or !std.ascii.eqlIgnoreCase(line[0..name.len], name)) continue;
        var rest = std.mem.trimStart(u8, line[name.len..], " \t");
        if (rest.len == line.len - name.len) continue; // a longer name
        if (!std.mem.startsWith(u8, rest, "REG_")) continue;
        const type_end = std.mem.indexOfAny(u8, rest, " \t") orelse return "";
        rest = std.mem.trim(u8, rest[type_end..], " \t");
        return rest;
    }
    return null;
}

/// Windows: the manual proxy from the Internet Settings values
/// `ProxyEnable` and `ProxyServer` (both `reg query` outputs in `text`), as
/// `http://host:port` for HTTPS requests. `ProxyServer` is either one
/// `host:port` for every protocol or a list `http=…;https=…`; then only an
/// `https=` entry applies to HTTPS.
pub fn parseRegProxy(text: []const u8, out: []u8) ?[]const u8 {
    const enabled = regValue(text, "ProxyEnable") orelse return null;
    if (!(std.mem.eql(u8, enabled, "0x1") or std.mem.eql(u8, enabled, "1"))) return null;
    const server = regValue(text, "ProxyServer") orelse return null;
    var chosen: []const u8 = "";
    if (std.mem.indexOfScalar(u8, server, '=') == null) {
        chosen = server;
    } else {
        var it = std.mem.tokenizeAny(u8, server, "; ");
        while (it.next()) |entry| {
            if (entry.len > 6 and std.ascii.eqlIgnoreCase(entry[0..6], "https=")) chosen = entry[6..];
        }
    }
    if (chosen.len == 0) return null;
    if (std.mem.indexOf(u8, chosen, "://")) |i| {
        if (!std.ascii.eqlIgnoreCase(chosen[0..i], "http")) return null;
        chosen = chosen[i + 3 ..];
    }
    chosen = std.mem.trimEnd(u8, chosen, "/");
    const colon = std.mem.lastIndexOfScalar(u8, chosen, ':') orelse return null;
    if (!validHostPort(chosen[0..colon], chosen[colon + 1 ..])) return null;
    return std.fmt.bufPrint(out, "http://{s}", .{chosen}) catch null;
}

fn runCapture(io: std.Io, gpa: std.mem.Allocator, argv: []const []const u8, out: []u8) ?[]const u8 {
    const result = std.process.run(gpa, io, .{
        .argv = argv,
        .stdout_limit = .limited(out.len),
        .stderr_limit = .limited(4096),
    }) catch return null;
    defer gpa.free(result.stdout);
    defer gpa.free(result.stderr);
    const n = @min(result.stdout.len, out.len);
    @memcpy(out[0..n], result.stdout[0..n]);
    return out[0..n];
}

/// The system's manual HTTPS proxy, or null (none set, or this platform
/// has no such setting). Runs a system tool; never on the UI thread.
pub fn systemProxy(io: std.Io, gpa: std.mem.Allocator, env: *const std.process.Environ.Map, out: []u8) ?[]const u8 {
    return systemProxyOf(builtin.os.tag, io, gpa, env, out);
}

/// `systemProxy` for a named system. (A run-time switch, so every branch
/// is compiled, and tried, wherever the tests run; on another system the
/// tool is simply not there and the answer is null.)
fn systemProxyOf(os: std.Target.Os.Tag, io: std.Io, gpa: std.mem.Allocator, env: *const std.process.Environ.Map, out: []u8) ?[]const u8 {
    switch (os) {
        .macos => {
            var text_buf: [8 * 1024]u8 = undefined;
            const text = runCapture(io, gpa, &.{ "/usr/sbin/scutil", "--proxy" }, &text_buf) orelse return null;
            return parseScutilProxy(text, out);
        },
        .windows => {
            const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
            const system_root = env.get("SystemRoot") orelse env.get("SYSTEMROOT") orelse "C:\\Windows";
            var reg_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
            const reg = std.fmt.bufPrint(&reg_buf, "{s}\\System32\\reg.exe", .{system_root}) catch return null;
            var text_buf: [8 * 1024]u8 = undefined;
            var n: usize = 0;
            for ([_][]const u8{ "ProxyEnable", "ProxyServer" }) |name| {
                const part = runCapture(io, gpa, &.{ reg, "query", key, "/v", name }, text_buf[n..]) orelse return null;
                n += part.len;
                if (n < text_buf.len) {
                    text_buf[n] = '\n';
                    n += 1;
                }
            }
            return parseRegProxy(text_buf[0..n], out);
        },
        else => return null,
    }
}

/// The proxy an HTTPS request to `host` should use, if any. Runs a system
/// tool when the environment names none; never on the UI thread.
pub fn chooseProxy(
    io: std.Io,
    gpa: std.mem.Allocator,
    env: ?*const std.process.Environ.Map,
    host: []const u8,
    out: *Proxy,
) bool {
    const map = env orelse return false;
    var system_buf: [600]u8 = undefined;
    const value: []const u8 = switch (envProxy(map, host)) {
        .direct => return false,
        .proxy => |p| p,
        .unset => systemProxy(io, gpa, map, &system_buf) orelse return false,
    };
    return parseProxy(value, out);
}

/// One thread's connection settings for a few requests in a row.
pub const Session = struct {
    allocator: std.mem.Allocator,
    io: std.Io,
    /// Direct requests, and the certificate bundle of every request.
    client: std.http.Client,
    proxy: ?Proxy = null,

    /// `host` is the first host that will be asked (for NO_PROXY).
    pub fn init(self: *Session, allocator: std.mem.Allocator, io: std.Io, env: ?*const std.process.Environ.Map, host: []const u8) void {
        self.* = .{ .allocator = allocator, .io = io, .client = .{ .allocator = allocator, .io = io } };
        var proxy: Proxy = .{};
        if (chooseProxy(io, allocator, env, host, &proxy)) self.proxy = proxy;
    }

    pub fn deinit(self: *Session) void {
        self.client.deinit();
    }

    /// Load the system's root certificates once (as `std.http.Client` does
    /// before its first HTTPS request).
    fn ensureCertificates(self: *Session) !void {
        const client = &self.client;
        const io = self.io;
        {
            client.ca_bundle_lock.lockSharedUncancelable(io);
            defer client.ca_bundle_lock.unlockShared(io);
            if (client.now != null) return;
        }
        var bundle: std.crypto.Certificate.Bundle = .empty;
        defer bundle.deinit(client.allocator);
        const now = std.Io.Clock.real.now(io);
        bundle.rescan(client.allocator, io, now) catch return error.Network;
        client.ca_bundle_lock.lockUncancelable(io);
        defer client.ca_bundle_lock.unlock(io);
        client.now = now;
        std.mem.swap(std.crypto.Certificate.Bundle, &client.ca_bundle, &bundle);
    }
};

/// The text of the CONNECT request for `host:port`.
pub fn connectRequest(out: []u8, host: []const u8, port: u16, user_agent: []const u8, authorization: []const u8) ?[]const u8 {
    var n: usize = 0;
    const head = std.fmt.bufPrint(out, "CONNECT {s}:{d} HTTP/1.1\r\nHost: {s}:{d}\r\nUser-Agent: {s}\r\nProxy-Connection: Keep-Alive\r\n", .{ host, port, host, port, user_agent }) catch return null;
    n += head.len;
    if (authorization.len > 0) {
        const auth = std.fmt.bufPrint(out[n..], "Proxy-Authorization: {s}\r\n", .{authorization}) catch return null;
        n += auth.len;
    }
    if (n + 2 > out.len) return null;
    @memcpy(out[n..][0..2], "\r\n");
    return out[0 .. n + 2];
}

/// Did the proxy open the tunnel (`HTTP/1.x 200 …`)?
pub fn connectAccepted(head: []const u8) bool {
    if (head.len < 12 or !std.mem.startsWith(u8, head, "HTTP/1.")) return false;
    return head[8] == ' ' and std.mem.eql(u8, head[9..12], "200") and (head.len == 12 or head[12] == ' ' or head[12] == '\r');
}

/// A TLS connection to one host through the proxy's tunnel.
const Tunnel = struct {
    gpa: std.mem.Allocator,
    io: std.Io,
    stream: std.Io.net.Stream,
    stream_reader: std.Io.net.Stream.Reader,
    stream_writer: std.Io.net.Stream.Writer,
    tls: std.crypto.tls.Client,
    http: std.http.Reader,
    buffers: []u8,
    host_buf: [std.Io.net.HostName.max_len]u8,
    host_len: usize,

    const tls_len = std.crypto.tls.Client.min_buffer_len;
    const head_len = 16 * 1024;
    const write_len = 4 * 1024;

    /// Any error: no request was sent to `host` yet.
    fn create(session: *Session, proxy: *const Proxy, host: []const u8, port: u16, user_agent: []const u8) !*Tunnel {
        const io = session.io;
        const gpa = session.allocator;
        if (host.len == 0 or host.len > std.Io.net.HostName.max_len) return error.Network;
        try session.ensureCertificates();
        const self = try gpa.create(Tunnel);
        errdefer gpa.destroy(self);
        const buffers = try gpa.alloc(u8, tls_len + tls_len + (tls_len + head_len) + write_len);
        errdefer gpa.free(buffers);
        const socket_read = buffers[0..tls_len];
        const socket_write = buffers[tls_len..][0..tls_len];
        const tls_read = buffers[2 * tls_len ..][0 .. tls_len + head_len];
        const tls_write = buffers[3 * tls_len + head_len ..][0..write_len];

        const proxy_host = std.Io.net.HostName.init(proxy.host()) catch return error.ProxyUnreachable;
        const stream = proxy_host.connect(io, proxy.port, .{ .mode = .stream }) catch return error.ProxyUnreachable;
        errdefer stream.close(io);
        self.* = .{
            .gpa = gpa,
            .io = io,
            .stream = stream,
            .stream_reader = stream.reader(io, socket_read),
            .stream_writer = stream.writer(io, socket_write),
            .tls = undefined,
            .http = undefined,
            .buffers = buffers,
            .host_buf = undefined,
            .host_len = host.len,
        };
        @memcpy(self.host_buf[0..host.len], host);
        const kept_host = self.host_buf[0..host.len];

        // Ask for the tunnel.
        var request_buf: [1024]u8 = undefined;
        const request = connectRequest(&request_buf, kept_host, port, user_agent, proxy.authorization()) orelse return error.Network;
        const out = &self.stream_writer.interface;
        out.writeAll(request) catch return error.ProxyUnreachable;
        out.flush() catch return error.ProxyUnreachable;
        var connect_reader: std.http.Reader = .{
            .in = &self.stream_reader.interface,
            .interface = undefined,
            .state = .ready,
            .max_head_len = 8 * 1024,
        };
        const answer = connect_reader.receiveHead() catch return error.ProxyUnreachable;
        if (!connectAccepted(answer)) return error.ProxyRefused;

        // From here on the bytes are between this process and `host`.
        var entropy: [std.crypto.tls.Client.Options.entropy_len]u8 = undefined;
        io.random(&entropy);
        self.tls = std.crypto.tls.Client.init(&self.stream_reader.interface, &self.stream_writer.interface, .{
            .host = .{ .explicit = kept_host },
            .ca = .{ .bundle = .{
                .gpa = session.client.allocator,
                .io = io,
                .lock = &session.client.ca_bundle_lock,
                .bundle = &session.client.ca_bundle,
            } },
            .read_buffer = tls_read,
            .write_buffer = tls_write,
            .entropy = &entropy,
            .realtime_now = session.client.now.?,
            // As std.http.Client: the Content-Length detects truncation.
            .allow_truncation_attacks = true,
        }) catch return error.Network;
        self.http = .{
            .in = &self.tls.reader,
            .interface = undefined,
            .state = .ready,
            .max_head_len = head_len,
        };
        return self;
    }

    fn destroy(self: *Tunnel) void {
        self.stream.close(self.io);
        const gpa = self.gpa;
        gpa.free(self.buffers);
        gpa.destroy(self);
    }

    /// Send a GET and return the response head's bytes.
    fn get(self: *Tunnel, uri: std.Uri, user_agent: []const u8, headers: []const std.http.Header) ![]const u8 {
        const w = &self.tls.writer;
        w.writeAll("GET ") catch return error.Network;
        uri.writeToStream(w, .{ .path = true, .query = true }) catch return error.Network;
        w.print(" HTTP/1.1\r\nHost: {s}\r\nUser-Agent: {s}\r\nConnection: close\r\n", .{ self.host_buf[0..self.host_len], user_agent }) catch return error.Network;
        for (headers) |h| {
            w.print("{s}: {s}\r\n", .{ h.name, h.value }) catch return error.Network;
        }
        w.writeAll("\r\n") catch return error.Network;
        w.flush() catch return error.Network;
        self.stream_writer.interface.flush() catch return error.Network;
        return self.http.receiveHead() catch return error.Network;
    }
};

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
    tunnel: ?*Tunnel = null,
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

    fn open(self: *Exchange, session: *Session, url: []const u8, user_agent: []const u8, headers: []const std.http.Header) !void {
        const uri = std.Uri.parse(url) catch return error.BadRedirect;
        if (!std.ascii.eqlIgnoreCase(uri.scheme, "https")) return error.BadRedirect;
        if (session.proxy) |*proxy| {
            var host_buf: [std.Io.net.HostName.max_len]u8 = undefined;
            const host = uri.getHost(&host_buf) catch return error.BadRedirect;
            if (Tunnel.create(session, proxy, host.bytes, uri.port orelse 443, user_agent)) |tunnel| {
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
pub fn get(session: *Session, url: []const u8, user_agent: []const u8, headers: []const std.http.Header, out: []u8) !Reply {
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
pub fn fetch(session: *Session, request: Request, sink: Sink, chunk: []u8) anyerror!u64 {
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
            if (!allowedRedirect(target)) return error.BadRedirect;
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

test "redirects only to GitHub's download hosts over HTTPS" {
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
}

test "the environment's proxy: HTTPS first, then ALL, unless NO_PROXY names the host" {
    var env = std.process.Environ.Map.init(testing.allocator);
    defer env.deinit();
    try testing.expect(envProxy(&env, "github.com") == .unset);
    try env.put("ALL_PROXY", "http://127.0.0.1:7890");
    try testing.expectEqualStrings("http://127.0.0.1:7890", envProxy(&env, "github.com").proxy);
    try env.put("HTTPS_PROXY", " http://proxy.example:8080 ");
    try testing.expectEqualStrings("http://proxy.example:8080", envProxy(&env, "github.com").proxy);
    // HTTP_PROXY is not for HTTPS.
    try env.put("HTTP_PROXY", "http://plain.example:80");
    try testing.expectEqualStrings("http://proxy.example:8080", envProxy(&env, "api.github.com").proxy);
    // Lower case wins, as curl has it. Windows has one variable whatever
    // the case, so there the two names cannot differ.
    if (builtin.os.tag != .windows) {
        try env.put("https_proxy", "http://lower.example:3128");
        try testing.expectEqualStrings("http://lower.example:3128", envProxy(&env, "api.github.com").proxy);
        try env.put("https_proxy", "");
        try testing.expectEqualStrings("http://proxy.example:8080", envProxy(&env, "api.github.com").proxy);
    }

    try env.put("NO_PROXY", "localhost,127.0.0.1,.internal.example");
    try testing.expect(envProxy(&env, "github.com") == .proxy);
    try env.put("NO_PROXY", "localhost, github.com:443");
    try testing.expect(envProxy(&env, "github.com") == .direct);
    try testing.expect(envProxy(&env, "api.github.com") == .direct);
    try testing.expect(envProxy(&env, "notgithub.com") == .proxy);
    try env.put("no_proxy", "*");
    try testing.expect(envProxy(&env, "objects.githubusercontent.com") == .direct);

    try testing.expect(noProxyMatches("*.githubusercontent.com", "objects.githubusercontent.com"));
    try testing.expect(noProxyMatches(".githubusercontent.com", "githubusercontent.com"));
    try testing.expect(!noProxyMatches("hub.com", "github.com"));
    try testing.expect(!noProxyMatches("", "github.com"));

    try testing.expect(usableProxy("http://127.0.0.1:7890"));
    try testing.expect(usableProxy("http://user:pw@proxy.example:8080"));
    try testing.expect(!usableProxy("https://proxy.example:443"));
    try testing.expect(usableProxy("127.0.0.1:7890"));
    try testing.expect(!usableProxy("socks5://127.0.0.1:1080"));
    try testing.expect(!usableProxy("socks5h://127.0.0.1:1080"));
    try testing.expect(!usableProxy("http://bad host:1"));
    try testing.expect(!usableProxy(""));
}

test "macOS: the system HTTPS proxy is read from scutil --proxy" {
    var out: [128]u8 = undefined;
    const on =
        \\<dictionary> {
        \\  ExceptionsList : <array> {
        \\    0 : *.local
        \\    1 : 169.254/16
        \\  }
        \\  FTPPassive : 1
        \\  HTTPEnable : 1
        \\  HTTPPort : 7890
        \\  HTTPProxy : 127.0.0.1
        \\  HTTPSEnable : 1
        \\  HTTPSPort : 7891
        \\  HTTPSProxy : 127.0.0.1
        \\  ProxyAutoConfigEnable : 0
        \\}
        \\
    ;
    try testing.expectEqualStrings("http://127.0.0.1:7891", parseScutilProxy(on, &out).?);
    const off =
        \\<dictionary> {
        \\  HTTPEnable : 0
        \\  HTTPSEnable : 0
        \\  HTTPSPort : 7891
        \\  HTTPSProxy : 127.0.0.1
        \\}
    ;
    try testing.expect(parseScutilProxy(off, &out) == null);
    // Only the plain-HTTP proxy is set: HTTPS goes direct, as the system does.
    try testing.expect(parseScutilProxy("<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 80\n  HTTPProxy : p.example\n}\n", &out) == null);
    try testing.expect(parseScutilProxy("<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : bad host;rm\n  HTTPSPort : 80\n}\n", &out) == null);
    try testing.expect(parseScutilProxy("<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : p.example\n  HTTPSPort : 99999\n}\n", &out) == null);
    try testing.expectEqualStrings("http://p.example:8080", parseScutilProxy("<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : p.example\n}\n", &out).?);
    try testing.expect(parseScutilProxy("", &out) == null);
}

test "Windows: the system proxy is read from the Internet Settings values" {
    var out: [128]u8 = undefined;
    const head = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n";
    const enabled = head ++ "    ProxyEnable    REG_DWORD    0x1\r\n\r\n";
    const disabled = head ++ "    ProxyEnable    REG_DWORD    0x0\r\n\r\n";
    const one = head ++ "    ProxyServer    REG_SZ    127.0.0.1:7890\r\n\r\n";
    try testing.expectEqualStrings("http://127.0.0.1:7890", parseRegProxy(enabled ++ one, &out).?);
    // Switched off: the remembered address is not used.
    try testing.expect(parseRegProxy(disabled ++ one, &out) == null);
    try testing.expect(parseRegProxy(one, &out) == null);
    const per = head ++ "    ProxyServer    REG_SZ    http=10.0.0.1:8080;https=10.0.0.2:8443;ftp=10.0.0.3:21\r\n";
    try testing.expectEqualStrings("http://10.0.0.2:8443", parseRegProxy(enabled ++ per, &out).?);
    // A list without an https entry: HTTPS goes direct.
    try testing.expect(parseRegProxy(enabled ++ head ++ "    ProxyServer    REG_SZ    http=10.0.0.1:8080\r\n", &out) == null);
    try testing.expect(parseRegProxy(enabled ++ head ++ "    ProxyServer    REG_SZ    socks=10.0.0.1:1080\r\n", &out) == null);
    try testing.expectEqualStrings("http://proxy.example:3128", parseRegProxy(enabled ++ head ++ "    ProxyServer    REG_SZ    http://proxy.example:3128/\r\n", &out).?);
    try testing.expect(parseRegProxy(enabled ++ head ++ "    ProxyServer    REG_SZ    no-port.example\r\n", &out) == null);
    try testing.expect(parseRegProxy(enabled ++ head ++ "    ProxyServer    REG_SZ    a b:80\r\n", &out) == null);
    // `reg query` for a missing value prints an error and nothing else.
    try testing.expect(parseRegProxy(enabled ++ "ERROR: The system was unable to find the specified registry key or value.\r\n", &out) == null);
    // A value whose name only starts the same is not it.
    try testing.expect(parseRegProxy(enabled ++ head ++ "    ProxyServerOld    REG_SZ    1.2.3.4:80\r\n", &out) == null);
}

test "a proxy setting is read into host, port and credentials" {
    var p: Proxy = .{};
    try testing.expect(parseProxy("http://127.0.0.1:7890", &p));
    try testing.expectEqualStrings("127.0.0.1", p.host());
    try testing.expectEqual(@as(u16, 7890), p.port);
    try testing.expectEqualStrings("", p.authorization());
    try testing.expect(parseProxy("proxy.example:3128", &p));
    try testing.expectEqualStrings("proxy.example", p.host());
    try testing.expectEqual(@as(u16, 3128), p.port);
    try testing.expect(parseProxy("http://proxy.example", &p));
    try testing.expectEqual(@as(u16, 80), p.port);
    try testing.expect(parseProxy("http://user:pass%21@proxy.example:8080/", &p));
    try testing.expectEqualStrings("proxy.example", p.host());
    // base64("user:pass!")
    try testing.expectEqualStrings("Basic dXNlcjpwYXNzIQ==", p.authorization());
    try testing.expect(!parseProxy("socks5://127.0.0.1:1080", &p));
    try testing.expect(!parseProxy("https://proxy.example:443", &p));
    try testing.expect(!parseProxy("http://", &p));
    try testing.expect(!parseProxy("", &p));

    // The session takes the environment's choice; NO_PROXY and SOCKS leave
    // it direct.
    const io = testing.io;
    var env = std.process.Environ.Map.init(testing.allocator);
    defer env.deinit();
    var chosen: Proxy = .{};
    try testing.expect(!chooseProxy(io, testing.allocator, null, "github.com", &chosen));
    try env.put("ALL_PROXY", "socks5://127.0.0.1:1080");
    try testing.expect(!chooseProxy(io, testing.allocator, &env, "github.com", &chosen));
    try env.put("HTTPS_PROXY", "http://127.0.0.1:7890");
    try testing.expect(chooseProxy(io, testing.allocator, &env, "github.com", &chosen));
    try testing.expectEqual(@as(u16, 7890), chosen.port);
    try env.put("NO_PROXY", "github.com");
    try testing.expect(!chooseProxy(io, testing.allocator, &env, "api.github.com", &chosen));
    var session: Session = undefined;
    session.init(testing.allocator, io, &env, "example.org");
    defer session.deinit();
    try testing.expectEqualStrings("127.0.0.1", session.proxy.?.host());
}

test "the tunnel request, and what counts as the proxy's yes" {
    var buf: [512]u8 = undefined;
    try testing.expectEqualStrings(
        "CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\nUser-Agent: GobanStudio-updater\r\nProxy-Connection: Keep-Alive\r\n\r\n",
        connectRequest(&buf, "github.com", 443, "GobanStudio-updater", "").?,
    );
    try testing.expectEqualStrings(
        "CONNECT api.github.com:443 HTTP/1.1\r\nHost: api.github.com:443\r\nUser-Agent: a\r\nProxy-Connection: Keep-Alive\r\nProxy-Authorization: Basic dXNlcjpwYXNzIQ==\r\n\r\n",
        connectRequest(&buf, "api.github.com", 443, "a", "Basic dXNlcjpwYXNzIQ==").?,
    );
    var small: [40]u8 = undefined;
    try testing.expect(connectRequest(&small, "github.com", 443, "GobanStudio-updater", "") == null);
    try testing.expect(connectAccepted("HTTP/1.1 200 Connection established\r\n\r\n"));
    try testing.expect(connectAccepted("HTTP/1.0 200 OK\r\nProxy-Agent: x\r\n\r\n"));
    try testing.expect(connectAccepted("HTTP/1.1 200\r\n\r\n"));
    try testing.expect(!connectAccepted("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"));
    try testing.expect(!connectAccepted("HTTP/1.1 403 Forbidden\r\n\r\n"));
    try testing.expect(!connectAccepted("HTTP/1.1 2000 OK\r\n\r\n"));
    try testing.expect(!connectAccepted("SSH-2.0-OpenSSH\r\n"));
    try testing.expect(!connectAccepted(""));
}

test "the system's tools are asked; a missing tool means no proxy" {
    const io = testing.io;
    var env = std.process.Environ.Map.init(testing.allocator);
    defer env.deinit();
    var out: [256]u8 = undefined;
    // A tool's output is captured, up to the buffer.
    var text_buf: [64]u8 = undefined;
    const argv: []const []const u8 = if (builtin.os.tag == .windows) &.{ "cmd.exe", "/c", "echo HTTPSEnable : 1" } else &.{ "/bin/sh", "-c", "echo 'HTTPSEnable : 1'" };
    const text = runCapture(io, testing.allocator, argv, &text_buf).?;
    try testing.expect(std.mem.startsWith(u8, text, "HTTPSEnable : 1"));
    try testing.expect(runCapture(io, testing.allocator, &.{"/nonexistent/goban-no-such-tool"}, &text_buf) == null);
    // Each system's branch runs; where its tool does not exist (or reports
    // no proxy) the request simply goes out directly.
    if (builtin.os.tag != .macos) try testing.expect(systemProxyOf(.macos, io, testing.allocator, &env, &out) == null);
    if (builtin.os.tag != .windows) {
        try env.put("SystemRoot", "/nonexistent/Windows");
        try testing.expect(systemProxyOf(.windows, io, testing.allocator, &env, &out) == null);
    }
    try testing.expect(systemProxyOf(.linux, io, testing.allocator, &env, &out) == null);
    // On the real system: whatever it says, it is a usable setting or none.
    if (systemProxy(io, testing.allocator, &env, &out)) |value| {
        var proxy: Proxy = .{};
        try testing.expect(parseProxy(value, &proxy));
    }
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

    var session: Session = undefined;
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
        var stale: Session = undefined;
        stale.init(testing.allocator, io, null, "github.com");
        defer stale.deinit();
        var gone: Proxy = .{};
        try testing.expect(parseProxy("http://127.0.0.1:9", &gone));
        stale.proxy = gone;
        var direct: MemorySink = .{};
        _ = try fetch(&stale, .{ .url = url, .user_agent = agent, .max_bytes = 4096 }, direct.sink(), &chunk);
        try testing.expectEqualStrings(whole.buf[0..whole.len], direct.buf[0..direct.len]);
        try testing.expect(stale.proxy == null);
    }
}
