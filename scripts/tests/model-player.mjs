/**
 * Model: the one player model (src/web/js/model/player.js) and the
 * measured ladder (model/ladder.js): the rating, spaced review of problems
 * and drills, game records, the week's focus, Learn's path, the next
 * lesson and the beginner bridges.
 */
import fs from "node:fs";
import path from "node:path";

export default async function ({ test, assert, root }) {
  const P = await import("../../src/web/js/model/player.js");
  const O = await import("../../src/web/js/opponents.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const { COURSE } = await import("../../src/web/js/content/course.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const DAY = P.DAY;
  const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime(); // a Wednesday
  const content = { problems: PROBLEMS, grades: GRADES };
  const frozen = (p) => JSON.stringify(p);

  /* ------------------------------------------------------------ helpers */

  const phases = (end = 2, mid = 6) => ({ opening: { loss: 2, mistakes: 0, blunders: 0, moves: 20 }, middle: { loss: mid, mistakes: 1, blunders: 0, moves: 60 }, endgame: { loss: end, mistakes: 0, blunders: 0, moves: 40 } });
  const game = (i, { themes = {}, themeLoss, end, mid, confidence = "high", ago = i } = {}) => ({ id: "g" + i, at: NOW - ago * DAY - 1000, size: 19, color: 1, won: false, moves: 200, confidence, phases: phases(end, mid), themes, ...(themeLoss ? { themeLoss } : {}), rated: false });
  /** A v9 profile with these parts, as stored. */
  const profile = (extra = {}) => P.normalizeProfile({ ...P.newProfile(), ...extra, games: P.normalizeGames(extra.games || []) });
  /** A rated game (won or lost) against a level. */
  const rated = (i, { level = "15k", size = 19, won = true, at = i, mode, handicap } = {}) => ({ id: "r" + i, at, size, level, won, moves: 100, ...(mode ? { mode } : {}), ...(handicap ? { handicap } : {}) });

  /* ----------------------------------------------------- the ladder */

  await test("model ladder: the θ ↔ GoR scale, the measured levels and the board maps", async () => {
    assert.equal(Math.round(P.thetaToGoR(11.65)), 1100, "rank_10k is 10 kyu");
    assert.equal(Math.round(P.thetaToGoR(P.MEASURED.standard["2d"][19])), 2429);
    for (const g of [-1500, 0, 1100, 2400]) assert.ok(Math.abs(P.thetaToGoR(P.gorToTheta(g)) - g) < 1e-6);
    assert.deepEqual(P.LEVELS, ["30k", "25k", "20k", "15k", "10k", "5k", "1k", "2d"]);
    // One source for the calibration: the model reads opponents.js's tables.
    const O = await import("../../src/web/js/opponents.js");
    assert.equal(P.MEASURED, O.MEASURED);
    assert.equal(P.thetaToGoR, O.thetaToGoR);
    // Handicap: given stones make the level weaker, given away stronger; one stone is none.
    const opp = P.MEASURED.standard["10k"][19];
    assert.equal(P.levelTheta("10k"), opp);
    assert.ok(P.levelTheta("10k", { handicap: 3 }) < opp && P.levelTheta("10k", { handicap: -3 }) > opp);
    assert.equal(P.levelTheta("10k", { handicap: 1 }), opp);
    assert.equal(P.levelTheta("nope"), null);
    // The board maps go through the standard levels' measured pairs.
    for (const id of P.LEVELS) for (const size of [9, 13]) assert.ok(Math.abs(P.onBoard(P.MEASURED.standard[id][19], size) - P.MEASURED.standard[id][size]) < 1e-9, `${id} ${size}`);
    for (const t19 of [-8, 0, 3.3, 12, 20, 30]) for (const size of [9, 13]) assert.ok(Math.abs(P.fromBoard(P.onBoard(t19, size), size) - t19) < 1e-6);
    // Every mode is ordered as its labels, on every board; the stronger network is above.
    for (const size of [9, 13, 19]) {
      for (const mode of ["standard", "human"]) for (let i = 1; i < P.LEVELS.length; i++) assert.ok(P.levelTheta(P.LEVELS[i], { mode, size }) > P.levelTheta(P.LEVELS[i - 1], { mode, size }), `${mode} ${P.LEVELS[i]} ${size}`);
      assert.ok(P.levelTheta("2d", { mode: "strong", size }) > P.levelTheta("2d", { size }));
    }
    // Measured ranks are the labels v9 shows: the standard ladder reads as its v4 labels.
    const labels = { "30k": 30, "25k": 29, "20k": 23, "15k": 18, "10k": 12, "5k": 7, "1k": 2, "2d": -3 };
    for (const [id, rank] of Object.entries(labels)) assert.equal(P.measuredRank(id), rank, id);
    const l9 = P.ladder({ size: 9, modes: ["standard", "human", "strong"] });
    assert.equal(l9.length, 8 + 8 + 1);
    for (let i = 1; i < l9.length; i++) assert.ok(l9[i].theta >= l9[i - 1].theta);
    assert.deepEqual(P.rankParts(12), { n: 12, unit: "kyu" });
    assert.deepEqual(P.rankParts(-1), { n: 2, unit: "dan" });
    assert.equal(P.ratingToRank(P.rankToRating(-2)), -2);
    assert.equal(P.ratingToRank(-9999), 30);
  });

  /* ----------------------------------------------------- the rating */

  await test("model rating: one rated game is a Glicko step against the level's measured strength", () => {
    const p = P.newProfile({ rank: 12 });
    const mu0 = p.rating[19].mu;
    const opp = P.MEASURED.standard["10k"][19];
    const v0 = P.SIGMA0 ** 2;
    const g = 1 / Math.sqrt(1 + (3 * P.SIGMA_LEVEL ** 2) / Math.PI ** 2);
    const e = 1 / (1 + Math.exp(-g * (mu0 - opp)));
    const v = 1 / (1 / v0 + g * g * e * (1 - e));
    const before = frozen(p);
    const won = P.recordGame(p, rated(1, { level: "10k", won: true }));
    assert.equal(frozen(p), before, "the profile given is not changed");
    assert.ok(Math.abs(won.rating[19].mu - (mu0 + v * g * (1 - e))) < 2e-3);
    assert.ok(Math.abs(won.rating[19].sigma - Math.sqrt(v)) < 2e-3);
    assert.equal(won.rating[19].games, 1);
    assert.deepEqual(Object.keys(won.rating[19]).sort(), ["at", "games", "mu", "sigma"]);
    const lost = P.recordGame(p, rated(1, { level: "10k", won: false }));
    assert.ok(Math.abs(lost.rating[19].mu - (mu0 - v * g * e)) < 2e-3);
    // Beating a stronger level moves you more than beating a weaker one.
    assert.ok(P.recordGame(p, rated(1, { level: "5k" })).rating[19].mu > P.recordGame(p, rated(1, { level: "15k" })).rating[19].mu);
    // The game record carries the step, and a history point "≈ 12 kyu (±n)".
    const rec = won.games[0];
    assert.equal(rec.rated, true);
    assert.equal(rec.rating.before, Math.round(P.thetaToGoR(mu0)));
    assert.equal(rec.rating.delta, rec.rating.after - rec.rating.before);
    assert.ok(rec.rating.delta > 0);
    assert.deepEqual(won.history, [{ at: 1, size: 19, rank: P.estimate(won).rank, pm: P.estimate(won).pm }]);
    // Other boards keep their prior.
    assert.equal(won.rating[9].games, 0);
    assert.equal(won.rating[9].mu, mu0);
  });

  await test("model rating: rated once, only when it means something; the analysis merges in", () => {
    let p = P.newProfile({ rank: 15 });
    p = P.recordGame(p, rated(1));
    const once = p.rating[19];
    // The analysis arrives later: same id, more fields; never rated twice.
    p = P.recordGame(p, { id: "r1", phases: phases(), themes: { cut: 2 }, themeLoss: { cut: 5.5 }, confidence: "high" });
    assert.deepEqual(p.rating[19], once);
    assert.equal(p.history.length, 1);
    assert.equal(p.games.length, 1);
    const g = p.games[0];
    assert.equal(g.level, "15k");
    assert.equal(g.won, true);
    assert.deepEqual(g.themes, { cut: 2 });
    assert.deepEqual(g.themeLoss, { cut: 5.5 });
    assert.equal(g.confidence, "high");
    assert.equal(g.rated, true);
    // Not rated: too short, a draw, unknown opponent, or asked not to.
    for (const bad of [{ ...rated(2), moves: 11 }, { ...rated(3), won: null }, { ...rated(4), level: "9d" }, { ...rated(5), rated: false }]) {
      const q = P.recordGame(p, bad);
      assert.deepEqual(q.rating[19], once, bad.id);
      assert.equal(q.games.find((x) => x.id === bad.id).rated, false, bad.id);
    }
    // A short game that later turns out long enough is rated then.
    let q = P.recordGame(p, { ...rated(6), moves: 5 });
    q = P.recordGame(q, { id: "r6", moves: 40 });
    assert.equal(q.rating[19].games, 2);
    // A known θ may stand in for the level (the engine's own mapping).
    const t = P.recordGame(P.newProfile({ rank: 15 }), { id: "x", at: 1, size: 19, won: true, moves: 50, opponent: P.MEASURED.standard["15k"][19] });
    assert.equal(t.rating[19].mu, P.recordGame(P.newProfile({ rank: 15 }), rated(1)).rating[19].mu);
    // Junk is ignored.
    assert.deepEqual(P.recordGame(p, { id: "j", at: "x", size: 19 }).games.length, 1);
    assert.deepEqual(P.recordGame(p, { id: "j", at: 5, size: 7 }).games.length, 1);
  });

  await test("model rating: the uncertainty shrinks with games, less on 9×9, and grows with time away", () => {
    const play = (size, n) => {
      let p = P.newProfile({ rank: 15 });
      const sig = [p.rating[size].sigma];
      for (let i = 0; i < n; i++) {
        p = P.recordGame(p, rated(i, { level: "15k", size, won: i % 2 === 0, at: 0 }));
        sig.push(p.rating[size].sigma);
      }
      return { p, sig };
    };
    const big = play(19, 60);
    for (let i = 1; i < 15; i++) assert.ok(big.sig[i] < big.sig[i - 1], `game ${i}`);
    assert.ok(Math.abs(big.sig[60] - big.sig[50]) < 0.01, "it settles");
    assert.ok(big.sig[60] > 0.4 && big.sig[60] < 0.9, `${big.sig[60]}`);
    const now = P.estimate(big.p, { now: 0 });
    assert.equal(now.pm, 1);
    assert.equal(now.games, 60);
    assert.equal(now.size, 19);
    const small = play(9, 60);
    assert.ok(small.sig[60] > big.sig[60], "a 9×9 game says less about 19×19 strength");
    // Time away widens the band, never beyond the prior.
    const later = P.estimate(big.p, { now: 90 * DAY });
    assert.ok(later.sigma > now.sigma && later.pm >= now.pm);
    assert.ok(P.sigmaAt(big.p.rating[19], 1e13) <= P.SIGMA0 + 1e-9);
    // Even results against a level converge to that level's strength.
    assert.ok(Math.abs(big.p.rating[19].mu - P.MEASURED.standard["15k"][19]) < 1);
    // The profile keeps the newest 30 games and 200 history points.
    assert.equal(big.p.games.length, P.MAX_GAMES);
    let long = P.newProfile({ rank: 15 });
    for (let i = 0; i < 230; i++) long = P.recordGame(long, rated(i, { won: i % 2 === 0, at: i }));
    assert.equal(long.history.length, P.MAX_HISTORY);
    assert.equal(long.rating[19].games, 230);
    assert.equal(long.games[0].id, "r229", "newest first");
  });

  await test("model rating: each board its own estimate, on one scale; the best-informed speaks", () => {
    let p = P.newProfile({ rank: 20 });
    assert.equal(P.estimate(p).size, 19, "no games: 19×19");
    assert.equal(P.estimate(p).rank, 20);
    assert.equal(P.estimate(p).pm > 1, true);
    // Five 9×9 wins: the 9×9 estimate moves, and speaks for the player.
    for (let i = 0; i < 5; i++) p = P.recordGame(p, rated(i, { level: "15k", size: 9, at: i }));
    assert.equal(p.rating[9].games, 5);
    assert.equal(p.rating[19].games, 0);
    const e = P.estimate(p);
    assert.equal(e.size, 9);
    assert.ok(e.rank < 20, `${e.rank}`);
    // A board without games borrows the best-informed estimate, not the prior.
    assert.equal(P.estimate(p, { size: 19 }).mu, p.rating[9].mu);
    // Its first game starts from there and stays its own.
    p = P.recordGame(p, rated(10, { level: "10k", size: 19, won: false, at: 10 }));
    assert.equal(p.rating[19].games, 1);
    assert.ok(p.rating[19].mu < p.rating[9].mu);
    assert.equal(P.estimate(p).size, 9, "still the board with the most games");
    assert.deepEqual(P.historyOf(p, 19).map((h) => h.size), [19]);
    assert.equal(P.historyOf(p).length, 6);
    // The prior follows the rank you give, only for boards without games.
    const q = P.setPriorRank(p, 5, 20);
    assert.equal(q.rating[13].mu, P.priorRating(5).mu);
    assert.equal(q.rating[9].mu, p.rating[9].mu);
    assert.equal(q.rating[19].mu, p.rating[19].mu);
  });

  await test("model rating: the suggested game is the level you are expected to play evenly", () => {
    const at = (mu) => P.normalizeProfile({ ...P.newProfile(), rating: { 19: { mu, sigma: 1, games: 5, at: 0 } } });
    for (const id of P.LEVELS) {
      const p = at(P.MEASURED.standard[id][19]);
      assert.equal(P.suggestedGame(p).level, id, id);
      assert.equal(P.suggestedGame(p, { size: 9 }).level, id, `9×9 ${id}`);
      assert.equal(P.suggestedGame(p).quick.level, id, `quick ${id}`);
    }
    const mid = (P.MEASURED.standard["10k"][19] + P.MEASURED.standard["5k"][19]) / 2;
    assert.equal(P.suggestedGame(at(mid - 0.3)).level, "10k");
    assert.equal(P.suggestedGame(at(mid + 0.3)).level, "5k");
    // A prior of 12 kyu suggests the 10k level, labelled with its measured rank.
    const s = P.suggestedGame(P.newProfile({ rank: 12 }));
    assert.deepEqual([s.size, s.level, s.mode, s.rank, s.handicap], [19, "10k", "standard", 12, 0]);
    assert.equal(s.quick.size, 9);
    assert.equal(P.suggestedGame(P.newProfile(), { size: 9 }).quick, null);
    // Winning moves the suggestion up.
    let p = P.newProfile({ rank: 18 });
    assert.equal(P.suggestedGame(p).level, "15k");
    for (let i = 0; i < 8; i++) p = P.recordGame(p, rated(i, { level: P.suggestedGame(p).level, at: i }));
    assert.ok(P.LEVELS.indexOf(P.suggestedGame(p).level) > P.LEVELS.indexOf("15k"));
    // The mode each level is played in counts.
    const human = P.suggestedGame(at(P.MEASURED.human["2d"][19]), { modeOf: () => "human" });
    assert.deepEqual([human.level, human.mode], ["2d", "human"]);
    // Below the ladder, stones close the gap (one per rank on 19×19, from two).
    const weak = P.suggestedGame(at(P.gorToTheta(P.rankToRating(35))));
    assert.equal(weak.level, "30k");
    assert.equal(P.handicapFor(35, 30, 19), 5);
    assert.equal(P.handicapFor(31, 30, 19), 0, "one stone is no handicap");
    assert.equal(P.handicapFor(50, 30, 9), 4);
    assert.equal(P.handicapFor(50, 0, 9), 5, "at most five on 9×9");
    assert.equal(P.handicapFor(20, 25, 19), 0);
  });

  /* -------------------------------------------- problems, drills, lessons */

  await test("model review: problems on the 1-3-7-21 ladder; help resets it; a late solve keeps the schedule", () => {
    const id = PROBLEMS[PROBLEMS.length - 1].id;
    const t0 = NOW - 3 * DAY;
    let p = P.newProfile();
    const before = frozen(p);
    p = P.recordProblem(p, id, { solved: false }, t0);
    assert.equal(frozen(P.newProfile()), before);
    assert.deepEqual(p.problems[id], { tries: 1, solved: false, clean: false, last: t0, due: t0 + DAY, streak: 0 });
    // A failed problem comes back first.
    assert.equal(P.dailySet(p, PROBLEMS, GRADES, 5, NOW)[0].id, id);
    assert.deepEqual(P.due(p, NOW).problems, [id]);
    p = P.recordProblem(p, id, { solved: true, clean: true }, NOW);
    assert.equal(p.problems[id].streak, 1);
    assert.equal(p.problems[id].clean, true);
    assert.equal(p.problems[id].due, NOW + DAY);
    for (const [n, days] of [[2, 3], [3, 7], [4, 21], [5, 21]]) {
      p = P.recordProblem(p, id, { solved: true }, NOW);
      assert.equal(p.problems[id].streak, n);
      assert.equal(p.problems[id].due, NOW + days * DAY, `rung ${n}`);
    }
    p = P.recordProblem(p, id, { solved: true, clean: false }, NOW);
    assert.equal(p.problems[id].streak, 0, "a solve with help resets the ladder");
    assert.equal(p.problems[id].solved, true);
    assert.equal(p.problems[id].due, NOW + DAY);
    assert.equal(p.problems[id].tries, 7);
    // Missed, then solved in the same visit: solved, not clean, the miss's schedule stays.
    const other = PROBLEMS[0].id;
    let q = P.recordProblem(P.newProfile(), other, { solved: false }, NOW);
    q = P.recordProblem(q, other, { solved: true, late: true }, NOW + 1000);
    assert.deepEqual(q.problems[other], { tries: 1, solved: true, clean: false, last: NOW + 1000, due: NOW + DAY, streak: 0 });
    // A late solve without a counted miss counts as a solve with help.
    const r = P.recordProblem(P.newProfile(), other, { late: true }, NOW);
    assert.deepEqual([r.problems[other].tries, r.problems[other].solved, r.problems[other].streak], [1, true, 0]);
    // Today's five is stable for a day and has no duplicates.
    const five = P.dailySet(P.newProfile(), PROBLEMS, GRADES, 5, NOW);
    assert.equal(new Set(five.map((x) => x.id)).size, 5);
    assert.deepEqual(P.dailySet(P.newProfile(), PROBLEMS, GRADES, 5, NOW + 3600000), five);
  });

  await test("model review: drills from your own games only, once, on the same ladder", () => {
    let p = P.newProfile();
    const m = { gameId: "g-1", index: 25, sgf: "(;)", color: 1, played: { x: 3, y: 3 }, best: { x: 6, y: 6 }, loss: 8, theme: "cut", size: 13 };
    p = P.addMistake(p, m, NOW);
    assert.equal(p.mistakes.length, 1);
    const d = p.mistakes[0];
    assert.equal(d.id, "g-1-25");
    assert.deepEqual([d.added, d.due, d.tries, d.streak, d.solved], [NOW, NOW, 0, 0, false]);
    assert.deepEqual([d.gameId, d.index, d.theme, d.loss, d.sgf], ["g-1", 25, "cut", 8, "(;)"]);
    // Never twice: by id, or the same position under another id.
    assert.equal(P.addMistake(p, m, NOW).mistakes.length, 1);
    assert.equal(P.addMistake(p, { ...m, id: "other" }, NOW).mistakes.length, 1);
    // Not from someone else's game.
    assert.equal(P.addMistake(p, { ...m, index: 7, own: false }, NOW).mistakes.length, 1);
    assert.deepEqual(P.due(p, NOW).mistakes.map((x) => x.id), ["g-1-25"]);
    p = P.recordMistake(p, "g-1-25", { solved: true }, NOW);
    assert.deepEqual([p.mistakes[0].tries, p.mistakes[0].streak, p.mistakes[0].due, p.mistakes[0].last, p.mistakes[0].solved], [1, 1, NOW + DAY, NOW, true]);
    p = P.recordMistake(p, "g-1-25", { solved: true }, NOW);
    assert.equal(p.mistakes[0].due, NOW + 3 * DAY);
    p = P.recordMistake(p, "g-1-25", { solved: false }, NOW);
    assert.deepEqual([p.mistakes[0].streak, p.mistakes[0].due, p.mistakes[0].solved], [0, NOW + DAY, true]);
    assert.deepEqual(P.due(p, NOW).mistakes, []);
    assert.deepEqual(P.recordMistake(p, "missing", { solved: true }, NOW).mistakes, p.mistakes, "an unknown drill changes nothing");
    // Newest first, at most 200.
    let many = P.newProfile();
    for (let i = 0; i < 210; i++) many = P.addMistake(many, { gameId: "g", index: i }, i);
    assert.equal(many.mistakes.length, P.MAX_MISTAKES);
    assert.equal(many.mistakes[0].id, "g-209");
    assert.equal(P.removeMistake(many, "g-209").mistakes.length, P.MAX_MISTAKES - 1);
  });

  await test("model review: lessons keep their furthest step", () => {
    let p = P.recordLesson(P.newProfile(), "stones-capture", { step: 3 }, 10);
    p = P.recordLesson(p, "stones-capture", { step: 1 }, 20);
    assert.deepEqual(p.lessons["stones-capture"], { done: false, step: 3, at: 20 });
    p = P.recordLesson(p, "stones-capture", { done: true }, 30);
    assert.deepEqual(p.lessons["stones-capture"], { done: true, step: 3, at: 30 });
  });

  /* ------------------------------------------------- profile and records */

  await test("model profile: v9 starts empty; anything else is not read; bad parts are dropped", () => {
    const empty = P.newProfile();
    assert.deepEqual(Object.keys(empty).sort(), ["classics", "games", "history", "lessons", "mistakes", "problems", "rating", "v", "week"]);
    assert.equal(empty.v, 9);
    assert.deepEqual(Object.keys(empty.rating), ["9", "13", "19"]);
    // A v8 progress object, or junk, is not migrated.
    const v8 = { v: 5, lessons: { a: { done: true } }, problems: { p: { solved: true, attempts: 1 } }, rating: { v: 6, mu: 10, sigma: 1, r: 1100 }, weakness: { cut: { score: 3 } } };
    for (const raw of [v8, null, "x", [], { v: 10 }]) assert.deepEqual(P.normalizeProfile(raw), empty, JSON.stringify(raw));
    // Round trip through JSON.
    let p = P.recordGame(P.newProfile({ rank: 10 }), rated(1, { level: "10k" }));
    p = P.recordProblem(p, PROBLEMS[0].id, { solved: true }, NOW);
    p = P.addMistake(p, { gameId: "r1", index: 30, theme: "ko" }, NOW);
    p = P.recordLesson(p, "stones-ko", { done: true }, NOW);
    p = P.recordClassic(p, "shusaku-ear-reddening", NOW);
    assert.deepEqual(p.classics, { "shusaku-ear-reddening": { done: true, at: NOW } });
    assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(p))), p);
    assert.deepEqual(P.normalizeProfile({ ...p, classics: { a: { done: "yes" }, b: 3 } }).classics, {}, "a classic is done or not there");
    // Damaged parts go, the rest stays.
    const bad = JSON.parse(JSON.stringify(p));
    bad.rating[19] = { mu: "x" };
    bad.history.push({ at: "x" });
    bad.problems.zzz = "nope";
    bad.mistakes.push({ id: 5 }, { theme: "x" }, { ...bad.mistakes[0] });
    bad.lessons.l = null;
    bad.week = { start: "monday", focus: ["cut"] };
    bad.games.push({ at: "x", size: 9 });
    const n = P.normalizeProfile(bad);
    assert.deepEqual(n.rating[19], P.newProfile().rating[19]);
    assert.equal(n.history.length, 1);
    assert.equal(n.problems.zzz, undefined);
    assert.equal(n.mistakes.length, 1);
    assert.equal(n.lessons.l, undefined);
    assert.equal(n.week, null);
    assert.equal(n.games.length, 1);
    // No v3 weakness counts and no separate rating history store.
    assert.equal("weakness" in n, false);
    assert.equal("strength" in n, false);
  });

  await test("model profile: game records are validated, bounded, newest first, and keep what themes cost", () => {
    const rec = (i, extra = {}) => ({ id: "g" + i, at: 1000 + i, size: 9, color: -1, result: "W+3.5", won: true, phases: { opening: { loss: 1, mistakes: 0, blunders: 0, moves: 5 }, middle: { loss: "4" }, endgame: null }, themes: { ladder: 1, bad: -2 }, ...extra });
    let p = P.newProfile();
    for (let i = 0; i < P.MAX_GAMES + 5; i++) p = P.recordGame(p, rec(i));
    assert.equal(p.games.length, P.MAX_GAMES);
    assert.equal(p.games[0].id, "g" + (P.MAX_GAMES + 4));
    const g0 = p.games[0];
    assert.deepEqual(g0.phases.middle, { loss: 4, mistakes: 0, blunders: 0, moves: 0, accuracy: null });
    assert.deepEqual(g0.phases.endgame, { loss: 0, mistakes: 0, blunders: 0, moves: 0, accuracy: null });
    assert.deepEqual(g0.themes, { ladder: 1 });
    assert.equal(g0.confidence, "low");
    assert.equal(g0.color, -1);
    assert.equal(g0.rated, false, "no level, no moves: kept, not rated");
    // Replace by id.
    p = P.recordGame(p, { id: g0.id, result: "B+R", won: false });
    assert.equal(p.games.length, P.MAX_GAMES);
    assert.equal(p.games[0].won, false);
    assert.equal(p.games[0].result, "B+R");
    assert.deepEqual(p.games[0].themes, { ladder: 1 }, "fields not given stay");
    // themeLoss: kept when valid; older records have none.
    const r = P.normalizeGame({ at: NOW, size: 19, themes: { cut: 2 }, themeLoss: { cut: 5.2, bad: "x" } });
    assert.deepEqual(r.themeLoss, { cut: 5.2 });
    assert.equal("themeLoss" in P.normalizeGame({ at: NOW, size: 19 }), false);
    assert.deepEqual(P.themeLosses([{ theme: "cut", loss: 3.24, move: { color: 1 } }, { theme: "cut", loss: 2, move: { color: 1 } }, { theme: "ko", loss: 9, move: { color: -1 } }, { theme: null, loss: 5, move: { color: 1 } }], 1), { cut: 5.2 });
    // Junk is dropped, duplicates once.
    assert.deepEqual(P.normalizeGames([null, { at: "x", size: 9 }, { at: 5, size: 7 }, { id: "ok", at: 5, size: 13 }, { id: "ok", at: 6, size: 13 }]).map((g) => g.id), ["ok"]);
  });

  /* ------------------------------------------------------- the evidence */

  await test("model focus: no data, no claims; two games are not enough, however costly", () => {
    const m = P.evidence(profile(), { ...content, now: NOW });
    assert.equal(m.status, "none");
    assert.deepEqual(m.focus, []);
    assert.equal(m.games.needed, P.RULES.MIN_GAMES);
    const two = P.evidence(profile({ games: [0, 1].map((i) => game(i, { themes: { cut: 3 }, themeLoss: { cut: 20 } })) }), { ...content, now: NOW });
    assert.equal(two.status, "notEnough");
    assert.equal(two.games.needed, 1);
    assert.deepEqual(two.focus, []);
  });

  await test("model focus: points lost to one theme over six games become the focus, with the evidence", () => {
    const games = [0, 1, 2, 3, 4, 5].map((i) => game(i, { themes: { cut: 1, ...(i === 2 ? { ladder: 1 } : {}) }, themeLoss: { cut: 3, ...(i === 2 ? { ladder: 9 } : {}) } }));
    const m = P.evidence(profile({ games }), { ...content, now: NOW });
    assert.equal(m.status, "focus");
    assert.deepEqual(m.focus.map((a) => a.key), ["cut"], "a theme from a single game is not claimed");
    assert.equal(m.focus[0].games.points, 18);
    assert.equal(m.focus[0].games.games, 6);
    assert.deepEqual(P.evidenceOf(m.focus[0]), [{ key: "plan.why.points", params: ["18", 6] }]);
    assert.equal(m.areas.find((a) => a.key === "ladder").claim, false);
  });

  await test("model focus: records without points say how often; race-shared counts as race", () => {
    const games = [0, 1, 2].map((i) => game(i, { themes: { "race-shared": i === 0 ? 2 : 1 } }));
    const race = P.evidence(profile({ games }), { ...content, now: NOW }).focus.find((a) => a.key === "race");
    assert.ok(race);
    assert.equal(race.games.points, null);
    assert.deepEqual(P.evidenceOf(race), [{ key: "plan.why.times", params: [4, 3] }]);
  });

  await test("model focus: recent games weigh more, old games drop out", () => {
    const recentCut = [0, 1, 2].map((i) => game(i, { themes: { cut: 1 }, themeLoss: { cut: 7 } }));
    const olderKo = [3, 4, 5, 6, 7, 8, 9].map((i) => game(i, { themes: { ko: 1 }, themeLoss: { ko: 6 } }));
    const m = P.evidence(profile({ games: [...recentCut, ...olderKo] }), { ...content, now: NOW });
    const cut = m.areas.find((a) => a.key === "cut");
    const ko = m.areas.find((a) => a.key === "ko");
    assert.ok(cut.games.weight / 21 > ko.games.weight / 42);
    const stale = [0, 1, 2, 3].map((i) => game(i, { themes: { cut: 2 }, themeLoss: { cut: 10 }, ago: P.RULES.WINDOW_DAYS + 1 + i }));
    const s = P.evidence(profile({ games: stale }), { ...content, now: NOW });
    assert.equal(s.games.analysed, 0);
    assert.deepEqual(s.focus, []);
  });

  await test("model focus: the endgame needs KataGo games where it dominates", () => {
    const games = [0, 1, 2].map((i) => game(i, { end: 9, mid: 3 }));
    const eg = P.evidence(profile({ games }), { ...content, now: NOW }).focus.find((a) => a.key === "endgame");
    assert.ok(eg);
    assert.equal(eg.endgame.perGame, 9);
    assert.deepEqual(P.evidenceOf(eg)[0], { key: "plan.why.lateGame", params: ["9", 3] });
    const low = P.evidence(profile({ games: games.map((g) => ({ ...g, confidence: "low" })) }), { ...content, now: NOW });
    assert.ok(!low.focus.some((a) => a.key === "endgame"));
  });

  const cutProblems = PROBLEMS.filter((x) => x.theme === "cut");
  const entry = (solved, streak, ago = 1) => ({ tries: 1, solved, clean: streak > 0, streak, due: NOW + DAY, last: NOW - ago * DAY });

  await test("model focus: missed problems of one theme are a focus; a generally hard time is not", () => {
    const problems = {};
    cutProblems.slice(0, 5).forEach((x, i) => (problems[x.id] = entry(i === 0, i === 0 ? 1 : 0)));
    const cut = P.evidence(profile({ problems }), { ...content, now: NOW }).focus.find((a) => a.key === "cut");
    assert.ok(cut);
    assert.deepEqual(P.evidenceOf(cut), [{ key: "plan.why.problems", params: [4, 5] }]);
    const few = {};
    cutProblems.slice(0, 3).forEach((x) => (few[x.id] = entry(false, 0)));
    assert.deepEqual(P.evidence(profile({ problems: few }), { ...content, now: NOW }).focus, []);
    const all = {};
    for (const x of PROBLEMS.filter((y) => ["cut", "ladder", "ko"].includes(y.theme)).slice(0, 30)) all[x.id] = entry(false, 0);
    const flat = P.evidence(profile({ problems: all }), { ...content, now: NOW });
    assert.ok(flat.problems.tried >= 10);
    assert.deepEqual(flat.focus, []);
    const old = {};
    cutProblems.slice(0, 5).forEach((x) => (old[x.id] = entry(false, 0, P.RULES.PROBLEM_WINDOW_DAYS + 2)));
    assert.equal(P.evidence(profile({ problems: old }), { ...content, now: NOW }).status, "none");
    // Without the problem definitions only games and drills count.
    assert.equal(P.evidence(profile({ problems }), { now: NOW }).status, "none");
  });

  await test("model focus: drills from your games count as evidence", () => {
    const mistakes = [0, 1, 2, 3].map((i) => ({ id: "d" + i, theme: "ladder", tries: 1, streak: 0, due: NOW - i * DAY + DAY, added: NOW - 10 * DAY }));
    assert.deepEqual(P.evidence(profile({ mistakes }), { ...content, now: NOW }).focus.map((a) => a.key), ["ladder"]);
    assert.equal(P.drillLast({ streak: 2, due: NOW + 3 * DAY }), NOW);
    assert.equal(P.drillLast({ streak: 2, due: NOW + 3 * DAY, last: 5 }), 5, "v9 drills keep their last try");
  });

  await test("model focus: the solving level from clean solves per grade", () => {
    const r = (grade, miss) => ({ grade, miss });
    assert.equal(P.solvingLevel([]), null);
    assert.equal(P.solvingLevel([r(1, false), r(1, true)]), null);
    assert.equal(P.solvingLevel([r(1, true), r(1, true), r(1, true)]), 1);
    assert.equal(P.solvingLevel([r(1, false), r(1, false), r(1, true), r(2, false), r(2, false), r(2, false), r(3, true), r(3, true), r(3, false)]), 2);
  });

  await test("model focus: this week's focus keeps to the evidence from before Monday", () => {
    const week = new Date(2026, 10, 2).getTime(); // Monday
    assert.equal(P.weekStart(NOW), week);
    const before = [3, 4, 5, 6].map((i) => game(i, { themes: { cut: 1 }, themeLoss: { cut: 5 } }));
    const thisWeek = [0, 0.5, 1].map((d, i) => ({ ...game(10 + i, { themes: { ko: 3 }, themeLoss: { ko: 20 } }), at: NOW - d * DAY - 1000 }));
    const w = P.focus(profile({ games: [...thisWeek, ...before] }), NOW, content);
    assert.deepEqual(w.focus.map((a) => a.key), ["cut"]);
    assert.equal(w.since, week);
    assert.deepEqual([w.keep.start, w.keep.focus, w.keep.areas.map((a) => a.key)], [week, ["cut"], ["cut"]]);
    const fresh = P.focus(profile({ games: thisWeek }), NOW, content);
    assert.deepEqual(fresh.focus.map((a) => a.key), ["ko"]);
    assert.equal(fresh.since, null);
    assert.deepEqual([fresh.keep.start, fresh.keep.focus], [week, ["ko"]], "shown this week: kept for it");
    const none = P.focus(profile(), NOW, content);
    assert.equal(none.status, "none");
    assert.equal(none.keep, null);
  });

  await test("model focus: a focus from problems survives reviewing those problems during the week", () => {
    const week = new Date(2026, 10, 2).getTime();
    const cuts = cutProblems.slice(0, 6);
    assert.ok(cuts.length >= 5);
    const missed = Object.fromEntries(cuts.map((x) => [x.id, { tries: 1, solved: false, clean: false, streak: 0, last: week - 2 * DAY, due: week }]));
    let p = profile({ problems: missed });
    const first = P.focus(p, NOW, content);
    assert.deepEqual(first.focus.map((a) => a.key), ["cut"]);
    p = P.keepFocus(p, first);
    assert.deepEqual([p.week.start, p.week.focus, p.week.areas[0].problems.missed], [week, ["cut"], 6]);
    assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(p))).week, p.week, "the kept week survives storage");
    assert.equal(P.focus(p, NOW, content).keep, null, "stored once per week");
    assert.deepEqual(P.keepFocus(p, P.focus(p, NOW, content)).week, p.week);
    // This week: most of them reviewed and solved, which overwrites `last`.
    for (const x of cuts.slice(0, 4)) p = P.recordProblem(p, x.id, { solved: true }, NOW - 1000);
    const later = P.focus(p, NOW, content);
    assert.deepEqual(later.focus.map((a) => a.key), ["cut"], "the week's focus stays");
    assert.equal(later.since, week);
    assert.ok(later.focus[0].problems?.claim, "with the evidence it was chosen on");
    // Next week the kept focus no longer applies.
    assert.notEqual(P.focus(p, NOW + 7 * DAY, content).since, week);
  });

  await test("model focus: every focus links to a lesson that exists and a topic with problems", () => {
    const lessons = new Set(COURSE.flatMap((u) => u.lessons.map((l) => l.id)));
    for (const [key, ids] of Object.entries(P.FOCUS_LESSONS)) for (const id of ids) assert.ok(lessons.has(id), `${key}: ${id}`);
    const keys = new Set([...PROBLEMS.map((x) => P.focusKey(x.theme)), "race", "endgame", "ladder", "cut", "ko", "vital-point", "eye-space", "snapback", "double-atari", "race-outside"]);
    for (const key of keys) {
      if (!key) continue;
      const { topic, theme } = P.focusTopic(key, PROBLEMS);
      assert.ok(PROBLEMS.some((x) => x.topic === topic && (!theme || x.theme === theme)), `${key} → ${topic}/${theme}`);
    }
    assert.equal(P.focusLesson("ko", (id) => id === "stones-ko"), "adv-life-ko");
    assert.equal(P.focusLesson("nothing"), null);
  });

  /* ------------------------------------------------------ Learn's path */

  const cutGames = () => [0, 1, 2, 3].map((i) => game(i, { themes: { cut: 1, ko: i < 2 ? 1 : 0 }, themeLoss: { cut: 4, ko: i < 2 ? 5 : 0 } }));

  await test("model path: reviews first, focus problems at the level, one stretch, stable for the day", () => {
    const problems = {};
    for (const g of [1, 2]) for (const x of PROBLEMS.filter((y) => y.theme === "atari" && GRADES[y.id]?.grade === g).slice(0, 3)) problems[x.id] = { tries: 1, solved: true, clean: true, streak: 1, due: NOW + 3 * DAY, last: NOW - DAY };
    const dueOne = PROBLEMS.find((x) => x.theme === "net");
    problems[dueOne.id] = { tries: 2, solved: true, clean: false, streak: 0, due: NOW - 1000, last: NOW - DAY };
    const mistakes = [{ id: "m1", theme: "cut", tries: 0, streak: 0, due: NOW - 1000, added: NOW - 2 * DAY }];
    const p = profile({ games: cutGames(), problems, mistakes });
    const model = P.focus(p, NOW, content);
    assert.deepEqual(model.focus.map((a) => a.key), ["cut", "ko"]);
    assert.equal(model.problems.level, 2);
    const items = P.planProblems({ profile: p, model, pool: PROBLEMS, grades: GRADES, now: NOW });
    assert.equal(items.length, 5);
    assert.equal(new Set(items.map((i) => i.id)).size, 5);
    assert.deepEqual(items[0], { kind: "mistake", id: "m1", role: "review", why: "cut" });
    assert.deepEqual(items[1], { kind: "problem", id: dueOne.id, role: "review" });
    const focusItems = items.filter((i) => i.role === "focus");
    assert.deepEqual(focusItems.map((i) => i.why), ["cut", "ko"], "the two focuses take turns");
    for (const it of focusItems) assert.ok(GRADES[it.id].grade >= 2 && GRADES[it.id].grade <= 3);
    const stretch = items.filter((i) => i.role === "stretch");
    assert.equal(stretch.length, 1);
    assert.equal(GRADES[stretch[0].id].grade, 4);
    assert.deepEqual(P.planProblems({ profile: p, model, pool: PROBLEMS, grades: GRADES, now: NOW + 3600000 }), items);
    assert.equal(P.planProblems({ profile: p, model: P.focus(profile(), NOW, content), pool: PROBLEMS, grades: GRADES, now: NOW }), null, "no focus: no plan");
    // The same, as Learn's list for a player: the next lesson, then these.
    const path_ = P.learnPath(p, { ...content, course: COURSE, settings: { experience: "player", playerRank: 10 } }, NOW);
    assert.deepEqual(path_[0], { kind: "lesson", id: COURSE.find((u) => u.level === "intermediate").lessons[0].id, unit: COURSE.find((u) => u.level === "intermediate").id, role: "next" });
    assert.deepEqual(path_.slice(1), items);
  });

  await test("model path: without a focus, due drills and then problems at your level; a beginner's taught topics", () => {
    const beginner = { course: COURSE, ...content, settings: { experience: "new", playerRank: 30 } };
    const first = P.learnPath(P.newProfile(), beginner, NOW);
    assert.deepEqual(first[0], { kind: "lesson", id: COURSE[0].lessons[0].id, unit: COURSE[0].id, role: "next" });
    const probs = first.filter((i) => i.kind === "problem");
    assert.equal(probs.length, 5);
    for (const it of probs) assert.equal(PROBLEMS.find((x) => x.id === it.id).topic, "capture", "a beginner starts with capturing");
    assert.ok(probs.every((i) => i.role === "new"));
    assert.deepEqual(P.learnPath(P.newProfile(), beginner, NOW + 3600000), first, "stable for the day");
    // A due drill and a due problem come first.
    let p = P.addMistake(P.newProfile(), { gameId: "g", index: 3, theme: "cut" }, NOW - DAY);
    p = P.recordProblem(p, probs[2].id, { solved: false }, NOW - 2 * DAY);
    const again = P.learnPath(p, beginner, NOW);
    assert.deepEqual(again[1], { kind: "mistake", id: "g-3", role: "review" });
    assert.deepEqual(again[2], { kind: "problem", id: probs[2].id, role: "review" });
    assert.equal(again.length, 1 + 5);
    // An experienced player gets the whole bank.
    assert.equal(P.taughtPool(P.newProfile(), { course: COURSE, ...content, settings: { experience: "player", playerRank: 10 } }).length, PROBLEMS.length);
    // Finishing beginner lessons opens their topics.
    const lifeLesson = COURSE.flatMap((u) => (u.level ? [] : u.lessons)).find((l) => (l.steps || []).some((s) => s.problem?.goal === "live"));
    const taught = P.taughtPool(P.recordLesson(P.newProfile(), lifeLesson.id, { done: true }), beginner);
    assert.ok(taught.some((x) => x.topic === "life") && taught.some((x) => x.topic === "capture"));
    assert.ok(!taught.some((x) => x.topic === "kill" && !lifeLesson.steps.some((s) => s.problem?.goal === "kill")));
  });

  await test("model path: the beginner bridges — capture Go, then the first 9×9 game", () => {
    const ids = COURSE.flatMap((u) => u.lessons.map((l) => l.id));
    for (const id of [...P.CAPTURE_AFTER, ...P.FIRST_GAME_AFTER]) assert.ok(ids.includes(id), id);
    const stones = COURSE.find((u) => u.id === "stones").lessons.map((l) => l.id);
    const at = stones.indexOf("stones-capture");
    assert.deepEqual(P.CAPTURE_AFTER, stones.slice(at, at + 3));
    const life = COURSE.find((u) => u.id === "life").lessons.map((l) => l.id);
    assert.equal(P.FIRST_GAME_AFTER.at(-1), life.at(-1));
    assert.deepEqual(P.FIRST_GAME, { size: 9, level: P.LEVELS[0], handicap: 0 });
    const empty = P.newProfile();
    assert.equal(P.bridgeAfter("stones-capture", empty), "capture");
    assert.equal(P.bridgeAfter("stones-suicide", empty), "capture");
    assert.equal(P.bridgeAfter("stones-ko", empty), null);
    assert.equal(P.bridgeAfter("stones-capture", empty, { captureWins: 1 }), "capture");
    assert.equal(P.bridgeAfter("stones-capture", empty, { captureWins: 2 }), null);
    assert.equal(P.bridgeAfter("life-two-eyes", empty), "firstGame");
    assert.equal(P.bridgeAfter("life-eye", empty), null);
    const played = P.recordGame(empty, { id: "1", at: 1, size: 9, won: false, moves: 30, level: "30k" });
    assert.equal(P.bridgeAfter("life-two-eyes", played), null, "not after a first game");
    // In Learn's list, right after the next lesson while they apply.
    const beginner = { course: COURSE, ...content, settings: { experience: "new", playerRank: 30 } };
    let p = P.recordLesson(empty, "stones-capture", { done: true }, NOW);
    let list = P.learnPath(p, beginner, NOW);
    assert.deepEqual(list[1], { kind: "capture", role: "bridge" });
    assert.ok(!P.learnPath(p, { ...beginner, captureWins: 2 }, NOW).some((i) => i.kind === "capture"));
    p = P.recordLesson(p, "life-two-eyes", { done: true }, NOW);
    list = P.learnPath(p, { ...beginner, captureWins: 2 }, NOW);
    assert.deepEqual(list[1], { kind: "game", role: "bridge", game: { size: 9, level: "30k", handicap: 0 } });
    assert.ok(!P.learnPath(P.recordGame(p, { id: "1", at: 1, size: 9, won: true, moves: 30, level: "30k" }), beginner, NOW).some((i) => i.kind === "game"));
  });

  await test("model path: the next lesson sends players of about 5 kyu and stronger to the advanced course", () => {
    assert.equal(P.ADVANCED_RANK, 5);
    const all = [];
    for (const unit of COURSE) for (const lesson of unit.lessons) all.push({ unit, lesson });
    const firstOf = (level) => all.find((x) => (x.unit.level || "beginner") === level).lesson.id;
    const next = (done, who) => P.nextLesson(all, (id) => done.has(id), who)?.lesson.id;
    assert.equal(next(new Set(), { experience: "new", playerRank: 30 }), firstOf("beginner"));
    assert.equal(next(new Set(), { experience: "player", playerRank: 10 }), firstOf("intermediate"));
    for (const playerRank of [5, 3, -1]) assert.equal(next(new Set(), { experience: "player", playerRank }), firstOf("advanced"), `rank ${playerRank}`);
    assert.equal(next(new Set(), { experience: "player", playerRank: 10, rating: 1700 }), firstOf("advanced"));
    assert.equal(next(new Set(), { experience: "player", playerRank: 5, rating: 1200 }), firstOf("intermediate"));
    const mids = all.filter((x) => x.unit.level === "intermediate").map((x) => x.lesson.id);
    assert.equal(next(new Set(mids.slice(0, 2)), { experience: "player", playerRank: 4 }), mids[2]);
    assert.equal(next(new Set(mids), { experience: "player", playerRank: 4 }), firstOf("advanced"));
    assert.equal(next(new Set(mids), { experience: "player", playerRank: 10 }), firstOf("beginner"));
    assert.equal(P.nextLesson(all, () => true, { playerRank: 1 }), null);
    // In Learn's list the estimate from rated games counts, the prior does not.
    let p = P.newProfile({ rank: 10 });
    const who = { course: COURSE, ...content, settings: { experience: "player", playerRank: 10 } };
    assert.equal(P.learnPath(p, who, NOW)[0].id, firstOf("intermediate"));
    p = P.normalizeProfile({ ...p, rating: { ...p.rating, 19: { mu: P.gorToTheta(1700), sigma: 0.6, games: 20, at: NOW } } });
    assert.equal(P.learnPath(p, who, NOW)[0].id, firstOf("advanced"));
    // Everything done: no lesson item.
    const done = P.normalizeProfile({ ...P.newProfile(), lessons: Object.fromEntries(all.map(({ lesson }) => [lesson.id, { done: true, step: 0, at: 0 }])) });
    assert.ok(!P.learnPath(done, who, NOW).some((i) => i.kind === "lesson"));
  });

  await test("model: pure — no DOM, storage, engine or app imports; the old modules are gone", () => {
    for (const f of ["model/player.js", "model/ladder.js"]) {
      const src = fs.readFileSync(path.join(root, "src/web/js", f), "utf8");
      const imports = [...src.matchAll(/^import[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
      // opponents.js is the calibration's one source: tables and pure functions, no imports of its own.
      for (const i of imports) assert.ok(i === "./ladder.js" || i === "../opponents.js", `${f} imports ${i}`);
      assert.doesNotMatch(src, /localStorage|document\.|window\.|Date\.now\(\)/, f);
    }
    assert.equal([...fs.readFileSync(path.join(root, "src/web/js/opponents.js"), "utf8").matchAll(/^import /gm)].length, 0, "opponents.js imports nothing");
    for (const f of ["app/strength.js", "app/plan.js", "persist.js", "app/beginner.js", "app/course-path.js", "app/rating.js", "app/week.js"]) assert.ok(!fs.existsSync(path.join(root, "src/web/js", f)), f);
    // The rating of a game against the opponent ladder: what played, on its board, with its handicap.
    assert.ok(P.implOpponent("L:10k", { handicap: 4 }) < P.implOpponent("L:10k"));
    assert.equal(P.implOpponent("L:10k", { size: 9 }), O.implTheta("L:10k", 9));
    assert.equal(P.implOpponent("nope"), null);
  });
}
