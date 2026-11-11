/**
 * The Library's games: opening a record or a classic, the unfinished games,
 * deleting with Undo, renaming, exporting; and importing SGF — files,
 * paths, pasted text, collections — with its report.
 */
import { countGames, decodeSgf, loadSGF } from "../sgf.js";
import * as Games from "../data/games.js";
import { recordClassic } from "../model/record.js";
import { t, tn } from "../i18n.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readFileBytes } from "../host.js";
import { CLASSICS, withContent } from "../content.js";
import { state, update, toast, dismissToastKey, runTask } from "./store.js";
import { changeProfile, confirmAction, openSheet, setSetting } from "./ctl-core.js";
import { persistCurrent } from "./game-session.js";
import { exportSGF } from "./game-end.js";
import { resumeRecord } from "./game-start.js";
import { openReview } from "./review-session.js";
import { IMPORT_ALL_CONFIRM, importSummary, looksLikeSgf, splitCollection } from "../play/import.js";

/* ---------------------------------------------------- the games' history */

/**
 * Open a game of the Library. A finished game, an imported record or a
 * saved board opens in the review; a game left unfinished continues on the
 * board (play-ctl resumeRecord), unless `look`: then it opens in the review
 * too ("Look at it"), and the game on the board is neither replaced nor
 * saved aside.
 */
export function openRecord(id, { look = false } = {}) {
  // A game's file is read when it is opened: a slow read shows that it is
  // loading, and one that fails says so and offers Retry (store.js runTask).
  if (!Games.isLoaded(id)) {
    const load = async () => {
      const rec = await Games.loadGame(id);
      // The task says what failed, with Retry: the store's own toast would say it twice.
      if (!rec) dismissToastKey("store");
      // (Inside the task, so a Retry that works opens the game too.)
      else openRecord(id, { look });
      return rec;
    };
    return runTask("game:" + id, load, { label: t("task.openingGame"), error: t("task.gameFailed"), failed: (rec) => !rec });
  }
  const rec = Games.getGame(id);
  if (!rec) return;
  // A game left unfinished continues where it stopped (play-ctl resumeRecord).
  if (Games.isUnfinished(rec) && !look) return resumeRecord(id);
  try {
    const { game } = loadSGF(rec.sgf);
    // The same review as after a game: its stored analysis opens at once.
    const free = rec.source === "board";
    openReview(game, { source: "record", recordId: rec.id, name: rec.name, humanColor: rec.opponent === "ai" ? rec.humanColor : null, space: "library", back: "library", autoJump: !free, free });
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
}

/** "Look at it": an unfinished game in the review, without continuing it. */
export function lookAtRecord(id) {
  return openRecord(id, { look: true });
}

/** The review on screen is of a game left unfinished in the Library (its panel offers Continue). */
export function reviewUnfinished(r = state.review) {
  const id = r?.source === "record" ? r.meta.recordId : null;
  return !!id && Games.isUnfinished(Games.getGame(id));
}

/**
 * "Clear unfinished games…": every game left unfinished leaves the Library,
 * after a confirmation. The game on the board stays on the board.
 */
export function clearUnfinished() {
  const ids = Games.listGames().filter(Games.isUnfinished).map((g) => g.id);
  if (!ids.length) return;
  confirmAction({
    title: tn("library.clearUnfinishedTitle", ids.length),
    body: t("library.clearUnfinishedBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      Games.commitTrash();
      const n = Games.deleteGames(ids);
      if (state.game && ids.includes(state.game.recordId)) {
        state.game.recordId = null;
        state.game.saved = false;
        persistCurrent();
      }
      update();
      toast(tn("library.clearedN", n), "info");
    },
  });
}

export function openClassic(id) {
  return withContent("classics", () => showClassic(id));
}

function showClassic(id) {
  const c = CLASSICS.find((g) => g.id === id);
  if (!c) return;
  try {
    const { game } = loadSGF(c.sgf);
    changeProfile((p) => recordClassic(p, c.id, Date.now()));
    openReview(game, { source: "classic", classic: c, classicId: c.id, startAt: (c.moments?.find((m) => m.title) ?? c.moments?.[0])?.index, autoJump: !c.moments?.length, space: "library", back: "library" });
  } catch (e) {
    console.error("classic open failed", e);
    toast(t("library.importError"), "error");
  }
}

/**
 * Delete a game from the Library: it goes at once, and a toast offers Undo
 * for a few seconds (data/games.js trashGame). The file is deleted when the
 * toast goes, when another game is deleted, and before the app quits.
 */
export function deleteRecord(id) {
  if (!Games.trashGame(id)) return;
  update();
  toast(t("library.deleted"), "info", {
    key: "game-deleted",
    replace: true,
    action: {
      label: t("common.undoAction"),
      run: () => {
        if (Games.restoreGame(id)) update();
      },
    },
    // Gone without Undo: the delete is final (unless a newer delete already made it so).
    onClose: (reason) => {
      if (reason !== "action" && Games.trashedGame() === id) Games.commitTrash();
    },
  });
}

export function renameRecord(id, name) {
  Games.renameGame(id, name);
  update();
}

export async function exportRecord(id) {
  const rec = Games.isLoaded(id) ? Games.getGame(id) : await Games.loadGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    exportSGF(game, rec.name || "goban-studio");
  } catch (_) {
    toast(t("library.importError"), "error");
  }
}

/*
 * Importing SGF (the pure parts are play/import.js).
 *
 * One file, or text pasted: a record with one game opens in the review; a
 * file with several opens the chooser (import-sheet.jsx: open one, or
 * import all). Several files at once are all imported, the Library stays
 * on screen, and one toast says how many came in, with Undo. Every warning
 * and every file that could not be read is listed (the toast's Details).
 */

/** A record under rules the app cannot score names those rules. */
function importErrorText(e) {
  if (e?.code === "unsupported-size") return t("sgf.unsupportedSize", [String(e.size || "?")]);
  if (e?.code !== "unsupported-rules") return t("library.importError");
  const name = String(e.rules || "").replace(/\s+/g, " ").trim().slice(0, 40) || "?";
  return t("rules.unsupported", [name]);
}

const baseName = (name) => String(name || "").split(/[/\\]/).pop().replace(/\.sgf$/i, "") || "goban-studio";

/** Read one game and save it as an imported record: { name, id, game, rec, warnings }, or { name, error }. */
function importOne(input, name, index = null) {
  try {
    const { game, warnings } = loadSGF(input, index == null ? {} : { index });
    const rec = Games.saveGame(game, { name: baseName(name), source: "import" });
    return { name: baseName(name), id: rec.id, game, rec, warnings };
  } catch (e) {
    return { name: baseName(name), error: importErrorText(e) };
  }
}

/** Importing is something a player does: it ends the first-run sheet. */
function importing() {
  if (state.settings.onboarded) return;
  setSetting("onboarded", true);
  update({ sheet: null });
}

function openImported(d) {
  openReview(d.game, { source: "record", recordId: d.rec.id, name: d.rec.name, space: "library", back: "library", autoJump: true });
}

/** Take an import back: the records it made leave the Library. */
export function undoImport(ids) {
  const n = Games.deleteGames(ids);
  update({ sheet: null });
  if (n) toast(tn("import.undone", n), "info");
}

/**
 * Say what an import came to: "Imported 5 games", with Undo; when there
 * are warnings or files that failed, with Details instead (the report
 * sheet lists them all and offers the undo).
 */
function reportImport(done, { opened = false } = {}) {
  const sum = importSummary(done);
  update();
  if (!sum.imported && !sum.failed) return sum;
  const details = { label: t("import.details"), run: () => openSheet("importReport", { summary: sum, undoable: !opened }) };
  if (!sum.imported) {
    toast(sum.failed === 1 ? sum.notes[0].text : tn("import.noneRead", sum.failed), "error", sum.failed > 1 ? { action: details } : {});
    return sum;
  }
  if (opened) {
    // One record, now open: its warnings (one is said as it is).
    if (sum.notes.length === 1) toast(sum.notes[0].text, "warning");
    else if (sum.notes.length > 1) toast(tn("import.notes", sum.notes.length), "warning", { action: details });
    return sum;
  }
  const said = tn("import.done", sum.imported) + (sum.failed ? t("a11y.sentence") + tn("import.failedN", sum.failed) : "");
  if (sum.notes.length) toast(said, sum.failed ? "warning" : "success", { key: "import", replace: true, action: details });
  else toast(said, "success", { key: "import", replace: true, action: { label: t("common.undoAction"), run: () => undoImport(sum.ids) } });
  return sum;
}


/**
 * One record (text, or raw bytes: loadSGF decodes them and says when it had
 * to guess the charset). A file with several games opens the chooser.
 */
export async function importSGFText(text, name = "goban-studio.sgf") {
  importing();
  let games = 1;
  try {
    games = countGames(text);
  } catch (_) {
    games = 1;
  }
  if (games > 1) return openCollection(text, name);
  const d = importOne(text, name);
  if (d.error) {
    toast(d.error, "error");
    return null;
  }
  openImported(d);
  reportImport([d], { opened: true });
  return d.rec;
}

/** A file with several games: the chooser lists them (import-sheet.jsx). */
function openCollection(input, name) {
  let texts = [];
  let head = [];
  try {
    texts = splitCollection(typeof input === "string" ? input : decodeSgf(input).text);
    // What the file as a whole needs said (a guessed charset), once.
    head = loadSGF(input, { index: 0 }).warnings;
  } catch (_) {
    /* the chooser says which games cannot be read */
  }
  if (texts.length < 2) {
    // Not cut into its games after all: the first game, with the reader's own word about the rest.
    const d = importOne(input, name);
    if (d.error) {
      toast(d.error, "error");
      return null;
    }
    openImported(d);
    reportImport([d], { opened: true });
    return d.rec;
  }
  openSheet("sgfGames", { name: baseName(name), texts, head });
  return null;
}

/** The chooser's "Open": one game of the file, imported and opened. */
export function importFromCollection(texts, name, index) {
  const d = importOne(texts[index], `${baseName(name)} · ${index + 1}`);
  if (d.error) return toast(d.error, "error");
  update({ sheet: null });
  openImported(d);
  reportImport([d], { opened: true });
}

/** The chooser's "Import all" (asked first above IMPORT_ALL_CONFIRM games). */
export function importAllFromCollection(texts, name, head = []) {
  const go = () =>
    runTask(
      "import",
      async () => {
        update({ sheet: null });
        const done = [];
        for (let i = 0; i < texts.length; i++) {
          done.push(importOne(texts[i], `${baseName(name)} · ${i + 1}`));
          // Let the page breathe: a thousand problems take a moment.
          if (i % 25 === 24) await new Promise((r) => setTimeout(r));
        }
        if (head.length && done[0]) done[0] = { ...done[0], warnings: [...head, ...(done[0].warnings || []).filter((w) => !head.includes(w))] };
        return done;
      },
      { label: t("import.working"), error: t("library.importError") },
    ).then((done) => done && reportImport(done));
  if (texts.length <= IMPORT_ALL_CONFIRM) return go();
  confirmAction({ title: tn("import.allTitle", texts.length), body: t("import.allBody"), confirm: t("import.all"), onConfirm: go });
}

/**
 * Import what was dropped, picked or opened: `sources` is [{ name, read }],
 * read() resolving with the file's bytes or text (null when it cannot be
 * read). One source goes through importSGFText; several are all imported
 * (the first game of each; a file with more says so in the details).
 */
export async function importSources(sources) {
  const list = (sources || []).filter(Boolean);
  if (!list.length) return null;
  importing();
  const read = async (s) => {
    try {
      return await s.read();
    } catch (_) {
      return null;
    }
  };
  if (list.length === 1) {
    const data = await runTask("import", () => read(list[0]), { label: t("import.working"), error: t("import.unreadable") , failed: (v) => v == null });
    return data == null ? null : importSGFText(data, list[0].name);
  }
  const done = await runTask(
    "import",
    async () => {
      const out = [];
      for (const s of list) {
        const data = await read(s);
        out.push(data == null ? { name: baseName(s.name), error: t("import.unreadable") } : importOne(data, s.name));
      }
      return out;
    },
    { label: t("import.working"), error: t("library.importError") },
  );
  return done ? reportImport(done) : null;
}

const isSgfName = (name) => /\.sgf$/i.test(String(name || ""));

/** Files from the picker or a drop (File objects). Files that are not .sgf are left out, and said. */
export function importFiles(files) {
  const all = [...(files || [])];
  const sgf = all.filter((f) => isSgfName(f.name));
  if (all.length && !sgf.length) return toast(t("library.onlySgf"), "warn");
  return importSources(sgf.map((f) => ({ name: f.name, read: async () => new Uint8Array(await f.arrayBuffer()) })));
}

/** Paths from the native dialog, a drop on the window or files opened with the app. */
export function importPaths(paths) {
  const all = [...(paths || [])];
  const sgf = all.filter(isSgfName);
  if (all.length && !sgf.length) return toast(t("library.onlySgf"), "warn");
  return importSources(sgf.map((p) => ({ name: p, read: () => readFileBytes(p) })));
}

export async function pickImport() {
  update({ menu: null });
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("library.import"), allowMultiple: true });
    const paths = normalizePaths(files);
    if (paths.length) importPaths(paths);
    return;
  }
  document.getElementById("file-input")?.click();
}

/**
 * Paste an SGF: `text` from a paste event (⌘V on the Library), or read from
 * the clipboard (the Import menu's "Paste SGF"). Text that is not SGF is
 * said to be that; a clipboard that cannot be read names the shortcut.
 */
export async function pasteSGF(text = null) {
  update({ menu: null });
  let s = text;
  if (s == null) {
    try {
      s = await navigator.clipboard.readText();
    } catch (_) {
      return toast(t("import.clipboardDenied"), "warning");
    }
  }
  if (!looksLikeSgf(s)) return toast(t("import.notSgf"), "warning");
  return importSGFText(s, t("import.pastedName"));
}
