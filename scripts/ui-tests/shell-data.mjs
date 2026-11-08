/**
 * Shell, v13 data safety in the browser (docs/storage.md): a settings file
 * that cannot be read puts the app in its safe state (no onboarding,
 * nothing written, Retry / Continue read-only / Start over, the damaged
 * file copied aside first); a game in progress replaced by New game waits
 * in the Library as unfinished and continues from there; a backup restore
 * keeps a snapshot that Settings can put back; in the app, an export that
 * cannot be written is an error, and the packaged page without its bridge
 * is an error screen. Loaded by scripts/ui-test.mjs; receives its helpers
 * (check, assert, fresh, onboard, clickPoint, pointOf, origin, browser,
 * audit).
 */
import fs from "node:fs";

/** In the page: a host with a file store in memory and a save dialog whose writes fail. */
function failingExportHost() {
  window.__files = {};
  const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const enc = (text) => {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return { b64: btoa(s), size: bytes.length };
  };
  window.__writes = [];
  window.zero = {
    on: () => () => {},
    invoke: async (command, p) => {
      if (command === "studio.katagoStatus") return { available: false };
      if (command === "studio.storeList") return Object.keys(window.__files).filter((k) => k.startsWith(p.prefix || ""));
      if (command === "studio.storeRead") return window.__files[p.key] == null ? null : enc(window.__files[p.key]);
      if (command === "studio.storeWrite") {
        window.__files[p.key] = (p.offset ? window.__files[p.key] || "" : "") + dec(p.b64);
        return true;
      }
      if (command === "studio.storeRemove") {
        delete window.__files[p.key];
        return true;
      }
      // The save dialog is the host's own command (v13); the write then fails.
      if (command === "studio.saveFileDialog") return "/read-only/game.sgf";
      if (command === "studio.writeTextFile") {
        window.__writes.push(p.path);
        throw new Error("AccessDenied");
      }
      return null;
    },
  };
}

export default async function ({ check, assert, fresh, onboard, clickPoint, origin }) {
  await check("shell data: an unreadable settings file → the safe state: no onboarding, nothing written, the file copied aside; Start over keeps the rest", async () => {
    const page = await fresh();
    await page.context().addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("goban9:settings.json", '{"lang":"en","onboarded":true, BROKEN');
      localStorage.setItem("goban9:profile.json", JSON.stringify({ v: 9 }));
    });
    await page.goto(origin + "/");
    await page.waitForSelector(".safe-screen");
    assert((await page.locator(".ob-card").count()) === 0, "no onboarding in the safe state");
    const text = await page.textContent(".safe-screen");
    assert(text.includes("Some of your saved data couldn't be read") && text.includes("settings.json"), text);
    assert(await page.evaluate(() => document.activeElement?.dataset.safe === "retry"), "Retry is focused");
    const copies = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:bad/settings-")));
    assert(copies.length === 1, `copies: ${copies}`);
    assert((await page.evaluate((k) => localStorage.getItem(k), copies[0])) === '{"lang":"en","onboarded":true, BROKEN', "the copy is the file as it was");
    // Retry: the same screen (the file is still damaged), and still no second write.
    await page.click("[data-safe=retry]");
    await page.waitForSelector(".safe-screen");
    // Continue read-only: the app works, says so, and writes nothing.
    await page.click("[data-safe=readonly]");
    await page.waitForSelector(".safe-banner");
    await page.keyboard.press("Control+2");
    // v13: no game is made up at launch; Play's home offers the suggested game.
    await page.click(".play-home .hero .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__board?.geom?.cell > 10);
    await clickPoint(page, 3, 3);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    await page.waitForTimeout(700);
    const disk = await page.evaluate(() => ({ settings: localStorage.getItem("goban9:settings.json"), current: localStorage.getItem("goban9:current.json") }));
    assert(disk.settings === '{"lang":"en","onboarded":true, BROKEN' && disk.current === null, JSON.stringify(disk));
    // Start these files over: the damaged file goes (its copy stays), the player model is kept, no onboarding.
    await page.reload();
    await page.waitForSelector(".safe-screen [data-safe=reset]");
    await page.click("[data-safe=reset]");
    await page.waitForFunction(() => window.__state?.ready && !window.__state.storeProblem);
    await page.waitForTimeout(200);
    assert((await page.locator(".ob-card").count()) === 0, "a player with a model is not new");
    const after = await page.evaluate(() => ({ settings: localStorage.getItem("goban9:settings.json"), profile: !!localStorage.getItem("goban9:profile.json"), copies: Object.keys(localStorage).filter((k) => k.startsWith("goban9:bad/")).length }));
    assert(after.settings === null && after.profile && after.copies >= 1, JSON.stringify(after));
    assert(page.errors.filter((e) => !/store:/.test(e)).length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell data: New game keeps the game in progress in the Library as unfinished; opening it continues it", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.waitForFunction(() => window.__state.play.view === "game" && window.__board?.geom?.cell > 10);
    await clickPoint(page, 2, 2);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    const before = await page.evaluate(() => window.__state.game.game.mainLine().length);
    // New game: two players on 9×9.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 0);
    await page.waitForFunction(() => window.__state.toasts.some((t) => /unfinished/.test(t.message)));
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-row");
    const row = await page.textContent(".library-home .game-row");
    assert(row.includes("Unfinished"), row);
    await page.click(".library-home .game-row");
    await page.waitForFunction(() => window.__state.space === "play" && window.__state.play.view === "game" && window.__state.game.recordId);
    const now = await page.evaluate(() => ({ len: window.__state.game.game.mainLine().length, opponent: window.__state.game.opponent }));
    assert(now.len >= before && now.opponent === "ai", JSON.stringify(now));
    // The two-player board it replaced had no moves: nothing more in the Library.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .game-row");
    assert((await page.locator(".library-home .game-row").count()) === 1, "one game in the Library");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell data: a backup restore keeps a snapshot; Cancel is focused; Settings undoes it", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await clickPoint(page, 2, 2);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    // Export a backup (the browser preview downloads it).
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="data"]');
    const [download] = await Promise.all([page.waitForEvent("download"), page.click(".settings-group .btn >> text=Export backup")]);
    const file = await download.path();
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    assert(doc.v === 13 && doc.data["current.json"], `backup v${doc.v}`);
    // Change something, then restore the backup.
    await page.keyboard.press("Escape");
    // A file the backup does not have (read by the store at the next start).
    await page.evaluate(() => localStorage.setItem("goban9:marker.json", "{}"));
    await page.reload();
    await page.waitForFunction(() => window.__state?.ready);
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="data"]');
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(".settings-group .btn >> text=Restore from backup")]);
    await chooser.setFiles(file);
    await page.waitForSelector(".sheet [data-confirm-cancel]");
    // Focus moves once the sheet has painted (the modal's autofocus runs after render).
    const focused = await page
      .waitForFunction(() => document.activeElement?.hasAttribute("data-confirm-cancel"), null, { timeout: 2000 })
      .then(() => true, () => false);
    assert(focused, "Cancel is focused on a dangerous confirm");
    await Promise.all([page.waitForNavigation(), page.click(".sheet-foot .btn.primary")]);
    await page.waitForFunction(() => window.__state?.ready && window.__state.toasts.some((t) => /Backup restored/.test(t.message)));
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(!keys.includes("goban9:marker.json"), "the restore replaced everything");
    assert(keys.some((k) => k.startsWith("goban9:backups/pre-restore-") && k.endsWith("/marker.json")), "what was there is in the snapshot");
    // Undo from Settings.
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="data"]');
    await page.click("[data-undo-restore]");
    await Promise.all([page.waitForNavigation(), page.click(".sheet-foot .btn.primary")]);
    await page.waitForFunction(() => window.__state?.ready && window.__state.toasts.some((t) => /before the last restore/.test(t.message)));
    assert(await page.evaluate(() => localStorage.getItem("goban9:marker.json") === "{}"), "undo put it back");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell data: in the app, an export that cannot be written is an error toast, never a download", async () => {
    const page = await fresh();
    await page.context().addInitScript(failingExportHost);
    await onboard(page, 1);
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.keyboard.press("Control+Shift+E");
    await page.waitForFunction(() => window.__writes.length > 0 && window.__state.toasts.some((t) => t.tone === "error"));
    const msg = await page.evaluate(() => window.__state.toasts.find((t) => t.tone === "error").message);
    assert(msg.includes("couldn't be saved"), msg);
    assert(!(await page.evaluate(() => window.__state.toasts.some((t) => /exported/i.test(t.message)))), "no fake success");
    await page.waitForTimeout(300);
    assert(downloads === 0, "no download link in the app");
    await page.close();
  });

  await check("shell data: the packaged page without its bridge is an error screen with Retry, and touches no browser storage", async () => {
    const page = await fresh();
    // The page as WebView2 serves it (https://native-sdk-app.localhost), with no window.zero.
    await page.route("https://native-sdk-app.localhost/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: origin + url.pathname });
      await route.fulfill({ response });
    });
    await page.goto("https://native-sdk-app.localhost/");
    await page.waitForSelector(".safe-screen", { timeout: 6000 });
    const text = await page.textContent(".safe-screen");
    assert(text.includes("can't reach your data"), text);
    assert((await page.locator(".safe-screen [data-autofocus]").count()) === 1, "Retry");
    assert((await page.locator(".ob-card").count()) === 0, "no onboarding");
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(keys.length === 0, `nothing in localStorage: ${keys}`);
    await page.close();
  });
}
