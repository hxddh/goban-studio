/**
 * Core: the opening book — its trees, lookups, symmetries and transpositions.
 */
import { test, BLACK, BOOK, BOOK_RAW, Book, EMPTY, LANG_IDS, MESSAGES, WHITE, assert, emptyMap, fs, gtp, path, replay, root, symMap } from "./helpers.mjs";

await test("explorer: the shipped book has both trees, its network and a compact size", () => {
  assert.equal(BOOK_RAW.format, Book.BOOK_FORMAT);
  assert.ok(BOOK_RAW.network && typeof BOOK_RAW.network === "string", "the network that made the book is recorded");
  assert.ok(BOOK_RAW.visits > 0);
  assert.equal(BOOK_RAW.komi, 6.5);
  const bytes = fs.statSync(path.join(root, "src/web/js/content/book.json")).size;
  // v7: the book grew with the stronger network; scripts/tests/core-book-build.mjs checks its gzipped size.
  assert.ok(bytes < 1024 * 1024, `book is ${bytes} bytes`);
  for (const id of ["whole", "corner"]) {
    const tree = BOOK_RAW.trees[id];
    assert.ok(tree && tree.nodes.length > 40, `${id}: ${tree?.nodes.length} records`);
    tree.nodes.forEach((rec, i) => {
      assert.ok(rec[0] < i, `${id} ${i}: parent after child`);
      if (i === 0) assert.equal(rec[0], -1);
      if (rec.length === 3) {
        assert.ok(rec[2] < tree.nodes.length && tree.nodes[rec[2]].length === 6, `${id} ${i}: edge target`);
        return;
      }
      assert.equal(rec.length, 6, `${id} ${i}: record shape`);
      assert.ok(rec[2] >= 0 && rec[2] <= 1000 && rec[4] > 0, `${id} ${i}: values`);
      for (const c of rec[5]) assert.ok(c.length === 4 && /^[a-s]{2}$/.test(c[0]) && c[1] >= 0, `${id} ${i}: candidate ${c}`);
    });
    // No position is stored twice (transpositions and symmetry share one).
    const t = BOOK.trees[id];
    assert.equal(t.byKey.size, t.nodes.length, `${id}: duplicate positions`);
  }
  // The corner setup is symmetric along the upper-right diagonal.
  const c = BOOK.trees.corner;
  assert.deepEqual(c.group, Book.GROUPS.corner);
  const setup = Book.setupSignMap(c.tree);
  assert.deepEqual(symMap(setup, 7), setup);
  assert.equal(Book.stonesOf(setup).length, 4);
});

await test("explorer: every named line is in the book and named", () => {
  const src = fs.readFileSync(path.join(root, "scripts/make-book.mjs"), "utf8");
  for (const id of ["whole", "corner"]) {
    const tree = BOOK.trees[id];
    const block = src.slice(src.indexOf(`  ${id}: [`), src.indexOf("],", src.indexOf(`  ${id}: [`)));
    const lines = [...block.matchAll(/\{ name: (null|"([^"]+)"), moves: "([^"]+)" \}/g)];
    assert.ok(lines.length >= 5, `${id}: ${lines.length} lines`);
    for (const [, , name, moves] of lines) {
      const ms = moves.split(" ");
      for (let i = 0; i <= ms.length; i++) {
        const { signMap, toMove } = replay(tree, ms.slice(0, i));
        const hit = Book.lookup(tree, signMap, toMove);
        assert.ok(hit, `${id} ${moves}: not in the book after ${i} moves`);
        if (i === ms.length && name) assert.equal(hit.node.name, name, `${id} ${moves}`);
      }
      if (name) for (const lang of LANG_IDS) assert.ok(MESSAGES[`explorer.name.${id}.${name}`]?.[lang], `explorer.name.${id}.${name} ${lang}`);
    }
  }
});

await test("explorer: lookup gives continuations with point losses and tags", () => {
  const whole = BOOK.trees.whole;
  const hit = Book.lookup(whole, emptyMap(), BLACK);
  assert.ok(hit && hit.continuations.length >= 3);
  // All four star points are book moves from the empty board.
  for (const p of ["Q16", "D4", "D16", "Q4"].map(gtp)) {
    const c = hit.continuations.find((k) => k.x === p.x && k.y === p.y);
    assert.ok(c && c.inBook && c.tag === "joseki", `star point ${p.x},${p.y}: ${JSON.stringify(c && { ...c, node: null })}`);
  }
  for (const c of hit.continuations) {
    assert.ok(c.loss >= 0 && Number.isFinite(c.score) && c.winrate >= 0 && c.winrate <= 1);
    assert.equal(c.tag, Book.tagOf(c.loss, c.inBook));
  }
  // Book moves first, then KataGo's other candidates, each group best first.
  const primary = hit.continuations.filter((c) => !c.image);
  for (let i = 1; i < primary.length; i++) {
    const [a, b] = [primary[i - 1], primary[i]];
    assert.ok(a.inBook > b.inBook || (a.inBook === b.inBook && b.loss >= a.loss), `order at ${i}`);
  }
  assert.equal(Book.tagOf(0), "joseki");
  assert.equal(Book.tagOf(Book.JOSEKI_LOSS), "joseki");
  assert.equal(Book.tagOf(0, false), "good");
  assert.equal(Book.tagOf(Book.JOSEKI_LOSS + 0.1), "playable");
  assert.equal(Book.tagOf(Book.PLAYABLE_LOSS + 0.1), "mistake");
  // A first-line move leaves the book.
  const out = replay(whole, ["A19"]);
  assert.equal(Book.lookup(whole, out.signMap, out.toMove), null);
  const j = Book.judgeMove(whole, emptyMap(), BLACK, 0, 0);
  assert.ok(j === null || j.tag !== "joseki");
});

await test("explorer: whole-board positions match under all eight symmetries", () => {
  const whole = BOOK.trees.whole;
  const base = replay(whole, ["Q16", "D4", "Q4"]);
  const ref = Book.lookup(whole, base.signMap, base.toMove);
  assert.ok(ref, "two star points in the book");
  for (let s = 0; s < 8; s++) {
    const m = symMap(base.signMap, s);
    const hit = Book.lookup(whole, m, base.toMove);
    assert.ok(hit, `symmetry ${s}`);
    assert.equal(hit.node, ref.node);
    // Every continuation is the image of the reference continuation.
    const want = new Set(ref.continuations.map((c) => Book.applySym(s, c.x, c.y).join(",")));
    const got = new Set(hit.continuations.map((c) => `${c.x},${c.y}`));
    assert.deepEqual([...got].sort(), [...want].sort(), `symmetry ${s}`);
    for (const c of hit.continuations) assert.equal(m[c.y][c.x], EMPTY, `symmetry ${s}: continuation on a stone`);
  }
  // The symmetry table: each entry undoes its inverse.
  for (let s = 0; s < 8; s++) {
    const [a, b] = Book.applySym(s, 3, 15);
    assert.deepEqual(Book.applySym(Book.INVERSE[s], a, b), [3, 15]);
  }
});

await test("explorer: transpositions reach the same position", () => {
  const whole = BOOK.trees.whole;
  const a = replay(whole, ["Q16", "D4", "Q4", "D16"]);
  const b = replay(whole, ["Q4", "D16", "Q16", "D4"]);
  const ha = Book.lookup(whole, a.signMap, a.toMove);
  const hb = Book.lookup(whole, b.signMap, b.toMove);
  assert.ok(ha && hb && ha.node === hb.node);
  // A synthetic tree: one position by two move orders, stored once with an
  // edge record for the second order.
  const tree = {
    size: 19, toMove: "B", symmetry: "none", setup: { b: [], w: [] },
    nodes: [
      [-1, "", 500, 0, 10, [["pd", 5, 500, 0], ["dp", 5, 500, 0]]],
      [0, "pd", 500, 0, 10, [["dd", 9, 500, 0]]],
      [0, "dp", 500, 0, 10, [["dd", 9, 500, 0]]],
      [1, "dd", 500, 0, 10, [["dp", 9, 500, 0]]],
      [2, "dd", 500, 0, 10, [["pd", 9, 500, 0]]],
      [3, "dp", 520, 10, 10, []],
      [4, "pd", 5],
    ],
  };
  const t = Book.indexTree("t", tree);
  const n4 = t.nodes.find((n) => n.index === 4);
  const edge = n4.edges.find((e) => e.move === "pd");
  assert.ok(edge && edge.node.index === 5, "the edge record links the second order");
  const hit = Book.lookup(t, t.nodes.find((n) => n.index === 5).signMap, WHITE);
  assert.equal(hit.node.index, 5);
  const c = Book.lookup(t, n4.signMap, n4.toMove).continuations.find((k) => k.move === "pd");
  assert.ok(c.inBook && c.score === 1);
  // Under "none" a mirrored position is not the same.
  assert.equal(Book.lookup(t, symMap(n4.signMap, 1), n4.toMove), null);
  assert.throws(() => Book.loadBook({ format: 99 }));
});

await test("explorer: corner joseki are normalised along the corner's diagonal only", () => {
  const corner = BOOK.trees.corner;
  // The small knight's approach from below (R14) and from the left (O17)
  // are one position: the setup is symmetric along that diagonal.
  const a = replay(corner, ["Q16", "R14"]);
  const b = replay(corner, ["Q16", "O17"]);
  const ha = Book.lookup(corner, a.signMap, a.toMove);
  const hb = Book.lookup(corner, b.signMap, b.toMove);
  assert.ok(ha && hb && ha.node === hb.node);
  for (const c of hb.continuations) {
    const [u, v] = Book.applySym(7, c.x, c.y);
    assert.ok(ha.continuations.some((k) => k.x === u && k.y === v), "continuations mirror");
  }
  // The 3-3 invasion blocks from either side are the same position too.
  const c1 = replay(corner, ["Q16", "R17", "Q17"]);
  const c2 = replay(corner, ["Q16", "R17", "R16"]);
  const h1 = Book.lookup(corner, c1.signMap, c1.toMove);
  assert.ok(h1 && h1.node === Book.lookup(corner, c2.signMap, c2.toMove)?.node);
  // The same joseki in another corner is not: the other corners hold the setup.
  const rot = symMap(a.signMap, 1);
  assert.equal(Book.lookup(corner, rot, a.toMove), null);
  // The corner book's continuations include the expanded local moves.
  assert.ok(ha.continuations.some((k) => k.inBook && k.x >= 9 && k.y <= 9));
});

await test("explorer: a game's book depth counts the moves that stay in the book", () => {
  const whole = BOOK.trees.whole;
  const mv = (s, c) => ({ ...gtp(s), color: c });
  assert.equal(Book.bookDepth(whole, []), 0);
  assert.equal(Book.bookDepth(whole, [mv("Q16", BLACK), mv("D4", WHITE), mv("Q4", BLACK)]), 3);
  assert.equal(Book.bookDepth(whole, [mv("Q16", BLACK), mv("A1", WHITE), mv("Q4", BLACK)]), 1);
  assert.equal(Book.bookDepth(whole, [mv("A19", BLACK)]), 0);
  assert.equal(Book.bookDepth(whole, [{ pass: true }]), 0);
});
