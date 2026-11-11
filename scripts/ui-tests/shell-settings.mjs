/**
 * Shell: Settings pane by pane and the first run.
 *
 * - No pane of Settings is taller than its sheet at 1200×800, in the four
 *   languages, with larger text too, and in the packaged app's fullest
 *   state (a download running, another failed, an Undo restore row).
 * - The volume: four levels, kept, heard once on a change, silent when off.
 * - You: one row for the level (the estimate with its ±) and Change…,
 *   which asks for the level again; the daily practice size.
 * - The rules of new games follow the interface language for a new
 *   profile and stay what an existing player had.
 * - The first run: every answer of onboarding lands on Today, whose hero
 *   starts what the answer asked for in one click.
 *
 * Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { fakeHost } from "./shell-sheets.mjs";

const LOCALES = [
  ["en-US", "en"],
  ["zh-CN", "zh"],
  ["ko-KR", "ko"],
  ["ja-JP", "ja"],
];
const PANES = ["general", "board", "playing", "you", "engines", "data", "about"];
/** Panes allowed to scroll (none: a pane that grows past the sheet is split or trimmed instead). */
const MAY_SCROLL = [];

export default async function ({ check, assert, fresh, firstLanding, origin }) {
  /** Someone who has used the app (browser preview), with these settings, at Today. */
  async function seededPage(settings = {}, { locale = "en-US", viewport = { width: 1200, height: 800 }, files = {} } = {}) {
    const page = await fresh(locale, viewport);
    await page.addInitScript(
      ([s, extra]) => {
        if (localStorage.getItem("goban9:settings.json")) return;
        localStorage.setItem("goban9:settings.json", JSON.stringify({ v: 13, lang: "en", onboarded: true, experience: "player", playerRank: 12, defaultRules: "japanese", ...s }));
        for (const [k, v] of Object.entries(extra)) localStorage.setItem("goban9:" + k, v);
      },
      [settings, files],
    );
    await page.goto(origin + "/");
    await page.waitForSelector(".today");
    return page;
  }
  const openPane = async (page, id) => {
    if (!(await page.locator(".settings-sheet").count())) await page.keyboard.press("Control+,");
    await page.click(`.settings-tab[data-pane=${id}]`);
    await page.waitForSelector(`.settings-pane[data-pane=${id}]`);
  };
  const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("goban9:settings.json") || "{}"));

  for (const large of [false, true]) {
    await check(`shell settings: no pane scrolls at 1200×800 in four languages${large ? ", with larger text" : ""} — the packaged app at its fullest`, async () => {
      const seen = [];
      for (const [locale, lang] of LOCALES) {
        const page = await fresh(locale, { width: 1200, height: 800 });
        // The packaged app: a download running (and stalled), the other failed, a restore that can be undone.
        await page.addInitScript(fakeHost, {
          "settings.json": JSON.stringify({ v: 13, lang, onboarded: true, experience: "player", playerRank: 12, largeText: large }),
          [`backups/pre-restore-${Date.now() - 3600000}/settings.json`]: "{}",
        });
        await page.addInitScript(() => {
          const invoke = window.zero.invoke;
          window.zero.invoke = async (command, p) => {
            if (command === "studio.modelStatus") {
              return { available: true, human: { status: "downloading", bytes: 40_000_000, total: 99_066_230, idleMs: 60_000, name: "h" }, strong: { status: "failed", bytes: 0, total: 48_038_914, error: "Network", name: "s" } };
            }
            if (command === "studio.revealDataDir") return { ok: true, path: "/data" };
            return invoke(command, p);
          };
        });
        await page.goto(origin + "/");
        await page.waitForSelector(".today");
        assert((await page.evaluate(() => document.documentElement.dataset.text)) === (large ? "large" : "normal"), "text size");
        await page.keyboard.press("Control+,");
        await page.waitForSelector(".settings-sheet");
        const tabs = await page.locator(".settings-tab").evaluateAll((els) => els.map((el) => el.dataset.pane));
        assert(JSON.stringify(tabs) === JSON.stringify(PANES), `panes: ${tabs}`);
        for (const id of PANES) {
          await openPane(page, id);
          if (id === "engines") await page.waitForSelector(".model-row .progress");
          if (id === "data") await page.waitForSelector("[data-undo-restore]");
          await page.waitForTimeout(40);
          const m = await page.evaluate(() => {
            const pane = document.querySelector(".settings-pane");
            const sheet = document.querySelector(".settings-sheet").getBoundingClientRect();
            const nav = document.querySelector(".settings-nav");
            return { content: pane.scrollHeight, room: pane.clientHeight, wide: pane.scrollWidth > pane.clientWidth + 1, sheetFits: sheet.top >= 0 && sheet.bottom <= innerHeight, navFits: nav.scrollHeight <= nav.clientHeight + 1 };
          });
          assert(m.sheetFits, `${locale} ${id}: the sheet does not fit the window`);
          assert(m.navFits, `${locale} ${id}: the list of panes scrolls`);
          assert(!m.wide, `${locale} ${id}: the pane scrolls sideways`);
          if (!MAY_SCROLL.includes(id)) assert(m.content <= m.room, `${locale} ${id}${large ? " (larger text)" : ""}: ${m.content} px of content in ${m.room} px`);
          seen.push(m.content);
        }
        // The fullest states were really on screen.
        await openPane(page, "engines");
        assert((await page.locator(".model-row .btn").count()) === 2, "both networks have their action");
        await openPane(page, "data");
        assert((await page.locator("[data-reveal]").count()) === 1, "the data folder row");
        assert(page.errors.length === 0, `${locale}: ${page.errors.join("; ")}`);
        await page.close();
      }
      return `tallest pane ${Math.max(...seen)} px`;
    });
  }

  await check("shell settings: the volume has four levels; a change is kept and heard once at the new level; Off is silent; the old sound switch migrates", async () => {
    // A settings file from before the volume: the sound switched off.
    const page = await seededPage({ sound: false });
    // Count what is played and remember the gain nodes (the first one made is the master).
    await page.addInitScript(() => {
      window.__played = 0;
      window.__gains = [];
      const AC = window.AudioContext || window.webkitAudioContext;
      for (const make of ["createBufferSource", "createOscillator"]) {
        const orig = AC.prototype[make];
        AC.prototype[make] = function (...a) {
          window.__played++;
          return orig.apply(this, a);
        };
      }
      const gain = AC.prototype.createGain;
      AC.prototype.createGain = function (...a) {
        const g = gain.apply(this, a);
        window.__gains.push(g);
        return g;
      };
    });
    await page.reload();
    await page.waitForSelector(".today");
    assert(await page.evaluate(() => window.__state.settings.volume === "off" && !("sound" in window.__state.settings)), "sound: false did not become volume: off");
    await openPane(page, "general");
    const seg = page.locator(".settings-pane .segmented.volume button");
    assert(JSON.stringify(await seg.allInnerTexts()) === JSON.stringify(["Off", "Quiet", "Normal", "Loud"]), `levels: ${await seg.allInnerTexts()}`);
    assert((await seg.nth(0).getAttribute("aria-checked")) === "true", "Off is the level shown");
    assert((await page.locator(".settings-pane select, .settings-pane input[type=range]").count()) === 0, "a house control, not a native one");
    // Quiet: kept, and one stone is heard at that level.
    const before = await page.evaluate(() => window.__played);
    await seg.nth(1).click();
    await page.waitForFunction(() => window.__state.settings.volume === "quiet");
    await page.waitForFunction((n) => window.__played > n, before, { timeout: 3000 });
    assert(Math.abs((await page.evaluate(() => window.__gains[0].gain.value)) - 0.25) < 1e-6, "the master gain is the quiet level");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:settings.json")).volume === "quiet", null, { timeout: 3000 });
    assert(!("sound" in (await stored(page))), "the old switch is not written back");
    // Loud, then Off: the gain follows; Off plays nothing.
    await seg.nth(3).click();
    await page.waitForFunction(() => Math.abs(window.__gains[0].gain.value - 1) < 1e-6);
    const loud = await page.evaluate(() => window.__played);
    await seg.nth(0).click();
    await page.waitForFunction(() => window.__state.settings.volume === "off");
    await page.waitForTimeout(150);
    assert((await page.evaluate(() => window.__played)) === loud, "Off still played a sound");
    // After a restart it is still off, and a stone on the board is silent.
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:settings.json")).volume === "off", null, { timeout: 3000 });
    await page.reload();
    await page.waitForSelector(".today");
    assert(await page.evaluate(() => window.__state.settings.volume === "off"), "the volume was not kept");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell settings: You has one row for the level — the estimate with its ± and Change…, which asks again; the daily practice size is kept", async () => {
    const page = await seededPage({ playerRank: 12 }, { files: { "profile.json": JSON.stringify({ v: 13 }) } });
    await openPane(page, "you");
    // One level, one way to change it: no second "rank" control beside the estimate.
    assert((await page.locator(".settings-pane .level-row").count()) === 1, "one level row");
    assert((await page.locator(".settings-pane select").count()) === 0, "no native select");
    const levelText = (await page.textContent(".settings-pane")).match(/kyu|dan/g) || [];
    assert(levelText.length === 1, `the level is said once in the pane: ${levelText.length} times`);
    const shown = (await page.textContent(".level-row .level-now")).trim();
    assert(/^≈ \d+ (kyu|dan) \(±\d+\)$/.test(shown), `the estimate with its ±: "${shown}"`);
    assert((await page.textContent(".settings-pane")).includes("± is the margin"), "what ± means is said under it");
    // Change…: the level question, as in onboarding.
    await page.click("[data-change-level]");
    await page.waitForFunction(() => window.__state.sheet?.kind === "level" && document.activeElement?.matches(".sheet input[type=range]"));
    const start = await page.inputValue(".sheet input[type=range]");
    // Five steps stronger, by keyboard.
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    const want = 30 - (Number(start) + 5);
    const label = (await page.textContent(".sheet .slider-field output")).trim();
    assert(label === (want > 0 ? `≈ ${want} kyu` : `≈ ${1 - want} dan`), `the slider says ${label}, expected rank ${want}`);
    await page.click("[data-save-level]");
    // Back in Settings → You, the estimate starting from the new level.
    await page.waitForFunction(() => window.__state.sheet?.kind === "settings" && !!document.querySelector('.settings-pane[data-pane="you"]'));
    assert(await page.evaluate((r) => window.__state.settings.playerRank === r, want), "the level was not saved");
    const after = (await page.textContent(".level-row .level-now")).trim();
    assert(after.startsWith(want > 0 ? `≈ ${want} kyu` : `≈ ${1 - want} dan`), `the row now says "${after}"`);
    assert(after !== shown, "the estimate did not move");
    await page.waitForFunction((r) => JSON.parse(localStorage.getItem("goban9:settings.json")).playerRank === r, want, { timeout: 3000 });
    // Cancel changes nothing and comes back too.
    await page.click("[data-change-level]");
    await page.waitForSelector(".sheet input[type=range]");
    await page.keyboard.press("ArrowLeft");
    await page.click(".sheet-foot .btn.ghost");
    await page.waitForFunction(() => window.__state.sheet?.kind === "settings");
    assert(await page.evaluate((r) => window.__state.settings.playerRank === r, want), "Cancel changed the level");
    // The daily practice size: 3, 5 or 10.
    const daily = page.locator(".settings-pane .segmented.daily-size button");
    assert(JSON.stringify(await daily.allInnerTexts()) === JSON.stringify(["3 problems", "5 problems", "10 problems"]), `sizes: ${await daily.allInnerTexts()}`);
    assert((await daily.nth(1).getAttribute("aria-checked")) === "true", "5 is the default");
    await daily.nth(2).click();
    await page.waitForFunction(() => window.__state.settings.dailySize === 10);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:settings.json")).dailySize === 10, null, { timeout: 3000 });
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell settings: a new profile's games use the rules of its language (onboarding says so); an existing player keeps theirs; Settings changes it", async () => {
    const WANT = { "zh-CN": ["chinese", 7.5, "中国规则"], "ko-KR": ["korean", 6.5, "한국 규칙"], "ja-JP": ["japanese", 6.5, "日本ルール"], "en-US": ["japanese", 6.5, "Japanese rules"], "zh-TW": ["chinese", 7.5, "中国规则"] };
    for (const [locale, [rules, komi, name]] of Object.entries(WANT)) {
      const page = await fresh(locale);
      await page.goto(origin + "/");
      await page.waitForSelector(".ob-card");
      // The first step is about the language; the line about rules comes once it is chosen.
      assert((await page.getAttribute(".ob-foot", "data-ob-foot")) === "offline", "the first step says the app is offline");
      await page.click(".ob-card .btn.primary");
      await page.waitForSelector(".choice");
      const foot = (await page.textContent(".ob-foot")).trim();
      assert(foot.includes(name), `${locale}: the last step says which rules new games use: "${foot}"`);
      assert((await page.locator(".ob-foot").count()) === 1 && foot.length < 80, `${locale}: one quiet line (${foot.length} characters)`);
      await page.click(".choice >> nth=1");
      await firstLanding(page, 1);
      await page.click(".today .hero .btn.primary");
      await page.waitForFunction(() => !!window.__state.game);
      const g = await page.evaluate(() => ({ rules: window.__state.game.game.rules, komi: window.__state.game.game.komi, chosen: window.__state.settings.defaultRules, lang: window.__state.settings.lang, html: document.documentElement.lang }));
      assert(g.rules === rules && g.komi === komi, `${locale}: the first game uses ${g.rules}, komi ${g.komi}`);
      assert(g.chosen === null, `${locale}: starting a game chose the rules (${g.chosen})`);
      // A Traditional Chinese system gets the Chinese interface, not English.
      if (locale === "zh-TW") assert(g.lang === "zh" && g.html === "zh-CN", `zh-TW: interface ${g.lang}, <html lang=${g.html}>`);
      assert(page.errors.length === 0, `${locale}: ${page.errors.join("; ")}`);
      await page.close();
    }
    // An existing player in Chinese who has always played Japanese rules keeps them.
    const page = await seededPage({ lang: "zh", defaultRules: "japanese" }, { locale: "zh-CN" });
    await page.keyboard.press("Control+n");
    await page.waitForSelector(".sheet .disclosure");
    assert((await page.textContent(".sheet .disclosure")).includes("日本规则"), "New game does not start from the player's rules");
    await page.keyboard.press("Escape");
    await openPane(page, "playing");
    const seg = page.locator(".settings-pane .segmented.default-rules button");
    assert((await seg.nth(0).getAttribute("aria-checked")) === "true" && (await seg.nth(0).innerText()).trim() === "日本规则", "Settings shows Japanese rules");
    // Chosen in Settings, it is a choice from then on.
    await seg.nth(1).click();
    await page.waitForFunction(() => window.__state.settings.defaultRules === "chinese");
    assert((await page.textContent(".settings-pane")).includes("7.5"), "the pane says what the rules mean");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+n");
    await page.waitForSelector(".sheet .disclosure");
    assert((await page.textContent(".sheet .disclosure")).includes("中国规则"), "New game follows the setting");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell first run: every answer lands on Today with nothing started; its hero starts lesson one, the gentle 9×9 or the 19×19 in one click", async () => {
    const out = [];
    const WANT = [
      { choice: 0, hero: /Start here[\s\S]*Start lesson one/, after: () => window.__state.space === "learn" && window.__state.learn.view === "lesson" && window.__state.learn.lesson?.index === 0 },
      { choice: 1, hero: /Suggested game[\s\S]*9×9/, after: () => window.__state.space === "play" && window.__state.game?.game.size === 9 && window.__state.settings.opponentRank === 30 && window.__state.game.game.handicap === 0 },
      { choice: 2, hero: /Suggested game[\s\S]*19×19/, after: () => window.__state.space === "play" && window.__state.game?.game.size === 19 && window.__state.game.game.handicap === 0 },
    ];
    for (const w of WANT) {
      const page = await fresh("en-US", { width: 1200, height: 800 });
      await page.goto(origin + "/");
      await page.waitForSelector(".ob-card");
      await page.click(".ob-card .btn.primary");
      await page.click(`.choice >> nth=${w.choice}`);
      await firstLanding(page, w.choice);
      // Today, as every day: the date and greeting, one hero, one primary; nothing was started.
      const st = await page.evaluate(() => ({
        space: window.__state.space,
        game: window.__state.game === null,
        learn: window.__state.learn.view,
        sheet: window.__state.sheet,
        onboarded: window.__state.settings.onboarded,
        primaries: [...document.querySelectorAll(".btn.primary")].filter((el) => el.offsetParent !== null).length,
        heroes: document.querySelectorAll(".today .hero").length,
        board: document.querySelectorAll("canvas.board").length,
        current: document.querySelector(".sidebar [aria-current=page]")?.textContent.trim(),
      }));
      assert(st.space === "today" && st.current === "Today", `answer ${w.choice}: landed on ${st.space}`);
      assert(st.game && st.learn === "home" && st.board === 0, `answer ${w.choice}: something was started (${JSON.stringify(st)})`);
      assert(st.sheet === null && st.onboarded === true, "onboarding is over");
      assert(st.heroes === 1 && st.primaries === 1, `answer ${w.choice}: ${st.heroes} heroes, ${st.primaries} primary buttons`);
      const hero = await page.innerText(".today .hero");
      assert(w.hero.test(hero), `answer ${w.choice}: the hero says "${hero.replace(/\s+/g, " ")}"`);
      // One click.
      await page.click(".today .hero .btn.primary");
      await page.waitForFunction(w.after, null, { timeout: 5000 });
      if (w.choice === 0) {
        await page.waitForSelector(".steps");
        assert((await page.textContent(".panel")).includes("Step 1"), "lesson one, step one");
      }
      // Onboarding is on disk: a restart does not ask again.
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:settings.json") || "{}").onboarded === true, null, { timeout: 3000 });
      assert(page.errors.length === 0, `answer ${w.choice}: ${page.errors.join("; ")}`);
      await page.close();
      out.push(hero.split("\n")[1]?.trim());
    }
    return out.join(" | ");
  });

  await check("shell first run: after the first 9×9 games a beginner is offered 13×13, then the hero moves on to it", async () => {
    // A beginner with three finished 9×9 games against the computer.
    const at = Date.UTC(2026, 9, 2);
    const files = {};
    for (let i = 0; i < 3; i++) {
      files[`games/g${i}.json`] = JSON.stringify({ v: 13, id: `g${i}`, createdAt: at + i, updatedAt: at + i, finishedAt: at + i, source: "game", sgf: "(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]RE[B+R];B[cc];W[gg])", meta: { size: 9, rules: "japanese", komi: 6.5, handicap: 0, moves: 2, result: "B+R", date: new Date(at).toISOString(), playerBlack: "You", playerWhite: "KataGo", thumb: ".".repeat(81), name: "", opponent: "ai", humanColor: 1, rank: 30 } });
    }
    const two = { ...files };
    delete two["games/g2.json"];
    const page2 = await seededPage({ experience: "rules", playerRank: 25 }, { files: two });
    assert((await page2.innerText(".today .hero")).includes("9×9"), "two games: still 9×9");
    await page2.close();
    const page = await seededPage({ experience: "rules", playerRank: 25 }, { files });
    const hero = await page.innerText(".today .hero");
    assert(hero.includes("13×13"), `three games: the hero says "${hero.replace(/\s+/g, " ")}"`);
    assert(hero.includes("19×19"), "the next board up is the quieter second offer");
    await page.click(".today .hero .btn.primary");
    await page.waitForFunction(() => window.__state.game?.game.size === 13);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
