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
  assert.equal(DEFAULT_SETTINGS.defaultRules, "japanese");
  assert.equal(DEFAULT_SETTINGS.autoUpdateCheck, false, "the update check is opt-in");
  assert.ok(Number.isFinite(DEFAULT_SETTINGS.opponentRank) && !("strength" in DEFAULT_SETTINGS) && !("humanStyle" in DEFAULT_SETTINGS));
  saveSettings(store, { ...DEFAULT_SETTINGS, defaultRules: "chinese", lang: "ko" });
  assert.equal(loadSettings(store).defaultRules, "chinese");
  assert.equal(store.get(SETTINGS_KEY).lang, "ko");
  const bad = normalizeSettings({ defaultRules: "aga", boardSize: 7, appearance: "neon", coords: "yes", opponentRank: "x", playerRank: "y", captureWins: -3, teaching: 1 });
  assert.deepEqual([bad.defaultRules, bad.boardSize, bad.appearance, bad.coords, bad.opponentRank, bad.playerRank, bad.captureWins, bad.teaching], ["japanese", 19, "auto", true, 30, null, 0, null]);
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
    assert.deepEqual(Object.keys(file).sort(), ["createdAt", "finishedAt", "id", "meta", "sgf", "source", "updatedAt"]);
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
    assert.deepEqual([...map.keys()].sort(), [`t:games/${Games.listGames()[0].id}.json`]);
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
    assert.deepEqual(store.list(""), [`games/${a.id}.json`]);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: KataGo's ownership maps come back from the file as arrays, with the same phases", async () => {
  const { phaseBoundaries } = await import("../../src/web/js/app/summary.js");
  const { store, map } = memStore();
  Games.useStore(store);
  try {
    const rec = Games.saveGame(finished(), { name: "own" });
    // 61 positions of a 9×9 game; the board settles from move 11 on (as katago.js parses it: Float32Array).
    const points = Array.from({ length: 61 }, (_, i) => ({
      source: "katago",
      scoreLead: 0,
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
    assert.ok(Array.isArray(back[20].ownership), "an array, not an object with numbered keys");
    assert.equal(back[20].ownership.length, 81);
    assert.ok(Math.abs(back[20].ownership[1] - 0.97) < 0.001);
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
    const doc = exportBackup(store, 5);
    assert.deepEqual(Object.keys(doc.data).sort(), [`games/${a.id}.json`, "profile.json", "settings.json"]);
    const other = memStore().store;
    Games.useStore(other);
    other.put("current.json", { sgf: "(;)" });
    const r = await importBackup(other, doc);
    assert.equal(r.ok, true);
    assert.equal(r.summary.games, 1);
    assert.equal(Games.loadCurrent(), null, "everything is replaced");
    assert.deepEqual(Games.getGame(a.id).analysis, [{ scoreLead: 1 }]);
    assert.equal(loadSettings(other).lang, "ja");
  } finally {
    Games.useStore(null);
  }
});

await test("data: nothing reads the old localStorage keys, and the old data modules are gone", () => {
  const js = path.join(root, "src/web/js");
  for (const f of ["persist.js", "library.js", "app/strength.js", "app/rating.js", "app/plan.js", "app/week.js", "app/course-path.js", "app/beginner.js", "app/today.jsx", "app/library.jsx"]) assert.ok(!fs.existsSync(path.join(js, f)), `${f} is gone`);
  // The sources (not the build output, not the content tables).
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "content" ? [] : walk(path.join(dir, e.name))) : /\.jsx?$/.test(e.name) && e.name !== "bundle.js" ? [path.join(dir, e.name)] : []));
  for (const f of walk(js)) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /goban-studio\.(settings|progress|current|library|batch|update|reportsChecked)\./, path.relative(js, f));
    if (!f.endsWith(path.join("data", "store.js"))) assert.doesNotMatch(src, /\blocalStorage\b/, path.relative(js, f));
    assert.doesNotMatch(src, /state\.progress\b/, path.relative(js, f));
  }
});
