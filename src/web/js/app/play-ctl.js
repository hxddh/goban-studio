/**
 * Playing a game: the live board, the computer's replies and how they feel,
 * teaching aids, clocks, scoring, the end of the game and what follows it.
 */
import { BLACK, WHITE, Game, coordLabel } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Lib from "../library.js";
import { addMistake, saveProgress } from "../persist.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeTextFile } from "../host.js";
import { state, update, toast, announce } from "./store.js";
import { confirmAction, openSheet, remember, resultText, setSetting, strengthForRating, syncMenus, teachingOn } from "./ctl-core.js";
import { complexity, settled, addWeakness, topWeaknesses, THEME_TOPIC } from "./insight.js";
import { newClock, tick, moveMade } from "./clock.js";
import { rankToRating, startRating, updateRating, ratingToRank } from "./rating.js";
import { analyzeLine, describeMistakes, openReview } from "./review-ctl.js";

/* ------------------------------------------------------------ state */

export function freshGameState(game, meta = {}) {
  return {
    game,
    recordId: meta.recordId || null,
    name: meta.name || "",
    opponent: meta.opponent === "human" ? "human" : "ai",
    humanColor: meta.humanColor === WHITE ? WHITE : BLACK,
    strength: meta.strength || state.settings.strength,
    thinking: false,
    pondering: false,
    gen: 0,
    hint: null,
    scoring: null,
    undos: meta.undos || 0,
    hints: meta.hints || 0,
    saved: !!meta.recordId,
    clock: meta.clock || null,
    eval: null, // latest analysis of the position on the board
    before: null, // analysis of the position before the player's move (teaching)
    pending: null, // teaching warning waiting for the player's choice
    proposal: false, // "the game looks finished — count?"
    proposalSeen: -1,
    aiLow: 0,
    ghost: null, // two-click placement
    captureFx: null,
    summary: null,
    analysis: null, // whole-game analysis, shared with review
    rated: !!meta.rated,
  };
}

export function restoreCurrent() {
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

export function persistCurrent() {
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
    clock: g.clock,
    rated: g.rated,
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

function gameOver(g = state.game) {
  return !!g.game.current.result;
}

/* --------------------------------------------------------- new game */

/** What to play next: size, strength and handicap from your rating. */
export function recommendedGame() {
  const p = state.progress;
  const s = state.settings;
  const r = p.rating?.r ?? rankToRating(s.playerRank ?? 30);
  const rank = ratingToRank(r);
  const strength = s.autoStrength ? strengthForRating(r) : s.strength;
  const size = rank >= 20 ? 9 : rank >= 12 ? 13 : 19;
  const handicap = Engine.suggestHandicap(rank, strength, size);
  const weak = topWeaknesses(p.weakness, 1)[0] || null;
  return { size, strength, handicap, rank, weak };
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
  const tc = opts.timeControl ?? state.settings.timeControl;
  if (opts.timeControl) setSetting("timeControl", opts.timeControl);
  Engine.cancel();
  if (state.game) state.game.gen++;
  remember();
  update((s) => {
    s.game = freshGameState(game, { opponent, humanColor, strength, clock: newClock(tc), rated: opponent === "ai" });
    s.space = "play";
    s.sheet = null;
    s.review = null;
  });
  persistCurrent();
  announce(t("a11y.newGame", [size]));
  syncMenus();
  maybeComputerMove();
  ponder();
}

/* ------------------------------------------------------------ moves */

export function canPlayHere(x, y) {
  const g = state.game;
  if (!g || g.scoring) return true;
  return g.game.canPlay(x, y).ok;
}

export function humanPlay(x, y) {
  const g = state.game;
  if (!g || playReviewing()) return;
  if (g.scoring) return toggleDead(x, y);
  if (g.thinking || g.pending || g.game.phase !== "playing" || gameOver(g)) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  if (!g.game.canPlay(x, y).ok) {
    const res = g.game.canPlay(x, y);
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  // Two-click placement: the first click shows the stone, the second plays it.
  if (state.settings.confirmMove && !(g.ghost && g.ghost.x === x && g.ghost.y === y)) {
    g.ghost = { x, y };
    update();
    return;
  }
  g.ghost = null;
  playOnGame(x, y, { human: true });
}

export function clearGhost() {
  const g = state.game;
  if (g?.ghost) {
    g.ghost = null;
    update();
  }
}

function captureTotal(game) {
  const c = game.capturesOf(game.current);
  return (c.black || 0) + (c.white || 0);
}

function playOnGame(x, y, { human = false } = {}) {
  const g = state.game;
  const before = captureTotal(g.game);
  const color = g.game.turn;
  const res = g.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return false;
  }
  const captured = captureTotal(g.game) - before;
  if (captured > 0) {
    Audio.capture ? Audio.capture(captured) : Audio.stone(true);
    g.captureFx = { color, n: captured, at: performance.now() };
  } else Audio.stone(false);
  g.clock = moveMade(g.clock, color);
  announce(t("a11y.move", [t(color === BLACK ? "common.black" : "common.white"), coordLabel(x, y, g.game.size)]) + (captured ? " · " + t("a11y.captured", [captured]) : ""));
  afterMove({ human });
  return true;
}

function afterMove({ human = false } = {}) {
  const g = state.game;
  g.hint = null;
  g.eval = null;
  g.proposal = false;
  if (g.game.phase === "scoring" && !g.scoring) startScoring();
  persistCurrent();
  update();
  if (human && g.opponent === "ai") maybeComputerMove({ afterHuman: true });
  else if (g.opponent === "ai") maybeComputerMove();
  else ponder();
}

/**
 * While it is the player's turn, quietly evaluate the position: it powers
 * the teaching warning (what the best move would have kept), the optional
 * win-rate bar and "shall we count?".
 */
export async function ponder() {
  const g = state.game;
  if (!g || gameOver(g) || g.scoring || g.game.phase !== "playing" || playReviewing()) return;
  if (!state.engine.available) return;
  const wants = teachingOn() || state.settings.showEval || g.opponent === "human";
  if (!wants) return;
  const node = g.game.current;
  const gen = g.gen;
  g.pondering = true;
  let a = null;
  try {
    a = await Engine.evaluate(g.game, { node, visits: 64 });
  } catch (_) {}
  if (state.game !== g || gen !== g.gen) return;
  g.pondering = false;
  if (!a || g.game.current !== node) return;
  g.before = { nodeId: node.id, ...a };
  g.eval = a;
  checkProposal(a);
  update();
}

function checkProposal(a) {
  const g = state.game;
  const n = g.game.moveNumber;
  if (n < (g.game.size * g.game.size) / 3 || g.proposalSeen === g.game.current.id) return;
  if (settled(a.ownership) && a.moves[0] && (a.moves[0].pass || Math.abs((a.moves[1]?.scoreLead ?? a.moves[0].scoreLead) - a.moves[0].scoreLead) < 0.6)) {
    g.proposal = true;
  }
}

function thinkTime(strengthId, a, moveNumber, size) {
  const st = Engine.strengthById(strengthId);
  const base = st.rank >= 20 ? 520 : st.rank >= 10 ? 820 : st.rank >= 1 ? 1150 : 1500;
  const c = complexity(a);
  const opening = moveNumber < size ? 0.55 : 1;
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.round(base * (0.55 + c * 1.5) * opening * jitter);
}

export async function maybeComputerMove({ afterHuman = false } = {}) {
  const g = state.game;
  if (!g || g.thinking || !isComputerTurn() || playReviewing() || g.pending) return;
  const gen = ++g.gen;
  g.thinking = true;
  update();
  const started = performance.now();
  let result = { move: null, analysis: null };
  try {
    result = await Engine.decide(g.game, g.strength);
  } catch (_) {
    result = { move: null, analysis: null };
  }
  if (state.game !== g || gen !== g.gen) return;
  const a = result.analysis;
  if (a) g.eval = a;

  // Teaching: a big drop after the player's move pauses the reply.
  if (afterHuman && a && teachingOn() && g.before && g.game.current.parent?.id === g.before.nodeId) {
    const best = g.before.moves?.[0];
    if (best && Number.isFinite(best.scoreLead) && Number.isFinite(a.scoreLead)) {
      const loss = g.humanColor * (best.scoreLead - a.scoreLead);
      const threshold = state.settings.playerRank != null && state.settings.playerRank <= 10 ? 6 : 4;
      if (loss >= threshold) {
        g.thinking = false;
        g.pending = { loss: Math.round(loss * 2) / 2, move: g.game.current.move, best: best.pass ? null : { x: best.x, y: best.y }, result };
        announce(t("teach.warn", [Math.round(loss)]));
        update();
        return;
      }
    }
  }
  await reply(g, gen, result, started);
}

async function reply(g, gen, result, started) {
  const a = result.analysis;
  // Resign when hopeless — except the gentlest levels, which play it out.
  if (a && Number.isFinite(a.winrate)) {
    const aiColor = -g.humanColor;
    const aiWin = aiColor === BLACK ? a.winrate : 1 - a.winrate;
    const deficit = aiColor * (a.scoreLead ?? 0);
    const st = Engine.strengthById(g.strength);
    if (aiWin < 0.03 && deficit < -15 && g.game.moveNumber > (g.game.size * g.game.size) / 5) g.aiLow++;
    else g.aiLow = 0;
    if (g.aiLow >= 3 && st.rank <= 15) {
      g.thinking = false;
      g.game.resign(aiColor);
      toast(t("play.computerResigned"));
      finishGame();
      return;
    }
    checkProposal(a);
  }
  // Pace the reply like a person: quick when obvious, slower when it is not.
  const target = thinkTime(g.strength, a, g.game.moveNumber, g.game.size);
  const wait = target - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (state.game !== g || gen !== g.gen) return;
  g.thinking = false;
  const move = result.move;
  if (!move || !isComputerTurn()) {
    update();
    return;
  }
  if (move.pass) {
    g.game.pass();
    Audio.pass();
    g.clock = moveMade(g.clock, -g.humanColor);
    toast(t("play.computerPassed"));
    announce(t("play.computerPassed"));
    afterMove();
  } else if (!playOnGame(move.x, move.y)) {
    g.game.pass();
    afterMove();
  }
  if (!gameOver(g) && !g.scoring) ponder();
}

/** Teaching warning: take the move back for free and think again. */
export function teachTakeBack() {
  const g = state.game;
  if (!g?.pending) return;
  g.pending = null;
  g.game.undo();
  g.hint = null;
  persistCurrent();
  update();
  ponder();
}

/** Teaching warning: keep the move; the computer answers. */
export async function teachKeep() {
  const g = state.game;
  if (!g?.pending) return;
  const result = g.pending.result;
  g.pending = null;
  const gen = ++g.gen;
  g.thinking = true;
  update();
  await reply(g, gen, result, performance.now() - 400);
}

export function teachShowBest() {
  const g = state.game;
  if (!g?.pending?.best) return;
  g.pending.showBest = true;
  update();
}

export function undo() {
  const g = state.game;
  if (!g || playReviewing() || !g.game.current.parent) return;
  Engine.cancel();
  g.gen++;
  g.thinking = false;
  g.pending = null;
  g.scoring = null;
  g.hint = null;
  g.ghost = null;
  g.proposal = false;
  if (g.game.current.result) g.game.current.result = null;
  g.game.undo();
  if (g.opponent === "ai" && g.game.turn !== g.humanColor && g.game.current.parent) g.game.undo();
  g.undos++;
  persistCurrent();
  update();
  maybeComputerMove();
  ponder();
}

export function requestPass() {
  const g = state.game;
  if (!g || g.thinking || g.pending || g.game.phase !== "playing" || gameOver(g)) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  confirmAction({
    title: t("play.passConfirm"),
    body: t("play.passBody"),
    confirm: t("common.pass"),
    onConfirm: () => {
      const color = g.game.turn;
      g.game.pass();
      g.clock = moveMade(g.clock, color);
      Audio.pass();
      announce(t("common.pass"));
      afterMove({ human: true });
    },
  });
}

/** "The game looks finished — count?" accepted: both sides pass. */
export function acceptCount() {
  const g = state.game;
  if (!g || g.game.phase !== "playing" || gameOver(g)) return;
  g.proposal = false;
  Engine.cancel();
  g.gen++;
  g.thinking = false;
  const first = g.game.turn;
  g.game.pass({ color: first, force: true });
  g.game.pass({ color: -first, force: true });
  Audio.pass();
  afterMove();
}

export function dismissProposal() {
  const g = state.game;
  if (!g) return;
  g.proposal = false;
  g.proposalSeen = g.game.current.id;
  update();
}

export function requestResign() {
  const g = state.game;
  if (!g || g.game.phase !== "playing" || gameOver(g)) return;
  confirmAction({
    title: t("play.resignConfirm"),
    confirm: t("common.resign"),
    danger: true,
    onConfirm: () => {
      const color = g.opponent === "ai" ? g.humanColor : g.game.turn;
      Engine.cancel();
      g.gen++;
      g.thinking = false;
      g.pending = null;
      g.game.resign(color);
      finishGame();
    },
  });
}

export async function askHint() {
  const g = state.game;
  if (!g || g.thinking || g.pending || g.game.phase !== "playing" || gameOver(g)) return;
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

/* ------------------------------------------------------------ clock */

let lastTick = 0;
export function clockTick() {
  const now = performance.now();
  const dt = lastTick ? (now - lastTick) / 1000 : 0;
  lastTick = now;
  const g = state.game;
  if (!g?.clock || dt <= 0 || dt > 2) return;
  if (state.space !== "play" || playReviewing() || document.hidden) return;
  if (gameOver(g) || g.scoring || g.pending || g.game.phase !== "playing" || state.sheet) return;
  const color = g.game.turn;
  // The computer's own thinking is not charged; only the person's clock runs.
  if (g.opponent === "ai" && color !== g.humanColor) return;
  const r = tick(g.clock, color, dt);
  g.clock = r.clock;
  if (r.flagged) {
    Engine.cancel();
    g.gen++;
    g.game.setResult((color === BLACK ? "W" : "B") + "+T");
    toast(t("play.timeUp"));
    finishGame();
    return;
  }
  update();
}

/* ---------------------------------------------------------- scoring */

async function startScoring() {
  const g = state.game;
  g.scoring = { dead: [], score: g.game.score([]), source: "pending", at: performance.now() };
  update();
  let dead = { stones: [], source: "manual" };
  try {
    dead = await Engine.deadStones(g.game);
  } catch (_) {}
  if (state.game !== g || !g.scoring) return;
  g.scoring = { dead: dead.stones, score: g.game.score(dead.stones), source: dead.source, at: performance.now() };
  update();
}

export function toggleDead(x, y) {
  const g = state.game;
  if (!g?.scoring) return;
  const v = g.game.board.get([x, y]);
  if (!v) return;
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

/* -------------------------------------------------------- game over */

function humanWon(g) {
  const r = g.game.current.result;
  if (!r || /draw/i.test(r)) return null;
  return r.startsWith("B") === (g.humanColor === BLACK);
}

function finishGame() {
  const g = state.game;
  const result = g.game.current.result;
  g.pending = null;
  g.proposal = false;
  const won = g.opponent === "ai" ? humanWon(g) : null;
  if (won === true) Audio.win();
  else if (won === false) Audio.lose();
  else Audio.gameEnd?.();
  // Rating: games against the computer with enough moves to mean something.
  if (g.opponent === "ai" && g.rated && won !== null && g.game.moveNumber >= 12) {
    const p = state.progress;
    const prev = p.rating || startRating(state.settings.playerRank ?? 30);
    const opp = rankToRating(Engine.strengthById(g.strength).rank);
    const handicap = g.humanColor === BLACK ? g.game.handicap : -g.game.handicap;
    p.rating = updateRating(prev, { opponentRating: opp, handicap, won });
    g.ratingDelta = p.rating.r - prev.r;
    g.rated = false;
    saveProgress(p);
  }
  saveToLibrary({ quiet: true });
  announce(resultText(result));
  update();
  if (g.opponent === "ai") summarize(g);
}

/**
 * After a game against the computer: analyse it in the background and say
 * three things — the biggest mistake, a good move, and what to practise.
 */
async function summarize(g) {
  if (!state.engine.available || g.game.mainLine().length < 8) return;
  g.summary = { status: "analyzing", progress: 0 };
  update();
  const token = { cancelled: false };
  g.summaryToken = token;
  const points = await analyzeLine(g.game, {
    visits: g.game.size === 19 ? 32 : 48,
    token,
    onProgress: (k, n) => {
      if (state.game !== g || !g.summary) return;
      g.summary.progress = k / n;
      update();
    },
  });
  if (token.cancelled || state.game !== g || !points) return;
  g.analysis = points;
  const mistakes = describeMistakes(g.game, points, g.humanColor);
  const losses = mistakes.all;
  const big = mistakes.top[0] || null;
  // A good move: the player's move with the best result where it mattered most.
  let good = null;
  for (const m of losses) {
    if (m.move.color !== g.humanColor || m.move.pass) continue;
    const a = points[m.index - 1];
    const spread = a?.moves?.length > 1 ? Math.abs(a.moves[0].scoreLead - a.moves[1].scoreLead) : 0;
    if (m.loss <= 0.5 && spread >= 2 && (!good || spread > good.spread)) good = { ...m, spread };
  }
  // Record weaknesses and keep the two costliest mistakes as drills.
  let weak = state.progress.weakness;
  for (const m of mistakes.top) if (m.theme) weak = addWeakness(weak, m.theme);
  state.progress.weakness = weak;
  const key = g.recordId || String(Date.now());
  for (const m of mistakes.top.slice(0, 2)) {
    if (m.loss < 4 || !m.best || m.best.pass) continue;
    addMistake(state.progress, {
      gameKey: key,
      index: m.index,
      sgf: g.game.toSGF(),
      color: m.move.color,
      played: { x: m.move.x, y: m.move.y },
      best: { x: m.best.x, y: m.best.y },
      accept: m.accept,
      loss: m.loss,
      theme: m.theme,
      size: g.game.size,
    });
  }
  saveProgress(state.progress);
  const theme = mistakes.top.find((m) => m.theme)?.theme || null;
  g.summary = { status: "done", big, good, theme, topic: theme ? THEME_TOPIC[theme] || null : null };
  update();
}

export function resultHeadline(g) {
  const r = g.game.current.result;
  if (!r) return "";
  if (g.opponent !== "ai") return resultText(r);
  const won = humanWon(g);
  return won === null ? resultText(r) : won ? t("result.youWon") : t("result.youLost");
}

/** Open the review of the game just played, reusing the summary analysis. */
export function reviewCurrentGame() {
  const g = state.game;
  if (!g || g.game.mainLine().length < 2) return;
  Engine.cancel();
  g.gen++;
  g.thinking = false;
  openReview(g.game, { source: "current", humanColor: g.opponent === "ai" ? g.humanColor : null, points: g.analysis || null });
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

export function continueCurrent() {
  remember();
  update((s) => {
    s.space = "play";
    s.review = null;
  });
  maybeComputerMove();
  ponder();
}

export function openNewGame(prefill = null) {
  openSheet("newGame", prefill ? { prefill } : {});
}
