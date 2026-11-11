/**
 * Data: games, the game in progress and settings in the store
 * (data/games.js, data/settings.js over data/store.js), each game one file
 * with its analysis and review inside it.
 */
import { test, BLACK, Game, assert, fs, loadSGF, newGame, path, root } from "./helpers.mjs";
import { createStore, localBackend } from "../../src/web/js/data/store.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, normalizeSettings, saveSettings } from "../../src/web/js/data/settings.js";
import { exportBackup, importBackup } from "../../src/web/js/data/backup.js";
import * as Games from "../../src/web/js/data/games.js";

/** A store of its own over a Map (no timers to wait for: flush writes). */
function memStore() {
  const map = new Map();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { store: createStore({ backend: localBackend(storage, "t:"), delay: 1 }), map };
}

const finished = (result = "B+R") => {
  const g = new Game({ size: 9 });
  g.play(2, 2);
  g.play(6, 6);
  g.setResult(result);
  return g;
};

await test("data settings: defaults, the three rulesets, and anything broken falls back per setting", () => {
  const { store } = memStore();
  assert.deepEqual(loadSettings(store), DEFAULT_SETTINGS);
  // No rules chosen yet: they follow the interface language (scripts/tests/shell-settings.mjs).
  assert.equal(DEFAULT_SETTINGS.defaultRules, null);
  assert.equal(DEFAULT_SETTINGS.autoUpdateCheck, false, "the update check is opt-in");
  assert.ok(Number.isFinite(DEFAULT_SETTINGS.opponentRank) && !("strength" in DEFAULT_SETTINGS) && !("humanStyle" in DEFAULT_SETTINGS));
  saveSettings(store, { ...DEFAULT_SETTINGS, defaultRules: "chinese", lang: "ko" });
  assert.equal(loadSettings(store).defaultRules, "chinese");
  assert.equal(store.get(SETTINGS_KEY).lang, "ko");
  const bad = normalizeSettings({ defaultRules: "aga", boardSize: 7, appearance: "neon", coords: "yes", opponentRank: "x", playerRank: "y", captureWins: -3, teaching: 1 });
  assert.deepEqual([bad.defaultRules, bad.boardSize, bad.appearance, bad.coords, bad.opponentRank, bad.playerRank, bad.captureWins, bad.teaching], [null, 19, "auto", true, 30, null, 0, null]);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings([1, 2]), DEFAULT_SETTINGS);
});

await test("data games: one file per game; the game in progress is separate and never fills the history", async () => {
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const g = newGame();
    g.play(4, 4);
    g.play(3, 3);
    Games.saveCurrent(g, { opponent: "ai", rank: 12 });
    assert.equal(Games.listGames().length, 0, "playing does not fill the history");
    assert.equal(loadSGF(Games.loadCurrent().sgf).game.mainLine().length, 3);
    assert.equal(Games.loadCurrent().rank, 12);
    const rec = Games.saveGame(g, { name: "test game", opponent: "ai", humanColor: BLACK });
    assert.match(rec.id, /^[a-z0-9-]+$/);
    assert.deepEqual(store.list("games/"), [`games/${rec.id}.json`]);
    const file = store.get(`games/${rec.id}.json`);
    assert.deepEqual(Object.keys(file).sort(), ["createdAt", "finishedAt", "id", "meta", "sgf", "source", "updatedAt", "v"]);
    assert.equal(file.v, 13, "a game file carries the store's format version");
    assert.equal(file.meta.moves, 2);
    assert.equal(file.meta.thumb.length, 361);
    assert.equal(Games.getGame(rec.id).name, "test game");
    Games.renameGame(rec.id, "renamed");
    assert.equal(Games.getGame(rec.id).name, "renamed");
    g.setResult("B+3.5");
    Games.saveGame(g, { id: rec.id, opponent: "ai", humanColor: BLACK });
    assert.equal(Games.getGame(rec.id).name, "renamed", "saving again keeps the name");
    const imp = newGame(9);
    imp.play(1, 1);
    Games.saveGame(imp, { name: "imported", source: "import" });
    const all = Games.listGames();
    assert.equal(Games.filterGames(all, { kind: "won" }).length, 1);
    assert.equal(Games.filterGames(all, { kind: "lost" }).length, 0);
    assert.equal(Games.filterGames(all, { kind: "imported" }).length, 1);
    assert.equal(Games.filterGames(all, { query: "RENAMED" }).length, 1);
    // A draw is neither won nor lost.
    const draw = Games.saveGame(finished("Draw"), { opponent: "ai", humanColor: BLACK });
    assert.equal(Games.filterGames(Games.listGames(), { kind: "won" }).length, 1);
    Games.deleteGame(draw.id);
    Games.deleteGame(rec.id);
    assert.equal(Games.listGames().length, 1);
    assert.equal(Games.getGame("../settings"), null, "an id is never a path");
    Games.clearCurrent();
    assert.equal(Games.loadCurrent(), null);
    assert.equal(await store.flush(), true);
    assert.deepEqual([...map.keys()].sort(), ["t:games-index.json", `t:games/${Games.listGames()[0].id}.json`]);
    assert.deepEqual(Object.keys(JSON.parse(map.get("t:games-index.json")).games), [Games.listGames()[0].id], "the index follows saves and deletes");
  } finally {
    Games.useStore(null);
  }
});

await test("data games: the history in two groups, in three orders; several games deleted at once", () => {
  const { store } = memStore();
  Games.useStore(store);
  try {
    const at = (id, t) => Games.patchGame(id, { updatedAt: t });
    const won = Games.saveGame(finished("B+R"), { name: "won", opponent: "ai", humanColor: BLACK });
    const lost = Games.saveGame(finished("W+3.5"), { name: "lost", opponent: "ai", humanColor: BLACK });
    const whiteWon = Games.saveGame(finished("W+R"), { name: "won as White", opponent: "ai", humanColor: -1 });
    const draw = Games.saveGame(finished("Draw"), { name: "draw", opponent: "ai", humanColor: BLACK });
    const imp = Games.saveGame(finished("B+R"), { name: "imported", source: "import" });
    const open1 = Games.saveGame(finished(null), { name: "unfinished 1", opponent: "ai", humanColor: BLACK });
    const open2 = Games.saveGame(finished(null), { name: "unfinished 2", opponent: "human" });
    const board = Games.saveGame(finished(null), { name: "a board", source: "board" });
    [won, lost, whiteWon, draw, imp, open1, open2, board].forEach((r, i) => at(r.id, 1000 + i));
    const { unfinished, finished: rest } = Games.groupGames(Games.listGames());
    assert.deepEqual(unfinished.map((g) => g.name), ["unfinished 2", "unfinished 1"], "games played here without a result, newest first");
    assert.deepEqual(rest.map((g) => g.name), ["a board", "imported", "draw", "won as White", "lost", "won"], "everything else: a saved board and an imported record are not games to continue");
    assert.deepEqual(Games.sortGames(rest, "oldest").map((g) => g.name), ["won", "lost", "won as White", "draw", "imported", "a board"]);
    assert.deepEqual(Games.sortGames(rest, "newest").map((g) => g.name), rest.map((g) => g.name));
    assert.deepEqual(Games.sortGames(rest, "result").map((g) => g.name), ["won as White", "won", "lost", "a board", "imported", "draw"], "your wins, your losses, then the rest; newest first within each");
    assert.deepEqual(Games.sortGames(rest, "nonsense").map((g) => g.name), rest.map((g) => g.name));
    assert.notEqual(Games.sortGames(rest), rest, "a new array");
    assert.deepEqual(Games.SORTS, ["newest", "oldest", "result"]);
    // Several at once (the unfinished games cleared, an import undone).
    assert.equal(Games.deleteGames([open1.id, open2.id, "no-such-game", "../x"]), 2);
    assert.equal(Games.groupGames(Games.listGames()).unfinished.length, 0);
    assert.equal(Games.listGames().length, 6);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: a game's biggest swing is in the index, for its row, when KataGo's review is stored", async () => {
  const { store } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished(), { name: "a", opponent: "ai", humanColor: BLACK });
    assert.equal(Games.getGame(a.id).swing, null, "no review yet");
    const moments = [{ index: 12, loss: 3.26 }, { index: 31, loss: 11.74 }, { index: 40, loss: null }];
    Games.patchGame(a.id, { report: { v: 1, lineKey: "x", confidence: "high", moments } });
    assert.deepEqual(Games.getGame(a.id).swing, { index: 31, loss: 11.5 }, "the costliest moment, to half a point");
    assert.deepEqual(Games.listGames()[0].swing, { index: 31, loss: 11.5 });
    await store.flush();
    assert.deepEqual(store.get(Games.INDEX_KEY).games[a.id].review.swing, { index: 31, loss: 11.5 }, "kept in the index: the list reads no game file");
    // The offline estimate names no losses: nothing to show.
    Games.patchGame(a.id, { report: { v: 1, lineKey: "x", confidence: "low", moments: [{ index: 5, loss: null }] } });
    assert.equal(Games.getGame(a.id).swing, null);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: the analysis and the review live in the game's own file and go with it", () => {
  const { store } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished(), { name: "a" });
    const b = Games.saveGame(finished("W+2.5"), { name: "b" });
    Games.patchGame(b.id, { updatedAt: a.updatedAt + 1000 });
    const order = Games.listGames().map((g) => g.id);
    assert.deepEqual(order, [b.id, a.id]);
    const points = [{ source: "katago", scoreLead: 0 }, { source: "katago", scoreLead: 1 }, { source: "katago", scoreLead: 2 }];
    assert.ok(Games.patchGame(a.id, { report: { v: 1, lineKey: "x" }, analysis: points }));
    assert.deepEqual(Games.listGames().map((g) => g.id), order, "a patch does not move a game");
    const file = store.get(`games/${a.id}.json`);
    assert.deepEqual(file.review, { v: 1, lineKey: "x" });
    assert.deepEqual(file.analysis, points);
    assert.ok(!("report" in file.meta) && !("analysis" in file.meta));
    assert.deepEqual(Games.getGame(a.id).report, { v: 1, lineKey: "x" });
    assert.equal(Games.getGame(b.id).report, null);
    // Saving the game again (review edits) keeps both; play/review-model reviewFits decides if they still hold.
    Games.saveGame(finished(), { id: a.id, keepPlace: true });
    assert.deepEqual(Games.getGame(a.id).report, { v: 1, lineKey: "x" });
    Games.patchGame(a.id, { report: null, analysis: null });
    assert.ok(!("review" in store.get(`games/${a.id}.json`)) && !("analysis" in store.get(`games/${a.id}.json`)));
    assert.equal(Games.patchGame("nope", { report: {} }), null);
    // Deleting a game deletes its analysis with it: there is no other key.
    Games.patchGame(b.id, { analysis: points });
    Games.deleteGame(b.id);
    assert.deepEqual(store.list(""), ["games-index.json", `games/${a.id}.json`]);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: a stored analysis keeps ownership maps (as arrays) only around the key moments, a settled share everywhere, and the same phases", async () => {
  const { phaseBoundaries } = await import("../../src/web/js/app/summary.js");
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const rec = Games.saveGame(finished(), { name: "own" });
    // 61 positions of a 9×9 game; the board settles from move 11 on (as katago.js parses it: Float32Array).
    const points = Array.from({ length: 61 }, (_, i) => ({
      source: "katago",
      // One key moment: the score drops by 6 at move 11.
      scoreLead: i >= 11 ? -6 : 0,
      ownership: Float32Array.from({ length: 81 }, (_, k) => (i >= 11 ? (k % 2 ? 0.97 : -0.96) : (k % 3) * 0.1 - 0.1)),
    }));
    const before = phaseBoundaries(9, points, 61);
    Games.patchGame(rec.id, { analysis: points });
    assert.equal(await store.flush(), true);
    // A restart: a new store over the same files.
    const again = createStore({ backend: localBackend({ get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k) }, "t:"), delay: 1 });
    await again.open();
    Games.useStore(again);
    const back = Games.getGame(rec.id).analysis;
    // The swing at move 11 is the key moment: positions 10 and 11 keep their maps.
    assert.ok(Array.isArray(back[10].ownership) && !("ownership" in back[12]));
    assert.ok(Array.isArray(back[11].ownership), "an array, not an object with numbered keys");
    assert.equal(back[11].ownership.length, 81);
    assert.ok(Math.abs(back[11].ownership[1] - 0.97) < 0.001);
    assert.ok(!("ownership" in back[20]), "no map away from the key moments");
    assert.equal(back[20].firm, 1, "its settled share instead");
    assert.ok(map.get(`t:games/${rec.id}.json`).length < 61 * 81 * 3, "the file is a fraction of the maps' size");
    assert.deepEqual(phaseBoundaries(9, back, 61), before, "the same phases after the round trip");
    assert.equal(before.method, "ownership");
  } finally {
    Games.useStore(null);
  }
});

await test("data games: finishedAt is set once; an edit keeps its place, a game saved again from play moves up", async () => {
  const { store } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished(), { name: "a" });
    const b = Games.saveGame(finished(), { name: "b" });
    Games.patchGame(b.id, { updatedAt: Date.now() + 1000 }); // b is the newer one
    assert.ok(a.finishedAt && b.finishedAt);
    assert.deepEqual(Games.listGames().map((g) => g.name), ["b", "a"]);
    // An old game ("a"), finished last month, edited today.
    const old = Date.now() - 30 * 86400000;
    Games.patchGame(a.id, { finishedAt: old, createdAt: old });
    const edited = Games.saveGame(finished(), { id: a.id, keepPlace: true });
    assert.equal(edited.finishedAt, old, "finishedAt is not moved by an edit");
    assert.ok(edited.editedAt >= edited.updatedAt);
    assert.deepEqual(Games.listGames().map((g) => g.name), ["b", "a"], "an edit keeps the game in place");
    Games.patchGame(b.id, { updatedAt: Date.now() - 1000 });
    Games.saveGame(finished(), { id: a.id });
    assert.deepEqual(Games.listGames().map((g) => g.name), ["a", "b"]);
    // A game without a result has no finishedAt.
    const g = newGame(9);
    g.play(2, 2);
    assert.equal(Games.saveGame(g, {}).finishedAt, null);
    // The rules of a record; anything unknown is Japanese.
    const k = new Game({ size: 9, rules: "korean" });
    k.play(4, 4);
    assert.equal(Games.describeGame(k).rules, "korean");
    assert.equal(Games.recordRules({}), "japanese");
    assert.equal(Games.recordRules({ rules: "chinese" }), "chinese");
  } finally {
    Games.useStore(null);
  }
});

await test("data games: a backup holds every game file with its analysis, and restores them whole", async () => {
  const { store } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished(), { name: "a" });
    Games.patchGame(a.id, { analysis: [{ scoreLead: 1 }], report: { v: 1 } });
    saveSettings(store, { ...DEFAULT_SETTINGS, lang: "ja" });
    store.put("profile.json", { v: 9 });
    const doc = await exportBackup(store, 5);
    assert.deepEqual(Object.keys(doc.data).sort(), [`games/${a.id}.json`, "profile.json", "settings.json"], "the games index is rebuilt, not backed up");
    const other = memStore().store;
    Games.useStore(other);
    other.put("current.json", { sgf: "(;)" });
    const r = await importBackup(other, doc);
    assert.equal(r.ok, true);
    assert.equal(r.summary.games, 1);
    assert.equal(Games.loadCurrent(), null, "everything is replaced");
    assert.deepEqual(Games.getGame(a.id).analysis, [{ scoreLead: 1 }]);
    assert.ok(r.snapshot.startsWith("backups/pre-restore-"), "what was there is kept as a snapshot");
    assert.equal(loadSettings(other).lang, "ja");
  } finally {
    Games.useStore(null);
  }
});

/* ------------------------------------------------- delete, with an undo */

await test("data games: a trashed game leaves the list at once, and restoring it puts back its file and index entry exactly", async () => {
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished("B+R"), { name: "first", opponent: "ai", humanColor: BLACK });
    const b = Games.saveGame(finished("W+2.5"), { name: "second", opponent: "ai", humanColor: BLACK });
    const c = Games.saveGame(finished("B+0.5"), { name: "third", source: "import" });
    Games.patchGame(b.id, { analysis: [{ scoreLead: 1 }], report: { v: 3, confidence: "high" } });
    await store.flush();
    const fileBefore = map.get(`t:games/${b.id}.json`);
    const indexBefore = map.get("t:games-index.json");
    assert.deepEqual(Object.keys(JSON.parse(indexBefore).games), [a.id, b.id, c.id]);

    assert.equal(Games.trashGame(b.id), b.id);
    assert.equal(Games.trashedGame(), b.id);
    assert.deepEqual(Games.listGames().map((g) => g.id).sort(), [a.id, c.id].sort(), "gone from the list at once");
    assert.equal(Games.getGame(b.id), null, "and for every reader");
    assert.equal(await Games.loadGame(b.id), null);
    assert.equal(Games.patchGame(b.id, { name: "late" }), null, "nothing patches a game that is on its way out");
    assert.equal(Games.renameGame(b.id, "late"), null);
    // Nothing of the file is touched while the undo is possible (pending() would name it).
    assert.deepEqual(store.pending(), ["games-index.json"], "only the index is written");
    assert.equal(map.get(`t:games/${b.id}.json`), fileBefore, "the file is as it was");

    assert.equal(Games.restoreGame("nope"), false, "only the held game comes back");
    assert.equal(Games.restoreGame(b.id), true);
    assert.equal(Games.trashedGame(), null);
    await store.flush();
    assert.equal(map.get(`t:games/${b.id}.json`), fileBefore, "the file, byte for byte");
    assert.equal(map.get("t:games-index.json"), indexBefore, "the index, byte for byte (the entry is back in its place)");
    assert.equal(Games.getGame(b.id).name, "second");
    assert.deepEqual(Games.getGame(b.id).analysis, [{ scoreLead: 1 }]);
    assert.equal(Games.restoreGame(b.id), false, "an undo happens once");
  } finally {
    Games.useStore(null);
  }
});

await test("data games: the delete becomes final on commit, on the next delete, and whenever the store is flushed", async () => {
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const ids = ["one", "two", "three", "four"].map((name) => Games.saveGame(finished(), { name }).id);
    await store.flush();
    const has = (id) => map.has(`t:games/${id}.json`);

    // commitTrash: the file goes.
    Games.trashGame(ids[0]);
    assert.equal(Games.commitTrash(), ids[0]);
    assert.equal(Games.commitTrash(), null, "nothing held any more");
    await store.flush();
    assert.equal(has(ids[0]), false);
    assert.equal(Games.restoreGame(ids[0]), false, "too late to undo");

    // Another delete commits the one before; only the newest can be undone.
    Games.trashGame(ids[1]);
    Games.trashGame(ids[2]);
    assert.equal(Games.trashedGame(), ids[2]);
    assert.equal(Games.restoreGame(ids[1]), false);
    assert.equal(Games.restoreGame(ids[2]), true);
    await store.flush();
    assert.equal(has(ids[1]), false);
    assert.equal(has(ids[2]), true);

    // A flush (the app quits, a backup is made) commits what is held: nothing is left half deleted.
    Games.trashGame(ids[3]);
    assert.equal(has(ids[3]), true);
    await store.flush();
    assert.equal(has(ids[3]), false, "committed by the flush");
    assert.equal(Games.trashedGame(), null);
    assert.equal(Games.restoreGame(ids[3]), false);
    assert.deepEqual(Object.keys(JSON.parse(map.get("t:games-index.json")).games), [ids[2]]);
    assert.deepEqual(Games.listGames().map((g) => g.id), [ids[2]]);

    // Trashing something that is not there holds nothing.
    assert.equal(Games.trashGame("missing"), null);
    assert.equal(Games.trashGame("../x"), null);
    assert.equal(Games.trashedGame(), null);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: a held game survives a crash as an undo; saving under its id deletes first; a hard delete drops the hold", async () => {
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const a = Games.saveGame(finished(), { name: "kept" });
    const b = Games.saveGame(finished(), { name: "other" });
    await store.flush();
    Games.trashGame(a.id);
    // The index reaches the disk, then the app dies before the commit: the
    // file is still there, and the next start lists the game again.
    const copy = new Map(map);
    {
      const storage = { get length() { return copy.size; }, key: (i) => [...copy.keys()][i] ?? null, getItem: (k) => (copy.has(k) ? copy.get(k) : null), setItem: (k, v) => void copy.set(k, String(v)), removeItem: (k) => void copy.delete(k) };
      // (Written by hand: a flush would commit.)
      copy.set("t:games-index.json", JSON.stringify({ v: 13, games: { [b.id]: JSON.parse(map.get("t:games-index.json")).games[b.id] } }));
      const next = createStore({ backend: localBackend(storage, "t:"), delay: 1 });
      await next.open({ lazy: ["games/"] });
      Games.useStore(next);
      await Games.initIndex();
      assert.deepEqual(Games.listGames().map((g) => g.name).sort(), ["kept", "other"], "the game is back");
      Games.useStore(store);
    }
    // Saving a game under the held id: the delete is made final first, then the save starts a new file.
    assert.equal(Games.trashedGame(), a.id);
    const again = Games.saveGame(finished("W+R"), { id: a.id, name: "new under the old id" });
    assert.equal(Games.trashedGame(), null);
    assert.equal(again.id, a.id);
    assert.equal(Games.getGame(a.id).name, "new under the old id");
    assert.equal(Games.getGame(a.id).result, "W+R");
    // deleteGame on the held game: gone for good, nothing left to commit.
    Games.trashGame(b.id);
    Games.deleteGame(b.id);
    assert.equal(Games.trashedGame(), null);
    await store.flush();
    assert.equal(map.has(`t:games/${b.id}.json`), false);
    assert.deepEqual(Games.listGames().map((g) => g.id), [a.id]);
  } finally {
    Games.useStore(null);
  }
});

await test("data: nothing reads the old localStorage keys, and the old data modules are gone", () => {
  const js = path.join(root, "src/web/js");
  for (const f of ["persist.js", "library.js", "app/strength.js", "app/rating.js", "app/plan.js", "app/week.js", "app/course-path.js", "app/beginner.js", "app/library.jsx"]) assert.ok(!fs.existsSync(path.join(js, f)), `${f} is gone`);
  // The sources (not the build output, not the content tables).
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "content" ? [] : walk(path.join(dir, e.name))) : /\.jsx?$/.test(e.name) && e.name !== "bundle.js" ? [path.join(dir, e.name)] : []));
  for (const f of walk(js)) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /goban-studio\.(settings|progress|current|library|batch|update|reportsChecked)\./, path.relative(js, f));
    if (!f.endsWith(path.join("data", "store.js"))) assert.doesNotMatch(src, /\blocalStorage\b/, path.relative(js, f));
    assert.doesNotMatch(src, /state\.progress\b/, path.relative(js, f));
  }
});
