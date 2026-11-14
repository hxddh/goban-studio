//! Bridge commands for the optional KataGo networks (models.zig).
const std = @import("std");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const models_mod = @import("models.zig");
const json = @import("json.zig");
const bridge_katago = @import("bridge_katago.zig");
const shell = @import("shell.zig");
const App = shell.App;

// ------------------------------------------------------------ models
//
// Optional networks. The page names a kind, never an address: the
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
pub fn modelStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
pub fn modelDownload(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    self.models.start(kind) catch |err| return modelReply(self, output, false, @errorName(err));
    return modelReply(self, output, true, "");
}

/// `studio.modelCancel` {kind}: stop a download (its partial file stays for
/// a later resume). `{ok, models}`; ok is false when nothing was running.
pub fn modelCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    const cancelled = self.models.cancel(kind);
    return modelReply(self, output, cancelled, "");
}

/// `studio.modelRemove` {kind}: stop the KataGo process that uses the
/// network, then delete the file and any partial download. `{ok, models}`.
pub fn modelRemove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const self: *App = @ptrCast(@alignCast(context));
    const kind = try modelKind(self, invocation.request.payload);
    _ = bridge_katago.cancelJobs(self, null);
    // The worker may be mid-search: never block the UI thread on it. The
    // page retries on Busy; the slot stops as soon as the search ends.
    if (!self.katago.stopSlot(modelSlot(kind))) return modelReply(self, output, false, "Busy");
    self.models.remove(kind) catch |err| return modelReply(self, output, false, @errorName(err));
    return modelReply(self, output, true, "");
}
