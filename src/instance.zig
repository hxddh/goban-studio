//! One process per data directory.
//!
//! Two processes that each rewrite `settings.json`, `profile.json` and the
//! games would lose each other's work (the later write wins). So the first
//! thing `main` does is take an exclusive, advisory lock on
//! `<data dir>/instance.lock` and keep the file open for as long as the
//! process lives. The operating system drops the lock when the process ends,
//! however it ends, so there is nothing stale to detect.
//!
//! A second launch finds the lock taken. It leaves a request in
//! `<data dir>/inbox/` (the `.sgf` files it was asked to open, or nothing:
//! "come to the front"), which the running app picks up within half a
//! second and deletes. The second process watches that file:
//!
//!   * gone                the running app took the request: exit;
//!   * the lock came free  the other process was only on its way out (it was
//!                         flushing its last writes): carry on as the one
//!                         instance;
//!   * neither in `handover_timeout_ms`   take the request back and exit.
//!
//! A request is a small text file, one absolute path per line; only `.sgf`
//! paths are accepted, exactly as for a launch argument.
//!
//! Everything here is plain files through `std.Io`, the same on macOS,
//! Windows and Linux (where the unit tests run).

const std = @import("std");

pub const lock_name = "instance.lock";
pub const inbox_name = "inbox";
const request_prefix = "open-";
const request_suffix = ".txt";
const temp_prefix = ".tmp-";
/// Requests read in one poll, and paths taken from one request.
pub const max_requests = 8;
pub const max_paths = 16;
const max_request_bytes = 64 * 1024;
const max_path_bytes = 4096;
/// How long a second launch waits for the running app to take its request.
pub const handover_timeout_ms: i64 = 4_000;
pub const handover_poll_ms: i64 = 150;

pub const Acquired = union(enum) {
    /// This process owns the data directory until it exits (keep the file).
    owner: std.Io.File,
    /// Another process owns it.
    busy,
    /// No lock could be taken (no data directory, or it cannot be written).
    /// The app runs without the protection rather than not at all.
    unavailable,
};

fn join(buf: []u8, dir: []const u8, name: []const u8) ?[]const u8 {
    return std.fmt.bufPrint(buf, "{s}{c}{s}", .{ dir, std.fs.path.sep, name }) catch null;
}

/// Take the data directory for this process.
pub fn acquire(io: std.Io, data_dir: []const u8) Acquired {
    if (data_dir.len == 0 or !std.fs.path.isAbsolute(data_dir)) return .unavailable;
    std.Io.Dir.cwd().createDirPath(io, data_dir) catch return .unavailable;
    var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = join(&buf, data_dir, lock_name) orelse return .unavailable;
    // Never truncated on open: a second process must not empty the file
    // the owner wrote its pid to.
    const file = std.Io.Dir.createFileAbsolute(io, path, .{
        .read = true,
        .truncate = false,
        .lock = .exclusive,
        .lock_nonblocking = true,
    }) catch |err| return switch (err) {
        error.WouldBlock => .busy,
        else => .unavailable,
    };
    // For someone looking at the folder; nothing reads it.
    var text: [32]u8 = undefined;
    if (std.fmt.bufPrint(&text, "{d}\n", .{currentPid()})) |line| {
        file.setLength(io, 0) catch {};
        file.writePositionalAll(io, line, 0) catch {};
    } else |_| {}
    return .{ .owner = file };
}

fn currentPid() u64 {
    return switch (@import("builtin").os.tag) {
        .windows => std.os.windows.GetCurrentProcessId(),
        .linux => @intCast(std.os.linux.getpid()),
        else => @intCast(std.c.getpid()),
    };
}

/// A launch argument (or a line of a request) the app opens: an absolute
/// path of a `.sgf` file, short enough, without control characters.
pub fn wantedPath(arg: []const u8) bool {
    if (arg.len == 0 or arg.len > max_path_bytes) return false;
    if (!std.ascii.endsWithIgnoreCase(arg, ".sgf")) return false;
    if (!std.fs.path.isAbsolute(arg)) return false;
    for (arg) |c| {
        if (c < 0x20 or c == 0x7f) return false;
    }
    return std.unicode.utf8ValidateSlice(arg);
}

/// The text of a request: the wanted paths, one per line.
pub fn requestText(out: []u8, paths: []const []const u8) []const u8 {
    var n: usize = 0;
    var count: usize = 0;
    for (paths) |path| {
        if (count >= max_paths) break;
        if (!wantedPath(path)) continue;
        if (n + path.len + 1 > out.len) break;
        @memcpy(out[n..][0..path.len], path);
        out[n + path.len] = '\n';
        n += path.len + 1;
        count += 1;
    }
    return out[0..n];
}

pub const PathList = struct {
    items: [max_paths][]const u8 = undefined,
    len: usize = 0,

    pub fn slice(self: *const PathList) []const []const u8 {
        return self.items[0..self.len];
    }
};

/// The wanted paths in a request's text (slices of `text`).
pub fn parseRequest(text: []const u8, list: *PathList) void {
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        if (list.len >= max_paths) return;
        const line = std.mem.trimEnd(u8, raw, "\r");
        if (!wantedPath(line)) continue;
        list.items[list.len] = line;
        list.len += 1;
    }
}

pub const Request = struct {
    path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    path_len: usize = 0,

    pub fn path(self: *const Request) []const u8 {
        return self.path_buf[0..self.path_len];
    }
};

/// Second launch: leave a request for the running app. `token` makes the
/// file name unique (random hex). The file appears under its final name
/// only when it is complete (written beside, then renamed).
pub fn sendRequest(io: std.Io, data_dir: []const u8, paths: []const []const u8, token: []const u8, request: *Request) bool {
    var inbox_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const inbox = join(&inbox_buf, data_dir, inbox_name) orelse return false;
    std.Io.Dir.cwd().createDirPath(io, inbox) catch return false;
    var temp_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const temp = std.fmt.bufPrint(&temp_buf, "{s}{c}{s}{s}", .{ inbox, std.fs.path.sep, temp_prefix, token }) catch return false;
    const final = std.fmt.bufPrint(&request.path_buf, "{s}{c}{s}{s}{s}", .{ inbox, std.fs.path.sep, request_prefix, token, request_suffix }) catch return false;
    request.path_len = final.len;
    var text_buf: [max_request_bytes]u8 = undefined;
    const text = requestText(&text_buf, paths);
    {
        var file = std.Io.Dir.createFileAbsolute(io, temp, .{ .exclusive = true }) catch return false;
        defer file.close(io);
        file.writeStreamingAll(io, text) catch {
            std.Io.Dir.deleteFileAbsolute(io, temp) catch {};
            return false;
        };
    }
    std.Io.Dir.renameAbsolute(temp, final, io) catch {
        std.Io.Dir.deleteFileAbsolute(io, temp) catch {};
        return false;
    };
    return true;
}

/// Did the running app take (delete) the request?
pub fn requestTaken(io: std.Io, request: *const Request) bool {
    std.Io.Dir.accessAbsolute(io, request.path(), .{}) catch |err| return err == error.FileNotFound;
    return false;
}

pub fn withdrawRequest(io: std.Io, request: *const Request) void {
    std.Io.Dir.deleteFileAbsolute(io, request.path()) catch {};
}

pub const Handover = enum {
    /// The running app has the request: this process exits.
    taken,
    /// The other process ended: this process owns the data directory now.
    became_owner,
    /// Nobody answered in time: this process exits.
    timed_out,
};

pub const HandoverResult = struct {
    outcome: Handover,
    lock: ?std.Io.File = null,
};

/// Second launch, after `acquire` said `busy`: hand `paths` to the running
/// app, or take over if it was only on its way out.
pub fn handOver(io: std.Io, data_dir: []const u8, paths: []const []const u8, token: []const u8) HandoverResult {
    return handOverWithin(io, data_dir, paths, token, handover_timeout_ms);
}

pub fn handOverWithin(io: std.Io, data_dir: []const u8, paths: []const []const u8, token: []const u8, timeout_ms: i64) HandoverResult {
    var request: Request = .{};
    const sent = sendRequest(io, data_dir, paths, token, &request);
    var waited: i64 = 0;
    while (waited < timeout_ms) : (waited += handover_poll_ms) {
        if (sent and requestTaken(io, &request)) return .{ .outcome = .taken };
        switch (acquire(io, data_dir)) {
            .owner => |file| {
                // Its own arguments are handled the normal way.
                if (sent) withdrawRequest(io, &request);
                return .{ .outcome = .became_owner, .lock = file };
            },
            .busy, .unavailable => {},
        }
        std.Io.sleep(io, .fromMilliseconds(handover_poll_ms), .awake) catch {};
    }
    if (sent) withdrawRequest(io, &request);
    return .{ .outcome = .timed_out };
}

fn isRequestName(name: []const u8) bool {
    return name.len > request_prefix.len + request_suffix.len and
        std.mem.startsWith(u8, name, request_prefix) and std.mem.endsWith(u8, name, request_suffix);
}

pub const Taken = struct {
    /// Requests found (and deleted), with or without paths.
    requests: usize = 0,
};

/// The running app: take every waiting request (at most `max_requests` a
/// call), delete it and hand each wanted path to `callback`. A request
/// that cannot be read is deleted all the same, so it cannot block the
/// ones behind it.
pub fn takeRequests(
    io: std.Io,
    data_dir: []const u8,
    context: *anyopaque,
    callback: *const fn (context: *anyopaque, path: []const u8) void,
) Taken {
    var taken: Taken = .{};
    if (data_dir.len == 0) return taken;
    var inbox_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const inbox = join(&inbox_buf, data_dir, inbox_name) orelse return taken;
    var dir = std.Io.Dir.cwd().openDir(io, inbox, .{ .iterate = true }) catch return taken;
    defer dir.close(io);
    // Names first: the directory is not changed while it is being listed.
    var names: [max_requests][96]u8 = undefined;
    var lens: [max_requests]usize = undefined;
    var count: usize = 0;
    var it = dir.iterate();
    while (it.next(io) catch null) |entry| {
        if (count >= max_requests) break;
        if (!isRequestName(entry.name) or entry.name.len > names[0].len) continue;
        @memcpy(names[count][0..entry.name.len], entry.name);
        lens[count] = entry.name.len;
        count += 1;
    }
    const text = std.heap.page_allocator.alloc(u8, max_request_bytes) catch return taken;
    defer std.heap.page_allocator.free(text);
    for (0..count) |i| {
        const name = names[i][0..lens[i]];
        const read = dir.readFile(io, name, text) catch "";
        dir.deleteFile(io, name) catch continue;
        taken.requests += 1;
        var list: PathList = .{};
        parseRequest(read, &list);
        for (list.slice()) |path| callback(context, path);
    }
    return taken;
}

// ------------------------------------------------------------------ tests

const testing = std.testing;

fn tempPath(io: std.Io, tmp: *testing.TmpDir, buf: []u8) ![]const u8 {
    const n = try tmp.dir.realPath(io, buf);
    return buf[0..n];
}

const Collected = struct {
    paths: [8][256]u8 = undefined,
    lens: [8]usize = undefined,
    n: usize = 0,

    fn add(context: *anyopaque, path: []const u8) void {
        const self: *Collected = @ptrCast(@alignCast(context));
        if (self.n >= self.paths.len) return;
        @memcpy(self.paths[self.n][0..path.len], path);
        self.lens[self.n] = path.len;
        self.n += 1;
    }

    fn get(self: *const Collected, i: usize) []const u8 {
        return self.paths[i][0..self.lens[i]];
    }
};

const abs = if (@import("builtin").os.tag == .windows) "C:\\games\\" else "/games/";

test "the first process owns the data directory; a second one is told it is busy" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const root = try tempPath(io, &tmp, &dir_buf);
    var data_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    // Not created yet: the lock makes the directory.
    const data = try std.fmt.bufPrint(&data_buf, "{s}{c}app{c}data", .{ root, std.fs.path.sep, std.fs.path.sep });

    const first = acquire(io, data);
    try testing.expect(first == .owner);
    try testing.expect(acquire(io, data) == .busy);
    try testing.expect(acquire(io, data) == .busy);
    // The owner's pid is still in the file: a second open did not empty it.
    var lock_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const lock_path = join(&lock_buf, data, lock_name).?;
    var stat_dir = try std.Io.Dir.cwd().openDir(io, data, .{});
    defer stat_dir.close(io);
    try testing.expect((try stat_dir.statFile(io, lock_name, .{})).size > 1);
    _ = lock_path;

    // The owner ends (its file closes): the next launch owns it.
    first.owner.close(io);
    const second = acquire(io, data);
    try testing.expect(second == .owner);
    second.owner.close(io);

    // No usable directory: the app still starts, unprotected.
    try testing.expect(acquire(io, "") == .unavailable);
    try testing.expect(acquire(io, "relative/data") == .unavailable);
}

test "only absolute .sgf paths are passed on" {
    try testing.expect(wantedPath(abs ++ "a.sgf"));
    try testing.expect(wantedPath(abs ++ "名局 1.SGF"));
    try testing.expect(!wantedPath("a.sgf"));
    try testing.expect(!wantedPath(abs ++ "a.txt"));
    try testing.expect(!wantedPath(abs ++ "a.sgf\nrm"));
    try testing.expect(!wantedPath(abs ++ "bad\xff.sgf"));
    try testing.expect(!wantedPath("--goban-update-ack=" ++ abs ++ "x.sgf"));
    try testing.expect(!wantedPath(""));

    var buf: [512]u8 = undefined;
    const text = requestText(&buf, &.{ abs ++ "a.sgf", "relative.sgf", "--flag", abs ++ "b.sgf" });
    try testing.expectEqualStrings(abs ++ "a.sgf\n" ++ abs ++ "b.sgf\n", text);
    var list: PathList = .{};
    parseRequest(abs ++ "a.sgf\r\n\n" ++ abs ++ "notes.txt\nrelative.sgf\n" ++ abs ++ "b.sgf", &list);
    try testing.expectEqual(@as(usize, 2), list.len);
    try testing.expectEqualStrings(abs ++ "a.sgf", list.items[0]);
    try testing.expectEqualStrings(abs ++ "b.sgf", list.items[1]);
}

test "a second launch's request reaches the running app once" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data = try tempPath(io, &tmp, &dir_buf);

    var got: Collected = .{};
    // No inbox yet.
    try testing.expectEqual(@as(usize, 0), takeRequests(io, data, &got, Collected.add).requests);

    var request: Request = .{};
    try testing.expect(sendRequest(io, data, &.{ abs ++ "one.sgf", abs ++ "two.sgf" }, "00aa11bb", &request));
    try testing.expect(!requestTaken(io, &request));
    // "Come to the front": a request without paths.
    var empty: Request = .{};
    try testing.expect(sendRequest(io, data, &.{}, "00aa11cc", &empty));
    // Half-written requests and anything else in the folder are not read.
    var inbox = try tmp.dir.openDir(io, inbox_name, .{});
    defer inbox.close(io);
    try inbox.writeFile(io, .{ .sub_path = temp_prefix ++ "ffff", .data = abs ++ "half.sgf\n" });
    try inbox.writeFile(io, .{ .sub_path = "notes.txt", .data = abs ++ "other.sgf\n" });

    const taken = takeRequests(io, data, &got, Collected.add);
    try testing.expectEqual(@as(usize, 2), taken.requests);
    try testing.expectEqual(@as(usize, 2), got.n);
    try testing.expectEqualStrings(abs ++ "one.sgf", got.get(0));
    try testing.expectEqualStrings(abs ++ "two.sgf", got.get(1));
    try testing.expect(requestTaken(io, &request));
    try testing.expect(requestTaken(io, &empty));
    // Taken once.
    try testing.expectEqual(@as(usize, 0), takeRequests(io, data, &got, Collected.add).requests);
    try testing.expectEqual(@as(usize, 2), got.n);

    // A launch that gets no answer takes its request back.
    try testing.expect(sendRequest(io, data, &.{abs ++ "late.sgf"}, "00aa11dd", &request));
    withdrawRequest(io, &request);
    try testing.expectEqual(@as(usize, 0), takeRequests(io, data, &got, Collected.add).requests);
}

test "handing over: taken by the running app, or the lock comes free" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data = try tempPath(io, &tmp, &dir_buf);

    // The owner is alive and polls: the second launch sees its request go.
    const owner = acquire(io, data);
    try testing.expect(owner == .owner);
    const Poller = struct {
        fn run(poll_io: std.Io, dir: []const u8, got: *Collected) void {
            var i: usize = 0;
            while (i < 200) : (i += 1) {
                if (takeRequests(poll_io, dir, got, Collected.add).requests > 0) return;
                std.Io.sleep(poll_io, .fromMilliseconds(20), .awake) catch {};
            }
        }
    };
    var got: Collected = .{};
    const thread = try std.Thread.spawn(.{}, Poller.run, .{ io, data, &got });
    const taken = handOver(io, data, &.{abs ++ "game.sgf"}, "0102030405060708");
    thread.join();
    try testing.expectEqual(Handover.taken, taken.outcome);
    try testing.expectEqual(@as(usize, 1), got.n);
    try testing.expectEqualStrings(abs ++ "game.sgf", got.get(0));

    // The owner is there but does not answer (hung): the second launch
    // gives up and leaves nothing behind.
    const unanswered = handOverWithin(io, data, &.{abs ++ "game.sgf"}, "010203040506070a", 2 * handover_poll_ms);
    try testing.expectEqual(Handover.timed_out, unanswered.outcome);
    try testing.expect(unanswered.lock == null);
    var left: Collected = .{};
    try testing.expectEqual(@as(usize, 0), takeRequests(io, data, &left, Collected.add).requests);

    // The owner was on its way out: the second launch becomes the instance,
    // and its request is not left for anyone.
    owner.owner.close(io);
    const next = handOver(io, data, &.{abs ++ "game.sgf"}, "0102030405060709");
    try testing.expectEqual(Handover.became_owner, next.outcome);
    try testing.expect(acquire(io, data) == .busy);
    var none: Collected = .{};
    try testing.expectEqual(@as(usize, 0), takeRequests(io, data, &none, Collected.add).requests);
    next.lock.?.close(io);
}
