/**
 * Shell: every sheet and every menu, opened in the real page.
 *
 * - Each kind of sheet renders without a page error, has an accessible
 *   name, takes the focus, closes on Esc and gives the focus back; its
 *   primary action does what it says (Rename renames, New game starts one).
 * - Each item of each menu opens something or changes something, without a
 *   page error.
 * - The sheet kinds and the menus are read from the source, so a new one
 *   that is not listed here fails the check until it is.
 * - What the app says back: Delete with Undo, toasts (tones, close, Esc,
 *   contrast in both themes), a view that throws while rendering, a click
 *   whose content or file is slow or cannot be loaded.
 *
 * Loaded by scripts/ui-test.mjs; receives its helpers (check, assert,
 * fresh, onboard, clickPoint, origin, …).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(root, "src/web/js");
const sources = () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (/^content/.test(e.name) ? [] : walk(path.join(dir, e.name))) : /\.jsx?$/.test(e.name) && e.name !== "bundle.js" ? [path.join(dir, e.name)] : []));
  return walk(SRC).map((f) => ({ file: path.relative(SRC, f), text: fs.readFileSync(f, "utf8") }));
};

/** Every kind of sheet this file opens (kept equal to sheets.jsx by the first check). */
const SHEETS_TESTED = ["confirm", "importReport", "newGame", "onboarding", "rename", "settings", "sgfGames", "shortcuts"];
/** Every menu this file opens: the id it is given in the source → its items, in order. */
const MENUS_TESTED = {
  '"play-more"': ["Redo", "Hint", "Review so far", "Count", "Save to library", "Export SGF", "Focus mode", "Resign"],
  '"rec-" + g.id': ["Rename", "Export SGF", "Delete"],
  // These three are opened, item by item, in play-library.mjs and play-edits.mjs.
  '"unf-" + g.id': ["Look at it", "Export SGF", "Delete"],
  '"lib-import"': ["Choose files…", "Paste SGF"],
  '"review-result"': ["Count again"],
};

/** A file of `n` small games, as one SGF text. */
const COLLECTION = (n) => Array.from({ length: n }, (_, i) => `(;GM[1]FF[4]SZ[9]PB[Black ${i + 1}]PW[White ${i + 1}]RE[B+R];B[cc];W[gg])`).join("\n");
/** Paste text on the page, as ⌘V does. */
const paste = (page, text) =>
  page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text", text);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);

/* --------------------------------------------------------- a fake host */

const THUMB = (() => {
  const rows = Array.from({ length: 9 }, () => Array(9).fill("."));
  rows[2][2] = "b";
  rows[6][6] = "w";
  rows[2][6] = "b";
  rows[6][2] = "w";
  return rows.map((r) => r.join("")).join("");
})();
const gameFile = (id, name, at) =>
  JSON.stringify({
    v: 13,
    id,
    createdAt: at,
    updatedAt: at,
    finishedAt: at,
    source: "game",
    sgf: "(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]RE[B+R];B[cc];W[gg];B[gc];W[cg])",
    meta: { size: 9, rules: "japanese", komi: 6.5, handicap: 0, moves: 4, result: "B+R", date: new Date(at).toISOString(), playerBlack: "", playerWhite: "", thumb: THUMB, name, opponent: "human" },
  });
/** Someone who has used the app: onboarded, with two finished games in the Library. */
const SEED = {
  "settings.json": JSON.stringify({ v: 13, lang: "en", onboarded: true }),
  "games/older.json": gameFile("older", "An older game", Date.UTC(2026, 9, 1)),
  "games/newer.json": gameFile("newer", "A newer game", Date.UTC(2026, 9, 2)),
};

/**
 * In the page: the app's host with its files in memory, a save dialog that
 * records what it was asked (window.__dialogs) and writes that succeed
 * (window.__written), and game files that can be made slow or unreadable
 * (window.__read).
 */
function fakeHost(seed) {
  window.__files = { ...seed };
  window.__dialogs = [];
  window.__written = [];
  window.__read = { delay: 0, fail: false };
  const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const enc = (text) => {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return { b64: btoa(s), size: bytes.length };
  };
  window.zero = {
    on: () => () => {},
    invoke: async (command, p) => {
      if (command === "studio.katagoStatus") return { available: false };
      if (command === "studio.storeList") return Object.keys(window.__files).filter((k) => k.startsWith(p.prefix || ""));
      if (command === "studio.storeRead") {
        if (p.key.startsWith("games/")) {
          if (window.__read.delay) await new Promise((r) => setTimeout(r, window.__read.delay));
          if (window.__read.fail) throw new Error("ReadFailed");
        }
        return window.__files[p.key] == null ? null : enc(window.__files[p.key]);
      }
      if (command === "studio.storeWrite") {
        window.__files[p.key] = (p.offset ? window.__files[p.key] || "" : "") + dec(p.b64);
        return true;
      }
      if (command === "studio.storeRemove") {
        delete window.__files[p.key];
        return true;
      }
      if (command === "studio.saveFileDialog") {
        window.__dialogs.push({ title: p.title, defaultName: p.defaultName });
        return "/exports/" + (p.defaultName || "file");
      }
      if (command === "studio.writeTextFile") {
        window.__written.push(p.path);
        return true;
      }
      return null;
    },
  };
}

export default async function ({ check, assert, fresh, onboard, clickPoint, origin }) {
  /** A page on the fake host, with the seeded Library, at Today. */
  async function seeded(locale = "en-US", viewport) {
    const page = await fresh(locale, viewport);
    await page.addInitScript(fakeHost, SEED);
    await page.goto(origin + "/");
    await page.waitForSelector(".today");
    return page;
  }
  /** Errors the page reported, without the ones a check provoked on purpose. */
  const errorsOf = (page, allow = []) => page.errors.filter((e) => !allow.some((re) => re.test(e)));
  const noErrors = (page, what, allow) => {
    const errs = errorsOf(page, allow);
    assert(errs.length === 0, `${what}: ${errs.join("; ")}`);
  };
  /** The open sheet: its name (aria-labelledby), and whether the focus is inside it. */
  const sheetInfo = (page) =>
    page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      if (!d) return null;
      const ids = (d.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      const name = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ").trim() || (d.getAttribute("aria-label") || "").trim();
      return { name, modal: d.getAttribute("aria-modal"), focusInside: d === document.activeElement || d.contains(document.activeElement), kind: window.__state.sheet?.kind || null };
    });
  /** Remember what has the focus, to see later that it came back. */
  const markFocus = (page) => page.evaluate(() => void (window.__focusBefore = document.activeElement));
  const focusBack = (page) =>
    page.waitForFunction(() => document.activeElement === window.__focusBefore && window.__focusBefore !== document.body && window.__focusBefore.isConnected, null, { timeout: 3000 }).then(
      () => true,
      () => false,
    );
  /** The sheet is open: named, modal, focused. Then Esc: closed, and the focus is back where it was. */
  async function sheetOpensAndCloses(page, kind, { title }) {
    await page.waitForSelector("[role=dialog]");
    await page.waitForFunction(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) || document.querySelector("[role=dialog]") === document.activeElement, null, { timeout: 3000 }).catch(() => {});
    const info = await sheetInfo(page);
    assert(info.kind === kind, `${kind}: state.sheet is ${info.kind}`);
    assert(info.name === title, `${kind}: accessible name "${info.name}", expected "${title}"`);
    assert(info.modal === "true", `${kind}: aria-modal`);
    assert(info.focusInside, `${kind}: the focus is not inside the sheet`);
    noErrors(page, `${kind} opened`);
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    assert(await page.evaluate(() => window.__state.sheet === null), `${kind}: Esc did not clear state.sheet`);
    assert(await focusBack(page), `${kind}: the focus did not return to where it was (${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))})`);
  }
  /** A two-player 9×9 game on the board, with `moves` stones played. */
  async function startGame(page, moves = 0) {
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__board?.model.size === 9 && window.__state.game?.game.moveNumber === 0);
    let n = 0;
    for (let y = 0; y < 9 && n < moves; y += 2) {
      for (let x = 0; x < 9 && n < moves; x++) {
        await clickPoint(page, x, y);
        n++;
        await page.waitForFunction((k) => window.__state.game.game.moveNumber === k, n, { timeout: 3000 });
      }
    }
  }

  /* ---------------------------------------------------- the inventory */

  await check("shell sheets: every kind of sheet and every menu in the source is opened by these checks", async () => {
    const all = sources();
    // The kinds the app can render.
    const sheets = all.find((s) => s.file === "app/sheets.jsx").text;
    const table = /const SHEETS = \{([^}]*)\}/.exec(sheets);
    assert(table, "sheets.jsx: the SHEETS table was not found");
    const kinds = [...table[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort();
    assert(JSON.stringify(kinds) === JSON.stringify([...SHEETS_TESTED].sort()), `sheet kinds in sheets.jsx: ${kinds} — tested here: ${SHEETS_TESTED} (add the new kind to this file's checks)`);
    // Every kind something opens is one the app can render.
    const opened = new Set();
    for (const { text } of all) {
      for (const m of text.matchAll(/openSheet\(\s*"(\w+)"/g)) opened.add(m[1]);
      for (const m of text.matchAll(/sheet\s*[:=]\s*\{\s*kind:\s*"(\w+)"/g)) opened.add(m[1]);
    }
    for (const k of opened) assert(kinds.includes(k), `a sheet of kind "${k}" is opened somewhere, but sheets.jsx has no such kind`);
    for (const k of kinds) assert(opened.has(k), `no code opens a "${k}" sheet`);
    // Every menu.
    const menus = [];
    for (const { file, text } of all) {
      if (file === "app/parts.jsx") continue;
      for (const m of text.matchAll(/<MoreMenu\s+id=(?:\{([^}]+)\}|("[^"]+"))/g)) menus.push(m[1] || m[2]);
    }
    const uses = all.filter((s) => s.file !== "app/parts.jsx").reduce((n, s) => n + (s.text.match(/<MoreMenu\b/g) || []).length, 0);
    assert(uses === menus.length, `${uses} <MoreMenu> in the source, ${menus.length} with an id this check can read`);
    assert(JSON.stringify(menus.sort()) === JSON.stringify(Object.keys(MENUS_TESTED).sort()), `menus in the source: ${menus} — tested here: ${Object.keys(MENUS_TESTED)}`);
    return `${kinds.length} sheets, ${menus.length} menus`;
  });

  /* ------------------------------------------------------- the sheets */

  await check("shell sheets: New game, Settings (every pane), Shortcuts and both confirmations open named and focused; Esc closes each and returns the focus", async () => {
    const page = await seeded();
    const sidebar = ".sb-item >> nth=0";
    // New game, from the keyboard with the focus on a sidebar item.
    await page.focus(sidebar);
    await markFocus(page);
    await page.keyboard.press("Control+n");
    await sheetOpensAndCloses(page, "newGame", { title: "New game" });
    // Settings, from its sidebar button; every pane renders.
    const settings = page.locator(".sidebar .sb-item", { hasText: "Settings" });
    await settings.focus();
    await markFocus(page);
    await settings.click();
    await page.waitForSelector(".settings-sheet");
    const panes = await page.locator(".settings-tab").count();
    assert(panes === 5, `${panes} settings panes`);
    for (let i = 0; i < panes; i++) {
      await page.click(`.settings-tab >> nth=${i}`);
      const label = await page.getAttribute(".settings-pane", "aria-label");
      const tab = (await page.textContent(`.settings-tab >> nth=${i}`)).trim();
      assert(label === tab, `pane ${i}: named "${label}", its tab says "${tab}"`);
      assert((await page.locator(".settings-pane .settings-group").count()) > 0, `pane ${tab} is empty`);
      noErrors(page, `settings pane ${tab}`);
    }
    await page.click(".settings-tab >> nth=0");
    await sheetOpensAndCloses(page, "settings", { title: "Settings" });
    // Shortcuts.
    await page.focus(sidebar);
    await markFocus(page);
    await page.keyboard.press("Control+/");
    await page.waitForSelector(".shortcuts");
    const keys = await page.locator(".shortcuts dt").allTextContents();
    for (const k of ["Ctrl+N", "Ctrl+O", "Ctrl+S", "Shift+Ctrl+E", "Shift+Ctrl+R", "Ctrl+Z", "Shift+Ctrl+P", "Shift+Ctrl+H", "Ctrl+1 – 4", "Esc"]) assert(keys.includes(k), `the shortcuts sheet does not list ${k}: ${keys.join(" | ")}`);
    await sheetOpensAndCloses(page, "shortcuts", { title: "Keyboard shortcuts" });
    // A dangerous confirmation (Settings → Data → Clear all data): Cancel has the focus.
    await settings.focus();
    await markFocus(page);
    await settings.click();
    await page.click(".settings-tab[data-pane=data]");
    await page.click(".settings-pane .btn.danger");
    await page.waitForFunction(() => window.__state.sheet?.kind === "confirm" && !!document.querySelector("[role=dialog]")?.contains(document.activeElement));
    assert(await page.evaluate(() => document.activeElement?.hasAttribute("data-confirm-cancel")), "a dangerous confirmation starts on Cancel");
    assert((await page.locator(".sheet .btn.danger-solid").count()) === 1, "its action is the danger button");
    await sheetOpensAndCloses(page, "confirm", { title: "Erase all data?" });
    assert(await page.evaluate(() => Object.keys(window.__files).includes("settings.json")), "Esc deleted nothing");
    // A file with several games, pasted on the Library: the chooser.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-item");
    const importButton = page.locator(".toolbar .btn", { hasText: "Import SGF" });
    await importButton.focus();
    await markFocus(page);
    await paste(page, COLLECTION(60));
    await page.waitForSelector(".import-sheet .import-row");
    assert((await page.locator(".import-sheet .import-row").count()) === 50, "the chooser lists one page of the file's games");
    await sheetOpensAndCloses(page, "sgfGames", { title: "This file holds 60 games" });
    // An ordinary confirmation (Import all, of a large file): the action has the focus.
    await importButton.focus();
    await markFocus(page);
    await paste(page, COLLECTION(60));
    await page.waitForSelector(".import-sheet .import-all");
    await page.click(".import-sheet .import-all");
    await page.waitForFunction(() => window.__state.sheet?.kind === "confirm" && !!document.querySelector("[role=dialog]")?.contains(document.activeElement));
    assert(await page.evaluate(() => document.activeElement?.matches(".sheet-foot .btn.primary")), "an ordinary confirmation starts on its action");
    await sheetOpensAndCloses(page, "confirm", { title: "Import all 60 games?" });
    assert((await page.locator(".game-item").count()) === 2, "Esc imported nothing");
    // What an import came to (two files, one of them unreadable): the toast's Details opens the report.
    await page.setInputFiles("#file-input", [
      { name: "good.sgf", mimeType: "application/x-go-sgf", buffer: Buffer.from(COLLECTION(1)) },
      { name: "bad.sgf", mimeType: "application/x-go-sgf", buffer: Buffer.from("this is not a record") },
    ]);
    await page.waitForSelector(".toast .toast-action");
    assert((await page.textContent(".toast .toast-text")).includes("Imported 1 game"), await page.textContent(".toast .toast-text"));
    await page.click(".toast .toast-action");
    await page.waitForSelector(".import-sheet .import-notes li");
    const report = await sheetInfo(page);
    assert(report.kind === "importReport" && report.name === "Import details" && report.modal === "true", JSON.stringify(report));
    assert((await page.textContent(".import-notes")).includes("bad"), "the report names the file that could not be read");
    await page.waitForFunction(() => document.querySelector("[role=dialog]")?.contains(document.activeElement), null, { timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    noErrors(page, "the import sheets");
    await page.close();
  });

  await check("shell sheets: their primary actions work — New game starts one, a confirmation confirms, a switch in Settings is kept", async () => {
    const page = await seeded();
    await startGame(page, 0);
    assert(await page.evaluate(() => window.__state.play.view === "game" && window.__state.game.opponent === "human"), "New game → Start did not start the game");
    // Pass is asked in the panel, not in a sheet, and confirmed with the keyboard alone.
    await page.keyboard.press("Control+Shift+P");
    await page.waitForFunction(() => window.__state.sheet === null && document.activeElement?.matches(".pass-ask .btn.primary"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__state.sheet === null && window.__state.game.game.mainLine().length === 2, null, { timeout: 3000 });
    // A confirmation confirms: Import all of a large file, with Enter on its action.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-item");
    await paste(page, COLLECTION(60));
    await page.waitForSelector(".import-sheet .import-all");
    await page.click(".import-sheet .import-all");
    await page.waitForFunction(() => window.__state.sheet?.kind === "confirm" && document.activeElement?.matches(".sheet-foot .btn.primary"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__state.sheet === null && window.__state.toasts.some((x) => x.message === "Imported 60 games"), null, { timeout: 15000 });
    await page.waitForFunction(() => Object.keys(window.__files).filter((k) => k.startsWith("games/")).length === 62, null, { timeout: 5000 });
    // Settings: a switch changes the setting and reaches the disk.
    await page.keyboard.press("Control+,");
    await page.click(".settings-tab[data-pane=board]");
    const was = await page.evaluate(() => window.__state.settings.coords);
    await page.click(".settings-pane .switch >> nth=0");
    await page.waitForFunction((v) => window.__state.settings.coords === !v, was);
    await page.waitForFunction((v) => JSON.parse(window.__files["settings.json"]).coords === !v, was, { timeout: 3000 });
    await page.keyboard.press("Escape");
    noErrors(page, "primary actions");
    await page.close();
  });

  await check("shell sheets: Rename opens (it used to throw), renames on Enter and on Save, and an input method's Enter does not save", async () => {
    const page = await seeded();
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-item");
    const row = (name) => page.locator(".game-item", { hasText: name });
    const openRename = async (name) => {
      await row(name).locator(".menu-wrap .icon-btn").click();
      await page.click(".menu [role=menuitem] >> nth=0");
      // The field takes the focus a moment after the sheet is drawn.
      await page.waitForFunction(() => document.activeElement?.matches(".sheet .text-input"));
    };
    await row("A newer game").locator(".menu-wrap .icon-btn").focus();
    await markFocus(page);
    await openRename("A newer game");
    // The field has the name, selected, and its own accessible name.
    const field = await page.evaluate(() => {
      const el = document.activeElement;
      return { input: el.matches(".sheet .text-input"), value: el.value, selected: el.value.slice(el.selectionStart, el.selectionEnd), label: el.getAttribute("aria-label") };
    });
    assert(field.input && field.value === "A newer game" && field.selected === "A newer game" && field.label === "Rename", JSON.stringify(field));
    await sheetOpensAndCloses(page, "rename", { title: "Rename" });
    assert((await row("A newer game").count()) === 1, "Esc renamed nothing");
    // Enter while an input method is composing confirms the candidate, not the sheet.
    await openRename("A newer game");
    await page.keyboard.type("名局");
    await page.evaluate(() => {
      const el = document.querySelector(".sheet .text-input");
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
    });
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => window.__state.sheet?.kind === "rename"), "an IME's Enter closed the sheet");
    // A real Enter saves.
    await page.keyboard.press("Enter");
    await page.waitForSelector(".sheet", { state: "detached" });
    await page.waitForFunction(() => [...document.querySelectorAll(".game-item strong")].some((el) => el.textContent === "名局"));
    await page.waitForFunction(() => JSON.parse(window.__files["games/newer.json"]).meta.name === "名局", null, { timeout: 3000 });
    // And the Save button.
    await openRename("An older game");
    await page.fill(".sheet .text-input", "  Renamed by the button  ");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => [...document.querySelectorAll(".game-item strong")].some((el) => el.textContent === "Renamed by the button"), null, { timeout: 3000 }).catch(async () => {
      throw new Error("Save did not rename: " + (await page.locator(".game-item strong").allTextContents()).join(" | ") + " sheet=" + (await page.evaluate(() => JSON.stringify(window.__state.sheet))));
    });
    noErrors(page, "rename");
    await page.close();
  });

  await check("shell sheets: onboarding is a named dialog with the focus on its action; Esc cannot skip it", async () => {
    const page = await fresh();
    await page.goto(origin + "/");
    await page.waitForSelector(".ob-card");
    for (const step of [0, 1]) {
      await page.waitForFunction(() => document.querySelector("[role=dialog]")?.contains(document.activeElement), null, { timeout: 3000 }).catch(() => {});
      const info = await sheetInfo(page);
      assert(info.kind === "onboarding" && info.name.length > 0 && info.modal === "true", `step ${step}: ${JSON.stringify(info)}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(50);
      assert((await page.locator(".ob-card").count()) === 1, "Esc closed the onboarding");
      if (step === 0) await page.click(".ob-card .btn.primary");
    }
    await page.click(".choice >> nth=2");
    await page.waitForSelector(".ob-card .slider-field");
    assert((await sheetInfo(page)).name.length > 0, "the rank step has a name");
    await page.click(".ob-card .btn.primary");
    await page.waitForFunction(() => window.__state.sheet === null && window.__state.space === "play");
    noErrors(page, "onboarding");
    await page.close();
  });

  /* -------------------------------------------------------- the menus */

  /** What a menu item can change, as one string: any difference means it did something. */
  const signature = (page) =>
    page.evaluate(() => {
      const s = window.__state;
      const g = s.game;
      return JSON.stringify({
        sheet: s.sheet ? s.sheet.kind + ":" + (s.sheet.title || "") : null,
        space: s.space,
        view: s.play.view,
        review: !!s.review,
        toasts: s.toasts.map((x) => x.id),
        focus: !!s.settings.focus,
        game: g ? { saved: !!g.saved, hint: !!g.hint, thinking: !!g.thinking, moves: g.game.moveNumber, phase: g.game.phase, result: g.game.current.result || null } : null,
        dialogs: window.__dialogs.length,
        rows: document.querySelectorAll(".game-item").length,
      });
    });
  /** Open the menu, check its items against the list, and return them. */
  async function openMenu(page, button, expected) {
    await button.click();
    await page.waitForSelector(".menu [role=menuitem]");
    const labels = (await page.locator(".menu [role=menuitem]").allTextContents())
      .map((s) => s.replace(/(Shift\+)?Ctrl\+.$/, "").trim())
      // (Once saved, the same item reads "Update in library".)
      .map((s) => (s === "Update in library" ? "Save to library" : s));
    assert(JSON.stringify(labels) === JSON.stringify(expected), `menu items: ${labels.join(" | ")} — expected ${expected.join(" | ")}`);
    assert((await page.getAttribute(".menu", "role")) === "menu", "role=menu");
    // (The focus moves a moment after the menu is drawn.)
    const focused = await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem", null, { timeout: 2000 }).then(
      () => true,
      () => false,
    );
    assert(focused, "the menu takes the focus");
    assert(await button.evaluate((b) => b.getAttribute("aria-expanded") === "true" && !!b.getAttribute("aria-label")), "the button says it is expanded, and has a name");
    return labels;
  }
  /** Click item `i` of the open menu and wait until something changed. */
  async function runItem(page, i, label) {
    const before = await signature(page);
    const item = page.locator(".menu [role=menuitem]").nth(i);
    assert(!(await item.isDisabled()), `"${label}" is disabled here`);
    await item.click();
    await page.waitForSelector(".menu", { state: "detached" });
    const end = Date.now() + 15000;
    while ((await signature(page)) === before) {
      if (Date.now() > end) throw new Error(`"${label}" changed nothing (a dead click)`);
      await page.waitForTimeout(50);
    }
    noErrors(page, `menu item "${label}"`);
  }

  await check("shell menus: every item of the game's menu does something — redo, hint, review, count, save, export, focus, resign", async () => {
    const page = await seeded();
    // Enough stones for Count (two per line of the board).
    await startGame(page, 18);
    const button = page.locator(".panel .menu-wrap .icon-btn");
    const items = MENUS_TESTED['"play-more"'];
    const settle = {
      // Each item, then back to the board for the next.
      Redo: async () => {
        await page.waitForFunction(() => window.__state.game.game.moveNumber === 18 && window.__state.game.redo.length === 0);
      },
      Hint: async () => {
        await page.waitForFunction(() => !window.__state.game.thinking && (!!window.__state.game.hint || window.__state.toasts.length > 0), null, { timeout: 20000 });
      },
      "Save to library": async () => {
        await page.waitForFunction(() => window.__state.game.saved === true && window.__state.toasts.some((x) => x.tone === "success"));
        await page.waitForFunction(() => Object.keys(window.__files).filter((k) => k.startsWith("games/")).length === 3, null, { timeout: 3000 });
      },
      "Export SGF": async () => {
        await page.waitForFunction(() => window.__dialogs.length === 1 && window.__written.length === 1);
        const d = await page.evaluate(() => window.__dialogs[0]);
        assert(/\.sgf$/.test(d.defaultName), `the save dialog was asked for ${JSON.stringify(d)}`);
      },
      "Focus mode": async () => {
        await page.waitForFunction(() => window.__state.settings.focus === true && !document.querySelector(".sidebar"));
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => window.__state.settings.focus === false);
      },
      "Review so far": async () => {
        await page.waitForSelector(".review-layer");
        await page.keyboard.press("Escape");
        await page.waitForSelector(".review-layer", { state: "detached" });
      },
      Resign: async () => {
        await page.waitForFunction(() => window.__state.sheet?.kind === "confirm" && !!document.querySelector("[role=dialog]")?.contains(document.activeElement));
        assert(await page.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement)), "the confirmation has the focus");
        await page.keyboard.press("Escape");
        await page.waitForSelector(".sheet", { state: "detached" });
        assert(await page.evaluate(() => !window.__state.game.game.current.result), "Esc did not resign");
      },
      "Count": async () => {
        await page.waitForSelector(".score-card");
      },
    };
    // With the menu closed, Esc on its button belongs to the page: a sheet opened behind it closes.
    await page.keyboard.press("Control+,");
    await page.waitForSelector(".settings-sheet");
    await page.evaluate(() => document.querySelector(".panel .menu-wrap .icon-btn").focus());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".settings-sheet", { state: "detached", timeout: 3000 }).catch(() => {
      throw new Error("Esc on a closed menu's button was swallowed by the menu");
    });
    // Count ends the game, so it goes last.
    const order = [...items.filter((l) => l !== "Count"), "Count"];
    for (const label of order) {
      await page.waitForFunction(() => window.__state.toasts.every((x) => x.tone !== "error"));
      // Redo has something to do after an undo.
      if (label === "Redo") {
        await page.click(".panel .actions .btn >> nth=1");
        await page.waitForFunction(() => window.__state.game.game.moveNumber === 17);
      }
      await openMenu(page, button, items);
      await runItem(page, items.indexOf(label), label);
      await settle[label]();
    }
    // Esc closes a menu and gives the focus back to its button (checked once, on the Library's below).
    noErrors(page, "the game's menu");
    await page.close();
    return `${items.length} items`;
  });

  await check("shell menus: every item of a Library row's menu does something — rename, export, delete; Esc closes the menu", async () => {
    const page = await seeded();
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-item");
    const items = MENUS_TESTED['"rec-" + g.id'];
    const button = page.locator(".game-item", { hasText: "A newer game" }).locator(".menu-wrap .icon-btn");
    // Esc: closed, focus on the button.
    await openMenu(page, button, items);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".menu", { state: "detached" });
    assert(await button.evaluate((b) => b === document.activeElement && b.getAttribute("aria-expanded") === "false"), "Esc gives the focus back to the menu's button");
    // Arrow keys move through the items.
    await openMenu(page, button, items);
    await page.keyboard.press("ArrowDown");
    assert((await page.evaluate(() => document.activeElement.textContent.trim())) === "Export SGF", "↓ moves to the next item");
    await page.keyboard.press("Escape");
    // Rename → its sheet.
    await openMenu(page, button, items);
    await runItem(page, 0, "Rename");
    assert(await page.evaluate(() => window.__state.sheet?.kind === "rename"), "Rename opens the rename sheet");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".sheet", { state: "detached" });
    // Export → the save dialog, with the game's name, and a success toast.
    await openMenu(page, button, items);
    await runItem(page, 1, "Export SGF");
    await page.waitForFunction(() => window.__dialogs.length === 1 && window.__written.length === 1);
    assert((await page.evaluate(() => window.__dialogs[0].defaultName)) === "A newer game.sgf", "the dialog offers the game's name");
    await page.waitForSelector(".toast.success");
    // Delete → the row goes (its own check, below, follows the undo).
    await openMenu(page, button, items);
    await runItem(page, 2, "Delete");
    assert((await page.locator(".game-item").count()) === 1, "Delete removes the row");
    noErrors(page, "the Library row's menu");
    await page.close();
    return `${items.length} items`;
  });

  /* ------------------------------------------------ delete, with undo */

  await check("library: Delete removes the game at once and says \"Game deleted · Undo\"; Undo restores it exactly; without Undo the file is deleted", async () => {
    const page = await seeded();
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-item");
    const fileBefore = await page.evaluate(() => window.__files["games/newer.json"]);
    // The index as the app wrote it at start (both games).
    await page.waitForFunction(() => !!window.__files["games-index.json"], null, { timeout: 3000 });
    const indexBefore = await page.evaluate(() => window.__files["games-index.json"]);
    const del = async (name) => {
      await page.locator(".game-item", { hasText: name }).locator(".menu-wrap .icon-btn").click();
      await page.click(".menu [role=menuitem].danger");
    };
    await del("A newer game");
    // No confirmation sheet: the row is gone and a toast offers Undo.
    assert(await page.evaluate(() => window.__state.sheet === null), "no confirmation sheet");
    await page.waitForFunction(() => document.querySelectorAll(".game-item").length === 1);
    await page.waitForSelector(".toast.has-action");
    assert((await page.textContent(".toast .toast-text")) === "Game deleted", await page.textContent(".toast"));
    assert((await page.textContent(".toast .toast-action")) === "Undo", "the action is Undo");
    assert(await page.evaluate(() => "games/newer.json" in window.__files), "the file waits while Undo is possible");
    // The toast can be clicked (the old one let every click through).
    assert((await page.evaluate(() => getComputedStyle(document.querySelector(".toast.has-action")).pointerEvents)) === "auto", "the toast takes clicks");
    await page.click(".toast .toast-action");
    await page.waitForFunction(() => document.querySelectorAll(".game-item").length === 2 && window.__state.toasts.length === 0);
    assert((await page.locator(".game-item strong").allTextContents()).join("|") === "A newer game|An older game", "the game is back in its place");
    await page.waitForFunction((v) => window.__files["games-index.json"] === v, indexBefore, { timeout: 3000 }).catch(() => {});
    assert((await page.evaluate(() => window.__files["games-index.json"])) === indexBefore, "the index is as it was, byte for byte");
    assert((await page.evaluate(() => window.__files["games/newer.json"])) === fileBefore, "the file is as it was, byte for byte");
    // The restored game opens.
    await page.click(".game-item .game-row >> nth=0");
    await page.waitForSelector(".review-layer");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".review-layer", { state: "detached" });
    // Delete again and close the toast: final.
    await del("A newer game");
    await page.waitForSelector(".toast.has-action");
    await page.click(".toast .dismiss-btn");
    await page.waitForFunction(() => window.__state.toasts.length === 0 && !("games/newer.json" in window.__files), null, { timeout: 3000 });
    assert(await page.evaluate(() => !("newer" in JSON.parse(window.__files["games-index.json"]).games)), "gone from the index");
    // The last game, deleted and left alone: the page going away makes it final too.
    await del("An older game");
    await page.waitForSelector(".toast.has-action");
    assert(await page.evaluate(() => "games/older.json" in window.__files), "held for the undo");
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.waitForFunction(() => !("games/older.json" in window.__files), null, { timeout: 3000 });
    assert((await page.locator(".game-item").count()) === 0, "the Library is empty");
    noErrors(page, "delete with undo");
    await page.close();
  });

  /* ----------------------------------------------------------- toasts */

  await check("toasts: each tone is styled and readable in light and dark; a toast can be closed by its button or Esc; the danger button is readable too", async () => {
    const page = await seeded();
    const lum = `(c) => { const m = c.match(/[\\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); }`;
    const contrastOf = (selector) =>
      page.evaluate(
        ([sel, lumSrc]) => {
          const L = eval(lumSrc);
          const el = document.querySelector(sel);
          const cs = getComputedStyle(el);
          const a = L(cs.color);
          const b = L(cs.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        },
        [selector, lum],
      );
    // Make one of each: a save (success), an export with no game name (info/…), and errors.
    await startGame(page, 1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme);
      // (Errors nobody caught are said at most once in five seconds: the second round waits that out.)
      if (theme === "dark") await page.waitForTimeout(5200);
      // success: Save; warning: a stone on an occupied point; error: something nobody caught.
      await page.keyboard.press("Control+s");
      await page.waitForSelector(".toast.success");
      await clickPoint(page, 0, 0);
      await page.waitForSelector(".toast.warning");
      await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { error: new Error("on purpose"), message: "on purpose" })));
      await page.waitForSelector(".toast.error");
      for (const tone of ["success", "warning", "error"]) {
        const c = await contrastOf(`.toast.${tone}`);
        assert(c >= 4.5, `${theme}: a ${tone} toast's text has contrast ${c.toFixed(2)}`);
      }
      const roles = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((el) => [el.dataset.tone, el.getAttribute("role"), el.getAttribute("aria-live")].join(":")));
      assert(roles.includes("error:alert:") || roles.includes("error:alert:null"), `an error is an alert: ${roles}`);
      assert(roles.some((r) => r.startsWith("success:status:off")), `the rest are statuses the announcer speaks: ${roles}`);
      assert(await page.evaluate(() => getComputedStyle(document.querySelector(".toast.error")).backgroundColor !== getComputedStyle(document.querySelector(".toast.success")).backgroundColor), "an error does not look like a success");
      assert(await page.evaluate(() => document.querySelectorAll(".toast").length <= 3), "at most three");
      // The error stays; its close button closes it.
      await page.waitForTimeout(300);
      await page.click(".toast.error .dismiss-btn");
      await page.waitForSelector(".toast.error", { state: "detached" });
      // Esc closes the toast that has the focus (and nothing else: the game stays).
      await page.keyboard.press("Control+s");
      await page.waitForSelector(".toast.success");
      await page.focus(".toast.success .dismiss-btn");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.__state.toasts.every((x) => x.tone !== "success"));
      assert(await page.evaluate(() => window.__state.play.view === "game" && !window.__state.review), "Esc on a toast closes only the toast");
      await page.evaluate(() => window.__state.toasts.slice().forEach(() => document.querySelector(".toast .dismiss-btn")?.click()));
      await page.waitForFunction(() => window.__state.toasts.length === 0, null, { timeout: 5000 }).catch(() => {});
      // The solid danger button (Clear data's confirmation).
      await page.keyboard.press("Control+,");
      await page.click(".settings-tab[data-pane=data]");
      await page.click(".settings-pane .btn.danger");
      await page.waitForSelector(".sheet .btn.danger-solid");
      const c = await contrastOf(".sheet .btn.danger-solid");
      assert(c >= 4.5, `${theme}: the danger button's text has contrast ${c.toFixed(2)}`);
      await page.keyboard.press("Escape");
      await page.waitForSelector(".sheet", { state: "detached" });
    }
    // A plain message does not block the board under it; one that asks for something takes the pointer.
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".toast.success");
    const pe = await page.evaluate(() => ({ toast: getComputedStyle(document.querySelector(".toast.success")).pointerEvents, close: getComputedStyle(document.querySelector(".toast.success .dismiss-btn")).pointerEvents }));
    assert(pe.toast === "none" && pe.close === "auto", JSON.stringify(pe));
    await page.close();
  });

  /* ---------------------------------------------- when a view breaks */

  await check("errors: a page that throws while rendering becomes an error card (Try again, Go to Today); a sheet that throws closes itself and says so", async () => {
    const page = await seeded();
    const allow = [/render error/, /^render:/, /Error: render error/];
    // A page.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home");
    await page.evaluate(() => window.__crashRender("page"));
    await page.waitForSelector("[data-error-card]");
    const card = await page.textContent("[data-error-card]");
    assert(card.includes("This page ran into a problem") && card.includes("Try again") && card.includes("Go to Today"), card);
    assert((await page.locator(".library-home").count()) === 0, "no half-drawn page behind the card");
    assert((await page.locator(".sidebar .sb-item").count()) >= 5, "the sidebar is still there");
    assert((await page.getAttribute("[data-error-card]", "role")) === "alert", "the card is announced");
    assert((await page.evaluate(() => getComputedStyle(document.querySelector("[data-error-card] p")).userSelect)) === "text", "its text can be copied");
    assert(await page.evaluate(() => window.__state.toasts.length === 0), "the card says it: no toast as well");
    // Try again: the page is back.
    await page.click("[data-error-card] .btn.primary");
    await page.waitForSelector(".library-home .game-item");
    // Again, then Go to Today.
    await page.evaluate(() => window.__crashRender("page"));
    await page.waitForSelector("[data-error-card]");
    await page.click("[data-error-card] .btn:not(.primary)");
    await page.waitForSelector(".today");
    assert(await page.evaluate(() => window.__state.space === "today"), "Go to Today");
    // Again, then the sidebar: another page is tried without asking.
    await page.evaluate(() => window.__crashRender("page"));
    await page.waitForSelector("[data-error-card]");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-item");
    assert((await page.locator("[data-error-card]").count()) === 0, "the card does not follow you to another page");
    // A sheet: it closes itself, a toast says so, and the app behind it works.
    await page.keyboard.press("Control+,");
    await page.waitForSelector(".settings-sheet");
    await page.evaluate(() => window.__crashRender("sheet"));
    await page.waitForFunction(() => window.__state.sheet === null && !document.querySelector(".sheet") && !document.querySelector(".scrim"));
    await page.waitForSelector(".toast.error");
    assert((await page.textContent(".toast.error .toast-text")) === "That panel couldn't be opened.", await page.textContent(".toast.error"));
    assert((await page.locator(".library-home .game-item").count()) === 2, "the page behind the sheet is intact");
    await page.click(".toast.error .dismiss-btn");
    await page.keyboard.press("Control+,");
    await page.waitForSelector(".settings-sheet");
    await page.keyboard.press("Escape");
    // An error in an event handler or a promise: one toast, and the app carries on.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("render error (handler)");
      }, 0);
      Promise.reject(new Error("render error (promise)"));
    });
    await page.waitForSelector(".toast.error");
    assert((await page.locator(".toast.error").count()) === 1, "one toast for both");
    assert((await page.textContent(".toast.error .toast-text")).startsWith("Something went wrong."), await page.textContent(".toast.error"));
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today");
    noErrors(page, "after the errors on purpose", [...allow, /promise:/, /error:/]);
    await page.close();
  });

  /* ------------------------------------------- slow and failed clicks */

  await check("dead clicks: a classic whose content cannot be fetched says so with Retry, and Retry opens it; a slow one says it is loading", async () => {
    const page = await fresh();
    let mode = "fail";
    // The classics' records arrive on demand (content/classics.json).
    await page.route("**/content/classics.json", async (route) => {
      if (mode === "fail") return route.abort();
      if (mode === "slow") await new Promise((r) => setTimeout(r, 1200));
      return route.continue();
    });
    await onboard(page, 1);
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .collection-row");
    assert(await page.evaluate(() => !window.__state.review), "nothing open yet");
    await page.click(".home-classics .collection-row >> nth=0");
    await page.waitForSelector(".task-notice.error");
    const said = await page.textContent(".task-notice.error");
    assert(said.includes("couldn't be loaded") && said.includes("Retry"), said);
    assert((await page.getAttribute(".task-notice.error", "role")) === "alert", "the failure is announced");
    assert(await page.evaluate(() => !window.__state.review), "nothing opened");
    // Retry while it still fails: still an error (not a silent no-op).
    await page.click(".task-notice.error [data-task-retry]");
    await page.waitForTimeout(200);
    await page.waitForSelector(".task-notice.error");
    // Slow: a status line appears, then the classic opens.
    mode = "slow";
    await page.click(".task-notice.error [data-task-retry]");
    await page.waitForSelector(".task-notice[role=status]");
    assert((await page.textContent(".task-notice[role=status]")).includes("Loading"), "it says it is loading");
    await page.waitForSelector(".review-layer", { timeout: 8000 });
    assert((await page.locator(".task-notice").count()) === 0, "the notice goes when the content is here");
    await page.close();
  });

  await check("dead clicks: a game whose file is slow shows \"Opening this game…\"; one that cannot be read says so with Retry, and Retry opens it", async () => {
    const page = await seeded();
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-item");
    const row = ".game-item .game-row >> nth=0";
    // Unreadable.
    await page.evaluate(() => (window.__read.fail = true));
    await page.click(row);
    await page.waitForSelector(".task-notice.error");
    assert((await page.textContent(".task-notice.error")).includes("This game's file couldn't be read."), await page.textContent(".task-notice.error"));
    assert(await page.evaluate(() => !window.__state.review && window.__state.toasts.length === 0), "one message, where the click was — not a toast as well");
    // Readable again, but slow: Retry shows the loading line, then the review.
    await page.evaluate(() => (window.__read = { fail: false, delay: 1200 }));
    await page.click(".task-notice.error [data-task-retry]");
    await page.waitForSelector(".task-notice[role=status]");
    assert((await page.textContent(".task-notice[role=status]")).includes("Opening this game"), "it says what it is doing");
    await page.waitForSelector(".review-layer", { timeout: 8000 });
    assert((await page.locator(".task-notice").count()) === 0, "the notice goes");
    // A quick read shows no notice at all.
    await page.keyboard.press("Escape");
    await page.waitForSelector(".review-layer", { state: "detached" });
    await page.evaluate(() => (window.__read = { fail: false, delay: 0 }));
    await page.click(".game-item .game-row >> nth=1");
    await page.waitForSelector(".review-layer");
    // A failed task is forgotten when you go somewhere else.
    await page.keyboard.press("Escape");
    await page.waitForSelector(".review-layer", { state: "detached" });
    await page.close();
  });

  /* ---------------------------------------------------- small things */

  await check("shell: reading text can be selected, controls cannot; Save outside Play does nothing; the test handles are not in a real browser", async () => {
    const page = await seeded();
    // A lesson's text.
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".learn-home");
    const sel = (s) => page.evaluate((q) => getComputedStyle(document.querySelector(q)).userSelect, s);
    assert((await sel(".sidebar .sb-item")) === "none", "a button is not selectable");
    assert((await sel("body")) === "none", "the page as a whole is not");
    await page.keyboard.press("Control+,");
    await page.click(".settings-tab[data-pane=about]");
    assert((await sel(".settings-pane .about")) === "text", "the About pane can be copied");
    assert((await sel(".settings-pane .btn")) === "none", "its buttons cannot");
    await page.keyboard.press("Escape");
    // Save from another space: nothing (the game is not on screen).
    await startGame(page, 2);
    const files = () => page.evaluate(() => Object.keys(window.__files).filter((k) => k.startsWith("games/")).length);
    const before = await files();
    for (const key of ["Control+1", "Control+3", "Control+4"]) {
      await page.keyboard.press(key);
      await page.keyboard.press("Control+s");
    }
    await page.waitForTimeout(500);
    assert((await files()) === before && (await page.evaluate(() => window.__state.toasts.length === 0)), "Ctrl+S saved a game that is not on screen");
    await page.keyboard.press("Control+2");
    await page.waitForFunction(() => window.__state.play.view === "game");
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".toast.success");
    await page.waitForFunction((n) => Object.keys(window.__files).filter((k) => k.startsWith("games/")).length === n + 1, before, { timeout: 3000 });
    // A lesson's text is selectable; the board is not.
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".learn-home");
    await page.close();

    // A browser that is not driven by a test: nothing on window.
    const plain = await fresh();
    await plain.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
    await plain.goto(origin + "/");
    await plain.waitForSelector(".ob-card");
    const handles = await plain.evaluate(() => ["__state", "__board", "__solver", "__autoAnalyse", "__crashRender"].filter((k) => k in window));
    assert(handles.length === 0, `left on window: ${handles}`);
    await plain.click(".ob-card .btn.primary");
    await plain.click(".choice >> nth=1");
    await plain.waitForSelector("canvas.board");
    assert(await plain.evaluate(() => !("__board" in window)), "the board is not on window either");
    assert(plain.errors.length === 0, plain.errors.join("; "));
    // …unless the address asks for them.
    await plain.goto(origin + "/?test");
    await plain.waitForSelector(".app");
    assert(await plain.evaluate(() => "__state" in window && "__solver" in window), "?test exposes the handles");
    await plain.close();
  });
}
