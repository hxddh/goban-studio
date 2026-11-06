/**
 * v8 browser checks: the beginner path (capture Go, lesson-to-game bridges, the first count). Loaded by scripts/ui-test.mjs before the
 * visual baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser, audit).
 */
import { COURSE } from "../../src/web/js/content/course.js";
import { MESSAGES } from "../../src/web/js/messages.js";

const KEYS = Object.keys(MESSAGES);
const IDS = COURSE.flatMap((u) => u.lessons.map((l) => l.id));

export default async function ({ check, assert, fresh, onboard, clickPoint, audit }) {
  /**
   * A new player who has done every lesson before `id` and is on its last
   * step: the lesson opens from Practice, its last problem's answer is shown
   * and the lesson finished, leaving its lesson-complete page.
   */
  async function lessonDone(page, id, settings = {}) {
    const before = IDS.slice(0, IDS.indexOf(id));
    const steps = COURSE.flatMap((u) => u.lessons).find((l) => l.id === id).steps.length;
    await page.goto(ORIGIN + "/");
    await page.evaluate(
      ({ before, id, steps, settings }) => {
        localStorage.clear();
        localStorage.setItem("goban-studio.settings.v2", JSON.stringify({ onboarded: true, experience: "new", playerRank: 30, opponentRank: 30, ...settings }));
        const lessons = Object.fromEntries(before.map((l) => [l, { done: true, step: 99, at: 1 }]));
        lessons[id] = { done: false, step: steps - 1, at: 1 };
        localStorage.setItem("goban-studio.progress.v2", JSON.stringify({ v: 5, lessons }));
      },
      { before, id, steps, settings },
    );
    await page.reload();
    await page.waitForFunction(() => window.__state?.ready && document.querySelector(".page"));
    await page.keyboard.press("Control+3");
    await page.waitForFunction(() => window.__state.space === "practice" && window.__state.practice.view === "home" && document.querySelector(".hero .btn.primary"));
    await page.click(".hero .btn.primary");
    await page.waitForFunction((id) => window.__state.practice.lesson?.lesson.id === id, id);
    const kind = await page.evaluate(() => window.__state.practice.lesson.cur.kind);
    if (kind === "problem") await page.click(".panel .actions .btn.ghost >> nth=-1"); // Show answer
    if (kind === "place") {
      await page.waitForFunction(() => window.__board?.geom?.cell > 0 && window.__board.model.interactive);
      const at = await page.evaluate(() => {
        const cur = window.__state.practice.lesson.cur;
        return { x: cur.step.accept[0].x + cur.pz.x0, y: cur.step.accept[0].y + cur.pz.y0 };
      });
      await clickPoint(page, at.x, at.y);
    }
    await page.click(".panel .actions .btn.primary"); // Finish lesson
    await page.waitForSelector(".celebrate");
  }

  async function inspect(page, where) {
    await page.waitForTimeout(60);
    await audit(page, where);
    const bad = await page.evaluate((keys) => {
      const set = new Set(keys);
      const raw = [...new Set(document.body.innerText.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
      const clipped = [...document.querySelectorAll(".btn, .player-name strong, .result-big, .goal, .bridge-lead, .first-count, .tb-title h1")]
        .filter((el) => el.offsetParent !== null && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && getComputedStyle(el).overflow !== "visible")
        .map((el) => el.textContent.trim());
      const overflowing = [...document.querySelectorAll(".btn")].filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      const primaries = [...document.querySelectorAll(".btn.primary")].filter((el) => el.offsetParent !== null).length;
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { raw, clipped: [...clipped, ...overflowing], primaries, overflow };
    }, KEYS);
    assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
    assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
    assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
    assert(!bad.overflow, `${where}: the page scrolls sideways`);
  }

  /** The player's move in capture Go, chosen to end the game fast: a self-atari if there is one, else touching a white stone. */
  async function captureTurn(page) {
    const p = await page.evaluate(() => {
      const K = window.__state.practice.capture;
      const b = K.game.current.board.signMap;
      const n = b.length;
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const libsAfter = (x, y) => {
        const g = b.map((r) => r.slice());
        g[y][x] = 1;
        const seen = new Set([`${x},${y}`]);
        const stack = [[x, y]];
        const libs = new Set();
        while (stack.length) {
          const [cx, cy] = stack.pop();
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
            const k = `${nx},${ny}`;
            if (g[ny][nx] === 0) libs.add(k);
            else if (g[ny][nx] === 1 && !seen.has(k)) {
              seen.add(k);
              stack.push([nx, ny]);
            }
          }
        }
        return libs.size;
      };
      const legal = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (b[y][x] === 0 && K.game.canPlay(x, y).ok) legal.push({ x, y });
      return legal.find(({ x, y }) => libsAfter(x, y) === 1) || legal.find(({ x, y }) => DIRS.some(([dx, dy]) => b[y + dy]?.[x + dx] === -1)) || legal[40] || legal[0];
    });
    const n = await page.evaluate(() => window.__state.practice.capture.game.moveNumber);
    await clickPoint(page, p.x, p.y);
    await page.waitForFunction(
      (n) => {
        const K = window.__state.practice.capture;
        return K.over || (K.game.moveNumber >= n + 2 && !K.thinking);
      },
      n,
      { timeout: 5000 },
    );
  }

  let ORIGIN = null;
  async function start(locale = "en-US") {
    const page = await fresh(locale);
    await onboard(page, 1);
    ORIGIN = new URL(page.url()).origin;
    return page;
  }

  await check("v8 beginner: Back and Forward return to the capture game the player left, as it was", async () => {
    const page = await start();
    await lessonDone(page, "stones-capture");
    await page.click(".celebrate .btn.primary");
    await page.waitForFunction(() => window.__state.practice.view === "capture" && window.__board?.model.size === 9 && window.__board.geom?.cell > 20);
    // One quiet move away from the white stones, and the computer's reply.
    await clickPoint(page, 0, 8);
    await page.waitForFunction(() => window.__state.practice.capture.game.moveNumber >= 2 && !window.__state.practice.capture.thinking, null, { timeout: 5000 });
    const moves = await page.evaluate(() => window.__state.practice.capture.game.moveNumber);
    await page.keyboard.press("Control+1");
    await page.waitForFunction(() => window.__state.space === "today");
    await page.keyboard.press("Control+[");
    await page.waitForFunction(() => window.__state.practice.view === "capture", null, { timeout: 3000 });
    const back = await page.evaluate(() => window.__state.practice.capture.game.moveNumber);
    assert(back === moves, `Back reopened another game: ${back} moves, not ${moves}`);
    await page.keyboard.press("Control+]");
    await page.waitForFunction(() => window.__state.space === "today");
    await page.keyboard.press("Control+[");
    await page.waitForFunction(() => window.__state.practice.view === "capture", null, { timeout: 3000 });
    assert((await page.evaluate(() => window.__state.practice.capture.game.moveNumber)) === moves, "Forward then Back keeps the game");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("v8 beginner: capture Go after the capturing lesson — one primary, a game to the first capture, not saved or rated", async () => {
    const page = await start();
    await lessonDone(page, "stones-capture");
    const card = await page.evaluate(() => ({
      bridge: document.querySelector(".celebrate")?.dataset.bridge,
      primary: [...document.querySelectorAll(".celebrate .btn.primary")].map((b) => b.textContent.trim()),
      secondary: [...document.querySelectorAll(".celebrate .btn.secondary")].map((b) => b.textContent.trim()),
    }));
    assert(card.bridge === "capture", `bridge ${card.bridge}`);
    assert(card.primary.length === 1 && card.primary[0] === "Play a game of capture Go", `primary ${card.primary}`);
    assert(card.secondary.includes("Next lesson"), `secondary ${card.secondary}`);
    const before = await page.evaluate(() => ({ lib: localStorage.getItem("goban-studio.library.v2"), current: localStorage.getItem("goban-studio.current.v2"), games: window.__state.progress.games.length, rating: JSON.stringify(window.__state.progress.rating) }));
    await page.click(".celebrate .btn.primary");
    await page.waitForFunction(() => window.__state.practice.view === "capture" && window.__board?.model.size === 9 && window.__board.geom?.cell > 20);
    assert((await page.textContent(".panel")).includes("Whoever captures a stone first wins."), "the goal");
    await inspect(page, "capture Go");
    // Play until the computer captures (it always does when it can).
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => !!window.__state.practice.capture.over)) break;
      await captureTurn(page);
    }
    const over = await page.evaluate(() => window.__state.practice.capture.over);
    assert(over && over.winner === -1 && over.by === "capture", `over ${JSON.stringify(over)}`);
    await page.waitForSelector(".result-card");
    assert((await page.textContent(".result-big")).trim() === "The computer captured first", "the result line");
    const primary = await page.evaluate(() => [...document.querySelectorAll(".result-card .btn.primary")].map((b) => b.textContent.trim()));
    assert(primary.length === 1 && primary[0] === "Play again", `after a loss: ${primary}`);
    await inspect(page, "capture Go, over");
    // Nothing reached the game, the Library, the records or the estimate.
    const after = await page.evaluate(() => ({ lib: localStorage.getItem("goban-studio.library.v2"), current: localStorage.getItem("goban-studio.current.v2"), games: window.__state.progress.games.length, rating: JSON.stringify(window.__state.progress.rating), wins: window.__state.settings.captureWins || 0 }));
    assert(after.lib === before.lib && after.current === before.current, "a capture game was saved");
    assert(after.games === before.games && after.rating === before.rating, "a capture game was rated");
    assert(after.wins === 0, "a loss counted as a win");
    // Play again: a fresh board, same place.
    await page.click(".result-card .btn.primary");
    await page.waitForFunction(() => window.__state.practice.capture.game.moveNumber === 0 && !window.__state.practice.capture.over);
    // Back returns to the lesson-complete page.
    await page.keyboard.press("Control+BracketLeft");
    await page.waitForSelector(".celebrate[data-bridge=capture]");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("v8 beginner: capture Go is offered after the next two lessons, and not once two are won", async () => {
    const page = await start();
    for (const id of ["stones-groups", "stones-suicide"]) {
      await lessonDone(page, id);
      assert((await page.getAttribute(".celebrate", "data-bridge")) === "capture", id);
    }
    await lessonDone(page, "stones-ko");
    assert((await page.getAttribute(".celebrate", "data-bridge")) === null, "not after ko");
    assert((await page.textContent(".celebrate .btn.primary")).trim() === "Next lesson", "next lesson is primary without a bridge");
    await lessonDone(page, "stones-capture", { captureWins: 2 });
    assert((await page.getAttribute(".celebrate", "data-bridge")) === null, "still offered after two wins");
    // Not in New game, Today or the sidebar.
    await page.keyboard.press("Control+1");
    await page.waitForTimeout(80);
    assert(!(await page.textContent("body")).includes("capture Go"), "Today offers capture Go");
    await page.keyboard.press("Control+n");
    await page.waitForSelector(".sheet");
    assert(!(await page.textContent(".sheet")).includes("capture Go"), "New game offers capture Go");
    await page.close();
  });

  await check("v8 beginner: a capture win counts; the second win brings the stronger level", async () => {
    const page = await start();
    await lessonDone(page, "stones-capture", { captureWins: 1 });
    await page.click(".celebrate .btn.primary");
    await page.waitForFunction(() => window.__state.practice.view === "capture");
    assert((await page.evaluate(() => window.__state.practice.capture.level)) === 1, "level 1 before two wins");
    // Put the computer's stone in atari by hand: the player captures next.
    await page.evaluate(() => {
      const K = window.__state.practice.capture;
      K.game.setup([{ x: 4, y: 4, c: -1 }, { x: 3, y: 4, c: 1 }, { x: 5, y: 4, c: 1 }, { x: 4, y: 3, c: 1 }], 1);
    });
    await page.waitForFunction(() => window.__board?.geom?.cell > 20);
    await clickPoint(page, 4, 5);
    await page.waitForSelector(".result-card");
    assert((await page.textContent(".result-big")).trim() === "You captured first — you win", "the result line");
    const primary = await page.evaluate(() => [...document.querySelectorAll(".result-card .btn.primary")].map((b) => b.textContent.trim()));
    assert(primary.length === 1 && primary[0] === "Next lesson", `after a win: ${primary}`);
    assert((await page.evaluate(() => window.__state.settings.captureWins)) === 2, "the win counted");
    await page.click(".result-card .btn.secondary");
    await page.waitForFunction(() => window.__state.practice.capture.game.moveNumber === 0);
    assert((await page.evaluate(() => window.__state.practice.capture.level)) === 2, "level 2 after two wins");
    await page.close();
  });

  await check("v8 beginner: after the life basics, the first 9×9 game against the gentlest level, teaching on", async () => {
    const page = await start();
    await lessonDone(page, "life-two-eyes");
    assert((await page.getAttribute(".celebrate", "data-bridge")) === "firstGame", "bridge");
    assert((await page.textContent(".celebrate .btn.primary")).trim() === "Play your first 9×9 game", "primary");
    await inspect(page, "lesson complete, first game");
    await page.click(".celebrate .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__state.game.game.moveNumber === 0);
    const g = await page.evaluate(() => ({ size: window.__state.game.game.size, rank: window.__state.game.rank, chosen: window.__state.settings.opponentRank, opponent: window.__state.game.opponent, handicap: window.__state.game.game.handicap, rated: window.__state.game.rated }));
    assert(g.size === 9 && g.chosen === 30 && g.rank === 29 && g.opponent === "ai" && g.handicap === 0, JSON.stringify(g)); // v9: the 30-kyu rank, played by the level that measured 29 kyu
    assert(g.rated, "a normal game is rated");
    await page.close();
  });

  await check("v8 beginner: 'I know the rules' starts a gentle 9×9 game; the first count explains itself once", async () => {
    const page = await fresh();
    await page.goto(ORIGIN + "/");
    await page.waitForSelector(".ob-card");
    await page.click(".ob-card .btn.primary");
    assert((await page.textContent(".choice >> nth=1")).includes("9×9"), "the help text names 9×9");
    await page.click(".choice >> nth=1");
    await page.waitForFunction(() => window.__state.game && window.__board?.model.size === 9 && window.__board.geom?.cell > 20);
    const g = await page.evaluate(() => ({ size: window.__state.game.game.size, opponentRank: window.__state.settings.opponentRank, rank: window.__state.settings.playerRank }));
    assert(g.size === 9 && g.opponentRank === 30, JSON.stringify(g)); // v9: the gentlest rank
    // Nine moves each, then "Count now".
    for (let i = 0; i < 9; i++) {
      const pt = await page.evaluate(() => {
        const G = window.__state.game.game;
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if ((x + y) % 2 === 0 && G.canPlay(x, y).ok && (x === 0 || x === 8 || y === 0 || y === 8)) return { x, y };
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (G.canPlay(x, y).ok) return { x, y };
      });
      const n = await page.evaluate(() => window.__state.game.game.moveNumber);
      await clickPoint(page, pt.x, pt.y);
      // A teaching warning may pause the reply: keep the move.
      await page.waitForFunction(
        (n) => {
          const s = window.__state.game;
          if (s.pending) document.querySelector(".teach .btn.ghost")?.click();
          return s.game.moveNumber >= n + 2 && !s.thinking;
        },
        n,
        { timeout: 15000, polling: 100 },
      );
    }
    await page.click(".panel .menu-wrap > button");
    await page.click(".menu [role=menuitem]:has-text('Count')");
    await page.waitForSelector(".score-card .first-count");
    const note = await page.textContent(".score-card .first-count");
    assert(note.includes("both players pass") && note.includes("komi"), note);
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem("goban-studio.settings.v2")).firstCountSeen)) === true, "persisted");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.keyboard.press("Control+Equal");
    await inspect(page, "score card with the first-count note (dark, larger text)");
    // Keep playing, count again: the note does not come back.
    await page.click(".score-card .btn.ghost");
    await page.waitForFunction(() => !window.__state.game.scoring && !window.__state.game.thinking);
    await page.click(".panel .menu-wrap > button");
    await page.click(".menu [role=menuitem]:has-text('Count')");
    await page.waitForSelector(".score-card");
    await page.waitForTimeout(100);
    assert((await page.locator(".score-card .first-count").count()) === 0, "the note came back");
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
    await check(`v8 beginner: bridges and capture Go in ${c.locale}, ${c.scheme}${c.large ? ", larger text" : ""} — audit, no clipping`, async () => {
      const page = await start(c.locale);
      await page.emulateMedia({ colorScheme: c.scheme });
      await lessonDone(page, "stones-capture", c.large ? { largeText: true } : {});
      await inspect(page, "lesson complete, capture Go");
      await page.click(".celebrate .btn.primary");
      await page.waitForFunction(() => window.__state.practice.view === "capture" && window.__board?.geom?.cell > 20);
      await inspect(page, "capture Go");
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate(() => !!window.__state.practice.capture.over)) break;
        await captureTurn(page);
      }
      await page.waitForSelector(".result-card");
      await inspect(page, "capture Go, over");
      await lessonDone(page, "life-space", c.large ? { largeText: true } : {});
      await inspect(page, "lesson complete, first game");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });
  }
}
