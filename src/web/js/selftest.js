/**
 * Packaged-app self-test.
 *
 * A packaged build is launched by the release workflows with
 * GOBAN_SELFTEST_OUT set (scripts/selftest-app.mjs). The report is written
 * from the real WebView: it proves the page, the native bridge and KataGo
 * came up — and that analysis no longer freezes the window:
 *
 *   analyze19 / analyze9  a full report (win rate, ownership) on 19×19, 9×9
 *   handicapMove          the opponent picks a legal move in a handicap game
 *   async                 a 300-visit 19×19 search returned while a
 *                         requestAnimationFrame loop kept running (longest
 *                         frame gap < 250 ms)
 *   stream                at least one `katago:info` partial report arrived
 *                         before that search's final reply
 *   incremental           a position extended by one move is synced with a
 *                         single `play` (no reset) and searched no slower;
 *                         stepping back is a single `undo`
 *   cancel                a long search stops < 1 s after studio.katagoCancel
 *                         and the engine answers normally afterwards
 *
 * When the workflow asks for it (GOBAN_SELFTEST_MODELS=1, with
 * GOBAN_MODELS_DIR pointing at an empty temporary folder):
 *
 *   modelsResume          a download of the human model stops when asked,
 *                         keeps its partial file, resumes from it after a
 *                         restart of the download and is verified (pinned
 *                         SHA-256) before it is used
 *   modelsHuman           the human-style opponent (-human-model, human.cfg)
 *                         plays a legal 19×19 move
 *   modelsStrong          the stronger network downloads, verifies and
 *                         analyses a 19×19 position on its own process
 *   modelsRemove          both files are removed, and a request for a
 *                         removed network fails (the page then falls back)
 */
import { Game } from "./rules.js";
import * as Engine from "./engine.js";
import * as KataGo from "./katago.js";
import { APP_VERSION } from "./version.js";
import * as Models from "./models.js";
import { hasNative, nativeInvoke, selftestConfig, setNativeMenus, updateCancel, updateDownload, updateStatus, writeTextFile } from "./host.js";

const REQUIRED = ["bridge", "ui", "analyze19", "analyze9", "handicapMove", "async", "stream", "incremental", "cancel", "menus"];
const MAX_FRAME_GAP_MS = 250;
const MAX_CANCEL_MS = 1000;

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Watch the UI thread while `work()` runs: rAF and timer gaps, in ms. */
async function watchFrames(work) {
  const frames = [];
  const timers = [];
  let running = true;
  const start = now();
  frames.push(start);
  timers.push(start);
  const tick = (t) => {
    frames.push(t);
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const timer = setInterval(() => timers.push(now()), 16);
  let value;
  try {
    value = await work();
  } finally {
    running = false;
    clearInterval(timer);
  }
  const end = now();
  const gap = (list) => {
    const all = [...list, end].sort((a, b) => a - b);
    let max = 0;
    for (let i = 1; i < all.length; i++) max = Math.max(max, all[i] - all[i - 1]);
    return Math.round(max);
  };
  return { value, ms: Math.round(end - start), frames: frames.length - 1, maxFrameGap: gap(frames), maxTimerGap: gap(timers) };
}

function playAll(game, moves) {
  for (const [x, y] of moves) game.play(x, y);
  return game;
}

const validAnalysis = (a, size) => !!(a && Number.isFinite(a.winrate) && a.ownership?.length === size * size && a.moves.length > 0);

/**
 * Updater probe (scripts/test-updater.mjs): launched with
 * GOBAN_UPDATE_PROBE_OUT, the page reports whether this installation can
 * update itself; with GOBAN_UPDATE_PROBE_TAG as well, it downloads,
 * verifies and unpacks that real release from GitHub, reports the outcome,
 * and discards it. Nothing is installed.
 */
async function runUpdateProbe(cfg) {
  const report = { version: APP_VERSION, status: await updateStatus({ probe: true }) };
  if (cfg.updateProbeTag) {
    const started = now();
    report.download = await updateDownload(cfg.updateProbeTag);
    report.downloadMs = Math.round(now() - started);
    report.after = await updateStatus();
    report.cancel = await updateCancel();
  }
  report.ok = report.status?.ok === true && (!cfg.updateProbeTag || report.download?.ok === true);
  await writeTextFile(cfg.updateProbe, JSON.stringify(report, null, 2));
}

const MODELS_REQUIRED = ["modelsResume", "modelsHuman", "modelsStrong", "modelsRemove"];

/** Poll the host until `done(one)` holds for `kind` (or the time is up). */
async function waitModel(kind, done, ms) {
  const end = now() + ms;
  let st = await Models.fetchStatus();
  while (!done(st[kind]) && now() < end) {
    await sleep(250);
    st = await Models.fetchStatus();
  }
  return st[kind];
}

/** The optional downloads, end to end against the pinned URLs. */
async function modelChecks(checks, report, cfg = {}) {
  /** @type {Record<string, any>} */
  const out = (report.models = {});
  // Breadcrumbs: if the app stalls, the runner prints how far it got.
  const mark = (step) => (cfg.path ? writeTextFile(cfg.path + ".progress", JSON.stringify({ step, at: Math.round(now()), models: out }, null, 2)) : null);
  for (const kind of Models.KINDS) await Models.remove(kind);
  const start = await Models.fetchStatus();
  out.start = { available: start.available, human: start.human.status, strong: start.strong.status };

  await mark("human download");
  // Human model: stop part-way, resume, verify, play.
  let t = now();
  await Models.download("human");
  const partway = await waitModel("human", (o) => o.bytes > 0 || !Models.isBusy(o), 60000);
  await Models.cancel("human");
  const paused = (await Models.fetchStatus()).human;
  const resumed = await Models.download("human");
  const human = await waitModel("human", (o) => !Models.isBusy(o), 240000);
  out.human = { pausedAt: paused.bytes, pausedStatus: paused.status, resumedOk: resumed.ok, status: human.status, error: human.error, ms: Math.round(now() - t) };
  checks.modelsResume = !!(partway.bytes > 0 && (paused.status === "partial" || paused.status === "ready") && resumed.ok && human.status === "ready" && human.bytes === Models.MODELS.human.bytes);

  await mark("human move");
  Engine.setModels({ human: human.status === "ready" });
  const gH = playAll(new Game({ size: 19, komi: 6.5 }), [[15, 3], [3, 15], [16, 15]]);
  t = now();
  const decided = await Engine.decide(gH, 12); // ≈ 12 kyu: human-style when installed
  out.humanMove = { mode: decided.mode, engine: decided.analysis?.engine ?? null, move: decided.move && !decided.move.pass ? `${decided.move.x},${decided.move.y}` : "", ms: Math.round(now() - t) };
  checks.modelsHuman = !!(decided.mode === "human" && decided.analysis?.engine === "human" && decided.move && !decided.move.pass && gH.canPlay(decided.move.x, decided.move.y).ok);

  await mark("strong download");
  // Stronger network: download, verify, analyse on its own process.
  t = now();
  const started = await Models.download("strong");
  const strong = await waitModel("strong", (o) => !Models.isBusy(o), 240000);
  out.strong = { startedOk: started.ok, status: strong.status, error: strong.error, ms: Math.round(now() - t) };
  await mark("strong analysis");
  const g19 = playAll(new Game({ size: 19, komi: 6.5 }), [[3, 3], [15, 15]]);
  t = now();
  const a = await KataGo.analyze(g19, { visits: 16, engine: "strong" });
  out.strongAnalysis = { engine: a?.engine ?? null, visits: a?.visits ?? null, ms: Math.round(now() - t) };
  checks.modelsStrong = !!(started.ok && strong.status === "ready" && validAnalysis(a, 19) && a.engine === "strong");

  await mark("remove human");
  // Remove both; a removed network is refused and the page falls back.
  const removedHuman = await Models.remove("human");
  await mark("remove strong");
  const removedStrong = await Models.remove("strong");
  const after = await Models.fetchStatus();
  await mark("refused and fallback");
  const refused = await KataGo.analyze(g19, { visits: 16, engine: "strong" });
  Engine.setModels({ human: false, strong: false });
  const fallback = await KataGo.analyze(g19, { visits: 16 });
  out.removed = { human: after.human.status, strong: after.strong.status, refused: refused === null };
  checks.modelsRemove = !!(removedHuman.ok && removedStrong.ok && after.human.status === "absent" && after.strong.status === "absent" && refused === null && validAnalysis(fallback, 19));
}

/** @param {{ state?: any }} [opts] */
export async function runSelfTest({ state } = {}) {
  if (!hasNative()) return;
  const cfg = await selftestConfig();
  if (cfg?.updateProbe) return runUpdateProbe(cfg);
  if (!cfg?.enabled || !cfg.path) return;
  const checks = {
    webview: true,
    bridge: typeof (/** @type {any} */ (window).zero?.invoke) === "function",
    ui: !!(document.querySelector(".app") || document.getElementById("root")?.childElementCount),
  };
  const report = { version: APP_VERSION, language: state?.settings?.lang ?? null, checks, timings: {} };
  const timings = report.timings;
  try {
    const st = await KataGo.status();
    report.engine = { version: st.version || "", async: !!st.async, stream: !!st.stream };

    // --- engine checks (cold start happens here)
    const g19 = new Game({ size: 19, komi: 6.5 });
    const a19 = await KataGo.analyze(g19, { visits: 16 });
    checks.analyze19 = validAnalysis(a19, 19);
    report.winrate19 = a19?.winrate ?? null;
    const g9 = new Game({ size: 9, komi: 6.5 });
    g9.play(4, 4);
    const a9 = await KataGo.analyze(g9, { visits: 16 });
    checks.analyze9 = !!(a9 && Number.isFinite(a9.scoreLead) && a9.ownership?.length === 81);
    const h = new Game({ size: 19, komi: 0.5, handicap: 4 });
    const move = await Engine.chooseMove(h, "5k");
    checks.handicapMove = !!(move && !move.pass && h.canPlay(move.x, move.y).ok);
    report.engineMove = move && !move.pass ? `${move.x},${move.y}` : "";
    report.boardSize = 19;

    // --- async + stream: the UI keeps drawing during a 300-visit search
    const gA = playAll(new Game({ size: 19, komi: 6.5 }), [[15, 3], [3, 15], [16, 15], [2, 3], [13, 16]]);
    let partials = 0;
    let firstPartialVisits = null;
    let partialBeforeReply = false;
    let replied = false;
    const watched = await watchFrames(() =>
      KataGo.analyze(gA, {
        visits: 300,
        onInfo: (partial) => {
          partials++;
          if (firstPartialVisits === null) firstPartialVisits = partial.visits;
          if (!replied) partialBeforeReply = true;
        },
      }).then((a) => {
        replied = true;
        return a;
      }),
    );
    const aA = watched.value;
    Object.assign(timings, {
      asyncMs: watched.ms,
      asyncFrames: watched.frames,
      asyncMaxFrameGapMs: watched.maxFrameGap,
      asyncMaxTimerGapMs: watched.maxTimerGap,
      streamPartials: partials,
      streamFirstVisits: firstPartialVisits,
      streamFinalVisits: aA?.visits ?? null,
    });
    checks.async = !!(st.async && validAnalysis(aA, 19) && watched.frames >= 2 && watched.maxFrameGap < MAX_FRAME_GAP_MS);
    checks.stream = !!(st.stream && partialBeforeReply && partials >= 1);

    // --- incremental: P, then P + its best move, then P again
    const gP = playAll(new Game({ size: 19, komi: 6.5 }), [[3, 3], [15, 15], [15, 3], [2, 15], [9, 9], [16, 9]]);
    let t = now();
    const first = await KataGo.analyze(gP, { visits: 200 });
    const firstMs = now() - t;
    const best = first?.play;
    let second = null;
    let secondMs = Infinity;
    let third = null;
    if (best && !best.pass && gP.canPlay(best.x, best.y).ok) {
      const parent = gP.current;
      gP.play(best.x, best.y);
      t = now();
      second = await KataGo.analyze(gP, { visits: 200 });
      secondMs = now() - t;
      third = await KataGo.analyze(gP, { node: parent, visits: 200 });
    }
    Object.assign(timings, {
      incrementalFirstMs: Math.round(firstMs),
      incrementalSecondMs: Number.isFinite(secondMs) ? Math.round(secondMs) : null,
      incrementalSync: [first?.sync ?? null, second?.sync ?? null, third?.sync ?? null],
    });
    checks.incremental = !!(
      validAnalysis(first, 19) &&
      validAnalysis(second, 19) &&
      validAnalysis(third, 19) &&
      second.sync && second.sync.reset === false && second.sync.undo === 0 && second.sync.play === 1 &&
      third.sync && third.sync.reset === false && third.sync.undo === 1 && third.sync.play === 0 &&
      // The sync counts prove the position was extended, not replayed; the
      // timing only guards against a pathological slowdown.
      secondMs <= firstMs * 1.5
    );

    // --- cancel: a long search stops promptly when asked
    const gC = playAll(new Game({ size: 19, komi: 6.5 }), [[3, 3], [15, 15], [2, 15]]);
    const id = "selftest-cancel";
    const pending = nativeInvoke("studio.katagoAnalyzeAsync", { id, ...KataGo.positionPayload(gC, gC.current, 50000), maxTime: 30, stream: false });
    await sleep(500);
    t = now();
    await nativeInvoke("studio.katagoCancel", { id });
    const reply = await Promise.race([pending, sleep(5000).then(() => null)]);
    const cancelMs = now() - t;
    const after = await KataGo.analyze(g9, { visits: 16 });
    Object.assign(timings, { cancelMs: Math.round(cancelMs) });
    report.cancelReply = reply ? { ok: reply.ok, id: reply.id, cancelled: reply.cancelled ?? false } : null;
    // --- menus: the localized menu bar installs on macOS (Windows has none).
    try {
      const { menuSpec } = await import("./app/app.jsx");
      const applied = await setNativeMenus(menuSpec());
      const mac = /Mac/.test(navigator.platform || navigator.userAgent || "");
      report.menusApplied = applied;
      checks.menus = mac ? applied === true : applied === false;
    } catch (e) {
      report.menusError = String(e?.message || e);
      checks.menus = false;
    }
    checks.cancel = !!(reply && reply.ok === false && reply.cancelled === true && reply.id === id && cancelMs < MAX_CANCEL_MS && validAnalysis(after, 9));

    if (cfg.models) await modelChecks(checks, report, cfg);
  } catch (error) {
    report.error = String(error?.message || error);
  }
  const required = cfg.models ? [...REQUIRED, ...MODELS_REQUIRED] : REQUIRED;
  report.modelsChecked = !!cfg.models;
  report.ok = Object.values(checks).every(Boolean) && required.every((k) => checks[k] === true);
  await writeTextFile(cfg.path, JSON.stringify(report, null, 2) + "\n");
  return report;
}
