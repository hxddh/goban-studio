/**
 * The Library, in the browser: the unfinished games as a group of their
 * own (continue, look without continuing, clear), the list's order, filter
 * and rows, importing (paste, several files with an undo, a file with
 * several games) and the explorer's rows without noise. Loaded by
 * scripts/ui-test.mjs; receives its helpers.
 */
const DAY = 86400000;
const THUMB = (n) => Array.from({ length: n * n }, (_, i) => (i % 11 === 0 ? "b" : i % 11 === 1 ? "w" : ".")).join("");

/** A game file as the store keeps it (docs/storage.md). */
function gameFile(id, { name = "", daysAgo = 0, size = 9, result = "B+R", opponent = "ai", humanColor = 1, rank = 12, source = "game", moves = 8, swing = null } = {}) {
  const at = Date.now() - daysAgo * DAY - 60000;
  const sgf = `(;GM[1]FF[4]SZ[${size}]KM[6.5]RU[Japanese]${result ? `RE[${result}]` : ""};B[cc];W[gg];B[gc];W[cg];B[ee];W[ce];B[ec];W[eg])`;
  const file = { v: 13, id, createdAt: at, updatedAt: at, finishedAt: result ? at : null, source, sgf, meta: { size, rules: "japanese", komi: 6.5, handicap: 0, moves, result, date: new Date(at).toISOString(), playerBlack: "", playerWhite: "", thumb: THUMB(size), name, opponent, humanColor, rank } };
  if (swing) file.review = { v: 99, lineKey: "x", confidence: "high", moments: [{ index: swing[0], loss: swing[1] }] };
  return file;
}
/** Someone with `unfinished` games left open and `finished` ones done. */
function library({ unfinished = 0, finished = 0 } = {}) {
  const files = { "settings.json": { v: 13, lang: "en", onboarded: true, playerRank: 12, experience: "player" } };
  for (let i = 0; i < unfinished; i++) files[`games/open${i}.json`] = gameFile(`open${i}`, { daysAgo: i, result: null, name: `Open game ${i + 1}`, opponent: "human" });
  // Finished, newest first: won, lost, won, an imported record, lost …
  const results = ["B+3.5", "W+R", "B+R", "B+0.5", "W+12.5", "B+R", "W+R", "B+2.5"];
  for (let i = 0; i < finished; i++) {
    const imported = i === 3;
    files[`games/done${i}.json`] = gameFile(`done${i}`, { daysAgo: i === 0 ? 0 : i === 1 ? 1 : i * 4, result: results[i % results.length], name: `Game ${i + 1}`, source: imported ? "import" : "game", opponent: imported ? "human" : "ai", swing: i === 0 ? [41, 12.5] : null });
  }
  return files;
}
function seed(files) {
  if (localStorage.getItem("goban9:settings.json")) return;
  for (const [k, v] of Object.entries(files)) localStorage.setItem("goban9:" + k, JSON.stringify(v));
}
const GAME = (n) => `(;GM[1]FF[4]SZ[9]PB[Black ${n}]PW[White ${n}]DT[2024-03-0${(n % 9) + 1}]RE[B+R];B[cc];W[gg];B[gc])`;
const COLLECTION = (n) => Array.from({ length: n }, (_, i) => (i === 2 ? "(;GM[1]FF[4]SZ[9]AB[cc][dc]AW[cd];B[bd])" : GAME(i + 1))).join("\n");

export default async function ({ check, assert, fresh, clickPoint, origin }) {
  async function open(files) {
    const page = await fresh();
    await page.addInitScript(seed, files);
    await page.goto(origin + "/");
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home");
    return page;
  }
  const noErrors = (page) => assert(page.errors.length === 0, page.errors.join("; "));
  const titles = (page, group = ".games-group:not(.unfinished-group)") => page.locator(`${group} .game-item strong`).allTextContents();
  const gameFiles = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).length);
  /** Paste text on the page, as ⌘V does. */
  const paste = (page, text) =>
    page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text", text);
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
  const file = (name, text) => ({ name, mimeType: "application/x-go-sgf", buffer: Buffer.from(text) });
  const menuItems = async (page) => (await page.locator(".menu [role=menuitem]").allTextContents()).map((s) => s.replace(/(Shift\+)?Ctrl\+.$/, "").trim());

  await check("play library: unfinished games are a group of their own — three shown, Continue on the row, Look at it without continuing, Clear after a confirmation", async () => {
    const page = await open(library({ unfinished: 5, finished: 2 }));
    await page.waitForSelector(".unfinished-group .game-item");
    assert((await page.textContent(".unfinished-group .slot-title")).trim() === "Unfinished", "the group is named");
    assert((await page.locator(".unfinished-group .game-item").count()) === 3, "three shown at first");
    assert((await titles(page)).join("|") === "Game 1|Game 2", "finished games are their own list: " + (await titles(page)).join("|"));
    assert((await page.locator(".unfinished-group .row-continue").count()) === 3 && (await page.textContent(".unfinished-group .row-continue")).trim() === "Continue", "each row says Continue");
    await page.click(".show-unfinished");
    await page.waitForFunction(() => document.querySelectorAll(".unfinished-group .game-item").length === 5);
    // A game in progress on the board first, to see that looking leaves it alone.
    await page.click(".unfinished-group .game-row >> nth=4");
    await page.waitForFunction(() => window.__state.space === "play" && window.__state.game?.recordId === "open4" && window.__board?.model.size === 9);
    assert(await page.evaluate(() => window.__state.review === null && window.__state.game.game.moveNumber === 8), "the row continues its game on the board");
    await clickPoint(page, 0, 0);
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 9);
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".unfinished-group .game-item");
    const before = await gameFiles(page);
    // Look at it: the review, in the Library; nothing continued, nothing set aside.
    const more = page.locator(".unfinished-group .game-item", { hasText: "Open game 2" }).locator(".menu-wrap .icon-btn");
    await more.click();
    await page.waitForSelector(".menu [role=menuitem]");
    assert(JSON.stringify(await menuItems(page)) === JSON.stringify(["Look at it", "Export SGF", "Delete"]), (await menuItems(page)).join(" | "));
    await page.click(".menu [role=menuitem] >> nth=0");
    await page.waitForSelector(".review-layer");
    assert(await page.evaluate(() => window.__state.space === "library" && window.__state.review.meta.recordId === "open1"), "the review of that game, in the Library");
    assert(await page.evaluate(() => window.__state.game.recordId === "open4" && window.__state.game.game.moveNumber === 9), "the game on the board was not replaced");
    assert((await gameFiles(page)) === before, "and no game was saved aside");
    assert((await page.locator(".review-panel .btn.primary:visible").count()) === 1 && (await page.textContent(".continue-game")).trim() === "Continue", "the review offers to continue it");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".library-home .unfinished-group");
    // Clear unfinished games…: a dangerous confirmation, Cancel focused; confirmed, the group is gone.
    await page.click(".clear-unfinished");
    await page.waitForFunction(() => window.__state.sheet?.kind === "confirm" && document.activeElement?.hasAttribute("data-confirm-cancel"));
    assert((await page.textContent("#sheet-title")) === "Delete 5 unfinished games?", await page.textContent("#sheet-title"));
    await page.keyboard.press("Escape");
    await page.waitForSelector(".sheet", { state: "detached" });
    assert((await page.locator(".unfinished-group .game-item").count()) === 5, "Esc deleted nothing");
    await page.click(".clear-unfinished");
    await page.click(".sheet-foot .btn.danger-solid");
    await page.waitForSelector(".unfinished-group", { state: "detached" });
    assert((await titles(page)).join("|") === "Game 1|Game 2", "finished games stay");
    assert(await page.evaluate(() => window.__state.game.game.moveNumber === 9), "the board's game stays on the board");
    await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).length === 2, null, { timeout: 3000 });
    // With three or fewer there is nothing to clear in bulk.
    noErrors(page);
    await page.close();
    const few = await open(library({ unfinished: 3, finished: 1 }));
    await few.waitForSelector(".unfinished-group .game-item");
    assert((await few.locator(".clear-unfinished").count()) === 0 && (await few.locator(".show-unfinished").count()) === 0, "three unfinished games need no clearing and no Show all");
    await few.close();
  });

  await check("play library: from six games the list has its filter, search and order; rows say when, the board, the moves, the result and the biggest swing", async () => {
    // Five games: no controls yet.
    const small = await open(library({ finished: 5 }));
    await small.waitForSelector(".game-item");
    assert((await small.locator(".filters").count()) === 0, "five games need no filter");
    await small.close();
    const page = await open(library({ finished: 7 }));
    await page.waitForSelector(".filters");
    assert((await page.locator(".filters .chip").count()) === 4 && (await page.locator(".filters input[type=search]").count()) === 1, "filter and search from six games");
    const sort = page.locator(".filters select.sort-select");
    assert((await sort.getAttribute("aria-label")) === "Sort", "the order has a name");
    assert((await sort.locator("option").allTextContents()).join("|") === "Newest first|Oldest first|By result", (await sort.locator("option").allTextContents()).join("|"));
    assert((await titles(page)).join("|") === "Game 1|Game 2|Game 3|Game 4|Game 5|Game 6|Game 7", "newest first: " + (await titles(page)).join("|"));
    // The rows.
    const row = (name) => page.locator(".game-item", { hasText: name }).first();
    const first = (await row("Game 1").locator(".gr-text span").first().textContent()).replace(/\s+/g, " ");
    assert(first.startsWith("Today · 9 × 9 · 8 moves · vs computer"), first);
    assert(first.includes("biggest swing at move 41 (about 12.5 points)"), "the analysed game's biggest swing: " + first);
    assert((await row("Game 2").locator(".gr-text span").first().textContent()).startsWith("Yesterday"), "yesterday is said as a day");
    assert(/\b20\d\d\b/.test(await row("Game 3").locator(".gr-text span").first().textContent()), "after a week it is a date");
    assert((await row("Game 1").locator(".outcome").textContent()).trim() === "Won" && (await row("Game 2").locator(".outcome").textContent()).trim() === "Lost", "the result, from the player's side");
    assert((await row("Game 4").locator(".outcome").textContent()).trim() === "Black wins by 0.5", "an imported record says its result as written");
    // Oldest first, then by result.
    await sort.selectOption("oldest");
    await page.waitForFunction(() => document.querySelector(".games-group .game-item strong").textContent === "Game 7");
    await sort.selectOption("result");
    await page.waitForFunction(() => document.querySelector(".games-group .game-item strong").textContent === "Game 1");
    const byResult = (await titles(page)).join("|");
    assert(byResult === "Game 1|Game 3|Game 6|Game 2|Game 5|Game 7|Game 4", "wins, losses, then the rest: " + byResult);
    // The filter and the search still narrow the list.
    await page.click(".filters .chip >> nth=2");
    await page.waitForFunction(() => document.querySelectorAll(".games-group .game-item").length === 3);
    await page.click(".filters .chip >> nth=0");
    await page.fill(".filters input[type=search]", "game 6");
    await page.waitForFunction(() => document.querySelectorAll(".games-group .game-item").length === 1);
    noErrors(page);
    await page.close();
  });

  await check("play library: ⌘V and the Import menu paste an SGF; text that is not a record says so", async () => {
    const page = await open(library({ finished: 1 }));
    await page.waitForSelector(".game-item");
    // The Import menu.
    await page.click(".toolbar .menu-wrap .icon-btn");
    await page.waitForSelector(".menu [role=menuitem]");
    assert(JSON.stringify(await menuItems(page)) === JSON.stringify(["Choose files…", "Paste SGF"]), (await menuItems(page)).join(" | "));
    // Paste SGF reads the clipboard.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate((text) => navigator.clipboard.writeText(text), GAME(7));
    await page.click(".menu [role=menuitem] >> nth=1");
    await page.waitForSelector(".review-layer");
    assert(await page.evaluate(() => window.__state.review.source === "record" && window.__state.review.game.playerBlack === "Black 7"), "the pasted record opens in the review");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".library-home .game-item");
    assert((await titles(page)).join("|") === "Pasted record|Game 1", (await titles(page)).join("|"));
    // ⌘V on the list.
    await paste(page, GAME(8));
    await page.waitForSelector(".review-layer");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 3);
    // Not a record: a warning, nothing imported.
    await paste(page, "see you at the club on Friday");
    await page.waitForFunction(() => window.__state.toasts.some((x) => x.tone === "warning" && x.message === "The clipboard does not hold an SGF record."));
    assert((await page.locator(".library-home .game-item").count()) === 3, "nothing was imported");
    // Text pasted into the search field is the field's own.
    await page.close();
    const many = await open(library({ finished: 6 }));
    await many.waitForSelector(".filters input[type=search]");
    await many.focus(".filters input[type=search]");
    await many.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text", text);
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, GAME(9));
    await many.waitForTimeout(150);
    assert(await many.evaluate(() => window.__state.review === null && document.querySelectorAll(".library-home .game-item").length === 6), "a paste in a text field imports nothing");
    noErrors(many);
    await many.close();
  });

  await check("play library: several files are imported at once with one toast and its Undo; a failure and the warnings are in the details", async () => {
    const page = await open(library({ finished: 1 }));
    await page.waitForSelector(".game-item");
    assert(await page.evaluate(() => document.getElementById("file-input").multiple === true), "the picker takes several files");
    await page.setInputFiles("#file-input", [file("alpha.sgf", GAME(1)), file("beta.sgf", GAME(2)), file("gamma.sgf", GAME(3))]);
    await page.waitForSelector(".toast .toast-action");
    assert((await page.textContent(".toast .toast-text")) === "Imported 3 games", await page.textContent(".toast .toast-text"));
    assert((await page.textContent(".toast .toast-action")).trim() === "Undo", "the toast offers Undo");
    assert((await page.locator(".toast").count()) === 1, "one toast for the whole import");
    assert(await page.evaluate(() => window.__state.review === null), "the Library stays on screen");
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 4);
    assert((await titles(page)).slice(0, 3).sort().join("|") === "alpha|beta|gamma", (await titles(page)).join("|"));
    await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).length === 4, null, { timeout: 3000 });
    // Undo: the three are gone, on disk too.
    await page.click(".toast .toast-action");
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 1);
    await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).length === 1, null, { timeout: 3000 });
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-item");
    assert((await page.locator(".library-home .game-item").count()) === 1, "the undo holds after a reload");
    // Dropped on the window: two records, one file that is not SGF inside, one with odd points.
    await page.evaluate(
      (texts) => {
        const dt = new DataTransfer();
        texts.forEach(([name, text]) => dt.items.add(new File([text], name, { type: "application/x-go-sgf" })));
        window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      },
      [["one.sgf", GAME(4)], ["broken.sgf", "nothing to read here"], ["odd.sgf", "(;GM[1]FF[4]SZ[9];B[cc];W[zz];B[gc];W[yy])"]],
    );
    await page.waitForSelector(".toast .toast-action");
    const said = await page.textContent(".toast .toast-text");
    assert(said.includes("Imported 2 games") && said.includes("1 file could not be read"), said);
    assert((await page.textContent(".toast .toast-action")).trim() === "Details", "with something to explain, the toast opens the details");
    await page.click(".toast .toast-action");
    await page.waitForSelector(".import-sheet .import-notes li");
    const notes = await page.locator(".import-notes li").allTextContents();
    assert(notes.some((n) => n.startsWith("broken")) && notes.filter((n) => n.startsWith("odd")).length >= 1, "every note is listed with its file: " + notes.join(" | "));
    // The report can take the import back.
    await page.click(".import-sheet .undo-import");
    await page.waitForSelector(".sheet", { state: "detached" });
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 1);
    noErrors(page);
    await page.close();
  });

  await check("play library: a file with several games opens a chooser — a page at a time, one game opened, or all imported", async () => {
    const page = await open(library({ finished: 1 }));
    await page.waitForSelector(".game-item");
    await page.setInputFiles("#file-input", [file("book.sgf", COLLECTION(64))]);
    await page.waitForSelector(".import-sheet .import-row");
    assert((await page.textContent("#sheet-title")) === "This file holds 64 games", await page.textContent("#sheet-title"));
    assert((await page.locator(".library-home .game-item").count()) === 1, "nothing is imported before the choice");
    assert((await page.locator(".import-sheet .import-row").count()) === 50, "one page of fifty");
    const rows = await page.locator(".import-sheet .import-row .gr-text").allTextContents();
    assert(rows[0].includes("Black 1 · White 1") && rows[0].includes("2024-03-02") && rows[0].includes("9 × 9") && rows[0].includes("3 moves") && rows[0].includes("Black wins by resignation"), "players, date, board, moves, result: " + rows[0]);
    assert(rows[2].startsWith("Problem 3"), "a set-up position without names is a problem: " + rows[2]);
    assert((await page.textContent(".pager .fine")) === "1–50 of 64", await page.textContent(".pager .fine"));
    await page.click(".pager .btn >> nth=1");
    await page.waitForFunction(() => document.querySelectorAll(".import-sheet .import-row").length === 14);
    assert((await page.textContent(".pager .fine")) === "51–64 of 64", await page.textContent(".pager .fine"));
    // Open game 52.
    await page.click(".import-sheet .import-row >> nth=1");
    await page.waitForSelector(".review-layer");
    assert(await page.evaluate(() => window.__state.sheet === null && window.__state.review.game.playerBlack === "Black 52"), "that game opens in the review");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 2);
    assert((await titles(page))[0] === "book · 52", (await titles(page))[0]);
    // Import all: asked first (more than fifty), then one toast.
    await page.setInputFiles("#file-input", [file("book.sgf", COLLECTION(64))]);
    await page.waitForSelector(".import-sheet .import-all");
    assert((await page.textContent(".import-sheet .import-all")).trim() === "Import all 64", await page.textContent(".import-sheet .import-all"));
    await page.click(".import-sheet .import-all");
    await page.waitForFunction(() => window.__state.sheet?.kind === "confirm");
    assert((await page.textContent("#sheet-title")) === "Import all 64 games?", await page.textContent("#sheet-title"));
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.toasts.some((x) => x.message === "Imported 64 games"), null, { timeout: 20000 });
    await page.waitForFunction(() => window.__state.sheet === null);
    assert(await page.evaluate(() => window.__state.review === null), "the Library stays on screen");
    assert((await page.textContent(".show-all")).includes("66"), "all of them are in the list: " + (await page.textContent(".show-all")));
    // A small file needs no confirmation.
    await page.click(".toast .toast-action");
    await page.waitForFunction(() => document.querySelectorAll(".library-home .game-item").length === 2);
    await page.setInputFiles("#file-input", [file("pair.sgf", COLLECTION(2))]);
    await page.waitForSelector(".import-sheet .import-all");
    await page.click(".import-sheet .import-all");
    await page.waitForFunction(() => window.__state.sheet === null && window.__state.toasts.some((x) => x.message === "Imported 2 games"), null, { timeout: 10000 });
    noErrors(page);
    await page.close();
  });

  await check("play library: the explorer has its own section, and its rows say nothing that is noise — no \"0 visits\", no loss within half a point", async () => {
    for (const locale of ["en-US", "zh-CN"]) {
      const page = await fresh(locale);
      await page.addInitScript(seed, { "settings.json": { v: 13, lang: locale === "zh-CN" ? "zh" : "en", onboarded: true, playerRank: 12 } });
      await page.goto(origin + "/");
      await page.waitForSelector(".sidebar");
      await page.keyboard.press("Control+4");
      await page.waitForSelector(".home-explorer");
      assert((await page.textContent(".home-explorer .section-title")).trim().length > 0 && (await page.textContent(".home-explorer .section-note")).trim().length > 10, "the section has a title and a line saying what it is");
      await page.click('.home-explorer [data-explorer="whole"]');
      await page.waitForSelector(".explorer-row");
      const check1 = async (where) => {
        const text = (await page.textContent(".explorer-panel")).replace(/\s+/g, " ");
        assert(!/(^|\D)0 (visits|次)/.test(text) && !/0\s*次/.test(text.replace(/\d0\s*次/g, "")), `${locale} ${where}: a zero count is shown: ${text}`);
        assert(!/(loses|损) 0\.[0-4]/.test(text), `${locale} ${where}: a loss within the noise is shown: ${text}`);
        const rows = await page.evaluate(() => [...document.querySelectorAll(".explorer-row")].map((r) => ({ tag: r.dataset.tag, fine: r.querySelector(".explorer-main > .fine").textContent.trim(), num: r.querySelector(".explorer-num")?.textContent.trim() || "" })));
        assert(rows.length > 0, "no rows");
        for (const r of rows) {
          if (r.tag === "mistake") continue;
          // A book move within the noise: its kind, and nothing else.
          if (!/\d/.test(r.fine)) assert(r.num === "", `${locale} ${where}: a percentage on a move that loses nothing: ${JSON.stringify(r)}`);
        }
        return rows;
      };
      const root = await check1("empty board");
      assert(root.every((r) => !/\d/.test(r.fine)), `${locale}: the first moves of the game say only what they are: ${JSON.stringify(root)}`);
      await clickPoint(page, 15, 3);
      await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 1);
      await check1("after Q16");
      assert(!(await page.textContent(".explorer-verdict")).match(/(loses|损)/), "the verdict on a book move names no loss: " + (await page.textContent(".explorer-verdict")));
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    }
  });
}
