/**
 * Practice: Practice's topic grid, a problem's name, the path's merged rows
 * and the day's size, and Today's progress — in the browser, for a new
 * player and for one with a history. The history is a profile built with
 * the player model (practice-seed.js) and written into the store before the
 * app boots. Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { MESSAGES } from "../../src/web/js/messages.js";
import { DAY, recordLesson, newProfile } from "../../src/web/js/model/player.js";
import { COURSE } from "../../src/web/js/content/course.js";
import { seededProfile } from "./practice-seed.js";

const KEYS = Object.keys(MESSAGES);
const LANG = { "en-US": "en", "zh-CN": "zh", "ko-KR": "ko", "ja-JP": "ja" };

export default async function ({ check, assert, fresh, onboard, clickPoint, origin, audit, medianOf }) {
  /** The app booted on a stored player: `profile` and settings are in the store before the first script runs. */
  async function boot(profile, { locale = "en-US", scheme = "light", settings = {} } = {}) {
    const page = await fresh(locale);
    await page.emulateMedia({ colorScheme: scheme });
    const stored = { onboarded: true, lang: LANG[locale], experience: "player", playerRank: 18, ...settings };
    await page.addInitScript(
      ([p, s]) => {
        // Once: a reload keeps what the app has written since.
        if (localStorage.getItem("goban9:settings.json")) return;
        localStorage.setItem("goban9:settings.json", JSON.stringify(s));
        localStorage.setItem("goban9:profile.json", JSON.stringify(p));
      },
      [profile, stored],
    );
    await page.goto(origin + "/");
    await page.waitForFunction(() => window.__state?.ready);
    await page.waitForSelector(".today .hero");
    return page;
  }

  function history() {
    const { profile, facts } = seededProfile(Date.now());
    return { profile: { ...profile, placement: { skipped: true, at: Date.now() } }, facts };
  }

  async function inspect(page, where) {
    await page.waitForTimeout(60);
    await audit(page, where);
    const bad = await page.evaluate((keys) => {
      const set = new Set(keys);
      const raw = [...new Set(document.body.innerText.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
      const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      const clipped = [...document.querySelectorAll(".btn, .chip, .tb-title h1, .path-head .section-title, .progress-row strong, .milestone-text, .grade-head, .daily-size")].filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      const primaries = [...document.querySelectorAll(".btn.primary")].filter(visible).length;
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { raw, clipped, primaries, overflow };
    }, KEYS);
    assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
    assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
    assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
    assert(!bad.overflow, `${where}: the page scrolls sideways`);
  }

  const openTopic = async (page, topic) => {
    await page.keyboard.press("Control+3");
    await page.click(`.topic-row[data-topic=${topic}]`);
    await page.waitForSelector(".problem-card");
  };

  await check("practice progress: a topic is a grid of positions, each with its state as a mark and in words; the grade says done of total", async () => {
    const { profile } = history();
    const page = await boot(profile);
    await openTopic(page, "capture");
    const grid = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".problem-card")];
      const head = document.querySelector(".grade-head");
      const p = window.__state.profile.problems;
      return {
        n: cards.length,
        status: cards.map((c) => c.dataset.status),
        labels: cards.map((c) => c.getAttribute("aria-label")),
        marks: cards.map((c) => (c.querySelector(".tile-mark")?.className || "").replace("tile-mark", "").trim()),
        named: cards.map((c) => !!c.querySelector(".problem-title")),
        tiles: cards.filter((c) => c.querySelector(".tile")).length,
        head: head.innerText.replace(/\s+/g, " ").trim(),
        expanded: head.getAttribute("aria-expanded"),
        solved: Object.values(p).filter((e) => e.solved).length,
      };
    });
    assert(grid.n >= 20 && grid.tiles === grid.n, `${grid.n} tiles`);
    const kinds = new Set(grid.status);
    for (const k of ["new", "solved", "mastered"]) assert(kinds.has(k), `no ${k} problem in the grid: ${[...kinds]}`);
    // The mark is the state; a problem not tried has none.
    grid.status.forEach((s, i) => assert(grid.marks[i] === (s === "new" ? "" : s), `tile ${i + 1}: ${s} marked "${grid.marks[i]}"`));
    // In words for a screen reader: the number, the goal, the state.
    const words = { new: "Not tried yet", tried: "Tried, not solved yet", solved: /Solved( at first sight)?$/, due: "Due for review", mastered: "Mastered" };
    grid.labels.forEach((l, i) => {
      const w = words[grid.status[i]];
      assert(/^Problem \d+/.test(l) && /to play/.test(l) && (w instanceof RegExp ? w.test(l) : l.endsWith(w)), `label ${i + 1}: ${l}`);
    });
    // A name only where the problem has been solved.
    grid.status.forEach((s, i) => assert(grid.named[i] === (s === "solved" || s === "mastered" || (s === "due" && grid.named[i])), `tile ${i + 1} (${s}) named: ${grid.named[i]}`));
    assert(grid.status.some((s, i) => s === "new" && !grid.named[i]), "a problem not tried shows no name");
    assert(/Level 1 ≈ 30–19 kyu \d+ \/ \d+/.test(grid.head) && grid.expanded === "true", `the grade's header: ${grid.head}`);
    assert(!/Beginner|Elementary|Intermediate|Advanced|Challenge/.test(await page.innerText(".page")), "the old grade names");
    // The filter chips stay.
    assert((await page.locator(".theme-filter .chip").count()) > 2, "the theme chips");
    await page.click(".theme-filter .chip >> nth=1");
    const filtered = await page.locator(".problem-card").count();
    assert(filtered > 0 && filtered < grid.n, `the filter: ${filtered} of ${grid.n}`);
    await inspect(page, "a topic's grid");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice progress: the grid from the keyboard — one tab stop, arrows move by tile and by row, Home and End, Enter opens", async () => {
    const page = await boot(newProfile({ rank: 20 }), { settings: { experience: "rules", playerRank: 20 } });
    await page.keyboard.press("Control+3");
    await page.click(".placement-offer .link");
    await page.click(".topic-row[data-topic=capture]");
    await page.waitForSelector(".problem-card");
    const stops = await page.evaluate(() => [...document.querySelectorAll(".problem-grid .problem-card")].filter((c) => c.tabIndex === 0).length);
    assert(stops === 1, `${stops} tab stops in the grid`);
    const at = () => page.evaluate(() => [...document.querySelectorAll(".problem-card")].indexOf(document.activeElement));
    await page.focus(".problem-card >> nth=0");
    await page.keyboard.press("ArrowRight");
    assert((await at()) === 1, "→");
    const cols = await page.evaluate(() => {
      const c = [...document.querySelectorAll(".problem-card")];
      return c.findIndex((el) => el.offsetTop !== c[0].offsetTop);
    });
    assert(cols > 2, `${cols} columns`);
    await page.keyboard.press("ArrowDown");
    assert((await at()) === 1 + cols, "↓ moves a row");
    await page.keyboard.press("ArrowLeft");
    assert((await at()) === cols, "←");
    await page.keyboard.press("ArrowUp");
    assert((await at()) === 0, "↑");
    await page.keyboard.press("ArrowUp");
    assert((await at()) === 0, "↑ at the top stays");
    await page.keyboard.press("End");
    const last = (await page.locator(".problem-card").count()) - 1;
    assert((await at()) === last, "End");
    await page.keyboard.press("Home");
    assert((await at()) === 0, "Home");
    await page.keyboard.press("ArrowRight");
    assert((await page.evaluate(() => [...document.querySelectorAll(".problem-card")].findIndex((c) => c.tabIndex === 0))) === 1, "the tab stop follows");
    const want = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__state.practice.view === "problem");
    assert(/^Problem 2\b/.test(want), want);
    assert((await page.textContent(".tb-sub")).trim().startsWith("2 /"), "Enter opened the second problem");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice progress: a grade of many problems opens within the place-switch budget, drawing only the tiles near the screen", async () => {
    const page = await boot(newProfile({ rank: 20 }), { settings: { experience: "rules", playerRank: 20 } });
    await page.keyboard.press("Control+3");
    await page.click(".placement-offer .link");
    const timing = await medianOf("a topic with every grade open", async () => {
      await page.keyboard.press("Control+3");
      await page.waitForSelector(".topic-row[data-topic=kill]");
      await page.click(".topic-row[data-topic=kill]");
      await page.waitForSelector(".problem-card");
      // Every grade open: the whole topic on one page.
      return page.evaluate(async () => {
        const t0 = performance.now();
        for (let h; (h = document.querySelector('.grade-head[aria-expanded="false"]')); ) {
          h.click();
          await new Promise((r) => setTimeout(r, 0));
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t0);
      });
    });
    assert((await page.locator(".problem-card").count()) > 100, "the whole topic is on the page");
    assert(timing.median < 250, `${timing.text} > 250`);
    const drawn = await page.evaluate(() => ({ all: document.querySelectorAll(".problem-card .tile").length, drawn: document.querySelectorAll(".problem-card .tile svg").length }));
    assert(drawn.all > 100 && drawn.drawn > 0 && drawn.drawn < drawn.all, `tiles drawn: ${drawn.drawn} of ${drawn.all}`);
    // The ones further down draw as they come near.
    await page.evaluate(() => document.querySelector(".page").scrollTo(0, 1e6));
    await page.waitForFunction(() => !!document.querySelector(".problem-card:last-child .tile svg"), null, { timeout: 3000 });
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return timing.text;
  });

  await check("practice progress: a problem says only its goal until it is solved — heading, toolbar and list; then its name is the result", async () => {
    const page = await boot(newProfile({ rank: 20 }), { settings: { experience: "rules", playerRank: 20 } });
    await page.keyboard.press("Control+3");
    await page.click(".placement-offer .link");
    await page.click(".topic-row[data-topic=kill]");
    await page.waitForSelector(".problem-card");
    assert((await page.locator(".problem-card .problem-title").count()) === 0, "a new player's grid names nothing");
    await page.click(".problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.practice.view === "problem" && window.__board?.geom?.cell > 0);
    const def = await page.evaluate(() => ({ name: window.__state.practice.problem.def.title.en, theme: window.__state.practice.problem.def.theme }));
    const before = await page.evaluate(() => ({ toolbar: document.querySelector(".toolbar").innerText, panel: document.querySelector(".panel").innerText, h1: document.querySelector(".panel h1").innerText.trim(), said: document.querySelector("#main ~ .sr-only, .app > .sr-only")?.textContent || "" }));
    assert(!before.toolbar.includes(def.name) && !before.panel.includes(def.name), `named before it is solved: ${def.name}`);
    assert(before.h1 === "Black to play: kill" || /to play/.test(before.h1), `the heading is the goal: ${before.h1}`);
    assert(before.toolbar.includes("Problem"), `the toolbar: ${before.toolbar}`);
    assert((await page.title()) === "Goban Studio", "the window's title");
    assert((await page.locator(".facts .link").count()) === 0, "nor its theme");
    // A hint is asked for; it may speak of the technique, the heading still does not.
    await page.click('.panel .actions .btn:has-text("Hint")');
    assert(!(await page.innerText(".panel h1")).includes(def.name), "the heading after a hint");
    // Solve it (the hint was used, so it is solved, not clean).
    const ok = await page.evaluate(() => window.__solver.solveFirstMoves(window.__state.practice.problem.pz).correct[0]);
    await clickPoint(page, ok.x, ok.y);
    for (let i = 0; i < 12; i++) {
      const st = await page.evaluate(() => ({ status: window.__state.practice.problem.status, busy: window.__state.practice.problem.busy }));
      if (st.status === "won") break;
      if (!st.busy && st.status === "open") {
        const next = await page.evaluate(() => window.__solver.winningMoves(window.__state.practice.problem.pz, window.__state.practice.problem.st)[0]);
        if (next && i > 0) await clickPoint(page, next.x, next.y);
      }
      await page.waitForTimeout(450);
    }
    await page.waitForFunction(() => window.__state.practice.problem.status === "won", null, { timeout: 8000 });
    await page.waitForSelector(".result-name");
    assert((await page.innerText(".result-name")).includes(def.name), "the name is the result");
    assert((await page.innerText(".tb-title h1")).trim() === def.name, "and the toolbar's title");
    assert((await page.locator(".facts .link").count()) === 1, "its theme, now");
    assert((await page.innerText(".panel h1")).includes("to play"), "the heading stays the goal");
    // Enter goes on, as the primary does — also with the board focused, where the click left the focus.
    await page.focus("canvas.board");
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => window.__state.practice.problem.def.title.en !== n || document.querySelector(".tb-sub").innerText.startsWith("2 /"), def.name);
    assert((await page.textContent(".tb-sub")).trim().startsWith("2 /"), "Enter went on to the next problem");
    // Back in the grid the solved one has its name.
    await page.keyboard.press("Control+[");
    await page.keyboard.press("Control+[");
    await page.waitForSelector(".problem-card");
    assert((await page.innerText(".problem-card >> nth=0")).includes(def.name), "the list names a solved problem");
    assert((await page.locator(".problem-card .problem-title").count()) === 1, "and only that one");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice progress: a review comes back turned and unnamed; a miss says when it comes back", async () => {
    const { profile } = history();
    const page = await boot(profile);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-row[data-role=review]");
    await page.click(".practice-path .path-row[data-role=review] >> nth=0");
    await page.waitForFunction(() => window.__state.practice.view === "problem" && !!window.__state.practice.daily && window.__board?.geom?.cell > 0);
    const P = await page.evaluate(() => ({ name: window.__state.practice.problem.def.title.en, review: window.__state.practice.problem.review, shown: window.__state.practice.problem.def.shown || null }));
    assert(P.review === true, "a review");
    assert((await page.innerText(".panel .eyebrow")).includes("Due for review"), "why it is here");
    const text = await page.evaluate(() => document.querySelector(".toolbar").innerText + "\n" + document.querySelector(".panel h1").innerText + "\n" + (document.querySelector(".result-lines")?.innerText || ""));
    assert(!text.split("\n").some((l) => l.trim() === P.name), `the review is named: ${text}`);
    assert((await page.innerText(".panel h1")).includes("to play"), "its goal");
    assert((await page.locator(".result-lines").count()) === 0, "no result yet");
    await page.click('.panel .actions .btn:has-text("Show answer")');
    await page.waitForSelector(".result-name");
    assert((await page.innerText(".result-name")).includes(P.name), "the answer shown: its name");
    const back = (await page.innerText(".come-back")).trim();
    assert(back === "It comes back tomorrow." || /^It comes back in about \d+ days\.$/.test(back), `when it comes back: ${back}`);
    await inspect(page, "a missed review");
    // Enter goes on in the session.
    await page.evaluate(() => document.activeElement?.blur());
    const key = await page.evaluate(() => window.__state.practice.daily.current);
    await page.keyboard.press("Enter");
    await page.waitForFunction((k) => window.__state.practice.daily?.current !== k || window.__state.practice.view !== "problem", key);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice progress: the path merges problems of one theme into a row with its count, tiles and reason; the load is one quiet line", async () => {
    const { profile } = history();
    const page = await boot(profile);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-row");
    const rows = await page.evaluate(() => [...document.querySelectorAll(".practice-path .path-row")].map((r) => ({ kind: r.dataset.kind, role: r.dataset.role, count: Number(r.dataset.count), title: r.querySelector("strong").innerText, sub: r.querySelector(".gr-text > span").innerText, tiles: r.querySelectorAll(".path-tiles canvas").length })));
    const items = await page.evaluate(() => window.__state.settings.dailySize);
    const probs = rows.filter((r) => r.kind === "problem");
    assert(probs.reduce((n, r) => n + r.count, 0) === items, `the day's ${items} problems: ${JSON.stringify(rows)}`);
    assert(probs.length < items, `rows merged: ${probs.length} rows for ${items} problems`);
    const merged = probs.find((r) => r.count > 1);
    assert(merged && new RegExp(`^.+ · ${merged.count} problems$`).test(merged.title), `a merged row: ${JSON.stringify(merged)}`);
    assert(merged.tiles === Math.min(4, merged.count), `${merged.tiles} tiles for ${merged.count} problems`);
    for (const r of probs) assert(/^(Due for review|New at your level|A step up|This week's focus|.+ games|.+ problems) · Level \d(–\d)?$/.test(r.sub), `the reason: ${r.sub}`);
    assert(probs.some((r) => r.sub.startsWith("Due for review")), "reviews that are due say so");
    // No two neighbours repeat title and reason (what made the path read as copied).
    for (let i = 1; i < rows.length; i++) assert(rows[i].title !== rows[i - 1].title || rows[i].sub !== rows[i - 1].sub, `rows ${i} and ${i + 1} read the same`);
    const load = (await page.innerText(".path-load")).trim();
    assert(/^\d+ to review today · \d+ mastered$/.test(load), `the load: ${load}`);
    // A merged row opens its first problem not done; done tiles count on the row.
    await page.click(`.practice-path .path-row[data-count="${merged.count}"] >> nth=0`);
    await page.waitForFunction(() => window.__state.practice.view === "problem" && !!window.__state.practice.daily);
    await page.click('.panel .actions .btn:has-text("Show answer")');
    await page.click(".panel .actions .btn.primary");
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-row");
    const part = await page.innerText(`.practice-path .path-row[data-count="${merged.count}"] >> nth=0`);
    assert(part.includes(`1 / ${merged.count}`), `part of a row done: ${part}`);
    await inspect(page, "the path with merged rows");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice progress: the day's size is chosen on the path (3, 5 or 10) and kept across a restart", async () => {
    const page = await boot(newProfile({ rank: 20 }), { settings: { experience: "rules", playerRank: 20 } });
    await page.keyboard.press("Control+3");
    await page.click(".placement-offer .link");
    await page.waitForSelector(".practice-path .path-row");
    const problems = () => page.evaluate(() => [...document.querySelectorAll(".practice-path .path-row[data-kind=problem]")].reduce((n, r) => n + Number(r.dataset.count), 0));
    const chosen = () => page.evaluate(() => document.querySelector('.daily-size [role=radio][aria-checked="true"]').innerText.trim());
    assert((await chosen()) === "5" && (await problems()) === 5, "five by default");
    assert((await page.getAttribute(".daily-size [role=radiogroup]", "aria-label")) === "Problems a day", "the control's name");
    await page.click('.daily-size [role=radio]:has-text("10")');
    await page.waitForFunction(() => window.__state.settings.dailySize === 10);
    assert((await problems()) === 10, `ten problems: ${await problems()}`);
    await page.click('.daily-size [role=radio]:has-text("3")');
    assert((await problems()) === 3, `three problems: ${await problems()}`);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:settings.json")).dailySize === 3, null, { timeout: 3000 });
    await page.reload();
    await page.waitForFunction(() => window.__state?.ready);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-row");
    assert((await chosen()) === "3" && (await problems()) === 3, "kept after a restart");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "still one primary");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("today progress: a new player sees no chart, no bar and no zero — only what there is", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today .hero");
    assert((await page.locator(".today-progress, .spark, .mastery-bar, .day-dots").count()) === 0, "an empty progress area");
    const week = (await page.innerText(".today-week p")).trim();
    assert(week === "No games or problems yet this week.", `this week: ${week}`);
    assert(!/\b0 (games|problems)/.test(await page.innerText(".today")), "a zero on Today");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary");
    // The row for today's practice names the next row by its theme, never by a problem's name.
    const row = (await page.innerText(".today-row")).replace(/\s+/g, " ");
    assert(/Next: .+ · \d problems?/.test(row) || /Next: /.test(row), `today's practice: ${row}`);
    await inspect(page, "Today, a new player");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("today progress: with a history — the level's line and its words, what is mastered and by theme, four weeks of dots, the newest milestones", async () => {
    const { profile, facts } = history();
    const page = await boot(profile);
    await page.waitForSelector(".today-progress");
    // What the profile already had is kept without a word.
    assert((await page.evaluate(() => window.__state.toasts.length)) === 0, "a toast at start-up for milestones long reached");
    const level = await page.evaluate(() => {
      const row = document.querySelector("[data-row=level]");
      const svg = row.querySelector("svg.spark");
      return { text: row.innerText.replace(/\s+/g, " "), label: svg?.getAttribute("aria-label"), role: svg?.getAttribute("role"), points: svg?.querySelector("polyline").getAttribute("points").split(" ").length };
    });
    assert(level.points === facts.games, `a point a rated game: ${level.points}`);
    assert(/^Your level: ≈ \d+ kyu \(±\d+\) (up|down) about \d ranks? over \d+ days$|about the same over \d+ days$/.test(level.text), `the level row: ${level.text}`);
    assert(level.role === "img" && level.label.includes("≈") && level.label.includes("over"), `the line in words: ${level.label}`);
    const mastery = await page.evaluate(() => {
      const row = document.querySelector("[data-row=mastery]");
      const parts = [...row.querySelectorAll(".mastery-bar i")].map((i) => ({ cls: i.className, w: i.getBoundingClientRect().width }));
      return { text: row.innerText.replace(/\s+/g, " "), label: row.querySelector(".mastery-bar").getAttribute("aria-label"), parts, expanded: row.querySelector("button").getAttribute("aria-expanded"), themes: row.querySelectorAll(".mastery-themes li").length };
    });
    assert(/^Mastered \d+ problems \d+ learning · \d+ not started$/.test(mastery.text.trim()), `mastery: ${mastery.text}`);
    assert(mastery.parts.length === 3 && mastery.parts.every((p) => p.w >= 2), `three parts, each visible: ${JSON.stringify(mastery.parts)}`);
    assert(mastery.parts[2].w > mastery.parts[0].w, "most of the bank is not started");
    assert(/^\d+ mastered, \d+ learning, \d+ not started$/.test(mastery.label), mastery.label);
    assert(mastery.expanded === "false" && mastery.themes === 0, "the themes are on demand");
    await page.click("[data-row=mastery] button");
    const themes = await page.locator(".mastery-themes li").allInnerTexts();
    assert(themes.length >= 3 && themes.every((x) => /\d+ \/ \d+/.test(x)), `by theme: ${themes.join(" | ")}`);
    const dots = await page.evaluate(() => ({ n: document.querySelectorAll(".day-dots i").length, on: document.querySelectorAll(".day-dots i.on").length, label: document.querySelector(".day-dots").getAttribute("aria-label"), text: document.querySelector("[data-row=days]").innerText }));
    assert(dots.n === 28 && dots.on > 5 && dots.label === `Practised on ${dots.on} days`, JSON.stringify(dots));
    assert(!/streak/i.test(await page.innerText(".today")), "a streak");
    const marks = await page.locator(".milestone").allInnerTexts();
    assert(marks.length >= 1 && marks.length <= 3, `${marks.length} milestones`);
    assert(marks.filter((x) => /problems mastered/.test(x)).length <= 1, `one line for what is mastered: ${marks.join(" | ")}`);
    const week = (await page.innerText(".today-week p")).trim();
    assert(!/\b0\b/.test(week), `this week: ${week}`);
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary");
    await inspect(page, "Today with a history");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("today progress: a milestone reached is said in one quiet line, and listed on Today", async () => {
    // Every lesson of the first unit but the last is done.
    const unit = COURSE[0];
    let profile = newProfile({ rank: 30 });
    for (const l of unit.lessons.slice(0, -1)) profile = recordLesson(profile, l.id, { done: true, step: 99 }, Date.now() - DAY);
    const last = unit.lessons.at(-1);
    const page = await boot(profile, { settings: { experience: "new", playerRank: 30 } });
    assert((await page.locator(".milestone").count()) === 0, "nothing reached yet");
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".catalog .unit.open .lesson-row");
    await page.click(`.catalog .unit.open .lesson-row >> nth=${unit.lessons.length - 1}`);
    await page.waitForFunction((id) => window.__state.practice.view === "lesson" && window.__state.practice.lesson.lesson.id === id, last.id);
    for (let i = 0; i < 40; i++) {
      const v = await page.evaluate(() => {
        const L = window.__state.practice.lesson;
        if (L.finished) return "done";
        if (L.cur.kind === "place") L.cur.result = "right";
        return L.cur.kind === "problem" && !L.cur.answer && L.cur.status !== "won" ? "ask" : L.cur.kind;
      });
      if (v === "done") break;
      if (v === "ask") await page.click(".panel .actions .btn.ghost >> text=Show answer");
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Enter");
      await page.waitForTimeout(30);
    }
    await page.waitForSelector(".celebrate");
    const line = `Unit finished: ${unit.title.en}`;
    await page.waitForFunction((text) => window.__state.toasts.some((x) => x.message === text), line, { timeout: 3000 });
    assert((await page.evaluate(() => window.__state.toasts.length)) === 1, "one line, not a pile");
    await page.waitForFunction((id) => JSON.parse(localStorage.getItem("goban9:profile.json")).marks?.["unit:" + id] > 0, unit.id, { timeout: 3000 });
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today-progress .milestone");
    assert((await page.innerText(".today-progress .milestone >> nth=0")).includes(line), "listed on Today");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  for (const [locale, scheme, large] of [["zh-CN", "dark", true], ["en-US", "light", false], ["ko-KR", "light", true], ["ja-JP", "dark", false]]) {
    await check(`practice progress: Today's progress, the path and a topic's grid in ${locale}, ${scheme}${large ? ", larger text" : ""} — audit, no clipping`, async () => {
      const { profile } = history();
      const page = await boot(profile, { locale, scheme });
      if (large) await page.keyboard.press("Control+Equal");
      await page.waitForSelector(".today-progress");
      await page.click("[data-row=mastery] button");
      await inspect(page, `${locale} Today`);
      await page.keyboard.press("Control+3");
      await page.waitForSelector(".practice-path .path-row");
      await inspect(page, `${locale} path`);
      await page.click(".topic-row[data-topic=capture]");
      await page.waitForSelector(".problem-card .tile svg");
      await inspect(page, `${locale} topic`);
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });
  }
}
