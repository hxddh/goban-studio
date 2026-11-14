//! The KataGo worker: the thread that owns the GTP conversation with
//! every slot's process, brings it to the requested position, searches,
//! streams partial reports, and the watchdog deadline that ends a
//! request KataGo stopped answering. engine.zig has the overview.
const std = @import("std");
const builtin = @import("builtin");
const engine_mod = @import("engine.zig");
const engine_request = @import("engine_request.zig");

/// Minimum spacing of partial reports handed to the UI thread. KataGo is
/// asked for one every 200 ms (`interval 20`); this guards the UI against
/// bursts if reports queue up in the pipe.
const stream_min_gap_ms: i64 = 180;

/// A cross-thread nudge for the UI loop (PlatformServices.wake_fn).
pub const WakeFn = *const fn (context: ?*anyopaque) anyerror!void;

pub const CancelResult = enum { not_found, removed_pending, signalled_running };

/// How long a request may hold KataGo before the watchdog kills it.
/// KataGo stops a search at `maxTime` by itself; the grace covers setting
/// up the position (up to a few thousand GTP lines) and writing the
/// ownership report. A process that is not running yet must also start and
/// load its network first: the optional 40-block network on a slow CPU,
/// or a GPU backend tuning itself on first use, takes minutes, so the cold
/// budget is generous. Past either, something is wrong and waiting longer
/// only keeps the page (and every request queued behind it) stuck.
pub const warm_grace_ms: i64 = 20_000;
pub const cold_grace_ms: i64 = 240_000;

pub fn deadlineMs(max_time_s: f64, cold: bool) i64 {
    const t = if (std.math.isFinite(max_time_s) and max_time_s > 0) @min(max_time_s, 600) else 600;
    const search: i64 = @intFromFloat(t * 1000);
    return search + (if (cold) cold_grace_ms else warm_grace_ms);
}

/// The KataGo worker. Lives on the heap for the whole session.
///
/// Threads:
///   * UI thread: `submit`, `cancel`, `takeResults`, `takeStream`,
///     `checkDeadline` (the watchdog), `stopSlot`, `shutdown`.
///   * worker thread: `run` — the only code that talks to KataGo while an
///     async request is in flight.
///
/// `lock` guards the request/result state AND every write to KataGo's
/// stdin, so "is this search cancelled?" + "send the search command" on
/// the worker and "mark cancelled" + "send the cancel newline" on the UI
/// thread are each atomic: a cancel can never slip in between the check
/// and the search and be lost. `engine_lock` is held by whoever drives a
/// GTP exchange (the worker for a job; the UI thread only ever tries it,
/// in `stopSlot` and `shutdown`). The worker never waits for the UI thread
/// while holding either lock, and reaches it only through `wake_fn`
/// (documented thread-safe).
/// What one KataGo process has been told: owned by whoever holds
/// `engine_lock`.
const SlotState = struct {
    sent: engine_request.Position = .{},
    sent_valid: bool = false,
    sent_generation: u32 = 0,
    params_valid: bool = false,
    sent_visits: u32 = 0,
    sent_max_time: f64 = 0,
    human_valid: bool = false,
    sent_profile: [engine_mod.max_profile]u8 = undefined,
    sent_profile_len: usize = 0,
    sent_style: engine_mod.HumanStyle = .raw,

    fn invalidate(self: *SlotState) void {
        self.sent_valid = false;
        self.params_valid = false;
        self.human_valid = false;
    }
};

pub const Worker = struct {
    engines: [engine_mod.slot_count]engine_mod.Engine = [_]engine_mod.Engine{.{}} ** engine_mod.slot_count,
    /// Faster build or plain one, for every slot (engine_build.zig).
    build: engine_mod.BuildState = .{},
    io: std.Io = undefined,

    lock: std.Io.Mutex = .init,
    cond: std.Io.Condition = .init,
    engine_lock: std.Io.Mutex = .init,

    // --- guarded by `lock`
    started: bool = false,
    quit: bool = false,
    has_pending: bool = false,
    pending: engine_request.Request = .{},
    running_seq: u64 = 0,
    /// The process the running request talks to (cancel newline target).
    running_slot: engine_mod.Slot = .standard,
    cancel_seq: u64 = 0,
    results: [16]engine_request.Result = undefined,
    results_len: usize = 0,
    stream: ?engine_request.StreamInfo = null,
    /// Slots whose process must stop once the running request ends
    /// (`stopSlot` found the engine busy).
    stop_after: [engine_mod.slot_count]bool = [_]bool{false} ** engine_mod.slot_count,
    /// When the running request's process is killed (`checkDeadline`);
    /// 0 while the worker has not started on it yet.
    running_deadline_ms: i64 = 0,
    /// The request the watchdog killed: it fails with `Timeout`.
    timed_out_seq: u64 = 0,

    // --- set on the UI thread before the worker starts
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,

    // --- owned by whoever holds `engine_lock`
    current: engine_request.Request = .{},
    states: [engine_mod.slot_count]SlotState = [_]SlotState{.{}} ** engine_mod.slot_count,
    last_stream_ms: i64 = 0,
    /// The current request got as far as talking to KataGo.
    touched: bool = false,
    /// Human policy: the position being stepped through, and one
    /// `kata-raw-human-nn` report.
    policy_target: engine_request.Position = .{},
    block_buf: [64 * 1024]u8 = undefined,

    /// `strong_model` / `human_model`: absolute paths of the optional
    /// networks (they need not exist yet; empty disables the slot).
    pub fn init(self: *Worker, io: std.Io, env_map: *std.process.Environ.Map, strong_model: []const u8, human_model: []const u8) void {
        self.* = .{};
        self.io = io;
        self.build = engine_mod.BuildState.detect();
        for (&self.engines, 0..) |*engine, i| {
            engine.init(io, env_map);
            engine.write_lock = &self.lock;
            engine.build = &self.build;
            const slot: engine_mod.Slot = @enumFromInt(i);
            engine.setSlot(slot, switch (slot) {
                .standard => "",
                .strong => strong_model,
                .human => human_model,
            });
        }
    }

    /// The shipped engine (status, version).
    pub fn standard(self: *Worker) *engine_mod.Engine {
        return &self.engines[@intFromEnum(engine_mod.Slot.standard)];
    }

    pub fn setWake(self: *Worker, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    fn notify(self: *Worker) void {
        if (self.wake_fn) |f| f(self.wake_context) catch {};
    }

    /// Start the thread on first use. Caller holds `lock`.
    fn ensureStarted(self: *Worker) !void {
        if (self.started) return;
        const thread = try std.Thread.spawn(.{ .stack_size = 1024 * 1024 }, run, .{self});
        thread.detach();
        self.started = true;
    }

    /// Ask KataGo to stop the running search. Caller holds `lock`. A bare
    /// newline interrupts `kata-search_analyze_cancellable` and is ignored
    /// by KataGo's command loop at any other moment.
    fn signalCancelLocked(self: *Worker, seq: u64) void {
        self.cancel_seq = seq;
        self.engines[@intFromEnum(self.running_slot)].writeUnlocked("\n") catch {};
    }

    pub const Submitted = struct {
        /// A queued request that never started; reply "cancelled" for it.
        dropped_seq: u64 = 0,
        /// The running request that was told to stop; its result arrives
        /// as cancelled (or, if it finished in the same instant, ok).
        superseded_seq: u64 = 0,
    };

    /// Queue `req` (copied), superseding whatever is queued or running.
    /// UI thread.
    pub fn submit(self: *Worker, req: *const engine_request.Request) !Submitted {
        var out = Submitted{};
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        try self.ensureStarted();
        if (self.has_pending) out.dropped_seq = self.pending.seq;
        if (self.running_seq != 0 and self.cancel_seq != self.running_seq) {
            out.superseded_seq = self.running_seq;
            self.signalCancelLocked(self.running_seq);
        }
        self.pending = req.*;
        self.has_pending = true;
        self.cond.signal(self.io);
        return out;
    }

    /// Cancel one request. UI thread.
    pub fn cancel(self: *Worker, seq: u64) CancelResult {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.has_pending and self.pending.seq == seq) {
            self.has_pending = false;
            return .removed_pending;
        }
        if (self.running_seq == seq) {
            if (self.cancel_seq != seq) self.signalCancelLocked(seq);
            return .signalled_running;
        }
        return .not_found;
    }

    /// Hand finished results to the UI thread. UI thread.
    pub fn takeResults(self: *Worker, out: []engine_request.Result) usize {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const n = @min(out.len, self.results_len);
        @memcpy(out[0..n], self.results[0..n]);
        const rest = self.results_len - n;
        var i: usize = 0;
        while (i < rest) : (i += 1) self.results[i] = self.results[n + i];
        self.results_len = rest;
        return n;
    }

    /// The latest partial report, if any. UI thread.
    pub fn takeStream(self: *Worker) ?engine_request.StreamInfo {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        const value = self.stream;
        self.stream = null;
        return value;
    }

    /// The watchdog, from the UI thread's drain: if the running request is
    /// past its deadline, kill its KataGo process (the worker's read then
    /// fails and the request is answered `Timeout`). Returns the request's
    /// seq when it killed one. Never blocks on the worker.
    pub fn checkDeadline(self: *Worker, now_ms: i64) u64 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.running_seq == 0 or self.running_deadline_ms == 0) return 0;
        if (now_ms < self.running_deadline_ms) return 0;
        if (self.timed_out_seq == self.running_seq) return 0;
        self.timed_out_seq = self.running_seq;
        self.engines[@intFromEnum(self.running_slot)].killUnlocked();
        return self.running_seq;
    }

    /// Stop one slot's process (its network is being removed). Returns
    /// false when the worker is busy: the slot then stops as soon as the
    /// running request ends, and the caller should try again shortly.
    /// The next request for the slot starts it again if its file exists.
    /// UI thread; never blocks.
    pub fn stopSlot(self: *Worker, slot: engine_mod.Slot) bool {
        // Never wait on the worker from the UI thread: a search or a
        // network still loading can hold the engine for a long time.
        if (self.engine_lock.tryLock()) {
            defer self.engine_lock.unlock(self.io);
            self.engines[@intFromEnum(slot)].deinit(self.io);
            self.states[@intFromEnum(slot)].invalidate();
            return true;
        }
        self.lock.lockUncancelable(self.io);
        self.stop_after[@intFromEnum(slot)] = true;
        self.lock.unlock(self.io);
        return false;
    }

    /// App exit. Stops the worker without waiting for it; KataGo is told to
    /// quit (and exits with our stdin pipe in any case).
    pub fn shutdown(self: *Worker) void {
        self.lock.lockUncancelable(self.io);
        const started = self.started;
        self.quit = true;
        self.has_pending = false;
        if (started) {
            for (&self.engines) |*engine| engine.writeUnlocked("\nquit\n") catch {};
        }
        self.cond.signal(self.io);
        self.lock.unlock(self.io);
        if (!started) {
            for (&self.engines) |*engine| engine.deinit(self.io);
        } else if (self.engine_lock.tryLock()) {
            // Worker idle: reap the processes ourselves.
            for (&self.engines) |*engine| engine.deinit(self.io);
            self.engine_lock.unlock(self.io);
        }
    }

    // ------------------------------------------------------ worker thread

    fn run(self: *Worker) void {
        while (true) {
            self.lock.lockUncancelable(self.io);
            while (!self.has_pending and !self.quit) self.cond.waitUncancelable(self.io, &self.lock);
            if (self.quit) {
                self.lock.unlock(self.io);
                return;
            }
            // `current` is only touched by this thread (and read in
            // `onInfo`, also this thread), so it can be filled here.
            self.current = self.pending;
            self.has_pending = false;
            self.running_seq = self.current.seq;
            self.running_slot = self.current.slot;
            self.lock.unlock(self.io);

            // Lock order is engine_lock → lock everywhere (GTP writes take
            // `lock` while the driver holds `engine_lock`), so never take
            // engine_lock while holding `lock`.
            var result = engine_request.Result{ .seq = self.current.seq };
            self.engine_lock.lockUncancelable(self.io);
            // The deadline starts now that the engine is ours, and is long
            // when the process must start (and load its network) first.
            const cold = self.engines[@intFromEnum(self.current.slot)].child == null;
            const budget = deadlineMs(self.current.max_time, cold);
            self.lock.lockUncancelable(self.io);
            self.running_deadline_ms = std.Io.Timestamp.now(self.io, .awake).toMilliseconds() + budget;
            self.lock.unlock(self.io);
            self.process(&self.current, &result);
            self.stopRequested();
            self.engine_lock.unlock(self.io);

            self.publish(result);
            self.notify();
        }
    }

    /// `engine_lock` held: stop the slots `stopSlot` could not stop at once.
    fn stopRequested(self: *Worker) void {
        self.lock.lockUncancelable(self.io);
        const stops = self.stop_after;
        self.stop_after = [_]bool{false} ** engine_mod.slot_count;
        self.lock.unlock(self.io);
        for (stops, 0..) |stop, i| {
            if (!stop) continue;
            self.engines[i].deinit(self.io);
            self.states[i].invalidate();
        }
    }

    fn publish(self: *Worker, result: engine_request.Result) void {
        while (true) {
            self.lock.lockUncancelable(self.io);
            if (self.running_seq == result.seq) {
                self.running_seq = 0;
                self.running_deadline_ms = 0;
            }
            if (self.results_len < self.results.len) {
                self.results[self.results_len] = result;
                self.results_len += 1;
                self.lock.unlock(self.io);
                return;
            }
            if (self.quit) {
                self.lock.unlock(self.io);
                if (result.info) |info| engine_request.result_allocator.free(info);
                if (result.policy) |rows| engine_request.result_allocator.destroy(rows);
                return;
            }
            self.lock.unlock(self.io);
            // The UI thread has not collected for a while; let it catch up.
            self.notify();
            std.Io.sleep(self.io, .fromMilliseconds(20), .awake) catch {};
        }
    }

    fn isCancelled(self: *Worker, seq: u64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.cancel_seq == seq or self.quit;
    }

    fn timedOut(self: *Worker, seq: u64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.timed_out_seq == seq;
    }

    fn process(self: *Worker, req: *const engine_request.Request, result: *engine_request.Result) void {
        self.processInner(req, result) catch |err| {
            // Killed by the watchdog: whatever the read reported, the page
            // hears why.
            result.error_name = if (self.timedOut(req.seq)) "Timeout" else @errorName(err);
            if (result.info) |info| engine_request.result_allocator.free(info);
            result.info = null;
            if (result.policy) |rows| engine_request.result_allocator.destroy(rows);
            result.policy = null;
            if (err == error.Cancelled and !self.timedOut(req.seq)) {
                result.outcome = .cancelled;
                return;
            }
            result.outcome = .failed;
            // Refused before anything reached KataGo: the process is fine.
            if (err == error.InvalidRequest and !self.touched) return;
            result.outcome = .failed;
            // Unknown GTP state: start from a fresh process next time.
            self.engines[@intFromEnum(req.slot)].deinit(self.io);
            self.states[@intFromEnum(req.slot)].invalidate();
        };
    }

    /// Push the running request's deadline on (a long human-policy request
    /// that keeps making progress).
    fn extendDeadline(self: *Worker, ms: i64) void {
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.running_deadline_ms != 0) self.running_deadline_ms = @max(self.running_deadline_ms, now + ms);
    }

    /// Human policy (v13): for each move of `req.color` from `policy_from`
    /// on, bring the human slot's board to the position before it and read
    /// the raw human SL policy under each profile: `kata-set-param
    /// humanSLProfile <p>` then `kata-raw-human-nn <color> 0` (one
    /// symmetry: these are statistics, not a move choice).
    fn processPolicy(self: *Worker, req: *const engine_request.Request, result: *engine_request.Result) !void {
        if (req.slot != .human or req.policy_profiles_len == 0 or req.policy_profiles_len > engine_request.max_policy_profiles) return error.InvalidRequest;
        for (0..req.policy_profiles_len) |k| {
            if (!engine_mod.validProfile(req.policyProfile(k))) return error.InvalidRequest;
        }
        const rows = try engine_request.result_allocator.create(engine_request.PolicyRows);
        rows.* = .{ .profiles = req.policy_profiles_len };
        for (0..req.policy_profiles_len) |k| {
            const p = req.policyProfile(k);
            @memcpy(rows.names[k][0..p.len], p);
            rows.name_lens[k] = @intCast(p.len);
        }
        result.policy = rows;
        self.touched = true;
        const engine = &self.engines[@intFromEnum(engine_mod.Slot.human)];
        const state = &self.states[@intFromEnum(engine_mod.Slot.human)];
        try engine.start();
        // The profile changes below: the next human-style search sets its own.
        state.human_valid = false;
        const target = &self.policy_target;
        target.* = req.position;
        const color: []const u8 = if (req.color == 'W') "W" else "B";
        const limit = @min(req.policy_max_positions, engine_request.max_policy_positions);
        var i: usize = req.policy_from;
        while (i < req.position.moves_len) : (i += 1) {
            const move = req.position.moves[i];
            if (move.color != req.color) continue;
            if (rows.count >= limit) {
                rows.truncated = true;
                break;
            }
            if (self.isCancelled(req.seq)) return error.Cancelled;
            target.moves_len = i;
            _ = try syncPosition(engine, state, target);
            for (0..req.policy_profiles_len) |k| {
                if (self.isCancelled(req.seq)) return error.Cancelled;
                var buf: [96]u8 = undefined;
                _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param humanSLProfile {s}", .{req.policyProfile(k)}) catch return error.InvalidRequest);
                try engine.writeLine(std.fmt.bufPrint(&buf, "kata-raw-human-nn {s} 0", .{color}) catch return error.InvalidRequest);
                const report = try engine.readBlock(&self.block_buf);
                rows.p[rows.count * engine_request.max_policy_profiles + k] = engine_request.policyAt(report, req.position.size, move) orelse return error.EngineProtocol;
                self.extendDeadline(engine_request.policy_eval_grace_ms);
            }
            rows.index[rows.count] = @intCast(i);
            rows.count += 1;
        }
        result.outcome = .ok;
    }

    fn processInner(self: *Worker, req: *const engine_request.Request, result: *engine_request.Result) !void {
        self.touched = false;
        if (self.isCancelled(req.seq)) return error.Cancelled;
        if (req.kind == .human_policy) return self.processPolicy(req, result);
        if (req.slot == .human and !engine_mod.validProfile(req.profileText())) return error.InvalidRequest;
        self.touched = true;
        const engine = &self.engines[@intFromEnum(req.slot)];
        const state = &self.states[@intFromEnum(req.slot)];
        try engine.start();
        result.sync = try syncPosition(engine, state, &req.position);
        try syncParams(engine, state, req.visits, req.max_time);
        if (req.slot == .human) try syncHuman(engine, state, req);

        var cmd_buf: [96]u8 = undefined;
        const color: []const u8 = if (req.color == 'W') "W" else "B";
        const interval: []const u8 = if (req.stream) " interval 20" else "";
        const search = std.fmt.bufPrint(&cmd_buf, "kata-search_analyze_cancellable {s}{s} ownership true\n", .{ color, interval }) catch return error.InvalidRequest;
        try self.launch(req.seq, search);

        self.last_stream_ms = 0;
        const sink: ?engine_mod.Engine.InfoSink = if (req.stream) .{ .context = self, .on_info = onInfo } else null;
        engine.readAnalysis(sink) catch |err| switch (err) {
            // An engine without the cancellable flavour: same search, not
            // interruptible (a cancel then waits for maxTime at worst).
            error.EngineRejected => {
                const fallback = std.fmt.bufPrint(&cmd_buf, "kata-search_analyze {s}{s} ownership true\n", .{ color, interval }) catch return error.InvalidRequest;
                try self.launch(req.seq, fallback);
                try engine.readAnalysis(sink);
            },
            else => return err,
        };
        const play = engine.play_buf[0..engine.play_len];
        if (std.mem.eql(u8, play, "cancelled") or self.isCancelled(req.seq)) return error.Cancelled;
        result.play_len = @min(play.len, result.play_buf.len);
        @memcpy(result.play_buf[0..result.play_len], play[0..result.play_len]);
        if (engine.info_len > 0) {
            result.info = try engine_request.result_allocator.dupe(u8, engine.info_buf[0..engine.info_len]);
        }
        result.outcome = .ok;
    }

    /// Send the search command unless the request was cancelled meanwhile.
    fn launch(self: *Worker, seq: u64, command_line: []const u8) !void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.cancel_seq == seq or self.quit) return error.Cancelled;
        try self.engines[@intFromEnum(self.running_slot)].writeUnlocked(command_line);
    }

    fn onInfo(context: *anyopaque, line: []const u8) void {
        const self: *Worker = @ptrCast(@alignCast(context));
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        if (self.last_stream_ms != 0 and now - self.last_stream_ms < stream_min_gap_ms) return;
        const copy = engine_request.result_allocator.dupe(u8, line) catch return;
        self.lock.lockUncancelable(self.io);
        if (self.cancel_seq == self.current.seq) {
            self.lock.unlock(self.io);
            engine_request.result_allocator.free(copy);
            return;
        }
        if (self.stream) |old| engine_request.result_allocator.free(old.info);
        self.stream = .{ .seq = self.current.seq, .info = copy };
        self.lock.unlock(self.io);
        self.last_stream_ms = now;
        self.notify();
    }

    fn playMove(engine: *engine_mod.Engine, move: *const engine_request.Move) !void {
        var buf: [32]u8 = undefined;
        const line = std.fmt.bufPrint(&buf, "play {c} {s}", .{ move.color, move.text() }) catch return error.InvalidRequest;
        _ = try engine.command(line);
    }

    /// Bring KataGo's board to `target`, reusing what it already has:
    /// `undo` back to the common prefix of the move lists, then `play`
    /// forward. A different size, komi, ruleset or set of root stones (or a
    /// fresh process) starts over from `clear_board`.
    fn syncPosition(engine: *engine_mod.Engine, self: *SlotState, target: *const engine_request.Position) !engine_request.SyncStats {
        var stats = engine_request.SyncStats{};
        const reusable = self.sent_valid and self.sent_generation == engine.generation and self.sent.sameBase(target);
        // Until the end of this function KataGo's board is in flux.
        self.sent_valid = false;
        var incremental = false;
        if (reusable) {
            const keep = self.sent.commonPrefix(target);
            const undo_count = self.sent.moves_len - keep;
            incremental = true;
            var i: usize = 0;
            while (i < undo_count) : (i += 1) {
                _ = engine.command("undo") catch |err| switch (err) {
                    error.EngineRejected => {
                        incremental = false;
                        break;
                    },
                    else => return err,
                };
                stats.undo += 1;
            }
            if (incremental) {
                for (target.moves[keep..target.moves_len]) |*move| {
                    try playMove(engine, move);
                    stats.play += 1;
                }
            }
        }
        if (!incremental) {
            stats = .{ .reset = true };
            var buf: [64]u8 = undefined;
            _ = try engine.command(std.fmt.bufPrint(&buf, "boardsize {d}", .{target.size}) catch return error.InvalidRequest);
            _ = try engine.command("clear_board");
            _ = try engine.command(std.fmt.bufPrint(&buf, "komi {d}", .{target.komi}) catch return error.InvalidRequest);
            _ = try engine.command(target.rules.command());
            // GTP `play` need not alternate, so root stones are simply
            // placed one by one before the game's own moves.
            for (target.setup[0..target.setup_len]) |*move| try playMove(engine, move);
            for (target.moves[0..target.moves_len]) |*move| {
                try playMove(engine, move);
                stats.play += 1;
            }
        }
        self.sent = target.*;
        self.sent_generation = engine.generation;
        self.sent_valid = true;
        return stats;
    }

    fn syncParams(engine: *engine_mod.Engine, self: *SlotState, visits: u32, max_time: f64) !void {
        const fresh = self.params_valid and self.sent_generation == engine.generation;
        var buf: [64]u8 = undefined;
        if (!fresh or self.sent_visits != visits) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param maxVisits {d}", .{visits}) catch return error.InvalidRequest);
            self.sent_visits = visits;
        }
        if (!fresh or self.sent_max_time != max_time) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param maxTime {d}", .{max_time}) catch return error.InvalidRequest);
            self.sent_max_time = max_time;
        }
        self.params_valid = true;
    }

    /// Profile and style of the human slot, sent only when they change
    /// (a fresh process starts from engine/model/human.cfg).
    fn syncHuman(engine: *engine_mod.Engine, self: *SlotState, req: *const engine_request.Request) !void {
        const profile = req.profileText();
        if (!engine_mod.validProfile(profile)) return error.InvalidRequest;
        const fresh = self.human_valid and self.sent_generation == engine.generation;
        self.human_valid = false;
        var buf: [96]u8 = undefined;
        if (!fresh or !std.mem.eql(u8, self.sent_profile[0..self.sent_profile_len], profile)) {
            _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param humanSLProfile {s}", .{profile}) catch return error.InvalidRequest);
            @memcpy(self.sent_profile[0..profile.len], profile);
            self.sent_profile_len = profile.len;
        }
        if (!fresh or self.sent_style != req.style) {
            for (engine_mod.style_params) |p| {
                const value = if (req.style == .search) p.search else p.raw;
                _ = try engine.command(std.fmt.bufPrint(&buf, "kata-set-param {s} {s}", .{ p.name, value }) catch return error.InvalidRequest);
            }
            self.sent_style = req.style;
        }
        self.human_valid = true;
    }
};

test "the watchdog budget is maxTime plus a grace, long for a cold start" {
    try std.testing.expectEqual(@as(i64, 6000 + warm_grace_ms), deadlineMs(6, false));
    try std.testing.expectEqual(@as(i64, 6000 + cold_grace_ms), deadlineMs(6, true));
    try std.testing.expectEqual(@as(i64, 500 + warm_grace_ms), deadlineMs(0.5, false));
    // Nonsense never means "no deadline".
    try std.testing.expectEqual(@as(i64, 600_000 + warm_grace_ms), deadlineMs(std.math.inf(f64), false));
    try std.testing.expectEqual(@as(i64, 600_000 + warm_grace_ms), deadlineMs(-1, false));
}

