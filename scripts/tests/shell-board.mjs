/**
 * Shell: the board's colours (theme.js) and the thumbnail renderer's
 * decisions (thumb.js) — the parts that need no canvas. What they look
 * like on screen is checked in scripts/ui-tests/shell-board.mjs.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";
import { BOARD_PALETTES, BOARD_STYLES, boardPalette, contrast, luminance } from "../../src/web/js/theme.js";
import { GRID_MIN, RIM_MIN, STAR_MIN, drawThumb, fromDiagram, fromString, thumbPlan } from "../../src/web/js/thumb.js";
import { lastMarkOf } from "../../src/web/js/board.js";

await test("board palettes: the dark board is the same board dimmer, and stones part from it in every palette", () => {
  assert.deepEqual(BOARD_STYLES, ["standard", "contrast"]);
  const light = boardPalette({ dark: false });
  const dark = boardPalette({ dark: true });
  assert.equal(boardPalette(), light, "the default is the light standard board");
  assert.equal(boardPalette({ style: "ink" }), light, "an unknown style is the standard board");
  // Dimmer: under half the light board's luminance, and well under the page's light surfaces.
  assert.ok(luminance(light.base) > 0.55, `light ${luminance(light.base)}`);
  assert.ok(luminance(dark.base) < 0.3 && luminance(dark.base) > 0.12, `dark ${luminance(dark.base)}`);
  // The same board: still a warm brown (red over green over blue), only less saturated.
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const sat = (hex) => {
    const [r, g, b] = rgb(hex);
    return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  };
  const [r, g, b] = rgb(dark.base);
  assert.ok(r > g && g > b, "warm");
  assert.ok(sat(dark.base) < sat(light.base) + 0.08, "not more saturated than the light board");
  // Sprites are kept (not another material); white is toned down, black gets a rim.
  assert.equal(dark.sprites, true);
  assert.ok(dark.whiteDim > 0 && dark.whiteDim <= 0.25 && dark.blackRim);
  assert.equal(light.whiteDim, 0);
  for (const style of BOARD_STYLES) {
    for (const mode of ["light", "dark"]) {
      const p = BOARD_PALETTES[style][mode];
      assert.equal(p.key, `${style}-${mode}`);
      // A stone's flat colour against the surface, or — where they are close — a rim that is not.
      for (const side of ["black", "white"]) {
        const st = p.stone[side];
        const body = contrast(st.fill, p.base);
        assert.ok(body >= 2.2 || !!st.rim, `${p.key} ${side}: ${body.toFixed(2)} and no rim`);
      }
      assert.ok(contrast(p.stone.black.fill, p.stone.white.fill) >= 10, `${p.key}: black against white`);
      // Marks on stones read on the stone.
      assert.ok(contrast(p.onBlack, p.stone.black.fill) >= 7 && contrast(p.onWhite, p.stone.white.fill) >= 7, `${p.key}: marks on stones`);
    }
  }
});

await test("board palettes: the high-contrast board is near-white or near-black with full-strength lines and rimmed stones", () => {
  const light = boardPalette({ style: "contrast" });
  const dark = boardPalette({ style: "contrast", dark: true });
  assert.ok(luminance(light.base) > 0.9, "near-white");
  assert.ok(luminance(dark.base) < 0.02, "near-black");
  for (const p of [light, dark]) {
    assert.equal(p.contrast, true);
    assert.equal(p.sprites, false, "flat stones");
    assert.ok(contrast(p.line, p.base) >= 7, `${p.key}: lines ${contrast(p.line, p.base).toFixed(1)}:1`);
    assert.ok(contrast(p.text, p.base) >= 7, `${p.key}: coordinates`);
    assert.ok(p.lineScale > 1, "stronger lines than the standard board");
    assert.ok(p.stone.black.rim && p.stone.white.rim, "both stones have a rim");
    for (const tone of Object.values(p.tones)) assert.ok(contrast(tone, p.base) >= 4.5, `${p.key}: ${tone}`);
  }
  // The stone that would vanish into the surface is the one with the heavy rim.
  assert.ok(contrast(light.stone.white.rim, light.base) >= 10 && light.stone.white.rimWidth >= 0.06);
  assert.ok(contrast(dark.stone.black.rim, dark.base) >= 10 && dark.stone.black.rimWidth >= 0.06);
  // The standard palettes keep ink-tinted lines (rgba), never a plain black.
  assert.match(boardPalette().line, /^rgba\(/);
});

await test("board palettes: the stylesheet's defaults are the light standard palette, and it names no other board colour", () => {
  const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");
  const light = boardPalette();
  const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  assert.match(rootBlock, new RegExp(`--board: ${light.base.toLowerCase()};`));
  assert.match(rootBlock, new RegExp(`--thumb-board: ${light.base.toLowerCase()};`));
  assert.ok(rootBlock.includes(`--thumb-line: ${light.thumb.line.replace(/, /g, ", ")};`), "the thumbnail line");
  // The dark and high-contrast colours are set by theme.js on the root element, not repeated in CSS.
  const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"] {'), css.indexOf("}", css.indexOf(':root[data-theme="dark"] {')));
  assert.ok(!/--board|--thumb-board/.test(darkBlock));
  assert.ok(!css.toLowerCase().includes(boardPalette({ dark: true }).base.toLowerCase()));
});

await test("last move: a thin ring 0.4 of a cell across, never thinner than a hairline or smaller than it can show", () => {
  const big = lastMarkOf(60);
  assert.equal(big.radius, 12);
  assert.equal(big.width, 3);
  const small = lastMarkOf(14);
  assert.equal(small.width, 1.25, "the line never goes under 1.25 px");
  assert.ok(small.radius >= small.width * 1.6 && small.radius <= 14 * 0.25, "still a ring, still inside the stone");
  for (const cell of [10, 20, 30, 45, 80]) assert.ok(lastMarkOf(cell).radius + lastMarkOf(cell).width / 2 < cell * 0.475, `inside the stone at ${cell}`);
});

await test("thumbnails: what is drawn follows the cell size in device pixels — whole-pixel cells, grid and stars only when legible", () => {
  // A 19×19 Library row at 40 css px, 1× and 2×.
  const tiny = thumbPlan(19, 19, 40);
  assert.deepEqual([tiny.cell, tiny.ox, tiny.oy], [2, 1, 1], "two-pixel cells, centred");
  assert.equal(tiny.grid, false, "no grid at two pixels a cell");
  assert.equal(tiny.stars, false);
  assert.equal(tiny.stoneR, 1, "stones fill their cell");
  assert.equal(tiny.square, true, "as crisp squares: a two-pixel disc would be a blur");
  assert.ok(tiny.rim >= RIM_MIN, "the rim stays a visible hairline");
  const retina = thumbPlan(19, 19, 80);
  assert.equal(retina.cell, 4);
  assert.equal(retina.grid, true, "the grid appears from four device pixels a cell");
  assert.equal(retina.square, false, "round stones from there on");
  assert.equal(retina.stars, false);
  assert.ok(retina.rim >= RIM_MIN);
  // The same board on a hero (96 px) and the 44 px row.
  assert.equal(thumbPlan(19, 19, 44).cell, 2);
  assert.equal(thumbPlan(19, 19, 96).cell, 5);
  assert.equal(thumbPlan(19, 19, 192).stars, true, "star points once a cell is ten pixels");
  // 9×9 is roomy at every size the app uses.
  const nine = thumbPlan(9, 9, 40);
  assert.deepEqual([nine.cell, nine.grid, nine.stars], [4, true, false]);
  assert.equal(thumbPlan(9, 9, 96).stars, true);
  // The thresholds are what the plan uses.
  for (let px = 23; px <= 400; px += 7) {
    for (const n of [9, 13, 19]) {
      const p = thumbPlan(n, n, px);
      assert.ok(Number.isInteger(p.cell) && p.cell >= 1, "whole device pixels");
      assert.ok(p.ox >= 0 && p.ox + p.cell * n <= px, "the board fits");
      assert.equal(p.grid, p.cell >= GRID_MIN);
      assert.equal(p.stars, p.cell >= STAR_MIN);
      assert.equal(p.lineOffset % 1, 0.5, "lines sit on pixel centres");
      assert.ok(p.stoneR <= p.cell / 2 && p.stoneR >= p.cell / 2 - 0.5);
      assert.ok(p.rim >= RIM_MIN && p.rim <= 1.5);
    }
  }
  // A problem diagram (not square): fitted by its longer side, centred on the other; no star points.
  const d = thumbPlan(7, 4, 64);
  assert.deepEqual([d.cell, d.ox, d.oy, d.stars], [9, 0, 14, false]);
});

await test("thumbnails: both notations give the same picture, rims are drawn under the stones, and white always gets one", () => {
  const s = fromString("b.w" + "." .repeat(6), 3);
  assert.deepEqual([s.at(0, 0), s.at(1, 0), s.at(2, 0), s.at(1, 1)], ["b", null, "w", null]);
  const d = fromDiagram(["X . O", ". . .", "o x ."]);
  assert.deepEqual([d.cols, d.rows], [3, 3]);
  assert.deepEqual([d.at(0, 0), d.at(2, 0), d.at(0, 2), d.at(1, 2), d.at(2, 2)], ["b", "w", "w", "b", null]);
  // Record the drawing calls on a stand-in context.
  const draw = (spec, px, pal) => {
    const calls = [];
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      // A square stone (tiny cells) is recorded like a disc: centre and half-width.
      fillRect: (x, y, w, h) => calls.push(w === 40 || calls.length === 0 ? ["rect", ctx.fillStyle, x, y, w, h] : ["disc", ctx.fillStyle, x + w / 2, y + h / 2, w / 2]),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => calls.push(["line"]),
      stroke: () => calls.push(["stroke", ctx.strokeStyle, ctx.lineWidth]),
      arc: (x, y, r) => (ctx.last = [x, y, r]),
      fill: () => calls.push(["disc", ctx.fillStyle, ...ctx.last]),
    };
    drawThumb(ctx, spec, thumbPlan(spec.cols, spec.rows, px), pal, px);
    return calls;
  };
  for (const pal of [boardPalette(), boardPalette({ dark: true }), boardPalette({ style: "contrast" }), boardPalette({ style: "contrast", dark: true })]) {
    const calls = draw(fromString("bw.......", 3), 40, pal);
    assert.deepEqual(calls[0], ["rect", pal.base, 0, 0, 40, 40], "the surface first");
    const discs = calls.filter((c) => c[0] === "disc");
    const whiteBody = discs.findIndex((c) => c[1] === pal.stone.white.fill && c[4] === thumbPlan(3, 3, 40).stoneR);
    const whiteRim = discs.findIndex((c) => c[1] === pal.stone.white.rim);
    assert.ok(whiteRim >= 0 && whiteRim < whiteBody, `${pal.key}: the white rim is under the white stone`);
    assert.ok(discs[whiteRim][4] > discs[whiteBody][4], "and larger than it, so the stone keeps its size");
    // Every rim (a disc larger than a stone) is drawn before the first stone body.
    const stoneR = thumbPlan(3, 3, 40).stoneR;
    const lastRim = Math.max(...discs.map((c, i) => (c[4] > stoneR ? i : -1)));
    const firstBody = discs.findIndex((c) => c[4] === stoneR);
    assert.ok(lastRim >= 0 && lastRim < firstBody, `${pal.key}: rims before bodies`);
    assert.equal(discs.filter((c) => c[4] === stoneR).length, 2, "two stones");
  }
  // At two pixels a cell the stones are squares, the rim still under and around them.
  const tinyCalls = draw(fromString("w" + ".".repeat(360), 19), 40, boardPalette());
  assert.deepEqual(tinyCalls.filter((c) => c[0] === "disc").map((c) => [c[1], c[4]]), [[boardPalette().stone.white.rim, 1 + thumbPlan(19, 19, 40).rim], [boardPalette().stone.white.fill, 1]]);
  // No grid is stroked when the cells are too small for one.
  assert.ok(!draw(fromString(".".repeat(361), 19), 40, boardPalette()).some((c) => c[0] === "stroke"));
  assert.ok(draw(fromString(".".repeat(361), 19), 80, boardPalette()).some((c) => c[0] === "stroke" && c[2] === 1), "one device pixel");
});
