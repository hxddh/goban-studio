/**
 * Which game to offer (the suggested opponent, the first-run offer) and
 * starting one: New game, the game restored at launch, Continue, an
 * unfinished game resumed, play on from a review position.
 */
import { BLACK, WHITE, Game, defaultKomi, normalizeRules } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { focus } from "../model/focus.js";
import { suggestedGame } from "../model/level.js";
import { t } from "../i18n.js";
import { state, update, toast, announce } from "./store.js";
import { defaultRules, openSheet, playerRankNow, remember, setGameHooks, setSetting, syncMenus } from "./ctl-core.js";
import { newClock } from "./clock.js";
import { dropReview } from "./review-session.js";
import { gameAt } from "./review-try.js";
import { finishedBySize, firstOffer, otherSize, suggestedSize } from "./first-run.js";
import { freshGameState, parkCurrent, persistCurrent, unfinishedGame } from "./game-session.js";
import { showFinished, startScoring } from "./game-end.js";
import { maybeComputerMove, ponder } from "./game-turn.js";

export function restoreCurrent() {
  const saved = Games.loadCurrent();
  if (saved?.sgf) {
    try {
      const { game } = loadSGF(saved.sgf);
      state.game = freshGameState(game, saved);
      // Its Library record (game files are read when needed) is read now, for the review and the result.
      if (saved.recordId && !Games.isLoaded(saved.recordId)) Games.loadGame(saved.recordId);
      // A game saved during the count (both passed) counts again;
      // otherwise it would have neither a count nor its play controls.
      if (game.phase === "scoring" && !game.current.result) startScoring();
      return;
    } catch (_) {
      /* fall through */
    }
  }
  // Nothing saved, nothing on the board: Play shows its home (the
  // suggested game, with its handicap, and New game) until a game starts.
  state.game = null;
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
 * What onboarding promised and the player has not taken up yet
 * (first-run.js firstOffer): "lesson" (lesson one), "small" (the gentle
 * 9×9 game), "full" (the 19×19 game), or null.
 */
export function firstRunOffer() {
  const p = state.profile;
  return firstOffer({
    experience: state.settings.experience,
    games: Games.listGames().length + (p?.games?.length || 0),
    lessonsDone: Object.values(p?.lessons || {}).filter((l) => l.done).length,
    gameStarted: unfinishedGame(),
  });
}

/**
 * What to play next (Play's suggested game), and why: the week's first
 * focus (model/player.js focus) or the player's level. A beginner is
 * offered 9×9, then 13×13 after a few games there, before the standard
 * board (first-run.js suggestedSize); the quieter second offer is the next
 * board up, or a quick 9×9 beside the standard board. Right after
 * onboarding the game is the one it promised (`first`): the gentlest level
 * on 9×9 for someone who knows the rules, an even 19×19 for a player.
 * { size, opponentRank, label, handicap, rank, weak: { theme } | null, quick, first }.
 */
export function recommendedGame() {
  const rank = playerRankNow();
  const beginner = rank == null || rank >= BEGINNER_RANK;
  const first = firstRunOffer();
  const size = first === "full" ? 19 : first ? 9 : suggestedSize({ beginner, finished: finishedBySize(Games.listGames()) });
  let main = suggestedOpponent(size);
  if (first === "full") main = { ...main, handicap: 0 };
  else if (first) {
    const gentle = Engine.nearest(30, Engine.installed());
    main = { ...main, opponentRank: gentle.rank, label: gentle.label, handicap: 0 };
  }
  const view = focus(state.profile, Date.now());
  const key = view.focus?.[0]?.key || null;
  return { ...main, rank, weak: key ? { theme: key } : null, quick: suggestedOpponent(otherSize(size)), first };
}

export function newGame(opts = {}) {
  const size = [9, 13, 19].includes(Number(opts.size)) ? Number(opts.size) : state.settings.boardSize || 19;
  if (opts.rememberSize && size !== state.settings.boardSize) setSetting("boardSize", size);
  const handicap = Math.max(0, Math.min(9, Number(opts.handicap) || 0));
  // The sheet's choice, else the rules for new games (Settings, or those of the interface language).
  const rules = normalizeRules(opts.rules ?? defaultRules());
  if (opts.rememberRules && opts.rules && rules !== defaultRules()) setSetting("defaultRules", rules);
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
  // The opponent is a rank of the ladder (opts.opponentRank).
  const opponentRank = opts.opponentRank ?? state.settings.opponentRank;
  if (opts.opponentRank != null) setSetting("opponentRank", opts.opponentRank);
  const tc = opts.timeControl ?? state.settings.timeControl;
  if (opts.timeControl) setSetting("timeControl", opts.timeControl);
  // The game in progress is not lost (it goes to the Library as unfinished).
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

/* ---------------------------------------------------- play from here */

/** A new game against the computer from the position on the review's board. */
export function playFromHere() {
  const r = state.review;
  if (!r) return;
  // The record's rules and handicap carry over (the handicap is what
  // the Chinese count compensates); the root stones are set up.
  const game = gameAt(r.game, r.game.current);
  // The game in progress goes to the Library as unfinished first.
  parkCurrent();
  dropReview(r);
  if (state.game) state.game.gen++;
  remember();
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor });
    s.review = null;
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
  });
  persistCurrent();
  maybeComputerMove();
  ponder();
}

// The review controller reaches the game in play through these (ctl-core setGameHooks).
setGameHooks({
  persist: () => persistCurrent(),
  resume: () => {
    maybeComputerMove();
    ponder();
  },
});
