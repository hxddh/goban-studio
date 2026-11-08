//! Windows: let the page flush before the window closes (v13).
//!
//! The Native SDK's Windows host destroys the window on WM_CLOSE (close
//! button, Alt+F4, the taskbar's "Close window") and the app quits with it;
//! it offers no hook in between. So, once the page has announced its flush
//! hook (main.zig `studio.flushHook`), the host window is subclassed: a
//! WM_CLOSE from the user is held back, the page is asked to flush, and
//! `proceed` re-posts the close when it answered or its time ran out
//! (main.zig's quit gate never waits longer than `flush_timeout_ms`).
//!
//! Only the first top-level window of the SDK's own window class on the UI
//! thread is subclassed (the app has one window). Everything except that
//! one WM_CLOSE goes straight to the SDK's window procedure. Runtime-
//! initiated closes call DestroyWindow and never pass through here.
//!
//! On every other platform `install` does nothing and returns false.

const std = @import("std");
const builtin = @import("builtin");

/// Called on the UI thread for a user's WM_CLOSE. True: keep the window
/// for now (the caller will call `proceed`); false: close it at once.
pub const Callback = *const fn (context: *anyopaque) bool;

const is_windows = builtin.os.tag == .windows;

const win = if (is_windows) struct {
    const W = std.os.windows;
    const HWND = W.HWND;
    const LPARAM = isize;
    const WPARAM = usize;
    const LRESULT = isize;
    const BOOL = W.BOOL;
    const WNDPROC = *const fn (HWND, u32, WPARAM, LPARAM) callconv(.winapi) LRESULT;
    const WNDENUMPROC = *const fn (HWND, LPARAM) callconv(.winapi) BOOL;
    const GWLP_WNDPROC: c_int = -4;
    const WM_CLOSE: u32 = 0x0010;

    extern "user32" fn EnumThreadWindows(dwThreadId: u32, lpfn: WNDENUMPROC, lParam: LPARAM) callconv(.winapi) BOOL;
    extern "user32" fn GetClassNameW(hWnd: HWND, lpClassName: [*]u16, nMaxCount: c_int) callconv(.winapi) c_int;
    extern "user32" fn SetWindowLongPtrW(hWnd: HWND, nIndex: c_int, dwNewLong: isize) callconv(.winapi) isize;
    extern "user32" fn CallWindowProcW(lpPrevWndFunc: isize, hWnd: HWND, Msg: u32, wParam: WPARAM, lParam: LPARAM) callconv(.winapi) LRESULT;
    extern "user32" fn PostMessageW(hWnd: HWND, Msg: u32, wParam: WPARAM, lParam: LPARAM) callconv(.winapi) BOOL;
    extern "kernel32" fn GetCurrentThreadId() callconv(.winapi) u32;
} else struct {};

/// The SDK's top-level window class (webview2_host.cpp).
const host_class = std.unicode.utf8ToUtf16LeStringLiteral("NativeSdkWindowsHost");

// UI thread only.
var g_context: ?*anyopaque = null;
var g_callback: ?Callback = null;
var g_hwnd: if (is_windows) ?win.HWND else ?*anyopaque = null;
var g_original: isize = 0;
/// The next WM_CLOSE is ours (`proceed`): let it through.
var g_allow: bool = false;

/// Subclass the app's window. Returns true when it is in place.
pub fn install(context: *anyopaque, callback: Callback) bool {
    if (comptime !is_windows) return false;
    if (g_hwnd != null) return true;
    var found: ?win.HWND = null;
    _ = win.EnumThreadWindows(win.GetCurrentThreadId(), findHost, @bitCast(@intFromPtr(&found)));
    const hwnd = found orelse return false;
    g_context = context;
    g_callback = callback;
    const previous = win.SetWindowLongPtrW(hwnd, win.GWLP_WNDPROC, @bitCast(@intFromPtr(&windowProc)));
    if (previous == 0) return false;
    g_original = previous;
    g_hwnd = hwnd;
    return true;
}

/// Close the window for real (after the flush).
pub fn proceed() void {
    if (comptime !is_windows) return;
    const hwnd = g_hwnd orelse return;
    g_allow = true;
    if (win.PostMessageW(hwnd, win.WM_CLOSE, 0, 0) == .FALSE) g_allow = false;
}

const findHost = if (is_windows) struct {
    fn f(hwnd: win.HWND, lparam: win.LPARAM) callconv(.winapi) win.BOOL {
        const out: *?win.HWND = @ptrFromInt(@as(usize, @bitCast(lparam)));
        var name: [64]u16 = undefined;
        const n = win.GetClassNameW(hwnd, &name, name.len);
        if (n > 0 and std.mem.eql(u16, name[0..@intCast(n)], host_class)) {
            out.* = hwnd;
            return .FALSE; // stop enumerating
        }
        return .TRUE;
    }
}.f else undefined;

const windowProc = if (is_windows) struct {
    fn f(hwnd: win.HWND, msg: u32, wparam: win.WPARAM, lparam: win.LPARAM) callconv(.winapi) win.LRESULT {
        if (msg == win.WM_CLOSE) {
            if (g_allow) {
                g_allow = false;
            } else if (g_callback) |callback| {
                if (callback(g_context.?)) return 0;
            }
        }
        return win.CallWindowProcW(g_original, hwnd, msg, wparam, lparam);
    }
}.f else undefined;

test "install is a no-op away from Windows" {
    if (is_windows) return error.SkipZigTest;
    var dummy: u8 = 0;
    const cb = struct {
        fn f(_: *anyopaque) bool {
            return true;
        }
    }.f;
    try std.testing.expect(!install(&dummy, cb));
    proceed();
}
