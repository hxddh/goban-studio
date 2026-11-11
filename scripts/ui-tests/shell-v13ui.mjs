/**
 * Shell, v13 interface layer in the browser: the screens and rows v13
 * added pass the accessibility audit (now 4.5:1 for small text) in four
 * languages, light and dark — Play's home for a new player (the suggested
 * game, no blank board), Settings' confirm-move switches and its Undo
 * restore row, the safe-state screen, the computer's Retry and the
 * "turned" note of a problem seen again — with no raw keys and no ASCII
 * colon in CJK labels. And a menu closed at once leaves no listener
 * behind. Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { MESSAGES } from "../../src/web/js/messages.js";

const KEYS = Object.keys(MESSAGES);
const LOCALES = [
  ["zh-CN", "dark"],
  ["en-US", "light"],
  ["ko-KR", "light"],
  ["ja-JP", "dark"],
];

export default async function ({ check, assert, fresh, onboard, audit, origin }) {
  async function inspect(page, where) {
    await page.waitForTimeout(80);
    await audit(page, where);
    const raw = await page.evaluate((keys) => {
      const set = new Set(keys);
      return [...new Set(document.body.innerText.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
    }, KEYS);
    assert(!raw.length, `${where}: raw keys ${raw.join(", ")}`);
  }

  for (const [locale, scheme] of LOCALES) {
    const cjk = !locale.startsWith("en") && !locale.startsWith("ko");
    await check(`v13 ui: Play's home, Settings' new rows, Retry and the turned problem in ${locale}, ${scheme} — audit`, async () => {
      const page = await fresh(locale);
      await page.emulateMedia({ colorScheme: scheme });
      // A new player: Today opens; Play has no game, so it shows its home with the suggested game.
      await page.goto(origin + "/");
      await page.waitForSelector(".ob-card");
      await page.click(".ob-card .btn.primary");
      await page.click(".choice >> nth=0");
      await page.waitForSelector('.page.today [data-hero="first-lesson"]');
      await page.keyboard.press("Control+2");
      await page.waitForSelector(".play-home .hero");
      assert((await page.locator("canvas.board").count()) === 0, "no blank board in Play");
      assert(await page.evaluate(() => window.__state.game === null), "no game made up");
      await inspect(page, `${locale} Play's home`);
      // Settings: the confirm-move switches (Board) and the Undo restore row (Data, with a snapshot there).
      await page.evaluate(() => localStorage.setItem(`goban9:backups/pre-restore-${Date.now() - 60000}/settings.json`, "{}"));
      await page.reload();
      await page.waitForFunction(() => window.__state?.ready);
      await page.keyboard.press("Control+,");
      await page.click('[data-pane="board"]');
      await inspect(page, `${locale} Settings, Board`);
      await page.click('[data-pane="data"]');
      await page.waitForSelector("[data-undo-restore]");
      await inspect(page, `${locale} Settings, Data with Undo restore`);
      await page.click('[data-pane="about"]');
      if (cjk) assert(!(await page.textContent(".settings-sheet")).match(/[　-鿿]: /), "a CJK label takes a full-width colon");
      await page.keyboard.press("Escape");
      // The computer could not move: the panel says so and offers Retry.
      await page.keyboard.press("Control+n");
      await page.click(".preset >> nth=2");
      await page.click(".sheet-foot .btn.primary");
      await page.waitForFunction(() => window.__board?.model.size === 9);
      await page.evaluate(() => {
        const g = window.__state.game;
        g.humanColor = -1; // the computer (Black) to play
        g.thinking = false;
        g.engineFailed = true;
      });
      await page.keyboard.press("Control+,");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".panel .actions .btn.primary");
      await inspect(page, `${locale} the computer's Retry`);
      // A problem seen before comes back turned, and says so.
      await page.evaluate(() => {
        const p = window.__state.profile;
        p.problems = { ...(p.problems || {}) };
      });
      await page.keyboard.press("Control+3");
      await page.click(".topic-row >> nth=0");
      await page.click(".problem-card >> nth=0");
      await page.waitForFunction(() => window.__state.learn.view === "problem");
      const id = await page.evaluate(() => window.__state.learn.problem.def.id);
      await page.evaluate((pid) => {
        window.__state.profile.problems[pid] = { ...(window.__state.profile.problems[pid] || {}), tries: 3, solved: true };
      }, id);
      await page.keyboard.press("Control+3");
      await page.click(".topic-row >> nth=0");
      await page.click(".problem-card >> nth=0");
      await page.waitForFunction(() => window.__state.learn.view === "problem");
      await inspect(page, `${locale} a problem seen again`);
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });

    await check(`v13 ui: the safe-state screen in ${locale}, ${scheme} — audit`, async () => {
      const page = await fresh(locale);
      await page.emulateMedia({ colorScheme: scheme });
      await page.context().addInitScript(() => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("goban9:settings.json", "{ BROKEN");
        localStorage.setItem("goban9:profile.json", JSON.stringify({ v: 9 }));
      });
      await page.goto(origin + "/");
      await page.waitForSelector(".safe-screen");
      await audit(page, `${locale} safe state`);
      await page.click("[data-safe=readonly]");
      await page.waitForSelector(".safe-banner");
      await inspect(page, `${locale} read-only banner`);
      await page.close();
    });
  }

  await check("v13 ui: a menu opened and closed at once leaves no outside-click listener behind", async () => {
    const page = await fresh();
    await page.context().addInitScript(() => {
      let n = 0;
      const add = Document.prototype.addEventListener;
      const remove = Document.prototype.removeEventListener;
      Document.prototype.addEventListener = function (type, fn, opts) {
        if (type === "pointerdown") n++;
        return add.call(this, type, fn, opts);
      };
      Document.prototype.removeEventListener = function (type, fn, opts) {
        if (type === "pointerdown") n--;
        return remove.call(this, type, fn, opts);
      };
      window.__pointerListeners = () => n;
    });
    await onboard(page, 1);
    await page.waitForSelector(".panel .menu-wrap .icon-btn");
    const before = await page.evaluate(() => window.__pointerListeners());
    for (let i = 0; i < 5; i++) {
      // Open and close within the same task: the effect's cleanup runs before any timer could.
      await page.evaluate(() => {
        const btn = document.querySelector(".panel .menu-wrap .icon-btn");
        btn.click();
      });
      await page.waitForSelector(".menu");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".menu", { state: "detached" });
    }
    // Open, and close by a click outside before anything else runs.
    await page.evaluate(() => {
      document.querySelector(".panel .menu-wrap .icon-btn").click();
    });
    await page.waitForSelector(".menu");
    await page.click(".tb-title", { position: { x: 2, y: 2 } });
    await page.waitForSelector(".menu", { state: "detached" });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__pointerListeners());
    assert(after === before, `pointerdown listeners: ${before} before, ${after} after`);
    await page.close();
  });
}
