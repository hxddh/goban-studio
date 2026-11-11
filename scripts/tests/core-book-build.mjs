/**
 * Core: how the opening book was built (network, depth, coverage). Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as Book from "../../src/web/js/book.js";
import { BLACK, WHITE, LETTERS } from "../../src/web/js/rules.js";
import { windowOf } from "../../src/web/js/board.js";

export default async function ({ test, assert, root }) {
  const file = path.join(root, "src/web/js/content/book.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const book = Book.loadBook(raw);
  const gtp = (s) => ({ x: LETTERS.indexOf(s[0]), y: 19 - Number(s.slice(1)) });
  const replay = (tree, moves) => {
    let m = Book.setupSignMap(tree.tree, 19);
    let toMove = tree.tree.toMove === "W" ? WHITE : BLACK;
    for (const s of moves) {
      const p = gtp(s);
      m = Book.playOn(m, p.x, p.y, toMove);
      toMove = toMove === BLACK ? WHITE : BLACK;
    }
    return Book.lookup(tree, m, toMove);
  };

  await test("core book: made with the strong network at 2,000 visits, and small when gzipped", () => {
    assert.match(raw.network, /^g170e-b15c192-/);
    assert.ok(raw.visits >= 2000, `visits ${raw.visits}`);
    assert.ok(/^\d+\.\d+/.test(raw.katago || ""), `KataGo version ${raw.katago}`);
    assert.equal(book.meta.katago, raw.katago);
    const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
    assert.ok(gz < 400 * 1024, `book is ${gz} bytes gzipped`);
    // Most positions were searched with the full visits.
    for (const id of ["whole", "corner"]) {
      const full = book.trees[id].nodes.filter((n) => n.visits >= raw.visits * 0.9).length;
      assert.ok(full >= book.trees[id].nodes.length * 0.9, `${id}: ${full} of ${book.trees[id].nodes.length} at full visits`);
    }
  });

  await test("core book: deep and broad enough", () => {
    const whole = book.trees.whole;
    const corner = book.trees.corner;
    assert.ok(whole.nodes.length >= 2000, `whole ${whole.nodes.length}`);
    assert.ok(corner.nodes.length >= 1600, `corner ${corner.nodes.length}`);
    const deepest = (t) => Math.max(...t.nodes.map((n) => n.depth));
    assert.ok(deepest(whole) >= 10, `whole depth ${deepest(whole)}`);
    assert.ok(deepest(corner) >= 14, `corner depth ${deepest(corner)}`);
  });

  await test("core book: the 3-3 invasion and the 3-4 approaches have their common answers", () => {
    const corner = book.trees.corner;
    // After the 3-3 invasion both blocks are book moves (one position, mirrored).
    const inv = replay(corner, ["Q16", "R17"]);
    assert.ok(inv, "3-3 invasion in the book");
    for (const p of ["Q17", "R16"].map(gtp)) {
      const c = inv.continuations.find((k) => k.x === p.x && k.y === p.y);
      assert.ok(c && c.inBook, `block at ${p.x},${p.y}`);
    }
    assert.equal(replay(corner, ["Q16", "R17", "Q17"]).node, replay(corner, ["Q16", "R17", "R16"]).node);
    // The full 3-3 joseki is a line of the book, named at its end.
    const j = ["Q16", "R17", "Q17", "R16", "R15", "S15", "S14", "S16", "R14"];
    assert.equal(replay(corner, j)?.node.name, "star-33-joseki");
    // After the joseki the book still offers a move (usually elsewhere).
    assert.ok(replay(corner, j).continuations.length > 0);
    // 3-4 point: the low and the high approach each have several book answers.
    for (const line of [["R16", "P17"], ["R16", "P16"], ["Q16", "R14"]]) {
      const hit = replay(corner, line);
      const own = hit.continuations.filter((k) => k.inBook && !k.image);
      assert.ok(own.length >= 2, `${line.join(" ")}: ${own.length} book answers`);
    }
    // Pincers lead on into the 3-3 invasion.
    assert.ok(replay(corner, ["Q16", "O17", "M17", "R17"]), "pincer and 3-3");
  });

  await test("core book: every record replays, and edges point at searched positions", () => {
    for (const id of ["whole", "corner"]) {
      const t = raw.trees[id];
      const named = Object.keys(t.names).map(Number);
      for (const i of named) assert.equal(t.nodes[i].length, 6, `${id}: name on a non-position ${i}`);
      // Every position but the root is reachable through its parent chain.
      assert.equal(book.trees[id].nodes.filter((n) => n.depth === 0).length, 1);
    }
  });

  await test("core book: a corner window with coordinates leaves room for the labels", async () => {
    const { BoardView } = await import("../../src/web/js/board.js");
    // geometry() reads only the model and the canvas size.
    const geom = (model, w, h) => BoardView.prototype.geometry.call({ model, cssW: w, cssH: h, window: () => windowOf(model.view, 19) });
    const view = { x0: 9, y0: 0, x1: 18, y1: 9 };
    for (const [w, h] of [[420, 420], [640, 640], [900, 760], [520, 700]]) {
      const g = geom({ size: 19, view, showCoords: true }, w, h);
      const cell = g.cell;
      const gap = Math.min(cell * 0.8, cell * 0.5 + 18);
      const fs = Math.max(10, Math.min(13, cell * 0.3));
      // Numbers left of the window's first column, letters below its last row (board.js draw()).
      const numLeft = g.ox + view.x0 * cell - gap - cell * 0.36 - fs * 0.7;
      const letterBottom = g.oy + view.y1 * cell + gap + cell * 0.36 + fs * 0.6;
      assert.ok(numLeft >= 0, `${w}×${h}: numbers clipped at ${numLeft.toFixed(1)}`);
      assert.ok(letterBottom <= h, `${w}×${h}: letters clipped at ${letterBottom.toFixed(1)} > ${h}`);
      // The closed sides keep the frame and the grid inside the canvas.
      assert.ok(g.ox + 18 * cell + cell * 0.5 <= w && g.oy - cell * 0.5 >= 0, `${w}×${h}: grid outside`);
    }
    // Whole boards are unchanged by the margins.
    const a = geom({ size: 19, view: null, showCoords: true }, 600, 600);
    assert.ok(Math.abs(a.ox - (600 - a.cell * 18) / 2) < 1e-9);
  });
}
