/**
 * v8 capture Go (吃子棋): the beginner's first game, on 9×9, against the
 * small opponent in ../capture-ai.js. The first capture wins.
 *
 * It lives in Learn (state.learn.capture), never in state.game: it is
 * not saved, rated, reported or analysed, and it never reaches the history of games,
 * the strength estimate or the player model. The only thing
 * kept is how many the player has won (settings.captureWins), which picks
 * the computer's level and tells the lesson bridge when to stop offering it.
 */
import { BLACK, Game } from "../rules.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { moveText } from "../a11y.js";
import { chooseCaptureMove, fromSignMap, hasLegalMove, levelFor } from "../capture-ai.js";
import { state, update, toast, announce } from "./store.js";
import { remember, isRestoring, setSetting } from "./ctl-core.js";
import { newGame } from "./play-ctl.js";
import { FIRST_GAME, measuredRank } from "../model/player.js";
import { itemDone } from "../learn/session.js";

const SIZE = 9;

/** The lesson bridge after the life basics: a normal 9×9 game against the gentlest level (teaching is on for new players). */
export function startFirstGame() {
  newGame({ size: FIRST_GAME.size, opponent: "ai", color: BLACK, opponentRank: measuredRank(FIRST_GAME.level) ?? 30, handicap: FIRST_GAME.handicap });
}

function fresh(from) {
  const game = new Game({ size: SIZE, komi: 0 });
  return {
    game,
    human: BLACK,
    level: levelFor(state.settings.captureWins),
    from: from || null, // the lesson it was offered after
    thinking: false,
    over: null, // { winner, by: "capture" | "noMove", stones: [{x, y}] }
    gen: 0,
  };
}

/** Open a capture game (from the lesson-complete page, or as an item of today's session). */
export function startCapture({ from = null, daily = null } = {}) {
  if (!isRestoring() && !daily) remember();
  const prev = state.learn.capture;
  if (prev) prev.gen++;
  const cap = fresh(from ?? prev?.from ?? null);
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "capture", capture: cap, problem: null, mistake: null, daily };
  });
  announce(t("capture.goal"));
}

/**
 * Back or Forward to a capture game: the game the player left, as it was
 * (state.learn.capture stays while they visit other places); a new one
 * only when there is none.
 */
export function resumeCapture({ from = null } = {}) {
  const cap = state.learn.capture;
  if (!cap) return startCapture({ from });
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "capture", problem: null, mistake: null, daily: null };
  });
  // The computer was thinking when the player left: let it move now.
  if (!cap.over && cap.game.turn !== cap.human && !cap.thinking) computerMove(cap);
}

/** "Play again": a new game in place (no new history entry). */
export function captureAgain() {
  const prev = state.learn.capture;
  if (prev) prev.gen++;
  update((s) => {
    s.learn = { ...s.learn, capture: fresh(prev?.from) };
  });
  announce(t("capture.goal"));
}

export function captureCanPlay(x, y) {
  const C = state.learn.capture;
  return !C || C.game.canPlay(x, y).ok;
}

/** The player's move. */
export function capturePlay(x, y) {
  const C = state.learn.capture;
  if (!C || C.over || C.thinking || C.game.turn !== C.human) return;
  const res = C.game.canPlay(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  if (!place(C, x, y, false)) return;
  if (C.over) return;
  computerMove(C);
}

/** Play at (x, y) for the side to move; end the game on a capture. */
function place(C, x, y, computer) {
  const color = C.game.turn;
  const before = C.game.current.board.signMap;
  const r = C.game.play(x, y);
  if (!r.ok) return false;
  const after = C.game.current.board.signMap;
  const taken = [];
  for (let yy = 0; yy < SIZE; yy++) for (let xx = 0; xx < SIZE; xx++) if (before[yy][xx] === -color && after[yy][xx] === 0) taken.push({ x: xx, y: yy });
  announce(moveText({ color, x, y, captured: taken.length, size: SIZE, computer }));
  if (taken.length) {
    Audio.capture ? Audio.capture(taken.length) : Audio.stone(true);
    finish(C, { winner: color, by: "capture", stones: taken });
  } else {
    Audio.stone(false);
    // No legal move left for the side to play (all suicide): it loses.
    if (!hasLegalMove(fromSignMap(after), -color)) finish(C, { winner: color, by: "noMove", stones: [] });
  }
  update();
  return true;
}

function finish(C, over) {
  C.over = over;
  C.thinking = false;
  const won = over.winner === C.human;
  // A game played to its end is done in today's session, won or lost.
  itemDone("capture");
  if (won) {
    setSetting("captureWins", (state.settings.captureWins || 0) + 1);
    Audio.win();
  } else Audio.lose();
  announce(captureResultLine(C));
}

/** The result as one line. */
export function captureResultLine(C) {
  if (!C?.over) return "";
  const won = C.over.winner === C.human;
  if (C.over.by === "noMove") return t(won ? "capture.noMoveWon" : "capture.noMoveLost");
  return t(won ? "capture.won" : "capture.lost");
}

/** The computer's reply: computed in a few milliseconds, shown after a short, human pause. */
function computerMove(C) {
  const gen = ++C.gen;
  C.thinking = true;
  update();
  const last = C.game.current.move;
  const m = chooseCaptureMove(fromSignMap(C.game.current.board.signMap), -C.human, {
    level: C.level,
    last: last && !last.pass ? last.y * SIZE + last.x : null,
  });
  const wait = m?.why === "capture" ? 520 : 380 + Math.random() * 360;
  setTimeout(() => {
    if (state.learn.capture !== C || C.gen !== gen || C.over) return;
    C.thinking = false;
    if (!m) {
      finish(C, { winner: C.human, by: "noMove", stones: [] });
      update();
      return;
    }
    place(C, m.x, m.y, true);
  }, wait);
}

