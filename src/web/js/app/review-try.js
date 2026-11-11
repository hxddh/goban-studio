/**
 * A key moment tried again on the board, judged by the engine; and the count
 * of a finished game taken again.
 */
import { Game, coordLabel, formatPoints } from "../rules.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { addMistake, recordGame, recordMistake } from "../model/record.js";
import { estimate } from "../model/level.js";
import { canRerate, rerateGame } from "../model/rerate.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { state, update, toast, announce } from "./store.js";
import { changeProfile, resultText } from "./ctl-core.js";
import { drillOf, judgeTry, tryMoments } from "../play/review-model.js";
import { leaveModes, ownGame, recordIdOf, startLive, stopLive } from "./review-position.js";
import { momentAt } from "./review-insight.js";
import { persist, refreshModel, saveEdits } from "./review-analysis.js";

/* ------------------------------------------------- try the moment again */

/**
 * "Try again" is offered for up to three key moments of a game of your own
 * that KataGo analysed (review-model tryMoments), and only with KataGo
 * here to judge the move.
 */
export function canTry(index, r = state.review) {
  if (!r || r.analyzing || !state.engine.available || !ownGame(r)) return false;
  return tryMoments(r.model).some((m) => m.index === index);
}

/** The moments of the review on screen that can be tried again, in game order. */
export function triable(r = state.review) {
  return r && !r.analyzing && state.engine.available && ownGame(r) ? tryMoments(r.model) : [];
}

/** Searches per judgement, by board size. */
const judgeVisits = (size) => (size === 19 ? 160 : size === 13 ? 200 : 240);

/** The position of a node as a game of its own (root stones, then the moves to it; play-ctl playFromHere too). */
export function gameAt(src, node) {
  // The root stones are copied, not placed again from the handicap, and
  // a record's mid-game setup (node.setup) is replayed with its move.
  const game = new Game({ size: src.size, rules: src.rules, komi: src.komi, handicap: src.handicap, placeHandicap: false });
  const root = src.root.board.signMap;
  const setup = [];
  for (let y = 0; y < src.size; y++) for (let x = 0; x < src.size; x++) if (root[y][x]) setup.push({ x, y, c: root[y][x] });
  if (setup.length) game.setup(setup, src.root.turn);
  const line = [];
  for (let n = node; n && n.parent; n = n.parent) line.unshift(n);
  for (const { move: m, setup: s } of line) {
    if (m.pass) game.pass({ color: m.color, force: true, setup: s });
    else game.play(m.x, m.y, { color: m.color, force: true, setup: s });
  }
  game.current.result = null;
  if (game.current.phase !== "playing") game.current.phase = "playing";
  return game;
}

/** The drill a moment is in the player model (added the first time it is tried). */
function drillFor(r, mo) {
  const gameId = recordIdOf(r) || "game-" + r.game.root.id;
  const drill = drillOf(mo, { sgf: r.game.toSGF(), gameId, size: r.game.size });
  changeProfile((p) => addMistake(p, drill, Date.now()));
  const have = state.profile.mistakes.find((m) => m.id === drill.id || (m.gameId === gameId && m.index === mo.index));
  return have?.id || drill.id;
}

/**
 * Try a key moment again: the board goes to the position before the
 * mistake, and the next move on it is judged by KataGo (tryMove). KataGo's
 * own look at that position starts at once, while the player thinks.
 */
export function tryAgain(index) {
  const r = state.review;
  if (!canTry(index, r)) return;
  const mo = momentAt(index, r);
  const line = r.game.mainLine();
  const node = line[index - 1];
  stopLive();
  leaveModes(r);
  r.variation = null;
  r.markTool = null;
  r.autoJump = false;
  r.game.goto(node.id);
  r.focus = index;
  r.live = null;
  const ctl = new AbortController();
  r.trial?.ctl?.abort();
  const pos = gameAt(r.game, node);
  const trial = { index, color: mo.color, best: mo.best, accept: mo.accept || [], loss: null, tried: null, status: "open", ctl, pos, drillId: drillFor(r, mo), before: null };
  trial.beforeP = Engine.analyzeNode(pos, pos.current, judgeVisits(pos.size), { signal: ctl.signal, lane: "interactive" })
    .catch(() => null)
    .then((a) => (trial.before = a || r.points[index - 1] || null));
  r.trial = trial;
  announce(t("try.prompt", [t(mo.color > 0 ? "common.black" : "common.white")]));
  update();
}

/** The move tried: judged against KataGo's best, and kept in the player model like a drill. */
export async function tryMove(x, y) {
  const r = state.review;
  const tr = r?.trial;
  if (!tr || tr.status !== "open") return;
  const ok = tr.pos.canPlay(x, y);
  if (!ok.ok) {
    toast(t("error." + (ok.reason || "illegal")), "warn");
    return;
  }
  Audio.stone(false);
  tr.tried = { x, y };
  tr.status = "judging";
  update();
  const before = await tr.beforeP;
  if (r.trial !== tr || tr.ctl.signal.aborted) return;
  let verdict = judgeTry({ tried: tr.tried, color: tr.color, before, accept: tr.accept });
  if (!verdict) {
    const after = tr.pos;
    const res = after.play(x, y);
    let a = null;
    if (res.ok) {
      try {
        a = await Engine.analyzeNode(after, after.current, judgeVisits(after.size), { signal: tr.ctl.signal, lane: "interactive" });
      } catch (_) {
        a = null;
      }
      after.undo();
    }
    if (r.trial !== tr || tr.ctl.signal.aborted) return;
    verdict = judgeTry({ tried: tr.tried, color: tr.color, before, after: a, accept: tr.accept });
  }
  if (!verdict) {
    // No answer from KataGo: nothing is counted, the move can be tried again.
    tr.status = "open";
    tr.tried = null;
    toast(t("try.noJudge"), "warn");
    update();
    return;
  }
  tr.loss = verdict.loss;
  tr.status = verdict.good ? "good" : "bad";
  changeProfile((p) => recordMistake(p, tr.drillId, { solved: verdict.good }, Date.now()));
  if (verdict.good) Audio.correct?.();
  else Audio.wrong?.();
  announce(tryVerdictText(tr, r.game.size));
  update();
}

/** What the verdict says, for the screen reader (the panel shows the same). */
function tryVerdictText(tr, size) {
  if (tr.status === "good") return t("try.good");
  const best = tr.best ? coordLabel(tr.best.x, tr.best.y, size) : "";
  return t("try.bad", [formatPoints(tr.loss), best]);
}

/** Another go at the same moment. */
export function tryRetry() {
  const tr = state.review?.trial;
  if (!tr) return;
  tr.status = "open";
  tr.tried = null;
  tr.loss = null;
  update();
}

/** Move on: the next moment to try, or back to the review. */
export function tryNext() {
  const r = state.review;
  const tr = r?.trial;
  if (!tr) return;
  const next = triable(r).find((m) => m.index > tr.index);
  if (next) return tryAgain(next.index);
  closeTrial();
}

/** Stop trying (Esc): the review shows the moment as it was played. */
export function closeTrial() {
  const r = state.review;
  const tr = r?.trial;
  if (!tr) return;
  tr.ctl.abort();
  r.trial = null;
  const line = r.game.mainLine();
  if (line[tr.index]) r.game.goto(line[tr.index].id);
  r.focus = tr.index;
  update();
  startLive();
}

/* ------------------------------------------------------ count again */

/** A result reached by counting ("B+3.5", "Draw"): not a resignation, time or forfeit. */
const counted = (result) => !!result && (/^draw$/i.test(result) || result === "0" || /^[BW]\+\d/.test(result));

/**
 * "Count again" is offered for a game of your own that ended by counting.
 * A rated game only while its rating step can be replaced: nothing on that
 * board size was rated after it (model/rerate.js canRerate).
 */
export function canRecount(r = state.review) {
  if (!r || r.meta.classic || r.meta.free || !ownGame(r)) return false;
  if (!counted(r.game.mainLine().at(-1).result)) return false;
  const id = recordIdOf(r);
  const rec = id ? Games.getGame(id) : null;
  if (!rec) return false;
  if (rec.opponent !== "ai") return true;
  const known = state.profile.games.some((g) => g.id === String(id));
  return !known || canRerate(state.profile, id, rec.rateBase || null);
}

/** Open the count of the finished game again: KataGo marks the dead stones, the player corrects them. */
export async function startRecount() {
  const r = state.review;
  if (!canRecount(r)) return;
  stopLive();
  r.trial?.ctl?.abort();
  r.trial = null;
  leaveModes(r);
  r.variation = null;
  r.markTool = null;
  r.autoJump = false;
  const game = r.game;
  const node = game.mainLine().at(-1);
  game.goto(node);
  const token = {};
  r.recount = { dead: [], score: game.score([]), source: "pending", token };
  update();
  let dead = { stones: [], source: "manual" };
  try {
    dead = await Engine.deadStones(game, { node, signal: r.ctl.signal });
  } catch (_) {
    /* marked by hand */
  }
  if (state.review !== r || r.recount?.token !== token || game.current !== node) return;
  r.recount = { dead: dead.stones, score: game.score(dead.stones), source: dead.source, token };
  update();
}

/** A click on a stone during the recount: its chain is dead, or alive again. */
export function recountToggle(x, y) {
  const r = state.review;
  const rc = r?.recount;
  if (!rc || rc.source === "pending") return;
  const board = r.game.current.board;
  if (!board.get([x, y])) return;
  const chain = board.getChain([x, y]).map(([cx, cy]) => ({ x: cx, y: cy }));
  const isDead = rc.dead.some((d) => d.x === x && d.y === y);
  let dead = rc.dead.filter((d) => !chain.some((c) => c.x === d.x && c.y === d.y));
  if (!isDead) dead = dead.concat(chain);
  r.recount = { ...rc, dead, score: r.game.score(dead) };
  update();
}

export function cancelRecount() {
  const r = state.review;
  if (!r?.recount) return false;
  r.recount = null;
  update();
  startLive();
  return true;
}

/**
 * The new count stands: the game's result is replaced (in its record, and
 * for the game on the board), and so is what the game did to the strength
 * estimate: its rating step is taken back and made again from the new
 * result, never added a second time.
 */
export function confirmRecount() {
  const r = state.review;
  const rc = r?.recount;
  if (!rc || rc.source === "pending") return false;
  const end = r.game.mainLine().at(-1);
  const result = rc.score.result;
  r.recount = null;
  if (result === end.result) {
    toast(t("recount.same"));
    update();
    startLive();
    return false;
  }
  end.result = result;
  r.edits = { ...r.edits, dirty: true };
  saveEdits(r);
  const id = recordIdOf(r);
  const rec = id ? Games.getGame(id) : null;
  const me = r.meta.humanColor ?? null;
  if (rec && rec.opponent === "ai" && me != null) {
    const won = /^[BW]\+/.test(result) ? result.startsWith("B") === (me > 0) : null;
    const size = r.game.size;
    const now = Date.now();
    const base = rec.rateBase || null;
    const known = state.profile.games.some((g) => g.id === String(id));
    if (known) changeProfile((p) => rerateGame(p, id, { won, result, opponent: base?.opponent, base }));
    else if (base?.eligible && won !== null) {
      // Not recorded when it ended (a draw then): it is rated now, as a game just finished.
      changeProfile((p) => recordGame(p, { id, at: now, size, won, result, moves: r.game.mainLine().length - 1, color: me, handicap: base.handicap || 0, opponent: base.opponent, undos: rec.undos || 0, hints: rec.hints || 0 }));
    }
    const mine = state.profile.games.find((g) => g.id === String(id));
    // The estimate before this game and after it, as the result line shows it.
    const from = base?.entry ? estimate({ ...state.profile, rating: { ...state.profile.rating, [size]: base.entry } }, { size, now }) : null;
    const after = estimate(state.profile, { size, now });
    const rating = mine?.rating && from && after ? { before: { r: from.r, rank: from.rank, pm: from.pm }, after: { r: after.r, rank: after.rank, pm: after.pm } } : null;
    Games.patchGame(id, { rating });
    if (state.game?.game === r.game) {
      state.game.ratingChange = rating;
      state.game.ratingDelta = mine?.rating?.delta ?? null;
    }
  }
  // The stored review names the result: it is made again from the analysis at hand.
  refreshModel(r);
  persist(r);
  toast(t("recount.updated", [resultText(result)]), "success");
  update();
  startLive();
  return true;
}
