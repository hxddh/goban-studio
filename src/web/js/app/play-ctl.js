/**
 * Playing a game: the live board, the computer's replies and how they feel,
 * teaching aids, clocks, scoring, and the end of the game: the same board
 * turns into the post-game review (review-ctl.js), in place.
 */
import { BLACK, WHITE, Game, coordLabel, defaultKomi, normalizeRules } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { addMistake, estimate, focus, implOpponent, recordGame, suggestedGame, themeLosses } from "../model/player.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeTextFile } from "../host.js";
import { state, update, toast, announce } from "./store.js";
import { moveText } from "../a11y.js";
import { changeProfile, confirmAction, openSheet, playerRankNow, remember, resultText, setSetting, syncMenus, teachingOn } from "./ctl-core.js";
import { countReady, resignStep, thinkTime } from "./feel.js";
import { newClock, tick, moveMade } from "./clock.js";
import { describeMistakes, dropReview, openReview, saveEdits } from "./review-ctl.js";
import { recordAnalysis, summarizeGame, themeCounts } from "./summary.js";
import { hintReason, hintText, warningReason, warningText } from "./teach-why.js";

/* ------------------------------------------------------------ state */

/** v7: the signal of everything a game queued (cancelled when it is replaced). */
const gameSignal = (g) => Engine.sched.ownerSignal(g?.owner);

/**
 * v9: the opponent of a game from its meta: the implementation it was
 * played with (`impl`) when the app still knows it, else what plays its
 * `rank` now (the New game choice, or the `opponentRank` setting).
 */
export function opponentOf(meta = {}) {
  if (meta.impl && Engine.impl(meta.impl)) return { rank: Engine.implLabel(meta.impl), impl: meta.impl };
  const o = Engine.opponentFor(meta.rank ?? state.settings.opponentRank);
  return { rank: o.label, impl: o.impl };
}

export function freshGameState(game, meta = {}) {
  // v7: a new game ends whatever the last one still had queued (its
  // pondering); the last game's analysis carries on in the background
  // (play/analysis.js).
  if (state.game?.owner) Engine.sched.cancelOwner(state.game.owner);
  return {
    owner: Engine.sched.newOwner("game"),
    game,
    recordId: meta.recordId || null,
    name: meta.name || "",
    opponent: meta.opponent === "human" ? "human" : "ai",
    humanColor: meta.humanColor === WHITE ? WHITE : BLACK,
    // v9: the opponent is a rank; `impl` is what plays it (opponents.js),
    // `rank` the measured rank of that implementation, as shown.
    ...opponentOf(meta),
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
    analysis: null, // whole-game analysis, shared with review
    rated: !!meta.rated,
  };
}

export function restoreCurrent() {
  const saved = Games.loadCurrent();
  if (saved?.sgf) {
    try {
      const { game } = loadSGF(saved.sgf);
      state.game = freshGameState(game, saved);
      // v13: its Library record (game files are read when needed) is read now, for the review and the result.
      if (saved.recordId && !Games.isLoaded(saved.recordId)) Games.loadGame(saved.recordId);
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
  // v12: Play shows this board as the game to play, so it is one: against
  // the chosen rank, rated like a game from New game.
  state.game = freshGameState(new Game({ size: state.settings.boardSize || 19, rules: state.settings.defaultRules }), { opponent: "ai", rank: state.settings.opponentRank, rated: true });
}

export function persistCurrent() {
  const g = state.game;
  if (!g) return;
  Games.saveCurrent(g.game, {
    recordId: g.recordId,
    humanColor: g.humanColor,
    opponent: g.opponent,
    rank: g.rank,
    impl: g.impl,
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
    rank: g.opponent === "ai" ? g.rank : null,
    impl: g.opponent === "ai" ? g.impl : null,
    undos: g.undos,
    hints: g.hints,
    source: "game",
  };
}

/**
 * Finished or explicitly saved games go to the history (data/games.js);
 * nothing else does. A write that fails is said once by the store's toast.
 */
export function saveToLibrary({ quiet = false } = {}) {
  const g = state.game;
  if (!g || g.game.moveNumber === 0) return null;
  const rec = Games.saveGame(g.game, recordMeta(g));
  g.recordId = rec.id;
  g.saved = true;
  persistCurrent();
  update();
  if (!quiet) toast(t("toast.saved"));
  return rec;
}

/* ------------------------------------------- v13: unfinished games */

/** Moves the player made in a game (both sides' in a game between two people). */
export function humanMoves(g = state.game) {
  if (!g) return 0;
  let n = 0;
  for (const node of g.game.mainLine()) if (node.move && (g.opponent === "human" || node.move.color === g.humanColor)) n++;
  return n;
}

/** A game in progress that replacing it would lose: no result, and at least one move of the player's. */
export function unfinishedGame(g = state.game) {
  return !!g && !g.game.mainLine().at(-1)?.result && !g.game.current.result && humanMoves(g) > 0;
}

/**
 * Before anything replaces the game on the board (New game, Play from
 * here, a game of the Library resumed, the explorer's Play from here): a
 * game in progress is saved to the Library as unfinished, with what it
 * takes to continue it (docs/design.md, "Unfinished games"). Opening it
 * there continues it (resumeRecord). It is not rated until it is finished.
 * Returns its record, or null when there was nothing to keep.
 */
export function parkCurrent({ quiet = false } = {}) {
  const g = state.game;
  if (!unfinishedGame(g)) return null;
  // A review of this game open on top (Review so far) keeps its edits.
  if (state.review?.source === "current" && state.review.game === g.game) saveEdits(state.review);
  const rec = Games.saveGame(g.game, { ...recordMeta(g), clock: g.clock || null, rated: !!g.rated });
  g.recordId = rec.id;
  g.saved = true;
  if (!quiet) toast(t("v13.parked"));
  return rec;
}

/**
 * Continue an unfinished game from the Library: it becomes the game on the
 * board, with its opponent, colour, clock and rating as they were (the
 * game it replaces is parked first). Its record stays the same record, so
 * finishing it updates that entry.
 */
export async function resumeRecord(id) {
  if (!Games.isLoaded(id) && !(await Games.loadGame(id))) return toast(t("store.readFailed"), "error", 5000, { key: "store" });
  const rec = Games.getGame(id);
  if (!rec?.sgf) return;
  if (state.game?.recordId === id && unfinishedGame(state.game)) return continueCurrent();
  let game;
  try {
    game = loadSGF(rec.sgf).game;
  } catch (_) {
    return toast(t("library.importError"), "error");
  }
  parkCurrent();
  Engine.cancel();
  remember();
  if (state.review) dropReview();
  if (state.game) state.game.gen++;
  update((s) => {
    s.game = freshGameState(game, {
      recordId: rec.id,
      name: rec.name,
      opponent: rec.opponent,
      humanColor: rec.humanColor,
      rank: rec.rank,
      impl: rec.impl,
      undos: rec.undos,
      hints: rec.hints,
      clock: rec.clock || null,
      rated: rec.rated === true,
    });
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
    s.sheet = null;
    s.review = null;
  });
  if (game.phase === "scoring" && !game.current.result) startScoring();
  persistCurrent();
  syncMenus();
  maybeComputerMove();
  ponder();
}

/** Play shows a review instead of the live game. */
export function playReviewing() {
  return !!state.review && (state.review.meta.space || "play") === "play";
}

/**
 * v12: the game's board is on screen — by the same rule Play draws it
 * (app.jsx PlaySpace): in Play, no review, and the game view or a game that
 * is not over. The clock, the report and the board's keys follow this.
 */
export function boardShown() {
  return state.space === "play" && !playReviewing() && !!state.game && (state.play.view === "game" || !state.game.game.current.result);
}

export function isComputerTurn() {
  const g = state.game;
  return !!g && g.opponent === "ai" && g.game.phase === "playing" && !g.game.current.result && g.game.turn !== g.humanColor;
}

function gameOver(g = state.game) {
  return !!g.game.current.result;
}

/* --------------------------------------------------------- new game */

/**
 * The opponent to suggest on one board: the player model's suggestion
 * (model/player.js suggestedGame: the level you are expected to score
 * about even against, and a handicap for what remains), as the rank of the
 * ladder that plays it here (opponents.js). With autoStrength off, the
 * rank last chosen. { size, opponentRank, label, handicap }.
 */
export function suggestedOpponent(size = 19) {
  const installed = Engine.installed();
  // The human-style levels play where they are installed (opponents.js prefers them).
  const sg = suggestedGame(state.profile, { size, modeOf: () => (installed.human ? "human" : "standard") });
  const s = state.settings;
  const pick = Engine.nearest(s.autoStrength === false ? s.opponentRank : sg.rank, installed);
  const handicap = s.autoStrength === false ? Engine.suggestHandicap(playerRankNow(), pick.label, size) : sg.handicap;
  return { size, opponentRank: pick.rank, label: pick.label, handicap };
}

/** Players around 20 kyu and weaker start on 9×9 (about ten minutes a game). */
export const BEGINNER_RANK = 20;

/**
 * What to play next (Play's suggested game), and why: the week's first
 * focus (model/player.js focus) or the player's level. A beginner is
 * offered 9×9 with the standard board as the other option; everyone else
 * the standard board, with a quick 9×9 game beside it.
 * { size, opponentRank, label, handicap, rank, weak: { theme } | null, quick }.
 */
export function recommendedGame() {
  const rank = playerRankNow();
  const small = rank == null || rank >= BEGINNER_RANK;
  const main = suggestedOpponent(small ? 9 : 19);
  const view = focus(state.profile, Date.now());
  const key = view.focus?.[0]?.key || null;
  return { ...main, rank, weak: key ? { theme: key } : null, quick: suggestedOpponent(small ? 19 : 9) };
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
  // v9: the opponent is a rank of the ladder (opts.opponentRank).
  const opponentRank = opts.opponentRank ?? state.settings.opponentRank;
  if (opts.opponentRank != null) setSetting("opponentRank", opts.opponentRank);
  const tc = opts.timeControl ?? state.settings.timeControl;
  if (opts.timeControl) setSetting("timeControl", opts.timeControl);
  // v13: the game in progress is not lost (it goes to the Library as unfinished).
  parkCurrent();
  Engine.cancel();
  remember();
  // The last game's review: its analysis goes on in the background.
  if (state.review) dropReview();
  if (state.game) state.game.gen++;
  update((s) => {
    s.game = freshGameState(game, { opponent, humanColor, rank: opponentRank, clock: newClock(tc), rated: opponent === "ai" });
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
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
    result = await Engine.decide(g.game, { rank: g.rank, impl: g.impl }, { signal: gameSignal(g) });
  } catch (_) {
    result = { move: null, analysis: null };
  }
  if (state.game !== g || gen !== g.gen) return;
  const a = result.analysis;
  if (a) g.eval = a;
  if (result.mode) g.opponentMode = result.mode; // "human" | "strong" | "standard" | "offline"
  // v9: what actually played (a standard level when an optional process
  // could not answer): its measured rank is shown, and the game is rated
  // against it.
  if (result.impl && result.mode !== "offline") {
    g.played = result.impl;
    g.rank = Engine.implLabel(result.impl);
  }

  // Teaching: a big drop after the player's move pauses the reply.
  if (afterHuman && a && teachingOn() && g.before && g.game.current.parent?.id === g.before.nodeId) {
    const best = g.before.moves?.[0];
    if (best && Number.isFinite(best.scoreLead) && Number.isFinite(a.scoreLead)) {
      const loss = g.humanColor * (best.scoreLead - a.scoreLead);
      const threshold = state.settings.playerRank != null && state.settings.playerRank <= 10 ? 6 : 4;
      if (loss >= threshold) {
        g.thinking = false;
        const move = g.game.current.move;
        // v8: one reason, from the two searches already made (no new search).
        const reason = warningReason({ signMapBefore: g.game.current.parent.board.signMap, move, mover: g.humanColor, loss, before: g.before, after: a });
        g.pending = { loss: Math.round(loss * 2) / 2, move, best: best.pass ? null : { x: best.x, y: best.y }, result, reason };
        announce(reason ? warningText(Math.round(loss), reason) : t("teach.warn", [Math.round(loss)]));
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
  const verdict = resignStep(g.aiLow, { rank: g.rank, analysis: a, aiColor, moveNumber: g.game.moveNumber, size: g.game.size, empty });
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
  const target = thinkTime(g.rank, a, g.game.moveNumber, g.game.size);
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
    g.hint = { x: h.x, y: h.y, reason: hintReason(g.game.current.board.signMap, g.game.turn, h) };
    announce(hintText(coordLabel(h.x, h.y, g.game.size), g.hint.reason));
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
  // Only while the game is on screen: not on Play's home, in the explorer or in Learn.
  if (!boardShown() || document.hidden) return;
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
  saveToLibrary({ quiet: true });
  // Rating: games against the computer with enough moves to mean something
  // (model/player.js recordGame rates a game once, by its measured opponent).
  if (g.opponent === "ai" && g.rated && won !== null && g.game.moveNumber >= 12) {
    const handicap = g.humanColor === BLACK ? g.game.handicap : -g.game.handicap;
    // Against the implementation that played, by its measured strength
    // (the offline engine counts as the standard level of the rank).
    const impl = g.played || Engine.resolveOpponent({ rank: g.rank, impl: g.impl }, {}).id;
    const size = g.game.size;
    const now = Date.now();
    const before = estimate(state.profile, { size, now });
    const id = g.recordId || String(now);
    changeProfile((p) => recordGame(p, { id, at: now, size, won, result, moves: g.game.moveNumber, color: g.humanColor, handicap, opponent: implOpponent(impl, { size, handicap }) }));
    const rec = state.profile.games.find((x) => x.id === id);
    g.rated = false;
    g.trendId = id;
    if (rec?.rating) {
      const after = estimate(state.profile, { size, now });
      g.ratingDelta = rec.rating.delta;
      // The estimate before and after, for the report ("≈ 12 kyu → ≈ 11 kyu (±1)").
      g.ratingChange = ratingChange(before, after);
    }
  }
  if (g.ratingChange && g.recordId) Games.patchGame(g.recordId, { rating: g.ratingChange });
  announce(resultText(result));
  // The same board turns into the post-game review, in place: its analysis
  // is the game's one analysis (stored with it, play/analysis.js). Away
  // from the board (the computer resigned meanwhile), when it is back.
  showFinished();
}

/** The finished game on the board as its review: the result, the balance, the key moments. */
export function openPostGame(g = state.game, { inPlace = true } = {}) {
  if (!g || !g.game.mainLine().at(-1).result || g.game.mainLine().length < 2) return;
  Engine.cancel();
  g.gen++;
  g.thinking = false;
  openReview(g.game, { source: "current", humanColor: g.opponent === "ai" ? g.humanColor : null, points: g.analysis || null, inPlace, autoJump: true, space: "play" });
}

/**
 * The board of Play shows the game in play; a finished one is its review.
 * Called where Play's board comes back (history, the sidebar).
 */
export function showFinished() {
  const g = state.game;
  // v12: a review left open in another space (a record or classic in the
  // Library) does not hold back this game's report; it is closed first.
  if (!boardShown()) return;
  if (g?.game.mainLine().at(-1).result && !g.scoring) {
    if (state.review) dropReview();
    openPostGame(g);
  }
}

/** The estimate (model/player.js estimate) before and after a rated game, as the report shows it. */
export function ratingChange(before, after) {
  if (!before || !after) return null;
  return { before: { r: before.r, rank: before.rank, pm: before.pm }, after: { r: after.r, rank: after.rank, pm: after.pm } };
}

/**
 * What a game against the computer teaches, from its whole-game analysis:
 * the game's record in the player model (per-phase losses, themes and what
 * each cost, model/player.js recordGame), and the two costliest mistakes
 * as drills (ids `${gameId}-${index}`). The analysis does it when it is
 * stored (play/analysis.js storeAnalysis), in the review or in the
 * background. Once per game: its file is marked `learned`. Returns false
 * when it was already done.
 */
export function learnFromGame({ game, points, humanColor, recordId = null, trendId = recordId, mistakes = null }) {
  const lib = recordId ? Games.getGame(recordId) : null;
  if (lib?.learned) return false;
  mistakes = mistakes || describeMistakes(game, points, humanColor);
  const now = Date.now();
  changeProfile((profile) => {
    let p = profile;
    // Complete the game's record with per-phase losses and the themes of
    // up to ten explained mistakes, and what each theme cost (the focus).
    if (trendId && p.games.some((r) => r.id === String(trendId))) {
      const summary = summarizeGame({ game, points, meta: { humanColor }, keyMoves: mistakes.top });
      const ten = describeMistakes(game, points, humanColor, 10).top;
      const themes = themeCounts(ten, humanColor);
      p = recordGame(p, { id: String(trendId), ...recordAnalysis(summary, humanColor, themes), themeLoss: themeLosses(ten, humanColor) });
    }
    // The two costliest mistakes become drills.
    const gameId = recordId || String(now);
    const sgf = game.toSGF();
    for (const m of mistakes.top.slice(0, 2)) {
      if (m.loss < 4 || !m.best || m.best.pass) continue;
      p = addMistake(
        p,
        {
          gameId,
          index: m.index,
          sgf,
          color: m.move.color,
          played: { x: m.move.x, y: m.move.y },
          best: { x: m.best.x, y: m.best.y },
          accept: m.accept,
          loss: m.loss,
          theme: m.theme,
          size: game.size,
        },
        now,
      );
    }
    return p;
  });
  if (lib) Games.patchGame(recordId, { learned: true });
  return true;
}

export function resultHeadline(g) {
  const r = g.game.current.result;
  if (!r) return "";
  if (g.opponent !== "ai") return resultText(r);
  const won = humanWon(g);
  return won === null ? resultText(r) : won ? t("result.youWon") : t("result.youLost");
}

/** Open the review of the game on the board ("Review so far", or the game that ended). */
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

/**
 * Save text through the native save dialog, or as a browser download.
 * Resolves true when it was saved. v13: in the app a failed write is an
 * error, never a silent fallback to a download link (a WebView ignores
 * those); the link is the browser preview's only.
 */
export async function saveText(filename, text, mime = "text/plain", { done = t("toast.exported") } = {}) {
  if (hasNative()) {
    if (!hasFileDialogs()) {
      toast(t("v13.exportFailed"), "error", 6000);
      return false;
    }
    const path = await saveFileDialog({ title: t("common.export"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return false;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeTextFile(chosen, text))) {
      revealPath(chosen);
      toast(done);
      return true;
    }
    toast(t("v13.exportFailed"), "error", 6000);
    return false;
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
  toast(done);
  return true;
}

export function continueCurrent() {
  remember();
  if (state.review) dropReview();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
    s.review = null;
  });
  showFinished();
  maybeComputerMove();
  ponder();
}

export function openNewGame(prefill = null) {
  openSheet("newGame", prefill ? { prefill } : {});
}
