/**
 * KataGo 19×19, reached through the native host.
 *
 * The browser preview has no child processes, so this module simply reports
 * unavailable and ai.js keeps its local opponent. The packaged macOS and
 * Windows app ships a KataGo GTP binary, a small network and a config; the
 * native bridge keeps one engine process alive for the session.
 */
import { hasNative, nativeInvoke } from "./host.js";
import { BLACK, coordLabel } from "./rules.js";

const LEVEL = {
  1: { visits: 24, seconds: 2 },
  2: { visits: 80, seconds: 3 },
  3: { visits: 200, seconds: 5 },
  4: { visits: 500, seconds: 7 },
  5: { visits: 1200, seconds: 9 },
};

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

function gtpPoint(x, y, size) {
  return coordLabel(x, y, size);
}

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function lineFromRoot(game) {
  const line = [];
  let node = game.current;
  while (node && node.parent) {
    const move = node.move;
    if (move) line.push(move);
    node = node.parent;
  }
  return line.reverse();
}

export async function chooseMove(game, { level = 2 } = {}) {
  if (!hasNative() || game?.size !== 19) return null;
  if (game.handicap > 0) return null;
  // Setup stones are not represented by play commands; the local opponent
  // handles those rare positions instead of sending a board KataGo would see
  // differently.
  if (game.root.board.signMap.flat().some((value) => value !== 0)) return null;
  const result = await status();
  if (!result?.available) return null;

  const cfg = LEVEL[Math.max(1, Math.min(5, Number(level) || 2))];
  const commands = [
    "clear_board",
    `boardsize ${game.size}`,
    `komi ${game.komi}`,
    `kata-set-rules japanese`,
    `kata-set-param maxVisits ${cfg.visits}`,
    `kata-set-param maxTime ${cfg.seconds}`,
  ];
  for (const move of lineFromRoot(game)) {
    commands.push(`play ${move.color === BLACK ? "B" : "W"} ${move.pass ? "pass" : gtpPoint(move.x, move.y, game.size)}`);
  }

  try {
    const reply = await nativeInvoke("studio.katagoMove", {
      b64: b64(commands.join("\n")),
      color: game.turn === BLACK ? "B" : "W",
    });
    const move = String(reply?.move || "").trim();
    if (!move || move === "resign") return { pass: true };
    if (move.toLowerCase() === "pass") return { pass: true };
    const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
    const x = letters.indexOf(move[0].toUpperCase());
    const y = game.size - Number(move.slice(1));
    if (x < 0 || !Number.isInteger(y) || y < 0 || y >= game.size) return null;
    return { x, y };
  } catch (error) {
    // A cold start or a killed sidecar can fail once. The next move tries
    // again; if the files really are missing, status() has already said so.
    console.warn("KataGo unavailable; using the local opponent.", error);
    return null;
  }
}

export const engine = "KataGo 19×19";
