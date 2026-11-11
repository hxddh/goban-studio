/**
 * Core: the engine — the offline opponent, KataGo replies and the bridge, the calibrated ladder and human-style moves.
 */
import { implOpponent, thetaToGoR } from "../../src/web/js/model/player.js";
import { test, BLACK, DEFAULT_SETTINGS, EMPTY, Game, HUMAN_VISITS, SAMPLE_INFO, STRENGTHS, STRONG_VISIT_SCALE, WHITE, analyse, analysisEngine, anchorMap, assert, beginnerMove, calibrated, chooseMove, defaultKomi, egfExpected, egfNats, enginePayload, fitBT, fs, goRLabel, humanMoveFromAnalysis, humanRequest, humanStyleParams, installed, katagoRules, loadSGF, moveFromAnalysis, mulberry32, newGame, parseInfo, parseVertex, path, pickCandidate, positionPayload, profileGoR, rankParts, root, scaledVisits, suggestHandicap, wilson } from "./helpers.mjs";

await test("rules: KataGo is told the game's rules", async () => {
  // Async (structured) payload.
  const cn = new Game({ size: 9, rules: "chinese", handicap: 2 });
  cn.play(4, 4);
  const payload = positionPayload(cn);
  assert.equal(payload.rules, "chinese");
  // Komi is the game's own; KataGo adds the handicap compensation itself.
  assert.equal(payload.komi, 0.5);
  assert.equal(payload.setup, "B G7 B C3");
  assert.equal(positionPayload(new Game({ size: 9, rules: "korean" })).rules, "korean");
  assert.equal(positionPayload(new Game({ size: 9 })).rules, "japanese");
  assert.equal(katagoRules({}), "japanese");
  // White setup stones go first, so a set-up position is not read as a handicap.
  const pos = loadSGF("(;GM[1]FF[4]SZ[9]RU[Chinese]AB[aa][bb]AW[cc])").game;
  assert.equal(positionPayload(pos).setup, "W C7 B A9 B B8");

  // Through the bridge: every request names the rules and the game's komi.
  const sent = [];
  globalThis.zero = {
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true };
      if (command === "studio.katagoAnalyzeAsync") {
        sent.push(payload);
        return { ok: true, id: payload.id, play: "C3", info: "info move C3 visits 10 winrate 0.6 scoreLead 3 order 0 pv C3" };
      }
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../../src/web/js/katago.js?bridge-rules");
    for (const rules of ["japanese", "chinese", "korean"]) {
      await K.analyze(new Game({ size: 9, rules }), { visits: 8 });
      assert.equal(sent.at(-1).rules, rules);
      assert.equal(sent.at(-1).komi, defaultKomi(rules));
    }
  } finally {
    delete globalThis.zero;
  }
});

await test("a host without the async command cannot search: no synchronous fallback", async () => {
  const commands = [];
  globalThis.zero = {
    invoke: async (command) => {
      commands.push(command);
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test" };
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../../src/web/js/katago.js?no-async");
    assert.equal(await K.analyze(new Game({ size: 9 }), { visits: 8 }), null);
    assert.deepEqual(commands, ["studio.katagoStatus"]);
    assert.equal(K.canCancel(), false);
  } finally {
    delete globalThis.zero;
  }
});

await test("the offline opponent returns a legal move on 9x9 and 19x19", async () => {
  for (const size of [9, 19]) {
    const game = newGame(size);
    if (size === 9) game.play(4, 4);
    const move = await chooseMove(game, { level: 2, color: game.turn });
    if (move.pass) continue;
    assert.ok(move.x >= 0 && move.y >= 0 && move.x < size && move.y < size, `${size} bounds`);
    assert.equal(game.board.get([move.x, move.y]), EMPTY, `${size} occupied`);
    assert.equal(game.canPlay(move.x, move.y).ok, true, `${size} illegal`);
  }
});

await test("KataGo reports parse into candidates, lines and ownership", () => {
  const r = parseInfo(SAMPLE_INFO, 19);
  assert.equal(r.moves.length, 3);
  assert.deepEqual({ x: r.moves[0].x, y: r.moves[0].y }, { x: 3, y: 15 });
  assert.equal(r.moves[0].winrate, 0.56);
  assert.equal(r.moves[0].scoreLead, 2.4);
  assert.equal(r.moves[0].pv.length, 3);
  assert.deepEqual(r.moves[0].pv[1], { x: 15, y: 3 });
  assert.equal(r.ownership.length, 361);
  assert.equal(r.ownership[1], 0.5);
  assert.deepEqual(parseVertex("pass", 19), { pass: true });
  assert.deepEqual(parseVertex("J1", 9), { x: 8, y: 8 });
});

await test("the strength ladder keeps strong levels exact and weak levels inside their loss window", () => {
  const analysis = { moves: parseInfo(SAMPLE_INFO, 19).moves, play: { x: 3, y: 15 } };
  assert.deepEqual(pickCandidate(analysis, BLACK, calibrated("2d"), () => 0.99), { x: 3, y: 15 });
  // 1k allows up to 6 points: D4 and Q16, never K10 (8.9 points worse)
  // unless its 2% deliberate slip fires (the first draw below 0.02).
  for (let i = 0; i < 50; i++) {
    const m = pickCandidate(analysis, BLACK, calibrated("1k"), () => 0.05 + (i / 50) * 0.94);
    assert.ok(!(m.x === 9 && m.y === 9), "1k must not take a 9-point loss");
  }
  const slipped = pickCandidate(analysis, BLACK, calibrated("1k"), () => 0.01);
  assert.deepEqual(slipped, { x: 9, y: 9 }, "the deliberate slip picks outside the window");
  // White's point of view flips the score lead: K10 is White's best here.
  assert.deepEqual(pickCandidate(analysis, WHITE, { ...calibrated("2d"), temp: 0 }), { x: 3, y: 15 });
  assert.equal(new Set(STRENGTHS.map((s) => s.id)).size, STRENGTHS.length);
  // One stone per rank of the rank the opponent plays at (a number, the measured rank shown).
  assert.equal(suggestHandicap(25, 18, 19), 7);
  assert.equal(suggestHandicap(15, 12, 19), 3);
  assert.equal(suggestHandicap(10, 12, 19), 0);
  assert.equal(suggestHandicap(null, 12, 19), 0);
});

await test("the calibrated levels are monotonic under their calibration names", () => {
  // The calibration (docs/strength.md, scripts/calibrate-strength.mjs) names these settings; nothing saved refers to them.
  assert.deepEqual(
    STRENGTHS.map((s) => s.id),
    ["30k", "25k", "20k", "15k", "10k", "5k", "1k", "2d"],
  );
  for (let i = 1; i < STRENGTHS.length; i++) {
    const a = STRENGTHS[i - 1];
    const b = STRENGTHS[i];
    assert.ok(b.rank < a.rank, `${b.id} is labelled stronger than ${a.id}`);
    assert.ok(b.visits >= a.visits, `${b.id} searches at least as much as ${a.id}`);
    assert.ok(b.temp <= a.temp, `${b.id} samples no wider than ${a.id}`);
    assert.ok(b.maxLoss <= a.maxLoss, `${b.id} tolerates no bigger loss than ${a.id}`);
    assert.ok(b.slip <= a.slip, `${b.id} slips no more often than ${a.id}`);
    assert.ok(b.local >= a.local, `${b.id} offline fallback is no weaker than ${a.id}`);
    assert.ok((b.blunder ?? 0) <= (a.blunder ?? 0), `${b.id} blunders no more often than ${a.id}`);
    assert.ok(b.visits > a.visits || b.temp < a.temp || b.maxLoss < a.maxLoss || b.slip < a.slip || (b.blunder ?? 0) < (a.blunder ?? 0), `${b.id} differs from ${a.id}`);
  }
  for (const s of STRENGTHS) {
    assert.ok(Number.isInteger(s.rank) && s.rank <= 30 && s.rank >= -8, `${s.id} rank`);
    assert.ok(s.visits >= 1 && s.visits <= 1000, `${s.id} visits fit a laptop CPU`);
    const parts = rankParts(s.rank);
    assert.ok(parts.n >= 1 && (parts.unit === "kyu" || parts.unit === "dan"));
  }
});

await test("a level's pick falls back to KataGo's own move when the app's rules forbid it", () => {
  const g = newGame(9);
  g.play(4, 4);
  // E5 (4,4) is occupied: the pick is illegal, so KataGo's choice is played.
  const analysis = {
    moves: [{ x: 4, y: 4, visits: 10, scoreLead: 1, winrate: 0.5, order: 0 }],
    play: { x: 2, y: 2 },
  };
  assert.deepEqual(moveFromAnalysis(g, analysis, calibrated("2d")), { x: 2, y: 2 });
  assert.equal(moveFromAnalysis(g, { moves: analysis.moves, play: { x: 4, y: 4 } }, calibrated("2d")), null);
});

await test("beginner moves are legal, local and never fill the player's own eye", () => {
  const rnd = mulberry32(3);
  const g = newGame(9);
  // Black's eye at A9 (0,0): B9 and A8 are black.
  g.play(1, 0);
  g.play(8, 8);
  g.play(0, 1);
  g.play(7, 7);
  for (let i = 0; i < 200; i++) {
    const m = beginnerMove(g, rnd);
    assert.ok(m && g.canPlay(m.x, m.y).ok, "legal");
    assert.ok(!(m.x === 0 && m.y === 0), "never its own eye");
    let near = false;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (g.board.get([x, y]) !== EMPTY && Math.max(Math.abs(x - m.x), Math.abs(y - m.y)) <= 2) near = true;
    assert.ok(near, "near the stones on the board");
  }
  // An empty 19×19 board: the third or fourth line.
  const e = newGame(19);
  for (let i = 0; i < 50; i++) {
    const m = beginnerMove(e, rnd);
    const line = Math.min(m.x, m.y, 18 - m.x, 18 - m.y);
    assert.ok(line === 2 || line === 3, `opening on the 3rd/4th line, got ${line + 1}`);
  }
  // A level with blunder 1 always plays a beginner move, unless KataGo passes.
  const analysis = { moves: [{ x: 4, y: 4, visits: 10, scoreLead: 1, order: 0 }], play: { x: 4, y: 4 } };
  const level = { ...calibrated("30k"), blunder: 1 };
  const g2 = newGame(9);
  g2.play(2, 2);
  const m = moveFromAnalysis(g2, analysis, level, mulberry32(1));
  assert.ok(Math.max(Math.abs(m.x - 2), Math.abs(m.y - 2)) <= 2);
  assert.deepEqual(moveFromAnalysis(g2, { moves: [{ pass: true, visits: 10, scoreLead: 0 }], play: { pass: true } }, level, mulberry32(1)), { pass: true });
});

await test("the calibration fit recovers known strengths and maps them onto the EGF scale", () => {
  // EGF expectancy: one rank at 10k is worth about two wins in three.
  assert.ok(Math.abs(egfExpected(1200, 1100) - 0.659) < 0.01);
  assert.ok(Math.abs(egfExpected(2200, 2100) - 0.73) < 0.01);
  assert.ok(Math.abs(egfNats(1000, 1100) - 100 / (205 - 1050 / 20)) < 0.01);
  assert.equal(profileGoR("rank_5k"), 1600);
  assert.equal(profileGoR("rank_2d"), 2200);
  assert.equal(goRLabel(1600), "5k");
  assert.equal(goRLabel(2100), "1d");
  assert.equal(goRLabel(2180), "2d");
  const [lo, hi] = wilson(20, 40);
  assert.ok(lo > 0.34 && lo < 0.36 && hi > 0.64 && hi < 0.66);

  const truth = { "L:a": 0, "L:b": 0.7, "L:c": 1.5, "H:rank_10k": 1.1 };
  const players = Object.keys(truth);
  const rnd = mulberry32(7);
  const games = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (let k = 0; k < 800; k++) {
        const [black, white] = k % 2 ? [players[i], players[j]] : [players[j], players[i]];
        const p = 1 / (1 + Math.exp(-(truth[black] - truth[white] + 0.2)));
        games.push({ black, white, winner: rnd() < p ? "B" : "W", plies: 100, reason: "passes" });
      }
    }
  }
  const fit = fitBT(games, players, { ref: "L:a" });
  for (const p of players) assert.ok(Math.abs(fit.theta[p] - truth[p]) < 0.15, `${p} θ ${fit.theta[p]}`);
  assert.ok(Math.abs(fit.eta - 0.2) < 0.1);
  // One anchor: its own rating, and the EGF curve elsewhere.
  const m = anchorMap(fit.theta, [{ player: "H:rank_10k", gor: 1100 }]);
  assert.equal(Math.round(m.map(fit.theta["H:rank_10k"])), 1100);
  assert.ok(m.map(fit.theta["L:c"]) > 1100 && m.map(fit.theta["L:a"]) < 1100);
  const r = analyse(games, { boot: 20 });
  assert.equal(r.rows.length, 4);
  for (const row of r.rows) assert.ok(row.lo <= row.theta + 1e-9 && row.theta <= row.hi + 1e-9 || row.player === "L:a");
});

await test("the native bridge sends setup stones, handicap and moves to KataGo for any size", async () => {
  let payload = null;
  globalThis.zero = {
    invoke: async (command, p) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true };
      if (command === "studio.katagoAnalyzeAsync") {
        payload = p;
        return { ok: true, id: p.id, play: "C3", info: "info move C3 visits 10 winrate 0.6 scoreLead 3 order 0 pv C3 G7 ownership " + Array(81).fill("0.1").join(" ") };
      }
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../../src/web/js/katago.js?bridge-test");
    const game = new Game({ size: 9, komi: 0.5, handicap: 2 });
    game.play(4, 4);
    const a = await K.analyze(game, { visits: 20 });
    assert.deepEqual(a.play, { x: 2, y: 6 });
    assert.equal(a.ownership.length, 81);
    assert.equal(a.winrate, 0.6);
    assert.equal(payload.size, 9);
    assert.equal(payload.komi, 0.5);
    assert.equal(payload.rules, "japanese");
    assert.equal(payload.visits, 20);
    assert.equal(payload.color, "B");
    assert.equal(payload.setup, "B G7 B C3");
    assert.equal(payload.moves, "W E5");
    assert.match(payload.id, /^k\d+$/);
  } finally {
    delete globalThis.zero;
  }
});

await test("async KataGo hosts get a structured position, stream partial reports and cancel", async () => {
  const sent = [];
  const listeners = new Map();
  const replies = new Map();
  const info9 = (visits) => `info move C3 visits ${visits} winrate 0.6 scoreLead 3 order 0 pv C3 G7 ownership ` + Array(81).fill("0.1").join(" ");
  globalThis.zero = {
    on: (name, fn) => {
      listeners.set(name, fn);
      return () => listeners.delete(name);
    },
    invoke: async (command, payload) => {
      sent.push({ command, payload });
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") {
        replies.get(payload.id)?.({ ok: false, id: payload.id, cancelled: true });
        return { ok: true, cancelled: 1 };
      }
      if (command === "studio.katagoAnalyzeAsync") return new Promise((resolve) => replies.set(payload.id, resolve));
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../../src/web/js/katago.js?bridge-async");
    assert.equal((await K.status()).async, true);
    const game = new Game({ size: 9, komi: 0.5, handicap: 2 });
    game.play(4, 4);
    game.pass();
    const partials = [];
    const pending = K.analyze(game, { visits: 20, onInfo: (p) => partials.push(p) });
    await new Promise((r) => setTimeout(r, 0));
    const req = sent.find((s) => s.command === "studio.katagoAnalyzeAsync").payload;
    assert.equal(req.size, 9);
    assert.equal(req.komi, 0.5);
    assert.equal(req.setup, "B G7 B C3");
    assert.equal(req.moves, "W E5 B pass");
    assert.equal(req.color, "W");
    assert.equal(req.visits, 20);
    assert.equal(req.stream, true);
    listeners.get("katago:info")({ id: req.id, info: info9(4) });
    listeners.get("katago:info")({ id: "someone-else", info: info9(5) });
    assert.equal(partials.length, 1);
    assert.equal(partials[0].visits, 4);
    assert.deepEqual(partials[0].play, { x: 2, y: 6 });
    replies.get(req.id)({ ok: true, id: req.id, play: "C3", info: info9(20), sync: { reset: false, undo: 0, play: 1 } });
    const a = await pending;
    assert.equal(a.visits, 20);
    assert.equal(a.ownership.length, 81);
    assert.deepEqual(a.sync, { reset: false, undo: 0, play: 1 });

    // Abort: cancel goes to the host and the call resolves null.
    const controller = new AbortController();
    const aborted = K.analyze(game, { visits: 20, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    assert.equal(await aborted, null);
    const cancelReq = sent.filter((s) => s.command === "studio.katagoCancel").at(-1).payload;
    assert.equal(cancelReq.id, sent.filter((s) => s.command === "studio.katagoAnalyzeAsync").at(-1).payload.id);

    // cancel(): everything in flight resolves null; a superseded reply is null.
    const third = K.analyze(game, { visits: 20 });
    await new Promise((r) => setTimeout(r, 0));
    K.cancel();
    assert.equal(await third, null);
    assert.deepEqual(sent.at(-1), { command: "studio.katagoCancel", payload: {} });
    const fourth = K.analyze(game, { visits: 20 });
    await new Promise((r) => setTimeout(r, 0));
    const id4 = sent.filter((s) => s.command === "studio.katagoAnalyzeAsync").at(-1).payload.id;
    replies.get(id4)({ ok: false, id: id4, cancelled: true });
    assert.equal(await fourth, null);
  } finally {
    delete globalThis.zero;
  }
});

await test("what the opponent ladder can reach follows what is installed, with no mode setting", () => {
  const none = { strong: false, human: false };
  const strong = { strong: true, human: false };
  assert.deepEqual(installed(none), { human: false, strong: false });
  assert.deepEqual(installed({ strong: false, human: true }), { human: true, strong: false });
  assert.deepEqual(installed(strong), { human: false, strong: true });
  // A stronger network whose process keeps failing is not reachable.
  assert.deepEqual(installed({ ...strong, strongUsable: false }), { human: false, strong: false });
  assert.ok(!("humanStyle" in DEFAULT_SETTINGS), "no human-style switch");
  assert.ok(!("strength" in DEFAULT_SETTINGS) && Number.isFinite(DEFAULT_SETTINGS.opponentRank));
  // Analysis uses the stronger network when installed, with fewer visits.
  assert.equal(analysisEngine(none), "standard");
  assert.equal(analysisEngine(strong), "strong");
  assert.equal(scaledVisits(240, "strong"), Math.round(240 * STRONG_VISIT_SCALE));
  assert.equal(scaledVisits(240, "standard"), 240);
  assert.equal(scaledVisits(1, "strong"), 1);
});

await test("every level has a valid human SL profile, in ladder order", () => {
  // The same rule as engine.zig validProfile.
  const valid = (p) => /^(rank|preaz)_([1-9]|1\d|20)k$|^(rank|preaz)_[1-9]d$/.test(p);
  const strengthOf = (p) => {
    const m = /_(\d+)([kd])$/.exec(p);
    return m[2] === "k" ? -Number(m[1]) : Number(m[1]);
  };
  let prev = -Infinity;
  // Beginner moves fall up the ladder within each style (the search
  // style at 5k needs its own to play at the level, docs/strength.md v7).
  const prevBlunder = { raw: Infinity, search: Infinity };
  for (const s of STRENGTHS) {
    assert.ok(s.human && valid(s.human.profile), s.id);
    assert.ok(!s.human.style || ["raw", "search"].includes(s.human.style), s.id);
    const v = strengthOf(s.human.profile);
    assert.ok(v >= prev, `${s.id}: profile weaker than the level below`);
    const b = s.human.blunder ?? 0;
    const style = s.human.style || "raw";
    assert.ok(b <= prevBlunder[style], `${s.id}: more beginner moves than the level below`);
    if (style === "raw") assert.ok(b < s.blunder || s.blunder === 0, `${s.id}: human style adds no beginner moves of its own`);
    prev = v;
    prevBlunder[style] = b;
    const req = humanRequest(s.human);
    assert.equal(req.engine, "human");
    assert.ok(req.visits >= 1 && req.visits <= 400, s.id);
  }
  assert.equal(humanRequest({ profile: "rank_10k" }).visits, HUMAN_VISITS);
  assert.equal(humanRequest({ profile: "rank_10k", style: "bogus" }).humanStyle, "raw");
  assert.deepEqual(enginePayload({ engine: "human", profile: "rank_12k", humanStyle: "search" }), { engine: "human", profile: "rank_12k", humanStyle: "search" });
  assert.deepEqual(enginePayload({ engine: "strong", profile: "x" }), { engine: "strong" });
  // The standard engine adds nothing to the request.
  assert.deepEqual(enginePayload({}), {});
});

await test("a human-style move is KataGo's human choice, legal, with beginner moves only below 20 kyu", () => {
  const game = new Game({ size: 9, komi: 6.5 });
  game.play(4, 4);
  const analysis = {
    moves: [{ x: 2, y: 2, visits: 10, scoreLead: 0.5, winrate: 0.5 }],
    play: { x: 6, y: 2 },
  };
  assert.deepEqual(humanMoveFromAnalysis(game, analysis, { profile: "rank_12k" }), { x: 6, y: 2 });
  // An illegal choice (occupied) falls back to KataGo's top candidate.
  assert.deepEqual(humanMoveFromAnalysis(game, { ...analysis, play: { x: 4, y: 4 } }, { profile: "rank_12k" }), { x: 2, y: 2 });
  // KataGo's pass (its search decides passes) is kept.
  assert.deepEqual(humanMoveFromAnalysis(game, { moves: [{ pass: true, visits: 10, scoreLead: 0 }], play: { pass: true } }, { profile: "rank_20k", blunder: 1 }), { pass: true });
  // blunder: 1 always plays a beginner's move when KataGo would not pass.
  const rnd = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const m = humanMoveFromAnalysis(game, analysis, { profile: "rank_20k", blunder: 1 }, rnd);
    assert.ok(m && !m.pass && game.canPlay(m.x, m.y).ok);
  }
});

await test("the calibration harness sends the app's own human-style parameters", () => {
  const p = humanStyleParams();
  assert.equal(p.raw.length, 9);
  assert.deepEqual(p.raw.map(([k]) => k), p.search.map(([k]) => k));
  assert.deepEqual(Object.fromEntries(p.search).humanSLChosenMovePiklLambda, "0.08");
  // The raw style is the shipped human.cfg's starting point.
  const cfg = fs.readFileSync(path.join(root, "engine/model/human.cfg"), "utf8").replace(/\r\n/g, "\n");
  for (const [k, v] of p.raw) assert.equal(Number(new RegExp(`^${k} = (\\S+)`, "m").exec(cfg)?.[1]), Number(v), k);
});

await test("strength: the calibration fit can hold the measured ladder and place new players in its frame", () => {
  const rnd = mulberry32(7);
  const truth = { "L:a": 0, "L:b": 3, "L:c": 9, "HL:x": 4.2, "HL:y": 8 };
  const games = [];
  const pairs = [["HL:x", "L:a"], ["HL:x", "L:b"], ["HL:x", "L:c"], ["HL:y", "L:b"], ["HL:y", "L:c"], ["HL:x", "HL:y"]];
  for (const [p, q] of pairs) {
    for (let k = 0; k < 600; k++) {
      const [black, white] = k % 2 ? [p, q] : [q, p];
      const pr = 1 / (1 + Math.exp(-(truth[black] - truth[white])));
      games.push({ black, white, winner: rnd() < pr ? "B" : "W", plies: 60, reason: "passes" });
    }
  }
  const fixed = { "L:a": 0, "L:b": 3, "L:c": 9 };
  const fit = fitBT(games, Object.keys(truth), { fixed });
  for (const p of Object.keys(fixed)) assert.equal(fit.theta[p], fixed[p], p);
  for (const p of ["HL:x", "HL:y"]) assert.ok(Math.abs(fit.theta[p] - truth[p]) < 0.25, `${p} ${fit.theta[p]}`);
  // A clean sweep against a far-away fixed player stays finite.
  const sweep = Array.from({ length: 20 }, (_, k) => ({ black: k % 2 ? "HL:z" : "L:c", white: k % 2 ? "L:c" : "HL:z", winner: k % 2 ? "B" : "W" }));
  const fz = fitBT(sweep, ["L:c", "HL:z"], { fixed: { "L:c": 9 } });
  assert.ok(Number.isFinite(fz.theta["HL:z"]) && fz.theta["HL:z"] > 9);
  // With a map, rows get GoR in the v4 frame and the held players have no spread.
  const r = analyse(games, { boot: 10, fixed, gorMap: thetaToGoR });
  const row = (p) => r.rows.find((x) => x.player === p);
  assert.equal(row("L:b").lo, 3);
  assert.equal(Math.round(row("L:c").gor), Math.round(thetaToGoR(9)));
});

await test("strength: human-style and stronger-network labels follow the measurement", async () => {
  const E = await import("../../src/web/js/engine.js");
  // Values (docs/strength.md, v7): each implementation shows its own
  // measured rank: human-style 2d measured 7 dan, the stronger network 8.
  assert.equal(E.implLabel("HL:1k"), 1);
  assert.equal(E.implLabel("HL:2d"), -6);
  assert.equal(E.implLabel("LS:2d"), -7);
  assert.equal(E.implLabel("L:5k"), 7);
  assert.deepEqual(rankParts(1), { n: 1, unit: "kyu" });
  assert.deepEqual(rankParts(-6), { n: 7, unit: "dan" });
  assert.deepEqual(rankParts(0), { n: 1, unit: "dan" });
  // Every mode's measured strength is ordered as its calibrated levels are, on 19×19.
  for (const prefix of ["L:", "HL:"]) {
    const ids = STRENGTHS.map((s) => prefix + s.id).filter((id) => E.impl(id));
    for (let i = 1; i < ids.length; i++) assert.ok(implOpponent(ids[i]) > implOpponent(ids[i - 1]), ids[i]);
  }
  assert.ok(implOpponent("LS:2d") > implOpponent("L:2d"));
  assert.ok(implOpponent("LS:2d", { size: 9 }) > implOpponent("L:2d", { size: 9 }));
});
