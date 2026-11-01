/**
 * KataGo, reached through the native host.
 *
 * The packaged macOS and Windows app ships a KataGo GTP binary, a small
 * network and a config; the native bridge keeps one engine process alive for
 * the session. One request shape serves everything: the page sends the
 * position as a validated GTP script and gets KataGo's final search report
 * back (win rate, score lead, candidate moves with visits, ownership).
 *
 * All numbers are reported from Black's point of view
 * (reportAnalysisWinratesAs = BLACK in gtp.cfg).
 *
 * The browser preview has no child processes, so status() reports
 * unavailable and engine.js uses its offline fallbacks.
 */
import { hasNative, nativeInvoke } from "./host.js";
import { BLACK, LETTERS, coordLabel } from "./rules.js";

let probe = null;

export async function status() {
  if (!hasNative()) return { available: false, engine: "Local", version: "" };
  if (probe) return probe;
  probe = (async () => {
    try {
      const value = await nativeInvoke("studio.katagoStatus");
      return value && typeof value === "object" ? value : { available: false, engine: "Local", version: "" };
    } catch (_) {
      return { available: false, engine: "Local", version: "" };
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

/** Stones on the root board (handicap and SGF setup) plus the moves to `node`. */
function positionScript(game, node, visits) {
  const size = game.size;
  const commands = [
    "clear_board",
    `boardsize ${size}`,
    `komi ${game.komi}`,
    "kata-set-rules japanese",
    `kata-set-param maxVisits ${Math.max(1, Math.round(visits))}`,
    `kata-set-param maxTime ${visits > 600 ? 12 : visits > 150 ? 6 : 3}`,
  ];
  // GTP `play` does not have to alternate, so setup stones are simply
  // placed one by one before the game's own moves. Under Japanese rules this
  // changes nothing about the position KataGo searches.
  const root = game.root.board.signMap;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = root[y][x];
      if (v) commands.push(`play ${v === BLACK ? "B" : "W"} ${coordLabel(x, y, size)}`);
    }
  }
  const line = [];
  for (let n = node; n && n.parent; n = n.parent) if (n.move) line.push(n.move);
  line.reverse();
  for (const move of line) {
    commands.push(`play ${move.color === BLACK ? "B" : "W"} ${move.pass ? "pass" : coordLabel(move.x, move.y, size)}`);
  }
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

/**
 * Search the position at `node` (default: the current node) with `visits`.
 * Returns null when KataGo is not available or the request fails.
 */
export async function analyze(game, { node = game.current, visits = 64 } = {}) {
  if (!hasNative()) return null;
  const st = await status();
  if (!st?.available) return null;
  const script = positionScript(game, node, visits);
  try {
    const reply = await nativeInvoke("studio.katagoAnalyze", {
      b64: b64(script),
      color: node.turn === BLACK ? "B" : "W",
    });
    if (!reply || typeof reply !== "object") return null;
    const parsed = parseInfo(String(reply.info || ""), game.size);
    const play = parseVertex(String(reply.play || ""), game.size);
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
  } catch (error) {
    // A cold start or a killed sidecar can fail once; callers fall back.
    console.warn("KataGo request failed; using the offline engine.", error);
    return null;
  }
}
