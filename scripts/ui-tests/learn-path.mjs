/**
 * Learn: the path, today's session and the catalog in the browser — the
 * home is one short list with one primary, each row says why it is there,
 * a row or the primary starts the session, finishing an item moves to the
 * next, and the end is a quiet "done for today"; the catalog is one row
 * away. Every new Learn view is checked in four languages, light and dark,
 * with larger text: the accessibility audit, raw keys, clipping, sideways
 * scrolling and one primary. Loaded by scripts/ui-test.mjs before the
 * visual baselines; receives its helpers.
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
      const clipped = [...document.querySelectorAll(".btn, .chip, .tb-title h1, .path-head .section-title")].filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      const primaries = [...document.querySelectorAll(".btn.primary")].filter(visible).length;
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { raw, clipped, primaries, overflow };
    }, KEYS);
    assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
    assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
    assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
    assert(!bad.overflow, `${where}: the page scrolls sideways`);
  }

  /** A new player on Learn's home (onboarding "new" opens lesson one; Learn again is the home). */
  async function newPlayer(locale = "en-US", scheme = "light") {
    const page = await fresh(locale);
    // The scheme from the start: a switch half-way through the colours' transition would be audited mid-way.
    await page.emulateMedia({ colorScheme: scheme });
    await onboard(page, 0);
    await page.waitForFunction(() => window.__state.space === "learn" && window.__state.learn.view === "lesson");
    await page.keyboard.press("Control+2");
    await page.waitForSelector(".learn-path .path-row");
    return page;
  }

  await check("learn path: the home is one short list with one primary; each row says why; the catalog is one row away", async () => {
    const page = await newPlayer();
    const rows = await page.evaluate(() => [...document.querySelectorAll(".learn-path .path-row")].map((r) => ({ kind: r.dataset.kind, role: r.dataset.role, text: r.innerText })));
    assert(rows.length >= 5 && rows.length <= 8, `${rows.length} rows`);
    assert(rows[0].kind === "lesson" && rows[0].text.includes("Next lesson"), JSON.stringify(rows[0]));
    for (const r of rows.slice(1)) assert(r.kind === "problem" && r.text.includes("At your level"), JSON.stringify(r));
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary");
    assert((await page.textContent(".learn-path .btn.primary")).trim() === "Start", "Start");
    // No Daily five, no focus card, no mistakes section, no course hero, no tiles on the home.
    assert((await page.locator(".learn-home .hero, .learn-home .units, .learn-home .topic-row, .learn-home .problem-grid").count()) === 0, "the old sections");
    assert(!(await page.textContent(".learn-home")).includes("Daily five"), "Daily five");
    // The catalog: the course, the problem topics and the basic shapes.
    await page.click(".catalog-link .group-row");
    await page.waitForSelector(".catalog .units");
    assert((await page.locator(".catalog .unit").count()) >= 10, "the course units");
    assert((await page.locator(".catalog .unit.open .lesson-row").count()) > 0, "the unit you are in is open");
    assert((await page.locator(".catalog .topic-row").count()) === 8, "the problem topics as rows");
    assert((await page.locator(".catalog .shape-chips .chip").count()) > 0, "the basic shapes");
    assert((await page.locator(".btn.primary:visible").count()) === 0, "the catalog has no primary");
    await page.click(".catalog .topic-row >> nth=0");
    await page.waitForSelector(".problem-card");
    const crumbs = await page.textContent(".toolbar");
    assert(crumbs.includes("All lessons and problems"), "the topic is under the catalog");
    await page.keyboard.press("Control+[");
    await page.waitForSelector(".catalog .topic-row");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("learn path: the session plays the rows in order — a lesson, then problems with Continue — to a quiet done for today", async () => {
    const page = await newPlayer();
    const total = await page.locator(".learn-path .path-row").count();
    await page.click(".learn-path .btn.primary");
    await page.waitForFunction(() => window.__state.learn.view === "lesson" && !!window.__state.learn.daily);
    assert((await page.textContent(".toolbar")).includes(`Today 1 of ${total}`), "its place in the toolbar");
    // Finish the lesson: Continue through its steps (answers shown where asked).
    for (let i = 0; i < 40; i++) {
      const v = await page.evaluate(() => {
        const L = window.__state.learn.lesson;
        if (L.finished) return "done";
        if (L.cur.kind === "place") L.cur.result = "right"; // the point itself is the beginner checks' business
        return L.cur.kind === "problem" && !L.cur.answer && L.cur.status !== "won" ? "ask" : L.cur.kind;
      });
      if (v === "done") break;
      if (v === "ask") await page.click(".panel .actions .btn.ghost >> text=Show answer");
      // Enter goes on from a finished step (app.jsx), like Continue.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Enter");
      await page.waitForTimeout(30);
    }
    await page.waitForSelector(".celebrate");
    assert((await page.textContent(".celebrate .btn.primary")).trim() === "Continue", "Continue to the next item");
    await inspect(page, "lesson complete in the session");
    await page.click(".celebrate .btn.primary");
    await page.waitForFunction(() => window.__state.learn.view === "problem" && window.__state.learn.daily?.done.length === 1);
    assert((await page.textContent(".toolbar")).includes(`Today 2 of ${total}`), "the second item");
    assert((await page.textContent(".panel .eyebrow")).includes("At your level"), "why it is there");
    // Each problem: the answer, then Continue.
    for (let n = 2; n <= total; n++) {
      await page.waitForFunction((n) => window.__state.learn.view === "problem" && document.querySelector(".toolbar").innerText.includes(`Today ${n} of`), n);
      await page.click(".panel .actions .btn.ghost >> text=Show answer");
      await page.click(".panel .actions .btn.primary >> text=Continue");
    }
    await page.waitForSelector(".session-done");
    assert((await page.textContent(".session-done h1")).trim() === "Done for today", "a quiet end");
    await inspect(page, "done for today");
    await page.click(".session-done .btn.primary");
    await page.waitForSelector(".learn-path");
    assert((await page.locator(".learn-path .path-row.done").count()) === total, "every row checked");
    assert((await page.locator(".btn.primary:visible").count()) === 0, "nothing left to start");
    assert((await page.textContent(".learn-path .section-title")).trim() === "Done for today", "the heading says so");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  const combos = [
    { locale: "zh-CN", scheme: "dark", large: true },
    { locale: "en-US", scheme: "light", large: false },
    { locale: "ko-KR", scheme: "light", large: true },
    { locale: "ja-JP", scheme: "dark", large: false },
  ];
  for (const c of combos) {
    await check(`learn path: the path, a session problem, done for today and the catalog in ${c.locale}, ${c.scheme}${c.large ? ", larger text" : ""} — audit, no clipping`, async () => {
      const page = await newPlayer(c.locale, c.scheme);
      if (c.large) await page.keyboard.press("Control+Equal");
      await inspect(page, "Learn's path");
      // The second row: a problem of the session.
      await page.click(".learn-path .path-row >> nth=1");
      await page.waitForFunction(() => window.__state.learn.view === "problem" && !!window.__state.learn.daily && window.__board?.geom?.cell > 0);
      await inspect(page, "a problem of the session");
      // Everything else done: Continue ends the session.
      await page.evaluate(() => {
        const s = window.__state.learn.daily;
        for (const it of s.items) if (it.key !== s.current && !s.done.includes(it.key)) s.done.push(it.key);
      });
      await page.click(".panel .actions .btn.ghost >> nth=-1"); // Show answer
      await page.click(".panel .actions .btn.primary");
      await page.waitForSelector(".session-done");
      await inspect(page, "done for today");
      await page.click(".session-done .btn.primary");
      await page.waitForSelector(".learn-path .path-row.done");
      await inspect(page, "Learn's path, done");
      await page.click(".catalog-link .group-row");
      await page.waitForSelector(".catalog .topic-row");
      await inspect(page, "the catalog");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });
  }
}
