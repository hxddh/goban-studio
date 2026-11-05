/**
 * v8: one plain reason for the teaching warning ("why might this move cost
 * points?") and for the hint ("why this point?").
 *
 * The warning reuses the review's explanation (explain.js explainMistake:
 * where the points went and which pattern the punishing line shows), fed
 * with the two searches the warning already has: the pondering before the
 * player's move and the computer's own search after it. The hint reads the
 * hinted move and its line off the board (story.js simulate). Nothing here
 * searches; it is a few board walks.
 *
 * Every reason is a fact read off the board or the engine's line. When no
 * reason is confident, the chooser returns null and the text stays the plain
 * number (or the plain point). Pure: no DOM, no engine, no app state.
 */
import { coordLabel } from "../rules.js";
import { t } from "../i18n.js";
import { explainMistake } from "./explain.js";
import { chains } from "./insight.js";
import { simulate } from "./story.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const colorKey = (c) => (c === 1 ? "common.black" : "common.white");
const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The stone of `stones` nearest to `p` (to name a group by one point). */
function nearest(stones, p) {
  let best = null;
  for (const s of stones) if (!best || near(s, p) < near(best, p)) best = s;
  return best;
}

/**
 * Does the move at `f` (a simulate fact) really split enemy chains? It must
 * touch two of them, and no two of those may share another liberty (then
 * they could still join there: a hanging or bamboo connection).
 */
function realCut(f) {
  if (!f || f.pass || f.cuts < 2) return false;
  const ch = chains(f.after);
  const size = f.after.length;
  const ids = new Set();
  for (const [dx, dy] of DIRS) {
    const nx = f.move.x + dx;
    const ny = f.move.y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && f.after[ny][nx] === -f.color) ids.add(ch.id[ny][nx]);
  }
  const list = [...ids].map((i) => new Set(ch.list[i].libs.map((l) => l.y * size + l.x)));
  if (list.length < 2) return false;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (const l of list[i]) if (list[j].has(l)) return false;
  return true;
}

/**
 * The reason a move may cost points, or null.
 *   signMapBefore  the board the player faced
 *   move, mover    the player's move and colour
 *   before         the search of the position before the move (moves, ownership)
 *   after          the search of the position after it (moves[0].pv is the punishing line)
 * Returns { key, params } (params may be { key } objects, see whyText).
 */
export function warningReason(input) {
  try {
    return warnWhy(input);
  } catch (_) {
    return null; // a reason is a bonus: never let it break the warning
  }
}

function warnWhy({ signMapBefore, move, mover, loss, before, after }) {
  if (!signMapBefore || !move || move.pass || !after) return null;
  const size = signMapBefore.length;
  const opp = { key: colorKey(-mover) };
  const own = simulate(signMapBefore, mover, [{ x: move.x, y: move.y }]);
  if (!own.length) return null;
  const signMapAfter = own[0].after;
  const punish = (after.moves?.[0]?.pv || []).slice(0, 10);
  const facts = simulate(signMapAfter, -mover, punish);
  const reply = facts[0] && !facts[0].pass && facts[0].color === -mover ? facts[0] : null;

  // The move put itself in atari and the reply takes it.
  if (own[0].selfAtari && reply?.captured.some((p) => p.x === move.x && p.y === move.y)) return { key: "why.warn.selfAtari", params: [opp] };

  const best = before?.moves?.[0];
  const m = {
    index: 1,
    move: { ...move, color: mover },
    loss,
    best: best && !best.pass ? { x: best.x, y: best.y } : null,
    pv: best?.pv || [],
    before: { board: { signMap: signMapBefore } },
    node: { board: { signMap: signMapAfter } },
  };
  const ex = explainMistake(m, before, { ...after, pv: punish }, { size });
  const { theme, attribution } = ex;
  const main = attribution.regions[0];
  const ownAfter = after.ownership;
  const deadNow = (stones) => !!ownAfter && stones.length > 0 && stones.reduce((s, p) => s + ownAfter[p.y * size + p.x] * mover, 0) / stones.length <= -0.5;
  // A region that carries most of the loss: the reason must be where the points went.
  const major = main && main.share >= 0.4;
  // A group is named by its stone nearest the punishing reply (where the trouble is).
  const focus = reply ? reply.move : move;

  if (theme === "ladder") return { key: "why.warn.ladder", params: [opp] };
  if (theme === "snapback") return { key: "why.warn.snapback", params: [opp] };
  if (theme === "double-atari") return { key: "why.warn.doubleAtari", params: [opp] };
  if (!major) return null;
  if (theme === "ko") return { key: "why.warn.ko", params: [] };
  if ((theme === "race-shared" || theme === "race-outside") && main.lost.length && deadNow(main.lost)) {
    const s = nearest(main.lost, focus);
    return { key: "why.warn.race", params: [coordLabel(s.x, s.y, size)] };
  }
  if (attribution.kind === "group-died" && main.lost.length && deadNow(main.lost)) {
    const s = nearest(main.lost, focus);
    const at = coordLabel(s.x, s.y, size);
    const lost = new Set(main.lost.map((p) => p.y * size + p.x));
    const taken = facts.some((f) => f.color === -mover && f.captured?.some((p) => lost.has(p.y * size + p.x)));
    return taken ? { key: "why.warn.captured", params: [opp, at] } : { key: "why.warn.noEyes", params: [at] };
  }
  if (attribution.kind === "group-lived" && main.lived.length && ownAfter) {
    const s = nearest(main.lived, focus);
    return { key: "why.warn.escapes", params: [opp, coordLabel(s.x, s.y, size)] };
  }
  if (theme === "cut" && realCut(reply)) return { key: "why.warn.cut", params: [opp, coordLabel(reply.move.x, reply.move.y, size)] };
  if (attribution.kind === "tempo" && attribution.slow) return { key: "why.warn.slow", params: [] };
  return null;
}

/**
 * The reason for a hinted move, or null: what the move itself does, read off
 * the board after it (and off its line, for a ladder).
 *   signMap  the board now; color  the side to move
 *   hint     { x, y, pv } (pv starts with the hinted move when it comes from KataGo)
 */
export function hintReason(signMap, color, hint) {
  try {
    return hintWhy(signMap, color, hint);
  } catch (_) {
    return null;
  }
}

function hintWhy(signMap, color, hint) {
  if (!signMap || !hint || hint.pass) return null;
  const pv = hint.pv || [];
  const line = pv[0] && pv[0].x === hint.x && pv[0].y === hint.y ? pv.slice(0, 10) : [{ x: hint.x, y: hint.y }];
  const facts = simulate(signMap, color, line);
  const f = facts[0];
  if (!f || f.pass) return null;
  const opp = { key: colorKey(-color) };
  const n = f.captured.length;
  if (n) return n === 1 ? { key: "why.hint.capture1", params: [] } : { key: "why.hint.capture", params: [n] };
  if (f.ataris.length >= 2) return { key: "why.hint.doubleAtari", params: [] };
  if (f.ladder === "start") return { key: "why.hint.ladder", params: [] };
  if (f.escaped) return { key: "why.hint.escape", params: [] };
  if (f.eyesAfter >= 2 && f.eyesBefore < 2) return { key: "why.hint.secondEye", params: [] };
  if (f.oppEyesLost > 0) return { key: "why.hint.removeEye", params: [opp] };
  if (f.connects >= 2) return { key: "why.hint.connect", params: [] };
  if (realCut(f)) return { key: "why.hint.cut", params: [opp] };
  if (f.ataris.length === 1) return { key: "why.hint.atari", params: [] };
  if (f.zone.corner && f.zone.boxOwn === 0 && f.zone.boxOpp === 0) return { key: "why.hint.corner", params: [] };
  return null;
}

function reasonText(r) {
  if (!r?.key) return "";
  return t(r.key, (r.params || []).map((p) => (p && typeof p === "object" && p.key ? t(p.key) : p)));
}

/** The warning's text: the number, and the reason when there is one. */
export function warningText(points, reason) {
  return reason ? t("teach.bodyWhy", [points, reasonText(reason)]) : t("teach.body", [points]);
}

/** The hint's text: the point, and the reason when there is one. */
export function hintText(label, reason) {
  return reason ? t("play.hintWhy", [label, reasonText(reason)]) : t("play.hintAt", [label]);
}
