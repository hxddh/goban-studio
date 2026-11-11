/**
 * Play: importing records. The plain logic (play/import.js: pasted text, a
 * collection's games, what an import says, relative days) and the
 * controller's flows over it: one record, several files with one summary
 * and its undo, a file with several games, every warning shown.
 */
import { test, assert, bundle, sleep } from "./helpers.mjs";
import { COLLECTION_PAGE, IMPORT_ALL_CONFIRM, importSummary, listCollection, looksLikeSgf, relativeDay, splitCollection } from "../../src/web/js/play/import.js";
import { countGames } from "../../src/web/js/sgf.js";

const GAME = (n, extra = "") => `(;GM[1]FF[4]SZ[9]PB[Black ${n}]PW[White ${n}]DT[2024-03-0${(n % 9) + 1}]RE[B+${n}.5]${extra};B[cc];W[gg];B[gc])`;
const PROBLEM = (n) => `(;GM[1]FF[4]SZ[9]AB[cc][dc]AW[cd]C[Problem ${n} (with \\) and \\] inside)];B[bd])`;

await test("play import: pasted text is tried as SGF only when it starts like one", () => {
  assert.equal(looksLikeSgf("(;GM[1]SZ[9];B[cc])"), true);
  assert.equal(looksLikeSgf("﻿  \n(;FF[4])"), true);
  assert.equal(looksLikeSgf("( ;GM[1])"), true);
  assert.equal(looksLikeSgf("hello (;GM[1])"), false);
  assert.equal(looksLikeSgf("https://example.com/game.sgf"), false);
  assert.equal(looksLikeSgf(""), false);
  assert.equal(looksLikeSgf(null), false);
});

await test("play import: a collection is cut into its games, brackets and escapes inside values left alone", () => {
  const text = [GAME(1), PROBLEM(2), GAME(3, "C[a ) in a comment (and a ( too)]")].join("\n\n");
  const parts = splitCollection(text);
  assert.equal(parts.length, 3);
  assert.equal(parts.length, countGames(text), "as many as the SGF reader counts");
  assert.equal(parts[0], GAME(1));
  assert.equal(parts[1], PROBLEM(2));
  // A game with variations is one game.
  const tree = "(;GM[1]SZ[9];B[cc](;W[gg])(;W[gc];B[cg]))";
  assert.deepEqual(splitCollection(tree + GAME(4)), [tree, GAME(4)]);
  assert.deepEqual(splitCollection("no games here"), []);
  assert.deepEqual(splitCollection(""), []);
});

await test("play import: the chooser lists a page of games at a time, each with its players, date, result and moves", () => {
  const texts = Array.from({ length: 120 }, (_, i) => (i === 7 ? "(;GM[1]SZ[9]RU[Tromp-Taylor];B[cc])" : i % 10 === 3 ? PROBLEM(i) : GAME(i)));
  const first = listCollection(texts);
  assert.equal(first.total, 120);
  assert.equal(first.entries.length, COLLECTION_PAGE, "one page, not the whole file");
  assert.deepEqual(
    { ...first.entries[0] },
    { index: 0, size: 9, black: "Black 0", white: "White 0", date: "2024-03-01", result: "B+0.5", moves: 3, setup: false },
  );
  assert.equal(first.entries[3].setup, true, "a problem is a set-up position");
  assert.equal(first.entries[3].moves, 1);
  assert.equal(first.entries[7].error, "unsupported-rules", "a game that cannot be read says so; the others still list");
  const last = listCollection(texts, { from: 100 });
  assert.equal(last.from, 100);
  assert.equal(last.entries.length, 20);
  assert.equal(last.entries.at(-1).index, 119);
  assert.equal(listCollection(texts, { from: 500 }).entries.length, 0);
  assert.ok(IMPORT_ALL_CONFIRM >= COLLECTION_PAGE);
});

await test("play import: the summary counts what came in and what failed, and keeps every warning with its file's name", () => {
  const sum = importSummary([
    { name: "a", id: "1", warnings: [] },
    { name: "b", id: "2", warnings: ["guessed charset", "bad point"] },
    { name: "c", error: "could not be read" },
    { name: "d", id: "3" },
  ]);
  assert.equal(sum.imported, 3);
  assert.equal(sum.failed, 1);
  assert.deepEqual(sum.ids, ["1", "2", "3"]);
  assert.deepEqual(sum.notes, [
    { name: "b", text: "guessed charset", tone: "warning" },
    { name: "b", text: "bad point", tone: "warning" },
    { name: "c", text: "could not be read", tone: "error" },
  ]);
  assert.deepEqual(importSummary([]), { imported: 0, failed: 0, ids: [], notes: [] });
});

await test("play import: a game of the last week is dated by the day (today, yesterday, n days ago), by the calendar", () => {
  const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();
  const now = at(2026, 3, 10, 9);
  assert.equal(relativeDay(at(2026, 3, 10, 0), now), 0);
  assert.equal(relativeDay(at(2026, 3, 9, 23), now), 1, "ten hours ago, but yesterday");
  assert.equal(relativeDay(at(2026, 3, 4, 12), now), 6);
  assert.equal(relativeDay(at(2026, 3, 3, 12), now), null, "a week ago and more: a date");
  assert.equal(relativeDay(at(2026, 3, 11, 12), now), null, "not for the future");
  assert.equal(relativeDay(NaN, now), null);
});

/* ------------------------------------------------- the controller's flows */

const A = await bundle([
  'export { store } from "./src/web/js/data/store.js";',
  'export * as C from "./src/web/js/app/controller.js";',
  'export * as Lib from "./src/web/js/data/games.js";',
  'export * as P from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { state, runToastAction } from "./src/web/js/app/store.js";',
  'export { setLang, t, tn } from "./src/web/js/i18n.js";',
]);
const { store, C, Lib, P, PM, state, runToastAction, setLang, t, tn } = A;
await store.open();
setLang("en");
state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", onboarded: true, liveAnalysis: false };
state.profile = PM.newProfile();
state.engine = { kind: "offline", available: false };
const clear = () => {
  if (state.review) C.dropReview();
  for (const r of Lib.listGames()) Lib.deleteGame(r.id);
  state.toasts = [];
  state.sheet = null;
  state.tasks = [];
};
const source = (name, text) => ({ name, read: async () => (text == null ? null : new TextEncoder().encode(text)) });

await test("play import: one record opens in the review; all of its warnings are shown, not only the first", async () => {
  clear();
  const rec = await C.importSGFText(GAME(1), "one.sgf");
  assert.equal(Lib.listGames().length, 1);
  assert.equal(rec.name, "one");
  assert.equal(state.review?.meta.recordId, rec.id, "it is open in the review");
  assert.equal(state.toasts.length, 0, "nothing to say about a clean record");
  C.dropReview();
  // Two things to say (two bad points): a toast with Details, which lists both.
  clear();
  await C.importSGFText("(;GM[1]FF[4]SZ[9]KM[abc];B[cc];W[zz];B[gc])", "odd.sgf");
  assert.equal(Lib.listGames().length, 1);
  const warn = state.toasts.find((x) => x.tone === "warning");
  assert.ok(warn, "the warnings are said");
  if (warn.action) {
    assert.equal(warn.action.label, t("import.details"));
    runToastAction(warn.id);
    assert.equal(state.sheet?.kind, "importReport");
    assert.ok(state.sheet.summary.notes.length >= 2, "every warning is in the report");
    assert.equal(state.sheet.undoable, false, "the record is open: deleting it is the row's own action");
  }
  C.dropReview();
  // A record that cannot be read: an error, nothing saved.
  clear();
  assert.equal(await C.importSGFText("(;GM[1]SZ[9]RU[Tromp-Taylor];B[cc])", "tt.sgf"), null);
  assert.equal(Lib.listGames().length, 0);
  assert.equal(state.toasts.at(-1).tone, "error");
});

await test("play import: several files are all imported, with one summary toast and its Undo", async () => {
  clear();
  const sum = await C.importSources([source("a.sgf", GAME(1)), source("b.sgf", GAME(2)), source("c.sgf", GAME(3))]);
  assert.equal(sum.imported, 3);
  assert.equal(Lib.listGames().length, 3);
  assert.equal(state.review, null, "the Library stays on screen");
  assert.deepEqual(Lib.listGames().map((g) => g.name).sort(), ["a", "b", "c"]);
  const done = state.toasts.find((x) => x.message === tn("import.done", 3));
  assert.ok(done, "one toast: Imported 3 games");
  assert.equal(state.toasts.length, 1);
  assert.equal(done.action.label, t("common.undoAction"));
  runToastAction(done.id);
  assert.equal(Lib.listGames().length, 0, "Undo takes the whole import back");
  assert.ok(state.toasts.some((x) => x.message === tn("import.undone", 3)));
});

await test("play import: files that fail or warn are counted and listed; the report offers the undo", async () => {
  clear();
  const sum = await C.importSources([source("good.sgf", GAME(1)), source("gone.sgf", null), source("rules.sgf", "(;GM[1]SZ[9]RU[Tromp-Taylor];B[cc])"), source("many.sgf", GAME(5) + GAME(6))]);
  assert.equal(sum.imported, 2);
  assert.equal(sum.failed, 2);
  assert.equal(Lib.listGames().length, 2);
  const said = state.toasts.at(-1);
  assert.equal(said.tone, "warning");
  assert.ok(said.message.includes(tn("import.done", 2)) && said.message.includes(tn("import.failedN", 2)), said.message);
  assert.equal(said.action.label, t("import.details"));
  runToastAction(said.id);
  assert.equal(state.sheet.kind, "importReport");
  const notes = state.sheet.summary.notes;
  assert.ok(notes.some((n) => n.name === "gone" && n.tone === "error" && n.text === t("import.unreadable")));
  assert.ok(notes.some((n) => n.name === "rules" && n.tone === "error"));
  assert.ok(notes.some((n) => n.name === "many" && n.tone === "warning"), "a file with several games says only its first came in");
  assert.equal(state.sheet.undoable, true);
  C.undoImport(state.sheet.summary.ids);
  assert.equal(Lib.listGames().length, 0);
  assert.equal(state.sheet, null);
  // Nothing readable at all: an error.
  clear();
  await C.importSources([source("x.sgf", null), source("y.sgf", "not sgf")]);
  assert.equal(Lib.listGames().length, 0);
  assert.equal(state.toasts.at(-1).tone, "error");
  assert.equal(state.toasts.at(-1).message, tn("import.noneRead", 2));
});

await test("play import: a file with several games opens the chooser; one game can be opened, or all imported with an undo", async () => {
  clear();
  const text = [GAME(1), GAME(2), PROBLEM(3)].join("\n");
  assert.equal(await C.importSGFText(text, "book.sgf"), null);
  assert.equal(Lib.listGames().length, 0, "nothing is imported before the choice");
  assert.equal(state.sheet?.kind, "sgfGames");
  assert.equal(state.sheet.texts.length, 3);
  assert.equal(state.sheet.name, "book");
  const { texts, name, head } = state.sheet;
  // Open the second game.
  C.importFromCollection(texts, name, 1);
  assert.equal(state.sheet, null);
  assert.equal(Lib.listGames().length, 1);
  assert.equal(Lib.listGames()[0].playerBlack, "Black 2");
  assert.equal(Lib.listGames()[0].name, "book · 2");
  assert.ok(state.review, "it opens in the review");
  C.dropReview();
  // Import all (three: no confirmation).
  clear();
  await C.importAllFromCollection(texts, name, head);
  assert.equal(state.sheet, null);
  assert.equal(Lib.listGames().length, 3);
  const done = state.toasts.find((x) => x.message.includes(tn("import.done", 3)));
  assert.ok(done?.action);
  if (done.action.label === t("common.undoAction")) runToastAction(done.id);
  else {
    runToastAction(done.id);
    C.undoImport(state.sheet.summary.ids);
  }
  assert.equal(Lib.listGames().length, 0);
});

await test("play import: Import all asks first for a large collection, and brings in every game", async () => {
  clear();
  const texts = Array.from({ length: IMPORT_ALL_CONFIRM + 10 }, (_, i) => PROBLEM(i));
  C.importAllFromCollection(texts, "problems", []);
  assert.equal(state.sheet?.kind, "confirm", "more than fifty: asked first");
  assert.notEqual(state.sheet.danger, true, "an ordinary question, not a dangerous one");
  assert.equal(Lib.listGames().length, 0);
  const go = state.sheet.onConfirm;
  state.sheet = null;
  await go();
  for (let k = 0; k < 400 && Lib.listGames().length < texts.length; k++) await sleep(5);
  assert.equal(Lib.listGames().length, texts.length);
  assert.ok(state.toasts.some((x) => x.message === tn("import.done", texts.length)));
});

await test("play import: Paste SGF imports what is on the clipboard, and says when it is not a record", async () => {
  clear();
  await C.pasteSGF("just some words");
  assert.equal(Lib.listGames().length, 0);
  assert.equal(state.toasts.at(-1).message, t("import.notSgf"));
  assert.equal(state.toasts.at(-1).tone, "warning");
  state.toasts = [];
  await C.pasteSGF(GAME(4));
  assert.equal(Lib.listGames().length, 1);
  assert.equal(Lib.listGames()[0].name, t("import.pastedName"));
  assert.equal(Lib.listGames()[0].source, "import");
  assert.ok(state.review, "the pasted record opens");
  C.dropReview();
  // No clipboard to read (the menu item, where the page may not read it): said, with the way out.
  state.toasts = [];
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { readText: async () => Promise.reject(new Error("denied")) } }, configurable: true });
  try {
    await C.pasteSGF();
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
  }
  assert.equal(state.toasts.at(-1).message, t("import.clipboardDenied"));
});
