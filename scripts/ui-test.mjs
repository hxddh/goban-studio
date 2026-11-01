/**
 * Interface gate: real Chromium against the built page (frontend/dist).
 *
 *   node scripts/ui-test.mjs            run flows, budgets and visual checks
 *   node scripts/ui-test.mjs --update   rewrite the visual baselines
 *
 * Flows exercise what a person does (first run, a game to the count, a
 * review variation, a wrong answer that resets, history back/forward, the
 * keyboard-only board). Budgets fail the run when the page gets slow.
 * Visual checks compare key screens with tests/visual/*.png (masked where
 * the content is time-dependent) and write diffs to tests/visual/diff/.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend/dist");
const baseDir = path.join(root, "tests/visual");
const diffDir = path.join(baseDir, "diff");
const UPDATE = process.argv.includes("--update");
const BUDGET = {
  firstRender: 1500, // ms from navigation to the app shell
  boardInput: 60, // ms from a click to the painted stone
  reviewOpen: 600, // ms to open a 300-move classic in review
  placeSwitch: 250, // ms to switch places
};

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".bin": "application/octet-stream", ".webp": "image/webp", ".wav": "audio/wav", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".gz": "application/gzip", ".txt": "text/plain", ".cfg": "text/plain" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(dist, url === "/" ? "index.html" : url);
  if (!file.startsWith(dist) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
let count = 0;
const results = [];
async function check(name, fn) {
  try {
    const extra = await fn();
    count++;
    console.log(`ok ${count} - ${name}${extra ? " (" + extra + ")" : ""}`);
  } catch (e) {
    failures++;
    console.error(`not ok - ${name}\n  ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function fresh(locale = "en-US", viewport = { width: 1200, height: 860 }) {
  const ctx = await browser.newContext({ viewport, locale, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.errors = errors;
  return page;
}

/** Board point → page coordinates, from the BoardView geometry the page exposes. */
async function pointOf(page, x, y) {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelector("canvas.board");
      const r = c.getBoundingClientRect();
      const g = window.__board?.geom;
      if (!g) return null;
      return { x: r.left + g.ox + x * g.cell, y: r.top + g.oy + y * g.cell };
    },
    [x, y],
  );
}
async function clickPoint(page, x, y) {
  // The board on screen must be the one the page registered (a new view
  // registers after its first paint).
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas.board");
    return !!(c && window.__board && window.__board.canvas === c && window.__board.geom);
  });
  const p = await pointOf(page, x, y);
  assert(p, "board geometry not exposed");
  await page.mouse.click(p.x, p.y);
}

async function onboard(page, choice = 1) {
  await page.goto(origin + "/");
  await page.waitForSelector(".ob-card");
  await page.click(".ob-card .btn.primary");
  await page.click(`.choice >> nth=${choice}`);
  await page.waitForSelector("canvas.board, .page");
}

async function snap(page, name, mask = []) {
  const buf = await page.screenshot({ mask: mask.map((s) => page.locator(s)), animations: "disabled" });
  const file = path.join(baseDir, name + ".png");
  if (UPDATE || !fs.existsSync(file)) {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(file, buf);
    return UPDATE ? "updated" : "baseline written";
  }
  const a = PNG.sync.read(fs.readFileSync(file));
  const b = PNG.sync.read(buf);
  assert(a.width === b.width && a.height === b.height, `${name}: size ${b.width}×${b.height} vs baseline ${a.width}×${a.height}`);
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.2 });
  const ratio = n / (a.width * a.height);
  if (ratio > 0.012) {
    fs.mkdirSync(diffDir, { recursive: true });
    fs.writeFileSync(path.join(diffDir, name + ".png"), PNG.sync.write(diff));
    fs.writeFileSync(path.join(diffDir, name + ".actual.png"), buf);
    throw new Error(`${name}: ${(ratio * 100).toFixed(2)}% of pixels differ (limit 1.2%)`);
  }
  return `${(ratio * 100).toFixed(2)}% diff`;
}

/* ------------------------------------------------------------- flows */

await check("first run → lesson one for a new player, no errors", async () => {
  const page = await fresh();
  const t0 = Date.now();
  await page.goto(origin + "/");
  await page.waitForSelector(".ob-card");
  const first = Date.now() - t0;
  assert(first < BUDGET.firstRender, `first render ${first} ms > ${BUDGET.firstRender}`);
  await page.click(".ob-card .btn.primary");
  await page.click(".choice >> nth=0");
  await page.waitForSelector(".steps");
  assert((await page.textContent(".panel")).includes("Step 1"), "lesson one did not open");
  assert(page.errors.length === 0, page.errors.join("; "));
  await page.close();
  return `first render ${first} ms`;
});

await check("two-player 9×9 game to the count, with the board played by keyboard", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+n");
  await page.click(".preset >> nth=0");
  await page.click(".sheet .segmented button >> nth=1");
  await page.click(".sheet-foot .btn.primary");
  await page.focus("canvas.board");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const moves = await page.evaluate(() => window.__state.game.game.moveNumber);
  assert(moves === 2, `expected 2 moves, got ${moves}`);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Control+Shift+P");
    await page.click(".sheet-foot .btn.primary");
  }
  await page.waitForSelector(".score-card");
  await page.click(".score-card .btn.primary");
  await page.waitForSelector(".result-card");
  assert(page.errors.length === 0, page.errors.join("; "));
  await page.close();
});

await check("a board click paints within budget", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+n");
  await page.click(".preset >> nth=2");
  await page.click(".sheet .segmented button >> nth=1");
  await page.click(".sheet-foot .btn.primary");
  const p = await pointOf(page, 3, 3);
  const ms = await page.evaluate(
    ([x, y]) =>
      new Promise((resolve) => {
        const c = document.querySelector("canvas.board");
        const t0 = performance.now();
        c.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, bubbles: true }));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
      }),
    [p.x, p.y],
  );
  const placed = await page.evaluate(() => window.__state.game.game.moveNumber);
  assert(placed === 1, "the stone was not placed");
  assert(ms < BUDGET.boardInput, `input→paint ${ms.toFixed(1)} ms > ${BUDGET.boardInput}`);
  await page.close();
  return `${ms.toFixed(1)} ms`;
});

await check("review: a variation, back to the game, Esc closes the layer", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+n");
  await page.click(".preset >> nth=0");
  await page.click(".sheet .segmented button >> nth=1");
  await page.click(".sheet-foot .btn.primary");
  await clickPoint(page, 4, 4);
  await clickPoint(page, 2, 2);
  await page.keyboard.press("Control+Shift+R");
  await page.waitForSelector(".review-layer");
  await page.keyboard.press("ArrowLeft");
  await clickPoint(page, 6, 6);
  await page.waitForSelector(".var-bar");
  await page.click(".var-bar .link >> nth=0");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".review-layer", { state: "detached" });
  assert(page.errors.length === 0, page.errors.join("; "));
  await page.close();
});

await check("a classic opens in review within budget", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+4");
  await page.click(".tabs-row .segmented button >> nth=1");
  const t0 = Date.now();
  await page.click(".collection-row >> nth=0");
  await page.waitForSelector(".review-layer .chart");
  const ms = Date.now() - t0;
  assert(ms < BUDGET.reviewOpen, `review open ${ms} ms > ${BUDGET.reviewOpen}`);
  await page.close();
  return `${ms} ms`;
});

await check("a wrong answer shows the refutation, then resets for another try", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+3");
  await page.click(".topic-card >> nth=0");
  await page.click(".problem-card >> nth=0");
  const wrong = await page.evaluate(() => {
    const P = window.__state.practice.problem;
    const S = window.__solver;
    const correct = S.solveFirstMoves(P.pz).correct.map((m) => m.x + "," + m.y);
    const st = P.st;
    for (let y = 0; y < P.pz.size; y++)
      for (let x = 0; x < P.pz.size; x++) {
        if (st.board[y * P.pz.size + x] !== 0 || correct.includes(x + "," + y)) continue;
        const v = P.pz.view;
        if (v && (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1)) continue;
        if (S.play(P.pz, st, y * P.pz.size + x)) return { x, y };
      }
    return null;
  });
  assert(wrong, "no wrong move found");
  await clickPoint(page, wrong.x, wrong.y);
  await page.waitForSelector(".feedback.bad");
  await page.waitForFunction(() => window.__state.practice.problem.feedback === "retry", null, { timeout: 4000 });
  await page.close();
});

await check("history: back and forward across places", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+3");
  await page.keyboard.press("Control+4");
  const t0 = Date.now();
  await page.keyboard.press("Control+[");
  await page.waitForFunction(() => window.__state.space === "practice");
  const ms = Date.now() - t0;
  await page.keyboard.press("Control+]");
  await page.waitForFunction(() => window.__state.space === "library");
  assert(ms < BUDGET.placeSwitch, `place switch ${ms} ms > ${BUDGET.placeSwitch}`);
  await page.close();
  return `${ms} ms`;
});

await check("all four languages render every place without overflow or missing strings", async () => {
  for (const locale of ["zh-CN", "en-US", "ko-KR", "ja-JP"]) {
    const page = await fresh(locale);
    await onboard(page, 1);
    for (const k of ["1", "2", "3", "4"]) {
      await page.keyboard.press("Control+" + k);
      await page.waitForTimeout(50);
      const bad = await page.evaluate(() => {
        const text = document.body.innerText;
        const raw = text.match(/\b[a-z]+\.[a-zA-Z]+(\.[a-zA-Z]+)?\b/g)?.filter((s) => /^(nav|play|review|practice|library|settings|today|teach|summary|common|score|error|goal|grade|topic|mistakes|explain|time|newGame|menu)\./.test(s));
        const over = [...document.querySelectorAll(".btn, .rail-btn, .chip, .segmented button")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
        return { raw: raw || [], over };
      });
      assert(!bad.raw.length, `${locale}: raw keys ${bad.raw.join(", ")}`);
      assert(!bad.over.length, `${locale}: clipped ${bad.over.join(", ")}`);
    }
    assert(page.errors.length === 0, `${locale}: ${page.errors.join("; ")}`);
    await page.close();
  }
});

/* ------------------------------------------------------------ visuals */

for (const vp of [
  { width: 1200, height: 860, tag: "1200" },
  { width: 1440, height: 900, tag: "1440" },
  { width: 1920, height: 1080, tag: "1920" },
]) {
  await check(`visual: places at ${vp.tag}`, async () => {
    const page = await fresh("en-US", { width: vp.width, height: vp.height });
    await onboard(page, 1);
    // A fixed two-player position so the board is deterministic.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=0");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    for (const [x, y] of [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4]]) await clickPoint(page, x, y);
    const out = [];
    out.push(await snap(page, `play-${vp.tag}`));
    await page.keyboard.press("Control+1");
    out.push(await snap(page, `today-${vp.tag}`, [".today .page-head", ".daily-dots"]));
    await page.keyboard.press("Control+3");
    out.push(await snap(page, `practice-${vp.tag}`));
    await page.keyboard.press("Control+,");
    out.push(await snap(page, `settings-${vp.tag}`, [".about"]));
    await page.close();
    return out.join(", ");
  });
}

await browser.close();
server.close();
if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} UI checks passed.`);
