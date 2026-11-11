/**
 * How a game ends: the clock, the count and its dead stones, the result,
 * the rating, the post-game review, and the game as a file.
 */
import { BLACK } from "../rules.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { estimate } from "../model/level.js";
import { implOpponent } from "../model/ladder.js";
import { recordGame } from "../model/record.js";
import { rateBase } from "../model/rerate.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeTextFile } from "../host.js";
import { state, update, toast, announce, clockChanged } from "./store.js";
import { changeProfile, resultText } from "./ctl-core.js";
import { tick } from "./clock.js";
import { dropReview, openReview } from "./review-session.js";
import { recordIdOf } from "./review-position.js";
import { boardShown, gameOver, gameSignal, saveToLibrary } from "./game-session.js";

/* ------------------------------------------------------------ clock */

let lastTick = 0;
export function clockTick() {
  const now = performance.now();
  const dt = lastTick ? (now - lastTick) / 1000 : 0;
  lastTick = now;
  const g = state.game;
  if (!g?.clock || dt <= 0 || dt > 2) return;
  // Only while the game is on screen: not on Play's home, in the explorer or in Practice.
  if (!boardShown() || (typeof document !== "undefined" && document.hidden)) return;
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
  // Only the clocks re-render (store.js clockChanged), not the app.
  clockChanged();
}

/* ---------------------------------------------------------- scoring */

export async function startScoring() {
  const g = state.game;
  // This count's own token: after Resume and a second count, the
  // first count's late answer is not this one's.
  const token = {};
  const node = g.game.current;
  g.scoring = { dead: [], score: g.game.score([]), source: "pending", at: performance.now(), token };
  update();
  let dead = { stones: [], source: "manual" };
  try {
    dead = await Engine.deadStones(g.game, { node, signal: gameSignal(g) });
  } catch (_) {}
  if (state.game !== g || g.scoring?.token !== token || g.game.current !== node) return;
  g.scoring = { dead: dead.stones, score: g.game.score(dead.stones), source: dead.source, at: performance.now(), token };
  update();
}

export function toggleDead(x, y) {
  const g = state.game;
  // Not while KataGo is still marking (its answer would undo the click).
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

/* -------------------------------------------------------- game over */

function humanWon(g) {
  const r = g.game.current.result;
  if (!r || /draw/i.test(r)) return null;
  return r.startsWith("B") === (g.humanColor === BLACK);
}

export function finishGame() {
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
  g.redo = [];
  g.passAsk = null;
  if (g.opponent === "ai" && g.rated && g.game.moveNumber >= 12) {
    const handicap = g.humanColor === BLACK ? g.game.handicap : -g.game.handicap;
    // Against the implementation that played, by its measured strength
    // (the offline engine counts as the standard level of the rank).
    const impl = g.played || Engine.resolveOpponent({ rank: g.rank, impl: g.impl }, {}).id;
    const size = g.game.size;
    const opponent = implOpponent(impl, { size, handicap });
    // What "Count again" needs to replace this game's rating step (model/rerate.js).
    if (g.recordId) Games.patchGame(g.recordId, { rateBase: { ...rateBase(state.profile, size), opponent, handicap, eligible: true } });
    if (won !== null) rate(g, { won, result, size, handicap, opponent });
  }
  if (g.ratingChange && g.recordId) Games.patchGame(g.recordId, { rating: g.ratingChange });
  announce(resultText(result));
  // The same board turns into the post-game review, in place: its analysis
  // is the game's one analysis (stored with it, play/analysis.js). Away
  // from the board (the computer resigned meanwhile), when it is back.
  showFinished();
}

/** Rate the finished game (once; a game with undos or hints is recorded unrated). */
function rate(g, { won, result, size, handicap, opponent }) {
  const now = Date.now();
  const before = estimate(state.profile, { size, now });
  const id = g.recordId || String(now);
  changeProfile((p) => recordGame(p, { id, at: now, size, won, result, moves: g.game.moveNumber, color: g.humanColor, handicap, opponent, undos: g.undos, hints: g.hints }));
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

/**
 * Why a game against the computer was not rated, in a phrase ("Not rated:
 * you took back moves"), or "" when it has no undo and no hint. Takes the
 * game on the board or a Library record ({ opponent, undos, hints }).
 */
export function unratedReason(g) {
  if (!g || g.opponent !== "ai") return "";
  const undos = g.undos > 0;
  const hints = g.hints > 0;
  if (!undos && !hints) return "";
  return t(undos && hints ? "play.unrated.both" : undos ? "play.unrated.undos" : "play.unrated.hints");
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
  // A review left open in another space (a record or classic in the
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

/** unratedReason for the game a review is of (the game on the board, or its Library record). */
export function reviewUnrated(r = state.review) {
  if (!r || r.meta.classic) return "";
  if (r.source === "current" && state.game?.game === r.game) return unratedReason(state.game);
  const id = recordIdOf(r);
  return unratedReason(id ? Games.getGame(id) : null);
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
 * Resolves true when it was saved. In the app a failed write is an
 * error, never a silent fallback to a download link (a WebView ignores
 * those); the link is the browser preview's only.
 */
export async function saveText(filename, text, mime = "text/plain", { done = t("toast.exported") } = {}) {
  if (hasNative()) {
    if (!hasFileDialogs()) {
      toast(t("data.exportFailed"), "error", 6000);
      return false;
    }
    const path = await saveFileDialog({ title: t("common.export"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return false;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeTextFile(chosen, text))) {
      revealPath(chosen);
      toast(done, "success");
      return true;
    }
    toast(t("data.exportFailed"), "error", 6000);
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
  toast(done, "success");
  return true;
}
