/**
 * Shell: the board as it is painted — its colours in the light and dark
 * themes and in the high-contrast style (pixels read back from the
 * canvas), thumbnails in the same colours, and the narrow window, where
 * the panel is a bar under the board and nothing a game, a lesson or a
 * problem needs is below the fold.
 *
 * Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { boardPalette, contrast, luminance } from "../../src/web/js/theme.js";

const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const lum = (rgb) => luminance(hex(rgb));

export default async function ({ check, assert, fresh, onboard, clickPoint, origin, browser }) {
  /** Someone who has used the app, with these settings, at Today. */
  async function seededPage(settings = {}, { locale = "en-US", viewport, scheme = "light", files = {} } = {}) {
    const page = await fresh(locale, viewport);
    await page.emulateMedia({ colorScheme: scheme });
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
  /** A two-player 9×9 game with a black stone at C7 and G7 and a white one at G3. */
  async function position(page) {
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__board?.model.size === 9 && window.__board.geom?.cell > 20);
    const pts = [[2, 2], [6, 6], [6, 2]];
    for (let i = 0; i < pts.length; i++) {
      await clickPoint(page, ...pts[i]);
      await page.waitForFunction((n) => window.__state.game?.game.moveNumber === n, i + 1, { timeout: 3000 });
    }
  }
  /**
   * Colours read from the board canvas: the surface (the middle of a cell,
   * away from lines), a line (the darkest and the lightest pixel across
   * one), and each stone a little off its centre (off any mark).
   */
  const sample = (page) =>
    page.evaluate(async () => {
      // The board repaints after a theme change on its own; let it.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const bv = window.__board;
      const g = bv.geom;
      const ctx = bv.canvas.getContext("2d");
      const at = (x, y) => [...ctx.getImageData(Math.round((g.ox + x * g.cell) * bv.dpr), Math.round((g.oy + y * g.cell) * bv.dpr), 1, 1).data.slice(0, 3)];
      // A stone's colour: the mean over the middle of the disc (its shading runs from a highlight to a darker edge).
      const mean = (x, y) => {
        const sum = [0, 0, 0];
        let n = 0;
        for (let dy = -0.2; dy <= 0.201; dy += 0.1) {
          for (let dx = -0.2; dx <= 0.201; dx += 0.1) {
            const c = at(x + dx, y + dy);
            for (let i = 0; i < 3; i++) sum[i] += c[i];
            n++;
          }
        }
        return sum.map((v) => Math.round(v / n));
      };
      const across = [];
      for (let d = -3; d <= 3; d++) across.push([...ctx.getImageData(Math.round((g.ox + 4 * g.cell) * bv.dpr) + d, Math.round((g.oy + 3.5 * g.cell) * bv.dpr), 1, 1).data.slice(0, 3)]);
      const l = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const sorted = [...across].sort((a, b) => l(a) - l(b));
      return {
        theme: document.documentElement.dataset.theme,
        board: document.documentElement.dataset.board,
        surface: at(3.5, 3.5),
        lineDark: sorted[0],
        lineLight: sorted[sorted.length - 1],
        black: mean(2, 2),
        white: mean(6, 6),
        blackEdge: at(2 + 0.455, 2),
        whiteEdge: at(6 + 0.455, 6),
        frame: getComputedStyle(document.querySelector(".board-frame")).backgroundColor,
      };
    });
  const setAppearance = async (page, n) => {
    await page.keyboard.press("Control+,");
    await page.click(".settings-tab[data-pane=general]");
    await page.click(`.settings-pane .row:has-text("Theme") .segmented button >> nth=${n}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".sheet", { state: "detached" });
  };
  const setBoardStyle = async (page, n) => {
    await page.keyboard.press("Control+,");
    await page.click(".settings-tab[data-pane=board]");
    await page.click(`.settings-pane .segmented.board-style button >> nth=${n}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".sheet", { state: "detached" });
  };

  await check("shell board: in the dark theme the board is the same board dimmer — surface, lines and stones keep their contrast; it follows System live", async () => {
    const page = await seededPage({ appearance: "light" });
    await position(page);
    const light = await sample(page);
    assert(light.theme === "light" && light.board === "standard", JSON.stringify([light.theme, light.board]));
    assert(lum(light.surface) > 0.5, `light surface luminance ${lum(light.surface).toFixed(3)}`);
    assert(lum(light.white) > 0.65, `a white stone in the light theme ${lum(light.white).toFixed(3)}`);
    // Dark, chosen in Settings: no reload, the board repaints.
    await setAppearance(page, 2);
    const dark = await sample(page);
    assert(dark.theme === "dark", dark.theme);
    const L = lum(dark.surface);
    assert(L < 0.3, `dark surface luminance ${L.toFixed(3)} (the light board is ${lum(light.surface).toFixed(3)})`);
    assert(L > 0.1, `the dark board is still a board, not a black square: ${L.toFixed(3)}`);
    assert(hex(dark.surface).toLowerCase() !== hex(light.surface).toLowerCase(), "the surface did not change");
    // The same board: warm (red ≥ green ≥ blue), close to the palette.
    assert(dark.surface[0] > dark.surface[1] && dark.surface[1] > dark.surface[2], `not the warm board: ${dark.surface}`);
    assert(contrast(hex(dark.surface), boardPalette({ dark: true }).base) < 1.15, `surface ${hex(dark.surface)} vs palette ${boardPalette({ dark: true }).base}`);
    // Stones against the dimmer board, and against each other.
    const kB = contrast(hex(dark.black), hex(dark.surface));
    const kW = contrast(hex(dark.white), hex(dark.surface));
    assert(kB >= 3, `black stone on the dark board ${kB.toFixed(2)}:1`);
    assert(kW >= 2, `white stone on the dark board ${kW.toFixed(2)}:1`);
    assert(contrast(hex(dark.black), hex(dark.white)) >= 8, "black against white");
    // White does not glare: clearly dimmer than in the light theme, still unmistakably white.
    assert(lum(dark.white) < lum(light.white) - 0.08 && lum(dark.white) > 0.45, `white stone ${lum(dark.white).toFixed(3)} (light theme ${lum(light.white).toFixed(3)})`);
    // In the light theme a white stone is told from the board by its shadow more than its tone; in the dark one by its tone.
    assert(kW > contrast(hex(light.white), hex(light.surface)), "white parts from the dark board better than from the light one");
    // Lines stay readable.
    const kLine = contrast(hex(dark.lineDark), hex(dark.surface));
    assert(kLine >= 2, `grid line on the dark board ${kLine.toFixed(2)}:1`);
    // The frame behind the canvas is the same colour (no light flash at the edges).
    const frame = dark.frame.match(/\d+/g).slice(0, 3).map(Number);
    assert(contrast(hex(frame), hex(dark.surface)) < 1.15, `board frame ${dark.frame}`);
    // System: the theme follows the OS while the app is open, and the board with it.
    await setAppearance(page, 0);
    assert((await sample(page)).theme === "light", "System with a light OS");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    const auto = await sample(page);
    assert(lum(auto.surface) < 0.3, `the board did not follow the system to dark: ${hex(auto.surface)}`);
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    assert(lum((await sample(page)).surface) > 0.5, "…and back to light");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return `dark surface ${hex(dark.surface)} L ${L.toFixed(2)}; black ${kB.toFixed(1)}:1, white ${kW.toFixed(1)}:1, lines ${kLine.toFixed(1)}:1`;
  });

  await check("shell board: the high-contrast board (Settings → Board) is near-white or near-black with strong lines and rimmed stones; forced colours use it by themselves", async () => {
    const page = await seededPage({ appearance: "light" });
    await position(page);
    await setBoardStyle(page, 1);
    const light = await sample(page);
    assert(light.board === "contrast", light.board);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem("goban9:settings.json") || "{}").boardStyle === "contrast" || window.__state.settings.boardStyle === "contrast"), "the choice is a setting");
    assert(lum(light.surface) > 0.9, `near-white: ${hex(light.surface)}`);
    assert(contrast(hex(light.lineDark), hex(light.surface)) >= 7, `lines ${contrast(hex(light.lineDark), hex(light.surface)).toFixed(1)}:1`);
    assert(contrast(hex(light.black), hex(light.surface)) >= 12, "black stones");
    // A white stone on a white board is its rim.
    assert(lum(light.white) > 0.9, "white stones are white");
    assert(contrast(hex(light.whiteEdge), hex(light.surface)) >= 7, `the white stone's rim ${hex(light.whiteEdge)}`);
    // Dark.
    await setAppearance(page, 2);
    const dark = await sample(page);
    assert(lum(dark.surface) < 0.03, `near-black: ${hex(dark.surface)}`);
    assert(contrast(hex(dark.lineLight), hex(dark.surface)) >= 5, `lines ${contrast(hex(dark.lineLight), hex(dark.surface)).toFixed(1)}:1`);
    assert(contrast(hex(dark.white), hex(dark.surface)) >= 12, "white stones");
    assert(contrast(hex(dark.blackEdge), hex(dark.surface)) >= 7, `the black stone's rim ${hex(dark.blackEdge)}`);
    // Back to the standard board.
    await setBoardStyle(page, 0);
    const std = await sample(page);
    assert(std.board === "standard" && lum(std.surface) > 0.1 && lum(std.surface) < 0.3, `standard dark again: ${hex(std.surface)}`);
    // Forced colours (Windows high contrast): the plain board without asking.
    await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
    await page.waitForTimeout(100);
    const forced = await sample(page);
    assert(lum(forced.surface) < 0.03 || lum(forced.surface) > 0.9, `forced colours keep the wooden board: ${hex(forced.surface)}`);
    await page.emulateMedia({ forcedColors: "none", colorScheme: "dark" });
    await page.waitForTimeout(100);
    assert(lum((await sample(page)).surface) > 0.1, "…and the standard board comes back");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell board: the last move is a thin ring on the stone, not a filled dot; Settings can leave it out", async () => {
    const page = await seededPage({ appearance: "light" });
    await position(page);
    // The last stone is black at G7 (6, 2); before it, white at G3 (6, 6).
    const ring = () =>
      page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const bv = window.__board;
        const g = bv.geom;
        const j = bv.jitter(6, 2);
        const ctx = bv.canvas.getContext("2d");
        const l = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const at = (dx, dy) => l(ctx.getImageData(Math.round((g.ox + 6 * g.cell + j.dx + dx) * bv.dpr), Math.round((g.oy + 2 * g.cell + j.dy + dy) * bv.dpr), 1, 1).data);
        return { centre: at(0, 0), ring: Math.max(at(g.cell * 0.2, 0), at(-g.cell * 0.2, 0), at(0, g.cell * 0.2), at(0, -g.cell * 0.2)), cell: g.cell };
      });
    const on = await ring();
    assert(on.ring > 150, `a light ring on the black stone (${on.ring.toFixed(0)})`);
    assert(on.centre < 110, `its centre is the stone, not a dot (${on.centre.toFixed(0)})`);
    // Off in Settings → Board (the third switch).
    await page.keyboard.press("Control+,");
    await page.click(".settings-tab[data-pane=board]");
    await page.click(".settings-pane .switch >> nth=2");
    await page.waitForFunction(() => window.__state.settings.lastMoveMark === false);
    await page.keyboard.press("Escape");
    const off = await ring();
    assert(off.ring < 110, `the ring is gone (${off.ring.toFixed(0)})`);
    await page.close();
  });

  await check("shell board: thumbnails take the board's colours and stay legible — a 19×19 at 44 px shows discs with a rim at 1× and 2×", async () => {
    // A 19×19 record in the Library: a white stone at D4 (3, 15) alone, black around K10.
    const cells = Array(361).fill(".");
    cells[15 * 19 + 3] = "w";
    for (const [x, y] of [[9, 9], [10, 9], [9, 10], [3, 3], [15, 15]]) cells[y * 19 + x] = "b";
    const at = Date.UTC(2026, 9, 2);
    const game = JSON.stringify({ v: 13, id: "big", createdAt: at, updatedAt: at, finishedAt: at, source: "game", sgf: "(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]RE[B+R];B[dd];W[dp])", meta: { size: 19, rules: "japanese", komi: 6.5, handicap: 0, moves: 2, result: "B+R", date: new Date(at).toISOString(), playerBlack: "", playerWhite: "", thumb: cells.join(""), name: "A full board", opponent: "human" } });
    const read = (page) =>
      page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const c = document.querySelector(".game-row .thumb");
        const ctx = c.getContext("2d");
        const css = c.getBoundingClientRect().width;
        const n = 19;
        const cell = Math.max(1, Math.floor(c.width / n));
        const ox = Math.floor((c.width - cell * n) / 2);
        const px = (x, y, dx = 0) => [...ctx.getImageData(Math.floor(ox + x * cell + cell / 2 + dx), Math.floor(ox + y * cell + cell / 2), 1, 1).data.slice(0, 3)];
        return { width: c.width, css, cell, corner: [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)], white: px(3, 15, -0.5), rim: px(3, 15, cell / 2 + 0.25), black: px(9, 9, -0.5), empty: px(6, 6, -0.5) };
      });
    const out = [];
    for (const dpr of [1, 2]) {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 }, locale: "en-US", reducedMotion: "reduce", deviceScaleFactor: dpr, colorScheme: "light" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((file) => {
        if (localStorage.getItem("goban9:settings.json")) return;
        localStorage.setItem("goban9:settings.json", JSON.stringify({ v: 13, lang: "en", onboarded: true, appearance: "light" }));
        localStorage.setItem("goban9:games/big.json", file);
      }, game);
      await page.goto(origin + "/");
      await page.waitForSelector(".today");
      await page.keyboard.press("Control+4");
      await page.waitForSelector(".game-row .thumb");
      const t = await read(page);
      assert(t.css === 44, `the row's thumbnail is ${t.css} css px`);
      assert(t.width === 44 * dpr, `drawn at device pixels: ${t.width} for ${dpr}×`);
      assert(t.cell === 2 * dpr, `cell ${t.cell}`);
      const base = boardPalette().base;
      assert(hex(t.corner).toLowerCase() === base.toLowerCase(), `surface ${hex(t.corner)} is the board's ${base}`);
      assert(lum(t.white) > 0.8, `${dpr}×: the white stone is a white disc (${hex(t.white)})`);
      assert(lum(t.black) < 0.05, `${dpr}×: the black stones are black discs (${hex(t.black)})`);
      // The hairline rim: just outside the white stone the pixel is darker than the bare board.
      assert(lum(t.rim) < lum(t.corner) - 0.04, `${dpr}×: no rim around the white stone (${hex(t.rim)} against ${hex(t.corner)})`);
      // At 1× (two pixels a cell) there is no grid to smear the picture: an empty point is the plain surface.
      if (dpr === 1) assert(hex(t.empty) === hex(t.corner), `a grid at two pixels a cell (${hex(t.empty)})`);
      out.push(`${dpr}×: ${t.width} px, ${t.cell} px cells`);
      // The dark theme: the thumbnail's surface is the dark board's.
      if (dpr === 1) {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.keyboard.press("Control+,");
        await page.click(`.settings-pane .row:has-text("Theme") .segmented button >> nth=2`);
        await page.keyboard.press("Escape");
        const d = await read(page);
        assert(hex(d.corner).toLowerCase() === boardPalette({ dark: true }).base.toLowerCase(), `dark thumbnail surface ${hex(d.corner)}`);
        assert(lum(d.white) > 0.5 && lum(d.white) < lum(t.white), "its white stones are toned down too");
        // The size cards of New game and the app's mark take the same surface.
        await page.keyboard.press("Control+n");
        await page.waitForSelector(".mini-grid rect");
        const fills = await page.evaluate(() => [getComputedStyle(document.querySelector(".mini-grid rect")).fill, getComputedStyle(document.querySelector(".sb-mark .mark-board")).fill]);
        for (const f of fills) assert(hex(f.match(/\d+/g).slice(0, 3).map(Number)).toLowerCase() === boardPalette({ dark: true }).base.toLowerCase(), `mini board fill ${f}`);
      }
      assert(errors.length === 0, errors.join("; "));
      await ctx.close();
    }
    return out.join("; ");
  });

  /* ------------------------------------------------------ narrow windows */

  /** Whether each selector's first match is wholly inside the window. */
  const inView = (page, selectors) =>
    page.evaluate((sels) => {
      const out = {};
      for (const sel of sels) {
        const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
        if (!el) {
          out[sel] = "missing";
          continue;
        }
        const r = el.getBoundingClientRect();
        // Inside the window, and not scrolled out of its own panel.
        const panel = el.closest(".panel")?.getBoundingClientRect();
        const ok = r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5 && (!panel || (r.top >= panel.top - 0.5 && r.bottom <= panel.bottom + 0.5));
        out[sel] = ok ? "ok" : `at ${Math.round(r.top)}–${Math.round(r.bottom)} of ${innerHeight}`;
      }
      return out;
    }, selectors);
  const allIn = (res) => Object.entries(res).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}: ${v}`);

  for (const [w, h] of [[720, 720], [800, 720]]) {
    await check(`shell board: at ${w}×${h} a game keeps its clocks, status, Pass and Undo in view without scrolling; the move list is behind a disclosure`, async () => {
      const page = await seededPage({ appearance: "light", lang: "en" }, { viewport: { width: w, height: h } });
      // New game: the clock is chosen without opening More options.
      await page.keyboard.press("Control+n");
      await page.click(".preset >> nth=2");
      assert(await page.evaluate(() => document.querySelector(".sheet .disclosure").getAttribute("aria-expanded") === "false"), "More options starts closed");
      const time = page.locator('.sheet .row:has-text("Clock") .segmented button');
      assert((await time.count()) === 3, "the time control is on the sheet itself");
      await time.nth(1).click();
      await page.click(".sheet-foot .btn.primary");
      await page.waitForFunction(() => window.__state.space === "play" && window.__board?.model.size === 9 && !!window.__state.game.clock);
      await page.waitForSelector(".player .clock");
      const res = await inView(page, ["canvas.board", ".players", ".player .clock", ".panel .status-line", ".panel .actions", ".panel .actions .btn:nth-child(1)", ".panel .actions .btn:nth-child(2)"]);
      assert(allIn(res).length === 0, allIn(res).join("; "));
      assert((await page.locator(".player .clock").count()) === 2, "both clocks");
      const labels = await page.locator(".panel .actions .btn").allInnerTexts();
      assert(labels[0].trim() === "Pass" && labels[1].trim() === "Undo", `actions: ${labels}`);
      // Nothing scrolls: not the page, not the workspace, not the panel.
      const scroll = await page.evaluate(() => {
        const over = (el) => el.scrollHeight > el.clientHeight + 1;
        return { page: document.documentElement.scrollHeight > innerHeight + 1, workspace: over(document.querySelector(".workspace")), panel: over(document.querySelector(".panel")) };
      });
      assert(!scroll.page && !scroll.workspace && !scroll.panel, `something scrolls: ${JSON.stringify(scroll)}`);
      // The board keeps most of the window.
      const board = await page.evaluate(() => document.querySelector("canvas.board").getBoundingClientRect().width);
      assert(board >= 400, `the board is ${Math.round(board)} px wide`);
      // The two players sit side by side.
      const rows = await page.evaluate(() => [...document.querySelectorAll(".player")].map((el) => Math.round(el.getBoundingClientRect().top)));
      assert(rows[0] === rows[1], `the players are stacked: ${rows}`);
      // The move list: behind its disclosure, one click away.
      await clickPoint(page, 4, 4);
      await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
      assert((await page.locator(".narrow-fold .disclosure").getAttribute("aria-expanded")) === "false", "the move list starts closed");
      assert((await page.locator(".panel .moves").count()) === 0, "the move list is shown in a narrow window");
      await page.click(".narrow-fold .disclosure");
      await page.waitForSelector(".panel .move-grid li");
      const after = await inView(page, [".player .clock", ".panel .status-line", ".panel .actions .btn:nth-child(1)", ".panel .actions .btn:nth-child(2)"]);
      assert(allIn(after).length === 0, `with the move list open: ${allIn(after).join("; ")}`);
      // A wide window shows the list as before, with no disclosure.
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForSelector(".panel .moves");
      assert((await page.locator(".narrow-fold").count()) === 0, "a disclosure in a wide window");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
      return `board ${Math.round(board)} px`;
    });
  }

  await check("shell board: at 720×720 a lesson keeps its text and its button in view, and a problem its goal and its buttons", async () => {
    const page = await fresh("en-US", { width: 720, height: 720 });
    await onboard(page, 0);
    await page.waitForSelector(".panel .lesson-text");
    const lesson = await inView(page, ["canvas.board", ".panel .lesson-text", ".panel .actions .btn"]);
    assert(allIn(lesson).length === 0, `lesson: ${allIn(lesson).join("; ")}`);
    assert(!(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 || document.querySelector(".workspace").scrollHeight > document.querySelector(".workspace").clientHeight + 1)), "the lesson page scrolls");
    // A problem (the first of the first topic).
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".topic-row");
    await page.click(".topic-row >> nth=0");
    await page.waitForSelector(".problem-card, .problem-row, .problem-tile");
    await page.click(".problem-card, .problem-row, .problem-tile >> nth=0");
    await page.waitForFunction(() => window.__state.learn.view === "problem", null, { timeout: 5000 });
    await page.waitForSelector(".panel .goal");
    const problem = await inView(page, ["canvas.board", ".panel .goal", ".panel .actions .btn"]);
    assert(allIn(problem).length === 0, `problem: ${allIn(problem).join("; ")}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
