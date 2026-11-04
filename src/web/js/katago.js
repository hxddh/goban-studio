/**
 * KataGo, reached through the native host.
 *
 * The packaged macOS and Windows app ships a KataGo GTP binary, a small
 * network and a config; the native host keeps one engine process alive for
 * the session. The page asks for a search of a position and gets KataGo's
 * search report back (win rate, score lead, candidate moves with visits,
 * ownership).
 *
 * Two transports, chosen by `status()`:
 *
 *   async (v3 hosts)  `studio.katagoAnalyzeAsync` — a worker thread in the
 *                     host runs the search; the UI never blocks. The host
 *                     keeps KataGo's board between requests and only sends
 *                     the moves that changed. Partial reports stream in as
 *                     `katago:info` window events, a request can be
 *                     cancelled, and a new request supersedes the previous.
 *   sync  (v2 hosts)  `studio.katagoAnalyze` — the whole position as a GTP
 *                     script; blocks the host's UI thread while searching.
 *
 * All numbers are reported from Black's point of view
 * (reportAnalysisWinratesAs = BLACK in gtp.cfg and human.cfg).
 *
 * v5: a request may name the KataGo process that serves it (`engine`):
 * "standard" (the shipped network, default), "strong" (the optional larger
 * network) or "human" (the optional human SL model, with a `profile` such
 * as "rank_12k" and a `humanStyle` "raw" | "search"). The host answers
 * `ModelMissing` when that network is not installed; callers fall back.
 *
 * Rules (v5): every request carries the game's ruleset, and KataGo is set
 * to it before it searches: `kata-set-rules japanese|chinese|korean` in the
 * sync script, the `rules` field of the async payload (the host sends the
 * same command when it resets the board). Analysis, the computer's moves
 * and the dead stones at the end therefore all use the game's rules.
 *
 * The browser preview has no child processes, so status() reports
 * unavailable and engine.js uses its offline fallbacks.
 */
import { hasNative, nativeInvoke } from "./host.js";
import { BLACK, LETTERS, coordLabel, rulesetById } from "./rules.js";

const OFFLINE = Object.freeze({ available: false, engine: "Local", version: "", async: false, stream: false });

let probe = null;

/** { available, engine, version, async, stream, ... } — cached per session. */
export async function status() {
  if (!hasNative()) return OFFLINE;
  if (probe) return probe;
  probe = (async () => {
    try {
      const value = await nativeInvoke("studio.katagoStatus");
      if (!value || typeof value !== "object") return OFFLINE;
      return { ...value, available: !!value.available, async: !!value.async, stream: !!value.stream, models: !!value.models };
    } catch (_) {
      return OFFLINE;
    }
  })();
  return probe;
}

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function maxTimeFor(visits) {
  return visits > 600 ? 12 : visits > 150 ? 6 : 3;
}

/**
 * Root stones (handicap and SGF setup) as GTP plays: ["W Q16", "B D4", ...].
 *
 * White stones go first. KataGo treats the black stones played before
 * White's first move as handicap stones, and under Chinese rules gives
 * White one point for each (whiteHandicapBonus N). A root of black stones
 * only is a handicap, and KataGo counts exactly those; a root with White
 * stones is a set-up position, and placing White first keeps KataGo from
 * counting any of it as handicap. That is the same reading as
 * Game.handicap after SGF import, so the app's count and KataGo's agree.
 */
function setupStones(game) {
  const size = game.size;
  const root = game.root.board.signMap;
  const black = [];
  const white = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = root[y][x];
      if (v === BLACK) black.push(`B ${coordLabel(x, y, size)}`);
      else if (v) white.push(`W ${coordLabel(x, y, size)}`);
    }
  }
  return [...white, ...black];
}

/**
 * The `kata-set-rules` argument for a game: exactly "japanese", "chinese"
 * or "korean" (the native host accepts nothing else).
 */
export function katagoRules(game) {
  return rulesetById(game?.rules).katago;
}

/** The moves from the root to `node`: ["B D4", "W pass", ...]. */
function lineMoves(game, node) {
  const line = [];
  for (let n = node; n && n.parent; n = n.parent) if (n.move) line.push(n.move);
  line.reverse();
  return line.map((move) => `${move.color === BLACK ? "B" : "W"} ${move.pass ? "pass" : coordLabel(move.x, move.y, game.size)}`);
}

/**
 * The structured position for `studio.katagoAnalyzeAsync` (without `id`
 * and `stream`). Exported for the self-test.
 */
export function positionPayload(game, node = game.current, visits = 64) {
  const v = Math.max(1, Math.round(visits));
  return {
    size: game.size,
    // The game's komi only: under Chinese rules KataGo adds the handicap
    // compensation itself (see RULESETS in rules.js).
    komi: game.komi,
    rules: katagoRules(game),
    setup: setupStones(game).join(" "),
    moves: lineMoves(game, node).join(" "),
    color: node.turn === BLACK ? "B" : "W",
    visits: v,
    maxTime: maxTimeFor(v),
  };
}

/** v2 request: the whole position as a GTP script. */
function positionScript(game, node, visits) {
  const v = Math.max(1, Math.round(visits));
  const commands = [
    "clear_board",
    `boardsize ${game.size}`,
    `komi ${game.komi}`,
    `kata-set-rules ${katagoRules(game)}`,
    `kata-set-param maxVisits ${v}`,
    `kata-set-param maxTime ${maxTimeFor(v)}`,
  ];
  // GTP `play` does not have to alternate, so setup stones are simply
  // placed one by one before the game's own moves (White's first, so that
  // only a black-only root reads as a handicap; see setupStones).
  for (const stone of setupStones(game)) commands.push(`play ${stone}`);
  for (const move of lineMoves(game, node)) commands.push(`play ${move}`);
  return commands.join("\n");
}

export function parseVertex(text, size) {
  const v = String(text || "").trim();
  if (!v) return null;
  if (/^pass$/i.test(v) || /^resign$/i.test(v)) return { pass: true };
  const x = LETTERS.indexOf(v[0].toUpperCase());
  const row = Number(v.slice(1));
  const y = size - row;
  if (x < 0 || x >= size || !Number.isInteger(row) || y < 0 || y >= size) return null;
  return { x, y };
}

/**
 * Parse a KataGo `info move …` report. Exported for the test suite.
 * Returns { moves: [...], ownership: Float32Array|null } with Black-POV values.
 */
export function parseInfo(info, size) {
  const out = { moves: [], ownership: null };
  if (!info) return out;
  const ownAt = info.indexOf(" ownership ");
  const head = ownAt >= 0 ? info.slice(0, ownAt) : info;
  if (ownAt >= 0) {
    const values = info
      .slice(ownAt + 11)
      .trim()
      .split(/\s+/)
      .map(Number);
    if (values.length >= size * size) out.ownership = Float32Array.from(values.slice(0, size * size));
  }
  for (const chunk of head.split(/(?:^|\s)info\s+/).filter(Boolean)) {
    const tokens = chunk.trim().split(/\s+/);
    const m = { pv: [] };
    for (let i = 0; i < tokens.length; i++) {
      const k = tokens[i];
      if (k === "pv") {
        m.pv = tokens.slice(i + 1).map((t) => parseVertex(t, size)).filter(Boolean);
        break;
      }
      const val = tokens[i + 1];
      if (k === "move") {
        const v = parseVertex(val, size);
        if (v) Object.assign(m, v);
        i++;
      } else if (["visits", "winrate", "scoreLead", "scoreMean", "prior", "order", "utility", "lcb", "scoreStdev"].includes(k)) {
        m[k] = Number(val);
        i++;
      }
    }
    if (m.x !== undefined || m.pass) out.moves.push(m);
  }
  out.moves.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return out;
}

/** The analysis object every caller gets (final or partial), or null. Exported for the calibration harness. */
export function toAnalysis(info, playText, size) {
  const parsed = parseInfo(String(info || ""), size);
  const play = parseVertex(String(playText || ""), size);
  const top = parsed.moves[0];
  if (!top && !play) return null;
  return {
    moves: parsed.moves,
    ownership: parsed.ownership,
    winrate: top ? top.winrate : null,
    scoreLead: top ? top.scoreLead : null,
    play: play || (top ? (top.pass ? { pass: true } : { x: top.x, y: top.y }) : null),
    visits: parsed.moves.reduce((s, m) => s + (m.visits || 0), 0),
  };
}

/* ---------------------------------------------------------------- async */

/** Requests in flight: id → { size, onInfo, finish }. */
const live = new Map();
let nextId = 0;
let listening = false;

function listen() {
  if (listening) return;
  const zero = globalThis.zero;
  if (!zero || typeof zero.on !== "function") return;
  try {
    zero.on("katago:info", (detail) => {
      const entry = detail && live.get(detail.id);
      if (!entry || typeof entry.onInfo !== "function") return;
      const partial = toAnalysis(detail.info, "", entry.size);
      if (!partial) return;
      try {
        entry.onInfo(partial);
      } catch (error) {
        console.warn("KataGo onInfo handler failed", error);
      }
    });
    listening = true;
  } catch (_) {}
}

/** The v5 fields of a request (nothing for the standard engine, as in v4). */
export function enginePayload({ engine = "standard", profile = "", humanStyle = "raw" } = {}) {
  if (engine === "strong") return { engine };
  if (engine === "human") return { engine, profile, humanStyle: humanStyle === "search" ? "search" : "raw" };
  return {};
}

function analyzeAsync(game, node, visits, onInfo, signal, select) {
  const id = `k${++nextId}`;
  const stream = typeof onInfo === "function";
  const payload = { id, ...positionPayload(game, node, visits), stream, ...enginePayload(select) };
  if (stream) listen();
  return new Promise((resolve) => {
    const entry = { size: game.size, onInfo: stream ? onInfo : null, finish: null };
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      live.delete(id);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    // Resolve at once; the host answers the cancelled request on its own.
    const onAbort = () => {
      nativeInvoke("studio.katagoCancel", { id }).catch(() => {});
      finish(null);
    };
    entry.finish = finish;
    live.set(id, entry);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    nativeInvoke("studio.katagoAnalyzeAsync", payload).then(
      (reply) => {
        if (!reply || typeof reply !== "object" || reply.ok !== true) return finish(null);
        const result = toAnalysis(reply.info, reply.play, game.size);
        if (result && reply.sync && typeof reply.sync === "object") result.sync = reply.sync;
        if (result) result.engine = typeof reply.engine === "string" ? reply.engine : "standard";
        finish(result);
      },
      (error) => {
        console.warn("KataGo request failed; using the offline engine.", error);
        finish(null);
      },
    );
  });
}

async function analyzeSync(game, node, visits) {
  try {
    const reply = await nativeInvoke("studio.katagoAnalyze", {
      b64: b64(positionScript(game, node, visits)),
      color: node.turn === BLACK ? "B" : "W",
    });
    if (!reply || typeof reply !== "object") return null;
    return toAnalysis(reply.info, reply.play, game.size);
  } catch (error) {
    // A cold start or a killed sidecar can fail once; callers fall back.
    console.warn("KataGo request failed; using the offline engine.", error);
    return null;
  }
}

/**
 * Search the position at `node` (default: the current node) with `visits`.
 *
 *   onInfo(partial)  called with partial results (same shape) while the
 *                    search runs, about five times a second (async hosts)
 *   signal           AbortSignal: abort cancels the search; resolves null
 *   engine           v5: "standard" | "strong" | "human" (see above)
 *   profile, humanStyle   v5, human engine only
 *
 * Resolves { moves, ownership, winrate, scoreLead, play, visits, engine }
 * or null when KataGo is not available, the request fails (including an
 * optional network that is not installed), or it was cancelled or
 * superseded by a newer request.
 */
export async function analyze(game, { node = game.current, visits = 64, onInfo = null, signal = null, engine = "standard", profile = "", humanStyle = "raw" } = {}) {
  if (!hasNative() || signal?.aborted) return null;
  const st = await status();
  if (!st?.available || signal?.aborted) return null;
  // Optional networks need a v5 host (async, with `models`).
  if (engine !== "standard" && !(st.async && st.models)) return null;
  if (st.async) return analyzeAsync(game, node, visits, onInfo, signal, { engine, profile, humanStyle });
  const result = await analyzeSync(game, node, visits);
  return signal?.aborted ? null : result;
}

/** Cancel whatever is in flight; pending analyze() calls resolve null. */
export function cancel() {
  if (!live.size) return;
  const entries = [...live.values()];
  if (hasNative()) nativeInvoke("studio.katagoCancel", {}).catch(() => {});
  for (const entry of entries) entry.finish?.(null);
}
