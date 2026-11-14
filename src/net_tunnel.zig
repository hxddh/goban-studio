//! One thread's connection settings (`Session`), and the TLS connection
//! through a proxy's CONNECT tunnel that a proxied request uses (see
//! net.zig).

const std = @import("std");
const net_proxy = @import("net_proxy.zig");

// ------------------------------------------------------------------ tunnel

/// One thread's connection settings for a few requests in a row.
pub const Session = struct {
    allocator: std.mem.Allocator,
    io: std.Io,
    /// Direct requests, and the certificate bundle of every request.
    client: std.http.Client,
    proxy: ?net_proxy.Proxy = null,

    /// `host` is the first host that will be asked (for NO_PROXY).
    pub fn init(self: *Session, allocator: std.mem.Allocator, io: std.Io, env: ?*const std.process.Environ.Map, host: []const u8) void {
        self.* = .{ .allocator = allocator, .io = io, .client = .{ .allocator = allocator, .io = io } };
        var proxy: net_proxy.Proxy = .{};
        if (net_proxy.chooseProxy(io, allocator, env, host, &proxy)) self.proxy = proxy;
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
pub const Tunnel = struct {
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
    pub fn create(session: *Session, proxy: *const net_proxy.Proxy, host: []const u8, port: u16, user_agent: []const u8) !*Tunnel {
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

    pub fn destroy(self: *Tunnel) void {
        self.stream.close(self.io);
        const gpa = self.gpa;
        gpa.free(self.buffers);
        gpa.destroy(self);
    }

    /// Send a GET and return the response head's bytes.
    pub fn get(self: *Tunnel, uri: std.Uri, user_agent: []const u8, headers: []const std.http.Header) ![]const u8 {
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

// ------------------------------------------------------------------ tests

const testing = std.testing;

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
