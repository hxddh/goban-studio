/**
 * Everything the app does, as plain functions over the store.
 *
 * Views call these; none of them touches the DOM. Rules live in rules.js,
 * the engine behind engine.js, practice problems behind solver.js.
 */
import { BLACK, WHITE, Game, coordLabel, formatPoints } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as S from "../solver.js";
import * as Lib from "../library.js";
import { influenceMap } from "../rules.js";
import {
  DEFAULT_SETTINGS,
  clearAll,
  dailySet,
  loadProgress,
  loadSettings,
  markClassic,
  markLesson,
  markOpening,
  markProblem,
  migrate,
  saveSettings,
  todayKey,
  touchStreak,
} from "../persist.js";
import { detectLang, setLang, t } from "../i18n.js";
import { lose, pass as soundPass, setSound, stone as soundStone, win } from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readTextFile, revealPath, saveFileDialog, writeTextFile } from "../host.js";
import { COURSE } from "../content/course.js";
import { PROBLEMS } from "../content/problems.js";
import GRADES from "../content/problem-grades.json";
import { OPENINGS } from "../content/openings.js";
import { CLASSICS } from "../content/classics.js";
import { state, update, toast, announce } from "./store.js";

export { COURSE, PROBLEMS, GRADES, OPENINGS, CLASSICS };

export const tx = (obj) => (obj ? obj[state.settings.lang] ?? obj.en ?? obj.zh ?? "" : "");

/* ------------------------------------------------------------ settings */

export function applyAppearance() {
  const s = state.settings;
  const root = document.documentElement;
  const dark = s.appearance === "dark" || (s.appearance === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
}

export function setSetting(key, value) {
  update((s) => {
    s.settings = { ...s.settings, [key]: value };
  });
  saveSettings(state.settings);
  if (key === "lang") setLang(value);
  if (key === "sound") setSound(value);
  if (key === "appearance") applyAppearance();
}

export function boot() {
  migrate();
  const settings = loadSettings();
  if (!settings.lang) settings.lang = detectLang();
  state.settings = settings;
  state.progress = loadProgress();
  setLang(settings.lang);
  setSound(settings.sound);
  applyAppearance();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyAppearance);
  restoreCurrent();
  if (!settings.onboarded) state.sheet = { kind: "onboarding", step: 0 };
  state.ready = true;
  update();
  Engine.info().then((info) => {
    update({ engine: info });
    // A game restored at the computer's turn continues once the engine is known.
    maybeComputerMove();
  });
}

export function openSheet(kind, props = {}) {
  update({ sheet: { kind, ...props }, menu: null });
}

export function closeSheet() {
  if (state.sheet?.kind === "onboarding") return;
  update({ sheet: null });
}

export function confirmAction({ title, body = "", confirm, danger = false, onConfirm }) {
  openSheet("confirm", { title, body, confirm, danger, onConfirm });
}

export function goSpace(space) {
  // Clicking the space you are in goes back to its top level.
  if (space === state.space) {
    if (space === "practice" && state.practice.view !== "home") return practiceHome();
    if (space === "library" && state.review?.meta.space === "library") return closeReview();
  }
  update((s) => {
    s.space = space;
    s.menu = null;
  });
  if (space === "play") maybeComputerMove();
}

export function toggleFocus() {
  setSetting("focus", !state.settings.focus);
}

/* ---------------------------------------------------------------- play */

function freshGameState(game, meta = {}) {
  return {
    game,
    recordId: meta.recordId || null,
    name: meta.name || "",
    opponent: meta.opponent === "human" ? "human" : "ai",
    humanColor: meta.humanColor === WHITE ? WHITE : BLACK,
    strength: meta.strength || state.settings.strength,
    thinking: false,
    gen: 0,
    hint: null,
    scoring: null,
    undos: meta.undos || 0,
    hints: meta.hints || 0,
    saved: !!meta.recordId,
  };
}

function restoreCurrent() {
  const saved = Lib.loadCurrent();
  if (saved?.sgf) {
    try {
      const { game } = loadSGF(saved.sgf);
      state.game = freshGameState(game, saved);
      return;
    } catch (_) {
      /* fall through */
    }
  }
  state.game = freshGameState(new Game({ size: 9, komi: 6.5 }), { opponent: "ai", strength: state.settings.strength });
}

function persistCurrent() {
  const g = state.game;
  if (!g) return;
  Lib.saveCurrent(g.game, {
    recordId: g.recordId,
    humanColor: g.humanColor,
    opponent: g.opponent,
    strength: g.strength,
    name: g.name,
    undos: g.undos,
    hints: g.hints,
  });
}

function recordMeta(g) {
  return {
    id: g.recordId,
    name: g.name,
    humanColor: g.humanColor,
    opponent: g.opponent,
    strength: g.opponent === "ai" ? g.strength : null,
    undos: g.undos,
    hints: g.hints,
    source: "game",
  };
}

/** Finished or explicitly saved games go to the library; nothing else does. */
export function saveToLibrary({ quiet = false } = {}) {
  const g = state.game;
  if (!g || g.game.moveNumber === 0) return null;
  const rec = Lib.saveGame(g.game, recordMeta(g));
  g.recordId = rec.id;
  g.saved = true;
  persistCurrent();
  update();
  if (!quiet) toast(t("toast.saved"));
  return rec;
}

/** Play shows a review instead of the live game. */
export function playReviewing() {
  return !!state.review && (state.review.meta.space || "play") === "play";
}

export function isComputerTurn() {
  const g = state.game;
  return !!g && g.opponent === "ai" && g.game.phase === "playing" && !g.game.current.result && g.game.turn !== g.humanColor;
}

export function newGame(opts = {}) {
  const size = [9, 13, 19].includes(Number(opts.size)) ? Number(opts.size) : 19;
  const handicap = Math.max(0, Math.min(9, Number(opts.handicap) || 0));
  const komi = opts.komi !== undefined && Number.isFinite(Number(opts.komi)) ? Number(opts.komi) : handicap > 0 ? 0.5 : 6.5;
  const game = new Game({ size, komi, handicap });
  let humanColor = opts.color === WHITE ? WHITE : BLACK;
  if (opts.color === "random") humanColor = Math.random() < 0.5 ? BLACK : WHITE;
  const opponent = opts.opponent === "human" ? "human" : "ai";
  if (opponent === "ai") {
    game.playerBlack = humanColor === BLACK ? t("play.you") : "KataGo";
    game.playerWhite = humanColor === WHITE ? t("play.you") : "KataGo";
  }
  const strength = opts.strength || state.settings.strength;
  if (opts.strength) setSetting("strength", opts.strength);
  if (state.game) state.game.gen++;
  update((s) => {
    s.game = freshGameState(game, { opponent, humanColor, strength });
    s.space = "play";
    s.playMode = "game";
    s.sheet = null;
    s.review = null;
  });
  persistCurrent();
  announce(t("a11y.newGame", [size]));
  maybeComputerMove();
}

export function canPlayHere(x, y) {
  const g = state.game;
  if (!g || g.scoring) return true;
  return g.game.canPlay(x, y).ok;
}

export function humanPlay(x, y) {
  const g = state.game;
  if (!g || playReviewing()) return;
  if (g.scoring) return toggleDead(x, y);
  if (g.thinking || g.game.phase !== "playing" || g.game.current.result) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  playOnGame(x, y);
}

function captureTotal(game) {
  const c = game.capturesOf(game.current);
  return (c.black || 0) + (c.white || 0);
}

function playOnGame(x, y) {
  const g = state.game;
  const before = captureTotal(g.game);
  const color = g.game.turn;
  const res = g.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return false;
  }
  const captured = captureTotal(g.game) - before;
  soundStone(captured > 0);
  announce(t("a11y.move", [t(color === BLACK ? "common.black" : "common.white"), coordLabel(x, y, g.game.size)]) + (captured ? " · " + t("a11y.captured", [captured]) : ""));
  afterMove();
  return true;
}

function afterMove() {
  const g = state.game;
  g.hint = null;
  if (g.game.phase === "scoring" && !g.scoring) startScoring();
  persistCurrent();
  update();
  maybeComputerMove();
}

export async function maybeComputerMove() {
  const g = state.game;
  if (!g || g.thinking || !isComputerTurn() || playReviewing()) return;
  const gen = ++g.gen;
  g.thinking = true;
  update();
  let move = null;
  const started = performance.now();
  try {
    move = await Engine.chooseMove(g.game, g.strength);
  } catch (_) {
    move = null;
  }
  // A short, human pause so a fast engine reply does not feel like a snap.
  const wait = 260 - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (state.game !== g || gen !== g.gen) return;
  g.thinking = false;
  if (!move || !isComputerTurn()) {
    update();
    return;
  }
  if (move.pass) {
    g.game.pass();
    soundPass();
    toast(t("play.computerPassed"));
    announce(t("play.computerPassed"));
    afterMove();
  } else if (!playOnGame(move.x, move.y)) {
    g.game.pass();
    afterMove();
  }
}

export function undo() {
  const g = state.game;
  if (!g || playReviewing() || !g.game.current.parent) return;
  g.gen++;
  g.thinking = false;
  g.scoring = null;
  g.hint = null;
  if (g.game.current.result) g.game.current.result = null;
  g.game.undo();
  if (g.opponent === "ai" && g.game.turn !== g.humanColor && g.game.current.parent) g.game.undo();
  g.undos++;
  persistCurrent();
  update();
  maybeComputerMove();
}

export function requestPass() {
  const g = state.game;
  if (!g || g.thinking || g.game.phase !== "playing" || g.game.current.result) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  confirmAction({
    title: t("play.passConfirm"),
    body: t("play.passBody"),
    confirm: t("common.pass"),
    onConfirm: () => {
      g.game.pass();
      soundPass();
      announce(t("common.pass"));
      afterMove();
    },
  });
}

export function requestResign() {
  const g = state.game;
  if (!g || g.game.phase !== "playing" || g.game.current.result) return;
  confirmAction({
    title: t("play.resignConfirm"),
    confirm: t("common.resign"),
    danger: true,
    onConfirm: () => {
      const color = g.opponent === "ai" ? g.humanColor : g.game.turn;
      g.gen++;
      g.thinking = false;
      g.game.resign(color);
      finishGame();
    },
  });
}

export async function askHint() {
  const g = state.game;
  if (!g || g.thinking || g.game.phase !== "playing" || g.game.current.result) return;
  update({ menu: null });
  g.thinking = true;
  update();
  let h = null;
  try {
    h = await Engine.hint(g.game);
  } catch (_) {
    h = null;
  }
  g.thinking = false;
  g.hints++;
  if (h && !h.pass) {
    g.hint = { x: h.x, y: h.y };
    announce(t("play.hintAt", [coordLabel(h.x, h.y, g.game.size)]));
  } else toast(t("play.hintPass"));
  persistCurrent();
  update();
}

async function startScoring() {
  const g = state.game;
  g.scoring = { dead: [], score: g.game.score([]), source: "pending" };
  update();
  let dead = { stones: [], source: "manual" };
  try {
    dead = await Engine.deadStones(g.game);
  } catch (_) {}
  if (state.game !== g || !g.scoring) return;
  g.scoring = { dead: dead.stones, score: g.game.score(dead.stones), source: dead.source };
  update();
}

export function toggleDead(x, y) {
  const g = state.game;
  if (!g?.scoring) return;
  const v = g.game.board.get([x, y]);
  if (!v) return;
  // Toggle the whole chain: dead stones die together.
  const chain = g.game.board.getChain([x, y]).map(([cx, cy]) => ({ x: cx, y: cy }));
  const isDead = g.scoring.dead.some((d) => d.x === x && d.y === y);
  let dead = g.scoring.dead.filter((d) => !chain.some((c) => c.x === d.x && c.y === d.y));
  if (!isDead) dead = dead.concat(chain);
  g.scoring = { ...g.scoring, dead, score: g.game.score(dead) };
  update();
}

export function confirmScore() {
  const g = state.game;
  if (!g?.scoring) return;
  g.game.setResult(g.scoring.score.result);
  g.scoring = null;
  finishGame();
}

export function resumePlay() {
  const g = state.game;
  if (!g?.scoring) return;
  g.game.resumePlay();
  g.scoring = null;
  persistCurrent();
  update();
  maybeComputerMove();
}

function finishGame() {
  const g = state.game;
  const result = g.game.current.result;
  if (g.opponent === "ai" && result) {
    const blackWon = result.startsWith("B");
    if (blackWon === (g.humanColor === BLACK)) win();
    else lose();
  }
  saveToLibrary({ quiet: true });
  announce(resultText(result));
  update();
}

export function resultText(result) {
  if (!result) return "";
  if (/^draw$/i.test(result) || result === "0") return t("common.draw");
  const color = result[0] === "B" ? t("common.black") : t("common.white");
  const rest = result.slice(2);
  if (rest === "R" || rest === "Resign") return t("result.resign", [color]);
  if (rest === "T") return t("result.time", [color]);
  return t("result.points", [color, rest]);
}

/** Who is winning, in words, for the result card. */
export function resultHeadline(g) {
  const r = g.game.current.result;
  if (!r) return "";
  if (g.opponent !== "ai") return resultText(r);
  const blackWon = r.startsWith("B");
  return blackWon === (g.humanColor === BLACK) ? t("result.youWon") : t("result.youLost");
}

export async function exportSGF(game = state.game?.game, name = state.game?.name) {
  if (!game) return;
  update({ menu: null });
  const text = game.toSGF();
  const filename = (name || "goban-studio") + ".sgf";
  if (hasNative() && hasFileDialogs()) {
    const path = await saveFileDialog({ title: t("common.export"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeTextFile(chosen, text))) {
      revealPath(chosen);
      toast(t("toast.exported"));
      return;
    }
  }
  const blob = new Blob([text], { type: "application/x-go-sgf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("toast.exported"));
}

/* -------------------------------------------------------------- review */

function moveList(node) {
  const out = [];
  for (let n = node; n && n.parent; n = n.parent) out.push(n.move);
  return out.reverse();
}

/**
 * Open a game for review. `source` is "current" (the game in Play), or a
 * standalone game from the library, a classic or an opening.
 */
export function openReview(game, meta = {}) {
  if (state.review?.token) state.review.token.cancelled = true;
  const line = game.mainLine();
  const startAt = meta.startAt ?? line.length - 1;
  game.goto(line[Math.max(0, Math.min(line.length - 1, startAt))].id);
  const review = {
    game,
    source: meta.source || "current",
    meta,
    points: new Array(line.length).fill(null),
    analyzing: false,
    analyzed: 0,
    engine: null,
    keyMoves: [],
    ownership: false,
    variation: null,
    guess: meta.guess ? { color: meta.guessColor ?? null, right: 0, tries: 0, last: null } : null,
    token: { cancelled: false },
  };
  update((s) => {
    s.review = review;
    s.space = meta.space || "play";
    s.playMode = "review";
    s.sheet = null;
    s.menu = null;
  });
  if (!meta.guess) analyzeReview(review);
}

export function reviewCurrentGame() {
  const g = state.game;
  if (!g || g.game.mainLine().length < 2) return;
  g.gen++;
  g.thinking = false;
  openReview(g.game, { source: "current", humanColor: g.opponent === "ai" ? g.humanColor : null });
}

export function closeReview() {
  const r = state.review;
  if (r?.token) r.token.cancelled = true;
  if (r?.source === "current" && state.game) {
    // Return to the live position.
    const line = state.game.game.mainLine();
    state.game.game.goto(line[line.length - 1].id);
  }
  const back = r?.meta?.back;
  update((s) => {
    s.review = null;
    s.playMode = "game";
    if (back) s.space = back;
  });
  if (!back) maybeComputerMove();
}

async function analyzeReview(review) {
  const game = review.game;
  const line = game.mainLine();
  review.analyzing = true;
  update();
  const size = game.size;
  const visits = size === 19 ? 40 : size === 13 ? 56 : 80;
  // Analyse in order, but start with the position on screen so the panel
  // has something to say right away.
  for (let i = 0; i < line.length; i++) {
    if (review.token.cancelled) return;
    let p = null;
    try {
      p = await Engine.analyzeNode(game, line[i], visits);
    } catch (_) {
      p = null;
    }
    if (!p) p = Engine.estimateNode(game, line[i]);
    review.points[i] = p;
    review.analyzed = i + 1;
    review.engine = p.source;
    if (i % 4 === 3 || i === line.length - 1) {
      review.keyMoves = keyMoves(review);
      update();
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  review.analyzing = false;
  review.keyMoves = keyMoves(review);
  update();
}

/** Score lost by each move, from the mover's point of view. */
export function moveLosses(review) {
  const line = review.game.mainLine();
  const out = [];
  for (let i = 1; i < line.length; i++) {
    const a = review.points[i - 1];
    const b = review.points[i];
    const move = line[i].move;
    if (!a || !b || !move) continue;
    const delta = b.scoreLead - a.scoreLead;
    const loss = move.color === BLACK ? -delta : delta;
    out.push({ index: i, node: line[i], move, loss, best: a.best, pv: a.pv });
  }
  return out;
}

function keyMoves(review) {
  const humanColor = review.meta.humanColor ?? null;
  return moveLosses(review)
    .filter((m) => m.loss >= 2 && !m.move.pass && (humanColor == null || m.move.color === humanColor))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);
}

export function reviewGoto(index) {
  const r = state.review;
  if (!r) return;
  const line = r.game.mainLine();
  const i = Math.max(0, Math.min(line.length - 1, index));
  r.game.goto(line[i].id);
  r.variation = null;
  if (r.guess) r.guess.last = null;
  update();
}

export function reviewIndex() {
  const r = state.review;
  if (!r) return 0;
  const line = r.game.mainLine();
  const i = line.findIndex((n) => n.id === r.game.current.id);
  return i < 0 ? 0 : i;
}

export function reviewStep(delta) {
  reviewGoto(reviewIndex() + delta);
}

/** Show a line on the board: the move played, or the engine's better line. */
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
  update();
}

export function toggleOwnership() {
  if (!state.review) return;
  state.review.ownership = !state.review.ownership;
  update();
}

export function reviewOwnershipMap() {
  const r = state.review;
  if (!r?.ownership) return null;
  const p = r.points[reviewIndex()];
  if (p?.ownership) return p.ownership;
  return influenceMap(r.game.current.board);
}

/** Continue a reviewed position as a new game against the computer. */
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
  if (state.game) state.game.gen++;
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor, strength: s.settings.strength });
    s.review = null;
    s.playMode = "game";
    s.space = "play";
  });
  persistCurrent();
  maybeComputerMove();
}

/** Guess-the-next-move study (classics and openings). */
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
    soundStone(false);
    advanceGuess();
  } else {
    r.guess.last = "wrong";
    r.guess.wrongAt = { x, y };
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
  // Opponent moves in an opening drill play themselves.
  const color = r.guess.color;
  while (color != null && i + 1 < line.length && line[i + 1].move?.color !== color) {
    i++;
    r.game.goto(line[i].id);
  }
  if (i >= line.length - 1) {
    r.guess.done = true;
    if (r.meta.openingId) markOpening(state.progress, r.meta.openingId);
    if (r.meta.classicId) markClassic(state.progress, r.meta.classicId);
    win();
  }
  update();
}

export function toggleGuess() {
  const r = state.review;
  if (!r) return;
  r.guess = r.guess ? null : { color: null, right: 0, tries: 0, last: null };
  update();
}

/* ------------------------------------------------------------- library */

export function openRecord(id) {
  const rec = Lib.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    openReview(game, { source: "record", recordId: rec.id, name: rec.name, humanColor: rec.opponent === "ai" ? rec.humanColor : null, space: "library", back: "library", startAt: 0 });
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
}

export function openClassic(id) {
  const c = CLASSICS.find((g) => g.id === id);
  if (!c) return;
  try {
    const { game } = loadSGF(c.sgf);
    markClassic(state.progress, c.id);
    openReview(game, { source: "classic", classic: c, classicId: c.id, startAt: 0, space: "library", back: "library" });
  } catch (e) {
    toast(t("library.importError"), "error");
  }
}

export function openOpening(id) {
  const o = OPENINGS.find((g) => g.id === id);
  if (!o) return;
  const game = new Game({ size: o.size || 19, komi: o.komi ?? 6.5 });
  if (o.setup?.length) game.setup(o.setup, o.toMove);
  for (const m of o.line) game.play(m.x, m.y, { color: m.c, force: true });
  openReview(game, { source: "opening", opening: o, openingId: o.id, startAt: 0, guess: true, guessColor: o.toMove, space: "library", back: "library" });
}

export function continueCurrent() {
  update((s) => {
    s.space = "play";
    s.playMode = "game";
    s.review = null;
  });
  maybeComputerMove();
}

export function deleteRecord(id) {
  confirmAction({
    title: t("library.deleteConfirm"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      Lib.deleteGame(id);
      update();
    },
  });
}

export function renameRecord(id, name) {
  Lib.renameGame(id, name);
  update();
}

export function exportRecord(id) {
  const rec = Lib.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    exportSGF(game, rec.name || "goban-studio");
  } catch (_) {
    toast(t("library.importError"), "error");
  }
}

export async function importSGFText(text, name = "goban-studio.sgf") {
  const { game, warnings } = loadSGF(text);
  const rec = Lib.saveGame(game, { name: String(name).replace(/\.sgf$/i, ""), source: "import" });
  if (!state.settings.onboarded) {
    setSetting("onboarded", true);
    update({ sheet: null });
  }
  openReview(game, { source: "record", recordId: rec.id, name: rec.name, space: "library", back: "library", startAt: 0 });
  if (warnings.length) toast(warnings[0], "warn");
}

export async function importFromFile(file) {
  if (!file) return;
  try {
    await importSGFText(await file.text(), file.name);
  } catch (e) {
    toast(t(e?.code === "unsupported-rules" ? "library.rulesUnsupported" : "library.importError"), "error");
  }
}

export async function importFromPath(path) {
  try {
    const text = await readTextFile(path);
    if (text == null) throw new Error("read failed");
    await importSGFText(text, String(path).split(/[/\\]/).pop() || "goban-studio.sgf");
  } catch (e) {
    console.error("SGF import failed", e);
    toast(t(e?.code === "unsupported-rules" ? "library.rulesUnsupported" : "library.importError"), "error");
  }
}

export async function pickImport() {
  update({ menu: null });
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("library.import"), allowMultiple: false });
    const paths = normalizePaths(files);
    if (paths.length) importFromPath(paths[0]);
    return;
  }
  document.getElementById("file-input")?.click();
}

export function clearData() {
  confirmAction({
    title: t("settings.clearConfirm"),
    body: t("settings.clearBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      clearAll();
      location.reload();
    },
  });
}

/* ------------------------------------------------------------ practice */

const gradeOf = (id) => GRADES[id]?.grade || 1;
export { gradeOf };

export function allLessons() {
  const out = [];
  for (const unit of COURSE) for (const lesson of unit.lessons) out.push({ unit, lesson });
  return out;
}

export function nextLesson() {
  return allLessons().find(({ lesson }) => !state.progress.lessons[lesson.id]?.done) || null;
}

function buildStep(step) {
  if (step.kind === "problem") {
    const pz = S.createPuzzle(step.problem);
    return { kind: "problem", step, pz, ...problemState(pz) };
  }
  if (step.kind === "place") {
    const pz = boardPuzzle(step.board);
    return { kind: "place", step, pz, board: pz.board, toMove: step.toMove ?? BLACK, result: null, wrongAt: null };
  }
  const pz = step.board ? boardPuzzle(step.board) : null;
  return { kind: "read", step, pz, board: pz?.board || null, result: "done" };
}

/** A display-only board from a diagram (place/read steps). */
function boardPuzzle(b) {
  const size = b.size || 19;
  const d = S.parseDiagram(b.diagram);
  let x0 = 0;
  let y0 = 0;
  if (b.at) [x0, y0] = b.at;
  else {
    const corner = b.corner || "tl";
    if (corner.includes("r")) x0 = size - d.w;
    if (corner.includes("b")) y0 = size - d.h;
  }
  const board = Array.from({ length: size }, () => Array(size).fill(0));
  for (const s of d.stones) board[s.y + y0][s.x + x0] = s.c;
  const full = d.w >= size && d.h >= size;
  const pad = 2;
  const view = full
    ? null
    : {
        x0: Math.max(0, x0 === 0 ? 0 : x0 - pad),
        y0: Math.max(0, y0 === 0 ? 0 : y0 - pad),
        x1: Math.min(size - 1, x0 + d.w - 1 + (x0 + d.w >= size ? 0 : pad)),
        y1: Math.min(size - 1, y0 + d.h - 1 + (y0 + d.h >= size ? 0 : pad)),
      };
  if (view) {
    const span = Math.max(view.x1 - view.x0, view.y1 - view.y0, 6);
    while (view.x1 - view.x0 < span && (view.x1 < size - 1 || view.x0 > 0)) {
      if (view.x1 < size - 1 && x0 + d.w < size) view.x1++;
      else if (view.x0 > 0) view.x0--;
      else view.x1++;
    }
    while (view.y1 - view.y0 < span && (view.y1 < size - 1 || view.y0 > 0)) {
      if (view.y1 < size - 1 && y0 + d.h < size) view.y1++;
      else if (view.y0 > 0) view.y0--;
      else view.y1++;
    }
  }
  return { size, board, x0, y0, view };
}

function problemState(pz) {
  return { st: S.initialState(pz), history: [], status: "open", feedback: null, busy: false, used: false, hintAt: null, answer: null, last: null };
}

export function openLesson(lessonId, stepIndex = null) {
  const found = allLessons().find((l) => l.lesson.id === lessonId);
  if (!found) return;
  const saved = state.progress.lessons[lessonId];
  const index = stepIndex ?? (saved && !saved.done ? Math.min(saved.step || 0, found.lesson.steps.length - 1) : 0);
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "lesson", lesson: { unit: found.unit, lesson: found.lesson, index, cur: buildStep(found.lesson.steps[index]) } };
  });
}

export function lessonContinue() {
  const L = state.practice.lesson;
  if (!L) return;
  const next = L.index + 1;
  if (next >= L.lesson.steps.length) {
    markLesson(state.progress, L.lesson.id, { done: true, step: next });
    touchStreak(state.progress);
    win();
    update((s) => {
      s.practice.lesson = { ...L, index: next, cur: null, finished: true };
    });
    return;
  }
  markLesson(state.progress, L.lesson.id, { step: next });
  L.index = next;
  L.cur = buildStep(L.lesson.steps[next]);
  update();
}

export function lessonBack() {
  const L = state.practice.lesson;
  if (!L || L.index === 0) return;
  L.index -= 1;
  L.cur = buildStep(L.lesson.steps[L.index]);
  L.finished = false;
  update();
}

export function openNextLesson() {
  const n = nextLesson();
  if (n) openLesson(n.lesson.id);
  else practiceHome();
}

export function practiceHome() {
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "home", lesson: null, problem: null, daily: null, topic: null };
  });
}

export function openTopic(topic) {
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "topic", topic, problem: null, daily: null };
  });
}

export function problemsOfTopic(topic) {
  return PROBLEMS.filter((p) => p.topic === topic).sort((a, b) => gradeOf(a.id) - gradeOf(b.id) || a.id.localeCompare(b.id));
}

export function openProblem(id, { daily = null } = {}) {
  const p = PROBLEMS.find((x) => x.id === id);
  if (!p) return;
  const pz = S.createPuzzle(p);
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "problem", problem: { def: p, pz, ...problemState(pz) }, daily: daily || null, topic: daily ? s.practice.topic : p.topic };
  });
}

export function startDaily() {
  const today = todayKey();
  let daily = state.progress.daily;
  if (!daily || daily.date !== today) {
    const picks = dailySet(state.progress, PROBLEMS, GRADES, 5);
    daily = { date: today, ids: picks.map((p) => p.id), index: 0, done: [] };
    state.progress.daily = daily;
  }
  if (daily.index >= daily.ids.length) {
    practiceHome();
    return;
  }
  openProblem(daily.ids[daily.index], { daily });
}

function currentProblem() {
  const v = state.practice.view;
  if (v === "problem") return state.practice.problem;
  if (v === "lesson" && state.practice.lesson?.cur?.kind === "problem") return state.practice.lesson.cur;
  return null;
}

/** The learner clicks a point in practice. */
export function practicePlay(x, y) {
  const v = state.practice.view;
  if (v === "lesson" && state.practice.lesson?.cur?.kind === "place") return placePlay(x, y);
  const P = currentProblem();
  if (!P || P.busy || P.status !== "open" || P.answer) return;
  const pz = P.pz;
  const next = S.play(pz, P.st, S.indexOf(pz, x, y));
  if (!next) {
    toast(t("error.illegal"), "warn");
    return;
  }
  P.history.push(P.st);
  P.st = next;
  P.last = { x, y };
  P.hintAt = null;
  P.busy = true;
  P.feedback = null;
  soundStone(false);
  update();
  // Let the stone appear before the solver thinks.
  setTimeout(() => respond(P), 60);
}

function respond(P) {
  const pz = P.pz;
  const r = S.reply(pz, P.st);
  if (r && r.refutes) {
    // A wrong move: show the refutation on the board.
    setTimeout(() => {
      if (!r.pass) {
        const after = S.play(pz, P.st, S.indexOf(pz, r.x, r.y));
        if (after) {
          P.history.push(P.st);
          P.st = after;
          P.last = { x: r.x, y: r.y };
          soundStone(false);
        }
      }
      P.status = "lost";
      P.feedback = "wrong";
      P.busy = false;
      recordAttempt(P, false);
      announce(t("practice.wrong"));
      update();
    }, 320);
    return;
  }
  const settled = S.status(pz, P.st);
  if (settled === "won" || !r) {
    finishProblem(P);
    return;
  }
  setTimeout(() => {
    if (!r.pass) {
      const after = S.play(pz, P.st, S.indexOf(pz, r.x, r.y));
      if (after) {
        P.history.push(P.st);
        P.st = after;
        P.last = { x: r.x, y: r.y };
        soundStone(false);
      }
    } else {
      const after = S.play(pz, P.st, S.PASS);
      P.history.push(P.st);
      P.st = after;
    }
    const st = S.status(pz, P.st);
    P.busy = false;
    if (st === "won") return finishProblem(P);
    if (st === "lost") {
      P.status = "lost";
      P.feedback = "wrong";
      recordAttempt(P, false);
    } else P.feedback = "keep";
    update();
  }, 320);
}

function finishProblem(P) {
  P.status = "won";
  P.feedback = "solved";
  P.busy = false;
  win();
  recordAttempt(P, true);
  announce(t("practice.solved"));
  update();
}

function recordAttempt(P, solved) {
  if (P.recorded) return;
  P.recorded = true;
  if (state.practice.view === "problem" && P.def) {
    markProblem(state.progress, P.def.id, { solved, clean: solved && !P.used });
    const d = state.practice.daily;
    if (d && solved && !d.done.includes(P.def.id)) d.done.push(P.def.id);
  }
}

export function retryProblem() {
  const P = currentProblem();
  if (!P) return;
  Object.assign(P, problemState(P.pz), { recorded: P.recorded, used: P.used });
  update();
}

export function undoProblemMove() {
  const P = currentProblem();
  if (!P || P.busy || !P.history.length) return;
  // Back to the learner's last decision.
  let back = P.history.pop();
  while (P.history.length && back.toMove !== P.pz.userColor) back = P.history.pop();
  P.st = back;
  P.status = "open";
  P.feedback = null;
  P.last = null;
  update();
}

export function problemHint() {
  const P = currentProblem();
  if (!P || P.status !== "open" || P.busy) return;
  P.used = true;
  const moves = S.winningMoves(P.pz, P.st);
  P.hintAt = moves[0] || null;
  update();
}

export function showAnswer() {
  const P = currentProblem();
  if (!P) return;
  P.used = true;
  const line = S.solutionLine(P.pz);
  Object.assign(P, problemState(P.pz), { used: true, recorded: P.recorded });
  P.answer = line.map((m, i) => ({ ...m, n: i + 1 }));
  P.status = "answer";
  if (!P.recorded) recordAttempt(P, false);
  update();
}

export function nextProblem() {
  const d = state.practice.daily;
  const P = state.practice.problem;
  if (d) {
    d.index = Math.min(d.ids.length, d.index + 1);
    state.progress.daily = d;
    if (d.index >= d.ids.length) {
      touchStreak(state.progress);
      update((s) => {
        s.practice = { ...s.practice, view: "dailyDone", problem: null };
      });
      return;
    }
    openProblem(d.ids[d.index], { daily: d });
    return;
  }
  const list = problemsOfTopic(P.def.topic);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i >= 0 && i + 1 < list.length) openProblem(list[i + 1].id);
  else openTopic(P.def.topic);
}

export function prevProblem() {
  const P = state.practice.problem;
  if (!P || state.practice.daily) return;
  const list = problemsOfTopic(P.def.topic);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i > 0) openProblem(list[i - 1].id);
}

function placePlay(x, y) {
  const C = state.practice.lesson.cur;
  if (C.result === "right") return;
  const ox = C.pz.x0;
  const oy = C.pz.y0;
  const ok = (C.step.accept || []).some((a) => a.x + ox === x && a.y + oy === y);
  if (C.pz.board[y][x]) {
    toast(t("error.occupied"), "warn");
    return;
  }
  if (ok) {
    C.result = "right";
    C.placed = { x, y };
    soundStone(false);
    announce(t("practice.right"));
  } else {
    C.result = "wrong";
    C.wrongAt = { x, y };
    announce(t("practice.notQuite"));
  }
  update();
}

export function goalText(pz) {
  const color = t(pz.userColor === BLACK ? "common.black" : "common.white");
  return t("goal." + pz.goal, [color]);
}

/* ------------------------------------------------------- onboarding */

export function finishOnboarding(choice, rank = null) {
  const s = state.settings;
  const next = { ...s, onboarded: true, experience: choice };
  if (choice === "new") next.playerRank = 30;
  else if (choice === "rules") next.playerRank = 25;
  else next.playerRank = rank ?? 15;
  const strength = choice === "new" ? "30k" : choice === "rules" ? "25k" : Engine.STRENGTHS.reduce((best, st) => (Math.abs(st.rank - next.playerRank) < Math.abs(best.rank - next.playerRank) ? st : best)).id;
  next.strength = strength;
  update((st) => {
    st.settings = next;
    st.sheet = null;
  });
  saveSettings(next);
  if (choice === "new") {
    const first = allLessons()[0];
    if (first) openLesson(first.lesson.id, 0);
  } else if (choice === "rules") {
    newGame({ size: 9, opponent: "ai", color: BLACK, strength });
  } else {
    newGame({ size: 19, opponent: "ai", color: BLACK, strength, handicap: 0 });
  }
}

export { DEFAULT_SETTINGS, formatPoints };
