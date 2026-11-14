//! Bridge commands for KataGo (engine.zig): status, async searches, the
//! human-policy statistics and cancelling, and the drain that answers them.
const std = @import("std");
const native_sdk = @import("native_sdk");
const engine_mod = @import("engine.zig");
const engine_request = @import("engine_request.zig");
const engine_worker = @import("engine_worker.zig");
const models_mod = @import("models.zig");
const json = @import("json.zig");
const bridge_update = @import("bridge_update.zig");
const shell = @import("shell.zig");
const App = shell.App;
const Job = shell.Job;

/// Engine presence and version are resolved once in `main`, before the
/// worker thread exists: resolving touches the engine's path buffers,
/// which the worker uses while it starts KataGo.
pub fn katagoStatus(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const self: *App = @ptrCast(@alignCast(context));
    var n: usize = 0;
    if (!json.append(output, &n, if (self.katago_available) "{\"available\":true" else "{\"available\":false")) return error.HandlerFailed;
    if (!json.append(output, &n, ",\"engine\":\"KataGo\",\"analyze\":true,\"async\":true,\"stream\":true,\"cancel\":true,\"incremental\":true,\"models\":true,\"version\":")) return error.HandlerFailed;
    if (!json.appendString(output, &n, self.katago_version)) return error.HandlerFailed;
    // `studio.katagoHumanPolicy` needs the human SL model.
    const human = self.katago_available and self.models.isReady(.human);
    if (!json.append(output, &n, if (human) ",\"humanPolicy\":true}" else ",\"humanPolicy\":false}")) return error.HandlerFailed;
    return output[0..n];
}

// ------------------------------------------------------------ async KataGo
//
// Threading: bridge handlers, `drainKatago` and every runtime/webview call
// run on the UI thread. The worker thread (engine_worker.zig) only talks to KataGo
// and to its own locked queues, then nudges the UI loop with the platform's
// thread-safe `wake`; the `.effects_wake` event (plus a 50 ms fallback
// timer while requests are open) runs `drainKatago` here, which emits the
// partial reports and completes the stored AsyncResponders.

const AnalyzePayload = struct {
    id: []const u8 = "",
    size: u32 = 19,
    komi: f64 = 6.5,
    /// "japanese" | "chinese" | "korean". Without the field (a page that
    /// knew only one ruleset), Japanese.
    rules: []const u8 = "japanese",
    setup: []const u8 = "",
    moves: []const u8 = "",
    color: []const u8 = "B",
    visits: u32 = 64,
    maxTime: f64 = 6.0,
    stream: bool = false,
    /// "standard" (default), "strong" or "human".
    engine: []const u8 = "standard",
    /// Human engine only: a KataGo human SL profile ("rank_12k").
    profile: []const u8 = "",
    /// Human engine only: "raw" or "search".
    humanStyle: []const u8 = "raw",
};

fn parseAnalyzeRequest(self: *App, payload: []const u8, req: *engine_request.Request, job: *Job) !void {
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
    req.position.rules = engine_request.Rules.parse(p.rules) orelse return error.InvalidRequest;
    req.position.setup_len = try engine_request.parseMoves(p.setup, size, false, &req.position.setup);
    req.position.moves_len = try engine_request.parseMoves(p.moves, size, true, &req.position.moves);
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
    runtime.options.platform.services.startTimer(shell.katago_timer_id, shell.katago_timer_interval_ns, true) catch return;
    self.timer_running = true;
}

fn stopDrainTimer(self: *App) void {
    if (!self.timer_running) return;
    const runtime = self.runtime orelse return;
    runtime.options.platform.services.cancelTimer(shell.katago_timer_id) catch {};
    self.timer_running = false;
}

/// Complete a job's bridge call. Replies are always bridge successes; the
/// page reads `ok` / `cancelled` / `error` from the object.
fn respondJob(job: *Job, outcome: engine_request.Outcome, error_name: []const u8, result: ?*const engine_request.Result) void {
    const info: []const u8 = if (result) |r| (r.info orelse "") else "";
    const cap = info.len * 2 + 512;
    if (outcome == .ok and job.kind == .human_policy) {
        if (result) |r| if (r.policy) |rows| return respondPolicy(job, rows);
    }
    const buf = engine_request.result_allocator.alloc(u8, cap) catch {
        job.responder.success(job.bridge_id[0..job.bridge_id_len], "{\"ok\":false,\"error\":\"OutOfMemory\"}") catch {};
        job.active = false;
        return;
    };
    defer engine_request.result_allocator.free(buf);
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
pub fn cancelJobs(self: *App, id: ?[]const u8) usize {
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
pub fn keepBridgeId(rid: []const u8, out: *[native_sdk.bridge.max_id_bytes]u8, len: *usize, responder: native_sdk.bridge.AsyncResponder) bool {
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
pub fn katagoAnalyzeAsync(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
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
    submitJob(self, &job, req, engine_worker.deadlineMs(req.max_time, true) + engine_worker.warm_grace_ms);
}

/// Queue a parsed request for the worker and keep its job. Answers at once
/// when it cannot run. `budget_ms` is the job's backstop.
fn submitJob(self: *App, job_in: *Job, req: *engine_request.Request, budget_ms: i64) void {
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
    job.deadline_ms = bridge_update.nowMs(self) + budget_ms;
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
// docs/strength.md "your moves": how likely a player of each rank
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
fn parsePolicyRequest(allocator: std.mem.Allocator, payload: []const u8, req: *engine_request.Request, job: *Job) !void {
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
    if (p.profiles.len == 0 or p.profiles.len > engine_request.max_policy_profiles) return error.InvalidRequest;
    const size: u8 = @intCast(p.size);
    req.* = .{ .kind = .human_policy, .slot = .human, .visits = 1, .max_time = 1, .color = p.color[0] };
    req.position.size = size;
    req.position.komi = p.komi;
    req.position.rules = engine_request.Rules.parse(p.rules) orelse return error.InvalidRequest;
    req.position.setup_len = try engine_request.parseMoves(p.setup, size, false, &req.position.setup);
    req.position.moves_len = try engine_request.parseMoves(p.moves, size, true, &req.position.moves);
    for (p.profiles, 0..) |profile, k| {
        if (!engine_mod.validProfile(profile)) return error.InvalidRequest;
        @memcpy(req.policy_profiles[k][0..profile.len], profile);
        req.policy_profile_lens[k] = @intCast(profile.len);
    }
    req.policy_profiles_len = p.profiles.len;
    req.policy_from = p.from;
    req.policy_max_positions = @min(engine_request.max_policy_positions, engine_request.max_policy_evals / p.profiles.len);
    job.slot = .human;
    job.kind = .human_policy;
    job.stream = false;
}

/// How many positions a parsed policy request will score.
fn policyPositions(req: *const engine_request.Request) usize {
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
pub fn katagoHumanPolicy(context: *anyopaque, invocation: native_sdk.bridge.Invocation, responder: native_sdk.bridge.AsyncResponder) anyerror!void {
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
        const rows = engine_request.result_allocator.create(engine_request.PolicyRows) catch {
            respondJob(&job, .failed, "OutOfMemory", null);
            return;
        };
        defer engine_request.result_allocator.destroy(rows);
        rows.* = .{ .profiles = req.policy_profiles_len };
        respondPolicy(&job, rows);
        return;
    }
    const evals: i64 = @intCast(positions * req.policy_profiles_len);
    submitJob(self, &job, req, engine_worker.cold_grace_ms + engine_worker.warm_grace_ms + evals * 5_000);
}

/// `{ok:true, id, engine:"human", moves:[{index, p:{…}}], truncated}`.
fn policyReply(buf: []u8, id: []const u8, rows: *const engine_request.PolicyRows) ?[]const u8 {
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

fn respondPolicy(job: *Job, rows: *const engine_request.PolicyRows) void {
    const cap = 256 + rows.count * (32 + rows.profiles * 40);
    const id = job.bridge_id[0..job.bridge_id_len];
    const buf = engine_request.result_allocator.alloc(u8, cap) catch {
        job.responder.success(id, "{\"ok\":false,\"error\":\"OutOfMemory\"}") catch {};
        job.active = false;
        return;
    };
    defer engine_request.result_allocator.free(buf);
    const body = policyReply(buf, job.idText(), rows) orelse "{\"ok\":false,\"error\":\"ResponseTooLarge\"}";
    job.responder.success(id, body) catch {};
    job.active = false;
}

const CancelPayload = struct {
    id: ?[]const u8 = null,
};

/// `studio.katagoCancel` {id}: stop that request; `{}` (no id at all)
/// stops every open one. The cancelled request itself replies
/// {ok:false, cancelled:true}. An id that is present but not a valid
/// request id (empty, too long, odd characters) is an `InvalidRequest`,
/// never "cancel everything".
pub fn katagoCancel(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
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
    const buf = engine_request.result_allocator.alloc(u8, info.len * 2 + 192) catch return;
    defer engine_request.result_allocator.free(buf);
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
pub fn drainKatago(self: *App) void {
    const runtime = self.runtime orelse return;
    const now = bridge_update.nowMs(self);
    // The watchdog: a KataGo past its request's deadline is killed; the
    // worker then reports the request failed (`Timeout`) below.
    _ = self.katago.checkDeadline(now);
    if (self.katago.takeStream()) |partial| {
        defer engine_request.result_allocator.free(partial.info);
        if (findJob(self, partial.seq)) |job| {
            if (!job.cancelled and job.stream) emitInfo(runtime, job, partial.info);
        }
    }
    var results: [16]engine_request.Result = undefined;
    const n = self.katago.takeResults(&results);
    for (results[0..n]) |*result| {
        defer if (result.info) |info| engine_request.result_allocator.free(info);
        defer if (result.policy) |rows| engine_request.result_allocator.destroy(rows);
        const job = findJob(self, result.seq) orelse continue;
        const outcome: engine_request.Outcome = if (job.cancelled) .cancelled else result.outcome;
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

test "analyze payload rules default to japanese and accept only the three presets" {
    const cases = [_]struct { json: []const u8, want: ?engine_request.Rules }{
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
        try std.testing.expectEqual(c.want, engine_request.Rules.parse(parsed.value.rules));
    }
}

test "request ids are checked, not cut" {
    try std.testing.expect(validRequestId("k1"));
    try std.testing.expect(validRequestId("k" ++ "9" ** 63));
    try std.testing.expect(!validRequestId(""));
    try std.testing.expect(!validRequestId("k" ++ "9" ** 64));
    try std.testing.expect(!validRequestId("k1\"}"));
    try std.testing.expect(!validRequestId("k 1"));
}

test "human policy requests are validated and bounded" {
    const a = std.testing.allocator;
    const req = try a.create(engine_request.Request);
    defer a.destroy(req);
    var job = Job{};
    try parsePolicyRequest(a, "{\"size\":9,\"komi\":6.5,\"rules\":\"chinese\",\"moves\":\"B E5 W C3 B G7 W pass B D4\",\"color\":\"B\",\"profiles\":[\"rank_20k\",\"rank_3d\"]}", req, &job);
    try std.testing.expectEqual(engine_request.Kind.human_policy, req.kind);
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
    try std.testing.expectEqual(@min(engine_request.max_policy_positions, engine_request.max_policy_evals / 7), req.policy_max_positions);
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
    const rows = try std.testing.allocator.create(engine_request.PolicyRows);
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
    rows.p[engine_request.max_policy_profiles] = 0;
    rows.p[engine_request.max_policy_profiles + 1] = 1;
    var buf: [512]u8 = undefined;
    const got = policyReply(&buf, "p7", rows).?;
    try std.testing.expectEqualStrings("{\"ok\":true,\"id\":\"p7\",\"engine\":\"human\",\"moves\":[{\"index\":10,\"p\":{\"rank_20k\":0.250000,\"rank_3d\":0.500000}},{\"index\":12,\"p\":{\"rank_20k\":0.000000,\"rank_3d\":1.000000}}],\"truncated\":false}", got);
    const parsed = try std.json.parseFromSlice(std.json.Value, std.testing.allocator, got, .{});
    parsed.deinit();
    var small: [40]u8 = undefined;
    try std.testing.expect(policyReply(&small, "p7", rows) == null);
}
