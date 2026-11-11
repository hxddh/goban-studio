/**
 * Review: turning an engine line into a short story.
 *
 * `simulate()` plays a line on a real board (rules.js / @sabaki/go-board, so
 * captures and ko are the rules' own) and records the plain facts of every
 * move: what it captured, which chains it put in atari, whether it connected,
 * cut, escaped, made or destroyed an eye, took a ko. `narrate()` picks the
 * one fact that best describes each move and returns an i18n key with its
 * parameters. Nothing here is a template that ignores the position: every
 * description is read off the board as it stands before and after the move.
 *
 * Pure: no DOM, no engine. The tests drive it with constructed positions.
 */
import { boardFromSignMap } from "../rules.js";
import { t } from "../i18n.js";
import { areaName, chains } from "./insight.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const colorRef = (c) => ({ key: c === 1 ? "common.black" : "common.white" });

const inside = (size, x, y) => x >= 0 && y >= 0 && x < size && y < size;

/* ------------------------------------------------------------ eyes */

/**
 * Eyes of `color`: empty regions of one or two points whose every
 * neighbour is a `color` stone. A one-point eye with too many enemy
 * diagonals (one on the edge, two in the middle) is false and not counted.
 * Returns [{ points, chains: Set<chain id> }].
 */
export function eyes(signMap, color, ch = chains(signMap)) {
  const size = signMap.length;
  const seen = new Uint8Array(size * size);
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (signMap[y][x] !== 0 || seen[y * size + x]) continue;
      const pts = [];
      const borders = new Set();
      let ok = true;
      const stack = [[x, y]];
      seen[y * size + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pts.push({ x: cx, y: cy });
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inside(size, nx, ny)) continue;
          const v = signMap[ny][nx];
          if (v === 0) {
            if (!seen[ny * size + nx]) {
              seen[ny * size + nx] = 1;
              stack.push([nx, ny]);
            }
          } else if (v === color) borders.add(ch.id[ny][nx]);
          else ok = false;
        }
      }
      if (!ok || pts.length > 2 || !borders.size) continue;
      if (pts.length === 1) {
        const { x: ex, y: ey } = pts[0];
        let enemy = 0;
        let diagonals = 0;
        for (const [dx, dy] of DIAG) {
          const nx = ex + dx;
          const ny = ey + dy;
          if (!inside(size, nx, ny)) continue;
          diagonals++;
          if (signMap[ny][nx] === -color) enemy++;
        }
        if (diagonals < 4 ? enemy >= 1 : enemy >= 2) continue;
      }
      out.push({ points: pts, chains: borders });
    }
  }
  return out;
}

/** Number of eyes of the group made of `start` chains and everything linked to them through shared eyes. */
function groupEyes(signMap, color, start, ch = chains(signMap), eyeList = eyes(signMap, color, ch)) {
  const group = new Set(start);
  if (!group.size) return 0;
  const counted = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    eyeList.forEach((e, i) => {
      if (counted.has(i)) return;
      if ([...e.chains].some((c) => group.has(c))) {
        counted.add(i);
        for (const c of e.chains) if (!group.has(c)) group.add(c);
        grew = true;
      }
    });
  }
  return counted.size;
}

/* -------------------------------------------------------- simulate */

function neighbourChains(ch, signMap, x, y, color) {
  const size = signMap.length;
  const ids = new Set();
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (inside(size, nx, ny) && signMap[ny][nx] === color) ids.add(ch.id[ny][nx]);
  }
  return [...ids];
}

function stoneSetKey(stones) {
  return new Set(stones.map((s) => s.y * 1000 + s.x));
}

function cornerSpan(size) {
  return size >= 19 ? 5 : size >= 13 ? 4 : 3;
}

/** Which corner box (if any) a point is in, and the box itself. */
function cornerBox(size, x, y) {
  const span = cornerSpan(size);
  const left = x <= span;
  const right = x >= size - 1 - span;
  const top = y <= span;
  const bottom = y >= size - 1 - span;
  if (!((left || right) && (top || bottom))) return null;
  const x0 = left ? 0 : size - 1 - span;
  const y0 = top ? 0 : size - 1 - span;
  return { x0, y0, x1: x0 + span, y1: y0 + span };
}

/**
 * Play `moves` from `signMap`, starting with `firstColor` (colours then
 * alternate, unless a move carries its own `color`). Stops at the first
 * illegal move. `ownership` (Black's point of view, row-major) is optional
 * and only sharpens "invades".
 *
 * Returns one fact object per move played:
 *   { move, color, before, after, captured, ko, ataris, selfAtari,
 *     escaped, connects, cuts, hane, contactOwn, contactOpp,
 *     eyesBefore, eyesAfter, oppEyesLost, zone, nearOwn, nearOpp, own }
 */
export function simulate(signMap, firstColor, moves = [], { ownership = null } = {}) {
  const size = signMap.length;
  let board = boardFromSignMap(signMap);
  let color = firstColor;
  const facts = [];
  for (const mv of moves) {
    if (!mv) break;
    const c = mv.color ?? color;
    if (mv.pass) {
      facts.push({ move: { pass: true }, color: c, pass: true, before: board.signMap, after: board.signMap, captured: [], ataris: [] });
      color = -c;
      continue;
    }
    const { x, y } = mv;
    if (!inside(size, x, y) || board.get([x, y]) !== 0) break;
    let next;
    try {
      next = board.makeMove(c, [x, y], { preventSuicide: true, preventOverwrite: true });
    } catch (_) {
      break;
    }
    const before = board.signMap;
    const after = next.signMap;
    const cb = chains(before);
    const ca = chains(after);
    const captured = [];
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) if (before[yy][xx] === -c && after[yy][xx] === 0) captured.push({ x: xx, y: yy });
    const mine = ca.list[ca.id[y][x]];
    const ko = !!(next._koInfo && next._koInfo.sign === -c);

    // New ataris on the opponent: chains next to the move with one liberty now and more before.
    const ataris = [];
    for (const id of neighbourChains(ca, after, x, y, -c)) {
      const chain = ca.list[id];
      if (chain.libs.length !== 1) continue;
      const s0 = chain.stones[0];
      const was = cb.list[cb.id[s0.y][s0.x]];
      if (was && was.libs.length > 1) ataris.push({ stones: chain.stones, lib: chain.libs[0] });
    }

    // The mover's own chains next to the move, before it.
    const ownIds = neighbourChains(cb, before, x, y, c);
    const ownBefore = ownIds.map((i) => cb.list[i]);
    const escaped = ownBefore.some((ch) => ch.libs.length === 1) && mine.libs.length >= 2;
    const oppIds = neighbourChains(cb, before, x, y, -c);

    // Hane: diagonal to an own stone, bending round an enemy stone that touches both.
    let hane = false;
    for (const [dx, dy] of DIAG) {
      const ax = x + dx;
      const ay = y + dy;
      if (!inside(size, ax, ay) || before[ay][ax] !== c) continue;
      const p = before[y][ax];
      const q = before[ay][x];
      if ((p === -c && q === 0) || (q === -c && p === 0)) hane = true;
    }

    // Eyes: the mover's group, and the enemy groups nearby.
    const eyesBefore = ownIds.length ? groupEyes(before, c, ownIds, cb) : 0;
    const eyesAfter = groupEyes(after, c, [ca.id[y][x]], ca);
    let oppEyesLost = 0;
    if (!captured.length) {
      const near = new Set();
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (inside(size, nx, ny) && before[ny][nx] === -c) near.add(cb.id[ny][nx]);
        }
      const eb = eyes(before, -c, cb);
      const ea = eyes(after, -c, ca);
      for (const id of near) {
        const s0 = cb.list[id].stones[0];
        const n0 = groupEyes(before, -c, [id], cb, eb);
        const n1 = after[s0.y][s0.x] === -c ? groupEyes(after, -c, [ca.id[s0.y][s0.x]], ca, ea) : n0;
        oppEyesLost = Math.max(oppEyesLost, n0 - n1);
      }
    }

    // Where the move is and what is around it.
    let nearOwn = 0;
    let nearOpp = 0;
    for (let yy = 0; yy < size; yy++)
      for (let xx = 0; xx < size; xx++) {
        const v = before[yy][xx];
        if (!v || Math.abs(xx - x) + Math.abs(yy - y) > 3) continue;
        if (v === c) nearOwn++;
        else nearOpp++;
      }
    const box = cornerBox(size, x, y);
    let boxOwn = 0;
    let boxOpp = 0;
    if (box)
      for (let yy = box.y0; yy <= box.y1; yy++)
        for (let xx = box.x0; xx <= box.x1; xx++) {
          if (before[yy][xx] === c) boxOwn++;
          else if (before[yy][xx] === -c) boxOpp++;
        }
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
    const own = ownership ? ownership[y * size + x] * c : null;

    facts.push({
      move: { x, y },
      color: c,
      before,
      after,
      captured,
      ko,
      ataris,
      selfAtari: mine.libs.length === 1 && !captured.length,
      mineStones: mine.stones.length,
      mineLibs: mine.libs.length,
      escaped,
      connects: ownIds.length,
      cuts: oppIds.length,
      hane,
      contactOwn: ownIds.length > 0,
      contactOpp: oppIds.length > 0,
      eyesBefore,
      eyesAfter,
      oppEyesLost,
      zone: { area: areaName(x, y, size), corner: !!box, boxOwn, boxOpp, edge },
      nearOwn,
      nearOpp,
      own,
    });
    board = next;
    color = -c;
  }
  markPatterns(facts);
  return facts;
}

/** Ladders, snapbacks and retaken kos: patterns that span several moves. */
function markPatterns(facts) {
  // Ladder: atari, the chain extends to exactly two liberties, atari again
  // on the same (grown) chain, with the chaser's stones turning corners.
  for (let i = 0; i + 2 < facts.length; i++) {
    let j = i;
    let count = 0;
    while (j + 2 < facts.length) {
      const a = facts[j];
      const run = facts[j + 1];
      const b = facts[j + 2];
      if (a.pass || run.pass || b.pass || a.ataris.length !== 1) break;
      const target = stoneSetKey(a.ataris[0].stones);
      const lib = a.ataris[0].lib;
      if (run.color === a.color || run.move.x !== lib.x || run.move.y !== lib.y || run.mineLibs !== 2) break;
      const hit = b.color === a.color && (b.ataris.some((t) => t.stones.some((s) => target.has(s.y * 1000 + s.x))) || b.captured.some((s) => target.has(s.y * 1000 + s.x)));
      const bends = a.move.x !== b.move.x && a.move.y !== b.move.y;
      if (!hit || !bends) break;
      count++;
      j += 2;
    }
    if (count >= 1 && !facts[i].ladder) {
      facts[i].ladder = "start";
      for (let k = i + 1; k <= j; k++) if (!facts[k].ladder) facts[k].ladder = facts[k].color === facts[i].color ? "chase" : "run";
      i = j - 1;
    }
  }
  // Snapback: a throw-in, captured, and the capturer's stones taken back.
  for (let i = 0; i + 2 < facts.length; i++) {
    const a = facts[i];
    const b = facts[i + 1];
    const c = facts[i + 2];
    if (a.pass || b.pass || c.pass) continue;
    if (a.selfAtari && a.mineStones === 1 && b.captured.length === 1 && b.captured[0].x === a.move.x && b.captured[0].y === a.move.y && c.color === a.color && c.captured.length >= 2 && c.move.x === a.move.x && c.move.y === a.move.y)
      c.snapback = true;
  }
  // A ko taken back is a retake.
  let lastKo = null;
  for (const f of facts) {
    if (f.ko && lastKo && lastKo.color !== f.color && Math.abs(lastKo.move.x - f.move.x) + Math.abs(lastKo.move.y - f.move.y) === 1) f.retake = true;
    if (f.ko) lastKo = f;
  }
}

/* ---------------------------------------------------------- narrate */

/** One fact → { key, params, targets }: the description that fits best. */
export function describe(f) {
  const C = colorRef(f.color);
  if (f.pass) return { key: "story.pass", params: [C], targets: [] };
  const n = f.captured.length;
  if (f.ko) return { key: f.retake ? "story.retakeKo" : "story.takeKo", params: [C], targets: f.captured };
  if (f.snapback) return { key: "story.snapback", params: [C, n], targets: f.captured };
  if (n) return { key: n === 1 ? "story.capture1" : "story.capture", params: n === 1 ? [C] : [C, n], targets: f.captured };
  if (f.ladder === "start") {
    const s = f.ataris[0]?.stones || [];
    return { key: "story.ladderStarts", params: [C], targets: s };
  }
  if (f.ladder === "chase") return { key: "story.ladder", params: [C], targets: f.ataris[0]?.stones || [] };
  if (f.ladder === "run") return { key: "story.ladderRun", params: [C], targets: [] };
  if (f.selfAtari && f.mineStones === 1 && f.contactOpp) return { key: "story.throwIn", params: [C], targets: f.ataris.flatMap((a) => a.stones) };
  if (f.ataris.length >= 2) return { key: "story.doubleAtari", params: [C], targets: f.ataris.flatMap((a) => a.stones) };
  if (f.ataris.length === 1) {
    const s = f.ataris[0].stones;
    return { key: s.length === 1 ? "story.atari1" : "story.atari", params: s.length === 1 ? [C] : [C, s.length], targets: s };
  }
  if (f.eyesAfter >= 2 && f.eyesBefore < 2) return { key: "story.secondEye", params: [C], targets: [] };
  if (f.oppEyesLost > 0) return { key: "story.removeEye", params: [C], targets: [] };
  if (f.eyesAfter > f.eyesBefore) return { key: "story.makeEye", params: [C], targets: [] };
  if (f.escaped) return { key: "story.escape", params: [C], targets: [] };
  if (f.connects >= 2) return { key: "story.connect", params: [C], targets: [] };
  if (f.cuts >= 2) return { key: "story.cut", params: [C], targets: [] };
  if (f.hane) return { key: "story.hane", params: [C], targets: [] };
  if (f.contactOwn && f.contactOpp) return { key: "story.extend", params: [C], targets: [] };
  if (f.contactOpp) return { key: "story.attach", params: [C], targets: [] };
  if (f.contactOwn) return { key: "story.extend", params: [C], targets: [] };
  const z = f.zone;
  const area = { key: "area." + z.area };
  if (z.corner && z.boxOwn === 0 && z.boxOpp > 0) return { key: "story.approach", params: [C], targets: [] };
  if (z.corner && z.boxOwn === 0 && z.boxOpp === 0) return { key: "story.corner", params: [C], targets: [] };
  const invaded = f.own != null ? f.own <= -0.5 && f.nearOwn === 0 : f.nearOpp >= 2 && f.nearOwn === 0;
  if (invaded) return { key: "story.invade", params: [C, area], targets: [] };
  if (f.nearOwn + f.nearOpp === 0 && z.edge >= 2 && z.edge <= 4) return { key: "story.bigPoint", params: [C, area], targets: [] };
  return { key: "story.play", params: [C, area], targets: [] };
}

const DECISIVE = new Set(["story.capture", "story.capture1", "story.secondEye", "story.takeKo", "story.snapback"]);

/**
 * Facts → story steps (3 to 6 when the line is long enough). A long line is
 * cut after its first decisive event (capture, second eye, ko) once three
 * steps are told.
 */
export function narrate(facts, { max = 6, min = 3 } = {}) {
  const out = [];
  for (let i = 0; i < facts.length && out.length < max; i++) {
    const f = facts[i];
    const d = describe(f);
    out.push({
      n: out.length + 1,
      move: f.pass ? { pass: true } : { x: f.move.x, y: f.move.y },
      color: f.color,
      key: d.key,
      params: d.params,
      targets: d.targets.map((p) => ({ x: p.x, y: p.y })),
      captured: (f.captured || []).map((p) => ({ x: p.x, y: p.y })),
    });
    if (out.length >= min && DECISIVE.has(d.key)) break;
  }
  return out;
}

/**
 * Text for a story entry (a step or the summary). Params may be plain
 * values or `{ key }` objects, which are translated first.
 */
export function storyText(entry) {
  if (!entry?.key) return "";
  const params = (entry.params || []).map((p) => (p && typeof p === "object" && p.key ? t(p.key, p.params) : p));
  return t(entry.key, params);
}
