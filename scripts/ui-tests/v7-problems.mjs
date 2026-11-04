/**
 * v7 browser checks: problems. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 *
 * Your own problem collections: import the sample collection
 * (tests/fixtures/problems) through the file picker, see the report, solve
 * one problem in the ordinary problem view, rename, export, delete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures/problems");

export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  await check("v7 problems: import SGF problems, practise one, rename, export and delete the collection", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".collections-section");
    assert((await page.textContent(".collections-section")).includes("Your collections"), "no section");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(".collections-actions .btn >> nth=0")]);
    assert(chooser.isMultiple(), "the picker takes many files");
    await chooser.setFiles([path.join(fixtures, "collection.sgf"), path.join(fixtures, "white-capture.sgf")]);
    await page.waitForSelector(".collection-page", { timeout: 60000 });
    const rows = await page.$$eval(".report-row", (els) => els.map((e) => e.className));
    assert(rows.length === 9, `report rows: ${rows.length}`);
    assert(rows.filter((c) => c.includes("rejected")).length === 3, `rejected: ${rows.join(",")}`);
    assert((await page.textContent(".import-report")).includes("refuted"), "the refutation is shown");
    const cards = await page.$$(".collection-page .problem-card");
    assert(cards.length === 6, `cards: ${cards.length}`);
    assert((await page.$$(".btn.primary")).length === 1, "one primary action");

    // The first problem opens in the ordinary problem view and is solved there.
    await page.click(".collection-page .problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.practice.view === "problem");
    const p = await page.evaluate(() => {
      const P = window.__state.practice.problem;
      return { id: P.def.id, ok: P.def.answer[0], crumb: document.querySelector(".toolbar .crumb:nth-of-type(2)")?.textContent };
    });
    assert(p.id.startsWith("u-"), p.id);
    assert(p.crumb === "collection +1", `crumb: ${p.crumb}`);
    await clickPoint(page, p.ok.x, p.ok.y);
    await page.waitForFunction(() => window.__state.practice.problem.status === "won", null, { timeout: 10000 });
    const rec = await page.evaluate((id) => window.__state.progress.problems[id], p.id);
    assert(rec?.solved && rec.due > Date.now(), `progress and review date: ${JSON.stringify(rec)}`);
    await page.click(".toolbar .crumb:nth-of-type(2)");
    await page.waitForSelector(".collection-page");
      assert((await page.textContent(".collection-head")).includes("1 / 6"), await page.textContent(".collection-head"));

    // Rename from the toolbar menu.
    await page.click(".toolbar .menu-wrap .icon-btn");
    await page.click(".menu [role=menuitem] >> nth=0");
    await page.fill(".sheet .text-input", "My corner problems");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => document.querySelector(".collection-head h1")?.textContent === "My corner problems");

    // Export: a standard SGF collection with the proved answers.
    await page.click(".toolbar .menu-wrap .icon-btn");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click(".menu [role=menuitem] >> nth=1")]);
    const file = await download.path();
    const sgf = fs.readFileSync(file, "utf8");
    assert((sgf.match(/\(;GM\[1\]/g) || []).length === 6, "six problems exported");
    assert(sgf.includes("AP[Goban Studio Problems:") && sgf.includes("C[RIGHT]"), "exported with answers");

    // Stored under its own key, so a backup carries it.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("goban-studio.collections.v1")));
    assert(stored.collections[0].name === "My corner problems", "persisted");

    // Back to Practice home: the collection is listed; delete it there.
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".collection-item");
    await page.click(".collection-item .menu-wrap .icon-btn");
    await page.click(".menu [role=menuitem].danger");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => !document.querySelector(".collection-item"));
    const left = await page.evaluate((id) => ({ c: JSON.parse(localStorage.getItem("goban-studio.collections.v1")).collections.length, p: window.__state.progress.problems[id] }), p.id);
    assert(left.c === 0 && !left.p, `deleted with its progress: ${JSON.stringify(left)}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
