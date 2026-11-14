//! The one JSON writer of the shell.
//!
//! Every reply to the page and every window event is built into a fixed
//! buffer with these two functions (the bridge_*.zig handlers, install_apply.zig,
//! update.zig, models.zig, store.zig). They return false when the buffer is full and
//! leave what was already written in place; the caller keeps a mark if it
//! wants to drop a half-written value.

const std = @import("std");

/// Append `text` as it is (punctuation, numbers, literals).
pub fn append(buf: []u8, n: *usize, text: []const u8) bool {
    if (n.* + text.len > buf.len) return false;
    @memcpy(buf[n.*..][0..text.len], text);
    n.* += text.len;
    return true;
}

/// Append `text` as a JSON string. `"` and `\` are escaped, control
/// characters (and DEL) become `\n`, `\r`, `\t` or `\u00XX`; every other
/// byte is copied, so UTF-8 text stays UTF-8. The caller makes sure `text`
/// is valid UTF-8 where the reader needs that (file paths).
pub fn appendString(buf: []u8, n: *usize, text: []const u8) bool {
    if (!append(buf, n, "\"")) return false;
    for (text) |c| {
        const ok = switch (c) {
            '"' => append(buf, n, "\\\""),
            '\\' => append(buf, n, "\\\\"),
            '\n' => append(buf, n, "\\n"),
            '\r' => append(buf, n, "\\r"),
            '\t' => append(buf, n, "\\t"),
            else => if (c < 0x20 or c == 0x7f) blk: {
                var esc: [6]u8 = undefined;
                const s = std.fmt.bufPrint(&esc, "\\u{x:0>4}", .{c}) catch break :blk false;
                break :blk append(buf, n, s);
            } else append(buf, n, &[_]u8{c}),
        };
        if (!ok) return false;
    }
    return append(buf, n, "\"");
}

/// Append a decimal integer.
pub fn appendInt(buf: []u8, n: *usize, value: anytype) bool {
    const s = std.fmt.bufPrint(buf[n.*..], "{d}", .{value}) catch return false;
    n.* += s.len;
    return true;
}

pub fn appendBool(buf: []u8, n: *usize, value: bool) bool {
    return append(buf, n, if (value) "true" else "false");
}

test "strings are escaped so that any text round-trips" {
    const cases = [_]struct { in: []const u8, out: []const u8 }{
        .{ .in = "", .out = "\"\"" },
        .{ .in = "plain", .out = "\"plain\"" },
        .{ .in = "q\"uote\\back", .out = "\"q\\\"uote\\\\back\"" },
        .{ .in = "a\nb\rc\td", .out = "\"a\\nb\\rc\\td\"" },
        .{ .in = "bell\x07 nul\x00 esc\x1b del\x7f", .out = "\"bell\\u0007 nul\\u0000 esc\\u001b del\\u007f\"" },
        .{ .in = "围棋 바둑 囲碁 é", .out = "\"围棋 바둑 囲碁 é\"" },
        .{ .in = "C:\\Users\\a\\棋谱.sgf", .out = "\"C:\\\\Users\\\\a\\\\棋谱.sgf\"" },
    };
    for (cases) |c| {
        var buf: [128]u8 = undefined;
        var n: usize = 0;
        try std.testing.expect(appendString(&buf, &n, c.in));
        try std.testing.expectEqualStrings(c.out, buf[0..n]);
        const parsed = try std.json.parseFromSlice([]const u8, std.testing.allocator, buf[0..n], .{});
        defer parsed.deinit();
        try std.testing.expectEqualStrings(c.in, parsed.value);
    }
}

test "a full buffer is reported, never overrun" {
    var buf: [8]u8 = undefined;
    var n: usize = 0;
    try std.testing.expect(append(&buf, &n, "{\"a\":"));
    try std.testing.expect(!appendString(&buf, &n, "too long"));
    try std.testing.expect(n <= buf.len);
    n = 0;
    try std.testing.expect(appendString(&buf, &n, "sixsix"));
    try std.testing.expect(!append(&buf, &n, "x"));
    n = 0;
    // An escape that does not fit whole is not written in part.
    var tiny: [5]u8 = undefined;
    try std.testing.expect(!appendString(&tiny, &n, "\x01"));
    n = 0;
    try std.testing.expect(appendInt(&buf, &n, @as(u64, 1234567)));
    try std.testing.expect(appendBool(&buf, &n, true) == false);
    try std.testing.expectEqualStrings("1234567", buf[0..n]);
}
