/**
 * v7: your own problem collections. Import SGF problem files, prove each
 * problem with the solver (../problem-import.js), keep the collection with
 * its import report, and rename, delete or export it.
 */
import { analyseEntry, buildCollection, collectionToSGF, readProblemFiles } from "../problem-import.js";
import { saveProgress } from "../persist.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readTextFile } from "../host.js";
import { APP_VERSION } from "../version.js";
import { t } from "../i18n.js";
import { state, update, toast } from "./store.js";
import { confirmAction, openSheet } from "./ctl-core.js";
import { openCollection, openProblem, practiceHome } from "./practice-ctl.js";
import { addCollection, collectionProblems, getCollection, loadCollections, removeCollection, renameCollection } from "./collections-store.js";

export { loadCollections, getCollection, collectionProblems };

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Pick SGF files (or, in a browser, a folder) and import them as one collection. */
export async function pickProblemImport({ folder = false } = {}) {
  update({ menu: null });
  let files = [];
  if (hasNative() && hasFileDialogs()) {
    const picked = normalizePaths(await openFileDialog({ title: t("v7problems.import"), allowMultiple: true }));
    for (const path of picked) {
      const text = await readTextFile(path);
      if (text != null) files.push({ name: String(path).split(/[/\\]/).pop(), text });
    }
  } else {
    files = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".sgf,application/x-go-sgf";
      if (folder) input.webkitdirectory = true;
      input.onchange = async () => {
        const list = [...(input.files || [])].filter((f) => !folder || /\.sgf$/i.test(f.name));
        const out = [];
        for (const f of list) {
          try {
            out.push({ name: f.webkitRelativePath || f.name, text: await f.text() });
          } catch (_) {}
        }
        resolve(out);
      };
      input.click();
    });
  }
  if (files.length) await importProblemFiles(files);
}

function defaultName(files) {
  const first = String(files[0]?.name || "").replace(/\.sgf$/i, "");
  if (files.length === 1) return first.split("/").pop() || t("v7problems.section");
  const dir = first.includes("/") ? first.split("/")[0] : "";
  return dir || `${first.split("/").pop()} +${files.length - 1}`;
}

/**
 * Import files ({name, text}) as one new collection. Each problem is proved
 * in turn (the page stays responsive between problems); the collection
 * keeps every proved problem and the report on every entry.
 */
export async function importProblemFiles(files, { name = null, budget } = {}) {
  const entries = readProblemFiles(files);
  if (!entries.length || entries.every((e) => e.error && !e.stones)) {
    toast(t("v7problems.nothing"), "warn");
    return null;
  }
  const rows = [];
  update({ problemImport: { done: 0, total: entries.length } });
  for (let i = 0; i < entries.length; i++) {
    await tick();
    rows.push(analyseEntry(entries[i], budget ? { budget } : {}));
    update({ problemImport: { done: i + 1, total: entries.length } });
  }
  const col = buildCollection(rows, { name: name || defaultName(files) });
  addCollection(col);
  update({ problemImport: null });
  toast(t("v7problems.imported", [col.problems.length]));
  openCollection(col.id);
  return col;
}

/** Due, solved and tried counts for a collection. */
export function collectionStats(col, now = Date.now()) {
  const pr = state.progress.problems;
  const list = col?.problems || [];
  return {
    total: list.length,
    solved: list.filter((p) => pr[p.id]?.solved).length,
    due: list.filter((p) => pr[p.id]?.due && pr[p.id].due <= now).length,
  };
}

/** The problem to practise next: the one most overdue, else the first unsolved, else the first. */
export function nextInCollection(id, now = Date.now()) {
  const list = collectionProblems(id);
  const pr = state.progress.problems;
  const due = list.filter((p) => pr[p.id]?.due && pr[p.id].due <= now).sort((a, b) => pr[a.id].due - pr[b.id].due);
  return due[0] || list.find((p) => !pr[p.id]?.solved) || list[0] || null;
}

export function practiseCollection(id) {
  const p = nextInCollection(id);
  if (p) openProblem(p.id);
}

export function askRenameCollection(id) {
  const c = getCollection(id);
  if (!c) return;
  openSheet("rename", { id, name: c.name, title: t("v7problems.rename"), onSave: (name) => renameCollectionTo(id, name) });
}

export function renameCollectionTo(id, name) {
  if (!String(name || "").trim()) return;
  renameCollection(id, String(name).trim());
  update();
}

export function deleteCollection(id) {
  confirmAction({
    title: t("v7problems.deleteConfirm"),
    body: t("v7problems.deleteBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      const c = getCollection(id);
      for (const p of c?.problems || []) delete state.progress.problems[p.id];
      saveProgress(state.progress);
      removeCollection(id);
      practiceHome();
    },
  });
}

export async function exportCollection(id) {
  const c = getCollection(id);
  if (!c) return;
  const { saveText } = await import("./play-ctl.js");
  const name = (c.name || "problems").replace(/[\\/:*?"<>|]+/g, "-");
  await saveText(`${name}.sgf`, collectionToSGF(c, { appVersion: APP_VERSION }), "application/x-go-sgf");
}
