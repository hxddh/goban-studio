/**
 * The user path a packaged app is checked with from outside
 * (scripts/packaged-ui.mjs, Windows: Playwright over the WebView2's
 * DevTools port). The same steps run against the browser build in the
 * interface gate (scripts/ui-tests/shell-packaged.mjs), so a step that is
 * wrong about the page fails there first.
 *
 * Every step works only through what a person sees and does: clicks on
 * the sidebar, buttons and rows, the keyboard on the board, and text read
 * back from the page. Nothing reads the page's state (the packaged app
 * exposes none: app/debug.js). Each step returns a short description of
 * what it saw, and throws with what it waited for when the page does not
 * show it.
 *
 * The path: the first run (onboarding to Today); the language changed in
 * Settings → General (the sidebar follows each one; it ends in English, the
 * language the later steps read); a lesson and a problem opened from
 * Practice; a classic opened from the Library; the openings explorer; a new
 * two-player 9×9 game with two moves; its review. On macOS the self-test
 * walks the same path from inside the page (src/web/js/selftest-path.js).
 */

export const STEP_TIMEOUT_MS = 20000;
/** The language each sidebar is recognised by (shell.js "nav.today"). */
export const TODAY = { zh: "今天", ja: "今日", ko: "오늘", en: "Today" };
/** The languages chosen in turn; the last one is the one the later steps read. */
export const LANGUAGE_ORDER = ["zh", "ja", "ko", "en"];

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
const text = async (page, sel) => squash(await page.locator(sel).first().textContent({ timeout: STEP_TIMEOUT_MS }));

class StepError extends Error {}
function expect(cond, msg) {
  if (!cond) throw new StepError(msg);
}

/** Wait for `sel`, saying what it stands for when it does not come. */
async function see(page, sel, what, state = "visible") {
  try {
    // Places that were open keep their panels in the page, hidden: what is waited for is what is on screen.
    const loc = state === "visible" ? page.locator(sel).filter({ visible: true }) : page.locator(sel);
    await loc.first().waitFor({ state, timeout: STEP_TIMEOUT_MS });
  } catch {
    throw new StepError(`${what}: "${sel}" not ${state} after ${STEP_TIMEOUT_MS / 1000} s`);
  }
}

/** Wait until `fn(arg)` holds in the page, saying what it stands for when it does not. */
async function until(page, fn, arg, what) {
  try {
    await page.waitForFunction(fn, arg, { timeout: STEP_TIMEOUT_MS, polling: 100 });
  } catch {
    throw new StepError(`${what} (waited ${STEP_TIMEOUT_MS / 1000} s)`);
  }
}

/** One of the four places, by its sidebar button (Today, Play, Practice, Library). */
async function place(page, index, name) {
  await see(page, "nav .sb-list .sb-item", "the sidebar");
  await page.locator("nav .sb-list .sb-item").nth(index).click();
  await until(page, (i) => document.querySelectorAll("nav .sb-list .sb-item")[i]?.getAttribute("aria-current") === "page", index, `${name} is not the current place`);
}

/** Practice's home, with the placement quiz declined if it is offered. */
async function practiceHome(page) {
  await place(page, 2, "Practice");
  await see(page, ".practice-home", "Practice's home");
  const offer = page.locator(".placement-offer .link");
  if (await offer.count()) await offer.first().click();
  await see(page, ".catalog .topic-row", "Practice's catalog");
}

export const STEPS = [
  {
    name: "first run",
    async run(page) {
      await see(page, ".app", "the app shell");
      // A new profile opens on onboarding; one already set up on Today or where it was left.
      await page.waitForSelector(".ob-card, nav .sb-list", { timeout: STEP_TIMEOUT_MS });
      if (await page.locator(".ob-card").count()) {
        // "I know the rules": Today with a gentle 9×9 game offered, nothing started.
        await page.locator(".choice").nth(1).click();
        await see(page, ".page.today .hero .btn.primary", "Today after onboarding");
        await see(page, ".ob-card", "onboarding closed", "detached");
        return `onboarded; Today: ${(await text(page, ".today .hero")).slice(0, 50)}`;
      }
      return "already onboarded";
    },
  },
  {
    name: "language",
    async run(page) {
      await page.locator("nav .sb-foot .sb-item").last().click();
      await see(page, ".settings-sheet", "Settings");
      await page.locator(".settings-tab[data-pane=general]").click();
      await see(page, ".settings-pane[data-pane=general] .lang-grid", "Settings → General's languages");
      const seen = [];
      for (const id of LANGUAGE_ORDER) {
        await page.locator(`.lang-grid button[lang=${id}]`).click();
        await until(page, (w) => (document.querySelector("nav")?.textContent || "").includes(w), TODAY[id], `the sidebar does not say "${TODAY[id]}" after choosing ${id}`);
        expect((await page.locator(`.lang-grid button[lang=${id}]`).getAttribute("aria-checked")) === "true", `${id} is not marked as chosen`);
        expect(await page.evaluate((x) => document.documentElement.lang.startsWith(x), id), `the page's lang is not ${id}`);
        seen.push(id);
      }
      await page.keyboard.press("Escape");
      await see(page, ".settings-sheet", "Settings closed", "detached");
      return `sidebar followed ${seen.join(" → ")}`;
    },
  },
  {
    name: "lesson",
    async run(page) {
      await practiceHome(page);
      await see(page, ".catalog .lesson-row", "the course's lessons");
      const row = await text(page, ".catalog .lesson-row");
      await page.locator(".catalog .lesson-row").first().click();
      // The lesson's steps arrive from content/course.json.
      await see(page, ".panel .steps", "the lesson's steps");
      await until(page, () => (document.querySelector(".panel .lesson-text")?.textContent || "").trim().length > 0, null, "the lesson's first step has no text");
      const title = await text(page, ".panel-title h1");
      expect(title && row.includes(title), `the lesson opened is "${title}", the row said "${row}"`);
      const steps = await page.locator(".panel .steps").getAttribute("aria-valuenow");
      expect(steps === "1", `the lesson opened at step ${steps}, not 1`);
      return `"${title}", step 1: ${(await text(page, ".panel .lesson-text")).slice(0, 50)}`;
    },
  },
  {
    name: "problem",
    async run(page) {
      await practiceHome(page);
      const topic = await text(page, ".catalog .topic-row");
      await page.locator(".catalog .topic-row").first().click();
      await see(page, ".problem-card", "the topic's problems");
      await page.locator(".problem-card").first().click();
      // The problem's diagram arrives from content/problems.json.
      await see(page, ".stage canvas.board", "the problem's board");
      await until(page, () => (document.querySelector(".panel h1.goal")?.textContent || "").trim().length > 0, null, "the problem has no goal");
      const goal = await text(page, ".panel h1.goal");
      expect(/\bto play\b/.test(goal), `the goal reads "${goal}" (not an English goal)`);
      return `${topic.slice(0, 30)}: ${goal}`;
    },
  },
  {
    name: "classic",
    async run(page) {
      await place(page, 3, "Library");
      await see(page, ".home-classics .collection-row", "the Library's classics");
      const row = await text(page, ".home-classics .collection-row");
      await page.locator(".home-classics .collection-row").first().click();
      // The record arrives from content/classics.json; the review draws its chart.
      await see(page, ".review-layer canvas.board", "the classic's board");
      await see(page, ".review-layer .chart", "the classic's chart");
      const title = await text(page, ".toolbar h1");
      expect(title.length > 0, "the classic's review has no title");
      // The Library's button again closes the record.
      await page.locator("nav .sb-list .sb-item").nth(3).click();
      await see(page, ".review-layer", "the classic's review closed", "detached");
      return `${row.slice(0, 40)} → "${title}"`;
    },
  },
  {
    name: "explorer",
    async run(page) {
      await place(page, 3, "Library");
      await see(page, '.collection-row[data-explorer="whole"]', "the explorer's row in the Library");
      await page.locator('.collection-row[data-explorer="whole"]').click();
      // The book arrives from content/book.json.
      await see(page, ".explorer-panel", "the explorer");
      await until(page, () => document.querySelectorAll('.explorer-row[data-in-book="1"]').length > 0, null, "the explorer lists no book moves for the empty board");
      const rows = await page.locator(".explorer-row").count();
      await page.keyboard.press("Escape");
      await see(page, ".explorer-panel", "the explorer closed", "detached");
      return `${rows} candidate moves from the book`;
    },
  },
  {
    name: "game",
    async run(page) {
      await place(page, 1, "Play");
      await see(page, ".toolbar .tb-actions .btn", "Play's New game button");
      await page.locator(".toolbar .tb-actions .btn").first().click();
      await see(page, ".sheet .preset", "the New game sheet");
      await page.locator(".sheet .preset").nth(2).click(); // 9×9
      await page.locator(".sheet .segmented button").nth(1).click(); // two players: no engine in the way
      await page.locator(".sheet-foot .btn.primary").click();
      await see(page, ".sheet", "the New game sheet closed", "detached");
      await until(page, () => (document.querySelector(".toolbar .tb-sub")?.textContent || "").includes("9 × 9"), null, "the game is not 9 × 9");
      await see(page, ".stage canvas.board", "the game's board");
      // Played as a keyboard user plays: focus the board, move, Enter.
      await page.locator(".stage canvas.board").focus();
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await until(page, () => /\b1 move\b/.test(document.querySelector(".toolbar .tb-sub")?.textContent || ""), null, 'the game does not say "1 move" after a move');
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await until(page, () => /\b2 moves\b/.test(document.querySelector(".toolbar .tb-sub")?.textContent || ""), null, 'the game does not say "2 moves" after a second move');
      return await text(page, ".toolbar .tb-sub");
    },
  },
  {
    name: "review",
    async run(page) {
      await see(page, ".panel .actions [aria-haspopup=menu]", "the game's More menu");
      await page.locator(".panel .actions [aria-haspopup=menu]").filter({ visible: true }).first().click();
      const item = page.locator("[role^=menuitem]", { hasText: "Review so far" });
      await see(page, '[role^=menuitem]:has-text("Review so far")', "Review so far in the More menu");
      await item.first().click();
      await see(page, ".review-layer canvas.board", "the game's review");
      const panel = await text(page, ".review-layer .panel");
      expect(panel.length > 0, "the review's panel is empty");
      await page.keyboard.press("Escape");
      await see(page, ".review-layer", "the review closed", "detached");
      return panel.slice(0, 60);
    },
  },
];

/**
 * Run the steps on `page` in order and stop at the first failure (each
 * step starts from where the one before left the app). `log(line)` gets a
 * line per step. Returns `{ ok, steps: [{ name, ok, ms, shown?, error? }],
 * failed? }`.
 */
export async function runSteps(page, { steps = STEPS, log = () => {} } = {}) {
  const out = [];
  for (const step of steps) {
    const t0 = Date.now();
    try {
      const shown = await step.run(page);
      out.push({ name: step.name, ok: true, ms: Date.now() - t0, shown });
      log(`ok - ${step.name} (${Date.now() - t0} ms): ${shown}`);
    } catch (e) {
      const error = e instanceof StepError ? e.message : String(e?.message || e).split("\n")[0];
      out.push({ name: step.name, ok: false, ms: Date.now() - t0, error });
      log(`not ok - ${step.name}: ${error}`);
      return { ok: false, steps: out, failed: step.name };
    }
  }
  return { ok: true, steps: out };
}
