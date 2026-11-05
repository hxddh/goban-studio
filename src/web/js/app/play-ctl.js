/**
 * Playing a game: the live board, the computer's replies and how they feel,
 * teaching aids, clocks, scoring, the end of the game and what follows it.
 */
import { BLACK, WHITE, Game, coordLabel, defaultKomi, normalizeRules } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Lib from "../library.js";
import { addGameRecord, addMistake, saveProgress, updateGameRecord } from "../persist.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeTextFile } from "../host.js";
import { state, update, toast, announce } from "./store.js";
import { moveText } from "../a11y.js";
import { confirmAction, openSheet, remember, resultText, setSetting, syncMenus, teachingOn } from "./ctl-core.js";
import { addWeakness, topWeaknesses, THEME_TOPIC } from "./insight.js";
import { countReady, resignStep, thinkTime } from "./feel.js";
import { newClock, tick, moveMade } from "./clock.js";
import { ratingToRank } from "./rating.js";
import { estimateNow, rateGame, recommendStrength, startEstimate } from "./strength.js";
import { analyzeLine, describeMistakes, openReview } from "./review-ctl.js";
import { gameRecord, recordAnalysis, summarizeGame, themeCounts } from "./summary.js";
import { notePoints, queueReport } from "./report-ctl.js";
import { themeLosses } from "./plan.js";

/* ------------------------------------------------------------ state */

/** v7: the signal of everything a game queued (cancelled when it is replaced). */
const gameSignal = (g) => Engine.sched.ownerSignal(g?.owner);

export function freshGameState(game, meta = {}) {
  // v7: a new game ends whatever the last one still had queued (its
  // pondering, its post-game summary); a rated game's report carries on in
  // the background (report-ctl queueReport).
  if (state.game?.owner) Engine.sched.cancelOwner(state.game.owner);
  return {
    owner: Engine.sched.newOwner("game"),
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
    proposalSeen: -1, // v8: the move number of the last "keep playing"
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
      // v8: a game saved during the count (both passed) counts again;
      // otherwise it would have neither a count nor its play controls.
      if (game.phase === "scoring" && !game.current.result) startScoring();
      return;
    } catch (_) {
      /* fall through */
    }
  }
  // A saved game keeps its own rules (no RU in the SGF = Japanese); only a
  // brand-new board takes the default ruleset and its komi.
  state.game = freshGameState(new Game({ size: state.settings.boardSize || 19, rules: state.settings.defaultRules }), { opponent: "ai", strength: state.settings.strength });
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
  if (!rec) {
    // v8: storage is full; say so instead of "Saved".
    toast(t("toast.saveFailed"), "error");
    return null;
  }
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
  // v6: the level you are expected to score closest to even against, from
  // the strength estimate and the levels' measured strengths (strength.js).
  const est = p.rating?.mu != null ? p.rating : startEstimate(s.playerRank ?? 30);
  const rank = ratingToRank(est.r);
  const modeOf = (st) => Engine.opponentMode(st);
  const strength = s.autoStrength ? recommendStrength(est, { size: 19, modeOf }) : s.strength;
  // The standard board, always; strength and handicap close the gap. A
  // 9×9 game is offered beside it as the quick option (its own level: the
  // small board compresses the ladder).
  const size = 19;
  const handicap = Engine.suggestHandicap(rank, strength, size);
  const weak = topWeaknesses(p.weakness, 1)[0] || null;
  const quickStrength = s.autoStrength ? recommendStrength(est, { size: 9, modeOf }) : s.strength;
  const quick = { size: 9, strength: quickStrength, handicap: Engine.suggestHandicap(rank, quickStrength, 9) };
  return { size, strength, handicap, rank, weak, quick };
}

export function newGame(opts = {}) {
  const size = [9, 13, 19].includes(Number(opts.size)) ? Number(opts.size) : state.settings.boardSize || 19;
  if (opts.rememberSize && size !== state.settings.boardSize) setSetting("boardSize", size);
  const handicap = Math.max(0, Math.min(9, Number(opts.handicap) || 0));
  // v5: the sheet's choice, else the `defaultRules` setting (Japanese).
  const rules = normalizeRules(opts.rules ?? state.settings.defaultRules);
  if (opts.rememberRules && opts.rules && rules !== state.settings.defaultRules) setSetting("defaultRules", rules);
  // Komi: the sheet's, else the ruleset's (6.5 / 7.5 / 6.5; 0.5 with
  // handicap stones, plus N points at the count under Chinese rules).
  const komi = opts.komi !== undefined && opts.komi !== null && Number.isFinite(Number(opts.komi)) ? Number(opts.komi) : defaultKomi(rules, handicap > 0 ? Math.max(2, handicap) : 0);
  const game = new Game({ size, rules, komi, handicap });
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
  announce(moveText({ color, x, y, captured, size: g.game.size, computer: !human && g.opponent === "ai" }));
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
    a = await Engine.evaluate(g.game, { node, visits: 64, signal: gameSignal(g) });
  } catch (_) {}
  if (state.game !== g || gen !== g.gen) return;
  g.pondering = false;
  if (!a || g.game.current !== node) return;
  g.before = { nodeId: node.id, ...a };
  g.eval = a;
  checkProposal(a);
  update();
}

/**
 * "Shall we count?" on a settled board (feel.js countReady). v8: after
 * "keep playing" it waits three moves each before it asks again.
 */
function proposalWaits(g) {
  return g.proposalSeen >= 0 && g.game.moveNumber < g.proposalSeen + 6;
}

function checkProposal(a) {
  const g = state.game;
  if (!proposalWaits(g) && countReady(a, g.game.moveNumber, g.game.size)) g.proposal = true;
}

/** How long the computer seems to think (ms): feel.js. */
export { thinkTime };

export async function maybeComputerMove({ afterHuman = false } = {}) {
  const g = state.game;
  if (!g || g.thinking || !isComputerTurn() || playReviewing() || g.pending) return;
  const gen = ++g.gen;
  g.thinking = true;
  update();
  const started = performance.now();
  let result = { move: null, analysis: null };
  try {
    result = await Engine.decide(g.game, g.strength, { signal: gameSignal(g) });
  } catch (_) {
    result = { move: null, analysis: null };
  }
  if (state.game !== g || gen !== g.gen) return;
  const a = result.analysis;
  if (a) g.eval = a;
  if (result.mode) g.opponentMode = result.mode; // v5: "human" | "strong" | "standard" | "offline"

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
  // Resign when clearly lost — except the gentlest levels, which play it
  // out (feel.js resignStep).
  const aiColor = -g.humanColor;
  const empty = g.game.board.signMap.reduce((n, row) => n + row.filter((v) => !v).length, 0);
  const verdict = resignStep(g.aiLow, { strengthId: g.strength, analysis: a, aiColor, moveNumber: g.game.moveNumber, size: g.game.size, empty });
  g.aiLow = verdict.low;
  if (verdict.resign) {
    g.thinking = false;
    g.game.resign(aiColor);
    toast(t("play.computerResigned"));
    finishGame();
    return;
  }
  // v8: a board settled before one of KataGo's own quiet moves is settled
  // after it, so the count is offered on the player's turn even when
  // nothing ponders there (before v8 it was cleared by the move itself).
  const mv = result.move;
  const quiet = !!a && !!mv && !mv.pass && a.moves.some((m) => m.visits > 0 && !m.pass && m.x === mv.x && m.y === mv.y);
  const ready = quiet && countReady(a, g.game.moveNumber + 1, g.game.size);
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
  } else if (ready && !proposalWaits(g)) {
    g.proposal = true;
    update();
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
  g.aiLow = 0;
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
      announce(moveText({ color, pass: true }));
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
  g.proposalSeen = g.game.moveNumber;
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
    h = await Engine.hint(g.game, { signal: gameSignal(g) });
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
    dead = await Engine.deadStones(g.game, { signal: gameSignal(g) });
  } catch (_) {}
  if (state.game !== g || !g.scoring) return;
  g.scoring = { dead: dead.stones, score: g.game.score(dead.stones), source: dead.source, at: performance.now() };
  update();
}

export function toggleDead(x, y) {
  const g = state.game;
  // v8: not while KataGo is still marking (its answer would undo the click).
  if (!g?.scoring || g.scoring.source === "pending") return;
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
  let rated = null;
  if (g.opponent === "ai" && g.rated && won !== null && g.game.moveNumber >= 12) {
    const p = state.progress;
    const prev = p.rating || startEstimate(state.settings.playerRank ?? 30);
    const handicap = g.humanColor === BLACK ? g.game.handicap : -g.game.handicap;
    // v6: against the level as it played (human-style or stronger network
    // have their own measured strength; the offline engine counts as standard).
    const mode = g.opponentMode === "human" || g.opponentMode === "strong" ? g.opponentMode : "standard";
    p.rating = rateGame(prev, { level: g.strength, mode, size: g.game.size, handicap, won });
    g.ratingDelta = p.rating.r - prev.r;
    g.rated = false;
    rated = { before: prev.r, after: p.rating.r, delta: g.ratingDelta };
    saveProgress(p);
    // v7: the estimate before and after, for the report ("≈ 12 kyu → ≈ 11 kyu (±1)").
    g.ratingChange = ratingChange(prev, p.rating);
  }
  saveToLibrary({ quiet: true });
  if (g.ratingChange && g.recordId) Lib.patchGame(g.recordId, { rating: g.ratingChange });
  // v5: a compact record for the trends view; the analysis fills it in.
  if (rated) {
    const rec = gameRecord({ id: g.recordId, game: g.game, color: g.humanColor, opponent: g.strength, won, rating: rated });
    if (addGameRecord(state.progress, rec)) g.trendId = rec.id;
  }
  announce(resultText(result));
  update();
  // v7: a rated game gets its report in the background, so opening it is
  // instant (report-ctl queueReport, after the summary's analysis).
  const autoReport = !!rated && !!g.recordId;
  // v6: the report waits for this analysis (report-ctl).
  if (g.opponent === "ai") g.summaryJob = summarize(g, { autoReport });
  else if (autoReport) queueReport(g.recordId);
}

/** v7: the strength estimate before and after a rated game, as the report shows it. */
export function ratingChange(before, after, now = Date.now()) {
  const a = estimateNow(before, now);
  const b = estimateNow(after, now);
  if (!a || !b) return null;
  return { before: { r: a.r, rank: a.rank, pm: a.pm }, after: { r: b.r, rank: b.rank, pm: b.pm } };
}

/** The computer level as a title shows it ("≈ 12 kyu"). */
function levelText(id) {
  const r = Engine.rankParts(id);
  return t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n]);
}

/**
 * After a game against the computer: analyse it in the background and say
 * three things — the biggest mistake, a good move, and what to practise.
 *
 * v7: a background job owned by the game (scheduler.js): a new game cancels
 * it, and its computer's move never waits behind it. The positions analysed
 * so far are handed to the report (report-ctl notePoints), which finishes
 * the analysis in the background when the game was rated.
 */
async function summarize(g, { autoReport = false } = {}) {
  const recordId = g.recordId;
  try {
    if (!state.engine.available || g.game.mainLine().length < 8) return;
    await summarizeAnalysis(g, recordId);
  } finally {
    if (autoReport) queueReport(recordId);
  }
}

async function summarizeAnalysis(g, recordId) {
  g.summary = { status: "analyzing", progress: 0 };
  update();
  const partial = new Array(g.game.mainLine().length).fill(null);
  if (recordId) notePoints(recordId, partial, g.game);
  const job = Engine.sched.startJob({
    kind: "summary",
    owner: g.owner,
    title: () => t("sched.job.game", [levelText(g.strength)]),
    meta: { recordId },
    run: (job) =>
      analyzeLine(g.game, {
        visits: g.game.size === 19 ? 32 : 48,
        signal: job.signal,
        onPoint: (i, p) => {
          partial[i] = p;
        },
        onProgress: (k, n) => {
          job.setProgress(k / n);
          if (state.game !== g || !g.summary) return;
          g.summary.progress = k / n;
          update();
        },
      }),
  });
  const points = await job.promise;
  if (!points) {
    // Cancelled (a new game, or from Settings): no summary.
    if (g.summary?.status === "analyzing") g.summary = null;
    if (state.game === g) update();
    return;
  }
  if (recordId) notePoints(recordId, points, g.game);
  if (state.game !== g) return;
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
  learnFromGame({ game: g.game, points, humanColor: g.humanColor, recordId: g.recordId, trendId: g.trendId, mistakes });
  const theme = mistakes.top.find((m) => m.theme)?.theme || null;
  g.summary = { status: "done", big, good, theme, topic: theme ? THEME_TOPIC[theme] || null : null };
  update();
}

/**
 * What a rated game teaches, from its whole-game analysis: the trend record
 * in progress.games (per-phase losses, themes, v7 plan themeLoss), the
 * weaknesses, and the two costliest mistakes as drills (ids
 * `${recordId}-${index}`). The post-game summary does it; when a new game
 * cancelled the summary, the game's background report does (report-ctl).
 * Once per record: the library record is marked `learned`. Returns false
 * when it was already done.
 */
export function learnFromGame({ game, points, humanColor, recordId = null, trendId = recordId, mistakes = null }) {
  const lib = recordId ? Lib.getGame(recordId) : null;
  if (lib?.learned) return false;
  mistakes = mistakes || describeMistakes(game, points, humanColor);
  // v5: complete the game's trend record with per-phase losses and the
  // themes of up to ten explained mistakes.
  if (trendId && (state.progress.games || []).some((r) => r.id === String(trendId))) {
    const summary = summarizeGame({ game, points, meta: { humanColor }, keyMoves: mistakes.top });
    const ten = describeMistakes(game, points, humanColor, 10).top;
    const themes = themeCounts(ten, humanColor);
    // v7 plan: also what each theme cost, for "this week's focus".
    updateGameRecord(state.progress, trendId, { ...recordAnalysis(summary, humanColor, themes), themeLoss: themeLosses(ten, humanColor) }, { save: false });
  }
  // Record weaknesses and keep the two costliest mistakes as drills.
  let weak = state.progress.weakness;
  for (const m of mistakes.top) if (m.theme) weak = addWeakness(weak, m.theme);
  state.progress.weakness = weak;
  const key = recordId || String(Date.now());
  const sgf = game.toSGF();
  for (const m of mistakes.top.slice(0, 2)) {
    if (m.loss < 4 || !m.best || m.best.pass) continue;
    addMistake(state.progress, {
      gameKey: key,
      index: m.index,
      sgf,
      color: m.move.color,
      played: { x: m.move.x, y: m.move.y },
      best: { x: m.best.x, y: m.best.y },
      accept: m.accept,
      loss: m.loss,
      theme: m.theme,
      size: game.size,
    });
  }
  saveProgress(state.progress);
  if (lib) Lib.patchGame(recordId, { learned: true });
  return true;
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
  await saveText((name || "goban-studio") + ".sgf", game.toSGF(), "application/x-go-sgf");
}

/** Save text through the native save dialog, or as a browser download. */
export async function saveText(filename, text, mime = "text/plain") {
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
  const blob = new Blob([text], { type: mime });
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
