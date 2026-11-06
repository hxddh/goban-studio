/**
 * Shell cross checks: every page of both spaces combined with what applies
 * to all of them — the accessibility audit, all four languages, larger
 * text and dark mode — so one feature cannot quietly break another (the
 * problem window and the screen-reader keys were such a pair).
 *
 * For each combination it visits Play's home, Learn's home (the path and
 * the catalog), a problem, the history of games, the explorer (both
 * modes), a classic in review (every tab), a finished game's post-game
 * review (every tab), and every Settings pane, and checks: the audit, no raw string keys on screen, no
 * clipped buttons, no horizontal page overflow, at most one primary
 * button, no page errors.
 */
import { MESSAGES } from "../../src/web/js/messages.js";

const KEYS = Object.keys(MESSAGES);

export default async function ({ check, assert, fresh, onboard, clickPoint, audit }) {
  const combos = [
    { locale: "zh-CN", scheme: "dark", large: true },
    { locale: "en-US", scheme: "light", large: false },
    { locale: "ko-KR", scheme: "light", large: true },
    { locale: "ja-JP", scheme: "dark", large: false },
  ];

  async function inspect(page, where) {
    await page.waitForTimeout(60);
    await audit(page, where);
    const bad = await page.evaluate((keys) => {
      const text = document.body.innerText;
      const set = new Set(keys);
      const raw = [...new Set(text.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
      const clipped = [...document.querySelectorAll(".btn, .sb-item, .chip, .segmented button, .settings-tab")]
        .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim());
      const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      // Inside a sheet only the sheet counts; otherwise the page.
      const scope = document.querySelector(".sheet") || document;
      const primaries = [...scope.querySelectorAll(".btn.primary")].filter(visible).length;
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { raw, clipped, primaries, overflow };
    }, KEYS);
    assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
    assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
    assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
    assert(!bad.overflow, `${where}: the page scrolls sideways`);
  }

  for (const c of combos) {
    await check(`shell cross: both spaces with audit, ${c.locale}, ${c.scheme}${c.large ? ", larger text" : ""}`, async () => {
      const page = await fresh(c.locale);
      await page.emulateMedia({ colorScheme: c.scheme });
      await onboard(page, 1);
      if (c.large) await page.keyboard.press("Control+Equal");

      await inspect(page, "the board");
      await page.keyboard.press("Control+1");
      await inspect(page, "Play's home");
      await page.keyboard.press("Control+2");
      await page.waitForSelector(".learn-path");
      await inspect(page, "Learn's home");
      await page.click(".topic-card >> nth=0");
      await page.click(".problem-card >> nth=0");
      await page.waitForFunction(() => window.__state.learn.view === "problem");
      await inspect(page, "problem");

      // Play's home, the explorer in both modes, a classic in review.
      await page.keyboard.press("Control+1");
      await inspect(page, "Play's home again");
      await page.waitForSelector(".collection-row[data-explorer]");
      await page.click('.collection-row[data-explorer="whole"]');
      await page.waitForSelector(".explorer-panel");
      await inspect(page, "explorer (whole board)");
      await page.click(".explorer-panel .segmented button >> nth=1");
      await page.waitForFunction(() => window.__state.explorer?.mode === "corner");
      await inspect(page, "explorer (corner)");
      await page.keyboard.press("Escape");
      await page.click(".collection-row >> nth=0");
      await page.waitForSelector(".review-layer .chart");
      const rtabs = await page.locator(".review-tabs button").count();
      for (let i = 0; i < rtabs; i++) {
        await page.click(`.review-tabs button >> nth=${i}`);
        await inspect(page, `review tab ${i + 1}`);
      }
      await page.keyboard.press("Escape");

      // A finished two-player game: its board turns into its review.
      await page.keyboard.press("Control+n");
      await page.click(".preset >> nth=2");
      await page.click(".sheet .segmented button >> nth=1");
      await page.click(".sheet-foot .btn.primary");
      await page.waitForFunction(() => window.__board?.model.size === 9 && window.__board.geom?.cell > 30);
      const pts = [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4], [4, 2], [2, 4], [6, 4]];
      for (let i = 0; i < pts.length; i++) {
        await clickPoint(page, ...pts[i]);
        await page.waitForFunction((n) => window.__state.game?.game.moveNumber === n, i + 1, { timeout: 3000 });
      }
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press("Control+Shift+P");
        await page.click(".sheet-foot .btn.primary");
      }
      await page.waitForSelector(".score-card");
      await page.click(".score-card .btn.primary");
      await page.waitForSelector(".review-layer .review-result");
      await page.waitForFunction(() => !window.__state.review.analyzing, null, { timeout: 15000 });
      const ptabs = await page.locator(".review-tabs button").count();
      for (let i = 0; i < ptabs; i++) {
        await page.click(`.review-tabs button >> nth=${i}`);
        await inspect(page, `post-game review tab ${i + 1}`);
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector(".play-home .game-row");
      await page.click(".play-home .menu-wrap > button >> nth=0");
      await inspect(page, "history row menu");
      await page.keyboard.press("Escape");

      // Every Settings pane.
      await page.keyboard.press("Control+,");
      await page.waitForSelector(".settings-tab");
      const panes = await page.locator(".settings-tab").count();
      for (let i = 0; i < panes; i++) {
        await page.click(`.settings-tab >> nth=${i}`);
        await inspect(page, `settings pane ${i + 1}`);
      }
      await page.keyboard.press("Escape");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });
  }
}
