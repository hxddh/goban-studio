/**
 * Play: how the computer plays, and the speed budgets. Loaded by scripts/ui-test.mjs
 * before the visual baselines; receives its helpers (check, assert, fresh,
 * onboard, clickPoint, pointOf, origin, browser).
 *
 * Budgets (ms) have about four times the headroom of what a laptop or a CI
 * runner measures, so they catch a regression without flaking. The first
 * render, a board click, a classic in review and a place switch keep their
 * v4 budgets in ui-test.mjs; these are the rest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "frontend/dist");

export const V8_BUDGET = {
  bundleBytes: 1.3 * 1024 * 1024, // the one start-up script (2.71 MB in v7, 2.13 MB in v8, 1.04 MB in v9: content after start-up)
  contentFirstUse: 1500, // a problem opened before its part arrived on idle
  coldStart: 800, // median of three: navigation to the first screen
  firstComputerMove: [350, 2500], // a fake KataGo host: the reply is paced, never instant
  explorerOpen: 1500, // first use of the opening book, fetched on demand
  reportStored: 500, // a report made in the background opens at once
  reportFresh: 4000, // a 150-move game without one, made on the spot (offline estimate)
};

/**
 * A KataGo host that answers at once: every search returns the first empty
 * point of the 4-4 / 3-4 area as the only candidate, with a settled-looking
 * evaluation. Enough for the play controller's timing; nothing else is real.
 */
function fakeHost() {
  const L = "ABCDEFGHJKLMNOPQRST";
  window.zero = {
    on: () => () => {},
    invoke: async (command, p) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo (test)", async: true, stream: true };
      if (command === "studio.katagoCancel") return { ok: true };
      // The store's file commands (src/store.zig), on nothing: a first launch.
      if (command === "studio.storeList") return [];
      if (command === "studio.storeRead") return null;
      if (command === "studio.storeWrite" || command === "studio.storeRemove") return { ok: true };
      if (command === "studio.katagoAnalyzeAsync") {
        const taken = new Set((p.moves || "").split(/\s+/).filter((t, i) => i % 2 === 1));
        let v = "pass";
        for (const y of [3, 4, 5, 2, 6, 7, 8]) {
          for (let x = 3; x < p.size - 3; x++) {
            const t = L[x] + (p.size - y);
            if (!taken.has(t)) {
              v = t;
              break;
            }
          }
          if (v !== "pass") break;
        }
        const own = Array(p.size * p.size).fill("0").join(" ");
        return { ok: true, id: p.id, play: v, info: `info move ${v} visits ${p.visits} winrate 0.5 scoreLead 0.5 order 0 pv ${v} ownership ${own}` };
      }
      return null;
    },
  };
}

export default async function ({ check, assert, fresh, onboard, origin }) {
  await check("play budgets: one start-up script under 1.3 MB; the opening book and the content parts are served beside it", async () => {
    const bytes = fs.statSync(path.join(dist, "js/bundle.js")).size;
    assert(bytes < V8_BUDGET.bundleBytes, `bundle.js ${bytes} bytes > ${V8_BUDGET.bundleBytes}`);
    const js = fs.readFileSync(path.join(dist, "js/bundle.js"), "utf8");
    assert(!js.includes(`symmetry: "all"`), "the book's data is in the bundle");
    const book = JSON.parse(fs.readFileSync(path.join(dist, "content/book.json"), "utf8"));
    assert(book.trees?.whole && book.trees?.corner, "content/book.json");
    // v9: lesson steps, problem bodies and classic records are not in the script (content.js).
    const part = (name) => JSON.parse(fs.readFileSync(path.join(dist, `content/${name}.json`), "utf8"));
    const someProblem = Object.values(part("problems"))[0];
    const someClassic = Object.values(part("classics"))[0];
    assert(!js.includes(JSON.stringify(someProblem.hint.en)), "a problem's hint is in the bundle");
    assert(!js.includes(someClassic.sgf.slice(40, 120)), "a classic's record is in the bundle");
    assert(Object.values(part("course")).every((steps) => Array.isArray(steps) && steps.length), "content/course.json");
    assert(Object.values(part("problems")).every((p) => Array.isArray(p.diagram)), "content/problems.json");
    assert(Object.values(part("classics")).every((c) => typeof c.sgf === "string"), "content/classics.json");
    return `${(bytes / 1024).toFixed(0)} KB`;
  });

  await check("play budgets: cold start to the first screen", async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const page = await fresh();
      const t0 = Date.now();
      await page.goto(origin + "/");
      await page.waitForSelector(".ob-card");
      times.push(Date.now() - t0);
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    }
    const med = times.sort((a, b) => a - b)[1];
    assert(med < V8_BUDGET.coldStart, `cold start ${med} ms > ${V8_BUDGET.coldStart}`);
    return `median ${med} ms (${times.join(", ")})`;
  });

  await check("play budgets: the first screen needs no content part; a problem waits for its part; each part comes once", async () => {
    const page = await fresh();
    const asked = [];
    const held = [];
    let hold = true;
    await page.route(/\/content\/(course|problems|classics)\.json$/, (route) => {
      asked.push(route.request().url().split("/").pop());
      if (hold) held.push(route);
      else route.continue();
    });
    // Onboarding, a first game and Play's home come up with every part held back.
    await page.goto(origin + "/");
    await page.waitForSelector(".ob-card");
    await page.click(".ob-card .btn.primary");
    await page.click(".choice >> nth=1");
    await page.waitForSelector("canvas.board");
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".page h1");
    await page.keyboard.press("Control+2");
    await page.waitForSelector(".catalog-link");
    // A topic lists its problems by title (the problems part): it opens once that part arrives.
    await page.click(".catalog-link .group-row");
    await page.click(".topic-row >> nth=0");
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => window.__state.learn.view === "catalog"), "the topic opened without its problems");
    const t0 = Date.now();
    hold = false;
    for (const r of held.splice(0)) await r.continue();
    await page.waitForSelector(".problem-card");
    const ms = Date.now() - t0;
    assert(ms < V8_BUDGET.contentFirstUse, `topic ${ms} ms after its part was let through > ${V8_BUDGET.contentFirstUse}`);
    await page.click(".problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.learn.view === "problem" && !!window.__state.learn.problem?.pz);
    // The rest arrives on idle, each part once.
    await page.waitForFunction(() => performance.getEntriesByType("resource").filter((e) => /content\/(course|problems|classics)\.json$/.test(e.name)).length >= 3, null, { timeout: 10000 });
    assert(asked.length === 3 && new Set(asked).size === 3, `asked: ${asked.join(", ")}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return `topic ${ms} ms after its part`;
  });

  await check("play budgets: the computer's first move with a KataGo host is paced, never instant, never slow", async () => {
    const page = await fresh();
    await page.addInitScript(fakeHost);
    await onboard(page, 1);
    await page.waitForFunction(() => window.__state.engine?.available === true, null, { timeout: 3000 });
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=0");
    await page.locator(".sheet .segmented button").filter({ hasText: /^White$/ }).first().click(); // play White: the computer opens
    const t0 = Date.now();
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.game?.game.moveNumber >= 1 && !window.__state.game.thinking, null, { timeout: 6000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ms = Date.now() - t0;
    const [lo, hi] = V8_BUDGET.firstComputerMove;
    assert(ms >= lo && ms < hi, `first computer move ${ms} ms, want ${lo}–${hi}`);
    const mode = await page.evaluate(() => window.__state.game.opponentMode);
    assert(mode === "standard", `played by ${mode}, not the KataGo path`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return `${ms} ms`;
  });

  await check("play budgets: the opening book loads on first use and the explorer opens within budget", async () => {
    const page = await fresh();
    const fetched = [];
    page.on("request", (r) => r.url().includes("book.json") && fetched.push(r.url()));
    await onboard(page, 1);
    await page.keyboard.press("Control+1");
    await page.locator(".tabs-row .segmented button").filter({ hasText: "Explorer" }).click();
    const t0 = Date.now();
    await page.click("[data-explorer=whole]");
    await page.waitForSelector(".explorer-panel .explorer-row");
    const ms = Date.now() - t0;
    assert(ms < V8_BUDGET.explorerOpen, `explorer ${ms} ms > ${V8_BUDGET.explorerOpen}`);
    assert(fetched.length === 1 && /\/content\/book\.json$/.test(fetched[0]), `book fetched: ${fetched.join(", ")}`);
    const n = await page.locator(".explorer-panel .explorer-row").count();
    assert(n >= 3, `${n} continuations`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return `${ms} ms`;
  });

  /** A finished 19×19 game of `moves` moves against the computer, in storage. */
  async function seedGame(page, moves, report = null) {
    await page.evaluate(
      ({ moves, report }) => {
        const L = "abcdefghijklmnopqrs";
        let sgf = "(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]RE[W+R]PB[You]PW[KataGo]";
        let i = 0;
        for (let y = 0; y < 19 && i < moves; y += 2) for (let x = 0; x < 19 && i < moves; x++, i++) sgf += `;${i % 2 ? "W" : "B"}[${L[x]}${L[y]}]`;
        sgf += ")";
        const at = Date.now();
        // One game file in the browser preview's store (data/games.js).
        const game = { id: "seed", createdAt: at, updatedAt: at, finishedAt: at, source: "game", sgf, meta: { opponent: "ai", rank: 12, impl: "L:10k", humanColor: 1, size: 19, moves, result: "W+R", name: "Seed", thumb: "" } };
        if (report) game.review = report;
        localStorage.setItem("goban9:games/seed.json", JSON.stringify(game));
      },
      { moves, report },
    );
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
  }
  async function openReport(page) {
    await page.keyboard.press("Control+1");
    await page.locator(".game-item [aria-haspopup]").first().click();
    const t0 = Date.now();
    await page.locator("[role=menuitem]").filter({ hasText: "Report" }).first().click();
    await page.waitForFunction(() => window.__state.report?.status === "done", null, { timeout: 15000 });
    await page.waitForSelector(".report");
    return Date.now() - t0;
  }

  await check("play budgets: a game's report opens within budget, made on the spot or in the background", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seedGame(page, 150);
    const freshMs = await openReport(page);
    assert(freshMs < V8_BUDGET.reportFresh, `report made on the spot ${freshMs} ms > ${V8_BUDGET.reportFresh}`);
    // It is stored with its game now; opening it again is instant.
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("goban9:games/seed.json")).review, null, { timeout: 3000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("goban9:games/seed.json")));
    assert(stored.review && Array.isArray(stored.analysis) && stored.analysis.length === 151, "the report and its analysis were stored in the game's file");
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
    const storedMs = await openReport(page);
    assert(storedMs < V8_BUDGET.reportStored, `stored report ${storedMs} ms > ${V8_BUDGET.reportStored}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return `made ${freshMs} ms, stored ${storedMs} ms`;
  });
}
