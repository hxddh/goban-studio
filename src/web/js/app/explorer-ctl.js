/**
 * Explorer: the opening and joseki explorer in the Library.
 *
 * The player clicks moves on a 19×19 board. While the position is in the
 * shipped book (book.js, content/book.json) the book's continuations and
 * KataGo's evaluation come from the book, offline. Out of the book, the
 * desktop app continues with live KataGo analysis; the browser preview says
 * the position is out of the book.
 *
 * The explorer's place in history is `state.play.explorer` (the mode, or
 * null), so back/forward in the toolbar work as on any other Library page.
 * The position itself lives in `state.explorer` and survives leaving.
 */
import { BLACK, Game, coordLabel } from "../rules.js";
import * as Engine from "../engine.js";
import { bookDepth, loadBook, lookup, setupSignMap, stonesOf, tagOf, decodeMove } from "../book.js";
import BOOK_JSON from "../content/book.json";
import { state, update, announce } from "./store.js";
import { remember } from "./ctl-core.js";
import { freshGameState, parkCurrent, persistCurrent, maybeComputerMove, ponder } from "./play-ctl.js";

export const EXPLORER_MODES = ["whole", "corner"];

/** The corner tree's own area: the upper-right quarter of the board. */
export const CORNER_AREA = { x0: 9, y0: 0, x1: 18, y1: 9 };

let book = null;
// The app bundle leaves the book out (scripts/bundle.mjs LAZY_DATA:
// BOOK_JSON is null there) and fetches content/book.json once, soon after
// start-up or on first use, whichever comes first; tests bundle it.
let raw = BOOK_JSON;
let fetching = null;

function fetchBook() {
  if (raw || fetching || typeof fetch !== "function") return;
  fetching = fetch("content/book.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("book " + r.status))))
    .then((data) => {
      raw = data;
      // Whatever waited for it (the explorer, a review's book note) shows now.
      refresh();
    })
    .catch((error) => {
      console.warn("The opening book could not be loaded.", error);
      fetching = null;
    });
}

if (!raw && typeof window !== "undefined") {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
  idle(fetchBook, { timeout: 3000 });
}

/** The indexed book, or null while it is still loading. */
export function theBook() {
  if (!book && raw) book = loadBook(raw);
  if (!book) fetchBook();
  return book;
}

function newExplorerGame(mode) {
  const tree = theBook().trees[mode];
  const game = new Game({ size: 19, rules: tree.tree.rules || "japanese", komi: tree.tree.komi ?? 6.5 });
  const m = setupSignMap(tree.tree, 19);
  const stones = stonesOf(m).map(([x, y, c]) => ({ x, y, c }));
  if (stones.length) game.setup(stones, tree.tree.toMove === "W" ? -1 : BLACK);
  return game;
}

function ensure(mode) {
  const e = state.explorer;
  if (e && e.mode === mode) return e;
  if (!theBook()) return null;
  const kept = state.explorerKept?.[mode];
  const next = kept || { mode, game: newExplorerGame(mode), live: null, forward: [] };
  state.explorerKept = { ...(state.explorerKept || {}), [mode]: next };
  state.explorer = next;
  return next;
}

/** Open the explorer (from the Library) in a mode: "whole" or "corner". */
export function openExplorer(mode = "whole") {
  if (!EXPLORER_MODES.includes(mode)) mode = "whole";
  remember();
  update((s) => {
    s.space = "library";
    s.play = { ...s.play, explorer: mode };
  });
  ensure(mode);
  refresh();
}

export function closeExplorer() {
  stopExplorerLive();
  remember();
  update((s) => (s.play = { ...s.play, explorer: null }));
}

/** The explorer state for the mode on screen (created on demand). */
export function explorerState() {
  const mode = state.play?.explorer;
  if (!mode) return null;
  return ensure(mode);
}

export function setExplorerMode(mode) {
  if (!EXPLORER_MODES.includes(mode) || state.play.explorer === mode) return;
  stopExplorerLive();
  update((s) => (s.play = { ...s.play, explorer: mode }));
  ensure(mode);
  refresh();
}

/* ------------------------------------------------------------ book */

/**
 * The book's view of the position on screen: null when out of the book,
 * else { node, continuations, name }.
 */
export function explorerBook(e = explorerState()) {
  if (!e) return null;
  const tree = theBook().trees[e.mode];
  const node = e.game.current;
  const hit = lookup(tree, node.board.signMap, node.turn);
  if (!hit) return null;
  return { ...hit, name: hit.node.name || hit.node.lineName || null };
}

/**
 * How the last move fared, from the position before it: { tag, loss,
 * inBook } or null (first position, or the move before was already out of
 * the book and nothing is known).
 */
export function lastMoveVerdict(e = explorerState()) {
  if (!e) return null;
  const node = e.game.current;
  if (!node.parent || !node.move || node.move.pass) return null;
  const tree = theBook().trees[e.mode];
  const before = lookup(tree, node.parent.board.signMap, node.parent.turn);
  if (!before) return null;
  const c = before.continuations.find((k) => k.x === node.move.x && k.y === node.move.y);
  if (!c) return { tag: null, loss: null, inBook: false, color: node.move.color };
  return { tag: c.tag, loss: c.loss, inBook: c.inBook, color: node.move.color };
}

/**
 * Continuations to show, from the book or from live analysis, each with a
 * letter label: { x, y, label, tag, loss, winrate (for the player to
 * move), score (Black's lead), visits, inBook, source }.
 */
export function explorerCandidates(e = explorerState()) {
  if (!e) return [];
  const hit = explorerBook(e);
  const node = e.game.current;
  const s = node.turn === BLACK ? 1 : -1;
  let list = [];
  if (hit) {
    list = hit.continuations.map((c) => ({ ...c, winrate: s > 0 ? c.winrate : 1 - c.winrate, source: "book" }));
  } else if (e.live && e.live.nodeId === node.id && e.live.moves?.length) {
    const moves = e.live.moves.filter((m) => !m.pass);
    const total = moves.reduce((a, m) => a + (m.visits || 0), 0) || 1;
    const top = moves[0];
    const best = top ? s * top.scoreLead : 0;
    list = moves
      .filter((m, i) => i === 0 || (m.visits || 0) / total >= 0.03)
      .map((m) => {
        const loss = Math.max(0, best - s * m.scoreLead);
        return { x: m.x, y: m.y, move: null, inBook: false, visits: m.visits, winrate: s > 0 ? m.winrate : 1 - m.winrate, score: m.scoreLead, loss, tag: tagOf(loss, false), source: "live" };
      });
  }
  // Letters for the first eight distinct moves; a symmetric image of a move
  // (the other star points on the empty board) carries its letter.
  const out = [];
  const labels = new Map();
  let n = 0;
  list.forEach((c, i) => {
    if (!c.image) {
      if (n >= 8) return;
      labels.set(i, String.fromCharCode(65 + n++));
      out.push({ ...c, label: labels.get(i) });
    } else if (labels.has(c.of)) out.push({ ...c, label: labels.get(c.of) });
  });
  return out;
}

/** Below this many points a loss is noise: the move is as good as the best one, and its row says only what kind of move it is. */
export const LOSS_NOISE = 0.5;

/**
 * What a candidate's row says beside its tag, so that nothing on it is
 * noise: { loss, winrate, visits }. `loss` is the points lost to one
 * decimal, or null within LOSS_NOISE; `winrate` whether the win rate is
 * worth showing (a live candidate, or a move that loses something: the
 * book's good moves all sit within a point of 50%); `visits` whether the
 * search count is (a live search with visits; never "0").
 */
export function candidateShows(c) {
  const loss = c?.loss != null && c.loss >= LOSS_NOISE ? Math.round(c.loss * 10) / 10 : null;
  const live = c?.source === "live";
  return { loss, winrate: (live || loss != null) && Number.isFinite(c?.winrate), visits: live && c.visits > 0 };
}

/** Black's win rate and score lead for the position, from book or live. */
export function explorerEval(e = explorerState()) {
  if (!e) return null;
  const hit = explorerBook(e);
  if (hit) return { winrate: hit.node.winrate, score: hit.node.score, visits: hit.node.visits, source: "book" };
  const node = e.game.current;
  if (e.live && e.live.nodeId === node.id && e.live.moves?.length) {
    const top = e.live.moves[0];
    return { winrate: e.live.winrate ?? top.winrate, score: e.live.scoreLead ?? top.scoreLead, visits: e.live.visits || null, source: "live", done: e.live.done };
  }
  return null;
}

/** Whether a move is local to the tree (always, for the whole board). */
export function isLocal(mode, x, y) {
  if (mode !== "corner") return true;
  const v = CORNER_AREA;
  return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
}

/**
 * The corner tree zooms to its own area while every move of the line is
 * in it (a tenuki shows the whole board). The player can turn it off.
 */
export function explorerZoomable(e = explorerState()) {
  if (!e || e.mode !== "corner") return false;
  for (let n = e.game.current; n && n.parent; n = n.parent) {
    if (n.move && !n.move.pass && !isLocal("corner", n.move.x, n.move.y)) return false;
  }
  return true;
}

export function explorerZoomed(e = explorerState()) {
  return explorerZoomable(e) && e.zoom !== false;
}

/** The board window for the explorer: the corner area, or null. */
export function explorerView(e = explorerState()) {
  return explorerZoomed(e) ? { ...CORNER_AREA } : null;
}

export function toggleExplorerZoom() {
  const e = explorerState();
  if (!e || e.mode !== "corner") return;
  e.zoom = e.zoom === false;
  update();
}

export function pointLabel(x, y) {
  return coordLabel(x, y, 19);
}

/* ------------------------------------------------------------ moves */

export function explorerPlay(x, y) {
  const e = explorerState();
  if (!e) return;
  const g = e.game;
  // Following an existing branch keeps it; a new move branches.
  const existing = g.current.children.find((c) => c.move && !c.move.pass && c.move.x === x && c.move.y === y);
  if (existing) g.current = existing;
  else if (!g.play(x, y).ok) return;
  e.forward = [];
  refresh();
  const v = lastMoveVerdict(e);
  announce(pointLabel(x, y));
  return v;
}

export function explorerStep(delta) {
  const e = explorerState();
  if (!e) return;
  const g = e.game;
  if (delta < 0) {
    for (let i = 0; i < -delta && g.current.parent; i++) {
      e.forward.unshift(g.current);
      g.current = g.current.parent;
    }
  } else {
    for (let i = 0; i < delta; i++) {
      const next = e.forward[0]?.parent === g.current ? e.forward.shift() : g.current.children[g.current.children.length - 1];
      if (!next) break;
      g.current = next;
    }
  }
  refresh();
}

export function explorerCanStep(delta) {
  const e = explorerState();
  if (!e) return false;
  return delta < 0 ? !!e.game.current.parent : !!(e.forward[0] || e.game.current.children.length);
}

/** Back to the start of the tree; the line stays reachable with forward. */
export function explorerReset() {
  const e = explorerState();
  if (!e) return;
  const g = e.game;
  const line = [];
  for (let n = g.current; n.parent; n = n.parent) line.unshift(n);
  e.forward = line;
  g.current = g.root;
  refresh();
}

/** Moves from the start of the tree to the position on screen. */
export function explorerMoveCount(e = explorerState()) {
  let n = 0;
  for (let p = e?.game.current; p && p.parent; p = p.parent) n++;
  return n;
}

/* ---------------------------------------------------- live analysis */

let liveCtl = null;
let liveTimer = 0;

export function stopExplorerLive() {
  clearTimeout(liveTimer);
  if (liveCtl) liveCtl.abort();
  liveCtl = null;
}

function refresh() {
  stopExplorerLive();
  const e = explorerState();
  update();
  if (!e || explorerBook(e) || !state.engine.available) return;
  const node = e.game.current;
  if (e.live?.nodeId === node.id && e.live.done) return;
  liveTimer = setTimeout(async () => {
    const ctl = new AbortController();
    liveCtl = ctl;
    const apply = (a) => {
      if (!a || state.explorer !== e || e.game.current !== node) return;
      e.live = { nodeId: node.id, moves: a.moves, winrate: a.winrate, scoreLead: a.scoreLead, visits: a.visits, done: false };
      update();
    };
    let a = null;
    try {
      a = await Engine.live(e.game, node, { visits: 260, signal: ctl.signal, onInfo: apply });
    } catch (_) {}
    if (ctl.signal.aborted) return;
    apply(a);
    if (e.live && e.live.nodeId === node.id) e.live.done = true;
    update();
  }, 160);
}

/* ---------------------------------------------------- play from here */

/** Start a game against the computer from the position on screen. */
export function explorerPlayFromHere() {
  const e = explorerState();
  if (!e) return;
  stopExplorerLive();
  const src = e.game;
  const game = new Game({ size: 19, rules: src.rules, komi: src.komi });
  const root = src.root.board.signMap;
  const setup = [];
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (root[y][x]) setup.push({ x, y, c: root[y][x] });
  if (setup.length) game.setup(setup, src.root.turn);
  const line = [];
  for (let n = src.current; n && n.parent; n = n.parent) line.unshift(n.move);
  for (const m of line) game.play(m.x, m.y, { color: m.color, force: true });
  // The game in progress goes to the Library as unfinished first.
  parkCurrent();
  if (state.game) state.game.gen++;
  remember();
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor });
    s.review = null;
    s.space = "play";
    // The new game on its board (the explorer would hide it).
    s.play = { ...s.play, view: "game", explorer: null };
  });
  persistCurrent();
  maybeComputerMove();
  ponder();
}

/* ---------------------------------------------------------- review */

/**
 * For review: where a 19×19 game from the empty board leaves the
 * whole-board book. Returns the number of book moves (0 = not in the book)
 * or null for games the book does not cover (other sizes, set-up stones).
 */
export function bookExit(game) {
  if (!game || game.size !== 19) return null;
  if (stonesOf(game.root.board.signMap).length) return null;
  const b = theBook();
  if (!b) return null;
  const moves = game.mainLine().slice(1).map((n) => n.move);
  return bookDepth(b.trees.whole, moves);
}

export { decodeMove };
