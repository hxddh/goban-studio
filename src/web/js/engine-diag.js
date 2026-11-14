/**
 * Settings → Engines: which KataGo build runs, why the faster one was given
 * up if it was, and how fast each network searches on this computer.
 *
 * The host decides at run time which build starts (src/engine_build.zig:
 * Metal on Apple Silicon with macOS 13 or later, AVX2 on a capable Windows
 * PC, the plain Eigen build otherwise) and falls back to the plain one for
 * the session when the faster one does not answer. `studio.katagoStatus`
 * says which (`build`, `fallback`, `networks`); it is read afresh here, not
 * through katago.js status(), which keeps its first answer for the session.
 *
 * The speed test is one fixed search per network: a short warm-up (which
 * also starts the process), then SPEED_VISITS visits on a 19×19 opening of
 * a few stones, timed here. The stones are drawn at random each time, so
 * KataGo's cache of positions it has already evaluated cannot answer for
 * it. It runs in the scheduler's background lane, so the player's own
 * searches go first, and stops when its signal aborts.
 */
import { hasNative, nativeInvoke } from "./host.js";
import { Game } from "./rules.js";
import * as KataGo from "./katago.js";
import { scheduler } from "./scheduler.js";

export const BUILDS = ["metal", "avx2", "eigen"];
export const SLOTS = ["standard", "strong", "human"];
/** Visits of the timed search; KataGo's time limit for it (katago.js) caps a very slow machine. */
export const SPEED_VISITS = 300;
/** Stones of the test position. */
export const SPEED_STONES = 8;

/**
 * The diagnostics part of a `studio.katagoStatus` answer, checked:
 * { version, build, fallback, networks } or null when KataGo is not there.
 * An unknown build is null (an older host); `fallback` is the host's
 * reason code or null.
 */
export function readDiagnostics(value) {
  if (!value || typeof value !== "object" || !value.available) return null;
  const networks = {};
  for (const slot of SLOTS) {
    const name = value.networks?.[slot];
    if (typeof name === "string" && name) networks[slot] = name;
  }
  return {
    version: typeof value.version === "string" && value.version ? value.version : "KataGo",
    build: BUILDS.includes(value.build) ? value.build : null,
    fallback: typeof value.fallback === "string" && value.fallback ? value.fallback : null,
    networks,
  };
}

/** The host's diagnostics now, or null (the browser preview, no KataGo, a failed call). */
export async function diagnostics() {
  if (!hasNative()) return null;
  try {
    return readDiagnostics(await nativeInvoke("studio.katagoStatus"));
  } catch (_) {
    return null;
  }
}

/** "Engine: KataGo 1.18.1 · Metal (graphics card)"; a host that names no build says only the version. */
export function engineLine(d, t) {
  if (!d.build) return t("settings.engineOn", [d.version]);
  return t("engineDiag.line", [d.version, t(`engineDiag.build.${d.build}`)]);
}

const FALLBACK_KEYS = { "start-failed": "engineDiag.fallback.startFailed", "no-answer": "engineDiag.fallback.noAnswer", "timed-out": "engineDiag.fallback.timedOut" };

/** The message for a fallback reason code; null when the faster build was not given up. */
export function fallbackKey(code) {
  if (!code) return null;
  return FALLBACK_KEYS[code] || "engineDiag.fallback.other";
}

/** Visits per second for the reader: whole numbers, one decimal below 10. */
export function rateText(rate, lang) {
  const digits = rate < 10 ? 1 : 0;
  return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rate);
}

/** "Built-in: 412 visits/s · Stronger: 61 visits/s" (a network that gave nothing says so). */
export function speedLine(results, t, lang) {
  return results
    .map((r) => {
      const name = t(r.engine === "strong" ? "engineDiag.strong" : "engineDiag.builtIn");
      return r.rate > 0 ? t("engineDiag.rate", [name, rateText(r.rate, lang)]) : t("engineDiag.rateFailed", [name]);
    })
    .join(" · ");
}

/**
 * A 19×19 opening of SPEED_STONES stones on the third and fourth lines,
 * Black and White in turn, drawn with `rand`.
 */
export function speedGame(rand = Math.random) {
  const game = new Game({ size: 19, rules: "japanese" });
  const lines = [2, 3, 15, 16];
  const points = [];
  for (let a = 2; a <= 16; a++) {
    for (const b of lines) {
      points.push([a, b], [b, a]);
    }
  }
  const pool = [...new Map(points.map((p) => [p.join(","), p])).values()];
  let placed = 0;
  while (placed < SPEED_STONES && pool.length) {
    const [x, y] = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    if (game.canPlay(x, y)) {
      game.play(x, y);
      placed++;
    }
  }
  return game;
}

/**
 * Time one search of `engine` ("standard" | "strong"). Resolves
 * { engine, visits, ms, rate }, with rate 0 when KataGo gave nothing, or
 * null when it was stopped (its signal, or the app cancelling background
 * work). A search the scheduler pre-empts runs again from the warm-up, and
 * only its last run is timed.
 */
export async function measure(engine, { signal = null, rand = Math.random, now = () => performance.now(), sched = scheduler } = {}) {
  const status = {};
  const result = await sched.search(
    async (sig) => {
      // Starts the process (and loads its network) outside the timing.
      await KataGo.analyze(speedGame(rand), { visits: 1, engine, signal: sig });
      if (sig.aborted) return null;
      const game = speedGame(rand);
      const start = now();
      const a = await KataGo.analyze(game, { visits: SPEED_VISITS, engine, signal: sig });
      const ms = Math.max(1, now() - start);
      if (sig.aborted) return null;
      const visits = a?.visits || 0;
      return { engine, visits, ms, rate: visits ? (visits * 1000) / ms : 0 };
    },
    { lane: "background", signal, preemptible: KataGo.canCancel(), status },
  );
  if (status.cancelled || signal?.aborted) return null;
  return result || { engine, visits: 0, ms: 0, rate: 0 };
}

/** Every network to time: the built-in one, and the stronger one when it is installed. */
export function speedEngines(d) {
  return d?.networks?.strong ? ["standard", "strong"] : ["standard"];
}
