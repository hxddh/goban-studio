/**
 * Core: the opening book — its trees, lookups, symmetries and transpositions.
 */
import { test, BLACK, BOOK, BOOK_RAW, Book, EMPTY, LANG_IDS, MESSAGES, WHITE, assert, empty, emptyMap, fs, gtp, mv, path, replay, root, setup, symMap, t } from "./helpers.mjs";

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

/** GTP point → [x, y] from the top left. */
const at = (p) => [gtp(p).x, gtp(p).y];

await test("explorer: the Chinese opening is Q16, Q3 and R9 (high: Q9), and nothing else carries its name", () => {
  const src = fs.readFileSync(path.join(root, "scripts/make-book.mjs"), "utf8");
  assert.match(src, /\{ name: "chinese", moves: "Q16 D4 Q3 D16 R9" \}/);
  assert.match(src, /\{ name: "high-chinese", moves: "Q16 D4 Q3 D16 Q9" \}/);
  // SGF: Q16 is pd, Q3 is pq, R9 is qk, Q9 is pk.
  const sgf = (p) => "abcdefghijklmnopqrs"[gtp(p).x] + "abcdefghijklmnopqrs"[gtp(p).y];
  assert.deepEqual(["Q16", "Q3", "R9", "Q9"].map(sgf), ["pd", "pq", "qk", "pk"]);
  // In the book, a position named "chinese" or "high-chinese" has Black on those three points
  // (under one of the board's symmetries) — or the name is not there at all.
  const tree = BOOK.trees.whole;
  const shape = { chinese: ["Q16", "Q3", "R9"], "high-chinese": ["Q16", "Q3", "Q9"] };
  for (const node of tree.nodes) {
    if (!shape[node.name]) continue;
    const pts = shape[node.name].map(at);
    const ok = [0, 1, 2, 3, 4, 5, 6, 7].some((s) => pts.every(([x, y]) => { const p = Book.applySym(s, x, y); return node.signMap[p.y][p.x] === BLACK; }));
    assert.ok(ok, `record ${node.index} is named ${node.name} but is not that opening`);
  }
  // The old line (R4 with R10 or Q10) is still a book position, but it is not called the Chinese opening.
  for (const side of ["R10", "Q10"]) {
    const { signMap, toMove } = replay(tree, ["Q16", "D4", "R4", "D16", side]);
    const hit = Book.lookup(tree, signMap, toMove);
    if (hit) assert.ok(!/chinese/.test(hit.node.name || hit.node.lineName || ""), `${side}: ${hit.node.name || hit.node.lineName}`);
  }
  for (const lang of LANG_IDS) for (const name of Object.keys(shape)) assert.ok(MESSAGES[`explorer.name.whole.${name}`]?.[lang], `${name} ${lang}`);
  assert.equal(MESSAGES["explorer.name.whole.high-chinese"].ja, "高中国流");
  assert.equal(MESSAGES["explorer.name.whole.high-chinese"].ko, "고중국류");
});

await test("explorer: every named line is in the book and named", () => {
  const src = fs.readFileSync(path.join(root, "scripts/make-book.mjs"), "utf8");
  // Lines corrected in make-book.mjs after book.json was last built (the build needs KataGo): the
  // book has the position before their last move, and no position of that name. Once a rebuilt book
  // has them, they are checked like every other line.
  const awaiting = new Set(["chinese", "high-chinese"]);
  for (const id of ["whole", "corner"]) {
    const tree = BOOK.trees[id];
    const block = src.slice(src.indexOf(`  ${id}: [`), src.indexOf("],", src.indexOf(`  ${id}: [`)));
    const lines = [...block.matchAll(/\{ name: (null|"([^"]+)"), moves: "([^"]+)" \}/g)];
    assert.ok(lines.length >= 5, `${id}: ${lines.length} lines`);
    for (const [, , name, moves] of lines) {
      const ms = moves.split(" ");
      if (awaiting.has(name)) {
        const end = replay(tree, ms);
        if (!Book.lookup(tree, end.signMap, end.toMove)) {
          const before = replay(tree, ms.slice(0, -1));
          assert.ok(Book.lookup(tree, before.signMap, before.toMove), `${id} ${moves}: the position before the last move is in the book`);
          assert.ok(!tree.nodes.some((n) => n.name === name), `${id}: no position is named ${name} until the book has this line`);
          for (const lang of LANG_IDS) assert.ok(MESSAGES[`explorer.name.${id}.${name}`]?.[lang], `explorer.name.${id}.${name} ${lang}`);
          continue;
        }
      }
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
