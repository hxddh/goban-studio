//! Bridge commands for updates: the check (update.zig), the release page,
//! and the download, verification and install (install.zig).
const std = @import("std");
const builtin = @import("builtin");
const native_sdk = @import("native_sdk");
const engine_request = @import("engine_request.zig");
const update_mod = @import("update.zig");
const install_mod = @import("install.zig");
const install_apply = @import("install_apply.zig");
const runner = @import("runner");
const bridge_katago = @import("bridge_katago.zig");
const lifecycle = @import("lifecycle.zig");
const shell = @import("shell.zig");
const App = shell.App;

// ------------------------------------------------------------ updates
//
// "Offline by design" with one user-controlled exception: the page may ask
// for the latest release (a menu pick, or the opt-in weekly check). The
// request runs on its own thread (update.zig); the reply comes back here
// through the platform wake or the fallback timer, like KataGo's.

fn installUpdateWake(self: *App) void {
    if (self.update_wake_installed) return;
    const runtime = self.runtime orelse return;
    const services = runtime.options.platform.services;
    self.updater.setWake(services.context, services.wake_fn);
    self.update_wake_installed = true;
}

pub fn nowMs(self: *App) i64 {
    return std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
}

fn stopUpdateTimer(self: *App) void {
    if (!self.update_timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(shell.update_timer_id) catch {};
    self.update_timer_running = false;
}

/// `studio.checkUpdate` {}: GET the latest GitHub release of this app.
/// Replies (always a bridge success) `{ok:true, latest, url, notes,
/// publishedAt, prerelease}` or `{ok:false, error}` with error one of
/// Busy, Timeout, Network, NoRelease, RateLimited, HttpStatus,
/// BadResponse, ResponseTooLarge, OutOfMemory, Unavailable.
pub fn checkUpdate(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    const rid = invocation.request.id;
    if (self.update_active) {
        responder.success(rid, "{\"ok\":false,\"error\":\"Busy\"}") catch {};
        return;
    }
    installUpdateWake(self);
    if (!bridge_katago.keepBridgeId(rid, &self.update_bridge_id, &self.update_bridge_id_len, responder)) return;
    const gen = self.updater.start() catch |err| {
        const reply = if (err == error.Busy) "{\"ok\":false,\"error\":\"Busy\"}" else "{\"ok\":false,\"error\":\"Unavailable\"}";
        responder.success(rid, reply) catch {};
        return;
    };
    self.update_responder = responder;
    self.update_gen = gen;
    self.update_deadline_ms = nowMs(self) + update_mod.timeout_ms;
    self.update_active = true;
    if (!self.update_timer_running) {
        if (self.runtime) |runtime| {
            if (runtime.options.platform.services.startTimer(shell.update_timer_id, shell.update_timer_interval_ns, true)) |_| {
                self.update_timer_running = true;
            } else |_| {}
        }
    }
}

/// Answer the open update check if its thread has finished or its time is
/// up. UI thread.
pub fn drainUpdate(self: *App) void {
    if (!self.update_active) {
        stopUpdateTimer(self);
        return;
    }
    const buf = engine_request.result_allocator.alloc(u8, update_mod.max_reply_bytes) catch return;
    defer engine_request.result_allocator.free(buf);
    const id = self.update_bridge_id[0..self.update_bridge_id_len];
    if (self.updater.take(self.update_gen, buf)) |reply| {
        self.update_active = false;
        self.update_responder.success(id, reply) catch {};
    } else if (nowMs(self) >= self.update_deadline_ms) {
        self.updater.abandon(self.update_gen);
        self.update_active = false;
        self.update_responder.success(id, "{\"ok\":false,\"error\":\"Timeout\"}") catch {};
    }
    if (!self.update_active) stopUpdateTimer(self);
}

/// `studio.openReleasePage`: open the app's fixed GitHub releases page in
/// the system browser. The payload is ignored: the page can never choose
/// the address. Replies `{ok}`.
pub fn openReleasePage(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    const url = update_mod.releases_page_url;
    var opened = false;
    if (self.runtime) |runtime| {
        if (runtime.options.platform.services.openExternalUrl(url)) |_| {
            opened = true;
        } else |_| {}
    }
    if (!opened) opened = spawnBrowser(self.io, url);
    return std.fmt.bufPrint(output, "{{\"ok\":{s}}}", .{if (opened) "true" else "false"}) catch error.HandlerFailed;
}

/// Fallback when the platform's open-URL service is missing or fails:
/// `open` (macOS), the URL protocol handler (Windows), `xdg-open`.
fn spawnBrowser(io: std.Io, url: []const u8) bool {
    const argv: []const []const u8 = switch (builtin.os.tag) {
        .macos => &.{ "/usr/bin/open", url },
        .windows => &.{ "rundll32.exe", "url.dll,FileProtocolHandler", url },
        else => &.{ "xdg-open", url },
    };
    var child = std.process.spawn(io, .{
        .argv = argv,
        .stdin = .ignore,
        .stdout = .ignore,
        .stderr = .ignore,
        .create_no_window = true,
    }) catch return false;
    _ = child.wait(io) catch {};
    return true;
}

// ------------------------------------------------------------ update install
//
// v5: after a check found a newer release, the player may download and
// install it (install.zig). The download runs on its own thread; the page
// polls `studio.updateStatus` for progress and is answered on
// `studio.updateDownload` when the thread is done (platform wake, or the
// fallback timer, which also runs the stall watchdog).

fn stagingRoot(self: *App) ?[]const u8 {
    return install_apply.stagingRoot(self.env_map, &self.staging_root_buf);
}

/// Can this installation be replaced in place? Probed once a session (it
/// writes and removes a test file next to the app), again before a download.
fn installTarget(self: *App, refresh: bool) *const install_apply.Target {
    if (!self.install_target_known or refresh) {
        var token_bytes: [6]u8 = undefined;
        self.io.random(&token_bytes);
        const token = std.fmt.bytesToHex(token_bytes, .lower);
        self.install_target = install_apply.detectTarget(self.io, &token);
        if (self.install_target.blocked == .none and stagingRoot(self) == null) self.install_target.blocked = .NoTempDir;
        self.install_target_known = true;
    }
    return &self.install_target;
}

fn installWakeUp(self: *App) void {
    if (self.install_wake_installed) return;
    const runtime = self.runtime orelse return;
    const services = runtime.options.platform.services;
    self.installer.setWake(services.context, services.wake_fn);
    self.install_wake_installed = true;
}

fn stopInstallTimer(self: *App) void {
    if (!self.install_timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(shell.install_timer_id) catch {};
    self.install_timer_running = false;
}

const StatusPayload = struct {
    probe: bool = false,
};

/// `studio.updateStatus` {probe?}: where an update download / install
/// stands. Replies `{ok:true, phase, tag, asset, platform, received, total,
/// retries, error, canInstall, blocked, justUpdated, installFailed}`; phase is one of
/// idle, downloading, verifying, unpacking, ready, installing, failed,
/// cancelled. `blocked` (when canInstall is false): Unsupported,
/// NotPackaged, Translocated, ReadOnlyLocation, NoTempDir, or NotChecked
/// until a call with `probe:true` (which writes and removes one test file
/// next to the app, once a session) has looked.
pub fn updateStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    install_apply.writeAck(self.io, &self.installer.note);
    const snap = self.installer.snapshot();
    var probe = false;
    if (std.json.parseFromSlice(StatusPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true })) |parsed| {
        probe = parsed.value.probe;
        parsed.deinit();
    } else |_| {}
    const blocked: install_apply.Blocked = if (probe or self.install_target_known) installTarget(self, false).blocked else .NotChecked;
    return install_apply.statusReply(output, &snap, self.installer.platform, blocked, &self.installer.note);
}

/// `studio.updateCancel` {}: stop a download (its files are removed), or
/// discard a downloaded update that was not installed. Replies `{ok, phase}`.
pub fn updateCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    const phase = self.installer.cancel();
    // The open download call is answered with Cancelled.
    if (self.install_active) {
        self.install_active = false;
        self.install_responder.success(self.install_bridge_id[0..self.install_bridge_id_len], "{\"ok\":false,\"error\":\"Cancelled\"}") catch {};
        stopInstallTimer(self);
    }
    return std.fmt.bufPrint(output, "{{\"ok\":true,\"phase\":\"{s}\"}}", .{@tagName(phase)}) catch error.HandlerFailed;
}

const DownloadPayload = struct {
    tag: []const u8 = "",
};

/// May `tag` be installed over this version? v13: only the tag this
/// app's own last successful check returned, and only when it is newer
/// than the running version (no downgrades, no tags the page made up).
/// Returns the refusal's error name, or null.
fn installRefusal(self: *App, tag: []const u8) ?[]const u8 {
    var checked_buf: [64]u8 = undefined;
    const checked = self.updater.lastTag(&checked_buf);
    if (checked.len == 0 or !std.mem.eql(u8, checked, tag)) return "NotChecked";
    if (!update_mod.isNewer(tag, runner.app_version)) return "NotNewer";
    return null;
}

/// `studio.updateDownload` {tag}: download this platform's package of
/// release `tag` and SHA256SUMS (and, in a signed build, SHA256SUMS.sig)
/// from the fixed GitHub release-download address, verify and unpack it.
/// `tag` must be the one the last `studio.checkUpdate` found, newer than
/// this version. Answered when done: `{ok:true, phase:"ready", tag, asset}`
/// or `{ok:false, error}` with error one of Busy, BadTag, NotChecked,
/// NotNewer, Unsupported, NotPackaged, Translocated, ReadOnlyLocation,
/// NoTempDir, Network, BadRedirect, HttpStatus, NoAsset, TooLarge,
/// NoChecksum, NoSignature, BadSignature, NoVersion (a signed build was
/// given sums that name no version), VersionMismatch (the sums, or the
/// package itself, are of another version than `tag`), ChecksumMismatch,
/// Unpack, BadPackage, Disk, Stalled, Cancelled, OutOfMemory, Unavailable.
/// A connection that breaks off or goes silent is continued from the bytes
/// on disk a few times first (`retries` in `studio.updateStatus`).
pub fn updateDownload(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    const rid = invocation.request.id;
    var reply_buf: [256]u8 = undefined;
    if (self.install_active) {
        responder.success(rid, "{\"ok\":false,\"error\":\"Busy\"}") catch {};
        return;
    }
    const parsed = std.json.parseFromSlice(DownloadPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch {
        responder.success(rid, "{\"ok\":false,\"error\":\"BadTag\"}") catch {};
        return;
    };
    defer parsed.deinit();
    const tag = parsed.value.tag;
    const probe = self.probe_tag_len > 0 and std.mem.eql(u8, tag, self.probe_tag_buf[0..self.probe_tag_len]);
    if (!probe) {
        if (installRefusal(self, tag)) |name| {
            responder.success(rid, install_apply.errorReply(&reply_buf, name)) catch {};
            return;
        }
    }
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_apply.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
        return;
    }
    const root = stagingRoot(self) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NoTempDir\"}") catch {};
        return;
    };
    if (!bridge_katago.keepBridgeId(rid, &self.install_bridge_id, &self.install_bridge_id_len, responder)) return;
    installWakeUp(self);
    const gen = self.installer.start(root, tag, nowMs(self)) catch |err| {
        responder.success(rid, install_apply.errorReply(&reply_buf, install_apply.errorName(err))) catch {};
        return;
    };
    self.install_responder = responder;
    self.install_gen = gen;
    self.install_active = true;
    if (!self.install_timer_running) {
        if (self.runtime) |runtime| {
            if (runtime.options.platform.services.startTimer(shell.install_timer_id, shell.install_timer_interval_ns, true)) |_| {
                self.install_timer_running = true;
            } else |_| {}
        }
    }
}

/// Answer the open download once its thread is done. A connection that
/// brought no byte for `install_mod.stall_timeout_ms` is replaced by a new
/// one (install.zig `checkStall`). UI thread.
pub fn drainInstall(self: *App) void {
    if (!self.install_active) {
        stopInstallTimer(self);
        return;
    }
    _ = self.installer.checkStall(nowMs(self));
    const snap = self.installer.snapshot();
    const done = snap.gen != self.install_gen or switch (snap.phase) {
        .ready, .failed, .cancelled, .idle => true,
        else => false,
    };
    if (!done) return;
    var buf: [256]u8 = undefined;
    const reply = if (snap.gen != self.install_gen)
        install_apply.errorReply(&buf, if (snap.error_name.len > 0) snap.error_name else "Cancelled")
    else
        install_apply.downloadReply(&buf, &snap, self.installer.platform);
    self.install_active = false;
    self.install_responder.success(self.install_bridge_id[0..self.install_bridge_id_len], reply) catch {};
    stopInstallTimer(self);
}

/// `studio.updateApply` {}: install the downloaded update. Starts the
/// embedded helper (src/updater/) and waits (up to
/// `install.helper_start_timeout_ms`) for it to prove it is running; then
/// answers `{ok:true, phase:"installing"}`, lets the page flush its
/// pending writes and quits. The helper swaps the installation, starts the
/// new version and rolls back if it does not come up. `{ok:false,
/// error}`: Busy, NotReady, NotChecked, NotNewer, Unsupported,
/// NotPackaged, Translocated, ReadOnlyLocation, NoTempDir, Helper,
/// HelperBusy (another helper is updating this installation),
/// HelperNotStarted (the app stays open), QuitFailed.
pub fn updateApply(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    const rid = invocation.request.id;
    var reply_buf: [256]u8 = undefined;
    if (self.apply_active or self.flush_active) {
        responder.success(rid, "{\"ok\":false,\"error\":\"Busy\"}") catch {};
        return;
    }
    var staged_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const staged = self.installer.stagedPath(&staged_buf) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NotReady\"}") catch {};
        return;
    };
    // A probe download (or anything not checked and newer) is never installed.
    const snap = self.installer.snapshot();
    if (installRefusal(self, snap.tag())) |name| {
        responder.success(rid, install_apply.errorReply(&reply_buf, name)) catch {};
        return;
    }
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_apply.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
        return;
    }
    const root = stagingRoot(self) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NoTempDir\"}") catch {};
        return;
    };
    if (self.runtime == null) {
        responder.success(rid, "{\"ok\":false,\"error\":\"QuitFailed\"}") catch {};
        return;
    }
    if (!bridge_katago.keepBridgeId(rid, &self.apply_bridge_id, &self.apply_bridge_id_len, responder)) return;
    self.installer.markInstalling();
    const started = install_apply.startHelper(self.io, self.env_map, root, target.root(), staged, &self.apply_started_buf);
    if (started.err) |err_name| {
        self.installer.markApplyFailed(err_name);
        responder.success(rid, install_apply.errorReply(&reply_buf, err_name)) catch {};
        return;
    }
    self.apply_started_len = started.started.len;
    self.apply_responder = responder;
    self.apply_deadline_ms = nowMs(self) + install_apply.helper_start_timeout_ms;
    self.apply_active = true;
    lifecycle.startGateTimer(self);
}
