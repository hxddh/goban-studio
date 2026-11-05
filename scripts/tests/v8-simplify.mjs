/**
 * v8 tests: simplification and the small library fixes found on the way
 * (a game counts for "this week" when it is finished, not when it is
 * edited; edits keep a record in place; a save that cannot be written
 * says so). Loaded by scripts/test.mjs; receives the runner's helpers.
 */
export default async function ({ test, assert }) {
  const Lib = await import("../../src/web/js/library.js");
  const { Game } = await import("../../src/web/js/rules.js");
  const { weekSummary } = await import("../../src/web/js/app/week.js");

  function withStorage(fail, fn) {
    const map = new Map();
    const store = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        if (fail()) throw new Error("QuotaExceededError");
        map.set(k, String(v));
      },
      removeItem: (k) => map.delete(k),
    };
    const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
    try {
      return fn();
    } finally {
      if (had) Object.defineProperty(globalThis, "localStorage", had);
      else delete globalThis.localStorage;
    }
  }
  const finished = () => {
    const g = new Game({ size: 9 });
    g.play(2, 2);
    g.play(6, 6);
    g.setResult("B+R");
    return g;
  };

  await test("v8: a record gets finishedAt once; editing it keeps its place and does not count as played this week", () => {
    withStorage(
      () => false,
      () => {
        const a = Lib.saveGame(finished(), { name: "a" });
        const b = Lib.saveGame(finished(), { name: "b" });
        Lib.patchGame(b.id, { updatedAt: Date.now() + 1000 }); // b is the newer one
        assert.ok(a.finishedAt && b.finishedAt);
        assert.deepEqual(Lib.listGames().map((g) => g.name), ["b", "a"]);
        // An old game ("a"), finished last month, edited today.
        const old = Date.now() - 30 * 86400000;
        Lib.patchGame(a.id, { finishedAt: old, createdAt: old });
        const edited = Lib.saveGame(finished(), { id: a.id, keepPlace: true });
        assert.equal(edited.finishedAt, old, "finishedAt is not moved by an edit");
        assert.deepEqual(Lib.listGames().map((g) => g.name), ["b", "a"], "an edit keeps the record in place");
        const w = weekSummary({ problems: {}, lessons: {} }, Lib.listGames());
        assert.equal(w.games ?? w.played, 1, `only b was played this week: ${JSON.stringify(w)}`);
        // Without keepPlace (a game saved again from play), it moves to the top as before.
        Lib.patchGame(b.id, { updatedAt: Date.now() - 1000 });
        Lib.saveGame(finished(), { id: a.id });
        assert.deepEqual(Lib.listGames().map((g) => g.name), ["a", "b"]);
      },
    );
  });

  await test("v8: a save that cannot be written returns null instead of a record", () => {
    let full = false;
    withStorage(
      () => full,
      () => {
        assert.ok(Lib.saveGame(finished(), { name: "fits" }));
        full = true;
        assert.equal(Lib.saveGame(finished(), { name: "does not fit" }), null);
        full = false;
        assert.deepEqual(Lib.listGames().map((g) => g.name), ["fits"]);
      },
    );
  });
}
