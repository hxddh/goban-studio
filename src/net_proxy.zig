//! Which proxy an HTTPS request uses (see net.zig): the environment,
//! then the system's manual HTTPS proxy (macOS `scutil --proxy`, Windows
//! the Internet Settings values), parsed into a `Proxy`.

const std = @import("std");
const builtin = @import("builtin");
const net_tunnel = @import("net_tunnel.zig");

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

// ------------------------------------------------------------------ tests

const testing = std.testing;

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
    var session: net_tunnel.Session = undefined;
    session.init(testing.allocator, io, &env, "example.org");
    defer session.deinit();
    try testing.expectEqualStrings("127.0.0.1", session.proxy.?.host());
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
