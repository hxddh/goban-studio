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

// v4 uses system fonts, which differ between machines. Visual baselines are
// taken with one pinned font (Inter, tests/fonts, never shipped) so they
// compare the layout rather than the font installed on the runner.
const PINNED_FONT = fs.readFileSync(path.join(root, "tests/fonts/inter-latin-wght-normal.woff2")).toString("base64");
const PIN_CSS = `@font-face{font-family:"Pinned";font-weight:100 900;src:url(data:font/woff2;base64,${PINNED_FONT}) format("woff2")}:root,:root:lang(zh),:root:lang(ja),:root:lang(ko){--font:"Pinned",sans-serif !important}`;

async function fresh(locale = "en-US", viewport = { width: 1200, height: 860 }, { pinFont = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale, reducedMotion: "reduce", deviceScaleFactor: 1, bypassCSP: pinFont });
  if (pinFont) {
    await ctx.addInitScript((css) => {
      const add = () => {
        const st = document.createElement("style");
        st.textContent = css;
        document.head.appendChild(st);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    }, PIN_CSS);
  }
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
  await page.click(".preset >> nth=2");
  await page.click(".sheet .segmented button >> nth=1");
  await page.click(".sheet-foot .btn.primary");
  // Type once the new 9×9 board is on screen, as a person would.
  await page.waitForFunction(() => window.__board?.model.size === 9);
  await page.focus("canvas.board");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const moves = await page.evaluate(() => window.__state.game.game.moveNumber);
  if (moves !== 2) {
    const why = await page.evaluate(() => ({
      size: window.__board.model.size,
      cursor: window.__board.model.cursor,
      interactive: window.__board.model.interactive,
      focus: document.activeElement?.tagName + "." + document.activeElement?.className,
      toasts: window.__state.toasts.map((x) => x.message),
      moves: window.__state.game.game.mainLine().slice(1).map((n) => n.move && [n.move.x, n.move.y]),
    }));
    throw new Error(`expected 2 moves, got ${moves}: ${JSON.stringify(why)}`);
  }
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
  await page.click(".preset >> nth=0");
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
  await page.click(".preset >> nth=2");
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

await check("history: Back from a shape problem returns to its collection", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+3");
  await page.click(".shape-chips .chip >> nth=0");
  await page.waitForSelector(".problem-card");
  const before = await page.locator(".problem-card").count();
  await page.click(".problem-card >> nth=0");
  await page.waitForFunction(() => window.__state.practice.view === "problem");
  await page.keyboard.press("Control+[");
  await page.waitForFunction(() => window.__state.practice.view === "topic");
  const after = await page.locator(".problem-card").count();
  const shape = await page.evaluate(() => window.__state.practice.shape);
  assert(shape && after === before && after > 0, `collection lost on Back: shape=${shape}, ${after} of ${before} problems`);
  await page.close();
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
        const over = [...document.querySelectorAll(".btn, .sb-item, .chip, .segmented button")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
        // docs/design.md §1: one primary action per screen.
        const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        const primaries = [...document.querySelectorAll(".btn.primary")].filter(visible).length;
        return { raw: raw || [], over, primaries };
      });
      assert(bad.primaries <= 1, `${locale} place ${k}: ${bad.primaries} primary buttons`);
      assert(!bad.raw.length, `${locale}: raw keys ${bad.raw.join(", ")}`);
      assert(!bad.over.length, `${locale}: clipped ${bad.over.join(", ")}`);
    }
    assert(page.errors.length === 0, `${locale}: ${page.errors.join("; ")}`);
    await page.close();
  }
});

await check("v6 explorer: opens from the Library, a book move shows candidates, out of the book is said", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+4");
  await page.click(".tabs-row .segmented button >> nth=-1");
  await page.click('.collection-row[data-explorer="whole"]');
  await page.waitForSelector(".explorer-panel");
  // v8: onboarding plays on 9×9 now; wait for the explorer's own 19×19 board.
  await page.waitForFunction(() => window.__board?.model.size === 19 && window.__board.geom?.cell > 0);
  const start = await page.locator(".explorer-row").count();
  assert(start > 0, "no candidates on the empty board");
  // The star point (Q16) is a book move: its continuations are listed and
  // marked on the board in the accent.
  await clickPoint(page, 15, 3);
  await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 1);
  const after = await page.evaluate(() => ({
    rows: document.querySelectorAll(".explorer-row").length,
    inBook: document.querySelectorAll('.explorer-row[data-in-book="1"]').length,
    marks: window.__board.model.marks.filter((m) => m.type === "book").length,
    text: document.querySelector(".explorer-panel").innerText,
  }));
  assert(after.rows > 0 && after.inBook > 0, `no book continuations after Q16: ${JSON.stringify(after)}`);
  assert(after.marks > 0, "no candidate marks on the board");
  assert(after.text.includes("In the book"), "the panel does not say the position is in the book");
  // A first-line move is out of the book; the preview has no KataGo.
  await clickPoint(page, 0, 0);
  await page.waitForFunction(() => document.querySelector(".explorer-panel").innerText.includes("Out of the book"));
  assert((await page.textContent(".explorer-panel")).includes("desktop app"), "the preview does not explain the missing analysis");
  // Back through the line, then the corner tree.
  await page.click(".explorer-layer .review-nav .icon-btn >> nth=1");
  await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 1);
  await page.click(".explorer-panel .segmented button >> nth=1");
  await page.waitForFunction(() => window.__state.explorer?.mode === "corner");
  await clickPoint(page, 15, 3);
  await page.waitForFunction(() => document.querySelectorAll('.explorer-row[data-in-book="1"]').length > 0);
  const primaries = await page.evaluate(() => [...document.querySelectorAll(".btn.primary")].filter((el) => el.offsetParent !== null).length);
  assert(primaries === 1, `${primaries} primary buttons`);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".explorer-panel", { state: "detached" });
  assert(page.errors.length === 0, page.errors.join("; "));
  await page.close();
});

/* --------------------------------------------------------- v6 a11y */

// The in-page audit (scripts/a11y-audit.js): names, ids, references,
// pointer-only controls, unnamed images, landmarks, contrast.
const AUDIT = fs.readFileSync(path.join(root, "scripts/a11y-audit.js"), "utf8");
async function audit(page, where) {
  const found = await page.evaluate(`(${AUDIT})()`);
  assert(!found.length, `${where}: ${found.map((f) => `${f.kind} ${f.el}`).join("; ")}`);
}
/** Keep every announcement the app's live region makes (window.__heard). */
async function listen(page) {
  await page.evaluate(() => {
    window.__heard = [];
    const el = document.querySelector(".app > [aria-live]:not(.toasts)");
    new MutationObserver(() => el.textContent && window.__heard.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
}
/** What the app's live region and the board's own live region say. */
async function spoken(page) {
  await page.waitForTimeout(50);
  return page.evaluate(() => ({
    app: document.querySelector(".app > [aria-live]:not(.toasts)")?.textContent || "",
    board: (document.querySelector(".board-frame [aria-live]")?.textContent || "").replace(/\u200b/g, ""),
  }));
}
/** Wait (up to 2 s) until a live region says what `ok` wants; fail with what it said. */
async function hear(page, region, ok, what) {
  let last = "";
  for (let i = 0; i < 40; i++) {
    last = (await spoken(page))[region];
    if (typeof ok === "string" ? last === ok : ok(last)) return last;
  }
  throw new Error(`${what}: heard "${last}"`);
}
/** Focus the board on screen once the page has registered it (a new view registers after its first paint). */
async function focusBoard(page) {
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas.board");
    return !!(c && window.__board && window.__board.canvas === c && window.__board.geom);
  });
  await page.focus("canvas.board");
}
async function newTwoPlayer9(page) {
  await page.keyboard.press("Control+n");
  await page.click(".preset >> nth=2");
  await page.click(".sheet .segmented button >> nth=1");
  await page.click(".sheet-foot .btn.primary");
  await page.waitForFunction(() => window.__board?.model.size === 9);
}

for (const [locale, scheme] of [["en-US", "light"], ["ja-JP", "dark"]]) {
  await check(`v6 a11y: every place passes the audit (${locale}, ${scheme})`, async () => {
    const page = await fresh(locale);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(origin + "/");
    await page.waitForSelector(".ob-card");
    await audit(page, "onboarding");
    await page.click(".ob-card .btn.primary");
    await page.click(".choice >> nth=1");
    await page.waitForSelector("canvas.board, .page");
    const names = ["today", "play", "practice", "library"];
    for (const k of ["1", "2", "3", "4"]) {
      await page.keyboard.press("Control+" + k);
      await page.waitForTimeout(60);
      await audit(page, names[Number(k) - 1]);
    }
    for (const [keys, what] of [["Control+n", "new game"], ["Control+,", "settings"], ["Control+/", "shortcuts"]]) {
      await page.keyboard.press(keys);
      await page.waitForSelector(".sheet");
      await audit(page, what);
      await page.keyboard.press("Escape");
      await page.waitForSelector(".sheet", { state: "detached" });
    }
    // A saved game in the library, with its row menu open.
    await newTwoPlayer9(page);
    for (const [x, y] of [[2, 2], [6, 6]]) await clickPoint(page, x, y);
    await page.keyboard.press("Control+s");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-row");
    await audit(page, "library with a game");
    await page.click(".game-item .icon-btn");
    await audit(page, "library row menu");
    await page.keyboard.press("Escape");
    await page.click(".tabs-row .segmented button >> nth=1");
    await page.click(".collection-row >> nth=0");
    await page.waitForSelector(".review-layer .chart");
    await audit(page, "review");
    await page.keyboard.press("Control+3");
    await page.click(".lesson-row >> nth=0");
    await page.waitForSelector(".steps");
    await audit(page, "lesson");
    await page.keyboard.press("Control+3");
    await page.click(".topic-card >> nth=0");
    await audit(page, "topic");
    await page.click(".problem-card >> nth=0");
    await audit(page, "problem");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}

await check("v6 a11y: every Tab stop shows a focus ring (§10)", async () => {
  const page = await fresh();
  await onboard(page, 1);
  const missing = [];
  const stops = async (where) => {
    await page.evaluate(() => document.querySelector(".sb-item")?.focus());
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
        return { id: `${el.tagName}.${el.className} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24)}`, ring };
      });
      if (!r || seen.has(r.id)) break;
      seen.add(r.id);
      if (!r.ring) missing.push(`${where}: ${r.id}`);
    }
    return seen.size;
  };
  let total = 0;
  for (const k of ["1", "2", "3", "4"]) {
    await page.keyboard.press("Control+" + k);
    await page.waitForTimeout(60);
    total += await stops("place " + k);
  }
  await page.keyboard.press("Control+4");
  await page.click(".tabs-row .segmented button >> nth=1");
  await page.click(".collection-row >> nth=0");
  await page.waitForSelector(".review-layer .chart");
  total += await stops("review");
  assert(!missing.length, missing.join("; "));
  await page.close();
  return `${total} stops`;
});

for (const locale of ["en-US", "zh-CN"]) {
  await check(`v6 a11y: the board speaks — moves, points, last move, turn, rows (${locale})`, async () => {
    const page = await fresh(locale);
    await onboard(page, 1);
    const L = await page.evaluate(() => window.__state.settings.lang);
    const want = {
      en: { b: "Black E6", w: "White D6", point: "E6, black, 3 liberties", last: "Last move: White D6", turn: "Black to play", row: "Row 6: black E; white D", undo: "Move taken back" },
      zh: { b: "黑 E6", w: "白 D6", point: "E6，黑子，3 口气", last: "最后一手：白 D6", turn: "轮到黑下", row: "第 6 行：黑子 E；白子 D", undo: "已悔棋" },
    }[L];
    await newTwoPlayer9(page);
    await focusBoard(page);
    await page.keyboard.press("ArrowUp");
    await hear(page, "board", (s) => s.startsWith("E6"), "the cursor point");
    await page.keyboard.press("Enter");
    await hear(page, "app", want.b, "placed stone");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await hear(page, "app", want.w, "second stone");
    const keys = [["ArrowRight", null], ["i", want.point], ["m", want.last], ["t", want.turn], ["r", want.row]];
    for (const [key, text] of keys) {
      await page.keyboard.press(key);
      if (text) await hear(page, "board", text, `key ${key}`);
    }
    await page.keyboard.press("b");
    await hear(page, "board", (s) => s.includes(want.row), "the board summary");
    await page.keyboard.press("Control+z");
    await hear(page, "app", (s) => s.startsWith(want.undo), "undo");
    // Review: stepping through the moves speaks each one.
    await page.keyboard.press("Enter"); // White D6 again (M left the cursor there)
    await hear(page, "app", want.w, "replayed stone");
    await page.keyboard.press("Control+Shift+R");
    await page.waitForSelector(".review-layer");
    await focusBoard(page);
    await page.keyboard.press(",");
    await hear(page, "app", (s) => s.includes(want.b), "review: back a move");
    await page.keyboard.press(".");
    await hear(page, "app", (s) => s.includes(want.w), "review: forward a move");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}

await check("v6 a11y: problems say the goal, the reply and the verdict; lessons read their step", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+3");
  await page.click(".topic-card >> nth=0");
  await page.click(".problem-card >> nth=0");
  const goal = await page.evaluate(() => document.querySelector(".goal").textContent.trim());
  await hear(page, "app", (s) => s.includes(goal), "the problem's goal");
  await focusBoard(page);
  await page.keyboard.press("t");
  await hear(page, "board", goal, "T");
  const right = await page.evaluate(() => {
    const P = window.__state.practice.problem;
    return window.__solver.solveFirstMoves(P.pz).correct[0];
  });
  await listen(page);
  await clickPoint(page, right.x, right.y);
  await page.waitForFunction(() => window.__state.practice.problem.status !== "open" || window.__state.practice.problem.feedback === "keep", null, { timeout: 4000 });
  await page.waitForTimeout(150);
  const heard = await page.evaluate(() => window.__heard);
  const verdict = await page.evaluate(() => document.querySelector(".feedback")?.textContent.trim());
  assert(/^Black [A-T]\d+/.test(heard[0] || ""), `the move was not spoken: ${heard.join(" | ")}`);
  assert(heard.some((h) => h.includes(verdict)), `the verdict "${verdict}" was not spoken: ${heard.join(" | ")}`);
  await page.keyboard.press("Control+3");
  await page.click(".lesson-row >> nth=0");
  await page.waitForSelector(".steps");
  await hear(page, "app", (s) => s.includes("Step 1 of"), "the lesson step");
  await page.close();
});

await check("v6 a11y: radio groups take arrow keys, menus give focus back on Esc", async () => {
  const page = await fresh();
  await onboard(page, 1);
  await page.keyboard.press("Control+4");
  await page.focus(".tabs-row .segmented button[aria-checked=true]");
  await page.keyboard.press("ArrowRight");
  assert((await page.evaluate(() => window.__state.library.tab)) === "classics", "→ did not choose the next segment");
  assert(await page.evaluate(() => document.activeElement.getAttribute("aria-checked") === "true"), "focus did not follow the choice");
  await page.keyboard.press("Control+2");
  await page.focus(".panel .menu-wrap .icon-btn");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".menu [role=menuitem]");
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem", null, { timeout: 2000 }); // the menu takes focus
  await page.keyboard.press("Escape");
  await page.waitForSelector(".menu", { state: "detached" });
  await page.waitForFunction(() => document.activeElement?.matches(".menu-wrap .icon-btn"), null, { timeout: 2000 }); // Esc gives it back to the button
  // Larger text: one step up the type scale, and back.
  const body = (px) => page.waitForFunction((px) => getComputedStyle(document.body).fontSize === px, px, { timeout: 2000 });
  await body("13px");
  await page.keyboard.press("Control+Equal");
  await body("15px");
  await page.keyboard.press("Control+Minus");
  await body("13px");
  await page.close();
});

/* ------------------------------------------------------- v7 area checks */
// Each v7 area keeps its browser checks in scripts/ui-tests/*.mjs.
for (const f of fs.readdirSync(path.join(root, "scripts/ui-tests")).filter((n) => n.endsWith(".mjs")).sort()) {
  const mod = await import("./ui-tests/" + f);
  await mod.default({ check, assert, fresh, onboard, clickPoint, pointOf, origin, browser, audit });
}

/* ------------------------------------------------------------ visuals */

for (const vp of [
  { width: 1200, height: 860, tag: "1200" },
  { width: 1440, height: 900, tag: "1440" },
  { width: 1920, height: 1080, tag: "1920" },
]) {
  await check(`visual: places at ${vp.tag}`, async () => {
    const page = await fresh("en-US", { width: vp.width, height: vp.height }, { pinFont: true });
    await page.evaluate(() => document.fonts.ready);
    await onboard(page, 1);
    // A fixed two-player position so the board is deterministic.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    // The canvas is reused across games: wait until it shows the new 9×9
    // board, or the clicks are placed with the previous board's geometry.
    await page.waitForFunction(() => window.__board?.model.size === 9 && window.__board.geom?.cell > 40);
    const pts = [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4]];
    for (let i = 0; i < pts.length; i++) {
      await clickPoint(page, ...pts[i]);
      await page.waitForFunction((n) => window.__state.game?.game.moveNumber === n, i + 1, { timeout: 3000 });
    }
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
