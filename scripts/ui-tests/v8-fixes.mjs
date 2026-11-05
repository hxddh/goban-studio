/**
 * v8 browser checks: bug fixes. Loaded by scripts/ui-test.mjs before the
 * visual baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser, audit).
 */
export default async function ({ check, assert, fresh, onboard }) {
  await check("v8 fix: Today shows no streak once it is broken, and the live one when it is not", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const day = (ago) => {
      const d = new Date(Date.now() - ago * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const setStreak = (last) =>
      page.evaluate((last) => {
        const key = "goban-studio.progress.v2";
        const p = JSON.parse(localStorage.getItem(key) || "{}");
        p.streak = { count: 9, last };
        localStorage.setItem(key, JSON.stringify(p));
      }, last);
    const eyebrow = async () => {
      await page.keyboard.press("Control+1");
      await page.waitForSelector(".today .page-head .eyebrow");
      return page.textContent(".today .page-head .eyebrow");
    };
    await setStreak(day(5));
    await page.reload();
    await page.waitForSelector(".page");
    assert(!/9-day streak/.test(await eyebrow()), "a streak broken five days ago is not shown");
    await setStreak(day(1));
    await page.reload();
    await page.waitForSelector(".page");
    assert(/9-day streak/.test(await eyebrow()), "yesterday's streak is still alive");
    await page.close();
  });
}
