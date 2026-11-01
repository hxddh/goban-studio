/**
 * Generate every visual and audio asset of Goban Studio from code.
 *
 *   node scripts/make-assets.mjs            # everything
 *   node scripts/make-assets.mjs surfaces   # one group: surfaces | stones | sounds | brand
 *
 * Output (src/web/assets):
 *   surfaces/{kaya,katsura,paper,slate}.webp   2048² board surfaces
 *   stones/{white-0..7,black-0..3,flat-black,flat-white}.png   256² sprites
 *   sounds/*.wav                                 16-bit mono 44.1 kHz
 *   brand.svg                                    the mark
 * and assets/icon.svg + assets/icon.png (the app icon).
 *
 * Every random choice comes from a fixed seed, so a re-run writes identical
 * files. Pixels, PNGs and WAVs are produced in plain Node; Chromium (via
 * Playwright, which must be installed) is used only to encode WebP and to
 * composite the raster app icon.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, encodePNG, encodeWAV, hex } from "./assets/lib.mjs";
import * as Surf from "./assets/surfaces.mjs";
import * as Stones from "./assets/stones.mjs";
import * as Snd from "./assets/sounds.mjs";
import { brandSVG, iconHTML, iconSVG } from "./assets/brand.mjs";
import { THEME_COLORS } from "../src/web/js/materials.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/web/assets");
const SIZE = 2048;
const WEBP_QUALITY = 0.94;
const only = new Set(process.argv.slice(2));
const want = (g) => only.size === 0 || only.has(g);

function write(rel, buf) {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}

let browser = null;
async function page() {
  if (!browser) {
    const require = createRequire(import.meta.url);
    let pw;
    try {
      pw = require("playwright");
    } catch (_) {
      throw new Error("make-assets needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium)");
    }
    browser = await pw.chromium.launch({ args: ["--disable-gpu", "--force-color-profile=srgb"] });
  }
  const p = await browser.newPage();
  const files = new Map();
  await p.route("http://assets.invalid/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: p.__html || "<!doctype html><body></body>" });
    const f = files.get(u.pathname);
    if (!f) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: f.type, body: f.body });
  });
  p.serve = (pathname, body, type = "application/octet-stream") => files.set(pathname, { body, type });
  return p;
}

/** Encode RGB pixels as lossy WebP in Chromium. */
async function webp(p, rgb, size, quality) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
  p.serve("/raw", rgba);
  const b64 = await p.evaluate(
    async ({ size, quality }) => {
      const buf = await (await fetch("/raw")).arrayBuffer();
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buf), size, size), 0, 0);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/webp", quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { size, quality },
  );
  return Buffer.from(b64, "base64");
}

/** Worst-case contrast of a colour against the surface (1st/99th percentile luminance pixels). */
function surfaceStats(rgb) {
  const n = rgb.length / 3;
  const lum = new Float32Array(n);
  let m = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    m[0] += r;
    m[1] += g;
    m[2] += b;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  m = m.map((v) => Math.round(v / n));
  const idx = Array.from({ length: 4096 }, (_, k) => Math.floor((k * n) / 4096));
  idx.sort((a, b) => lum[a] - lum[b]);
  const px = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  return { mean: m, dark: px(idx[Math.floor(idx.length * 0.01)]), light: px(idx[Math.floor(idx.length * 0.99)]) };
}

function checkTheme(name, stats) {
  const t = THEME_COLORS[name];
  const rows = [];
  let ok = true;
  for (const key of ["line", "edge", "star", "text"]) {
    const col = hex(t[key]);
    const worst = key === "text" ? contrast(col, stats.mean) : Math.min(contrast(col, stats.dark), contrast(col, stats.light));
    if (worst < 3) ok = false;
    rows.push(`${key} ${worst.toFixed(2)}:1`);
  }
  console.log(`  ${name.padEnd(8)} contrast  ${rows.join("  ")}${ok ? "" : "   << below 3:1"}`);
  return ok;
}

const report = [];
function note(rel, extra = "") {
  const size = fs.statSync(path.join(out, rel)).size;
  report.push([rel, size]);
  console.log(`  ${rel.padEnd(30)} ${(size / 1024).toFixed(1).padStart(8)} KB ${extra}`);
}

let contrastOk = true;

if (want("surfaces")) {
  console.log("surfaces");
  const p = await page();
  await p.goto("http://assets.invalid/");
  for (const name of ["kaya", "katsura", "paper", "slate"]) {
    const rgb = Surf[name](SIZE);
    write(`surfaces/${name}.webp`, await webp(p, rgb, SIZE, WEBP_QUALITY));
    note(`surfaces/${name}.webp`);
    contrastOk = checkTheme(name, surfaceStats(rgb)) && contrastOk;
  }
  await p.close();
}

if (want("stones")) {
  console.log("stones");
  Stones.WHITE_VARIANTS.forEach((v, i) => {
    write(`stones/white-${i}.png`, encodePNG(256, 256, Stones.whiteStone(256, 100 + i, v)));
    note(`stones/white-${i}.png`);
  });
  Stones.BLACK_VARIANTS.forEach((v, i) => {
    write(`stones/black-${i}.png`, encodePNG(256, 256, Stones.blackStone(256, 200 + i, v)));
    note(`stones/black-${i}.png`);
  });
  for (const c of ["black", "white"]) {
    write(`stones/flat-${c}.png`, encodePNG(256, 256, Stones.flatStone(256, c)));
    note(`stones/flat-${c}.png`);
  }
}

if (want("sounds")) {
  console.log("sounds");
  const emit = (name, samples, target, seed) => {
    const n = Snd.normalise(samples, target);
    write(`sounds/${name}.wav`, encodeWAV(n.samples, Snd.RATE, seed));
    note(`sounds/${name}.wav`, `${(n.samples.length / Snd.RATE).toFixed(2)} s  ${n.lufs.toFixed(1)} LU  peak ${n.peakDb.toFixed(1)} dBFS`);
  };
  Snd.PLACE_VARIANTS.forEach((v, i) => emit(`place-wood-${i}`, Snd.placeWood(500 + i, v), Snd.LOUDNESS.place, 1 + i));
  Snd.PLACE_VARIANTS.forEach((v, i) => emit(`place-soft-${i}`, Snd.placeSoft(600 + i, v), Snd.LOUDNESS.soft, 11 + i));
  emit("capture-1", Snd.capture(701, 1), Snd.LOUDNESS.capture, 21);
  emit("capture-2", Snd.capture(702, 3), Snd.LOUDNESS.capture, 22);
  emit("capture-3", Snd.capture(703, 7), Snd.LOUDNESS.capture, 23);
  emit("pass", Snd.passSound(801), Snd.LOUDNESS.pass, 31);
  emit("correct", Snd.correct(), Snd.LOUDNESS.correct, 32);
  emit("wrong", Snd.wrong(), Snd.LOUDNESS.wrong, 33);
  emit("lose", Snd.lose(), Snd.LOUDNESS.lose, 34);
  emit("game-end", Snd.gameEnd(), Snd.LOUDNESS.end, 35);
}

if (want("brand")) {
  console.log("brand");
  write("brand.svg", brandSVG());
  note("brand.svg");
  fs.writeFileSync(path.join(root, "assets/icon.svg"), iconSVG());
  const kaya = path.join(out, "surfaces/kaya.webp");
  const black = path.join(out, "stones/black-0.png");
  const white = path.join(out, "stones/white-0.png");
  if (![kaya, black, white].every((f) => fs.existsSync(f))) throw new Error("brand needs surfaces and stones generated first");
  const p = await page();
  p.serve("/kaya.webp", fs.readFileSync(kaya), "image/webp");
  p.serve("/black.png", fs.readFileSync(black), "image/png");
  p.serve("/white.png", fs.readFileSync(white), "image/png");
  p.__html = iconHTML({ kaya: "/kaya.webp", black: "/black.png", white: "/white.png" });
  await p.goto("http://assets.invalid/");
  const b64 = await p.evaluate(() => window.done);
  fs.writeFileSync(path.join(root, "assets/icon.png"), Buffer.from(b64, "base64"));
  console.log(`  ../../assets/icon.png ${(fs.statSync(path.join(root, "assets/icon.png")).size / 1024).toFixed(1)} KB, icon.svg`);
  await p.close();
}

if (browser) await browser.close();

// Totals across the whole folder (not just what this run wrote).
let total = 0;
const hashes = crypto.createHash("sha256");
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else {
      total += fs.statSync(f).size;
      hashes.update(e.name).update(fs.readFileSync(f));
    }
  }
};
walk(out);
console.log(`total src/web/assets: ${(total / 1024 / 1024).toFixed(2)} MB  (sha256 ${hashes.digest("hex").slice(0, 16)})`);
if (total > 6 * 1024 * 1024) {
  console.error("asset budget exceeded (6 MB)");
  process.exitCode = 1;
}
if (!contrastOk) {
  console.error("a theme colour is below 3:1 against its surface");
  process.exitCode = 1;
}
