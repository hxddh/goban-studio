const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const update_mod = @import("update.zig");
const install_mod = @import("install.zig");
const models_mod = @import("models.zig");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const allowed_origins = [_][]const u8{ "zero://app", "zero://inline", "http://127.0.0.1:5173" };
const max_open_paths = 16;

const OpenCallback = *const fn (context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void;
extern fn goban_install_open_handler(context: ?*anyopaque, callback: OpenCallback) void;

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
    handlers: [18]native_sdk.BridgeHandler = undefined,
    async_handlers: [4]native_sdk.bridge.AsyncHandler = undefined,
    policies: [22]native_sdk.BridgeCommandPolicy = undefined,

    fn deinit(self: *@This()) void {
        for (self.open_paths.items) |path| self.allocator.free(path);
        self.open_paths.deinit(self.allocator);
    }

    fn queueOpenPath(self: *@This(), path: []const u8) void {
        if (path.len == 0 or path.len > 4096) return;
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
        self.handlers[0] = .{
            .name = "studio.writeTextFile",
            .context = self,
            .invoke_fn = writeTextFile,
        };
        self.handlers[1] = .{
            .name = "studio.readTextFile",
            .context = self,
            .invoke_fn = readTextFile,
        };
        self.handlers[2] = .{
            .name = "studio.windowDrag",
            .context = self,
            .invoke_fn = windowDrag,
        };
        self.handlers[3] = .{
            .name = "studio.windowChrome",
            .context = self,
            .invoke_fn = windowChrome,
        };
        self.handlers[4] = .{
            .name = "studio.katagoMove",
            .context = self,
            .invoke_fn = katagoMove,
        };
        self.handlers[5] = .{
            .name = "studio.katagoStatus",
            .context = self,
            .invoke_fn = katagoStatus,
        };
        self.handlers[6] = .{
            .name = "studio.takeOpenFiles",
            .context = self,
            .invoke_fn = takeOpenFiles,
        };
        self.handlers[7] = .{
            .name = "studio.selftest",
            .context = self,
            .invoke_fn = selftestConfig,
        };
        self.handlers[8] = .{
            .name = "studio.katagoAnalyze",
            .context = self,
            .invoke_fn = katagoAnalyze,
        };
        self.handlers[9] = .{
            .name = "studio.katagoCancel",
            .context = self,
            .invoke_fn = katagoCancel,
        };
        self.handlers[10] = .{
            .name = "studio.setMenus",
            .context = self,
            .invoke_fn = setMenus,
        };
        self.handlers[11] = .{
            .name = "studio.openReleasePage",
            .context = self,
            .invoke_fn = openReleasePage,
        };
        self.handlers[12] = .{
            .name = "studio.modelStatus",
            .context = self,
            .invoke_fn = modelStatus,
        };
        self.handlers[13] = .{
            .name = "studio.modelDownload",
            .context = self,
            .invoke_fn = modelDownload,
        };
        self.handlers[14] = .{
            .name = "studio.modelCancel",
            .context = self,
            .invoke_fn = modelCancel,
        };
        self.handlers[15] = .{
            .name = "studio.modelRemove",
            .context = self,
            .invoke_fn = modelRemove,
        };
        self.async_handlers[0] = .{
            .name = "studio.katagoAnalyzeAsync",
            .context = self,
            .invoke_fn = katagoAnalyzeAsync,
        };
        self.async_handlers[1] = .{
            .name = "studio.checkUpdate",
            .context = self,
            .invoke_fn = checkUpdate,
        };
        self.handlers[16] = .{
            .name = "studio.updateStatus",
            .context = self,
            .invoke_fn = updateStatus,
        };
        self.handlers[17] = .{
            .name = "studio.updateCancel",
            .context = self,
            .invoke_fn = updateCancel,
        };
        self.async_handlers[2] = .{
            .name = "studio.updateDownload",
            .context = self,
            .invoke_fn = updateDownload,
        };
        self.async_handlers[3] = .{
            .name = "studio.updateApply",
            .context = self,
            .invoke_fn = updateApply,
        };
        for (self.handlers, 0..) |handler, i| {
            self.policies[i] = .{ .name = handler.name, .origins = &allowed_origins };
        }
        for (self.async_handlers, 0..) |handler, i| {
            self.policies[self.handlers.len + i] = .{ .name = handler.name, .origins = &allowed_origins };
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

/// OS "open with" / document-open events. The page subscribes to the
/// window event "open:files" and imports the first .sgf path. The event may
/// arrive before the page has subscribed; that is a platform limitation, not
/// a reason to keep a second copy of the file in native state.
const OPEN_FILE_VARIANTS = [_][]const u8{ "open_files", "open_file", "open_urls", "open_documents" };

fn forwardOpenFiles(runtime: *native_sdk.Runtime, event: native_sdk.Event) void {
    inline for (OPEN_FILE_VARIANTS) |variant| {
        if (comptime @hasField(native_sdk.Event, variant)) {
            if (event == @field(std.meta.Tag(native_sdk.Event), variant)) {
                emitOpenFiles(runtime, @field(event, variant));
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

fn emitOpenFiles(runtime: *native_sdk.Runtime, payload: anytype) void {
    const P = @TypeOf(payload);
    var detail_buf: [8192]u8 = undefined;
    var n: usize = 0;
    if (!jsonAppend(&detail_buf, &n, "{\"paths\":[")) return;
    var count: usize = 0;
    if (comptime @typeInfo(P) == .pointer) {
        for (payload) |item| {
            if (openFilePathOf(item)) |path| {
                if (!appendOpenPath(&detail_buf, &n, &count, path)) return;
            }
        }
    } else if (comptime @typeInfo(P) == .@"struct") {
        if (comptime @hasField(P, "paths")) {
            for (payload.paths) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(&detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "files")) {
            for (payload.files) |item| {
                if (openFilePathOf(item)) |path| {
                    if (!appendOpenPath(&detail_buf, &n, &count, path)) return;
                }
            }
        } else if (comptime @hasField(P, "path")) {
            if (openFilePathOf(payload.path)) |path| {
                if (!appendOpenPath(&detail_buf, &n, &count, path)) return;
            }
        } else return;
    } else return;
    if (count == 0) return;
    if (!jsonAppend(&detail_buf, &n, "]}")) return;
    runtime.emitWindowEvent(1, "open:files", detail_buf[0..n]) catch {};
}

fn appendOpenPath(buf: []u8, n: *usize, count: *usize, path: []const u8) bool {
    if (path.len == 0 or path.len > 4096) return true;
    if (count.* > 0 and !jsonAppend(buf, n, ",")) return false;
    if (!jsonAppendString(buf, n, path)) return false;
    count.* += 1;
    return true;
}

fn jsonAppend(buf: []u8, n: *usize, text: []const u8) bool {
    if (n.* + text.len > buf.len) return false;
    @memcpy(buf[n.*..][0..text.len], text);
    n.* += text.len;
    return true;
}

fn jsonAppendString(buf: []u8, n: *usize, text: []const u8) bool {
    if (!jsonAppend(buf, n, "\"")) return false;
    for (text) |c| {
        switch (c) {
            '"' => if (!jsonAppend(buf, n, "\\\"")) return false,
            '\\' => if (!jsonAppend(buf, n, "\\\\")) return false,
            '\n' => if (!jsonAppend(buf, n, "\\n")) return false,
            '\r' => if (!jsonAppend(buf, n, "\\r")) return false,
            '\t' => if (!jsonAppend(buf, n, "\\t")) return false,
            else => {
                if (c < 0x20) return false;
                if (n.* + 1 > buf.len) return false;
                buf[n.*] = c;
                n.* += 1;
            },
        }
    }
    return jsonAppend(buf, n, "\"");
}

fn onEvent(context: *anyopaque, runtime: *native_sdk.Runtime, event: native_sdk.Event) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    self.runtime = runtime;
    forwardOpenFiles(runtime, event);
    switch (event) {
        .command => |cmd| forwardCommand(runtime, cmd.name, cmd.window_id),
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
    if (!jsonAppend(&buf, &n, "{\"command\":")) return;
    if (!jsonAppendString(&buf, &n, name)) return;
    const tail = std.fmt.bufPrint(buf[n..], ",\"windowId\":{d}}}", .{wid}) catch return;
    n += tail.len;
    runtime.emitWindowEvent(wid, "menu:command", buf[0..n]) catch {};

    var legacy: [640]u8 = undefined;
    var m: usize = 0;
    if (!jsonAppend(&legacy, &m, "{\"id\":")) return;
    if (!jsonAppendString(&legacy, &m, name)) return;
    if (!jsonAppend(&legacy, &m, ",\"command\":")) return;
    if (!jsonAppendString(&legacy, &m, name)) return;
    const rest = std.fmt.bufPrint(legacy[m..], ",\"key\":\"\",\"windowId\":{d},\"modifiers\":{{\"primary\":false,\"command\":false,\"control\":false,\"option\":false,\"shift\":false}}}}", .{wid}) catch return;
    m += rest.len;
    runtime.emitWindowEvent(wid, "shortcut", legacy[0..m]) catch {};
}

fn jsonStringField(payload: []const u8, key: []const u8) ?[]const u8 {
    var key_buf: [96]u8 = undefined;
    if (key.len + 2 > key_buf.len) return null;
    const needle = std.fmt.bufPrint(&key_buf, "\"{s}\"", .{key}) catch return null;
    const at = std.mem.indexOf(u8, payload, needle) orelse return null;
    var i = at + needle.len;
    while (i < payload.len and (payload[i] == ' ' or payload[i] == '\t' or payload[i] == '\n' or payload[i] == '\r' or payload[i] == ':')) : (i += 1) {}
    if (i >= payload.len or payload[i] != '"') return null;
    i += 1;
    const start = i;
    while (i < payload.len) : (i += 1) {
        if (payload[i] == '\\') {
            i += 1;
            continue;
        }
        if (payload[i] == '"') return payload[start..i];
    }
    return null;
}

/// Decode a JSON string slice (contents between quotes) into `out`.
/// Handles \\ \" \/ \n \r \t — enough for file paths from the bridge.
fn jsonUnescape(raw: []const u8, out: []u8) ?[]const u8 {
    var wi: usize = 0;
    var i: usize = 0;
    while (i < raw.len) : (i += 1) {
        if (wi >= out.len) return null;
        if (raw[i] != '\\') {
            out[wi] = raw[i];
            wi += 1;
            continue;
        }
        i += 1;
        if (i >= raw.len) return null;
        const c: u8 = switch (raw[i]) {
            '"', '\\', '/' => raw[i],
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            else => return null,
        };
        out[wi] = c;
        wi += 1;
    }
    return out[0..wi];
}

fn writeTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const path_raw = jsonStringField(invocation.request.payload, "path") orelse return error.InvalidRequest;
    const b64 = jsonStringField(invocation.request.payload, "b64") orelse return error.InvalidRequest;
    // Paths need JSON unescape (Windows `C:\…` arrives as `C:\\…`); base64 is
    // ASCII without escapes under JSON.stringify, so the raw slice is fine.
    var path_buf: [4096]u8 = undefined;
    const path = jsonUnescape(path_raw, &path_buf) orelse return error.InvalidRequest;
    if (path.len == 0 or path.len > 4096) return error.InvalidRequest;
    if (b64.len == 0 or b64.len > 512 * 1024) return error.InvalidRequest;

    var decoded_buf: [384 * 1024]u8 = undefined;
    const dec = std.base64.standard.Decoder;
    const dec_len = dec.calcSizeForSlice(b64) catch return error.InvalidRequest;
    if (dec_len > decoded_buf.len) return error.InvalidRequest;
    dec.decode(decoded_buf[0..dec_len], b64) catch return error.InvalidRequest;

    var file = std.Io.Dir.createFileAbsolute(self.io, path, .{ .truncate = true }) catch return error.HandlerFailed;
    defer file.close(self.io);
    file.writeStreamingAll(self.io, decoded_buf[0..dec_len]) catch return error.HandlerFailed;

    return std.fmt.bufPrint(output, "true", .{}) catch "true";
}

fn readTextFile(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const path_raw = jsonStringField(invocation.request.payload, "path") orelse return error.InvalidRequest;
    var path_buf: [4096]u8 = undefined;
    const path = jsonUnescape(path_raw, &path_buf) orelse return error.InvalidRequest;
    if (path.len == 0 or path.len > 4096) return error.InvalidRequest;

    var file = std.Io.Dir.openFileAbsolute(self.io, path, .{}) catch return error.HandlerFailed;
    defer file.close(self.io);

    var raw_buf: [256 * 1024]u8 = undefined;
    const n = file.readPositionalAll(self.io, &raw_buf, 0) catch return error.HandlerFailed;
    if (n == 0) return error.InvalidRequest;

    var b64_buf: [360 * 1024]u8 = undefined;
    const enc = std.base64.standard.Encoder;
    const enc_len = enc.calcSize(n);
    if (enc_len > b64_buf.len) return error.InvalidRequest;
    const encoded = enc.encode(b64_buf[0..enc_len], raw_buf[0..n]);

    // JSON string result
    return native_sdk.bridge.writeJsonStringValue(output, encoded);
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

/// One move from the bundled KataGo engine (v2, synchronous). The page
/// sends a base64 GTP setup script (newline-separated, limited to the setup
/// vocabulary in engine.zig) and the side to move. Any async search is
/// cancelled first; the call then borrows the worker's KataGo process.
fn katagoMove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const b64 = jsonStringField(invocation.request.payload, "b64") orelse return error.InvalidRequest;
    const color_raw = jsonStringField(invocation.request.payload, "color") orelse return error.InvalidRequest;
    var color_buf: [8]u8 = undefined;
    const color = jsonUnescape(color_raw, &color_buf) orelse return error.InvalidRequest;

    var script_buf: [96 * 1024]u8 = undefined;
    const dec = std.base64.standard.Decoder;
    const script_len = dec.calcSizeForSlice(b64) catch return error.InvalidRequest;
    if (script_len > script_buf.len) return error.InvalidRequest;
    dec.decode(script_buf[0..script_len], b64) catch return error.InvalidRequest;

    _ = cancelJobs(self, null);
    self.katago.lockExclusive();
    defer self.katago.unlockExclusive();
    const move = self.katago.standard().move(script_buf[0..script_len], color) catch |err| switch (err) {
        error.InvalidRequest => return error.InvalidRequest,
        else => return error.HandlerFailed,
    };
    return std.fmt.bufPrint(output, "{{\"ok\":true,\"move\":\"{s}\"}}", .{move}) catch error.HandlerFailed;
}

/// A full KataGo search report for the position (v2, synchronous: blocks
/// the UI thread for the whole search; the page uses the async command
/// when the host has it). Same request shape as katagoMove; the reply
/// carries KataGo's final `info` line and its chosen move, unparsed.
fn katagoAnalyze(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const b64 = jsonStringField(invocation.request.payload, "b64") orelse return error.InvalidRequest;
    const color_raw = jsonStringField(invocation.request.payload, "color") orelse return error.InvalidRequest;
    var color_buf: [8]u8 = undefined;
    const color = jsonUnescape(color_raw, &color_buf) orelse return error.InvalidRequest;

    var script_buf: [96 * 1024]u8 = undefined;
    const dec = std.base64.standard.Decoder;
    const script_len = dec.calcSizeForSlice(b64) catch return error.InvalidRequest;
    if (script_len > script_buf.len) return error.InvalidRequest;
    dec.decode(script_buf[0..script_len], b64) catch return error.InvalidRequest;

    _ = cancelJobs(self, null);
    self.katago.lockExclusive();
    defer self.katago.unlockExclusive();
    const result = self.katago.standard().analyze(script_buf[0..script_len], color) catch |err| switch (err) {
        error.InvalidRequest => return error.InvalidRequest,
        else => return error.HandlerFailed,
    };
    var n: usize = 0;
    if (!jsonAppend(output, &n, "{\"ok\":true,\"play\":")) return error.HandlerFailed;
    if (!jsonAppendString(output, &n, result.play)) return error.HandlerFailed;
    if (!jsonAppend(output, &n, ",\"info\":")) return error.HandlerFailed;
    if (!jsonAppendString(output, &n, result.info)) return error.HandlerFailed;
    if (!jsonAppend(output, &n, "}")) return error.HandlerFailed;
    return output[0..n];
}

/// Engine presence and version are resolved once in `main`, before the
/// worker thread exists: resolving touches the engine's path buffers,
/// which the worker uses while it starts KataGo.
fn katagoStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    var n: usize = 0;
    if (!jsonAppend(output, &n, if (self.katago_available) "{\"available\":true" else "{\"available\":false")) return error.HandlerFailed;
    if (!jsonAppend(output, &n, ",\"engine\":\"KataGo\",\"analyze\":true,\"async\":true,\"stream\":true,\"cancel\":true,\"incremental\":true,\"models\":true,\"version\":")) return error.HandlerFailed;
    if (!jsonAppendString(output, &n, self.katago_version)) return error.HandlerFailed;
    if (!jsonAppend(output, &n, "}")) return error.HandlerFailed;
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
    if (p.id.len > job.id.len) return error.InvalidRequest;
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
            ok = jsonAppend(buf, &n, "{\"ok\":true,\"id\":") and
                jsonAppendString(buf, &n, job.idText()) and
                jsonAppend(buf, &n, ",\"engine\":") and
                jsonAppendString(buf, &n, @tagName(job.slot)) and
                jsonAppend(buf, &n, ",\"play\":") and
                jsonAppendString(buf, &n, r.play()) and
                jsonAppend(buf, &n, ",\"info\":") and
                jsonAppendString(buf, &n, info);
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
            ok = jsonAppend(buf, &n, "{\"ok\":false,\"id\":") and
                jsonAppendString(buf, &n, job.idText()) and
                jsonAppend(buf, &n, ",\"cancelled\":true}");
        },
        .failed => {
            ok = jsonAppend(buf, &n, "{\"ok\":false,\"id\":") and
                jsonAppendString(buf, &n, job.idText()) and
                jsonAppend(buf, &n, ",\"error\":") and
                jsonAppendString(buf, &n, if (error_name.len > 0) error_name else "HandlerFailed") and
                jsonAppend(buf, &n, "}");
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

/// `studio.katagoAnalyzeAsync`: queue a search and return immediately; the
/// reply comes from `drainKatago` once the worker has a result.
fn katagoAnalyzeAsync(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    var job = Job{ .active = true, .responder = responder, .window_id = invocation.source.window_id };
    const rid = invocation.request.id;
    const rid_len = @min(rid.len, job.bridge_id.len);
    @memcpy(job.bridge_id[0..rid_len], rid[0..rid_len]);
    job.bridge_id_len = rid_len;

    const req = self.request_scratch;
    req.seq = 0;
    req.position.setup_len = 0;
    req.position.moves_len = 0;
    parseAnalyzeRequest(self, invocation.request.payload, req, &job) catch {
        respondJob(&job, .failed, "InvalidRequest", null);
        return;
    };
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

/// `studio.katagoCancel` {id}: stop that request (every open one without
/// an id). The cancelled request itself replies {ok:false, cancelled:true}.
fn katagoCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    var id_buf: [64]u8 = undefined;
    const id: ?[]const u8 = if (jsonStringField(invocation.request.payload, "id")) |raw| jsonUnescape(raw, &id_buf) else null;
    // A queued request is answered right here; the running one as soon as
    // KataGo stops (the worker wakes the loop).
    const count = cancelJobs(self, if (id) |value| (if (value.len > 0) value else null) else null);
    return std.fmt.bufPrint(output, "{{\"ok\":true,\"cancelled\":{d}}}", .{count}) catch error.HandlerFailed;
}

fn emitInfo(runtime: *native_sdk.Runtime, job: *const Job, info: []const u8) void {
    const buf = engine_mod.result_allocator.alloc(u8, info.len * 2 + 192) catch return;
    defer engine_mod.result_allocator.free(buf);
    var n: usize = 0;
    const ok = jsonAppend(buf, &n, "{\"id\":") and
        jsonAppendString(buf, &n, job.idText()) and
        jsonAppend(buf, &n, ",\"info\":") and
        jsonAppendString(buf, &n, info) and
        jsonAppend(buf, &n, "}");
    if (!ok) return;
    runtime.emitWindowEvent(job.window_id, "katago:info", buf[0..n]) catch {};
}

/// Collect what the worker produced: the latest partial report (as a
/// `katago:info` window event) first, then finished results (as replies to
/// the waiting `studio.katagoAnalyzeAsync` calls). UI thread.
fn drainKatago(self: *App) void {
    const runtime = self.runtime orelse return;
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
        const job = findJob(self, result.seq) orelse continue;
        const outcome: engine_mod.Outcome = if (job.cancelled) .cancelled else result.outcome;
        respondJob(job, outcome, result.error_name, result);
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
    const gen = self.updater.start() catch |err| {
        const reply = if (err == error.Busy) "{\"ok\":false,\"error\":\"Busy\"}" else "{\"ok\":false,\"error\":\"Unavailable\"}";
        responder.success(rid, reply) catch {};
        return;
    };
    const rid_len = @min(rid.len, self.update_bridge_id.len);
    @memcpy(self.update_bridge_id[0..rid_len], rid[0..rid_len]);
    self.update_bridge_id_len = rid_len;
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
/// error, canInstall, blocked, justUpdated, installFailed}`; phase is one of
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

/// `studio.updateDownload` {tag}: download this platform's package of
/// release `tag` and SHA256SUMS from the fixed GitHub release-download
/// address, verify and unpack it. Answered when done: `{ok:true,
/// phase:"ready", tag, asset}` or `{ok:false, error}` with error one of
/// Busy, BadTag, Unsupported, NotPackaged, Translocated, ReadOnlyLocation,
/// NoTempDir, Network, BadRedirect, HttpStatus, NoAsset, TooLarge,
/// NoChecksum, ChecksumMismatch, Unpack, BadPackage, Disk, Stalled,
/// Cancelled, OutOfMemory, Unavailable.
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
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_mod.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
        return;
    }
    const root = stagingRoot(self) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NoTempDir\"}") catch {};
        return;
    };
    installWakeUp(self);
    const gen = self.installer.start(root, parsed.value.tag, nowMs(self)) catch |err| {
        responder.success(rid, install_mod.errorReply(&reply_buf, install_mod.errorName(err))) catch {};
        return;
    };
    const rid_len = @min(rid.len, self.install_bridge_id.len);
    @memcpy(self.install_bridge_id[0..rid_len], rid[0..rid_len]);
    self.install_bridge_id_len = rid_len;
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

/// Answer the open download once its thread is done; abandon it if no
/// byte arrived for `install_mod.stall_timeout_ms`. UI thread.
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
/// embedded helper (src/updater/), answers `{ok:true, phase:"installing"}`
/// and quits the app; the helper swaps the installation, starts the new
/// version and rolls back if it does not come up. `{ok:false, error}`:
/// NotReady, Unsupported, NotPackaged, Translocated, ReadOnlyLocation,
/// NoTempDir, Helper, QuitFailed.
fn updateApply(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
    const self: *App = @ptrCast(@alignCast(context));
    const rid = invocation.request.id;
    var reply_buf: [256]u8 = undefined;
    var staged_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const staged = self.installer.stagedPath(&staged_buf) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NotReady\"}") catch {};
        return;
    };
    const target = installTarget(self, true);
    if (target.blocked != .none) {
        responder.success(rid, install_mod.errorReply(&reply_buf, @tagName(target.blocked))) catch {};
        return;
    }
    const root = stagingRoot(self) orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"NoTempDir\"}") catch {};
        return;
    };
    const runtime = self.runtime orelse {
        responder.success(rid, "{\"ok\":false,\"error\":\"QuitFailed\"}") catch {};
        return;
    };
    self.installer.markInstalling();
    if (install_mod.startHelper(self.io, self.env_map, root, target.root(), staged)) |err_name| {
        self.installer.markApplyFailed(err_name);
        responder.success(rid, install_mod.errorReply(&reply_buf, err_name)) catch {};
        return;
    }
    responder.success(rid, "{\"ok\":true,\"phase\":\"installing\"}") catch {};
    // The helper waits for this process to exit (KataGo stops on the way).
    runtime.quitApp() catch {
        // It keeps waiting; quitting by hand still finishes the update.
        self.installer.markApplyFailed("QuitFailed");
    };
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
    if (!jsonAppend(output, &n, if (ok) "{\"ok\":true" else "{\"ok\":false")) return error.HandlerFailed;
    if (error_name.len > 0) {
        if (!jsonAppend(output, &n, ",\"error\":")) return error.HandlerFailed;
        if (!jsonAppendString(output, &n, error_name)) return error.HandlerFailed;
    }
    if (!jsonAppend(output, &n, ",\"models\":")) return error.HandlerFailed;
    const status = models_mod.statusJson(self.models, output[n..]) orelse return error.HandlerFailed;
    n += status.len;
    if (!jsonAppend(output, &n, "}")) return error.HandlerFailed;
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

/// `<app data>/models`, or GOBAN_MODELS_DIR (self-test, development).
fn resolveModelsDir(env_map: *std.process.Environ.Map, out: []u8) []const u8 {
    if (env_map.get("GOBAN_MODELS_DIR")) |dir| {
        if (dir.len > 0 and dir.len <= out.len and std.fs.path.isAbsolute(dir)) {
            @memcpy(out[0..dir.len], dir);
            return out[0..dir.len];
        }
    }
    var data_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data = native_sdk.app_dirs.resolveOne(
        .{ .name = bundle_id },
        native_sdk.app_dirs.currentPlatform(),
        native_sdk.debug.envFromMap(env_map),
        .data,
        &data_buf,
    ) catch return "";
    return std.fmt.bufPrint(out, "{s}{c}models", .{ data, std.fs.path.sep }) catch "";
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
/// on read; a path never opens twice.
fn takeOpenFiles(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    var n: usize = 0;
    if (!jsonAppend(output, &n, "{\"paths\":[")) return error.HandlerFailed;
    var count: usize = 0;
    for (self.open_paths.items) |path| {
        if (count > 0 and !jsonAppend(output, &n, ",")) return error.HandlerFailed;
        if (!jsonAppendString(output, &n, path)) return error.HandlerFailed;
        count += 1;
    }
    if (!jsonAppend(output, &n, "]}")) return error.HandlerFailed;
    for (self.open_paths.items) |path| self.allocator.free(path);
    self.open_paths.clearRetainingCapacity();
    return output[0..n];
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
        if (!jsonAppend(output, &n, "{\"enabled\":false")) return error.HandlerFailed;
    } else {
        if (!jsonAppend(output, &n, "{\"enabled\":true,\"path\":")) return error.HandlerFailed;
        if (!jsonAppendString(output, &n, path)) return error.HandlerFailed;
    }
    // v5: also exercise the optional downloads (GOBAN_MODELS_DIR should
    // point at an empty temporary folder).
    const models = self.env_map.get("GOBAN_SELFTEST_MODELS") orelse "";
    if (path.len > 0 and std.mem.eql(u8, models, "1")) {
        if (!jsonAppend(output, &n, ",\"models\":true")) return error.HandlerFailed;
    }
    if (tour.len > 0) {
        if (!jsonAppend(output, &n, ",\"tour\":")) return error.HandlerFailed;
        if (!jsonAppendString(output, &n, tour)) return error.HandlerFailed;
    }
    // v5: GOBAN_UPDATE_PROBE_OUT asks the page for the updater probe
    // (selftest.js; scripts/test-updater.mjs), GOBAN_UPDATE_PROBE_TAG for a
    // real download of that release. The download address is still built
    // and checked by install.zig; the tag is only a tag.
    const probe = self.env_map.get("GOBAN_UPDATE_PROBE_OUT") orelse "";
    if (probe.len > 0) {
        if (!jsonAppend(output, &n, ",\"updateProbe\":")) return error.HandlerFailed;
        if (!jsonAppendString(output, &n, probe)) return error.HandlerFailed;
        const probe_tag = self.env_map.get("GOBAN_UPDATE_PROBE_TAG") orelse "";
        if (install_mod.validTag(probe_tag)) {
            if (!jsonAppend(output, &n, ",\"updateProbeTag\":")) return error.HandlerFailed;
            if (!jsonAppendString(output, &n, probe_tag)) return error.HandlerFailed;
        }
    }
    if (!jsonAppend(output, &n, "}")) return error.HandlerFailed;
    return output[0..n];
}

fn macOpenCallback(context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void {
    const self: *App = @ptrCast(@alignCast(context orelse return));
    self.queueOpenPath(std.mem.span(path));
}

fn installPlatformOpenHandler(self: *App) void {
    if (comptime builtin.os.tag == .macos) {
        goban_install_open_handler(self, macOpenCallback);
    }
}

const bundle_id = "dev.hxddh.gobanstudio";

pub fn main(init: std.process.Init) !void {
    var app_state = App{ .env_map = init.environ_map, .io = init.io, .allocator = init.gpa };
    defer app_state.deinit();
    // Optional networks (v5). Not freed at exit: a download thread may
    // still be running.
    var models_dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const models = try std.heap.page_allocator.create(models_mod.Manager);
    models.init(init.io, resolveModelsDir(init.environ_map, &models_dir_buf));
    app_state.models = models;
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
    app_state.updater = updater;
    // Not freed at exit either: a download thread may still be finishing.
    const installer = try std.heap.page_allocator.create(install_mod.Installer);
    installer.init(init.io);
    app_state.installer = installer;
    app_state.resolveFrontendDist();
    app_state.queueLaunchArgs(init.minimal.args);
    installPlatformOpenHandler(&app_state);
    try runner.runWithOptions(app_state.app(), .{
        .app_name = "Goban Studio",
        .window_title = "Goban Studio",
        .bundle_id = bundle_id,
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
    std.testing.refAllDecls(update_mod);
    std.testing.refAllDecls(install_mod);
    std.testing.refAllDecls(models_mod);
}

test "production source uses frontend assets" {
    const source = native_sdk.frontend.productionSource(.{ .dist = "frontend/dist" });
    try std.testing.expectEqual(native_sdk.WebViewSourceKind.assets, source.kind);
    try std.testing.expectEqualStrings("frontend/dist", source.asset_options.?.root_path);
}

test "jsonUnescape windows path" {
    var buf: [64]u8 = undefined;
    // JSON payload slice for "C:\\Users\\x" (two backslash chars per separator)
    const raw = "C:\\\\Users\\\\x";
    const got = jsonUnescape(raw, &buf) orelse return error.TestUnexpectedResult;
    try std.testing.expectEqualStrings("C:\\Users\\x", got);
}

test "jsonUnescape plain path unchanged" {
    var buf: [64]u8 = undefined;
    const got = jsonUnescape("/tmp/goban-studio.sgf", &buf) orelse return error.TestUnexpectedResult;
    try std.testing.expectEqualStrings("/tmp/goban-studio.sgf", got);
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
