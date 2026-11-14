/**
 * Core: Settings → Engines' diagnostics — the build and fallback the host
 * reports, said in plain words in four languages, and Measure speed, which
 * times one search per network in the background lane and stops when asked.
 *
 * A fake native host stands in for KataGo (this file has a process of its own).
 */
import { test, assert, setLang, t } from "./helpers.mjs";
import * as Diag from "../../src/web/js/engine-diag.js";
import { createScheduler } from "../../src/web/js/scheduler.js";
import { LANG_IDS } from "../../src/web/js/i18n.js";

const searches = []; // { engine, visits, moves }
let statusAnswer = { available: true, async: true, stream: true, models: true, version: "KataGo 1.18.1", build: "metal", fallback: null, networks: { standard: "g170-b6c96-s175395328-d26788732" } };
let statusCalls = 0;
/** How long the host takes for a search of `visits` (ms), and whether it answers. */
const host = { msPerVisit: 0, answer: true };
const open = new Map();
globalThis.zero = {
  on() {},
  invoke(cmd, p) {
    if (cmd === "studio.katagoStatus") {
      statusCalls++;
      return Promise.resolve(statusAnswer);
    }
    if (cmd === "studio.katagoAnalyzeAsync") {
      searches.push({ engine: p.engine || "standard", visits: p.visits, moves: p.moves });
      if (!host.answer) return Promise.resolve({ ok: false });
      return new Promise((resolve) => {
        open.set(p.id, resolve);
        setTimeout(() => {
          open.delete(p.id);
          resolve({ ok: true, play: "D4", info: `info move D4 visits ${p.visits - 1} winrate 0.5 scoreLead 0 prior 0.1 order 0 pv D4` });
        }, host.msPerVisit * p.visits);
      });
    }
    if (cmd === "studio.katagoCancel") {
      const resolve = open.get(p.id);
      if (resolve) resolve({ ok: false, cancelled: true });
      open.delete(p.id);
      return Promise.resolve({});
    }
    return Promise.resolve(null);
  },
};

await test("engine diagnostics: the host's build, fallback and networks are read and checked", async () => {
  assert.deepEqual(Diag.readDiagnostics(statusAnswer), { version: "KataGo 1.18.1", build: "metal", fallback: null, networks: { standard: "g170-b6c96-s175395328-d26788732" } });
  assert.equal(Diag.readDiagnostics({ available: false, build: "metal" }), null);
  assert.equal(Diag.readDiagnostics(null), null);
  // An older host names no build: the line says only the version.
  const old = Diag.readDiagnostics({ available: true, version: "KataGo 1.18.1" });
  assert.equal(old.build, null);
  assert.equal(old.fallback, null);
  assert.deepEqual(old.networks, {});
  // Nonsense is dropped, never shown.
  const odd = Diag.readDiagnostics({ available: true, build: "cuda", fallback: 3, networks: { standard: 7, strong: "kata1-b18c384nbt-s9996604416-d4316597426", other: "x" } });
  assert.equal(odd.build, null);
  assert.equal(odd.fallback, null);
  assert.deepEqual(odd.networks, { strong: "kata1-b18c384nbt-s9996604416-d4316597426" });
  assert.equal(odd.version, "KataGo");
  // Read afresh every time (katago.js keeps its first answer for the session).
  const before = statusCalls;
  statusAnswer = { ...statusAnswer, build: "eigen", fallback: "no-answer" };
  assert.equal((await Diag.diagnostics()).fallback, "no-answer");
  assert.equal((await Diag.diagnostics()).build, "eigen");
  assert.equal(statusCalls, before + 2);
});

await test("engine diagnostics: the build and the fallback in plain words, in four languages", () => {
  try {
    setLang("en");
    const d = (build, fallback = null) => ({ version: "KataGo 1.18.1", build, fallback, networks: {} });
    assert.equal(Diag.engineLine(d("metal"), t), "Engine: KataGo 1.18.1 · Metal (graphics card)");
    assert.equal(Diag.engineLine(d("avx2"), t), "Engine: KataGo 1.18.1 · AVX2");
    assert.equal(Diag.engineLine(d("eigen"), t), "Engine: KataGo 1.18.1 · standard (CPU)");
    assert.equal(Diag.engineLine(d(null), t), "Engine: KataGo 1.18.1 (every board size)");
    assert.equal(Diag.fallbackKey(null), null);
    assert.equal(Diag.fallbackKey("start-failed"), "engineDiag.fallback.startFailed");
    assert.equal(Diag.fallbackKey("no-answer"), "engineDiag.fallback.noAnswer");
    assert.equal(Diag.fallbackKey("timed-out"), "engineDiag.fallback.timedOut");
    assert.equal(Diag.fallbackKey("something-new"), "engineDiag.fallback.other");
    for (const lang of LANG_IDS) {
      setLang(lang);
      for (const build of Diag.BUILDS) {
        const line = Diag.engineLine(d(build), t);
        assert.ok(line.includes("KataGo 1.18.1") && !line.includes("engineDiag"), `${lang} ${build}: ${line}`);
      }
      for (const code of ["start-failed", "no-answer", "timed-out", "x"]) assert.ok(!t(Diag.fallbackKey(code)).includes("engineDiag"), `${lang} ${code}`);
    }
    setLang("zh");
    assert.equal(Diag.engineLine(d("metal"), t), "引擎：KataGo 1.18.1 · Metal（显卡）");
  } finally {
    setLang("en");
  }
});

await test("engine diagnostics: visits per second, whole numbers and one decimal below ten, per network", () => {
  try {
    setLang("en");
    assert.equal(Diag.rateText(1234.4, "en"), "1,234");
    assert.equal(Diag.rateText(61.6, "en"), "62");
    assert.equal(Diag.rateText(7.25, "en"), "7.3");
    assert.equal(Diag.rateText(1234.4, "zh"), "1,234");
    const line = Diag.speedLine(
      [
        { engine: "standard", rate: 412.2 },
        { engine: "strong", rate: 61 },
      ],
      t,
      "en",
    );
    assert.equal(line, "Built-in: 412 visits/s · Stronger: 61 visits/s");
    assert.equal(Diag.speedLine([{ engine: "standard", rate: 0 }], t, "en"), "Built-in: could not be measured");
    for (const lang of LANG_IDS) {
      setLang(lang);
      const s = Diag.speedLine([{ engine: "standard", rate: 5 }, { engine: "strong", rate: 0 }], t, lang);
      assert.ok(s.includes("5.0") && !s.includes("engineDiag"), `${lang}: ${s}`);
    }
    assert.deepEqual(Diag.speedEngines({ networks: { standard: "a" } }), ["standard"]);
    assert.deepEqual(Diag.speedEngines({ networks: { standard: "a", strong: "b" } }), ["standard", "strong"]);
  } finally {
    setLang("en");
  }
});

await test("engine diagnostics: the test position is a 19×19 opening of a few stones, new each time", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const a = Diag.speedGame(rand);
  const b = Diag.speedGame(rand);
  assert.equal(a.size, 19);
  assert.equal(a.path.length - 1, Diag.SPEED_STONES);
  const stones = (g) => g.path.slice(1).map((n) => `${n.move.x},${n.move.y}`);
  assert.equal(new Set(stones(a)).size, Diag.SPEED_STONES);
  assert.notDeepEqual(stones(a), stones(b));
  for (const n of a.path.slice(1)) assert.ok([2, 3, 15, 16].includes(n.move.x) || [2, 3, 15, 16].includes(n.move.y), `${n.move.x},${n.move.y} is on the third or fourth line`);
});

await test("engine diagnostics: Measure speed warms up untimed, then times SPEED_VISITS visits per network", async () => {
  searches.length = 0;
  host.msPerVisit = 0;
  let clock = 0;
  // The clock moves only during the timed search: 2 s for 300 visits.
  const now = () => clock;
  const sched = createScheduler();
  const realAnalyze = globalThis.zero.invoke;
  globalThis.zero.invoke = (cmd, p) => {
    if (cmd === "studio.katagoAnalyzeAsync" && p.visits === Diag.SPEED_VISITS) clock += 2000;
    return realAnalyze(cmd, p);
  };
  try {
    const r = await Diag.measure("strong", { now, sched });
    assert.equal(r.engine, "strong");
    assert.equal(r.visits, Diag.SPEED_VISITS - 1);
    assert.equal(r.ms, 2000);
    assert.ok(Math.abs(r.rate - (Diag.SPEED_VISITS - 1) / 2) < 1e-9);
    assert.deepEqual(
      searches.map((s) => [s.engine, s.visits]),
      [
        ["strong", 1],
        ["strong", Diag.SPEED_VISITS],
      ],
    );
    // A different position for the warm-up and the timed search.
    assert.notEqual(searches[0].moves, searches[1].moves);
    // KataGo gives nothing: a result that says so, not a speed.
    host.answer = false;
    const none = await Diag.measure("standard", { now, sched });
    assert.equal(none.rate, 0);
  } finally {
    globalThis.zero.invoke = realAnalyze;
    host.answer = true;
  }
});

await test("engine diagnostics: Measure speed waits in the background lane and stops when its signal aborts", async () => {
  searches.length = 0;
  host.msPerVisit = 1;
  const sched = createScheduler();
  // A search the player is waiting on is queued first and runs first.
  const order = [];
  const first = sched.search(async () => {
    await new Promise((r) => setTimeout(r, 30));
    order.push("interactive");
    return 1;
  }, { lane: "interactive" });
  const ctl = new AbortController();
  const timing = Diag.measure("standard", { signal: ctl.signal, sched }).then((r) => {
    order.push("measure");
    return r;
  });
  await first;
  // Stopped while its timed search runs: null, and the search is cancelled in the host.
  await new Promise((r) => setTimeout(r, 60));
  ctl.abort();
  assert.equal(await timing, null);
  assert.deepEqual(order, ["interactive", "measure"]);
  assert.equal(open.size, 0, "the host's search was cancelled");
  // Stopped before it starts: it never reaches KataGo.
  const before = searches.length;
  const gone = new AbortController();
  gone.abort();
  assert.equal(await Diag.measure("standard", { signal: gone.signal, sched }), null);
  assert.equal(searches.length, before);
  host.msPerVisit = 0;
});
