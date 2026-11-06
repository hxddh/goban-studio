/**
 * Play: the whole-game summary by phase and the trends across your games.
 */
import { test, BLACK, MARK_KINDS, MESSAGES, PHASES, WHITE, assert, empty, fs, gameRecord, mv, path, phaseBoundaries, phaseThresholds, recordAnalysis, root, setLang, settled, settledShare, storyText, summarizeGame, t, themeCounts, trends, v5Review } from "./helpers.mjs";

await test("play summary: phase boundaries scale with the board and follow KataGo's ownership when there is one", () => {
  assert.deepEqual(phaseThresholds(19), { openingEnd: 43, endgameStart: 162 });
  assert.deepEqual(phaseThresholds(13), { openingEnd: 20, endgameStart: 76 });
  assert.deepEqual(phaseThresholds(9), { openingEnd: 10, endgameStart: 36 });
  const plain = v5Review();
  const b = phaseBoundaries(13, plain.points, plain.points.length);
  assert.deepEqual([b.opening, b.middle, b.endgame, b.method], [[1, 20], [21, 75], [76, 80], "moves"]);
  const owned = v5Review({ settledFrom: 60 });
  const o = phaseBoundaries(13, owned.points, owned.points.length);
  assert.deepEqual([o.middle, o.endgame, o.method], [[21, 59], [60, 80], "ownership"]);
  const never = v5Review({ settledFrom: 999 });
  const nv = phaseBoundaries(13, never.points, never.points.length);
  assert.equal(nv.endgame[0] > nv.endgame[1], true, "a game that never settled has no endgame");
  // A short game is all opening.
  const short = phaseBoundaries(19, [], 12);
  assert.deepEqual(short.opening, [1, 11]);
  assert.ok(short.middle[0] > short.middle[1] && short.endgame[0] > short.endgame[1]);
  assert.equal(settledShare(null), null);
});

await test("play summary: summarizeGame counts losses, mistakes, blunders and accuracy per phase and player", () => {
  const review = v5Review({ losses: { 5: 3, 25: 8, 79: 2.5, 30: 4 } });
  const s = summarizeGame(review);
  assert.equal(s.confidence, "high");
  assert.equal(s.source, "katago");
  assert.equal(s.moves, 80);
  const [op, mid, end] = s.phases;
  assert.deepEqual([op.id, op.from, op.to, mid.from, mid.to, end.from, end.to], ["opening", 1, 20, 21, 75, 76, 80]);
  assert.deepEqual([op.players.black.loss, op.players.black.mistakes, op.players.black.blunders], [3, 1, 0]);
  assert.deepEqual([mid.players.black.loss, mid.players.black.mistakes, mid.players.black.blunders], [8, 0, 1]);
  assert.deepEqual([end.players.black.loss, end.players.black.mistakes], [2.5, 1]);
  assert.deepEqual([mid.players.white.loss, mid.players.white.mistakes], [4, 1]);
  assert.equal(mid.players.black.worst.index, 25);
  assert.equal(mid.players.black.worst.coord, "N13");
  assert.equal(op.players.black.moves, 10);
  assert.equal(op.players.black.measured, 10);
  assert.equal(op.players.black.accuracy, 0.9);
  const tot = s.players.black;
  assert.deepEqual([tot.moves, tot.loss, tot.mistakes, tot.blunders], [40, 13.5, 2, 1]);
  assert.equal(tot.accuracy, 0.925);
  assert.equal(tot.basis.candidates, 0, "the played moves were not KataGo's candidates here");
  // Three takeaways for the player (Black): where the points went, the
  // costliest move, and the steady opening.
  assert.deepEqual(s.takeaways.map((t) => t.kind), ["phase", "worst", "steady"]);
  assert.equal(s.takeaways[0].key, "gameSummary.take.worstPhase");
  assert.deepEqual(s.takeaways[0].params.slice(0, 3), [{ key: "phaseIn.middle" }, "8", 59]);
  assert.equal(s.takeaways[1].index, 25);
  assert.equal(s.takeaways[2].phase, "opening");
  // Without a player's colour both sides are described, with *Of keys.
  const both = summarizeGame({ ...review, meta: {} });
  assert.ok(both.takeaways.length === 3 && both.takeaways.every((t) => /Of$/.test(t.key)));
});

await test("play summary: accuracy reads the candidate list when the played move is one of KataGo's candidates", () => {
  const review = v5Review({ losses: { 3: 3 } });
  const mv = review.game.mainLine()[3].move;
  // KataGo saw the played move as only half a point worse than its best.
  review.points[2].moves = [{ x: 6, y: 6, visits: 30, scoreLead: 0 }, { x: mv.x, y: mv.y, visits: 12, scoreLead: -0.5 }];
  const s = summarizeGame(review);
  assert.equal(s.players.black.basis.candidates, 1);
  assert.equal(s.players.black.accuracy, 1, "within a point by the candidate list");
  assert.equal(s.players.black.mistakes, 1, "the loss itself still comes from the lead change");
});

await test("play summary: summarizeGame degrades with the offline estimate and with no analysis", () => {
  const s = summarizeGame(v5Review({ losses: { 25: 8, 27: 5 }, source: "estimate" }));
  assert.equal(s.confidence, "low");
  assert.equal(s.players.black.accuracy, null, "accuracy is not claimed from an estimate");
  assert.equal(s.players.black.loss, 13);
  assert.deepEqual(s.takeaways.map((t) => t.kind), ["phase", "worst", "estimate"]);
  assert.equal(s.takeaways[2].key, "gameSummary.estimate");
  const none = v5Review();
  const empty = summarizeGame({ ...none, points: none.points.map(() => null) });
  assert.equal(empty.confidence, "none");
  assert.deepEqual(empty.takeaways, []);
  assert.equal(empty.players.black.moves, 40);
  assert.equal(empty.players.black.measured, 0);
  // A partly analysed KataGo review is low confidence until it is done.
  const part = v5Review();
  part.points = part.points.map((p, i) => (i < 40 ? p : null));
  assert.equal(summarizeGame(part).confidence, "low");
  // A clean game says so.
  assert.deepEqual(summarizeGame(v5Review()).takeaways.map((t) => t.kind).slice(0, 2), ["clean", "steady"]);
  // Key-mistake themes become a takeaway.
  const th = v5Review({ losses: { 25: 3 } });
  th.keyMoves = [{ theme: "ladder", move: { color: BLACK } }, { theme: "ladder", move: { color: BLACK } }];
  const ts = summarizeGame(th);
  const theme = ts.takeaways.find((t) => t.kind === "theme");
  assert.ok(theme && theme.topic === "capture" && theme.params[1] === 2);
  assert.deepEqual(ts.themes, { ladder: 2 });
});

await test("play summary: takeaways and summary strings read in all four languages", () => {
  const entries = [];
  for (const r of [v5Review({ losses: { 5: 3, 25: 8, 79: 2.5, 9: 7 } }), v5Review({ losses: { 25: 3 } }), v5Review({ losses: { 25: 8 }, source: "estimate" }), v5Review()]) {
    for (const hc of [BLACK, null]) {
      const rv = { ...r, meta: { humanColor: hc }, keyMoves: [{ theme: "cut", move: { color: BLACK } }] };
      entries.push(...summarizeGame(rv).takeaways);
    }
  }
  const kinds = new Set(entries.map((e) => e.key));
  for (const k of ["gameSummary.take.worstPhase", "gameSummary.take.worstMove", "gameSummary.take.blunders", "gameSummary.take.theme", "gameSummary.take.steady", "gameSummary.take.clean", "gameSummary.estimate", "gameSummary.take.worstPhaseOf", "gameSummary.take.cleanOf"]) assert.ok(kinds.has(k), k);
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    for (const e of entries) {
      const s = storyText(e);
      assert.ok(s && !/\{\d\}/.test(s) && !/\b(gameSummary|phase|phaseIn|theme)\.[a-z]/.test(s), `${lang} ${e.key}: ${s}`);
    }
  }
  setLang("en");
  const first = summarizeGame(v5Review({ losses: { 5: 3, 25: 8, 79: 2.5 } })).takeaways;
  assert.equal(storyText(first[0]), "Most of your points went in the middle game: about 8 points (59% of the total).");
  assert.equal(storyText(first[1]), "Your costliest move was move 25 (N13): about 8 points.");
  setLang("ja");
  assert.equal(storyText(first[0]), "損の多くは中盤でした。約8目（全体の59%）です。");
  setLang("en");
  const keys = Object.keys(MESSAGES).filter((k) => /^(gameSummary|trend|edit|phase|phaseIn)\./.test(k));
  assert.ok(keys.length >= 50);
  for (const p of PHASES) assert.ok(MESSAGES["phase." + p] && MESSAGES["phaseIn." + p]);
  for (const kind of MARK_KINDS) assert.ok(MESSAGES["edit.mark." + kind], kind);
});

await test("play summary: a rated game becomes a compact record, and trends compare the earlier and recent games", () => {
  const review = v5Review({ losses: { 5: 3, 25: 8, 79: 2.5 } });
  const s = summarizeGame(review);
  const rec = gameRecord({ id: "abc", game: review.game, color: BLACK, opponent: "15k", won: false, rating: { before: 1000, after: 980, delta: -20 }, summary: s, themes: { ladder: 1 }, at: Date.UTC(2026, 10, 1) });
  assert.equal(rec.id, "abc");
  assert.equal(rec.size, 13);
  assert.equal(rec.moves, 80);
  assert.equal(rec.color, BLACK);
  assert.equal(rec.confidence, "high");
  assert.deepEqual(rec.phases.middle, { loss: 8, mistakes: 0, blunders: 1, moves: 28, accuracy: Math.round((27 / 28) * 1000) / 1000 });
  // Written at the end of the game, completed by the analysis.
  const bare = gameRecord({ id: "x", game: review.game, color: WHITE, won: true });
  assert.equal(bare.phases, null);
  assert.equal(bare.confidence, null);
  assert.deepEqual(Object.keys(recordAnalysis(s, WHITE, { cut: 1 })).sort(), ["confidence", "phases", "themes"]);
  assert.deepEqual(themeCounts([{ theme: "cut", move: { color: 1 } }, { theme: "cut", move: { color: -1 } }, { theme: null, move: { color: 1 } }], 1), { cut: 1 });

  // Six analysed games, newest first: the recent three lose less in the
  // middle game and stopped running into ladders, but started getting cut.
  const mk = (i, mid, themes, rating) => ({ id: "g" + i, at: 1000 + i, size: 9, color: 1, won: i % 2 === 0, phases: { opening: { loss: 2 }, middle: { loss: mid, mistakes: 2, blunders: 1 }, endgame: { loss: 3, mistakes: 1 } }, confidence: "high", themes, rating });
  const profile = {
    games: [
      mk(6, 8, { cut: 1 }, { before: 1060, after: 1080, delta: 20 }),
      mk(5, 7, { cut: 1 }, { before: 1050, after: 1060, delta: 10 }),
      mk(4, 9, { cut: 1 }, { before: 1040, after: 1050, delta: 10 }),
      mk(3, 20, { ladder: 2 }, { before: 1030, after: 1040, delta: 10 }),
      mk(2, 22, { ladder: 2 }, { before: 1010, after: 1030, delta: 20 }),
      mk(1, 18, { ladder: 2 }, { before: 1000, after: 1010, delta: 10 }),
      { id: "u", at: 900, size: 19, color: -1, won: false, phases: null }, // never analysed
    ],
  };
  const tr = trends(profile, { n: 10 });
  assert.equal(tr.games, 7);
  assert.equal(tr.analysed, 6);
  assert.deepEqual(tr.record, { won: 3, lost: 4, other: 0 });
  assert.equal(tr.avgLoss.middle, 14);
  assert.equal(tr.avgLoss.opening, 2);
  assert.equal(tr.avgLoss.total, 19);
  assert.equal(tr.avgMistakes, 3);
  assert.equal(tr.avgBlunders, 1);
  assert.deepEqual(tr.phaseTrend.middle, { earlier: 20, recent: 8, direction: "better" });
  assert.equal(tr.phaseTrend.opening.direction, "same");
  assert.equal(tr.phaseTrend.total.direction, "better");
  const ladder = tr.themes.find((t) => t.theme === "ladder");
  const cut = tr.themes.find((t) => t.theme === "cut");
  assert.deepEqual([ladder.count, ladder.direction, ladder.topic], [6, "better", "capture"]);
  assert.deepEqual([cut.count, cut.direction, cut.topic], [3, "worse", "connect"]);
  assert.equal(tr.themes[0].theme, "ladder", "most common first");
  assert.deepEqual(tr.rating, { from: 1000, to: 1080, delta: 80, games: 6 });
  // A narrower window, and too few games for a direction.
  const two = trends(profile, { n: 2 });
  assert.equal(two.analysed, 2);
  assert.equal(two.phaseTrend.middle.direction, null);
  // No records: nothing to say.
  const empty = trends({ games: [] });
  assert.equal(empty.games, 0);
  assert.equal(empty.avgLoss.total, null);
  assert.equal(empty.rating, null);
  assert.equal(trends(null).games, 0);
});
