//! The shell's state: one `App` (UI thread) holding the KataGo worker, the
//! updater, the installer, the model downloads, the store and the quit
//! gate, plus the timers that collect their results. main.zig creates it;
//! the bridge_*.zig modules, events.zig and lifecycle.zig act on it.
const std = @import("std");
const builtin = @import("builtin");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const engine_request = @import("engine_request.zig");
const engine_worker = @import("engine_worker.zig");
const update_mod = @import("update.zig");
const install_mod = @import("install.zig");
const install_apply = @import("install_apply.zig");
const models_mod = @import("models.zig");
const store_mod = @import("store.zig");
const files_mod = @import("files.zig");
const commands = @import("commands.zig");
const events = @import("events.zig");

const OpenCallback = *const fn (context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void;
pub extern fn goban_install_open_handler(context: ?*anyopaque, callback: OpenCallback) void;
/// macOS quit (⌘Q, Dock, AppleScript, SIGTERM): the callback returns 1 to
/// hold the quit until `goban_reply_quit` or a 3 s backstop (src/macos_open.m).
const QuitCallback = *const fn (context: ?*anyopaque) callconv(.c) c_int;
pub extern fn goban_install_quit_handler(context: ?*anyopaque, callback: QuitCallback) void;
pub extern fn goban_reply_quit() void;

const max_open_paths = 16;

// Startup menus are empty → host default bar. The page installs its own,
// localized menus with `studio.setMenus` (macOS); with the SDK patch from
// scripts/patch-sdk.mjs they sit between the system App/File/Edit menus and
// the system View/Window menus.

/// Timer that collects KataGo worker output while async requests are open,
/// in case a platform wake is coalesced away. Below the SDK's reserved ids.
pub const katago_timer_id: u64 = 0x6b61_7461_676f;
pub const katago_timer_interval_ns: u64 = 50 * std.time.ns_per_ms;
const max_jobs = 8;
/// Timer that collects the update check's result (and enforces its
/// deadline) while one is open; same role as the KataGo timer.
pub const update_timer_id: u64 = 0x7570_6461_7465;
pub const update_timer_interval_ns: u64 = 250 * std.time.ns_per_ms;
/// Timer that collects a finished update download (and runs its stall
/// watchdog) while `studio.updateDownload` is open.
pub const install_timer_id: u64 = 0x696e_7374_616c;
pub const install_timer_interval_ns: u64 = 500 * std.time.ns_per_ms;
/// Timer that runs the quit gate (v13): the page's flush before the app
/// quits or the window closes, and the wait for the update helper's
/// "started" marker.
pub const gate_timer_id: u64 = 0x6761_7465;
pub const gate_timer_interval_ns: u64 = 100 * std.time.ns_per_ms;
/// How long the page gets to write what is pending before a quit (v13).
pub const flush_timeout_ms: i64 = 1_500;
/// Timer that looks for a second launch's request (instance.zig).
pub const inbox_timer_id: u64 = 0x696e_626f_78;
pub const inbox_timer_interval_ns: u64 = 400 * std.time.ns_per_ms;

/// What happens once the page has flushed (or its time is up).
pub const AfterFlush = enum { none, quit_app, reply_terminate, close_window };

/// An async analysis the page is waiting for. UI thread only.
pub const Job = struct {
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
    kind: engine_request.Kind = .analyze,
    /// Backstop (v13): past this the page is answered `Timeout` whatever
    /// the worker is doing, so no request can hang. The worker's own
    /// watchdog (engine_worker.zig) normally fires long before.
    deadline_ms: i64 = 0,

    pub fn idText(self: *const Job) []const u8 {
        return self.id[0..self.id_len];
    }
};

/// Labels and commands of the page's menus, copied into app-owned memory
/// before they are handed to the platform.
pub const MenuStore = struct {
    menus: [native_sdk.platform.max_menus]native_sdk.Menu = undefined,
    items: [native_sdk.platform.max_menu_items]native_sdk.MenuItem = undefined,
    text: [32 * 1024]u8 = undefined,
    text_len: usize = 0,

    pub fn keep(self: *MenuStore, value: []const u8) ?[]const u8 {
        if (self.text_len + value.len > self.text.len) return null;
        const out = self.text[self.text_len..][0..value.len];
        @memcpy(out, value);
        self.text_len += value.len;
        return out;
    }
};

pub const App = struct {
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
    katago: *engine_worker.Worker = undefined,
    /// Scratch for parsing one async request (it is copied into the
    /// worker's queue), so the bridge handler does not hold it on the stack.
    request_scratch: *engine_request.Request = undefined,
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
    install_target: install_apply.Target = .{},
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
    handlers: [commands.sync_commands.len]native_sdk.BridgeHandler = undefined,
    async_handlers: [commands.async_commands.len]native_sdk.bridge.AsyncHandler = undefined,
    policies: [commands.sync_commands.len + commands.async_commands.len]native_sdk.BridgeCommandPolicy = undefined,

    pub fn deinit(self: *@This()) void {
        for (self.open_paths.items) |path| self.allocator.free(path);
        self.open_paths.deinit(self.allocator);
        self.grants.deinit();
    }

    pub fn queueOpenPath(self: *@This(), path: []const u8) void {
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

    pub fn queueLaunchArgs(self: *@This(), args: std.process.Args) void {
        var it = std.process.Args.Iterator.initAllocator(args, self.allocator) catch return;
        defer it.deinit();
        _ = it.next(); // executable
        while (it.next()) |arg| {
            if (std.ascii.endsWithIgnoreCase(arg, ".sgf")) self.queueOpenPath(arg);
            // Launched by the update helper (install_apply.zig).
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
    pub fn resolveFrontendDist(self: *@This()) void {
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

    pub fn app(self: *@This()) native_sdk.App {
        return .{
            .context = self,
            .name = "goban-studio",
            .source = native_sdk.frontend.productionSource(.{ .dist = self.frontend_dist }),
            .source_fn = source,
            .event_fn = events.onEvent,
        };
    }

    fn source(context: *anyopaque) anyerror!native_sdk.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return native_sdk.frontend.sourceFromEnv(self.env_map, .{
            .dist = self.frontend_dist,
            .entry = "index.html",
        });
    }

    pub fn bridge(self: *@This()) native_sdk.BridgeDispatcher {
        for (commands.sync_commands, 0..) |command, i| {
            self.handlers[i] = .{ .name = command.name, .context = self, .invoke_fn = command.invoke };
            self.policies[i] = .{ .name = command.name, .origins = &commands.allowed_origins };
        }
        for (commands.async_commands, 0..) |command, i| {
            self.async_handlers[i] = .{ .name = command.name, .context = self, .invoke_fn = command.invoke };
            self.policies[commands.sync_commands.len + i] = .{ .name = command.name, .origins = &commands.allowed_origins };
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
