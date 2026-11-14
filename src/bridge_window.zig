//! Bridge commands for the window: dragging and the title-bar geometry of
//! the hidden title bar, the frame's colour scheme, and the page's menus.
const std = @import("std");
const builtin = @import("builtin");
const native_sdk = @import("native_sdk");
const shell = @import("shell.zig");
const App = shell.App;

/// 隐藏标题栏(macOS hidden_inset_tall)下,前端顶栏的空白处就是标题栏:mousedown 时
/// 网页调这里,平台拿当前这次按下交给 performWindowDragWithEvent —— 真移动了才拖,
/// 双击照系统偏好缩放。标准标题栏的窗口与 Windows 上调了也只是什么都不做。
pub fn windowDrag(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const runtime = self.runtime orelse return error.HandlerFailed;
    runtime.options.platform.services.startWindowDrag(invocation.source.window_id) catch {};
    return std.fmt.bufPrint(output, "true", .{}) catch "true";
}

/// 红绿灯与标题栏带在内容上压了多少:顶栏据此加高、左边让位。标准标题栏、全屏、
/// Windows 一律回 0,网页就按原样排。
pub fn windowChrome(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
pub fn windowTheme(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
fn buildMenus(store: *shell.MenuStore, spec: []const MenuSpec) ![]const native_sdk.Menu {
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
pub fn setMenus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
