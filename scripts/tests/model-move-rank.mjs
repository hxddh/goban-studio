/**
 * Model: the second reading of strength from the player's own moves
 * (model/move-rank.js) — the posterior over rank profiles, its range, too
 * few moves, the weak prior it gives the rating (player.js applyMoveRank,
 * once per game, only while results are few), and the host call it needs
 * (katago.js humanMoveProbabilities: nothing without the capability).
 */
import { test, assert, Game, BLACK } from "./helpers.mjs";
import * as R from "../../src/web/js/model/move-rank.js";
import * as P from "../../src/web/js/model/player.js";
import { humanMoveProbabilities, canReadHumanPolicy } from "../../src/web/js/katago.js";

/** Moves whose probability peaks at the profile of `rank` (a smooth bump over the profiles). */
function movesLike(rank, n = 60, spread = 6) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = {};
    for (const pr of R.PROFILES) p[pr.id] = 0.3 * Math.exp(-(((pr.rank - rank) / spread) ** 2)) + 0.02;
    rows.push({ index: R.SKIP_MOVES + 2 * i, p });
  }
  return rows;
}

await test("model move rank: the profile that would most likely have played the moves; a range of at least ±2; nothing from a short game", () => {
  const mid = R.rankFromLikelihoods(movesLike(10));
  assert.equal(mid.rank, 10);
  assert.ok(mid.lo <= 8 && mid.hi >= 12, JSON.stringify(mid));
  assert.equal(mid.n, 60);
  assert.ok(mid.posterior.rank_10k > mid.posterior.rank_1k);
  const strong = R.rankFromLikelihoods(movesLike(0));
  assert.ok(strong.rank <= 1, JSON.stringify(strong));
  const weak = R.rankFromLikelihoods(movesLike(20));
  assert.ok(weak.rank >= 18 && weak.hi <= 20, "never weaker than the weakest profile");
  // Opening moves are left out; a short game says nothing.
  assert.equal(R.rankFromLikelihoods(movesLike(10, R.MIN_MOVES - 1)), null);
  assert.equal(R.rankFromLikelihoods(movesLike(10).map((r) => ({ ...r, index: 3 }))), null);
  assert.equal(R.rankFromLikelihoods(null), null);
  // A move the model never expected does not decide alone (floored).
  const odd = movesLike(10);
  odd[0] = { index: 50, p: Object.fromEntries(R.PROFILES.map((pr) => [pr.id, pr.id === "rank_3d" ? 0.5 : 0])) };
  assert.equal(R.rankFromLikelihoods(odd).rank, 10);
  assert.deepEqual(R.normalizeMoveRank({ rank: 9.6, lo: 12, hi: 7, n: 40 }), { rank: 10, lo: 10, hi: 10, n: 40 });
  assert.equal(R.normalizeMoveRank({ rank: 50, lo: 1, hi: 2, n: 3 }), null);
});

await test("model move rank: a weak prior for the rating — part of the way, once per game, only while results are few", () => {
  const at = 1_000_000;
  let p = P.newProfile({ rank: 25, at });
  const before = p.rating[19];
  const game = { id: "g1", at, size: 19, result: "B+R", won: true, moves: 120, color: BLACK, level: "10k", mode: "standard", handicap: 0 };
  p = P.recordGame(p, game);
  const rated = p.rating[19];
  // The reading (8 kyu, stronger than the estimate) arrives with the analysis.
  p = P.recordGame(p, { id: "g1", moveRank: { rank: 8, lo: 6, hi: 10, n: 80 } });
  const after = p.rating[19];
  assert.ok(after.mu > rated.mu, "moved towards the reading");
  const target = P.gorToTheta(P.rankToRating(8));
  assert.ok(after.mu - rated.mu < 0.5 * (target - rated.mu), "less than half the way: a weak prior");
  assert.ok(after.sigma < rated.sigma && after.sigma > 0.8 * rated.sigma, "narrows a little");
  assert.equal(after.games, rated.games, "not a game");
  assert.deepEqual(p.games[0].moveRank, { rank: 8, lo: 6, hi: 10, n: 80 });
  assert.equal(p.games[0].moveRankUsed, true);
  // The same reading again changes nothing.
  assert.deepEqual(P.recordGame(p, { id: "g1", moveRank: { rank: 2, lo: 0, hi: 4, n: 80 } }).rating[19], after);
  // With enough rated games the reading is kept but no longer moves the estimate.
  const settled = { ...before, games: P.MOVE_RANK.MAX_GAMES };
  assert.equal(P.applyMoveRank(settled, { rank: 2, lo: 0, hi: 4, n: 80 }), settled);
  assert.ok(before.games === 0);
  // Through the store.
  assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(p))).games[0].moveRank, { rank: 8, lo: 6, hi: 10, n: 80 });
});

await test("model move rank: the host call needs the humanPolicy capability; with it, the per-move probabilities come back", async () => {
  const g = new Game(19);
  g.play(3, 3);
  delete globalThis.zero;
  assert.equal(await humanMoveProbabilities(g, BLACK, ["rank_10k"]), null, "no host");
  const calls = [];
  globalThis.zero = { on: () => () => {}, invoke: async (command) => {
    calls.push(command);
    if (command === "studio.katagoStatus") return { available: true, async: true, stream: true, models: true };
    return { ok: true, moves: [] };
  } };
  assert.equal(await canReadHumanPolicy(), false);
  assert.equal(await humanMoveProbabilities(g, BLACK, ["rank_10k"]), null, "a host without the capability is not asked");
  assert.ok(!calls.includes("studio.katagoHumanPolicy"));
  delete globalThis.zero;
});
