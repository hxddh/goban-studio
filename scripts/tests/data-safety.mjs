/**
 * Data, v13 (docs/storage.md): the store's safe state (unreadable files
 * are write-blocked, damaged ones copied aside first, a failed list makes
 * everything read-only, a packaged app without its bridge never falls back
 * to localStorage), versions and migrations of the stored files and of
 * backups, the restore snapshot and its undo, lazy game files behind the
 * games index (300 games: boot reads the index only), and settings
 * clamped to their ranges.
 */
import { test, assert, bundle, Game, BLACK } from "./helpers.mjs";
import { createStore, localBackend, MAX_BYTES, badKey, validKey } from "../../src/web/js/data/store.js";
import { MIGRATIONS, STORE_V, migrateFile } from "../../src/web/js/data/migrate.js";
import { packAnalysis, keptIndices } from "../../src/web/js/data/pack.js";
import * as B from "../../src/web/js/data/backup.js";
import * as Games from "../../src/web/js/data/games.js";
import { DEFAULT_SETTINGS, normalizeSettings, loadSettings } from "../../src/web/js/data/settings.js";
import { PROFILE_V } from "../../src/web/js/model/player.js";

/** A backend over a Map of key → text, counting reads; `fail` makes a key (or the list) fail. */
function memBackend(files = new Map()) {
  const b = {
    kind: "host",
    files,
    reads: [],
    inFlight: 0,
    maxInFlight: 0,
    fail: new Set(),
    async list() {
      if (b.fail.has("*list")) throw new Error("Disk");
      return [...files.keys()];
    },
    async read(key) {
      b.reads.push(key);
      b.inFlight++;
      b.maxInFlight = Math.max(b.maxInFlight, b.inFlight);
      await new Promise((r) => setTimeout(r, 1));
      b.inFlight--;
      if (b.fail.has(key)) throw new Error("Disk");
      return files.has(key) ? files.get(key) : null;
    },
    async write(key, text) {
      if (b.fail.has("*write")) throw new Error("Disk");
      files.set(key, text);
    },
    async remove(key) {
      files.delete(key);
    },
  };
  return b;
}
const open = async (backend, opts = {}) => {
  const errors = [];
  const store = createStore({ backend, delay: 1, migrate: migrateFile, now: () => 1731000000000, onError: (e) => errors.push(e) });
  await store.open(opts);
  return { store, errors };
};

/* ------------------------------------------------------ the safe state */

await test("data safety: a file that cannot be read is reported and write-blocked; what the app puts there stays in memory", async () => {
  const be = memBackend(new Map([["settings.json", '{"lang":"ko"}'], ["profile.json", '{"v":9}'], ["current.json", '{"sgf":"(;)"}']]));
  be.fail.add("profile.json");
  const { store, errors } = await open(be);
  assert.deepEqual(store.openReport.failed.map((f) => [f.key, f.kind]), [["profile.json", "read"]]);
  assert.ok(errors.some((e) => e.op === "read" && e.key === "profile.json"));
  assert.deepEqual(store.blocked(), ["profile.json"]);
  store.put("profile.json", { v: 9, fresh: true });
  store.put("current.json", { sgf: "(;B[aa])" });
  assert.equal(await store.flush(), true);
  assert.equal(be.files.get("profile.json"), '{"v":9}', "the file it could not read is never written over");
  assert.match(be.files.get("current.json"), /B\[aa\]/, "other keys are written as usual");
  assert.deepEqual(store.held(), ["profile.json"]);
  // Removing it is held too.
  store.remove("profile.json");
  await store.flush();
  assert.ok(be.files.has("profile.json"));
});

await test("data safety: a lazy file whose read failed is read again on the next load, and can then be written; flush runs its hooks first", async () => {
  const be = memBackend(new Map([["settings.json", '{"lang":"ko"}'], ["games/a-1.json", '{"id":"a-1","sgf":"(;)"}']]));
  const { store, errors } = await open(be, { lazy: ["games/"] });
  be.fail.add("games/a-1.json");
  await assert.rejects(store.load("games/a-1.json"));
  assert.ok(errors.some((e) => e.op === "read" && e.key === "games/a-1.json"));
  assert.deepEqual(store.blocked(), ["games/a-1.json"], "nothing is written over a file that could not be read");
  assert.equal(store.isLoaded("games/a-1.json"), false, "still on disk, still to be read");
  // The disk answers again (a Retry): the file is read, and a change to it now reaches the disk.
  be.fail.clear();
  assert.equal((await store.load("games/a-1.json")).id, "a-1");
  assert.deepEqual(store.blocked(), []);
  store.put("games/a-1.json", { id: "a-1", sgf: "(;)", meta: { name: "renamed" } });
  assert.equal(await store.flush(), true);
  assert.match(be.files.get("games/a-1.json"), /renamed/);
  // onFlush: what a module holds back on purpose is made final before the writes go out.
  const order = [];
  const off = store.onFlush(() => {
    order.push("hook");
    store.remove("games/a-1.json");
  });
  store.onFlush(() => {
    throw new Error("a broken hook does not stop the flush");
  });
  assert.equal(await store.flush(), true);
  assert.deepEqual(order, ["hook"]);
  assert.equal(be.files.has("games/a-1.json"), false, "the hook's removal went out with this flush");
  off();
  await store.flush();
  assert.deepEqual(order, ["hook"], "a hook that was taken off is not called again");
});

await test("data safety: a damaged file is copied byte for byte to bad/<key>-<time>.json before anything else, and never read back as data", async () => {
  const be = memBackend(new Map([["settings.json", '{"lang":"ko", BROKEN'], ["games/a-1.json", "\u0000garbage"]]));
  const keep = { keepDamaged: ["settings.json"] };
  const { store } = await open(be, { lazy: ["games/"], ...keep });
  const f = store.openReport.failed.find((x) => x.key === "settings.json");
  assert.equal(f.kind, "parse");
  assert.equal(f.preserved, "bad/settings-1731000000000.json");
  assert.equal(be.files.get("bad/settings-1731000000000.json"), '{"lang":"ko", BROKEN', "the copy is the file as it was");
  assert.ok(validKey(f.preserved), "a key the host accepts (store.zig validKey: [a-z0-9_-] segments)");
  assert.equal(store.get("settings.json"), undefined);
  assert.equal(be.files.get("settings.json"), '{"lang":"ko", BROKEN', "a core file stays where it is");
  assert.ok(store.blocked().includes("settings.json"), "and is never written over");
  // The game file is read lazily; reading it later copies it the same way, then moves it aside.
  const { store: s2 } = await open(be, { lazy: ["games/"], ...keep });
  await assert.rejects(s2.load("games/a-1.json"));
  assert.ok([...be.files.keys()].some((k) => /^bad\/games\/a-1-\d+\.json$/.test(k)));
  assert.ok(!be.files.has("games/a-1.json"), "moved aside: it does not come back at every start");
  // A copy is never read again as data (no copy of a copy).
  const before = be.files.size;
  be.reads.length = 0;
  const { store: s3 } = await open(be, keep);
  assert.ok(!be.reads.some((k) => k.startsWith("bad/")), "copies are not read at open");
  assert.ok(s3.list("bad/").length >= 2, "the copies are listed");
  assert.equal(s3.openReport.failed.filter((x) => x.key.startsWith("bad/")).length, 0);
  assert.equal(be.files.size, before + 1, "only settings.json is copied again, beside its first copy");
  assert.ok(be.files.has("bad/settings-1731000000000-2.json"));
  assert.equal(badKey("games/" + "x".repeat(190) + ".json", 1).length <= 200, true);
});

await test("data safety: a failed list makes the store read-only: nothing at all is written", async () => {
  const be = memBackend(new Map([["settings.json", "{}"]]));
  be.fail.add("*list");
  const { store } = await open(be);
  assert.equal(store.openReport.listFailed, true);
  assert.equal(store.readOnly, true);
  store.put("settings.json", { lang: "en" });
  assert.equal(await store.flush(), true);
  assert.equal(be.files.get("settings.json"), "{}");
  // Leaving read-only writes what was held (and only then).
  store.setReadOnly(false);
  await store.flush();
  assert.match(be.files.get("settings.json"), /"en"/);
});

await test("data safety: files are read side by side at open, not one after another", async () => {
  const files = new Map();
  for (let i = 0; i < 20; i++) files.set(`k${i}.json`, "{}");
  const be = memBackend(files);
  await open(be);
  assert.ok(be.maxInFlight > 1, `at most ${be.maxInFlight} read at a time`);
});

await test("data safety: a packaged app without its bridge never opens the browser's storage", async () => {
  const A = await bundle([
    'export { createStore } from "./src/web/js/data/store.js";',
    'export { isPackaged } from "./src/web/js/host.js";',
  ]);
  const saved = globalThis.location;
  try {
    globalThis.location = { protocol: "zero:", hostname: "app" };
    assert.equal(A.isPackaged(), true);
    const s = A.createStore({ onError: () => {} });
    await s.open();
    assert.equal(s.openReport.listFailed, true, "no bridge: nothing could be listed");
    assert.equal(s.readOnly, true);
    globalThis.location = { protocol: "https:", hostname: "native-sdk-app.localhost" };
    assert.equal(A.isPackaged(), true, "WebView2's virtual host is the packaged app too");
    globalThis.location = { protocol: "http:", hostname: "127.0.0.1" };
    assert.equal(A.isPackaged(), false, "the browser preview");
  } finally {
    globalThis.location = saved;
  }
});

await test("data safety: storeProblemOf — only the core files put the app in its safe state; resettable only when every one was copied aside", async () => {
  const { storeProblemOf, CORE_KEYS } = await bundle(['export { storeProblemOf, CORE_KEYS } from "./src/web/js/app/controller.js";']);
  assert.deepEqual(CORE_KEYS, ["settings.json", "profile.json", "current.json"]);
  assert.equal(storeProblemOf({ listFailed: false, failed: [] }), null);
  assert.equal(storeProblemOf({ listFailed: false, failed: [{ key: "batch.json", kind: "read" }] }), null, "a side file is a toast, not the safe state");
  assert.equal(storeProblemOf({ listFailed: true, failed: [] }).kind, "list");
  const p = storeProblemOf({ listFailed: false, failed: [{ key: "settings.json", kind: "parse", preserved: "bad/settings-1.json" }] });
  assert.deepEqual([p.kind, p.resettable, p.newer], ["files", true, false]);
  assert.equal(storeProblemOf({ listFailed: false, failed: [{ key: "profile.json", kind: "read" }] }).resettable, false);
  assert.equal(storeProblemOf({ listFailed: false, failed: [{ key: "current.json", kind: "newer" }] }).newer, true);
});

/* ------------------------------------------------- versions, migrations */

/** A v12 game file: no `v`, an ownership map on every position. */
function v12Game(id, n = 40, size = 9) {
  const g = new Game({ size });
  for (let i = 0; i < 6; i++) g.play(i, i % 2 ? 2 : 6);
  const analysis = Array.from({ length: n }, (_, i) => ({
    source: "katago",
    scoreLead: i === 20 ? -9 : 0.5,
    winrate: 0.5,
    ownership: Array.from({ length: size * size }, (_, k) => (k % 2 ? 0.95 : -0.2)),
  }));
  return { id, createdAt: 1, updatedAt: 1, finishedAt: 1, source: "game", sgf: g.toSGF(), meta: { size, moves: 6, result: "B+R", opponent: "ai", humanColor: 1, thumb: "." }, analysis, review: { v: 1, lineKey: "x", confidence: "high" } };
}

await test("data migrations: v9–v12 files (no version) step up to v13; a newer file is refused, never rewritten", async () => {
  assert.equal(STORE_V, 13);
  assert.deepEqual(Object.keys(MIGRATIONS).map(Number), [9, 10, 11, 12], "one step per version");
  const s9 = { lang: "ja", opponentRank: 12 };
  const r = migrateFile("settings.json", s9);
  assert.equal(r.changed, true);
  assert.deepEqual(r.value, { lang: "ja", opponentRank: 12, v: 13 });
  assert.equal(migrateFile("settings.json", r.value).changed, false, "a current file is left alone");
  const g = migrateFile("games/g-1.json", v12Game("g-1"));
  assert.equal(g.value.v, 13);
  const own = g.value.analysis.filter((p) => p.ownership).length;
  assert.ok(own > 0 && own <= 4, `maps kept only around the swing (${own})`);
  assert.ok(g.value.analysis.every((p) => Number.isFinite(p.firm)), "a settled share everywhere");
  assert.throws(() => migrateFile("current.json", { v: 14, sgf: "(;)" }), (e) => e.code === "newer");
  assert.throws(() => migrateFile("profile.json", { v: PROFILE_V + 1 }), (e) => e.code === "newer", "the player model's own version");
  assert.equal(migrateFile("profile.json", { v: PROFILE_V }).changed, false);
  assert.deepEqual(migrateFile("session.json", { v: 99 }), { value: { v: 99 }, changed: false }, "keys of other modules are theirs");
  // In the store: migrated on read, written back in the new format; a newer file is blocked.
  const be = memBackend(new Map([["settings.json", JSON.stringify(s9)], ["current.json", '{"v":99,"sgf":"(;)"}']]));
  const { store } = await open(be);
  await store.flush();
  assert.equal(JSON.parse(be.files.get("settings.json")).v, 13, "written back as v13");
  assert.deepEqual(store.openReport.failed.map((f) => [f.key, f.kind]), [["current.json", "newer"]]);
  store.put("current.json", { sgf: "(;B[aa])" });
  await store.flush();
  assert.equal(be.files.get("current.json"), '{"v":99,"sgf":"(;)"}', "the newer file is never replaced");
});

await test("data pack: maps only around the biggest swings, idempotent, and a fraction of the size", () => {
  const pts = v12Game("x", 120, 19).analysis;
  const packed = packAnalysis(pts);
  assert.deepEqual(packAnalysis(packed), packed, "idempotent");
  assert.ok(keptIndices(pts).has(19) && keptIndices(pts).has(20), "the swing at 20 keeps the maps before and after it");
  assert.ok(JSON.stringify(packed).length < JSON.stringify(pts).length / 4);
  assert.ok(Array.isArray(packed[20].ownership) && packed[20].ownership.length === 361);
  // A typed array (as katago.js parses it) becomes a plain array.
  const typed = packAnalysis([{ scoreLead: 0, ownership: new Float32Array([0.1234, -0.9]) }, { scoreLead: 3, ownership: new Float32Array([0.5, 0.5]) }]);
  assert.ok(Array.isArray(typed[0].ownership));
  assert.equal(typed[0].ownership[0], 0.123);
});

/* ---------------------------------------------------------------- backups */

await test("data backups: a v9-era backup (v12 data, `v: 9`) restores with every file migrated; newer and oversized ones are refused", () => {
  const doc9 = { app: "goban-studio", v: 9, at: 1, data: { "settings.json": { lang: "ko", opponentRank: 99 }, "profile.json": { v: 9 }, "games/g-1.json": v12Game("g-1") } };
  const c = B.checkBackup(doc9);
  assert.equal(c.ok, true);
  assert.equal(c.data["settings.json"].v, 13);
  assert.equal(c.data["games/g-1.json"].v, 13);
  assert.ok(c.data["games/g-1.json"].analysis.some((p) => !p.ownership), "the analysis is packed");
  // A v12 backup is also `v: 9` (v9 to v12 never changed it).
  assert.equal(B.checkBackup({ ...doc9, v: 12 }).ok, true);
  assert.equal(B.checkBackup({ ...doc9, v: 14 }).error, "newerVersion");
  assert.equal(B.checkBackup({ ...doc9, v: 13, data: { "current.json": { v: 14, sgf: "(;)" } } }).error, "newerVersion", "a newer file inside");
  const big = { app: "goban-studio", v: 13, at: 1, data: { "games/big.json": { id: "big", sgf: "x".repeat(MAX_BYTES + 10) } } };
  assert.deepEqual(B.checkBackup(big), { ok: false, error: "tooLarge", key: "games/big.json" });
  // Copies, snapshots and the index are not part of a backup.
  const c2 = B.checkBackup({ ...doc9, data: { ...doc9.data, "bad/x-1.json": {}, "backups/pre-restore-1/settings.json": {}, "games-index.json": { v: 13, games: {} } } });
  assert.deepEqual(Object.keys(c2.data).sort(), ["games/g-1.json", "profile.json", "settings.json"]);
});

await test("data backups: a restore snapshots what was there first, a failed snapshot restores nothing, and undo puts it back", async () => {
  const be = memBackend(new Map([["settings.json", '{"v":13,"lang":"zh"}'], ["games/old-1.json", JSON.stringify({ ...v12Game("old-1"), v: 13 })]]));
  const { store } = await open(be, { lazy: ["games/", "backups/"] });
  const doc = { app: "goban-studio", v: 13, at: 2, data: { "settings.json": { v: 13, lang: "en" } } };
  // A disk that refuses writes: the snapshot fails and nothing is replaced.
  be.fail.add("*write");
  const bad = await B.importBackup(store, doc, { now: 5 });
  assert.deepEqual(bad, { ok: false, error: "snapshot" });
  be.fail.delete("*write");
  store.discardHeld();
  const okStore = (await open(be, { lazy: ["games/", "backups/"] })).store;
  const r = await B.importBackup(okStore, doc, { now: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.snapshot, "backups/pre-restore-7/");
  assert.ok(be.files.has("backups/pre-restore-7/games/old-1.json"), "the unread game is in the snapshot too");
  assert.ok(!be.files.has("games/old-1.json"));
  assert.match(be.files.get("settings.json"), /"en"/);
  // Reopen (as after the reload) and undo.
  be.reads.length = 0;
  const again = (await open(be, { lazy: ["games/", "backups/"] })).store;
  assert.equal(B.latestSnapshot(again).at, 7);
  assert.ok(!be.reads.some((k) => k.startsWith("backups/")), "a snapshot is not read at boot");
  const u = await B.undoRestore(again);
  assert.equal(u.ok, true);
  assert.match(be.files.get("settings.json"), /"zh"/);
  assert.ok(be.files.has("games/old-1.json"), "the game is back");
  assert.ok(be.files.has("backups/pre-restore-7/settings.json"), "the snapshot stays until a newer one");
});

/* ------------------------------------------------ the games index (lazy) */

await test("data games: with 300 games, boot reads the index and the core files only; the list, Today's three and loading one still work", async () => {
  const files = new Map([["settings.json", JSON.stringify({ v: 13, onboarded: true })], ["profile.json", JSON.stringify({ v: PROFILE_V })]]);
  const games = {};
  for (let i = 0; i < 300; i++) {
    const id = `g-${String(i).padStart(3, "0")}`;
    const file = { ...v12Game(id, 8), v: 13, updatedAt: 1000 + i, analysis: undefined };
    files.set(`games/${id}.json`, JSON.stringify(file));
    games[id] = { id, createdAt: 1, updatedAt: 1000 + i, finishedAt: 1, source: "game", meta: file.meta, review: { v: 1, confidence: "high", lineKey: "x" }, analyzed: false };
  }
  files.set("games-index.json", JSON.stringify({ v: 13, games }));
  const be = memBackend(files);
  const { store } = await open(be, { lazy: ["games/", "backups/"] });
  Games.useStore(store);
  try {
    const read = await Games.initIndex();
    assert.equal(read, 0);
    assert.deepEqual(be.reads.sort(), ["games-index.json", "profile.json", "settings.json"], "no game file is read at boot");
    const list = Games.listGames();
    assert.equal(list.length, 300);
    assert.deepEqual(list.slice(0, 3).map((g) => g.id), ["g-299", "g-298", "g-297"], "Today's last three, newest first");
    assert.equal(list[0].sgf, null);
    assert.equal(list[0].result, "B+R");
    assert.equal(Games.isLoaded("g-010"), false);
    const rec = await Games.loadGame("g-010");
    assert.ok(rec.sgf.startsWith("(;"), "one file read when it is opened");
    assert.equal(be.reads.filter((k) => k.startsWith("games/")).length, 1);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: a missing index is rebuilt from the files once; a change to an unread game keeps its analysis", async () => {
  const files = new Map();
  for (let i = 0; i < 5; i++) files.set(`games/h-${i}.json`, JSON.stringify(v12Game(`h-${i}`)));
  const be = memBackend(files);
  const { store } = await open(be, { lazy: ["games/"] });
  Games.useStore(store);
  try {
    assert.equal(await Games.initIndex(), 5, "every game read once to build the index");
    await store.flush();
    const idx = JSON.parse(be.files.get("games-index.json"));
    assert.equal(Object.keys(idx.games).length, 5);
    assert.equal(JSON.parse(be.files.get("games/h-0.json")).v, 13, "read files are written back in v13 (packed)");
    // The next start: nothing but the index.
    const be2 = memBackend(be.files);
    const { store: s2 } = await open(be2, { lazy: ["games/"] });
    Games.useStore(s2);
    await Games.initIndex();
    assert.equal(be2.reads.filter((k) => k.startsWith("games/")).length, 0);
    // Renaming and patching a game whose file is not read: the index now, the file once read, analysis kept.
    assert.equal(Games.renameGame("h-3", "kept").name, "kept");
    assert.equal(Games.listGames().find((g) => g.id === "h-3").name, "kept");
    await new Promise((r) => setTimeout(r, 20));
    await s2.flush();
    const f = JSON.parse(be2.files.get("games/h-3.json"));
    assert.equal(f.meta.name, "kept");
    assert.ok(Array.isArray(f.analysis) && f.analysis.length === 40, "its analysis is still there");
    // A file deleted behind the index's back drops out of it.
    be2.files.delete("games/h-1.json");
    const { store: s3 } = await open(memBackend(be2.files), { lazy: ["games/"] });
    Games.useStore(s3);
    await Games.initIndex();
    assert.equal(Games.listGames().length, 4);
    Games.deleteGame("h-2");
    assert.equal(Games.listGames().length, 3);
  } finally {
    Games.useStore(null);
  }
});

await test("data games: an unfinished game is one played here without a result", () => {
  assert.equal(Games.isUnfinished({ source: "game", result: null }), true);
  assert.equal(Games.isUnfinished({ source: "game", result: "B+R" }), false);
  assert.equal(Games.isUnfinished({ source: "import", result: null }), false);
});

/* ---------------------------------------------------------------- settings */

await test("data settings: ranks and counts are clamped to their ranges on load; the file's version is not a setting", () => {
  const s = normalizeSettings({ opponentRank: 99, playerRank: -40, captureWins: 1e12, lang: "fr", v: 13 });
  assert.equal(s.opponentRank, 30);
  assert.equal(s.playerRank, -8);
  assert.equal(s.captureWins, 1e6);
  assert.equal(s.lang, null);
  assert.ok(!("v" in s));
  assert.equal(normalizeSettings({ opponentRank: -20 }).opponentRank, -6);
  assert.equal(normalizeSettings({ opponentRank: 12.6, playerRank: 7.2 }).opponentRank, 13);
  assert.equal(normalizeSettings({ playerRank: 7.2 }).playerRank, 7);
  assert.equal(normalizeSettings({ playerRank: null }).playerRank, null);
  const store = createStore({ backend: localBackend(new Map() && { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} }), delay: 1 });
  store.put("settings.json", { opponentRank: 500, v: 13 });
  assert.equal(loadSettings(store).opponentRank, 30);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  void BLACK;
});
