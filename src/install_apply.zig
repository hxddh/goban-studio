//! Update install: where the update goes and how it is applied. The
//! installation found from the executable path, the arguments the
//! helper launches the new app with, the helper's lock and start, and
//! the bridge replies. install.zig describes the whole flow.
const std = @import("std");
const builtin = @import("builtin");
const json = @import("json.zig");
const install_mod = @import("install.zig");
const install_package = @import("install_package.zig");

const testing = std.testing;

/// How long the app waits for the helper's "started" marker. A cold
/// Windows PowerShell under an antivirus scan can take well over ten
/// seconds to run its first line; the page shows "installing" meanwhile
/// (`studio.updateStatus`), and the app stays usable if the time runs out.
pub const helper_start_timeout_ms: i64 = 25_000;
pub const started_prefix = "goban-update-started-";
/// How long the helper waits for the new app to acknowledge its launch.
pub const ack_timeout_s: u32 = 90;

pub const staging_dir_name = "GobanStudio-update";
pub const log_name = "GobanStudio-update.log";
pub const ack_prefix = "goban-update-ack-";
pub const ack_arg = "--goban-update-ack=";
pub const failed_arg = "--goban-update-failed";

pub const helper_macos = @embedFile("updater/apply-macos.sh");
pub const helper_windows = @embedFile("updater/apply-windows.ps1");
// ------------------------------------------------------------ install target

pub const Blocked = enum {
    none,
    /// Not macOS or Windows.
    Unsupported,
    /// A development build (no .app bundle / no bin\ + resources\ layout).
    NotPackaged,
    /// macOS App Translocation: the app runs from a randomized read-only
    /// copy (it was opened from Downloads with the quarantine flag).
    Translocated,
    /// The app, or the folder it is in, cannot be written by this user.
    ReadOnlyLocation,
    /// No per-user temp directory to stage in.
    NoTempDir,
    /// Not probed yet this session (`studio.updateStatus` without `probe`).
    NotChecked,
};

/// The installed package to replace, derived from the executable path:
///   macOS:   <dir>/<Name>.app/Contents/MacOS/<exe>   → <dir>/<Name>.app
///   Windows: <root>\bin\goban-studio.exe             → <root>
pub fn installRootFromExe(exe: []const u8, os: std.Target.Os.Tag) ?[]const u8 {
    switch (os) {
        .macos => {
            const macos_dir = dirname(exe, '/') orelse return null;
            if (!std.mem.eql(u8, basename(macos_dir, '/'), "MacOS")) return null;
            const contents = dirname(macos_dir, '/') orelse return null;
            if (!std.mem.eql(u8, basename(contents, '/'), "Contents")) return null;
            const bundle = dirname(contents, '/') orelse return null;
            if (!std.mem.endsWith(u8, bundle, ".app") or bundle.len <= 5) return null;
            if (dirname(bundle, '/') == null) return null;
            return bundle;
        },
        .windows => {
            const bin = dirname(exe, '\\') orelse return null;
            if (!std.ascii.eqlIgnoreCase(basename(bin, '\\'), "bin")) return null;
            const root = dirname(bin, '\\') orelse return null;
            // A drive root ("C:") cannot be renamed.
            if (root.len <= 3 or dirname(root, '\\') == null) return null;
            return root;
        },
        else => return null,
    }
}

fn dirname(path: []const u8, sep: u8) ?[]const u8 {
    var end = path.len;
    while (end > 1 and (path[end - 1] == sep or (sep == '\\' and path[end - 1] == '/'))) end -= 1;
    const i = std.mem.lastIndexOfAny(u8, path[0..end], if (sep == '\\') "\\/" else "/") orelse return null;
    if (i == 0) return path[0..1];
    return path[0..i];
}

fn basename(path: []const u8, sep: u8) []const u8 {
    const i = std.mem.lastIndexOfAny(u8, path, if (sep == '\\') "\\/" else "/") orelse return path;
    return path[i + 1 ..];
}

/// Can this user create and remove a file in `dir`?
fn probeWritable(io: std.Io, dir: []const u8, token: []const u8) bool {
    var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const probe = std.fmt.bufPrint(&buf, "{s}{c}.goban-write-test-{s}", .{ dir, std.fs.path.sep, token }) catch return false;
    var file = std.Io.Dir.createFileAbsolute(io, probe, .{ .exclusive = true }) catch return false;
    file.close(io);
    std.Io.Dir.deleteFileAbsolute(io, probe) catch {};
    return true;
}

pub const Target = struct {
    blocked: Blocked = .Unsupported,
    root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    root_len: usize = 0,

    pub fn root(self: *const Target) []const u8 {
        return self.root_buf[0..self.root_len];
    }
};

/// Find the installation and decide whether it can be replaced in place.
pub fn detectTarget(io: std.Io, token: []const u8) Target {
    var t: Target = .{};
    if (install_mod.currentPlatform() == .unsupported) return t;
    var exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const exe_len = std.process.executablePath(io, &exe_buf) catch {
        t.blocked = .NotPackaged;
        return t;
    };
    const exe = exe_buf[0..exe_len];
    const root = installRootFromExe(exe, builtin.os.tag) orelse {
        t.blocked = .NotPackaged;
        return t;
    };
    @memcpy(t.root_buf[0..root.len], root);
    t.root_len = root.len;
    if (builtin.os.tag == .macos and std.mem.indexOf(u8, root, "/AppTranslocation/") != null) {
        t.blocked = .Translocated;
        return t;
    }
    if (builtin.os.tag == .windows) {
        var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const res = std.fmt.bufPrint(&buf, "{s}\\resources\\frontend\\dist", .{root}) catch {
            t.blocked = .NotPackaged;
            return t;
        };
        var d = std.Io.Dir.cwd().openDir(io, res, .{}) catch {
            t.blocked = .NotPackaged;
            return t;
        };
        d.close(io);
    }
    const parent = dirname(root, if (builtin.os.tag == .windows) '\\' else '/') orelse {
        t.blocked = .NotPackaged;
        return t;
    };
    var inner_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const inner = std.fmt.bufPrint(&inner_buf, "{s}{c}{s}", .{ root, std.fs.path.sep, if (builtin.os.tag == .windows) "bin" else "Contents" }) catch {
        t.blocked = .NotPackaged;
        return t;
    };
    if (!probeWritable(io, parent, token) or !probeWritable(io, inner, token)) {
        t.blocked = .ReadOnlyLocation;
        return t;
    }
    t.blocked = .none;
    return t;
}

/// `<temp>/GobanStudio-update`, from TMPDIR (macOS) or TEMP/TMP (Windows).
pub fn stagingRoot(env: *const std.process.Environ.Map, buf: []u8) ?[]const u8 {
    const keys: []const []const u8 = if (builtin.os.tag == .windows) &.{ "TEMP", "TMP", "LOCALAPPDATA" } else &.{"TMPDIR"};
    for (keys) |key| {
        const dir = env.get(key) orelse continue;
        if (dir.len == 0 or !std.fs.path.isAbsolute(dir)) continue;
        const trimmed = std.mem.trimEnd(u8, dir, "/\\");
        return std.fmt.bufPrint(buf, "{s}{c}{s}", .{ trimmed, std.fs.path.sep, staging_dir_name }) catch null;
    }
    return null;
}

// ------------------------------------------------------------ launch args

/// What the helper told this launch, from argv.
pub const LaunchNote = struct {
    /// Write this file once the app is up (the helper is waiting for it).
    ack_buf: [1024]u8 = undefined,
    ack_len: usize = 0,
    /// Launched by the helper after a successful swap.
    just_updated: bool = false,
    /// Relaunched by the helper after a failed install was rolled back.
    install_failed: bool = false,
    acked: bool = false,

    pub fn ackPath(self: *const LaunchNote) []const u8 {
        return self.ack_buf[0..self.ack_len];
    }

    /// Accepts `--goban-update-ack=<absolute path to goban-update-ack-*.txt>`
    /// and `--goban-update-failed`; ignores everything else.
    pub fn noteArg(self: *LaunchNote, arg: []const u8) void {
        if (std.mem.eql(u8, arg, failed_arg)) {
            self.install_failed = true;
            return;
        }
        if (!std.mem.startsWith(u8, arg, ack_arg)) return;
        const path = arg[ack_arg.len..];
        if (!validAckPath(path) or path.len > self.ack_buf.len) return;
        @memcpy(self.ack_buf[0..path.len], path);
        self.ack_len = path.len;
        self.just_updated = true;
    }
};

pub fn validAckPath(path: []const u8) bool {
    if (path.len == 0 or path.len > 1024 or !std.fs.path.isAbsolute(path)) return false;
    for (path) |c| {
        if (c < 0x20) return false;
    }
    const name = std.fs.path.basename(path);
    if (!std.mem.startsWith(u8, name, ack_prefix) or !std.mem.endsWith(u8, name, ".txt")) return false;
    for (name[ack_prefix.len .. name.len - 4]) |c| {
        if (!std.ascii.isAlphanumeric(c)) return false;
    }
    return name.len > ack_prefix.len + 4;
}

/// Tell the waiting helper that this (new) app started and its page is up.
pub fn writeAck(io: std.Io, note: *LaunchNote) void {
    if (note.acked or note.ack_len == 0) return;
    note.acked = true;
    var file = std.Io.Dir.createFileAbsolute(io, note.ackPath(), .{ .exclusive = true }) catch return;
    defer file.close(io);
    file.writeStreamingAll(io, "ok\n") catch {};
}

/// The error names the page sees (`{ok:false, error}`).
pub fn errorName(err: anyerror) []const u8 {
    return switch (err) {
        error.Busy => "Busy",
        error.BadTag => "BadTag",
        error.Unsupported => "Unsupported",
        error.Network => "Network",
        error.BadRedirect => "BadRedirect",
        error.HttpStatus => "HttpStatus",
        error.NoAsset => "NoAsset",
        error.TooLarge => "TooLarge",
        error.NoChecksum => "NoChecksum",
        error.NoSignature => "NoSignature",
        error.BadSignature => "BadSignature",
        error.NoVersion => "NoVersion",
        error.VersionMismatch => "VersionMismatch",
        error.SizeMismatch => "Network",
        error.ChecksumMismatch => "ChecksumMismatch",
        error.Unpack => "Unpack",
        error.BadPackage => "BadPackage",
        error.Cancelled => "Cancelled",
        error.Disk => "Disk",
        error.NoTempDir => "NoTempDir",
        error.OutOfMemory => "OutOfMemory",
        else => "Unavailable",
    };
}

// ------------------------------------------------------------ apply

/// The installation's helper lock: `.<name>.goban-lock` beside it (a
/// directory holding the helper's pid on macOS, a delete-on-close file
/// held open without sharing on Windows; see src/updater/).
pub fn lockPath(buf: []u8, target: []const u8) ?[]const u8 {
    const parent = std.fs.path.dirname(target) orelse return null;
    const name = std.fs.path.basename(target);
    if (name.len == 0) return null;
    return std.fmt.bufPrint(buf, "{s}{c}.{s}.goban-lock", .{ parent, std.fs.path.sep, name }) catch null;
}

/// Is another update helper working on `target` right now? macOS: the
/// lock directory names a live process. Windows: the lock file exists at
/// all (it is deleted when its holder's handle closes, even on a crash).
pub fn helperLockHeld(io: std.Io, target: []const u8) bool {
    var buf: [install_mod.path_cap]u8 = undefined;
    const lock = lockPath(&buf, target) orelse return false;
    switch (builtin.os.tag) {
        .windows => return install_package.fileExists(io, lock),
        .macos, .linux => {
            var pid_path_buf: [install_mod.path_cap]u8 = undefined;
            const pid_path = std.fmt.bufPrint(&pid_path_buf, "{s}/pid", .{lock}) catch return false;
            var text_buf: [32]u8 = undefined;
            const text = install_package.readHead(io, pid_path, &text_buf) orelse return false;
            const pid = std.fmt.parseInt(std.posix.pid_t, std.mem.trim(u8, text, " \t\r\n"), 10) catch return false;
            if (pid <= 0) return false;
            // Signal 0: only "does it exist" (EPERM: it does, another user's).
            std.posix.kill(pid, @enumFromInt(0)) catch |err| return err == error.PermissionDenied;
            return true;
        },
        else => return false,
    }
}

/// A helper is done within minutes (it waits at most five for the app to
/// exit and a minute and a half for the new one). A lock older than this
/// was left behind by a helper that was killed, or names a process id that
/// now belongs to something else: it must not keep the app from starting.
pub const helper_lock_max_age_ms: i64 = 20 * 60 * 1000;

fn lockAgeMs(io: std.Io, target: []const u8) ?i64 {
    var buf: [install_mod.path_cap]u8 = undefined;
    const lock = lockPath(&buf, target) orelse return null;
    const stat = std.Io.Dir.cwd().statFile(io, lock, .{}) catch return null;
    const now = std.Io.Timestamp.now(io, .real).toMilliseconds();
    return now - stat.mtime.toMilliseconds();
}

pub fn lockIsRecent(age_ms: i64) bool {
    // A clock that went backwards makes the lock look new: still recent.
    return age_ms < helper_lock_max_age_ms;
}

/// Is an update helper replacing the installation at `target` right now?
/// A launch must not get in its way: files opened from the folder being
/// swapped would make the swap fail. When the lock's age cannot be read
/// the answer is no: better a launch that disturbs an update (the helper
/// retries, then rolls back) than an app that will not start.
pub fn updateInProgress(io: std.Io, target: []const u8) bool {
    if (!helperLockHeld(io, target)) return false;
    return lockIsRecent(lockAgeMs(io, target) orelse return false);
}

/// `updateInProgress` for the installation this process runs from; false
/// for a development build.
pub fn ownUpdateInProgress(io: std.Io) bool {
    var exe_buf: [install_mod.path_cap]u8 = undefined;
    const exe_len = std.process.executablePath(io, &exe_buf) catch return false;
    const root = installRootFromExe(exe_buf[0..exe_len], builtin.os.tag) orelse return false;
    return updateInProgress(io, root);
}

/// Did the helper create its "started" marker?
pub fn helperStarted(io: std.Io, path: []const u8) bool {
    var buf: [16]u8 = undefined;
    const text = install_package.readHead(io, path, &buf) orelse return false;
    return std.mem.startsWith(u8, text, "started");
}

/// The app stops waiting: create the marker itself, exclusively, so a
/// helper that starts later finds it taken and gives up without touching
/// anything. False when the helper got there first (it did start).
pub fn claimStarted(io: std.Io, path: []const u8) bool {
    var file = std.Io.Dir.createFileAbsolute(io, path, .{ .exclusive = true }) catch return false;
    defer file.close(io);
    file.writeStreamingAll(io, "cancelled\n") catch {};
    return true;
}

pub const HelperStart = struct {
    /// An error name for the page, or null when the helper was started.
    err: ?[]const u8 = null,
    /// The marker the helper creates once it holds the lock.
    started: []const u8 = "",
};

/// Write the embedded helper into the staging root and start it detached.
/// The caller waits for `HelperStart.started` to appear (`helperStarted`)
/// before it quits. `started_buf` holds the marker's path.
pub fn startHelper(
    io: std.Io,
    env: *const std.process.Environ.Map,
    root: []const u8,
    target: []const u8,
    staged: []const u8,
    started_buf: []u8,
) HelperStart {
    const fail = HelperStart{ .err = "Helper" };
    // A lock left behind long ago by a helper that was killed is not one;
    // a lock whose age cannot be read is taken at its word.
    if (helperLockHeld(io, target) and lockIsRecent(lockAgeMs(io, target) orelse 0)) return .{ .err = "HelperBusy" };
    var token_bytes: [8]u8 = undefined;
    io.random(&token_bytes);
    const token = std.fmt.bytesToHex(token_bytes, .lower);
    var script_buf: [install_mod.path_cap]u8 = undefined;
    var ack_buf: [install_mod.path_cap]u8 = undefined;
    var log_buf: [install_mod.path_cap]u8 = undefined;
    const ext = if (builtin.os.tag == .windows) "ps1" else "sh";
    const script = std.fmt.bufPrint(&script_buf, "{s}{c}apply-{s}.{s}", .{ root, std.fs.path.sep, &token, ext }) catch return fail;
    const ack = std.fmt.bufPrint(&ack_buf, "{s}{c}{s}{s}.txt", .{ root, std.fs.path.sep, ack_prefix, &token }) catch return fail;
    const started = std.fmt.bufPrint(started_buf, "{s}{c}{s}{s}.txt", .{ root, std.fs.path.sep, started_prefix, &token }) catch return fail;
    const parent = std.fs.path.dirname(root) orelse return fail;
    const log = std.fmt.bufPrint(&log_buf, "{s}{c}{s}", .{ parent, std.fs.path.sep, log_name }) catch return fail;
    {
        var file = std.Io.Dir.createFileAbsolute(io, script, .{ .exclusive = true }) catch return fail;
        defer file.close(io);
        const text = if (builtin.os.tag == .windows) helper_windows else helper_macos;
        file.writeStreamingAll(io, text) catch return fail;
    }
    var pid_buf: [24]u8 = undefined;
    var timeout_buf: [12]u8 = undefined;
    const timeout = std.fmt.bufPrint(&timeout_buf, "{d}", .{ack_timeout_s}) catch return fail;
    switch (builtin.os.tag) {
        .macos => {
            const pid = std.fmt.bufPrint(&pid_buf, "{d}", .{std.c.getpid()}) catch return fail;
            _ = std.process.spawn(io, .{
                .argv = &.{ "/bin/sh", script, pid, target, staged, ack, log, timeout, root, started },
                // Never inside the bundle it is about to move.
                .cwd = .{ .path = root },
                .stdin = .ignore,
                .stdout = .ignore,
                .stderr = .ignore,
                // Its own process group: nothing sent to the app's group
                // while it quits reaches the helper.
                .pgid = 0,
            }) catch return fail;
        },
        .windows => {
            const pid = std.fmt.bufPrint(&pid_buf, "{d}", .{std.os.windows.GetCurrentProcessId()}) catch return fail;
            var ps_buf: [install_mod.path_cap]u8 = undefined;
            const system_root = env.get("SystemRoot") orelse env.get("SYSTEMROOT") orelse "C:\\Windows";
            const powershell = std.fmt.bufPrint(&ps_buf, "{s}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", .{system_root}) catch return fail;
            _ = std.process.spawn(io, .{
                .argv = &.{
                    powershell,     "-NoProfile",  "-NonInteractive", "-ExecutionPolicy", "Bypass",
                    "-WindowStyle", "Hidden",      "-File",           script,             "-AppPid",
                    pid,            "-InstallDir", target,            "-StagedDir",       staged,
                    "-AckFile",     ack,           "-LogFile",        log,                "-AckTimeout",
                    timeout,        "-CleanupDir", root,              "-StartedFile",     started,
                },
                // A process whose current directory is inside the install
                // folder would keep Windows from renaming it.
                .cwd = .{ .path = root },
                .stdin = .ignore,
                .stdout = .ignore,
                .stderr = .ignore,
                .create_no_window = true,
            }) catch return fail;
        },
        else => return .{ .err = "Unsupported" },
    }
    return .{ .started = started };
}

// ------------------------------------------------------------ replies

/// The `studio.updateStatus` reply.
pub fn statusReply(out: []u8, snap: *const install_mod.Snapshot, platform: install_mod.Platform, blocked: Blocked, note: *const LaunchNote) []const u8 {
    var n: usize = 0;
    var num: [96]u8 = undefined;
    const counts = std.fmt.bufPrint(&num, ",\"received\":{d},\"total\":{d},\"retries\":{d}", .{ snap.received, snap.total, snap.retries }) catch "";
    const ok = json.append(out, &n, "{\"ok\":true,\"phase\":") and
        json.appendString(out, &n, @tagName(snap.phase)) and
        json.append(out, &n, ",\"tag\":") and
        json.appendString(out, &n, snap.tag()) and
        json.append(out, &n, ",\"asset\":") and
        json.appendString(out, &n, platform.assetName() orelse "") and
        json.append(out, &n, ",\"platform\":") and
        json.appendString(out, &n, platform.label()) and
        json.append(out, &n, counts) and
        json.append(out, &n, ",\"error\":") and
        json.appendString(out, &n, snap.error_name) and
        json.append(out, &n, ",\"canInstall\":") and
        json.append(out, &n, if (blocked == .none) "true" else "false") and
        json.append(out, &n, ",\"blocked\":") and
        json.appendString(out, &n, if (blocked == .none) "" else @tagName(blocked)) and
        json.append(out, &n, ",\"justUpdated\":") and
        json.append(out, &n, if (note.just_updated) "true" else "false") and
        json.append(out, &n, ",\"installFailed\":") and
        json.append(out, &n, if (note.install_failed) "true" else "false") and
        json.append(out, &n, "}");
    if (!ok) return "{\"ok\":false,\"error\":\"Unavailable\"}";
    return out[0..n];
}

pub fn errorReply(out: []u8, name: []const u8) []const u8 {
    var n: usize = 0;
    if (json.append(out, &n, "{\"ok\":false,\"error\":") and json.appendString(out, &n, name) and json.append(out, &n, "}")) return out[0..n];
    return "{\"ok\":false,\"error\":\"Unavailable\"}";
}

/// The `studio.updateDownload` reply once the download thread is done.
pub fn downloadReply(out: []u8, snap: *const install_mod.Snapshot, platform: install_mod.Platform) []const u8 {
    if (snap.phase != .ready) return errorReply(out, if (snap.error_name.len > 0) snap.error_name else "Unavailable");
    var n: usize = 0;
    const ok = json.append(out, &n, "{\"ok\":true,\"phase\":\"ready\",\"tag\":") and
        json.appendString(out, &n, snap.tag()) and
        json.append(out, &n, ",\"asset\":") and
        json.appendString(out, &n, platform.assetName() orelse "") and
        json.append(out, &n, "}");
    if (!ok) return "{\"ok\":false,\"error\":\"Unavailable\"}";
    return out[0..n];
}

test "the installation is found from the executable path" {
    try testing.expectEqualStrings("/Applications/Goban Studio.app", installRootFromExe("/Applications/Goban Studio.app/Contents/MacOS/goban-studio", .macos).?);
    try testing.expectEqualStrings("/Users/a/Apps/GobanStudio.app", installRootFromExe("/Users/a/Apps/GobanStudio.app/Contents/MacOS/goban-studio", .macos).?);
    try testing.expect(installRootFromExe("/Users/a/src/goban/zig-out/bin/goban-studio", .macos) == null);
    try testing.expect(installRootFromExe("/x/Contents/MacOS/goban-studio", .macos) == null);
    try testing.expectEqualStrings("C:\\Users\\a\\Apps\\GobanStudio", installRootFromExe("C:\\Users\\a\\Apps\\GobanStudio\\bin\\goban-studio.exe", .windows).?);
    try testing.expectEqualStrings("D:\\Go Apps\\GobanStudio", installRootFromExe("D:\\Go Apps\\GobanStudio\\BIN\\goban-studio.exe", .windows).?);
    try testing.expect(installRootFromExe("C:\\bin\\goban-studio.exe", .windows) == null);
    try testing.expect(installRootFromExe("C:\\src\\goban\\zig-out\\bin2\\goban-studio.exe", .windows) == null);
    try testing.expect(installRootFromExe("/usr/bin/goban-studio", .linux) == null);
}

test "launch arguments from the helper" {
    var note: LaunchNote = .{};
    note.noteArg("--goban-update-ack=/var/folders/x/T/GobanStudio-update/goban-update-ack-0123abcd.txt");
    try testing.expect(note.just_updated);
    try testing.expectEqualStrings("/var/folders/x/T/GobanStudio-update/goban-update-ack-0123abcd.txt", note.ackPath());
    var bad: LaunchNote = .{};
    bad.noteArg("--goban-update-ack=relative/goban-update-ack-1.txt");
    bad.noteArg("--goban-update-ack=/etc/passwd");
    bad.noteArg("--goban-update-ack=/tmp/goban-update-ack-../../x.txt");
    bad.noteArg("--goban-update-ack=/tmp/goban-update-ack-.txt");
    bad.noteArg("game.sgf");
    try testing.expect(!bad.just_updated and bad.ack_len == 0 and !bad.install_failed);
    bad.noteArg(failed_arg);
    try testing.expect(bad.install_failed);
    if (builtin.os.tag == .windows) {
        try testing.expect(validAckPath("C:\\Users\\a\\AppData\\Local\\Temp\\GobanStudio-update\\goban-update-ack-ab12.txt"));
    }
}

test "status and download replies" {
    var out: [1024]u8 = undefined;
    var snap: install_mod.Snapshot = .{ .phase = .downloading, .received = 10, .total = 100 };
    @memcpy(snap.tag_buf[0..6], "v5.0.1");
    snap.tag_len = 6;
    const note: LaunchNote = .{};
    try testing.expectEqualStrings(
        "{\"ok\":true,\"phase\":\"downloading\",\"tag\":\"v5.0.1\",\"asset\":\"GobanStudio-macOS-arm64.zip\",\"platform\":\"macos-arm64\",\"received\":10,\"total\":100,\"retries\":0,\"error\":\"\",\"canInstall\":true,\"blocked\":\"\",\"justUpdated\":false,\"installFailed\":false}",
        statusReply(&out, &snap, .macos_arm64, .none, &note),
    );
    try testing.expect(std.mem.indexOf(u8, statusReply(&out, &snap, .windows_x64, .ReadOnlyLocation, &note), "\"canInstall\":false,\"blocked\":\"ReadOnlyLocation\"") != null);
    snap.phase = .failed;
    snap.error_name = "ChecksumMismatch";
    try testing.expectEqualStrings("{\"ok\":false,\"error\":\"ChecksumMismatch\"}", downloadReply(&out, &snap, .macos_arm64));
    snap.phase = .ready;
    try testing.expectEqualStrings("{\"ok\":true,\"phase\":\"ready\",\"tag\":\"v5.0.1\",\"asset\":\"GobanStudio-Windows-x64.zip\"}", downloadReply(&out, &snap, .windows_x64));
}

test "the helpers are embedded and take the documented arguments" {
    try testing.expect(std.mem.indexOf(u8, helper_macos, "APP_PID=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, "--goban-update-ack=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, "STARTED=${8:-}") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, ".goban-lock") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "$AppPid") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "--goban-update-ack=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "[string]$StartedFile") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "DeleteOnClose") != null);
}

test "the helper's started marker is claimed by exactly one side" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [install_mod.path_cap]u8 = undefined;
    const dir = try install_package.testTempDir(io, &tmp, &dir_buf);
    var path_buf: [install_mod.path_cap]u8 = undefined;
    const marker = try std.fmt.bufPrint(&path_buf, "{s}{c}" ++ started_prefix ++ "00aa.txt", .{ dir, std.fs.path.sep });
    try testing.expect(!helperStarted(io, marker));
    // The helper wrote it first: the app cannot claim it, and sees it started.
    try install_package.writeTestFile(io, marker, "started 123\n");
    try testing.expect(helperStarted(io, marker));
    try testing.expect(!claimStarted(io, marker));
    // The app claims first: it is "cancelled", never "started".
    const late = try std.fmt.bufPrint(&path_buf, "{s}{c}" ++ started_prefix ++ "00bb.txt", .{ dir, std.fs.path.sep });
    try testing.expect(claimStarted(io, late));
    try testing.expect(!helperStarted(io, late));
    try testing.expect(!claimStarted(io, late));
}

test "a live helper's lock is seen; a stale one is not" {
    if (builtin.os.tag == .windows) return error.SkipZigTest;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [install_mod.path_cap]u8 = undefined;
    const dir = try install_package.testTempDir(io, &tmp, &dir_buf);
    var target_buf: [install_mod.path_cap]u8 = undefined;
    const target = try std.fmt.bufPrint(&target_buf, "{s}/Goban Studio.app", .{dir});
    var lock_buf: [install_mod.path_cap]u8 = undefined;
    const lock = lockPath(&lock_buf, target).?;
    try testing.expect(std.mem.endsWith(u8, lock, "/.Goban Studio.app.goban-lock"));
    try testing.expect(!helperLockHeld(io, target));
    try std.Io.Dir.cwd().createDirPath(io, lock);
    var pid_path_buf: [install_mod.path_cap]u8 = undefined;
    const pid_path = try std.fmt.bufPrint(&pid_path_buf, "{s}/pid", .{lock});
    var pid_text: [24]u8 = undefined;
    try install_package.writeTestFile(io, pid_path, try std.fmt.bufPrint(&pid_text, "{d}\n", .{if (builtin.os.tag == .linux) std.os.linux.getpid() else std.c.getpid()}));
    try testing.expect(helperLockHeld(io, target));
    // A launch during the swap stays out of the way.
    try testing.expect(updateInProgress(io, target));
    // A pid that cannot be running.
    try std.Io.Dir.deleteFileAbsolute(io, pid_path);
    try install_package.writeTestFile(io, pid_path, "2147483646\n");
    try testing.expect(!helperLockHeld(io, target));
    try testing.expect(!updateInProgress(io, target));
    // A lock that outlived any helper never keeps the app from starting.
    try testing.expect(lockIsRecent(0));
    try testing.expect(lockIsRecent(5 * 60 * 1000));
    try testing.expect(!lockIsRecent(helper_lock_max_age_ms));
    try testing.expect(!updateInProgress(io, "/nowhere/Goban Studio.app"));
}

