const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const update_mod = @import("update.zig");
const install_mod = @import("install.zig");
const models_mod = @import("models.zig");
const store_mod = @import("store.zig");
const files_mod = @import("files.zig");
const win_close = @import("win_close.zig");
const json = @import("json.zig");
const paths_mod = @import("paths.zig");
const instance_mod = @import("instance.zig");
const net_mod = @import("net.zig");
const app_options = @import("app_options");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

/// The Vite dev server's origin. Only development builds let it call the
/// bridge (`-Ddev-origin`, default: on in Debug, off in every release
/// mode): in a released app any local process listening on that port
/// could otherwise serve a page with the app's file and update commands.
const dev_server_origin = "http://127.0.0.1:5173";
const allowed_origins = if (app_options.dev_origin)
    [_][]const u8{ "zero://app", "zero://inline", dev_server_origin }
else
    [_][]const u8{ "zero://app", "zero://inline" };
const max_open_paths = 16;

/// The update key compiled in with `-Dupdate-pubkey` (docs/signing.md), or
/// null. A malformed key is a compile error, never a silently unsigned app.
const update_public_key = install_mod.parsePublicKey(app_options.update_pubkey) catch
    @compileError("-Dupdate-pubkey must be the base64 of a 32-byte Ed25519 public key");

const OpenCallback = *const fn (context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void;
extern fn goban_install_open_handler(context: ?*anyopaque, callback: OpenCallback) void;
/// macOS quit (⌘Q, Dock, AppleScript, SIGTERM): the callback returns 1 to
/// hold the quit until `goban_reply_quit` or a 3 s backstop (src/macos_open.m).
const QuitCallback = *const fn (context: ?*anyopaque) callconv(.c) c_int;
extern fn goban_install_quit_handler(context: ?*anyopaque, callback: QuitCallback) void;
extern fn goban_reply_quit() void;

// Startup menus are empty → host default bar. The page installs its own,
// localized menus with `studio.setMenus` (macOS); with the SDK patch from
// scripts/patch-sdk.mjs they sit between the system App/File/Edit menus and
// the system View/Window menus.

/// Timer that collects KataGo worker output while async requests are open,
/// in case a platform wake is coalesced away. Below the SDK's reserved ids.
const katago_timer_id: u64 = 0x6b61_7461_676f;
const katago_timer_interval_ns: u64 = 50 * std.time.ns_per_ms;
const max_jobs = 8;
/// Timer that collects the update check's result (and enforces its
/// deadline) while one is open; same role as the KataGo timer.
const update_timer_id: u64 = 0x7570_6461_7465;
const update_timer_interval_ns: u64 = 250 * std.time.ns_per_ms;
/// Timer that collects a finished update download (and runs its stall
/// watchdog) while `studio.updateDownload` is open.
const install_timer_id: u64 = 0x696e_7374_616c;
const install_timer_interval_ns: u64 = 500 * std.time.ns_per_ms;
/// Timer that runs the quit gate (v13): the page's flush before the app
/// quits or the window closes, and the wait for the update helper's
/// "started" marker.
const gate_timer_id: u64 = 0x6761_7465;
const gate_timer_interval_ns: u64 = 100 * std.time.ns_per_ms;
/// How long the page gets to write what is pending before a quit (v13).
const flush_timeout_ms: i64 = 1_500;
/// Timer that looks for a second launch's request (instance.zig).
const inbox_timer_id: u64 = 0x696e_626f_78;
const inbox_timer_interval_ns: u64 = 400 * std.time.ns_per_ms;

/// What happens once the page has flushed (or its time is up).
const AfterFlush = enum { none, quit_app, reply_terminate, close_window };

/// An async analysis the page is waiting for. UI thread only.
const Job = struct {
    active: bool = false,
    seq: u64 = 0,
    responder: native_sdk.bridge.AsyncResponder = undefined,
    bridge_id: [native_sdk.bridge.max_id_bytes]u8 = undefined,
    bridge_id_len: usize = 0,
    /// The page's own request id, echoed in replies and stream events.
    id: [64]u8 = undefined,
    id_len: usize = 0,
    window_id: u64 = 1,
    stream: bool = false,
    /// The page cancelled or superseded it: reply `cancelled` whatever
    /// KataGo says (it may have finished in the same instant).
    cancelled: bool = false,
    /// The KataGo process that serves it (echoed as `engine`).
    slot: engine_mod.Slot = .standard,
    kind: engine_mod.Kind = .analyze,
    /// Backstop (v13): past this the page is answered `Timeout` whatever
    /// the worker is doing, so no request can hang. The worker's own
    /// watchdog (engine.zig) normally fires long before.
    deadline_ms: i64 = 0,

    fn idText(self: *const Job) []const u8 {
        return self.id[0..self.id_len];
    }
};

/// Labels and commands of the page's menus, copied into app-owned memory
/// before they are handed to the platform.
const MenuStore = struct {
    menus: [native_sdk.platform.max_menus]native_sdk.Menu = undefined,
    items: [native_sdk.platform.max_menu_items]native_sdk.MenuItem = undefined,
    text: [32 * 1024]u8 = undefined,
    text_len: usize = 0,

    fn keep(self: *MenuStore, value: []const u8) ?[]const u8 {
        if (self.text_len + value.len > self.text.len) return null;
        const out = self.text[self.text_len..][0..value.len];
        @memcpy(out, value);
        self.text_len += value.len;
        return out;
    }
};

const App = struct {
    env_map: *std.process.Environ.Map,
    io: std.Io,
    allocator: std.mem.Allocator,
    /// Absolute `frontend/dist` inside the packaged app, or the development
    /// path when running from the checkout. Native package puts the web
    /// assets outside `bin` (Windows) / `Contents/MacOS` (macOS); a relative
    /// path only worked when the process happened to start in the repository.
    frontend_dist: []const u8 = "frontend/dist",
    frontend_dist_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    /// 第一个事件(lifecycle.start)到来时记下;窗口拖动 / 标题栏几何要用它的平台服务。
    runtime: ?*native_sdk.Runtime = null,
    /// KataGo: the worker thread owns the GTP process for async requests;
    /// legacy sync calls borrow it with `lockExclusive`. Heap-allocated
    /// (large buffers) in `main`.
    katago: *engine_mod.Worker = undefined,
    /// Scratch for parsing one async request (it is copied into the
    /// worker's queue), so the bridge handler does not hold it on the stack.
    request_scratch: *engine_mod.Request = undefined,
    katago_available: bool = false,
    katago_version_buf: [128]u8 = undefined,
    katago_version: []const u8 = "",
    jobs: [max_jobs]Job = [_]Job{.{}} ** max_jobs,
    next_seq: u64 = 0,
    wake_installed: bool = false,
    timer_running: bool = false,
    menu_store: MenuStore = .{},
    /// Paths handed to us by LaunchServices / argv. They are read by the page
    /// once it is ready; keeping the queue here also covers an event that
    /// arrives before the webview has subscribed.
    open_paths: std.ArrayList([]u8) = .empty,
    /// Update check (the only network request; see update.zig). One open
    /// `studio.checkUpdate` call at a time. UI thread only, except the
    /// Checker's own locked slot.
    updater: *update_mod.Checker = undefined,
    update_wake_installed: bool = false,
    update_active: bool = false,
    update_gen: u64 = 0,
    update_deadline_ms: i64 = 0,
    update_timer_running: bool = false,
    update_responder: native_sdk.bridge.AsyncResponder = undefined,
    update_bridge_id: [native_sdk.bridge.max_id_bytes]u8 = undefined,
    update_bridge_id_len: usize = 0,
    /// Update install (v5; see install.zig). One open `studio.updateDownload`
    /// call at a time; progress is read with `studio.updateStatus`.
    installer: *install_mod.Installer = undefined,
    install_wake_installed: bool = false,
    install_active: bool = false,
    install_gen: u64 = 0,
    install_timer_running: bool = false,
    install_responder: native_sdk.bridge.AsyncResponder = undefined,
    install_bridge_id: [native_sdk.bridge.max_id_bytes]u8 = undefined,
    install_bridge_id_len: usize = 0,
    /// Whether this installation can be replaced in place, decided once.
    install_target: install_mod.Target = .{},
    install_target_known: bool = false,
    staging_root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    /// Optional networks (v5, models.zig): the page polls their state.
    models: *models_mod.Manager = undefined,
    /// v9 file storage (store.zig): `<app data>/data`, set up in `main`.
    store: store_mod.Store = undefined,
    /// v13: the user's files the page may read or write (files.zig).
    grants: files_mod.Grants = undefined,
    /// Held for the life of the process: this is the one instance that
    /// uses the data directory (instance.zig). Null when no lock could be
    /// taken; then nothing is handed over either.
    instance_lock: ?std.Io.File = null,
    inbox_timer_running: bool = false,
    /// A quit or window close has begun: requests of a second launch are
    /// left for it to notice that this process is going away.
    quitting: bool = false,
    /// v13 quit gate. The page announces its flush hook
    /// (`studio.flushHook`); a quit or window close then asks it to write
    /// what is pending (`app:flush` event) and waits for
    /// `studio.flushDone` or `flush_timeout_ms`, whichever comes first.
    flush_hook_ready: bool = false,
    flush_active: bool = false,
    flush_id: u64 = 0,
    flush_deadline_ms: i64 = 0,
    after_flush: AfterFlush = .none,
    gate_timer_running: bool = false,
    win_close_installed: bool = false,
    /// v13: `studio.updateApply` waits for the helper's "started" marker
    /// before it answers and quits.
    apply_active: bool = false,
    apply_deadline_ms: i64 = 0,
    apply_responder: native_sdk.bridge.AsyncResponder = undefined,
    apply_bridge_id: [native_sdk.bridge.max_id_bytes]u8 = undefined,
    apply_bridge_id_len: usize = 0,
    apply_started_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    apply_started_len: usize = 0,
    /// GOBAN_UPDATE_PROBE_TAG (the updater's CI probe): this one tag may be
    /// downloaded without a check, to be verified and discarded; it can
    /// never be installed.
    probe_tag_buf: [64]u8 = undefined,
    probe_tag_len: usize = 0,
    handlers: [sync_commands.len]native_sdk.BridgeHandler = undefined,
    async_handlers: [async_commands.len]native_sdk.bridge.AsyncHandler = undefined,
    policies: [sync_commands.len + async_commands.len]native_sdk.BridgeCommandPolicy = undefined,

    fn deinit(self: *@This()) void {
        for (self.open_paths.items) |path| self.allocator.free(path);
        self.open_paths.deinit(self.allocator);
        self.grants.deinit();
    }

    fn queueOpenPath(self: *@This(), path: []const u8) void {
        if (path.len == 0 or path.len > 4096) return;
        // The OS handed it over: the page may read it (files.zig).
        _ = self.grants.grant(path, .read, false);
        if (self.open_paths.items.len >= max_open_paths) return;
        if (self.open_paths.items.len > 0) {
            const last = self.open_paths.items[self.open_paths.items.len - 1];
            if (std.mem.eql(u8, last, path)) return;
        }
        const copy = self.allocator.dupe(u8, path) catch return;
        self.open_paths.append(self.allocator, copy) catch {
            self.allocator.free(copy);
        };
    }

    fn queueLaunchArgs(self: *@This(), args: std.process.Args) void {
        var it = std.process.Args.Iterator.initAllocator(args, self.allocator) catch return;
        defer it.deinit();
        _ = it.next(); // executable
        while (it.next()) |arg| {
            if (std.ascii.endsWithIgnoreCase(arg, ".sgf")) self.queueOpenPath(arg);
            // Launched by the update helper (install.zig).
            self.installer.note.noteArg(arg);
        }
    }

    fn directoryExists(self: *@This(), path: []const u8) bool {
        var dir = std.Io.Dir.cwd().openDir(self.io, path, .{}) catch return false;
        dir.close(self.io);
        return true;
    }

    /// Resolve the web assets from the executable rather than the caller's
    /// current directory. The packaged layouts are:
    ///
    ///   GobanStudio/bin/goban-studio.exe + GobanStudio/resources/frontend/dist
    ///   Goban Studio.app/Contents/MacOS/goban-studio + Contents/Resources/frontend/dist
    ///
    /// A development build has no package root, so it keeps `frontend/dist`
    /// relative to the checkout.
    fn resolveFrontendDist(self: *@This()) void {
        var exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const exe_len = std.process.executablePath(self.io, &exe_buf) catch 0;
        if (exe_len > 0) {
            if (std.fs.path.dirname(exe_buf[0..exe_len])) |exe_dir| {
                if (std.fs.path.dirname(exe_dir)) |package_root| {
                    const relative = if (builtin.os.tag == .macos) "Resources/frontend/dist" else "resources/frontend/dist";
                    if (std.fmt.bufPrint(&self.frontend_dist_buf, "{s}{c}{s}", .{ package_root, std.fs.path.sep, relative })) |candidate| {
                        if (self.directoryExists(candidate)) {
                            self.frontend_dist = candidate;
                            return;
                        }
                    } else |_| {}
                }
            }
        }
        self.frontend_dist = "frontend/dist";
    }

    fn app(self: *@This()) native_sdk.App {
        return .{
            .context = self,
            .name = "goban-studio",
            .source = native_sdk.frontend.productionSource(.{ .dist = self.frontend_dist }),
            .source_fn = source,
            .event_fn = onEvent,
        };
    }

    fn source(context: *anyopaque) anyerror!native_sdk.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return native_sdk.frontend.sourceFromEnv(self.env_map, .{
            .dist = self.frontend_dist,
            .entry = "index.html",
        });
    }

    fn bridge(self: *@This()) native_sdk.BridgeDispatcher {
        for (sync_commands, 0..) |command, i| {
            self.handlers[i] = .{ .name = command.name, .context = self, .invoke_fn = command.invoke };
            self.policies[i] = .{ .name = command.name, .origins = &allowed_origins };
        }
        for (async_commands, 0..) |command, i| {
            self.async_handlers[i] = .{ .name = command.name, .context = self, .invoke_fn = command.invoke };
            self.policies[sync_commands.len + i] = .{ .name = command.name, .origins = &allowed_origins };
        }
        return .{
            .policy = .{
                .enabled = true,
                .commands = self.policies[0..],
            },
            .registry = .{ .handlers = self.handlers[0..] },
            .async_registry = .{ .handlers = self.async_handlers[0..] },
        };
    }
};

const SyncCommand = struct { name: []const u8, invoke: native_sdk.bridge.HandlerFn };
const AsyncCommand = struct { name: []const u8, invoke: native_sdk.bridge.AsyncHandlerFn };

/// Every bridge command in one place (v13): the registry and the policy
/// (which origins may call it) are both built from these two tables, so a
/// command can never be registered without its policy, or the other way
/// round, and adding one is a one-line change.
const sync_commands = [_]SyncCommand{
    // The user's own files, only those native code handed out (files.zig).
    .{ .name = "studio.openFileDialog", .invoke = openFileDialog },
    .{ .name = "studio.saveFileDialog", .invoke = saveFileDialog },
    .{ .name = "studio.writeTextFile", .invoke = writeTextFile },
    .{ .name = "studio.readTextFile", .invoke = readTextFile },
    .{ .name = "studio.takeOpenFiles", .invoke = takeOpenFiles },
    .{ .name = "studio.revealDataDir", .invoke = revealDataDir },
    // Window chrome and menus.
    .{ .name = "studio.windowDrag", .invoke = windowDrag },
    .{ .name = "studio.windowChrome", .invoke = windowChrome },
    .{ .name = "studio.windowTheme", .invoke = windowTheme },
    .{ .name = "studio.setMenus", .invoke = setMenus },
    // The quit gate (v13).
    .{ .name = "studio.flushHook", .invoke = flushHook },
    .{ .name = "studio.flushDone", .invoke = flushDone },
    // KataGo (searches are async, below).
    .{ .name = "studio.katagoStatus", .invoke = katagoStatus },
    .{ .name = "studio.katagoCancel", .invoke = katagoCancel },
    // Release self-test and screenshot tour.
    .{ .name = "studio.selftest", .invoke = selftestConfig },
    // Updates.
    .{ .name = "studio.openReleasePage", .invoke = openReleasePage },
    .{ .name = "studio.updateStatus", .invoke = updateStatus },
    .{ .name = "studio.updateCancel", .invoke = updateCancel },
    // Optional networks.
    .{ .name = "studio.modelStatus", .invoke = modelStatus },
    .{ .name = "studio.modelDownload", .invoke = modelDownload },
    .{ .name = "studio.modelCancel", .invoke = modelCancel },
    .{ .name = "studio.modelRemove", .invoke = modelRemove },
    // v9 file storage (store.zig).
    .{ .name = "studio.storeRead", .invoke = storeRead },
    .{ .name = "studio.storeWrite", .invoke = storeWrite },
    .{ .name = "studio.storeList", .invoke = storeList },
    .{ .name = "studio.storeRemove", .invoke = storeRemove },
};

const async_commands = [_]AsyncCommand{
    .{ .name = "studio.katagoAnalyzeAsync", .invoke = katagoAnalyzeAsync },
    .{ .name = "studio.katagoHumanPolicy", .invoke = katagoHumanPolicy },
    .{ .name = "studio.checkUpdate", .invoke = checkUpdate },
    .{ .name = "studio.updateDownload", .invoke = updateDownload },
    .{ .name = "studio.updateApply", .invoke = updateApply },
};

/// OS "open with" / document-open events. The page subscribes to the
/// window event "open:files" and imports the first .sgf path. The event may
/// arrive before the page has subscribed; that is a platform limitation, not
/// a reason to keep a second copy of the file in native state.
const OPEN_FILE_VARIANTS = [_][]const u8{ "open_files", "open_file", "open_urls", "open_documents" };

fn forwardOpenFiles(self: *App, runtime: *native_sdk.Runtime, event: native_sdk.Event) void {
    inline for (OPEN_FILE_VARIANTS) |variant| {
        if (comptime @hasField(native_sdk.Event, variant)) {
            if (event == @field(std.meta.Tag(native_sdk.Event), variant)) {
                emitOpenFiles(self, runtime, @field(event, variant));
            }
        }
    }
}

fn openFilePathOf(item: anytype) ?[]const u8 {
    const T = @TypeOf(item);
    if (comptime @typeInfo(T) == .pointer) {
        const value: []const u8 = item;
        return value;
    }
    if (comptime @typeInfo(T) == .@"struct" and @hasField(T, "path")) {
        const value: []const u8 = item.path;
        return value;
    }
    return null;
}

fn emitOpenFiles(self: *App, runtime: *native_sdk.Runtime, payload: anytype) void {
    const P = @TypeOf(payload);
    var detail_buf: [8192]u8 = undefined;
    var n: usize = 0;
    if (!json.append(&detail_buf, &n, "{\"paths\":[")) return;
    var count: usize = 0;
    if (comptime @typeInfo(P) == .pointer) {
        for (payload) |item| {
            if (openFilePathOf(item)) |path| {
                if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
            }
        }
    } else if (comptime @typeInfo(P) == .@"struct") {
        if (comptime @hasField(P, "paths")) {
            for (payload.paths) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "files")) {
            for (payload.files) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "path")) {
            if (openFilePathOf(payload.path)) |path| {
                if (!appendOpenPath(self, &detail_buf, &n, &count, path)) return;
            }
        } else return;
    } else return;
    if (count == 0) return;
    if (!json.append(&detail_buf, &n, "]}")) return;
    runtime.emitWindowEvent(1, "open:files", detail_buf[0..n]) catch {};
}

/// One opened document into the event detail (and the page may read it).
/// A path that cannot be sent (empty, too long, not UTF-8) is skipped,
/// never the whole event.
fn appendOpenPath(self: *App, buf: []u8, n: *usize, count: *usize, path: []const u8) bool {
    if (path.len == 0 or path.len > 4096 or !std.unicode.utf8ValidateSlice(path)) return true;
    const mark = n.*;
    if (count.* > 0 and !json.append(buf, n, ",")) return false;
    if (!json.appendString(buf, n, path)) {
        n.* = mark;
        return false;
    }
    _ = self.grants.grant(path, .read, false);
    count.* += 1;
    return true;
}

fn onEvent(context: *anyopaque, runtime: *native_sdk.Runtime, event: native_sdk.Event) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    self.runtime = runtime;
    startInboxTimer(self);
    forwardOpenFiles(self, runtime, event);
    switch (event) {
        .command => |cmd| forwardCommand(runtime, cmd.name, cmd.window_id),
        // Dropped on the window: the user chose these, the page may read
        // them (the runtime emits `drop:files` to the page right after).
        .files_dropped => |drop| {
            for (drop.paths) |path| _ = self.grants.grant(path, .read, false);
        },
        // A KataGo worker result or partial report is waiting (the worker
        // nudged the loop through PlatformServices.wake), or the fallback
        // collection timer fired.
        .effects_wake => {
            drainKatago(self);
            drainUpdate(self);
            drainInstall(self);
        },
        .timer => |timer| {
            if (timer.id == katago_timer_id) drainKatago(self);
            if (timer.id == update_timer_id) drainUpdate(self);
            if (timer.id == install_timer_id) drainInstall(self);
            if (timer.id == gate_timer_id) runGate(self);
            if (timer.id == inbox_timer_id) pollInbox(self);
        },
        else => {},
    }
}

/// Native menu picks reach the page as `menu:command` ({command, windowId});
/// the v2 `shortcut` event is kept for older listeners.
fn forwardCommand(runtime: *native_sdk.Runtime, name: []const u8, window_id: u64) void {
    const wid: native_sdk.WindowId = if (window_id == 0) 1 else window_id;
    var buf: [512]u8 = undefined;
    var n: usize = 0;
    if (!json.append(&buf, &n, "{\"command\":")) return;
    if (!json.appendString(&buf, &n, name)) return;
    const tail = std.fmt.bufPrint(buf[n..], ",\"windowId\":{d}}}", .{wid}) catch return;
    n += tail.len;
    runtime.emitWindowEvent(wid, "menu:command", buf[0..n]) catch {};

    var legacy: [640]u8 = undefined;
    var m: usize = 0;
    if (!json.append(&legacy, &m, "{\"id\":")) return;
    if (!json.appendString(&legacy, &m, name)) return;
    if (!json.append(&legacy, &m, ",\"command\":")) return;
    if (!json.appendString(&legacy, &m, name)) return;
    const rest = std.fmt.bufPrint(legacy[m..], ",\"key\":\"\",\"windowId\":{d},\"modifiers\":{{\"primary\":false,\"command\":false,\"control\":false,\"option\":false,\"shift\":false}}}}", .{wid}) catch return;
    m += rest.len;
    runtime.emitWindowEvent(wid, "shortcut", legacy[0..m]) catch {};
}

/// The payload of the two user-file commands.
const FilePayload = struct {
    path: []const u8 = "",
    b64: []const u8 = "",
    offset: u64 = 0,
    done: bool = true,
};

/// `studio.writeTextFile {path, b64, offset?, done?}` → true. Without
/// `offset` and `done` it is one write of at most `store.chunk_bytes`
/// (written beside, then renamed over); a larger file is sent as chunks from
/// offset 0 in order, the last with `done: true` (as `studio.storeWrite`).
/// v13: only a path a save dialog returned (or the self-test's report
/// files) — `AccessDenied` for anything else (files.zig).
fn writeTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(FilePayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const v = parsed.value;
    if (v.path.len == 0 or v.path.len > 4096) return error.InvalidRequest;
    if (!self.grants.allows(v.path, .write)) return error.AccessDenied;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(v.b64) catch return error.InvalidRequest;
    if (n > store_mod.chunk_bytes) return error.TooLarge;
    const bytes = try self.allocator.alloc(u8, n);
    defer self.allocator.free(bytes);
    dec.decode(bytes, v.b64) catch return error.InvalidRequest;
    store_mod.writePath(self.io, v.path, bytes, v.offset, v.done) catch return error.HandlerFailed;
    return "true";
}

/// `studio.readTextFile {path, offset?}` → `{size, b64}`: the file's size
/// and up to `store.chunk_bytes` of it from `offset`, as base64. A larger
/// file is read in several calls (as `studio.storeRead`). v13: only a path
/// an open dialog returned, a document the OS opened with the app, a file
/// dropped on the window, or the tour's acknowledgement file.
fn readTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(FilePayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const v = parsed.value;
    if (v.path.len == 0 or v.path.len > 4096) return error.InvalidRequest;
    if (!self.grants.allows(v.path, .read)) return error.AccessDenied;
    const raw = try self.allocator.alloc(u8, store_mod.chunk_bytes);
    defer self.allocator.free(raw);
    const chunk = store_mod.readPath(self.io, v.path, v.offset, raw) catch return error.HandlerFailed;
    const enc = std.base64.standard.Encoder;
    const b64_len = enc.calcSize(chunk.bytes.len);
    const head = std.fmt.bufPrint(output, "{{\"size\":{d},\"b64\":\"", .{chunk.size}) catch return error.TooLarge;
    if (head.len + b64_len + 2 > output.len) return error.TooLarge;
    _ = enc.encode(output[head.len..][0..b64_len], chunk.bytes);
    @memcpy(output[head.len + b64_len ..][0..2], "\"}");
    return output[0 .. head.len + b64_len + 2];
}

const DialogPayload = struct {
    title: []const u8 = "",
    defaultName: []const u8 = "",
    defaultPath: []const u8 = "",
    allowMultiple: bool = false,
};

/// `studio.openFileDialog {title?, defaultPath?, allowMultiple?}` → the
/// chosen paths (an array) or null when cancelled. v13: the page's way to
/// let the user pick a file to import (an SGF, a backup); every path it
/// returns may then be read through `studio.readTextFile` if it is one of
/// the app's file types (files.zig); any other pick is returned but stays
/// unreadable, so the page reports a failed import.
fn openFileDialog(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    const parsed = std.json.parseFromSlice(DialogPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    const buffer = try self.allocator.alloc(u8, native_sdk.platform.max_dialog_paths_bytes);
    defer self.allocator.free(buffer);
    const result = try runtime.showOpenDialog(.{
        .title = p.title,
        .default_path = p.defaultPath,
        .allow_multiple = p.allowMultiple,
    }, buffer);
    if (result.count == 0) return "null";
    var n: usize = 0;
    if (!json.append(output, &n, "[")) return error.HandlerFailed;
    var count: usize = 0;
    var it = std.mem.splitScalar(u8, result.paths, '\n');
    while (it.next()) |path| {
        if (path.len == 0 or !std.unicode.utf8ValidateSlice(path)) continue;
        // A file the app does not read (a .txt, say) is still returned, so
        // the page can say it could not import it; it is just not granted.
        _ = self.grants.grant(path, .read, false);
        const mark = n;
        if (count > 0 and !json.append(output, &n, ",")) break;
        if (!json.appendString(output, &n, path)) {
            n = mark;
            break;
        }
        count += 1;
    }
    if (count == 0) return "null";
    if (!json.append(output, &n, "]")) return error.HandlerFailed;
    return output[0..n];
}

/// `studio.saveFileDialog {title?, defaultName, defaultPath?}` → the chosen
/// path, or null when cancelled. `defaultName` must end in one of the app's
/// extensions (.sgf, .json, .png); if the user types a name without one,
/// that extension is added, and if a file of that full name already exists
/// the path gets a number instead of replacing it ("game (2).sgf"): the
/// page should show the path it got back. The path may then be written through
/// `studio.writeTextFile` (files.zig). A name the app will not write (a
/// dotfile, a device name) answers `InvalidPath`.
fn saveFileDialog(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    const parsed = std.json.parseFromSlice(DialogPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    const ext = files_mod.allowedExtension(p.defaultName) orelse return error.InvalidRequest;
    var buffer: [native_sdk.platform.max_dialog_path_bytes]u8 = undefined;
    const chosen = (try runtime.showSaveDialog(.{
        .title = p.title,
        .default_path = p.defaultPath,
        .default_name = p.defaultName,
    }, &buffer)) orelse return "null";
    var fixed_buf: [files_mod.max_path_bytes + 8]u8 = undefined;
    var path = files_mod.fixSavePath(chosen, ext, &fixed_buf) orelse return error.InvalidPath;
    // The dialog asked about replacing the name the user typed. When the
    // extension was added here, the file that will really be written was
    // never asked about: an existing one is kept, and this one gets the
    // next free name ("game (2).sgf").
    var free_buf: [files_mod.max_path_bytes + 16]u8 = undefined;
    if (path.len != chosen.len) path = files_mod.freeSavePath(self.io, path, &free_buf) orelse return error.InvalidPath;
    if (!std.unicode.utf8ValidateSlice(path)) return error.InvalidPath;
    if (!self.grants.grant(path, .write, false)) return error.InvalidPath;
    var n: usize = 0;
    if (!json.appendString(output, &n, path)) return error.HandlerFailed;
    return output[0..n];
}

/// 隐藏标题栏(macOS hidden_inset_tall)下,前端顶栏的空白处就是标题栏:mousedown 时
/// 网页调这里,平台拿当前这次按下交给 performWindowDragWithEvent —— 真移动了才拖,
/// 双击照系统偏好缩放。标准标题栏的窗口与 Windows 上调了也只是什么都不做。
fn windowDrag(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    runtime.options.platform.services.startWindowDrag(invocation.source.window_id) catch {};
    return std.fmt.bufPrint(output, "true", .{}) catch "true";
}

/// 红绿灯与标题栏带在内容上压了多少:顶栏据此加高、左边让位。标准标题栏、全屏、
/// Windows 一律回 0,网页就按原样排。
fn windowChrome(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return std.fmt.bufPrint(output, "{{\"top\":0,\"left\":0,\"right\":0}}", .{});
    const chrome = runtime.options.platform.services.windowChrome(invocation.source.window_id);
    return std.fmt.bufPrint(output, "{{\"top\":{d},\"left\":{d},\"right\":{d},\"buttonsY\":{d},\"buttonsH\":{d}}}", .{
        chrome.insets.top,
        chrome.insets.left,
        chrome.insets.right,
        chrome.buttons.y,
        chrome.buttons.height,
    });
}

const ThemePayload = struct {
    scheme: []const u8 = "",
};

/// "light", "dark" or "system" (the app's Appearance setting on Auto).
fn windowColorScheme(name: []const u8) ?native_sdk.platform.WindowColorScheme {
    if (std.mem.eql(u8, name, "light")) return .light;
    if (std.mem.eql(u8, name, "dark")) return .dark;
    if (std.mem.eql(u8, name, "system")) return .system;
    return null;
}

/// `studio.windowTheme` {scheme}: the window frame (macOS title bar, traffic
/// lights, sheets and the window's own controls) follows the app's theme
/// rather than the system's when the user picked Light or Dark in Settings
/// (SDK 0.11.1). Windows keeps the system title bar, whose colour the SDK
/// takes from the OS setting; there the call does nothing.
fn windowTheme(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(ThemePayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const scheme = windowColorScheme(parsed.value.scheme) orelse return error.InvalidRequest;
    const runtime = self.runtime orelse return std.fmt.bufPrint(output, "false", .{}) catch "false";
    runtime.options.platform.services.setWindowColorScheme(invocation.source.window_id, scheme) catch {
        return std.fmt.bufPrint(output, "false", .{}) catch "false";
    };
    return std.fmt.bufPrint(output, "true", .{}) catch "true";
}

test "window theme: the three schemes the page sends, nothing else" {
    try std.testing.expectEqual(native_sdk.platform.WindowColorScheme.light, windowColorScheme("light").?);
    try std.testing.expectEqual(native_sdk.platform.WindowColorScheme.dark, windowColorScheme("dark").?);
    try std.testing.expectEqual(native_sdk.platform.WindowColorScheme.system, windowColorScheme("system").?);
    try std.testing.expect(windowColorScheme("auto") == null);
    try std.testing.expect(windowColorScheme("") == null);
}

/// Engine presence and version are resolved once in `main`, before the
/// worker thread exists: resolving touches the engine's path buffers,
/// which the worker uses while it starts KataGo.
fn katagoStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    var n: usize = 0;
    if (!json.append(output, &n, if (self.katago_available) "{\"available\":true" else "{\"available\":false")) return error.HandlerFailed;
    if (!json.append(output, &n, ",\"engine\":\"KataGo\",\"analyze\":true,\"async\":true,\"stream\":true,\"cancel\":true,\"incremental\":true,\"models\":true,\"version\":")) return error.HandlerFailed;
    if (!json.appendString(output, &n, self.katago_version)) return error.HandlerFailed;
    // v13: `studio.katagoHumanPolicy` needs the human SL model.
    const human = self.katago_available and self.models.isReady(.human);
    if (!json.append(output, &n, if (human) ",\"humanPolicy\":true}" else ",\"humanPolicy\":false}")) return error.HandlerFailed;
    return output[0..n];
}

// ------------------------------------------------------------ async KataGo
//
// Threading: bridge handlers, `drainKatago` and every runtime/webview call
// run on the UI thread. The worker thread (engine.zig) only talks to KataGo
// and to its own locked queues, then nudges the UI loop with the platform's
// thread-safe `wake`; the `.effects_wake` event (plus a 50 ms fallback
// timer while requests are open) runs `drainKatago` here, which emits the
// partial reports and completes the stored AsyncResponders.

const AnalyzePayload = struct {
    id: []const u8 = "",
    size: u32 = 19,
    komi: f64 = 6.5,
    /// v5: "japanese" | "chinese" | "korean". A page without the field
    /// (before v5) means Japanese, the only ruleset it knew.
    rules: []const u8 = "japanese",
    setup: []const u8 = "",
    moves: []const u8 = "",
    color: []const u8 = "B",
    visits: u32 = 64,
    maxTime: f64 = 6.0,
    stream: bool = false,
    /// v5: "standard" (default), "strong" or "human".
    engine: []const u8 = "standard",
    /// v5, human engine only: a KataGo human SL profile ("rank_12k").
    profile: []const u8 = "",
    /// v5, human engine only: "raw" or "search".
    humanStyle: []const u8 = "raw",
};

fn parseAnalyzeRequest(self: *App, payload: []const u8, req: *engine_mod.Request, job: *Job) !void {
    const parsed = std.json.parseFromSlice(AnalyzePayload, self.allocator, payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    // Rejected, never truncated: a cut id would answer the wrong request.
    if (!validRequestId(p.id)) return error.InvalidRequest;
    @memcpy(job.id[0..p.id.len], p.id);
    job.id_len = p.id.len;
    job.stream = p.stream;
    if (p.size < 2 or p.size > 19) return error.InvalidRequest;
    if (!std.math.isFinite(p.komi) or @abs(p.komi) > 150) return error.InvalidRequest;
    // GTP komi is a multiple of 0.5.
    if (@floor(p.komi * 2) != p.komi * 2) return error.InvalidRequest;
    if (p.color.len != 1 or (p.color[0] != 'B' and p.color[0] != 'W')) return error.InvalidRequest;
    if (p.visits < 1 or p.visits > 100_000) return error.InvalidRequest;
    if (!std.math.isFinite(p.maxTime) or p.maxTime <= 0 or p.maxTime > 120) return error.InvalidRequest;
    const size: u8 = @intCast(p.size);
    req.position.size = size;
    req.position.komi = p.komi;
    req.position.rules = engine_mod.Rules.parse(p.rules) orelse return error.InvalidRequest;
    req.position.setup_len = try engine_mod.parseMoves(p.setup, size, false, &req.position.setup);
    req.position.moves_len = try engine_mod.parseMoves(p.moves, size, true, &req.position.moves);
    req.color = p.color[0];
    req.visits = p.visits;
    req.max_time = p.maxTime;
    req.stream = p.stream;
    req.slot = engine_mod.Slot.parse(p.engine) orelse return error.InvalidRequest;
    job.slot = req.slot;
    req.profile_len = 0;
    req.style = .raw;
    if (req.slot == .human) {
        if (!engine_mod.validProfile(p.profile)) return error.InvalidRequest;
        @memcpy(req.profile[0..p.profile.len], p.profile);
        req.profile_len = p.profile.len;
        if (std.mem.eql(u8, p.humanStyle, "search")) {
            req.style = .search;
        } else if (!std.mem.eql(u8, p.humanStyle, "raw")) return error.InvalidRequest;
    }
}

fn findJob(self: *App, seq: u64) ?*Job {
    if (seq == 0) return null;
    for (&self.jobs) |*job| {
        if (job.active and job.seq == seq) return job;
    }
    return null;
}

fn anyJobActive(self: *App) bool {
    for (self.jobs) |job| {
        if (job.active) return true;
    }
    return false;
}

fn installWake(self: *App) void {
    if (self.wake_installed) return;
    const runtime = self.runtime orelse return;
    const services = runtime.options.platform.services;
    self.katago.setWake(services.context, services.wake_fn);
    self.wake_installed = true;
}

fn startDrainTimer(self: *App) void {
    if (self.timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.startTimer(katago_timer_id, katago_timer_interval_ns, true) catch return;
    self.timer_running = true;
}

fn stopDrainTimer(self: *App) void {
    if (!self.timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(katago_timer_id) catch {};
    self.timer_running = false;
}

/// Complete a job's bridge call. Replies are always bridge successes; the
/// page reads `ok` / `cancelled` / `error` from the object.
fn respondJob(job: *Job, outcome: engine_mod.Outcome, error_name: []const u8, result: ?*const engine_mod.Result) void {
    const info: []const u8 = if (result) |r| (r.info orelse "") else "";
    const cap = info.len * 2 + 512;
    if (outcome == .ok and job.kind == .human_policy) {
        if (result) |r| if (r.policy) |rows| return respondPolicy(job, rows);
    }
    const buf = engine_mod.result_allocator.alloc(u8, cap) catch {
        job.responder.success(job.bridge_id[0..job.bridge_id_len], "{\"ok\":false,\"error\":\"OutOfMemory\"}") catch {};
        job.active = false;
        return;
    };
    defer engine_mod.result_allocator.free(buf);
    var n: usize = 0;
    var ok = true;
    switch (outcome) {
        .ok => {
            const r = result.?;
            ok = json.append(buf, &n, "{\"ok\":true,\"id\":") and
                json.appendString(buf, &n, job.idText()) and
                json.append(buf, &n, ",\"engine\":") and
                json.appendString(buf, &n, @tagName(job.slot)) and
                json.append(buf, &n, ",\"play\":") and
                json.appendString(buf, &n, r.play()) and
                json.append(buf, &n, ",\"info\":") and
                json.appendString(buf, &n, info);
            if (ok) {
                const tail = std.fmt.bufPrint(buf[n..], ",\"sync\":{{\"reset\":{s},\"undo\":{d},\"play\":{d}}}}}", .{
                    if (r.sync.reset) "true" else "false",
                    r.sync.undo,
                    r.sync.play,
                }) catch "";
                n += tail.len;
                ok = tail.len > 0;
            }
        },
        .cancelled => {
            ok = json.append(buf, &n, "{\"ok\":false,\"id\":") and
                json.appendString(buf, &n, job.idText()) and
                json.append(buf, &n, ",\"cancelled\":true}");
        },
        .failed => {
            ok = json.append(buf, &n, "{\"ok\":false,\"id\":") and
                json.appendString(buf, &n, job.idText()) and
                json.append(buf, &n, ",\"error\":") and
                json.appendString(buf, &n, if (error_name.len > 0) error_name else "HandlerFailed") and
                json.append(buf, &n, "}");
        },
    }
    const body = if (ok) buf[0..n] else "{\"ok\":false,\"error\":\"ResponseTooLarge\"}";
    job.responder.success(job.bridge_id[0..job.bridge_id_len], body) catch {};
    job.active = false;
}

/// Cancel the job with page id `id` (every open job when null). A queued
/// request is answered at once; a running one when KataGo has stopped.
/// Returns how many jobs were cancelled.
fn cancelJobs(self: *App, id: ?[]const u8) usize {
    var count: usize = 0;
    for (&self.jobs) |*job| {
        if (!job.active or job.cancelled) continue;
        if (id) |wanted| {
            if (!std.mem.eql(u8, job.idText(), wanted)) continue;
        }
        count += 1;
        switch (self.katago.cancel(job.seq)) {
            .removed_pending => respondJob(job, .cancelled, "", null),
            // Running, or finished and waiting in the result queue: the
            // drain answers it as cancelled.
            .signalled_running, .not_found => job.cancelled = true,
        }
    }
    return count;
}

/// The page's own request id: 1 to 64 characters of `[A-Za-z0-9._:-]`.
fn validRequestId(id: []const u8) bool {
    if (id.len == 0 or id.len > 64) return false;
    for (id) |c| {
        if (!(std.ascii.isAlphanumeric(c) or c == '.' or c == '_' or c == ':' or c == '-')) return false;
    }
    return true;
}

/// Keep a bridge request id for a later answer. An id longer than the
/// SDK's limit is refused at once rather than cut (a cut id would never
/// match the waiting call).
fn keepBridgeId(rid: []const u8, out: *[native_sdk.bridge.max_id_bytes]u8, len: *usize, responder: native_sdk.bridge.AsyncResponder) bool {
    if (rid.len == 0 or rid.len > out.len) {
        responder.fail(rid[0..@min(rid.len, out.len)], .invalid_request, "request id too long") catch {};
        return false;
    }
    @memcpy(out[0..rid.len], rid);
    len.* = rid.len;
    return true;
}

/// `studio.katagoAnalyzeAsync`: queue a search and return immediately; the
/// reply comes from `drainKatago` once the worker has a result.
fn katagoAnalyzeAsync(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    var job = Job{ .active = true, .responder = responder, .window_id = invocation.source.window_id };
    if (!keepBridgeId(invocation.request.id, &job.bridge_id, &job.bridge_id_len, responder)) return;

    const req = self.request_scratch;
    req.seq = 0;
    req.kind = .analyze;
    req.position.setup_len = 0;
    req.position.moves_len = 0;
    parseAnalyzeRequest(self, invocation.request.payload, req, &job) catch {
        respondJob(&job, .failed, "InvalidRequest", null);
        return;
    };
    submitJob(self, &job, req, engine_mod.deadlineMs(req.max_time, true) + engine_mod.warm_grace_ms);
}

/// Queue a parsed request for the worker and keep its job. Answers at once
/// when it cannot run. `budget_ms` is the job's backstop.
fn submitJob(self: *App, job_in: *Job, req: *engine_mod.Request, budget_ms: i64) void {
    var job = job_in.*;
    if (!self.katago_available) {
        respondJob(&job, .failed, "EngineMissing", null);
        return;
    }
    // An optional network that is not installed: answer at once, the page
    // falls back to the standard engine.
    const needs: ?models_mod.Kind = switch (req.slot) {
        .standard => null,
        .strong => .strong,
        .human => .human,
    };
    if (needs) |kind| {
        if (!self.models.isReady(kind)) {
            respondJob(&job, .failed, "ModelMissing", null);
            return;
        }
    }
    var slot: ?*Job = null;
    for (&self.jobs) |*candidate| {
        if (!candidate.active) {
            slot = candidate;
            break;
        }
    }
    const free_slot = slot orelse {
        respondJob(&job, .failed, "Busy", null);
        return;
    };
    self.next_seq += 1;
    req.seq = self.next_seq;
    job.seq = req.seq;
    if (job.id_len == 0) {
        // A request without its own id (human policy) is named by its seq.
        const named = std.fmt.bufPrint(&job.id, "p{d}", .{req.seq}) catch "";
        job.id_len = named.len;
    }
    // The worker's watchdog budget for a cold start, plus time to wait
    // behind the request it supersedes (which is being cancelled).
    job.deadline_ms = nowMs(self) + budget_ms;
    installWake(self);
    const submitted = self.katago.submit(req) catch |err| {
        respondJob(&job, .failed, @errorName(err), null);
        return;
    };
    free_slot.* = job;
    if (findJob(self, submitted.dropped_seq)) |dropped| respondJob(dropped, .cancelled, "", null);
    if (findJob(self, submitted.superseded_seq)) |superseded| superseded.cancelled = true;
    startDrainTimer(self);
}

// ------------------------------------------------------------ human policy
//
// v13 (docs/strength.md "your moves"): how likely a player of each rank
// would have been to play the moves the player actually played, from the
// human SL model's raw policy. One async request per finished game.

const PolicyPayload = struct {
    /// Optional: the page's id, for `studio.katagoCancel`.
    id: []const u8 = "",
    size: u32 = 19,
    komi: f64 = 6.5,
    rules: []const u8 = "japanese",
    setup: []const u8 = "",
    /// The whole main line ("B D4 W Q16 …").
    moves: []const u8 = "",
    /// The player's colour: the moves of this colour are scored.
    color: []const u8 = "B",
    profiles: []const []const u8 = &.{},
    /// First move index to score (earlier moves are skipped).
    from: u32 = 0,
};

/// Validate a `studio.katagoHumanPolicy` payload into `req` (and the job's
/// id). Bounds the work: at most `max_policy_profiles` profiles, and as
/// many positions as fit `max_policy_evals` evaluations (the reply then
/// says `truncated`).
fn parsePolicyRequest(allocator: std.mem.Allocator, payload: []const u8, req: *engine_mod.Request, job: *Job) !void {
    const parsed = std.json.parseFromSlice(PolicyPayload, allocator, payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const p = parsed.value;
    job.id_len = 0;
    if (p.id.len > 0) {
        if (!validRequestId(p.id)) return error.InvalidRequest;
        @memcpy(job.id[0..p.id.len], p.id);
        job.id_len = p.id.len;
    }
    if (p.size < 2 or p.size > 19) return error.InvalidRequest;
    if (!std.math.isFinite(p.komi) or @abs(p.komi) > 150 or @floor(p.komi * 2) != p.komi * 2) return error.InvalidRequest;
    if (p.color.len != 1 or (p.color[0] != 'B' and p.color[0] != 'W')) return error.InvalidRequest;
    if (p.profiles.len == 0 or p.profiles.len > engine_mod.max_policy_profiles) return error.InvalidRequest;
    const size: u8 = @intCast(p.size);
    req.* = .{ .kind = .human_policy, .slot = .human, .visits = 1, .max_time = 1, .color = p.color[0] };
    req.position.size = size;
    req.position.komi = p.komi;
    req.position.rules = engine_mod.Rules.parse(p.rules) orelse return error.InvalidRequest;
    req.position.setup_len = try engine_mod.parseMoves(p.setup, size, false, &req.position.setup);
    req.position.moves_len = try engine_mod.parseMoves(p.moves, size, true, &req.position.moves);
    for (p.profiles, 0..) |profile, k| {
        if (!engine_mod.validProfile(profile)) return error.InvalidRequest;
        @memcpy(req.policy_profiles[k][0..profile.len], profile);
        req.policy_profile_lens[k] = @intCast(profile.len);
    }
    req.policy_profiles_len = p.profiles.len;
    req.policy_from = p.from;
    req.policy_max_positions = @min(engine_mod.max_policy_positions, engine_mod.max_policy_evals / p.profiles.len);
    job.slot = .human;
    job.kind = .human_policy;
    job.stream = false;
}

/// How many positions a parsed policy request will score.
fn policyPositions(req: *const engine_mod.Request) usize {
    var n: usize = 0;
    var i: usize = req.policy_from;
    while (i < req.position.moves_len) : (i += 1) {
        if (req.position.moves[i].color == req.color) n += 1;
    }
    return @min(n, req.policy_max_positions);
}

/// `studio.katagoHumanPolicy {id?, size, komi, rules, setup, moves, color,
/// profiles, from?}` (async): for every move of `color` in `moves` (from
/// index `from`), the human SL policy's probability of that move in the
/// position before it, under each profile. Replies `{ok:true, id, engine:
/// "human", moves:[{index, p:{profile: probability}}], truncated}` or
/// `{ok:false, id, error | cancelled}` (InvalidRequest, EngineMissing,
/// ModelMissing, Busy, Timeout, …). Cancellable with `studio.katagoCancel`
/// and watched like a search (each evaluation extends the deadline).
fn katagoHumanPolicy(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    var job = Job{ .active = true, .responder = responder, .window_id = invocation.source.window_id, .kind = .human_policy, .slot = .human };
    if (!keepBridgeId(invocation.request.id, &job.bridge_id, &job.bridge_id_len, responder)) return;
    const req = self.request_scratch;
    parsePolicyRequest(self.allocator, invocation.request.payload, req, &job) catch {
        respondJob(&job, .failed, "InvalidRequest", null);
        return;
    };
    const positions = policyPositions(req);
    if (positions == 0) {
        // Nothing to score: no need to start (or wait for) KataGo.
        const rows = engine_mod.result_allocator.create(engine_mod.PolicyRows) catch {
            respondJob(&job, .failed, "OutOfMemory", null);
            return;
        };
        defer engine_mod.result_allocator.destroy(rows);
        rows.* = .{ .profiles = req.policy_profiles_len };
        respondPolicy(&job, rows);
        return;
    }
    const evals: i64 = @intCast(positions * req.policy_profiles_len);
    submitJob(self, &job, req, engine_mod.cold_grace_ms + engine_mod.warm_grace_ms + evals * 5_000);
}

/// `{ok:true, id, engine:"human", moves:[{index, p:{…}}], truncated}`.
fn policyReply(buf: []u8, id: []const u8, rows: *const engine_mod.PolicyRows) ?[]const u8 {
    var n: usize = 0;
    if (!(json.append(buf, &n, "{\"ok\":true,\"id\":") and json.appendString(buf, &n, id) and json.append(buf, &n, ",\"engine\":\"human\",\"moves\":["))) return null;
    for (0..rows.count) |r| {
        if (r > 0 and !json.append(buf, &n, ",")) return null;
        const head = std.fmt.bufPrint(buf[n..], "{{\"index\":{d},\"p\":{{", .{rows.index[r]}) catch return null;
        n += head.len;
        for (0..rows.profiles) |k| {
            if (k > 0 and !json.append(buf, &n, ",")) return null;
            if (!json.appendString(buf, &n, rows.name(k))) return null;
            const v = std.fmt.bufPrint(buf[n..], ":{d:.6}", .{rows.prob(r, k)}) catch return null;
            n += v.len;
        }
        if (!json.append(buf, &n, "}}")) return null;
    }
    if (!json.append(buf, &n, if (rows.truncated) "],\"truncated\":true}" else "],\"truncated\":false}")) return null;
    return buf[0..n];
}

fn respondPolicy(job: *Job, rows: *const engine_mod.PolicyRows) void {
    const cap = 256 + rows.count * (32 + rows.profiles * 40);
    const id = job.bridge_id[0..job.bridge_id_len];
    const buf = engine_mod.result_allocator.alloc(u8, cap) catch {
        job.responder.success(id, "{\"ok\":false,\"error\":\"OutOfMemory\"}") catch {};
        job.active = false;
        return;
    };
    defer engine_mod.result_allocator.free(buf);
    const body = policyReply(buf, job.idText(), rows) orelse "{\"ok\":false,\"error\":\"ResponseTooLarge\"}";
    job.responder.success(id, body) catch {};
    job.active = false;
}

const CancelPayload = struct {
    id: ?[]const u8 = null,
};

/// `studio.katagoCancel` {id}: stop that request; `{}` (no id at all)
/// stops every open one. The cancelled request itself replies
/// {ok:false, cancelled:true}. v13: an id that is present but not a valid
/// request id (empty, too long, odd characters) is an `InvalidRequest`,
/// never "cancel everything".
fn katagoCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = std.json.parseFromSlice(CancelPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const id = parsed.value.id;
    if (id) |value| {
        if (!validRequestId(value)) return error.InvalidRequest;
    }
    // A queued request is answered right here; the running one as soon as
    // KataGo stops (the worker wakes the loop).
    const count = cancelJobs(self, id);
    return std.fmt.bufPrint(output, "{{\"ok\":true,\"cancelled\":{d}}}", .{count}) catch error.HandlerFailed;
}

fn emitInfo(runtime: *native_sdk.Runtime, job: *const Job, info: []const u8) void {
    const buf = engine_mod.result_allocator.alloc(u8, info.len * 2 + 192) catch return;
    defer engine_mod.result_allocator.free(buf);
    var n: usize = 0;
    const ok = json.append(buf, &n, "{\"id\":") and
        json.appendString(buf, &n, job.idText()) and
        json.append(buf, &n, ",\"info\":") and
        json.appendString(buf, &n, info) and
        json.append(buf, &n, "}");
    if (!ok) return;
    runtime.emitWindowEvent(job.window_id, "katago:info", buf[0..n]) catch {};
}

/// Collect what the worker produced: the latest partial report (as a
/// `katago:info` window event) first, then finished results (as replies to
/// the waiting `studio.katagoAnalyzeAsync` calls). UI thread.
fn drainKatago(self: *App) void {
    const runtime = self.runtime orelse return;
    const now = nowMs(self);
    // The watchdog: a KataGo past its request's deadline is killed; the
    // worker then reports the request failed (`Timeout`) below.
    _ = self.katago.checkDeadline(now);
    if (self.katago.takeStream()) |partial| {
        defer engine_mod.result_allocator.free(partial.info);
        if (findJob(self, partial.seq)) |job| {
            if (!job.cancelled and job.stream) emitInfo(runtime, job, partial.info);
        }
    }
    var results: [16]engine_mod.Result = undefined;
    const n = self.katago.takeResults(&results);
    for (results[0..n]) |*result| {
        defer if (result.info) |info| engine_mod.result_allocator.free(info);
        defer if (result.policy) |rows| engine_mod.result_allocator.destroy(rows);
        const job = findJob(self, result.seq) orelse continue;
        const outcome: engine_mod.Outcome = if (job.cancelled) .cancelled else result.outcome;
        respondJob(job, outcome, result.error_name, result);
    }
    // The backstop: whatever the worker is doing, no request waits past
    // its deadline (a cancelled one is answered as cancelled).
    for (&self.jobs) |*job| {
        if (!job.active or job.deadline_ms == 0 or now < job.deadline_ms) continue;
        _ = self.katago.cancel(job.seq);
        respondJob(job, if (job.cancelled) .cancelled else .failed, "Timeout", null);
    }
    if (!anyJobActive(self)) stopDrainTimer(self);
}

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

fn nowMs(self: *App) i64 {
    return std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
}

fn stopUpdateTimer(self: *App) void {
    if (!self.update_timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(update_timer_id) catch {};
    self.update_timer_running = false;
}

/// `studio.checkUpdate` {}: GET the latest GitHub release of this app.
/// Replies (always a bridge success) `{ok:true, latest, url, notes,
/// publishedAt, prerelease}` or `{ok:false, error}` with error one of
/// Busy, Timeout, Network, NoRelease, RateLimited, HttpStatus,
/// BadResponse, ResponseTooLarge, OutOfMemory, Unavailable.
fn checkUpdate(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    const rid = invocation.request.id;
    if (self.update_active) {
        responder.success(rid, "{\"ok\":false,\"error\":\"Busy\"}") catch {};
        return;
    }
    installUpdateWake(self);
    if (!keepBridgeId(rid, &self.update_bridge_id, &self.update_bridge_id_len, responder)) return;
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
            if (runtime.options.platform.services.startTimer(update_timer_id, update_timer_interval_ns, true)) |_| {
                self.update_timer_running = true;
            } else |_| {}
        }
    }
}

/// Answer the open update check if its thread has finished or its time is
/// up. UI thread.
fn drainUpdate(self: *App) void {
    if (!self.update_active) {
        stopUpdateTimer(self);
        return;
    }
    const buf = engine_mod.result_allocator.alloc(u8, update_mod.max_reply_bytes) catch return;
    defer engine_mod.result_allocator.free(buf);
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
fn openReleasePage(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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

/// `studio.revealDataDir` {}: show the folder that holds the player's
/// settings, progress and games in Finder / Explorer (paths.zig). The page
/// never names a path: it is always the app's own data directory. Replies
/// `{ok, path}` or `{ok:false, error:"NoDataDir"}`.
fn revealDataDir(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    const dir = self.store.root();
    if (dir.len == 0 or !std.fs.path.isAbsolute(dir)) return "{\"ok\":false,\"error\":\"NoDataDir\"}";
    // Nothing was saved yet: the folder is made so there is one to show.
    std.Io.Dir.cwd().createDirPath(self.io, dir) catch {};
    var opened = false;
    if (self.runtime) |runtime| {
        if (runtime.options.platform.services.revealPath(dir)) |_| {
            opened = true;
        } else |_| {}
    }
    if (!opened) opened = spawnFolder(self.io, dir);
    var n: usize = 0;
    const ok = json.append(output, &n, "{\"ok\":") and json.appendBool(output, &n, opened) and
        json.append(output, &n, ",\"path\":") and json.appendString(output, &n, dir) and json.append(output, &n, "}");
    if (!ok) return error.HandlerFailed;
    return output[0..n];
}

/// Fallback when the platform's reveal service is missing or fails: open
/// the folder itself with `open` (macOS), Explorer (Windows) or `xdg-open`.
fn spawnFolder(io: std.Io, dir: []const u8) bool {
    const argv: []const []const u8 = switch (builtin.os.tag) {
        .macos => &.{ "/usr/bin/open", dir },
        .windows => &.{ "explorer.exe", dir },
        else => &.{ "xdg-open", dir },
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

// ------------------------------------------------------------ one instance
//
// instance.zig: this process holds the data directory's lock. A second
// launch leaves a request in the inbox (the .sgf files it was given, or
// none: "come to the front") and waits for it to be taken; a timer here
// takes it.

fn startInboxTimer(self: *App) void {
    if (self.inbox_timer_running or self.instance_lock == null) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.startTimer(inbox_timer_id, inbox_timer_interval_ns, true) catch return;
    self.inbox_timer_running = true;
}

const InboxBatch = struct {
    app: *App,
    buf: [8192]u8 = undefined,
    n: usize = 0,
    count: usize = 0,
    ok: bool = true,

    fn add(context: *anyopaque, path: []const u8) void {
        const batch: *InboxBatch = @ptrCast(@alignCast(context));
        const self = batch.app;
        // The page is not up yet: it asks for the queue when it is.
        if (!self.flush_hook_ready) return self.queueOpenPath(path);
        if (!batch.ok) return;
        if (batch.n == 0) batch.ok = json.append(&batch.buf, &batch.n, "{\"paths\":[");
        if (batch.ok) batch.ok = appendOpenPath(self, &batch.buf, &batch.n, &batch.count, path);
    }
};

fn pollInbox(self: *App) void {
    // On its way out: the other launch sees its request untouched and the
    // lock come free, and starts as the one instance.
    if (self.quitting or self.instance_lock == null) return;
    var batch: InboxBatch = .{ .app = self };
    const taken = instance_mod.takeRequests(self.io, self.store.root(), &batch, InboxBatch.add);
    if (taken.requests == 0) return;
    const runtime = self.runtime orelse return;
    // Someone opened the app again: show them the window that exists.
    runtime.options.platform.services.focusWindow(1) catch {};
    if (batch.count == 0 or !batch.ok) return;
    if (!json.append(&batch.buf, &batch.n, "]}")) return;
    runtime.emitWindowEvent(1, "open:files", batch.buf[0..batch.n]) catch {};
}

/// Make this process the one that uses `data_dir`, or hand its arguments
/// to the one that does. False: this launch has nothing more to do.
fn claimInstance(app_state: *App, init: std.process.Init, data_dir: []const u8) bool {
    const io = init.io;
    var note: install_mod.LaunchNote = .{};
    var paths: instance_mod.PathList = .{};
    var it: ?std.process.Args.Iterator = std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa) catch null;
    defer if (it) |*args| args.deinit();
    if (it) |*args| {
        _ = args.next(); // executable
        while (args.next()) |arg| {
            note.noteArg(arg);
            if (paths.len < paths.items.len and instance_mod.wantedPath(arg)) {
                paths.items[paths.len] = arg;
                paths.len += 1;
            }
        }
    }
    // An update helper is replacing this installation. It starts the app
    // itself when it is done (with one of its two arguments); any other
    // launch in between would hold files of the folder being swapped.
    const by_helper = note.just_updated or note.install_failed;
    if (!by_helper and install_mod.ownUpdateInProgress(io)) {
        std.debug.print("goban-studio: an update is being installed; this launch does nothing\n", .{});
        return false;
    }
    switch (instance_mod.acquire(io, data_dir)) {
        .owner => |file| {
            app_state.instance_lock = file;
            return true;
        },
        // No lock to be had (no data directory): run as before.
        .unavailable => return true,
        .busy => {},
    }
    var token_bytes: [8]u8 = undefined;
    io.random(&token_bytes);
    const token = std.fmt.bytesToHex(token_bytes, .lower);
    const result = instance_mod.handOver(io, data_dir, paths.slice(), &token);
    if (result.outcome == .became_owner) {
        app_state.instance_lock = result.lock;
        return true;
    }
    // The new version did start; the helper that launched it must not
    // take a second window for a failed update and roll back.
    install_mod.writeAck(io, &note);
    std.debug.print("goban-studio: already running; this launch {s}\n", .{
        if (result.outcome == .taken) "handed over to it" else "got no answer and does nothing",
    });
    return false;
}

// ------------------------------------------------------------ update install
//
// v5: after a check found a newer release, the player may download and
// install it (install.zig). The download runs on its own thread; the page
// polls `studio.updateStatus` for progress and is answered on
// `studio.updateDownload` when the thread is done (platform wake, or the
// fallback timer, which also runs the stall watchdog).

fn stagingRoot(self: *App) ?[]const u8 {
    return install_mod.stagingRoot(self.env_map, &self.staging_root_buf);
}

/// Can this installation be replaced in place? Probed once a session (it
/// writes and removes a test file next to the app), again before a download.
fn installTarget(self: *App, refresh: bool) *const install_mod.Target {
    if (!self.install_target_known or refresh) {
        var token_bytes: [6]u8 = undefined;
        self.io.random(&token_bytes);
        const token = std.fmt.bytesToHex(token_bytes, .lower);
        self.install_target = install_mod.detectTarget(self.io, &token);
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
    runtime.options.platform.services.cancelTimer(install_timer_id) catch {};
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
fn updateStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    install_mod.writeAck(self.io, &self.installer.note);
    const snap = self.installer.snapshot();
    var probe = false;
    if (std.json.parseFromSlice(StatusPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true })) |parsed| {
        probe = parsed.value.probe;
        parsed.deinit();
    } else |_| {}
    const blocked: install_mod.Blocked = if (probe or self.install_target_known) installTarget(self, false).blocked else .NotChecked;
    return install_mod.statusReply(output, &snap, self.installer.platform, blocked, &self.installer.note);
}

/// `studio.updateCancel` {}: stop a download (its files are removed), or
/// discard a downloaded update that was not installed. Replies `{ok, phase}`.
fn updateCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
fn updateDownload(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
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
            responder.success(rid, install_mod.errorReply(&reply_buf, name)) catch {};
            return;
        }
    }
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_mod.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
        return;
    }
    const root = stagingRoot(self) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NoTempDir\"}") catch {};
        return;
    };
    if (!keepBridgeId(rid, &self.install_bridge_id, &self.install_bridge_id_len, responder)) return;
    installWakeUp(self);
    const gen = self.installer.start(root, tag, nowMs(self)) catch |err| {
        responder.success(rid, install_mod.errorReply(&reply_buf, install_mod.errorName(err))) catch {};
        return;
    };
    self.install_responder = responder;
    self.install_gen = gen;
    self.install_active = true;
    if (!self.install_timer_running) {
        if (self.runtime) |runtime| {
            if (runtime.options.platform.services.startTimer(install_timer_id, install_timer_interval_ns, true)) |_| {
                self.install_timer_running = true;
            } else |_| {}
        }
    }
}

/// Answer the open download once its thread is done. A connection that
/// brought no byte for `install_mod.stall_timeout_ms` is replaced by a new
/// one (install.zig `checkStall`). UI thread.
fn drainInstall(self: *App) void {
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
        install_mod.errorReply(&buf, if (snap.error_name.len > 0) snap.error_name else "Cancelled")
    else
        install_mod.downloadReply(&buf, &snap, self.installer.platform);
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
fn updateApply(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
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
        responder.success(rid, install_mod.errorReply(&reply_buf, name)) catch {};
        return;
    }
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_mod.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
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
    if (!keepBridgeId(rid, &self.apply_bridge_id, &self.apply_bridge_id_len, responder)) return;
    self.installer.markInstalling();
    const started = install_mod.startHelper(self.io, self.env_map, root, target.root(), staged, &self.apply_started_buf);
    if (started.err) |err_name| {
        self.installer.markApplyFailed(err_name);
        responder.success(rid, install_mod.errorReply(&reply_buf, err_name)) catch {};
        return;
    }
    self.apply_started_len = started.started.len;
    self.apply_responder = responder;
    self.apply_deadline_ms = nowMs(self) + install_mod.helper_start_timeout_ms;
    self.apply_active = true;
    startGateTimer(self);
}

// ------------------------------------------------------------ quit gate
//
// v13. Two waits that must end before the app goes away, both run by one
// 100 ms timer on the UI thread:
//
//   * the update helper's "started" marker (`studio.updateApply`): the app
//     quits only once a helper is really there to finish the update;
//   * the page's flush: before a quit (⌘Q / the Dock on macOS, the
//     window's close button on Windows, an update restart) the page gets
//     an `app:flush` event and up to `flush_timeout_ms` to write what it
//     still holds (store.js debounces writes by 300 ms) and answer with
//     `studio.flushDone`. A page that never installed the hook, or does
//     not answer in time, does not keep the app open.

fn startGateTimer(self: *App) void {
    if (self.gate_timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.startTimer(gate_timer_id, gate_timer_interval_ns, true) catch return;
    self.gate_timer_running = true;
}

fn stopGateTimer(self: *App) void {
    if (!self.gate_timer_running or self.flush_active or self.apply_active) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(gate_timer_id) catch {};
    self.gate_timer_running = false;
}

fn runGate(self: *App) void {
    const now = nowMs(self);
    if (self.apply_active) checkHelperStarted(self, now);
    if (self.flush_active and now >= self.flush_deadline_ms) finishFlush(self);
    stopGateTimer(self);
}

/// The update helper proved it runs (or did not, in time).
fn checkHelperStarted(self: *App, now: i64) void {
    const marker = self.apply_started_buf[0..self.apply_started_len];
    const id = self.apply_bridge_id[0..self.apply_bridge_id_len];
    var started = install_mod.helperStarted(self.io, marker);
    if (!started and now >= self.apply_deadline_ms) {
        // Claim the marker: if the helper got there first after all, it
        // did start; otherwise a late helper finds it taken and gives up.
        started = !install_mod.claimStarted(self.io, marker);
        if (!started) {
            self.apply_active = false;
            self.installer.markApplyFailed("HelperNotStarted");
            self.apply_responder.success(id, "{\"ok\":false,\"error\":\"HelperNotStarted\"}") catch {};
            return;
        }
    }
    if (!started) return;
    self.apply_active = false;
    self.apply_responder.success(id, "{\"ok\":true,\"phase\":\"installing\"}") catch {};
    // The helper waits for this process to exit (KataGo stops on the way);
    // the page writes what it holds first.
    beginFlush(self, .quit_app);
}

/// Ask the page to flush, then do `then`. Without a page hook (or before
/// the page is up) `then` happens at once.
fn beginFlush(self: *App, then: AfterFlush) void {
    if (self.flush_active) {
        // A second request while one is open (⌘Q twice): the stronger
        // action wins; the open flush still ends it.
        if (then == .quit_app) self.after_flush = .quit_app;
        return;
    }
    self.after_flush = then;
    if (then != .none) self.quitting = true;
    const runtime = self.runtime orelse return finishFlush(self);
    if (!self.flush_hook_ready) return finishFlush(self);
    self.flush_id += 1;
    var buf: [64]u8 = undefined;
    const detail = std.fmt.bufPrint(&buf, "{{\"id\":{d}}}", .{self.flush_id}) catch return finishFlush(self);
    runtime.emitWindowEvent(1, "app:flush", detail) catch return finishFlush(self);
    self.flush_active = true;
    self.flush_deadline_ms = nowMs(self) + flush_timeout_ms;
    startGateTimer(self);
}

fn finishFlush(self: *App) void {
    self.flush_active = false;
    const then = self.after_flush;
    self.after_flush = .none;
    switch (then) {
        .none => {},
        .reply_terminate => if (comptime builtin.os.tag == .macos) goban_reply_quit(),
        .close_window => win_close.proceed(),
        .quit_app => {
            const runtime = self.runtime orelse return;
            runtime.quitApp() catch {
                // The helper keeps waiting; quitting by hand still
                // finishes the update.
                self.installer.markApplyFailed("QuitFailed");
            };
        },
    }
}

/// `studio.flushHook` {}: the page has a flush hook (store.js); from now on
/// a quit asks it first. Also installs the Windows close interception,
/// now that the window certainly exists. → `{ok}`.
fn flushHook(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    self.flush_hook_ready = true;
    if (!self.win_close_installed) self.win_close_installed = win_close.install(self, onWindowClose);
    return std.fmt.bufPrint(output, "{{\"ok\":true}}", .{}) catch error.HandlerFailed;
}

/// `studio.flushDone` {id}: the page wrote everything for flush `id`.
fn flushDone(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const FlushPayload = struct { id: u64 = 0 };
    const parsed = std.json.parseFromSlice(FlushPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const current = self.flush_active and parsed.value.id == self.flush_id;
    if (current) {
        finishFlush(self);
        stopGateTimer(self);
    }
    return std.fmt.bufPrint(output, "{{\"ok\":{s}}}", .{if (current) "true" else "false"}) catch error.HandlerFailed;
}

/// Windows: the user closed the window (close button, Alt+F4). True keeps
/// it open for now; `win_close.proceed` closes it once the page flushed.
fn onWindowClose(context: *anyopaque) bool {
    const self: *App = @ptrCast(@alignCast(context));
    if (!self.flush_hook_ready or self.runtime == null) return false;
    // Either the flush is open, or it ended at once and `proceed` already
    // queued the real close: this close is swallowed in both cases.
    beginFlush(self, .close_window);
    return true;
}

/// macOS: the app was asked to quit. 1 delays it until `goban_reply_quit`.
fn macQuitCallback(context: ?*anyopaque) callconv(.c) c_int {
    const self: *App = @ptrCast(@alignCast(context orelse return 0));
    if (!self.flush_hook_ready or self.runtime == null) return 0;
    // macos_open.m spins the run loop until goban_reply_quit (or its
    // backstop); a flush that ends right here simply ends the hold at once.
    beginFlush(self, .reply_terminate);
    return 1;
}

// ------------------------------------------------------------ models
//
// Optional networks (v5). The page names a kind, never an address: the
// URLs, sizes and SHA-256 hashes are pinned in models.zig. Downloads run on
// their own thread and write only under the app's data directory; the page
// polls `studio.modelStatus` for progress.

const ModelPayload = struct {
    kind: []const u8 = "",
};

fn modelKind(self: *App, payload: []const u8) !models_mod.Kind {
    const parsed = std.json.parseFromSlice(ModelPayload, self.allocator, payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    return models_mod.parseKind(parsed.value.kind) orelse error.InvalidRequest;
}

fn modelSlot(kind: models_mod.Kind) engine_mod.Slot {
    return switch (kind) {
        .human => .human,
        .strong => .strong,
    };
}

/// `studio.modelStatus` {}: `{available, human:{status, bytes, total,
/// idleMs, needed, name, error}, strong:{…}}`. `available` is false when
/// the app has no data directory (downloads impossible).
fn modelStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    return models_mod.statusJson(self.models, output) orelse error.HandlerFailed;
}

fn modelReply(self: *App, output: []u8, ok: bool, error_name: []const u8) ![]const u8 {
    var n: usize = 0;
    if (!json.append(output, &n, if (ok) "{\"ok\":true" else "{\"ok\":false")) return error.HandlerFailed;
    if (error_name.len > 0) {
        if (!json.append(output, &n, ",\"error\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, error_name)) return error.HandlerFailed;
    }
    if (!json.append(output, &n, ",\"models\":")) return error.HandlerFailed;
    const status = models_mod.statusJson(self.models, output[n..]) orelse return error.HandlerFailed;
    n += status.len;
    if (!json.append(output, &n, "}")) return error.HandlerFailed;
    return output[0..n];
}

/// `studio.modelDownload` {kind: "human"|"strong"}: start or resume the
/// download and return at once; `{ok, error?, models}`. Errors: NoDataDir,
/// Busy, ThreadFailed. Transfer errors arrive later in the status
/// (DiskFull, Network, HttpStatus, SizeMismatch, ChecksumMismatch, …).
fn modelDownload(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    self.models.start(kind) catch |err| return modelReply(self, output, false, @errorName(err));
    return modelReply(self, output, true, "");
}

/// `studio.modelCancel` {kind}: stop a download (its partial file stays for
/// a later resume). `{ok, models}`; ok is false when nothing was running.
fn modelCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    const cancelled = self.models.cancel(kind);
    return modelReply(self, output, cancelled, "");
}

/// `studio.modelRemove` {kind}: stop the KataGo process that uses the
/// network, then delete the file and any partial download. `{ok, models}`.
fn modelRemove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    _ = cancelJobs(self, null);
    // The worker may be mid-search: never block the UI thread on it. The
    // page retries on Busy; the slot stops as soon as the search ends.
    if (!self.katago.stopSlot(modelSlot(kind))) return modelReply(self, output, false, "Busy");
    self.models.remove(kind) catch |err| return modelReply(self, output, false, @errorName(err));
    return modelReply(self, output, true, "");
}

// ------------------------------------------------------- v9 file storage

/// The payload of the four store commands (each reads the fields it needs).
const StorePayload = struct {
    key: []const u8 = "",
    prefix: []const u8 = "",
    b64: []const u8 = "",
    offset: u64 = 0,
    done: bool = true,
};

fn parseStorePayload(self: *App, payload: []const u8) !std.json.Parsed(StorePayload) {
    return std.json.parseFromSlice(StorePayload, self.allocator, payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
}

/// `studio.storeRead {key, offset?}` → null when the file does not exist,
/// else `{size, b64}`: the file's size and up to `store.chunk_bytes` of it
/// from `offset`, as base64. A larger file is read in several calls.
fn storeRead(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    const raw = try self.allocator.alloc(u8, store_mod.chunk_bytes);
    defer self.allocator.free(raw);
    const chunk = (try self.store.read(parsed.value.key, parsed.value.offset, raw)) orelse return "null";
    const enc = std.base64.standard.Encoder;
    const b64_len = enc.calcSize(chunk.bytes.len);
    const head = std.fmt.bufPrint(output, "{{\"size\":{d},\"b64\":\"", .{chunk.size}) catch return error.TooLarge;
    if (head.len + b64_len + 2 > output.len) return error.TooLarge;
    _ = enc.encode(output[head.len..][0..b64_len], chunk.bytes);
    @memcpy(output[head.len + b64_len ..][0..2], "\"}");
    return output[0 .. head.len + b64_len + 2];
}

/// `studio.storeWrite {key, b64, offset?, done?}` → true. Without `offset`
/// and `done` it is one atomic write (temporary file, then rename). A file
/// larger than one chunk is sent as chunks from offset 0 in order, the last
/// with `done: true`; the target changes only then.
fn storeWrite(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    const v = parsed.value;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(v.b64) catch return error.InvalidRequest;
    if (n > store_mod.chunk_bytes) return error.TooLarge;
    const bytes = try self.allocator.alloc(u8, n);
    defer self.allocator.free(bytes);
    dec.decode(bytes, v.b64) catch return error.InvalidRequest;
    try self.store.write(v.key, bytes, v.offset, v.done);
    return "true";
}

/// `studio.storeList {prefix}` → the keys under `prefix` ("" for all,
/// "games/" for the games), as a JSON array.
fn storeList(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    return self.store.listJson(parsed.value.prefix, output);
}

/// `studio.storeRemove {key}` → true (also when there was nothing to remove).
fn storeRemove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = output;
    const self: *App = @ptrCast(@alignCast(context));
    const parsed = try parseStorePayload(self, invocation.request.payload);
    defer parsed.deinit();
    try self.store.remove(parsed.value.key);
    return "true";
}

// ------------------------------------------------------------ native menus

const MenuItemSpec = struct {
    label: []const u8 = "",
    command: []const u8 = "",
    key: []const u8 = "",
    shift: bool = false,
    alt: bool = false,
    enabled: bool = true,
    checked: bool = false,
    separator: bool = false,
};

const MenuSpec = struct {
    title: []const u8 = "",
    items: []const MenuItemSpec = &.{},
};

const MenusPayload = struct {
    menus: []const MenuSpec = &.{},
};

fn validMenuCommand(command: []const u8) bool {
    if (command.len == 0 or command.len > 128) return false;
    if (std.mem.eql(u8, command, ".") or std.mem.eql(u8, command, "..")) return false;
    for (command) |c| {
        if (c < 0x20 or c == '/' or c == '\\') return false;
    }
    return true;
}

/// Build the platform menu list from the page's spec into `store`. Items
/// that cannot be shown (empty label, bad command) are skipped and an
/// unknown key drops only the shortcut, so one bad entry never costs the
/// whole bar. ⌘ (primary) is implied for every key.
fn buildMenus(store: *MenuStore, spec: []const MenuSpec) ![]const native_sdk.Menu {
    store.text_len = 0;
    var menu_count: usize = 0;
    var item_count: usize = 0;
    for (spec) |menu_spec| {
        if (menu_count >= store.menus.len) break;
        if (menu_spec.title.len == 0 or menu_spec.title.len > 64) continue;
        const title = store.keep(menu_spec.title) orelse return error.InvalidRequest;
        const first = item_count;
        for (menu_spec.items) |item| {
            if (item_count >= store.items.len) break;
            if (item.separator) {
                if (item_count == first) continue;
                store.items[item_count] = .{ .separator = true };
                item_count += 1;
                continue;
            }
            if (item.label.len == 0 or item.label.len > 128 or !validMenuCommand(item.command)) continue;
            var key_buf: [32]u8 = undefined;
            var key: []const u8 = "";
            if (item.key.len > 0 and item.key.len <= key_buf.len) {
                const lowered = std.ascii.lowerString(&key_buf, item.key);
                if (native_sdk.platform.isValidShortcutKey(lowered)) key = store.keep(lowered) orelse return error.InvalidRequest;
            }
            store.items[item_count] = .{
                .label = store.keep(item.label) orelse return error.InvalidRequest,
                .command = store.keep(item.command) orelse return error.InvalidRequest,
                .key = key,
                .modifiers = .{ .primary = key.len > 0, .shift = key.len > 0 and item.shift, .option = key.len > 0 and item.alt },
                .enabled = item.enabled,
                .checked = item.checked,
            };
            item_count += 1;
        }
        store.menus[menu_count] = .{ .title = title, .items = store.items[first..item_count] };
        menu_count += 1;
    }
    const menus = store.menus[0..menu_count];
    try native_sdk.platform.validateMenus(menus);
    return menus;
}

/// `studio.setMenus` {menus:[{title, items:[{label, command, key?, shift?,
/// alt?, enabled?, checked?, separator?}]}]}: install the page's localized
/// menu bar (macOS). Picks come back as `menu:command` window events.
/// Windows keeps no menu bar; the call succeeds with applied:false.
fn setMenus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    if (comptime builtin.os.tag != .macos) {
        return std.fmt.bufPrint(output, "{{\"ok\":true,\"applied\":false}}", .{}) catch error.HandlerFailed;
    }
    const runtime = self.runtime orelse return error.HandlerFailed;
    const parsed = std.json.parseFromSlice(MenusPayload, self.allocator, invocation.request.payload, .{ .ignore_unknown_fields = true }) catch return error.InvalidRequest;
    defer parsed.deinit();
    const menus = try buildMenus(&self.menu_store, parsed.value.menus);
    try runtime.options.platform.services.configureMenus(menus);
    var items: usize = 0;
    for (menus) |menu| items += menu.items.len;
    return std.fmt.bufPrint(output, "{{\"ok\":true,\"applied\":true,\"menus\":{d},\"items\":{d}}}", .{ menus.len, items }) catch error.HandlerFailed;
}

/// The page polls this once after boot (and while running) instead of relying
/// on an event that may fire before the webview exists. The queue is consumed
/// on read; a path never opens twice. v13: the queue is cleared whatever
/// happens, and a path that cannot be sent (not UTF-8, or past the reply's
/// room) is dropped alone instead of failing every later call.
fn takeOpenFiles(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    defer {
        for (self.open_paths.items) |path| self.allocator.free(path);
        self.open_paths.clearRetainingCapacity();
    }
    return openPathsJson(self.open_paths.items, output) orelse error.HandlerFailed;
}

/// `{"paths":[…]}` with every path that is valid UTF-8 and fits.
fn openPathsJson(paths: []const []const u8, output: []u8) ?[]const u8 {
    const tail = "]}";
    if (output.len < tail.len) return null;
    const room = output[0 .. output.len - tail.len];
    var n: usize = 0;
    if (!json.append(room, &n, "{\"paths\":[")) return null;
    var count: usize = 0;
    for (paths) |path| {
        if (!std.unicode.utf8ValidateSlice(path)) continue;
        const mark = n;
        const ok = (count == 0 or json.append(room, &n, ",")) and json.appendString(room, &n, path);
        if (!ok) {
            n = mark;
            continue;
        }
        count += 1;
    }
    @memcpy(output[n..][0..tail.len], tail);
    return output[0 .. n + tail.len];
}

/// A closed packaged app can be launched with GOBAN_SELFTEST_OUT set by the
/// release job. The page writes a small report to that path after the real
/// WebView, bridge and engine are up; the platform workflow waits for it.
///
/// GOBAN_TOUR_OUT (v4) asks for the screenshot tour instead: the page walks
/// through its main screens (src/web/js/tour.js), writing its progress to
/// that path and waiting for scripts/tour-app.mjs to capture each one.
fn selftestConfig(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    // The page is up: tell a waiting update helper (if it launched us).
    install_mod.writeAck(self.io, &self.installer.note);
    const path = self.env_map.get("GOBAN_SELFTEST_OUT") orelse "";
    const tour = self.env_map.get("GOBAN_TOUR_OUT") orelse "";
    var n: usize = 0;
    if (path.len == 0) {
        if (!json.append(output, &n, "{\"enabled\":false")) return error.HandlerFailed;
    } else {
        if (!json.append(output, &n, "{\"enabled\":true,\"path\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, path)) return error.HandlerFailed;
    }
    // v5: also exercise the optional downloads (GOBAN_MODELS_DIR should
    // point at an empty temporary folder).
    const models = self.env_map.get("GOBAN_SELFTEST_MODELS") orelse "";
    if (path.len > 0 and std.mem.eql(u8, models, "1")) {
        if (!json.append(output, &n, ",\"models\":true")) return error.HandlerFailed;
    }
    if (tour.len > 0) {
        if (!json.append(output, &n, ",\"tour\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, tour)) return error.HandlerFailed;
    }
    // v5: GOBAN_UPDATE_PROBE_OUT asks the page for the updater probe
    // (selftest.js; scripts/test-updater.mjs), GOBAN_UPDATE_PROBE_TAG for a
    // real download of that release. The download address is still built
    // and checked by install.zig; the tag is only a tag.
    const probe = self.env_map.get("GOBAN_UPDATE_PROBE_OUT") orelse "";
    if (probe.len > 0) {
        if (!json.append(output, &n, ",\"updateProbe\":")) return error.HandlerFailed;
        if (!json.appendString(output, &n, probe)) return error.HandlerFailed;
        const probe_tag = self.env_map.get("GOBAN_UPDATE_PROBE_TAG") orelse "";
        if (install_mod.validTag(probe_tag)) {
            if (!json.append(output, &n, ",\"updateProbeTag\":")) return error.HandlerFailed;
            if (!json.appendString(output, &n, probe_tag)) return error.HandlerFailed;
        }
    }
    if (!json.append(output, &n, "}")) return error.HandlerFailed;
    return output[0..n];
}

fn macOpenCallback(context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void {
    const self: *App = @ptrCast(@alignCast(context orelse return));
    self.queueOpenPath(std.mem.span(path));
}

fn installPlatformOpenHandler(self: *App) void {
    if (comptime builtin.os.tag == .macos) {
        goban_install_open_handler(self, macOpenCallback);
        goban_install_quit_handler(self, macQuitCallback);
    }
}

/// The release self-test and the screenshot tour write their reports to
/// files the launcher names in the environment (and the tour waits for an
/// acknowledgement file beside its report). These are the only paths the
/// page may use without a dialog; they are trusted because the
/// environment already is (whoever sets it can run anything as the user).
fn grantReportFiles(self: *App) void {
    var buf: [files_mod.max_path_bytes + 16]u8 = undefined;
    if (self.env_map.get("GOBAN_SELFTEST_OUT")) |p| {
        if (p.len > 0) {
            _ = self.grants.grant(p, .write, true);
            if (std.fmt.bufPrint(&buf, "{s}.progress", .{p})) |progress| {
                _ = self.grants.grant(progress, .write, true);
            } else |_| {}
        }
    }
    if (self.env_map.get("GOBAN_UPDATE_PROBE_OUT")) |p| {
        if (p.len > 0) _ = self.grants.grant(p, .write, true);
    }
    if (self.env_map.get("GOBAN_TOUR_OUT")) |p| {
        if (p.len > 0) {
            _ = self.grants.grant(p, .write, true);
            if (std.fmt.bufPrint(&buf, "{s}.ack", .{p})) |ack| {
                _ = self.grants.grant(ack, .read, true);
            } else |_| {}
        }
    }
}

pub fn main(init: std.process.Init) !void {
    var app_state = App{ .env_map = init.environ_map, .io = init.io, .allocator = init.gpa };
    app_state.grants = files_mod.Grants.init(init.gpa);
    defer app_state.deinit();
    grantReportFiles(&app_state);
    // One process per data directory: a second launch hands its files to
    // the first and ends here, before anything is read or written.
    var data_dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data_dir = paths_mod.dataDir(init.environ_map, &data_dir_buf);
    if (!claimInstance(&app_state, init, data_dir)) return;
    // Optional networks (v5). Not freed at exit: a download thread may
    // still be running.
    var models_dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const models = try std.heap.page_allocator.create(models_mod.Manager);
    models.init(init.io, paths_mod.modelsDir(init.environ_map, &models_dir_buf));
    // Downloads and the update check use the proxy the environment or the
    // system names (net.zig).
    models.env = init.environ_map;
    app_state.models = models;
    // v9 file storage: the page's settings, profile and games (store.zig).
    app_state.store.init(init.io, data_dir);
    var strong_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var human_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const strong_model = models.modelPath(.strong, &strong_buf) orelse "";
    const human_model = models.modelPath(.human, &human_buf) orelse "";
    // Not freed at exit: the detached worker thread may still be unwinding.
    const katago = try std.heap.page_allocator.create(engine_mod.Worker);
    katago.init(init.io, init.environ_map, strong_model, human_model);
    defer katago.shutdown();
    app_state.katago = katago;
    app_state.request_scratch = try std.heap.page_allocator.create(engine_mod.Request);
    app_state.request_scratch.* = .{};
    app_state.katago_available = katago.standard().available();
    app_state.katago_version = katago.standard().versionText(&app_state.katago_version_buf);
    // Not freed at exit either: a check thread may still be finishing.
    const updater = try std.heap.page_allocator.create(update_mod.Checker);
    updater.init(init.io);
    updater.env = init.environ_map;
    app_state.updater = updater;
    // Not freed at exit either: a download thread may still be finishing.
    const installer = try std.heap.page_allocator.create(install_mod.Installer);
    installer.init(init.io);
    installer.setPublicKey(update_public_key);
    installer.setEnv(init.environ_map);
    app_state.installer = installer;
    if (init.environ_map.get("GOBAN_UPDATE_PROBE_OUT") != null) {
        const probe_tag = init.environ_map.get("GOBAN_UPDATE_PROBE_TAG") orelse "";
        if (install_mod.validTag(probe_tag)) {
            @memcpy(app_state.probe_tag_buf[0..probe_tag.len], probe_tag);
            app_state.probe_tag_len = probe_tag.len;
        }
    }
    app_state.resolveFrontendDist();
    app_state.queueLaunchArgs(init.minimal.args);
    installPlatformOpenHandler(&app_state);
    try runner.runWithOptions(app_state.app(), .{
        .app_name = "Goban Studio",
        .window_title = "Goban Studio",
        .bundle_id = paths_mod.bundle_id,
        .icon_path = "assets/icon.png",
        .js_window_api = true,
        .bridge = app_state.bridge(),
        .menus = &.{},
        .security = .{
            .navigation = .{ .allowed_origins = &allowed_origins },
        },
    }, init);
}

test {
    std.testing.refAllDecls(engine_mod);
    std.testing.refAllDecls(@import("engine_build.zig"));
    std.testing.refAllDecls(update_mod);
    std.testing.refAllDecls(install_mod);
    std.testing.refAllDecls(models_mod);
    std.testing.refAllDecls(store_mod);
    std.testing.refAllDecls(files_mod);
    std.testing.refAllDecls(win_close);
    std.testing.refAllDecls(json);
    std.testing.refAllDecls(paths_mod);
    std.testing.refAllDecls(instance_mod);
    std.testing.refAllDecls(net_mod);
}

test "production source uses frontend assets" {
    const source = native_sdk.frontend.productionSource(.{ .dist = "frontend/dist" });
    try std.testing.expectEqual(native_sdk.WebViewSourceKind.assets, source.kind);
    try std.testing.expectEqualStrings("frontend/dist", source.asset_options.?.root_path);
}

test "analyze payload rules default to japanese and accept only the three presets" {
    const cases = [_]struct { json: []const u8, want: ?engine_mod.Rules }{
        .{ .json = "{\"size\":9}", .want = .japanese },
        .{ .json = "{\"rules\":\"japanese\"}", .want = .japanese },
        .{ .json = "{\"rules\":\"chinese\"}", .want = .chinese },
        .{ .json = "{\"rules\":\"korean\"}", .want = .korean },
        .{ .json = "{\"rules\":\"aga\"}", .want = null },
        .{ .json = "{\"rules\":\"chinese\\nquit\"}", .want = null },
    };
    for (cases) |c| {
        const parsed = try std.json.parseFromSlice(AnalyzePayload, std.testing.allocator, c.json, .{ .ignore_unknown_fields = true });
        defer parsed.deinit();
        try std.testing.expectEqual(c.want, engine_mod.Rules.parse(parsed.value.rules));
    }
}

test "open paths are sent escaped; one bad path never blocks the others" {
    var out: [256]u8 = undefined;
    const paths = [_][]const u8{ "/a/x.sgf", "/a/tab\there.sgf", "/a/bell\x07.sgf", "/a/bad\xff.sgf", "/a/q\"uote.sgf" };
    const got = openPathsJson(&paths, &out).?;
    try std.testing.expectEqualStrings("{\"paths\":[\"/a/x.sgf\",\"/a/tab\\there.sgf\",\"/a/bell\\u0007.sgf\",\"/a/q\\\"uote.sgf\"]}", got);
    // The reply is valid JSON.
    const parsed = try std.json.parseFromSlice(struct { paths: []const []const u8 }, std.testing.allocator, got, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(usize, 4), parsed.value.paths.len);
    try std.testing.expectEqualStrings("/a/bell\x07.sgf", parsed.value.paths[2]);
    // Paths that do not fit are dropped one by one, the reply stays whole.
    var small: [30]u8 = undefined;
    const some = openPathsJson(&paths, &small).?;
    try std.testing.expectEqualStrings("{\"paths\":[\"/a/x.sgf\"]}", some);
    var tiny: [12]u8 = undefined;
    try std.testing.expectEqualStrings("{\"paths\":[]}", openPathsJson(&paths, &tiny).?);
}

test "request ids are checked, not cut" {
    try std.testing.expect(validRequestId("k1"));
    try std.testing.expect(validRequestId("k" ++ "9" ** 63));
    try std.testing.expect(!validRequestId(""));
    try std.testing.expect(!validRequestId("k" ++ "9" ** 64));
    try std.testing.expect(!validRequestId("k1\"}"));
    try std.testing.expect(!validRequestId("k 1"));
}

test "every bridge command is registered once, with the same origins" {
    inline for (sync_commands ++ .{}) |c| try std.testing.expect(std.mem.startsWith(u8, c.name, "studio."));
    var names: [sync_commands.len + async_commands.len][]const u8 = undefined;
    for (sync_commands, 0..) |c, i| names[i] = c.name;
    for (async_commands, 0..) |c, i| names[sync_commands.len + i] = c.name;
    for (names, 0..) |a, i| {
        for (names[i + 1 ..]) |b| try std.testing.expect(!std.mem.eql(u8, a, b));
    }
    // The data folder can be shown; the command takes no path from the page.
    var has_reveal = false;
    for (names) |n| has_reveal = has_reveal or std.mem.eql(u8, n, "studio.revealDataDir");
    try std.testing.expect(has_reveal);
    // The v2 synchronous KataGo commands are gone.
    for (names) |n| {
        try std.testing.expect(!std.mem.eql(u8, n, "studio.katagoMove"));
        try std.testing.expect(!std.mem.eql(u8, n, "studio.katagoAnalyze"));
    }
    // The dev server origin only in development builds.
    var has_dev = false;
    for (allowed_origins) |o| has_dev = has_dev or std.mem.eql(u8, o, dev_server_origin);
    try std.testing.expectEqual(app_options.dev_origin, has_dev);
}

test "human policy requests are validated and bounded" {
    const a = std.testing.allocator;
    const req = try a.create(engine_mod.Request);
    defer a.destroy(req);
    var job = Job{};
    try parsePolicyRequest(a, "{\"size\":9,\"komi\":6.5,\"rules\":\"chinese\",\"moves\":\"B E5 W C3 B G7 W pass B D4\",\"color\":\"B\",\"profiles\":[\"rank_20k\",\"rank_3d\"]}", req, &job);
    try std.testing.expectEqual(engine_mod.Kind.human_policy, req.kind);
    try std.testing.expectEqual(engine_mod.Slot.human, req.slot);
    try std.testing.expectEqual(@as(usize, 2), req.policy_profiles_len);
    try std.testing.expectEqualStrings("rank_3d", req.policyProfile(1));
    try std.testing.expectEqual(@as(usize, 3), policyPositions(req));
    try std.testing.expectEqual(@as(usize, 0), job.id_len); // no id: named by seq later
    try parsePolicyRequest(a, "{\"id\":\"h1\",\"size\":9,\"moves\":\"B E5 W C3 B G7\",\"color\":\"W\",\"profiles\":[\"rank_1k\"],\"from\":2}", req, &job);
    try std.testing.expectEqualStrings("h1", job.idText());
    try std.testing.expectEqual(@as(usize, 0), policyPositions(req));
    // Seven profiles: as many positions as fit the evaluation budget.
    try parsePolicyRequest(a, "{\"size\":9,\"color\":\"B\",\"profiles\":[\"rank_20k\",\"rank_15k\",\"rank_10k\",\"rank_5k\",\"rank_1k\",\"rank_1d\",\"rank_3d\"]}", req, &job);
    try std.testing.expectEqual(@min(engine_mod.max_policy_positions, engine_mod.max_policy_evals / 7), req.policy_max_positions);
    const bad = [_][]const u8{
        "{\"size\":9,\"color\":\"B\",\"profiles\":[]}",
        "{\"size\":9,\"color\":\"B\",\"profiles\":[\"rank_5k maxVisits 1\"]}",
        "{\"size\":9,\"color\":\"B\",\"profiles\":[\"proyear_2020\"]}",
        "{\"size\":9,\"color\":\"X\",\"profiles\":[\"rank_5k\"]}",
        "{\"size\":25,\"color\":\"B\",\"profiles\":[\"rank_5k\"]}",
        "{\"size\":9,\"moves\":\"B Z9\",\"color\":\"B\",\"profiles\":[\"rank_5k\"]}",
        "{\"size\":9,\"rules\":\"aga\",\"color\":\"B\",\"profiles\":[\"rank_5k\"]}",
        "{\"id\":\"bad id\",\"size\":9,\"color\":\"B\",\"profiles\":[\"rank_5k\"]}",
        "{\"size\":9,\"color\":\"B\",\"profiles\":[\"rank_1k\",\"rank_2k\",\"rank_3k\",\"rank_4k\",\"rank_5k\",\"rank_6k\",\"rank_7k\",\"rank_8k\",\"rank_9k\"]}",
        "not json",
    };
    for (bad) |payload| try std.testing.expectError(error.InvalidRequest, parsePolicyRequest(a, payload, req, &job));
}

test "human policy replies are JSON the page reads" {
    const rows = try std.testing.allocator.create(engine_mod.PolicyRows);
    defer std.testing.allocator.destroy(rows);
    rows.* = .{ .profiles = 2, .count = 2 };
    @memcpy(rows.names[0][0..8], "rank_20k");
    rows.name_lens[0] = 8;
    @memcpy(rows.names[1][0..7], "rank_3d");
    rows.name_lens[1] = 7;
    rows.index[0] = 10;
    rows.index[1] = 12;
    rows.p[0] = 0.25;
    rows.p[1] = 0.5;
    rows.p[engine_mod.max_policy_profiles] = 0;
    rows.p[engine_mod.max_policy_profiles + 1] = 1;
    var buf: [512]u8 = undefined;
    const got = policyReply(&buf, "p7", rows).?;
    try std.testing.expectEqualStrings("{\"ok\":true,\"id\":\"p7\",\"engine\":\"human\",\"moves\":[{\"index\":10,\"p\":{\"rank_20k\":0.250000,\"rank_3d\":0.500000}},{\"index\":12,\"p\":{\"rank_20k\":0.000000,\"rank_3d\":1.000000}}],\"truncated\":false}", got);
    const parsed = try std.json.parseFromSlice(std.json.Value, std.testing.allocator, got, .{});
    parsed.deinit();
    var small: [40]u8 = undefined;
    try std.testing.expect(policyReply(&small, "p7", rows) == null);
}
