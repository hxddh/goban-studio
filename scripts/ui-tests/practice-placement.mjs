/**
 * Practice: the placement quiz in the browser (practice/placement.js) —
 * someone who knows the rules finds it on Practice's home before the path,
 * with one primary and a quiet Not now; the quiz shows where it is (
 * 10–12 problems, ending early once the grade is stable); at the end the
 * path appears and the offer is gone. The offer and a quiz problem
 * are checked in four languages, light and dark, with larger text: the
 * accessibility audit, raw keys, clipping, sideways scrolling and one
 * primary. Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { MESSAGES } from "../../src/web/js/messages.js";

const KEYS = Object.keys(MESSAGES);

export default async function ({ check, assert, fresh, onboard, audit }) {
  async function inspect(page, where) {
    await page.waitForTimeout(60);
    await audit(page, where);
    const bad = await page.evaluate((keys) => {
      const set = new Set(keys);
      const raw = [...new Set(document.body.innerText.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
      const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      const clipped = [...document.querySelectorAll(".btn, .link, .tb-title h1, .placement-offer h2")].filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      const primaries = [...document.querySelectorAll(".btn.primary")].filter(visible).length;
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { raw, clipped, primaries, overflow };
    }, KEYS);
    assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
    assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
    assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
    assert(!bad.overflow, `${where}: the page scrolls sideways`);
  }

  /** Someone who knows the rules (onboarding's second answer), on Practice's home. */
  async function knowsRules(locale = "en-US", scheme = "light") {
    const page = await fresh(locale);
    await page.emulateMedia({ colorScheme: scheme });
    await onboard(page, 1, { placement: true });
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".placement-offer");
    return page;
  }

  await check("practice placement: offered before the path with one primary; four misses end it at grade 1; then the path, and no offer", async () => {
    const page = await knowsRules();
    assert((await page.locator(".practice-path").count()) === 0, "no path before the placement");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary");
    assert((await page.textContent(".placement-offer")).includes("10–12 problems"), "says how long");
    await page.click(".placement-offer .btn.primary");
    let asked = 0;
    for (let i = 1; i <= 12; i++) {
      await page.waitForFunction((n) => (window.__state.practice.view === "problem" && window.__state.practice.placement?.results.length === n - 1) || !window.__state.practice.placement, i, { timeout: 4000 });
      if (!(await page.evaluate(() => !!window.__state.practice.placement))) break;
      asked = i;
      const sub = await page.textContent(".toolbar .tb-sub, .tb-sub");
      assert(sub.includes(`${i} of ${i > 10 ? 12 : 10}`), `where it is: ${sub}`);
      // The quiz asks for the answer, so it does not show the problem's name: only its goal.
      const shown = await page.evaluate(() => ({ name: window.__state.practice.problem.def.title.en, title: document.querySelector(".tb-title h1").innerText.trim(), h1: document.querySelector(".panel h1").innerText.trim() }));
      assert(shown.title === "Problem" && shown.h1.includes("to play") && shown.h1 !== shown.name, `a quiz problem named: ${JSON.stringify(shown)}`);
      // Show the answer (a miss), then Continue.
      await page.click('.panel .actions .btn:has-text("Show answer")');
      await page.click(".panel .actions .btn.primary");
    }
    // Every answer missed: after the first four the quiz stops there, at grade 1.
    assert(asked === 4, `${asked} problems`);
    await page.waitForSelector(".practice-path .path-row");
    assert((await page.locator(".placement-offer").count()) === 0, "the offer is gone");
    const placed = await page.evaluate(() => window.__state.profile.placement);
    assert(placed?.grade === 1, JSON.stringify(placed));
    // The result is a difficulty with the ranks it is meant for, never a class of player.
    const said = await page.evaluate(() => window.__state.toasts.map((x) => x.message).join(" | "));
    assert(said.includes("Done. You start at Level 1 (≈ 30–19 kyu)."), `the result: ${said}`);
    assert(!/Beginner|Advanced|Challenge/.test(said), said);
    await page.close();
  });

  await check("practice placement: Not now shows the path and is remembered after a reload", async () => {
    const page = await knowsRules();
    await page.click(".placement-offer .link");
    await page.waitForSelector(".practice-path .path-row");
    await page.waitForTimeout(500); // the store writes a moment later
    await page.reload();
    await page.waitForFunction(() => window.__state?.ready);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-row");
    assert((await page.locator(".placement-offer").count()) === 0, "not offered again");
    await page.close();
  });

  for (const [locale, scheme, large] of [["zh-CN", "dark", true], ["en-US", "light", false], ["ko-KR", "light", true], ["ja-JP", "dark", false]]) {
    await check(`practice placement: the offer and a quiz problem in ${locale}, ${scheme}${large ? ", larger text" : ""} — audit, no clipping`, async () => {
      const page = await knowsRules(locale, scheme);
      if (large) await page.keyboard.press("Control+=");
      await inspect(page, `${locale} offer`);
      await page.click(".placement-offer .btn.primary");
      await page.waitForFunction(() => window.__state.practice.view === "problem");
      await inspect(page, `${locale} quiz problem`);
      await page.close();
    });
  }
}
