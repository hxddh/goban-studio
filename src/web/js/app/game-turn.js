/**
 * A turn of the game: the player's move, the computer's reply and its
 * failure, the teaching game's proposals, undo and redo, passing, resigning
 * and hints.
 */
import { coordLabel } from "../rules.js";
import * as Engine from "../engine.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { state, update, toast, announce } from "./store.js";
import { moveText } from "../a11y.js";
import { confirmAction, teachingOn } from "./ctl-core.js";
import { colorName } from "./game-view.js";
import { countReady, resignStep, thinkTime } from "./feel.js";
import { moveMade } from "./clock.js";
import { hintReason, hintText, warningReason, warningText } from "./teach-why.js";
import { gameOver, gameSignal, isComputerTurn, persistCurrent, playReviewing } from "./game-session.js";
import { finishGame, startScoring, toggleDead } from "./game-end.js";

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
  g.passAsk = null;
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
  // A new move of the player's: what was taken back cannot be played again.
  g.redo = [];
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
 * "Shall we count?" on a settled board (feel.js countReady). After
 * "keep playing" it waits three moves each before it asks again.
 */
function proposalWaits(g) {
  return g.proposalSeen >= 0 && g.game.moveNumber < g.proposalSeen + 6;
}

function checkProposal(a) {
  const g = state.game;
  if (!proposalWaits(g) && countReady(a, g.game.moveNumber, g.game.size)) g.proposal = true;
}

/**
 * Where the computer's move comes from. `decide` is the engine's
 * (KataGo, or the offline engine inside it); `offline` the offline engine
 * alone (ai.js), tried when `decide` gave no move. The tests replace them
 * to make each fail.
 */
export const moveSources = {
  decide: (game, opponent, opts) => Engine.decide(game, opponent, opts),
  offline: (game, opponent) => Engine.offlineMove(game, opponent),
};

export async function maybeComputerMove({ afterHuman = false } = {}) {
  const g = state.game;
  if (!g || g.thinking || !isComputerTurn() || playReviewing() || g.pending) return;
  const gen = ++g.gen;
  g.thinking = true;
  g.engineFailed = false;
  update();
  const started = performance.now();
  // The position the move is for, fixed now (a queued search would read the board when it runs).
  const node = g.game.current;
  let result = { move: null, analysis: null };
  try {
    result = (await moveSources.decide(g.game, { rank: g.rank, impl: g.impl }, { signal: gameSignal(g), node })) || result;
  } catch (_) {
    result = { move: null, analysis: null };
  }
  if (state.game !== g || gen !== g.gen) return;
  // KataGo kept being superseded (engine.js askKataGo) while this game still
  // wants the move. Not a failure, so no weaker offline move; Retry asks again.
  if (result.superseded && !result.move) return computerFailed(g);
  if (!result.move && g.game.current === node) result = await offlineFallback(g, gen, result);
  if (!result || state.game !== g || gen !== g.gen) return;
  const a = result.analysis;
  if (a) g.eval = a;
  if (result.mode) g.opponentMode = result.mode; // "human" | "strong" | "standard" | "offline"
  // What actually played (a standard level when an optional process
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
        // One reason, from the two searches already made (no new search).
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

/**
 * The engine gave no move (it failed, or threw): the offline engine
 * plays this one. Resolves the result to play, or null when that failed
 * too or the game moved on; then the game waits on Retry (engineFailed),
 * never stuck on the computer's turn without a way out.
 */
async function offlineFallback(g, gen, result) {
  let move = null;
  try {
    move = await moveSources.offline(g.game, { rank: g.rank, impl: g.impl });
  } catch (_) {
    move = null;
  }
  if (state.game !== g || gen !== g.gen) return null;
  if (move) return { ...result, move, analysis: result.analysis || null, mode: "offline" };
  computerFailed(g);
  return null;
}

/** The computer could not move: say so, and offer Retry (play.jsx). */
function computerFailed(g) {
  g.thinking = false;
  g.engineFailed = true;
  announce(t("play.engineFailed"));
  update();
}

/** Retry after the computer could not move (the panel's Retry). */
export function retryComputerMove() {
  const g = state.game;
  if (!g?.engineFailed) return;
  g.engineFailed = false;
  update();
  maybeComputerMove();
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
  // A board settled before one of KataGo's own quiet moves is settled
  // after it, so the count is offered on the player's turn even when
  // nothing ponders there.
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
  if (!isComputerTurn()) {
    update();
    return;
  }
  // No move to play (a kept teaching pause whose search had none): never stuck on the computer's turn.
  if (!move) return computerFailed(g);
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

/**
 * A rated game stops being rated with its first undo or hint
 * (model/player.js: assisted). Said once per game, when it happens.
 */
function noteAssisted(g) {
  if (g.opponent !== "ai" || !g.rated || g.assistSaid || g.undos + g.hints > 0) return;
  g.assistSaid = true;
  toast(t("play.unratedNow"), "info", { key: "unrated" });
}

/** Everything a position change resets (an undo, a redo). */
function settle(g) {
  Engine.cancel();
  g.gen++;
  g.thinking = false;
  g.engineFailed = false;
  g.pending = null;
  g.scoring = null;
  g.hint = null;
  g.ghost = null;
  g.passAsk = null;
  g.proposal = false;
  g.aiLow = 0;
  g.eval = null;
}

/**
 * Take back a move: the player's last move, with the computer's reply to
 * it when it has one (so it is the player's turn again). The moves taken
 * back can be played again with redo until a new move is played.
 */
export function undo() {
  const g = state.game;
  if (!g || playReviewing() || !g.game.current.parent) return;
  settle(g);
  const taken = [];
  const back = () => {
    const node = g.game.current;
    if (node.result) node.result = null;
    taken.unshift({ ...node.move });
    g.game.undo();
  };
  back();
  if (g.opponent === "ai" && g.game.turn !== g.humanColor && g.game.current.parent) back();
  g.redo.push(taken);
  noteAssisted(g);
  g.undos++;
  persistCurrent();
  update();
  maybeComputerMove();
  ponder();
}

/** There is a move taken back that can be played again. */
export function canRedo(g = state.game) {
  return !!g && g.redo.length > 0 && !g.pending && !gameOver(g);
}

/**
 * Play the moves of the last undo again: the player's move and the reply
 * the computer made to it (the computer is not asked again; it is when the
 * undo took back the player's move alone). The clocks stay as they are:
 * the time of those moves was already spent. An undo redone leaves no
 * trace: the game counts one undo fewer.
 */
export function redo() {
  const g = state.game;
  if (!g || playReviewing() || !canRedo(g)) return;
  settle(g);
  const moves = g.redo.pop();
  for (const mv of moves) {
    const res = mv.pass ? g.game.pass({ color: mv.color, force: true }) : g.game.play(mv.x, mv.y, { color: mv.color, force: true });
    if (!res.ok) {
      g.redo = [];
      break;
    }
  }
  g.undos = Math.max(0, g.undos - 1);
  Audio.stone(false);
  const last = g.game.current.move;
  if (last) announce(moveText({ color: last.color, x: last.x, y: last.y, pass: last.pass, size: g.game.size }));
  if (g.game.phase === "scoring" && !g.scoring) startScoring();
  persistCurrent();
  update();
  maybeComputerMove();
  ponder();
}

/** The player has passed before in this game (both sides in a game between two people). */
function passedBefore(g) {
  return g.game.path.some((n) => n.move?.pass && (g.opponent === "human" || n.move.color === g.humanColor));
}

/**
 * Pass. The first pass of a game is confirmed in the panel (g.passAsk
 * "first"), and so is a pass that answers a pass, which ends the game and
 * starts the count ("ends"); asking again while it waits confirms it. Any
 * other pass is played at once: the status line says so, and Undo takes
 * it back.
 */
export function requestPass() {
  const g = state.game;
  if (!g || g.thinking || g.pending || g.game.phase !== "playing" || gameOver(g)) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  if (g.passAsk) return passNow();
  const ends = !!g.game.current.move?.pass;
  if (!ends && passedBefore(g)) return passNow();
  g.passAsk = ends ? "ends" : "first";
  g.ghost = null;
  announce(passAskText(g));
  update();
}

/** What the inline confirmation asks. */
export function passAskText(g = state.game) {
  if (g?.passAsk !== "ends") return t("play.passAsk");
  return g.opponent === "ai" ? t("play.passAskEndsAi") : t("play.passAskEnds", [colorName(-g.game.turn)]);
}

/** The pass, confirmed or needing no confirmation. */
export function passNow() {
  const g = state.game;
  if (!g || g.thinking || g.pending || g.game.phase !== "playing" || gameOver(g)) return;
  if (g.opponent === "ai" && g.game.turn !== g.humanColor) return;
  g.passAsk = null;
  g.redo = [];
  const color = g.game.turn;
  g.game.pass();
  g.clock = moveMade(g.clock, color);
  Audio.pass();
  announce(moveText({ color, pass: true }));
  afterMove({ human: true });
}

/** Not passing after all (Cancel, Esc, a move on the board). */
export function cancelPass() {
  const g = state.game;
  if (!g?.passAsk) return false;
  g.passAsk = null;
  update();
  return true;
}

/** "The game looks finished — count?" accepted: both sides pass. */
export function acceptCount() {
  const g = state.game;
  if (!g || g.game.phase !== "playing" || gameOver(g)) return;
  g.proposal = false;
  g.passAsk = null;
  g.redo = [];
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
  // The hint is for this position: an undo, a new move or a new game
  // while it is being worked out drops it (gen, node).
  const gen = g.gen;
  const node = g.game.current;
  g.thinking = true;
  update();
  let h = null;
  try {
    h = await Engine.hint(g.game, { node, signal: gameSignal(g) });
  } catch (_) {
    h = null;
  }
  if (state.game !== g || gen !== g.gen) return;
  g.thinking = false;
  if (g.game.current !== node) return update();
  noteAssisted(g);
  g.hints++;
  if (h && !h.pass) {
    g.hint = { x: h.x, y: h.y, reason: hintReason(node.board.signMap, g.game.turn, h) };
    announce(hintText(coordLabel(h.x, h.y, g.game.size), g.hint.reason));
  } else toast(t("play.hintPass"));
  persistCurrent();
  update();
}

export function resumePlay() {
  const g = state.game;
  if (!g?.scoring) return;
  // The count's search (dead stones) is stopped; its answer would belong to no count.
  Engine.cancel();
  g.game.resumePlay();
  g.scoring = null;
  persistCurrent();
  update();
  maybeComputerMove();
}
