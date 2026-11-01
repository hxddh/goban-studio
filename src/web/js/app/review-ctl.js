/**
 * Review: a layer over any game. Whole-game analysis, live analysis of the
 * position on the board, free variations, explanations of key mistakes, and
 * turning a mistake into a drill.
 */
import { BLACK, Game, influenceMap } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import { markClassic, markOpening, addMistake } from "../persist.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { state, update, toast } from "./store.js";
import { back, canGoBack, remember, isRestoring } from "./ctl-core.js";
import { classifyMistake, lossSource } from "./insight.js";
import { freshGameState, persistCurrent, maybeComputerMove, ponder } from "./play-ctl.js";
import { openMistakeDrill } from "./practice-ctl.js";

/* --------------------------------------------------------- analysis */

/**
 * Analyse every position of the main line. Returns an array aligned with
 * game.mainLine(); null when cancelled. Falls back to the offline estimate
 * per position when KataGo is not there.
 */
export async function analyzeLine(game, { visits = 40, token = { cancelled: false }, onProgress, onPoint } = {}) {
  const line = game.mainLine();
  const points = new Array(line.length).fill(null);
  for (let i = 0; i < line.length; i++) {
    if (token.cancelled) return null;
    let p = null;
    try {
      p = await Engine.analyzeNode(game, line[i], visits);
    } catch (_) {
      p = null;
    }
    if (!p) p = Engine.estimateNode(game, line[i]);
    points[i] = p;
    onPoint?.(i, p);
    onProgress?.(i + 1, line.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return points;
}

/** Score lost by each main-line move, from the mover's point of view. */
export function lossesOf(game, points) {
  const line = game.mainLine();
  const out = [];
  for (let i = 1; i < line.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const move = line[i].move;
    if (!a || !b || !move) continue;
    const delta = b.scoreLead - a.scoreLead;
    const loss = move.color === BLACK ? -delta : delta;
    out.push({ index: i, node: line[i], move, loss, best: a.best, pv: a.pv, before: line[i - 1] });
  }
  return out;
}

/**
 * The costliest moves (of `color`, or of both), explained: where the loss
 * came from, which pattern it looks like, and which moves would have been
 * fine (to grade a drill later).
 */
export function describeMistakes(game, points, color = null, n = 3) {
  const all = lossesOf(game, points);
  const top = all
    .filter((m) => m.loss >= 2 && !m.move.pass && (color == null || m.move.color === color))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, n)
    .sort((a, b) => a.index - b.index)
    .map((m) => {
      const a = points[m.index - 1];
      const b = points[m.index];
      const signMap = m.before.board.signMap;
      const source = lossSource(signMap, a?.ownership, b?.ownership, m.move.color);
      // The line that punishes the mistake: the engine's best reply after it.
      const punish = b?.pv || [];
      const theme = classifyMistake({ signMapBefore: signMap, move: m.move, pv: punish, source, mover: m.move.color });
      const bestLead = a?.moves?.[0]?.scoreLead;
      const accept = (a?.moves || [])
        .filter((c) => !c.pass && (c.visits || 0) > 0 && Number.isFinite(c.scoreLead) && m.move.color * (bestLead - c.scoreLead) <= 1.5)
        .map((c) => ({ x: c.x, y: c.y }));
      return { ...m, source, theme, accept: accept.length ? accept : m.best && !m.best.pass ? [{ x: m.best.x, y: m.best.y }] : [] };
    });
  return { all, top };
}

/* ------------------------------------------------------------- open */

export function openReview(game, meta = {}) {
  if (state.review?.token) state.review.token.cancelled = true;
  stopLive();
  if (!isRestoring()) remember();
  const line = game.mainLine();
  const startAt = meta.startAt ?? line.length - 1;
  game.goto(line[Math.max(0, Math.min(line.length - 1, startAt))].id);
  const review = {
    game,
    source: meta.source || "current",
    meta,
    points: meta.points ? meta.points.slice() : new Array(line.length).fill(null),
    analyzing: false,
    analyzed: meta.points ? line.length : 0,
    engine: meta.points ? meta.points[0]?.source : null,
    keyMoves: [],
    ownership: false,
    variation: null,
    focus: null, // highlighted key move
    live: null,
    hover: null,
    guess: meta.guess ? { color: meta.guessColor ?? null, right: 0, tries: 0, last: null } : null,
    token: { cancelled: false },
  };
  if (meta.points) review.keyMoves = describeMistakes(game, review.points, meta.humanColor ?? null).top;
  update((s) => {
    s.review = review;
    s.space = meta.space || "play";
    s.sheet = null;
    s.menu = null;
  });
  if (!meta.guess && !meta.points) analyzeReview(review);
  startLive();
}

export function closeReview() {
  const r = state.review;
  if (canGoBack() && back()) return;
  if (r?.token) r.token.cancelled = true;
  stopLive();
  dropReview(r);
  const target = r?.meta?.back;
  update((s) => {
    s.review = null;
    if (target) s.space = target;
  });
}

/** Leave a review without touching history (used by restore). */
export function dropReview(r = state.review) {
  if (!r) return;
  if (r.token) r.token.cancelled = true;
  stopLive();
  if (r.source === "current" && state.game) {
    const line = state.game.game.mainLine();
    state.game.game.goto(line[line.length - 1].id);
    maybeComputerMove();
    ponder();
  }
  state.review = null;
}

async function analyzeReview(review) {
  const game = review.game;
  review.analyzing = true;
  update();
  const size = game.size;
  const visits = size === 19 ? 40 : size === 13 ? 56 : 80;
  const points = await analyzeLine(game, {
    visits,
    token: review.token,
    onPoint: (i, p) => {
      review.points[i] = p;
      review.engine = p.source;
    },
    onProgress: (k, n) => {
      review.analyzed = k;
      if (k % 4 === 0 || k === n) {
        review.keyMoves = describeMistakes(game, review.points, review.meta.humanColor ?? null).top;
        update();
      }
    },
  });
  if (!points) return;
  review.analyzing = false;
  review.keyMoves = describeMistakes(game, review.points, review.meta.humanColor ?? null).top;
  if (review.source === "current" && state.game?.game === game) state.game.analysis = review.points;
  update();
}

/* ------------------------------------------------------- navigation */

export function reviewIndex() {
  const r = state.review;
  if (!r) return 0;
  const line = r.game.mainLine();
  const i = line.findIndex((n) => n.id === r.game.current.id);
  return i;
}

/** Depth of the current node from the root (works inside variations). */
export function reviewDepth() {
  const r = state.review;
  let d = 0;
  for (let n = r?.game.current; n && n.parent; n = n.parent) d++;
  return d;
}

export function onMainLine() {
  return reviewIndex() >= 0;
}

export function reviewGoto(index) {
  const r = state.review;
  if (!r) return;
  const line = r.game.mainLine();
  const i = Math.max(0, Math.min(line.length - 1, index));
  gotoNode(line[i]);
}

export function gotoNode(node) {
  const r = state.review;
  if (!r || !node) return;
  r.game.goto(node.id);
  r.variation = null;
  if (r.guess) r.guess.last = null;
  update();
  startLive();
}

export function reviewStep(delta) {
  const r = state.review;
  if (!r) return;
  let node = r.game.current;
  if (delta < 0) for (let k = 0; k < -delta && node.parent; k++) node = node.parent;
  else for (let k = 0; k < delta && node.children[0]; k++) node = node.children[0];
  gotoNode(node);
}

/** Back from a variation to the main-line move it branched from. */
export function backToMainLine() {
  const r = state.review;
  if (!r) return;
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n && !main.has(n.id)) n = n.parent;
  gotoNode(n || r.game.root);
}

/** Variations in the game: main-line nodes with more than one child. */
export function branchPoints() {
  const r = state.review;
  if (!r) return [];
  return r.game
    .mainLine()
    .map((n, i) => ({ node: n, index: i, count: n.children.length - 1 }))
    .filter((b) => b.count > 0);
}

/**
 * A move on the review board: in guess mode it is a guess; otherwise it
 * opens (or follows) a variation from the position on screen.
 */
export function reviewPlay(x, y) {
  const r = state.review;
  if (!r) return;
  if (r.guess) return guessPlay(x, y);
  const cur = r.game.current;
  const existing = cur.children.find((c) => c.move && !c.move.pass && c.move.x === x && c.move.y === y);
  if (existing) return gotoNode(existing);
  const res = r.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  Audio.stone(false);
  r.variation = null;
  update();
  startLive();
}

/** Remove the variation the board is in (back to its branch point). */
export function deleteVariation() {
  const r = state.review;
  if (!r || onMainLine()) return;
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n.parent && !main.has(n.parent.id)) n = n.parent;
  const parent = n.parent;
  parent.children = parent.children.filter((c) => c !== n);
  gotoNode(parent);
}

/* ------------------------------------------------------ live analysis */

let liveCtl = null;
let liveTimer = 0;

export function stopLive() {
  clearTimeout(liveTimer);
  if (liveCtl) liveCtl.abort();
  liveCtl = null;
}

/** Analyse the position on screen (debounced), streaming partial results. */
export function startLive() {
  stopLive();
  const r = state.review;
  if (!r || r.guess || !state.settings.liveAnalysis || !state.engine.available) {
    if (r) r.live = null;
    return;
  }
  const node = r.game.current;
  liveTimer = setTimeout(async () => {
    const ctl = new AbortController();
    liveCtl = ctl;
    const apply = (a) => {
      if (!a || state.review !== r || r.game.current !== node) return;
      r.live = { nodeId: node.id, moves: a.moves, winrate: a.winrate, scoreLead: a.scoreLead, ownership: a.ownership, visits: a.visits, done: false };
      update();
    };
    let a = null;
    try {
      a = await Engine.live(r.game, node, { visits: 260, signal: ctl.signal, onInfo: apply });
    } catch (_) {}
    if (ctl.signal.aborted) return;
    apply(a);
    if (r.live && r.live.nodeId === node.id) r.live.done = true;
    update();
  }, 140);
}

export function toggleLive() {
  const on = !state.settings.liveAnalysis;
  state.settings = { ...state.settings, liveAnalysis: on };
  import("../persist.js").then((m) => m.saveSettings(state.settings));
  if (on) startLive();
  else {
    stopLive();
    if (state.review) state.review.live = null;
  }
  update();
}

/** Current position's numbers: live analysis first, else the whole-game pass. */
export function currentEval() {
  const r = state.review;
  if (!r) return null;
  if (r.live && r.live.nodeId === r.game.current.id) return r.live;
  const i = reviewIndex();
  return i >= 0 ? r.points[i] : null;
}

export function toggleOwnership() {
  if (!state.review) return;
  state.review.ownership = !state.review.ownership;
  update();
}

export function reviewOwnershipMap() {
  const r = state.review;
  if (!r?.ownership) return null;
  const e = currentEval();
  if (e?.ownership) return e.ownership;
  return influenceMap(r.game.current.board);
}

/* ------------------------------------------------------ key mistakes */

/** Show a line on the board: what was played, or the engine's better line. */
export function showVariation(km, kind) {
  const r = state.review;
  if (!r) return;
  r.game.goto(r.game.mainLine()[km.index - 1].id);
  const color = km.move.color;
  let moves = [];
  if (kind === "played") {
    const line = r.game.mainLine().slice(km.index, km.index + 6);
    moves = line.filter((n) => n.move && !n.move.pass).map((n, i) => ({ x: n.move.x, y: n.move.y, c: n.move.color, n: i + 1 }));
  } else {
    let c = color;
    moves = (km.pv || [])
      .slice(0, 6)
      .map((v, i) => {
        const m = v.pass ? null : { x: v.x, y: v.y, c, n: i + 1 };
        c = -c;
        return m;
      })
      .filter(Boolean);
  }
  r.variation = { kind, index: km.index, moves };
  r.focus = km.index;
  update();
  startLive();
}

export function focusMistake(km) {
  const r = state.review;
  if (!r) return;
  r.focus = km.index;
  showVariation(km, "played");
}

/** Turn a key mistake into a drill and start it. */
export function practiceThis(km) {
  const r = state.review;
  if (!r || !km.best || km.best.pass) return;
  const key = r.meta.recordId || r.meta.classicId || r.meta.openingId || "game-" + r.game.root.id;
  const m = {
    gameKey: key,
    index: km.index,
    sgf: r.game.toSGF(),
    color: km.move.color,
    played: { x: km.move.x, y: km.move.y },
    best: { x: km.best.x, y: km.best.y },
    accept: km.accept,
    loss: km.loss,
    theme: km.theme,
    size: r.game.size,
  };
  addMistake(state.progress, m);
  const id = `${key}-${km.index}`;
  openMistakeDrill(id);
}

/* -------------------------------------------------------- guessing */

export function guessPlay(x, y) {
  const r = state.review;
  if (!r?.guess) return;
  const line = r.game.mainLine();
  const i = reviewIndex();
  const next = line[i + 1];
  if (!next?.move) return;
  r.guess.tries++;
  if (!next.move.pass && next.move.x === x && next.move.y === y) {
    r.guess.right++;
    r.guess.last = "right";
    Audio.correct ? Audio.correct() : Audio.stone(false);
    advanceGuess();
  } else {
    r.guess.last = "wrong";
    r.guess.wrongAt = { x, y };
    Audio.wrong?.();
    update();
  }
}

export function revealGuess() {
  const r = state.review;
  if (!r?.guess) return;
  r.guess.last = "revealed";
  advanceGuess();
}

function advanceGuess() {
  const r = state.review;
  const line = r.game.mainLine();
  let i = reviewIndex() + 1;
  r.game.goto(line[i].id);
  const color = r.guess.color;
  while (color != null && i + 1 < line.length && line[i + 1].move?.color !== color) {
    i++;
    r.game.goto(line[i].id);
  }
  if (i >= line.length - 1) {
    r.guess.done = true;
    if (r.meta.openingId) markOpening(state.progress, r.meta.openingId);
    if (r.meta.classicId) markClassic(state.progress, r.meta.classicId);
    Audio.win();
  }
  update();
}

export function toggleGuess() {
  const r = state.review;
  if (!r) return;
  r.guess = r.guess ? null : { color: null, right: 0, tries: 0, last: null };
  if (r.guess) {
    stopLive();
    r.live = null;
  } else startLive();
  update();
}

/* ---------------------------------------------------- play from here */

function moveList(node) {
  const out = [];
  for (let n = node; n && n.parent; n = n.parent) out.push(n.move);
  return out.reverse();
}

export function playFromHere() {
  const r = state.review;
  if (!r) return;
  const src = r.game;
  const node = src.current;
  const game = new Game({ size: src.size, komi: src.komi });
  const root = src.root.board.signMap;
  const setup = [];
  for (let y = 0; y < src.size; y++) for (let x = 0; x < src.size; x++) if (root[y][x]) setup.push({ x, y, c: root[y][x] });
  if (setup.length) game.setup(setup, src.root.turn);
  for (const m of moveList(node)) {
    if (m.pass) game.pass({ color: m.color, force: true });
    else game.play(m.x, m.y, { color: m.color, force: true });
  }
  game.current.result = null;
  if (game.current.phase !== "playing") game.current.phase = "playing";
  if (r.token) r.token.cancelled = true;
  stopLive();
  if (state.game) state.game.gen++;
  remember();
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor, strength: s.settings.strength });
    s.review = null;
    s.space = "play";
  });
  persistCurrent();
  maybeComputerMove();
  ponder();
}

/** Re-open a game from history (restore). */
export function reopenFromLocation(loc, opener) {
  const rv = loc.review;
  if (!rv) return;
  opener(rv);
  if (state.review && rv.index >= 0) reviewGoto(rv.index);
}

export { loadSGF };
