/**
 * Play, in the browser: what is kept only on purpose and what can be taken
 * back. A line tried in the review (Keep / Discard, and what a reload
 * finds), the review's undo, ← and → during a game, redo, the pass asked
 * in the panel, the game that is not rated, the count on the board and
 * counting again, the toolbar's names, and the free board. Loaded by
 * scripts/ui-test.mjs; receives its helpers.
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** A two-player 9×9 game on the board. */
  async function humanGame(page) {
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__board?.model.size === 9 && window.__state.game?.game.moveNumber === 0);
  }
  /** Play points in turn, each waited for. */
  async function play(page, pts) {
    const from = await page.evaluate(() => window.__state.game.game.moveNumber);
    for (let i = 0; i < pts.length; i++) {
      await clickPoint(page, ...pts[i]);
      await page.waitForFunction((n) => window.__state.game.game.moveNumber === n, from + i + 1, { timeout: 3000 });
    }
  }
  const noErrors = (page) => assert(page.errors.length === 0, page.errors.join("; "));
  const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem("goban9:" + k) || "null"), key);
  /** The two walls: eighteen moves, Black ahead by 2.5 when nothing is dead. */
  const WALLS = Array.from({ length: 9 }, (_, y) => [[4, y], [5, y]]).flat();

  await check("play edits: a stone in the review is a line being tried — Esc and Discard drop it, Keep adds it, and a reload finds only what was kept", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await humanGame(page);
    await play(page, [[2, 2], [6, 6], [2, 6], [6, 2]]);
    await page.keyboard.press("Control+Shift+R");
    await page.waitForSelector(".review-layer");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => window.__state.review.game.moveNumber === 2);
    // A stone: the bar says a variation is being tried, with Keep and Discard.
    await clickPoint(page, 1, 7);
    await page.waitForSelector(".draft-bar");
    const bar = (await page.textContent(".draft-bar")).replace(/\s+/g, " ");
    assert(bar.includes("Trying a variation") && bar.includes("Keep") && bar.includes("Discard"), bar);
    assert((await page.locator(".var-bar:not(.draft-bar)").count()) === 0, "it is not a variation of the record yet");
    // ← stays at the position the line left; → comes back into the line.
    // (With the focus on the board the arrows move its cursor: they are pressed from the page.)
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert(await page.evaluate(() => window.__state.review.game.moveNumber === 2 && !!window.__state.review.draft), "← stops where the line left the game");
    await page.keyboard.press("ArrowRight");
    assert(await page.evaluate(() => window.__state.review.game.current === window.__state.review.draft.head), "→ follows the line being tried");
    // Esc drops the line (and does not close the review).
    await page.keyboard.press("Escape");
    await page.waitForSelector(".draft-bar", { state: "detached" });
    assert(await page.evaluate(() => !!window.__state.review && window.__state.review.game.moveNumber === 2 && window.__state.review.game.current.children.length === 1), "Esc returned to the position left, the review still open");
    // → follows the main line again.
    await page.keyboard.press("ArrowRight");
    assert(await page.evaluate(() => window.__state.review.game.mainLine()[3] === window.__state.review.game.current), "after a discard → is the main line");
    await page.keyboard.press("ArrowLeft");
    // Tried again and discarded with the button; then another line, kept.
    await clickPoint(page, 1, 7);
    await page.waitForSelector(".draft-bar");
    await page.click(".draft-bar .link >> nth=1");
    await page.waitForSelector(".draft-bar", { state: "detached" });
    await clickPoint(page, 7, 1);
    await page.waitForSelector(".draft-bar");
    await page.click(".draft-bar .link >> nth=0");
    await page.waitForSelector(".var-bar:not(.draft-bar)");
    assert(await page.evaluate(() => window.__state.review.draft === null && window.__state.review.game.mainLine()[2].children.length === 2), "kept as a variation of the record");
    // A third line, left on the board when the review closes: never saved.
    await page.click(".var-bar .link >> nth=0");
    await clickPoint(page, 0, 0);
    await page.waitForSelector(".draft-bar");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".draft-bar", { state: "detached" });
    await clickPoint(page, 8, 8);
    await page.waitForSelector(".draft-bar");
    await page.click(".back-to-game");
    await page.waitForSelector(".review-layer", { state: "detached" });
    assert(await page.evaluate(() => window.__state.game.game.moveNumber === 4), "the game is where it was");
    // What is on disk: the kept variation (H8 = hb) and nothing else that was tried.
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem("goban9:current.json") || "{}").sgf || "").includes("[hb]"), null, { timeout: 3000 });
    await page.reload();
    await page.waitForSelector(".sidebar");
    const sgf = (await stored(page, "current.json")).sgf;
    assert(sgf.includes("[hb]"), "the kept variation is saved, with no comment typed: " + sgf);
    for (const p of ["[bh]", "[aa]", "[ii]"]) assert(!sgf.includes(p), `a line that was not kept was saved (${p}): ${sgf}`);
    noErrors(page);
    await page.close();
  });

  await check("play edits: in a review ⌘Z undoes a comment and brings back a deleted variation; in a game it takes back a move, ⇧⌘Z plays it again, and ← does not leave the game", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await humanGame(page);
    await play(page, [[2, 2], [6, 6], [2, 6], [6, 2]]);
    // ← and → during a game do nothing: no review opens, the game goes on.
    await page.focus("body");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    assert(await page.evaluate(() => window.__state.review === null && window.__state.game.game.moveNumber === 4), "← opened a review during the game");
    // ⌘Z takes back a move; ⇧⌘Z plays it again.
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 3);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 4 && window.__state.game.redo.length === 0);
    assert(await page.evaluate(() => window.__state.game.game.current.move.x === 6 && window.__state.game.game.current.move.y === 2), "the same move is back");
    // "Review so far" has a clear way back.
    await page.keyboard.press("Control+Shift+R");
    await page.waitForSelector(".review-layer .back-to-game");
    assert((await page.locator(".review-layer .btn.primary:visible").count()) === 1, "one primary: Back to the game");
    assert((await page.textContent(".back-to-game")).trim() === "Back to the game", await page.textContent(".back-to-game"));
    // A comment, undone and redone from the keyboard (the focus not in the box).
    await page.keyboard.press("ArrowLeft");
    await page.click(".review-tabs button >> nth=-1");
    await page.fill(".comment-box", "Too slow here");
    await page.locator(".comment-box").blur();
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem("goban9:current.json") || "{}").sgf || "").includes("Too slow here"), null, { timeout: 3000 });
    await page.focus("canvas.board");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.querySelector(".comment-box").value === "");
    assert(await page.evaluate(() => window.__state.game.game.mainLine().length === 5), "⌘Z in the review took back a move of the game");
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(() => document.querySelector(".comment-box").value === "Too slow here");
    // The same from the two small buttons.
    await page.click(".edit-history .icon-btn >> nth=0");
    await page.waitForFunction(() => document.querySelector(".comment-box").value === "");
    await page.click(".edit-history .icon-btn >> nth=1");
    await page.waitForFunction(() => document.querySelector(".comment-box").value === "Too slow here");
    // A kept variation, deleted: the toast offers Undo, and Undo brings it back.
    await page.click(".review-tabs button >> nth=0");
    await clickPoint(page, 7, 1);
    await page.waitForSelector(".draft-bar");
    await page.click(".draft-bar .link >> nth=0");
    await page.waitForSelector(".var-bar:not(.draft-bar)");
    await page.click(".var-bar .link.danger");
    await page.waitForSelector(".toast .toast-action");
    assert((await page.textContent(".toast .toast-text")) === "Variation deleted", await page.textContent(".toast .toast-text"));
    assert(await page.evaluate(() => window.__state.review.game.mainLine()[3].children.length === 1), "the variation is gone");
    await page.click(".toast .toast-action");
    await page.waitForFunction(() => window.__state.review.game.mainLine()[3].children.length === 2);
    await page.waitForSelector(".var-bar:not(.draft-bar)");
    noErrors(page);
    await page.close();
  });

  await check("play edits: against the computer, undo takes back the pair and says once the game will not be rated; redo restores the pair with no new reply; the result says why it was not rated", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__board?.model.size === 9 && window.__state.game?.opponent === "ai" && window.__state.game.rated === true);
    const reply = (n) => page.waitForFunction((k) => window.__state.game.game.moveNumber === k && !window.__state.game.thinking, n, { timeout: 20000 });
    const free = async () => {
      const p = await page.evaluate(() => {
        const b = window.__state.game.game.current.board.signMap;
        for (const [x, y] of [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 3], [5, 5], [4, 2], [2, 4]]) if (!b[y][x] && window.__state.game.game.canPlay(x, y).ok) return [x, y];
        return null;
      });
      await clickPoint(page, ...p);
    };
    await free();
    await reply(2);
    await free();
    await reply(4);
    const line = () => page.evaluate(() => window.__state.game.game.mainLine().slice(1).map((n) => (n.move.pass ? "pass" : `${n.move.x},${n.move.y}`)).join(" "));
    const before = await line();
    // Undo: the player's move and the reply to it; a quiet word that the game is no longer rated.
    await page.click(".panel .actions .btn >> nth=1");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 2);
    await page.waitForFunction(() => window.__state.toasts.some((x) => x.message.startsWith("This game will not be rated") && x.tone === "info"));
    // Redo, from the menu: the same pair, and the computer is not asked again.
    await page.click(".panel .menu-wrap .icon-btn");
    await page.click(".menu [role=menuitem] >> nth=0");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 4);
    assert((await line()) === before, `redo played other moves: ${await line()} — was ${before}`);
    assert(await page.evaluate(() => window.__state.game.thinking === false && window.__state.game.game.turn === window.__state.game.humanColor), "it is the player's turn, nobody thinking");
    // Undone for good this time, then resigned: the result line says why it is not rated.
    await page.click(".panel .actions .btn >> nth=1");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 2 && window.__state.game.undos === 1);
    assert(await page.evaluate(() => window.__state.toasts.filter((x) => x.message.startsWith("This game will not be rated")).length <= 1), "said once per game");
    await page.click(".panel .menu-wrap .icon-btn");
    await page.click(".menu [role=menuitem] >> nth=-1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForSelector(".review-layer .review-result");
    const note = await page.textContent(".review-result .unrated-note");
    assert(note === "Not rated: you took back moves", note);
    noErrors(page);
    await page.close();
  });

  await check("play edits: the first pass is asked in the panel (no sheet), later passes are played at once and said in the status line; the count shows on the board; Count again replaces the result", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await humanGame(page);
    await play(page, WALLS.slice(0, 16));
    // The first pass: a question in the panel, its button focused; Esc takes it away.
    await page.keyboard.press("Control+Shift+P");
    await page.waitForSelector(".panel .pass-ask");
    assert(await page.evaluate(() => window.__state.sheet === null && !document.querySelector(".sheet")), "no sheet for a pass");
    await page.waitForFunction(() => document.activeElement?.matches(".pass-ask .btn.primary"), null, { timeout: 2000 }).catch(() => {
      throw new Error("the question's action does not take the focus");
    });
    assert((await page.locator(".panel .btn.primary:visible").count()) === 1, "one primary in the panel");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".pass-ask", { state: "detached" });
    assert(await page.evaluate(() => window.__state.game.game.moveNumber === 16), "Esc did not pass");
    await page.keyboard.press("Control+Shift+P");
    await page.click(".pass-ask .btn.primary");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 17);
    let status = await page.textContent(".status-line");
    assert(status.startsWith("Black passed") && status.includes("White to play"), status);
    // White plays on; Black's next pass needs no question, and Undo takes it back.
    await play(page, [[5, 8]]);
    await page.keyboard.press("Control+Shift+P");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 19 && window.__state.game.passAsk === null);
    assert((await page.locator(".pass-ask").count()) === 0, "a later pass is played at once");
    status = await page.textContent(".status-line");
    assert(status.startsWith("Black passed"), status);
    assert(await page.evaluate(() => !document.querySelector(".panel .actions .btn:nth-child(2)").disabled), "Undo is available");
    await page.click(".panel .actions .btn >> nth=1");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 18);
    await play(page, [[4, 8]]);
    // Two passes in a row: the second is asked (it ends the game), then the count.
    await page.keyboard.press("Control+Shift+P");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 20);
    await page.keyboard.press("Control+Shift+P");
    await page.waitForSelector(".pass-ask");
    assert((await page.textContent(".pass-ask p")).includes("the game ends and is counted"), await page.textContent(".pass-ask p"));
    await page.click(".pass-ask .btn.primary");
    await page.waitForSelector(".score-card .btn.primary:not([disabled])");
    // The count is on the board: territory of both colours, and a dead group fades.
    const onBoard = () =>
      page.evaluate(() => {
        const m = window.__board.model;
        const flat = (m.territory || []).flat();
        return { black: flat.filter((v) => v === 1).length, white: flat.filter((v) => v === -1).length, dead: m.deadStones.length };
      });
    let seen = await onBoard();
    assert(seen.black === 36 && seen.white === 27 && seen.dead === 0, JSON.stringify(seen));
    assert((await page.textContent(".score-card .score-result")) === "Black wins by 2.5", await page.textContent(".score-card .score-result"));
    assert((await page.textContent(".score-card .score-legend")).includes("territory"), "the card says what the board shows");
    await page.click(".score-card .btn.primary");
    await page.waitForSelector(".review-layer .review-result");
    assert((await page.textContent(".review-result .result-big")).includes("Black wins by 2.5"), await page.textContent(".review-result .result-big"));
    // Count again, from the result's menu.
    await page.click(".result-head .menu-wrap .icon-btn");
    const items = (await page.locator(".menu [role=menuitem]").allTextContents()).map((s) => s.trim());
    assert(JSON.stringify(items) === JSON.stringify(["Count again"]), items.join(" | "));
    await page.click(".menu [role=menuitem] >> nth=0");
    await page.waitForSelector(".review-panel .score-card .btn.primary:not([disabled])");
    assert((await page.locator(".review-panel .btn.primary:visible").count()) === 1, "one primary while counting again");
    seen = await onBoard();
    assert(seen.black === 36 && seen.white === 27, "the same count, on the review's board: " + JSON.stringify(seen));
    // Black's wall was dead after all.
    await clickPoint(page, 4, 0);
    await page.waitForFunction(() => window.__state.review.recount.dead.length === 9);
    seen = await onBoard();
    assert(seen.dead === 9 && seen.black === 0, JSON.stringify(seen));
    await page.click(".review-panel .score-card .btn.primary");
    await page.waitForFunction(() => window.__state.review.recount === null && window.__state.toasts.some((x) => x.message.startsWith("Result updated")));
    const headline = await page.textContent(".review-result .result-big");
    assert(headline.includes("White wins by"), headline);
    // The stored record has the new result, after a reload too.
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("goban9:games/") && /^W\+/.test(JSON.parse(localStorage.getItem(k)).meta.result || "")), null, { timeout: 3000 });
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-item");
    assert((await page.textContent(".game-item .outcome")).includes("White wins by"), await page.textContent(".game-item .outcome"));
    noErrors(page);
    await page.close();
  });

  await check("play edits: the review's tools have different icons, a name each, and show it on hover and on keyboard focus", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await humanGame(page);
    await play(page, [[2, 2], [6, 6]]);
    await page.keyboard.press("Control+Shift+R");
    await page.waitForSelector(".review-layer");
    await page.waitForSelector(".tool-group .tool");
    const tools = await page.evaluate(() => [...document.querySelectorAll(".tool-group .tool")].map((el) => ({ name: el.querySelector("button").getAttribute("aria-label"), tip: el.querySelector(".tool-tip").textContent.trim(), icon: el.querySelector("svg").innerHTML, title: el.querySelector("button").getAttribute("title") })));
    assert(tools.length >= 4, `${tools.length} tools`);
    for (const tool of tools) assert(tool.name && tool.tip === tool.name, `a tool without its name: ${JSON.stringify({ ...tool, icon: "" })}`);
    assert(new Set(tools.map((x) => x.icon)).size === tools.length, "two tools share an icon");
    assert(new Set(tools.map((x) => x.name)).size === tools.length, "two tools share a name");
    const names = tools.map((x) => x.name);
    for (const want of ["Export image", "Export SGF"]) assert(names.some((n) => n.startsWith(want)), `no tool named ${want}: ${names.join(" | ")}`);
    // Import (the Library) and export (here) are different pictures.
    const exportIcon = tools.find((x) => x.name.startsWith("Export SGF")).icon;
    const imageIcon = tools.find((x) => x.name.startsWith("Export image")).icon;
    const shown = (i) => page.evaluate((i) => {
      const tip = document.querySelectorAll(".tool-group .tool .tool-tip")[i];
      const cs = getComputedStyle(tip);
      return cs.visibility === "visible" && Number(cs.opacity) > 0.9;
    }, i);
    assert(!(await shown(0)), "a tooltip shows before anything points at it");
    // Hover (after its short delay).
    await page.hover(".tool-group .tool >> nth=0");
    await page.waitForFunction(() => {
      const cs = getComputedStyle(document.querySelector(".tool-group .tool .tool-tip"));
      return cs.visibility === "visible" && Number(cs.opacity) > 0.9;
    }, null, { timeout: 3000 });
    await page.mouse.move(5, 300);
    // Keyboard focus: at once, and inside the window.
    await page.focus(".toolbar .crumb");
    for (let i = 0; i < tools.length; i++) {
      // Tab reaches each tool in turn (disabled ones are skipped by the browser).
      await page.keyboard.press("Tab");
      const at = await page.evaluate(() => [...document.querySelectorAll(".tool-group .tool button")].indexOf(document.activeElement));
      if (at < 0) break;
      await page.waitForFunction((k) => {
        const cs = getComputedStyle(document.querySelectorAll(".tool-group .tool .tool-tip")[k]);
        return cs.visibility === "visible" && Number(cs.opacity) > 0.9;
      }, at, { timeout: 2000 });
      const box = await page.evaluate((k) => {
        const r = document.querySelectorAll(".tool-group .tool .tool-tip")[k].getBoundingClientRect();
        return { left: r.left, right: r.right, w: innerWidth };
      }, at);
      assert(box.left >= 0 && box.right <= box.w, `the tooltip of tool ${at} leaves the window: ${JSON.stringify(box)}`);
    }
    await page.keyboard.press("Escape");
    // The Library's Import is a third picture.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home");
    const importIcon = await page.evaluate(() => [...document.querySelectorAll(".toolbar .btn")].find((b) => b.textContent.includes("Import SGF")).querySelector("svg").innerHTML);
    assert(importIcon !== exportIcon && importIcon !== imageIcon && exportIcon !== imageIcon, "import, export and save image share an icon");
    noErrors(page);
    await page.close();
  });

  await check("play edits: Open board gives an empty board to place stones on, in turn, in three sizes, and saves it to the Library", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home");
    assert((await page.locator(".open-board").count()) === 1, "one way in");
    await page.click(".open-board");
    await page.waitForSelector(".free-panel");
    await page.waitForFunction(() => window.__board?.model.size === 19);
    assert((await page.locator(".free-panel .free-size button").count()) === 3, "three sizes while the board is empty");
    assert(await page.evaluate(() => document.querySelector(".save-board").disabled), "nothing to save yet");
    await page.click(".free-panel .free-size button >> nth=0");
    await page.waitForFunction(() => window.__board?.model.size === 9);
    await clickPoint(page, 2, 2);
    await clickPoint(page, 6, 6);
    await clickPoint(page, 2, 6);
    await page.waitForFunction(() => window.__state.review.game.mainLine().length === 4);
    assert(await page.evaluate(() => window.__state.review.game.mainLine().slice(1).map((n) => n.move.color).join() === "1,-1,1"), "black and white alternate");
    assert((await page.locator(".draft-bar").count()) === 0, "no line being tried: the stones are the record");
    assert((await page.locator(".free-panel .free-size").count()) === 0, "the size is fixed once a stone is down");
    assert((await page.locator(".free-panel .btn.primary:visible").count()) === 1, "one primary");
    // ⌘Z takes a stone back.
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => window.__state.review.game.mainLine().length === 3);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(() => window.__state.review.game.mainLine().length === 4);
    // Save to Library.
    await page.click(".save-board");
    await page.waitForFunction(() => window.__state.toasts.some((x) => x.tone === "success"));
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("goban9:games/")), null, { timeout: 3000 });
    await clickPoint(page, 6, 2);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".library-home .game-item");
    assert((await page.textContent(".game-item strong")) === "Free board", await page.textContent(".game-item strong"));
    assert((await page.locator(".games-group.unfinished-group").count()) === 0, "a saved board is not an unfinished game");
    // After a reload it is still there, with the stone placed after saving.
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("goban9:games/") && JSON.parse(localStorage.getItem(k)).sgf.includes("[gc]")), null, { timeout: 3000 });
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+4");
    await page.click(".game-item .game-row");
    await page.waitForSelector(".free-panel");
    assert(await page.evaluate(() => window.__state.review.game.mainLine().length === 5 && window.__state.review.meta.free === true), "the saved board opens as a free board");
    noErrors(page);
    await page.close();
  });
}
