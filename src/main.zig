//! Goban Studio's native shell: start-up and the run loop.
//!
//! `main` sets up the one `App` (shell.zig) and hands it to the Native SDK
//! runner. The rest lives by concern:
//!
//!   commands.zig       the bridge command table and the origins allowed to call it
//!   events.zig         platform events: timers, menu commands, opened files
//!   lifecycle.zig      one instance per data directory; the quit gate
//!   bridge_files.zig   the player's files, the store, the self-test reports
//!   bridge_window.zig  window drag, title-bar geometry, colour scheme, menus
//!   bridge_katago.zig  KataGo searches and human-policy statistics (engine*.zig)
//!   bridge_update.zig  the update check, download and install (update.zig, install*.zig)
//!   bridge_models.zig  the optional networks (models.zig)
const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const engine_request = @import("engine_request.zig");
const engine_worker = @import("engine_worker.zig");
const update_mod = @import("update.zig");
const install_mod = @import("install.zig");
const install_verify = @import("install_verify.zig");
const models_mod = @import("models.zig");
const store_mod = @import("store.zig");
const files_mod = @import("files.zig");
const win_close = @import("win_close.zig");
const json = @import("json.zig");
const paths_mod = @import("paths.zig");
const instance_mod = @import("instance.zig");
const net_mod = @import("net.zig");
const app_options = @import("app_options");
const bridge_files = @import("bridge_files.zig");
const bridge_katago = @import("bridge_katago.zig");
const bridge_models = @import("bridge_models.zig");
const bridge_update = @import("bridge_update.zig");
const bridge_window = @import("bridge_window.zig");
const commands = @import("commands.zig");
const events = @import("events.zig");
const lifecycle = @import("lifecycle.zig");
const shell = @import("shell.zig");
const App = shell.App;

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

/// The update key compiled in with `-Dupdate-pubkey` (docs/signing.md), or
/// null. A malformed key is a compile error, never a silently unsigned app.
const update_public_key = install_verify.parsePublicKey(app_options.update_pubkey) catch
    @compileError("-Dupdate-pubkey must be the base64 of a 32-byte Ed25519 public key");

fn macOpenCallback(context: ?*anyopaque, path: [*:0]const u8) callconv(.c) void {
    const self: *App = @ptrCast(@alignCast(context orelse return));
    self.queueOpenPath(std.mem.span(path));
}

fn installPlatformOpenHandler(self: *App) void {
    if (comptime builtin.os.tag == .macos) {
        shell.goban_install_open_handler(self, macOpenCallback);
        shell.goban_install_quit_handler(self, lifecycle.macQuitCallback);
    }
}

pub fn main(init: std.process.Init) !void {
    var app_state = App{ .env_map = init.environ_map, .io = init.io, .allocator = init.gpa };
    app_state.grants = files_mod.Grants.init(init.gpa);
    defer app_state.deinit();
    bridge_files.grantReportFiles(&app_state);
    // One process per data directory: a second launch hands its files to
    // the first and ends here, before anything is read or written.
    var data_dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const data_dir = paths_mod.dataDir(init.environ_map, &data_dir_buf);
    if (!lifecycle.claimInstance(&app_state, init, data_dir)) return;
    // Optional networks (models.zig). Not freed at exit: a download thread may
    // still be running.
    var models_dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const models = try std.heap.page_allocator.create(models_mod.Manager);
    models.init(init.io, paths_mod.modelsDir(init.environ_map, &models_dir_buf));
    // Downloads and the update check use the proxy the environment or the
    // system names (net.zig).
    models.env = init.environ_map;
    app_state.models = models;
    // File storage: the page's settings, profile and games (store.zig).
    app_state.store.init(init.io, data_dir);
    var strong_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    var human_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const strong_model = models.modelPath(.strong, &strong_buf) orelse "";
    const human_model = models.modelPath(.human, &human_buf) orelse "";
    // Not freed at exit: the detached worker thread may still be unwinding.
    const katago = try std.heap.page_allocator.create(engine_worker.Worker);
    katago.init(init.io, init.environ_map, strong_model, human_model);
    defer katago.shutdown();
    app_state.katago = katago;
    app_state.request_scratch = try std.heap.page_allocator.create(engine_request.Request);
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
        if (install_verify.validTag(probe_tag)) {
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
            .navigation = .{ .allowed_origins = &commands.allowed_origins },
        },
    }, init);
}

test {
    std.testing.refAllDecls(engine_mod);
    std.testing.refAllDecls(@import("engine_request.zig"));
    std.testing.refAllDecls(@import("engine_worker.zig"));
    std.testing.refAllDecls(@import("engine_build.zig"));
    std.testing.refAllDecls(update_mod);
    std.testing.refAllDecls(install_mod);
    std.testing.refAllDecls(@import("install_verify.zig"));
    std.testing.refAllDecls(@import("install_package.zig"));
    std.testing.refAllDecls(@import("install_apply.zig"));
    std.testing.refAllDecls(models_mod);
    std.testing.refAllDecls(store_mod);
    std.testing.refAllDecls(@import("durable.zig"));
    std.testing.refAllDecls(files_mod);
    std.testing.refAllDecls(win_close);
    std.testing.refAllDecls(json);
    std.testing.refAllDecls(paths_mod);
    std.testing.refAllDecls(instance_mod);
    std.testing.refAllDecls(net_mod);
    _ = bridge_files;
    _ = bridge_katago;
    _ = bridge_models;
    _ = bridge_update;
    _ = bridge_window;
    _ = commands;
    _ = events;
    _ = lifecycle;
    _ = shell;
}

test "production source uses frontend assets" {
    const source = native_sdk.frontend.productionSource(.{ .dist = "frontend/dist" });
    try std.testing.expectEqual(native_sdk.WebViewSourceKind.assets, source.kind);
    try std.testing.expectEqualStrings("frontend/dist", source.asset_options.?.root_path);
}
