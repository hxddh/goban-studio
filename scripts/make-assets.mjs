/**
 * Generate every visual and audio asset of Goban Studio from code.
 *
 *   node scripts/make-assets.mjs            # everything
 *   node scripts/make-assets.mjs brand      # one group: stones | sounds | brand
 *
 * Output (src/web/assets):
 *   stones/{white-0..7,black-0..3}.png          256² sprites
 *   sounds/*.wav                                 16-bit mono 44.1 kHz
 *   brand.svg                                    the mark
 * and assets/icon.svg + assets/icon.png (the app icon).
 *
 * Every random choice comes from a fixed seed, so a re-run writes identical
 * files. Pixels, PNGs and WAVs are produced in plain Node; Chromium (via
 * Playwright, which must be installed) is used only to render the raster
 * app icon from its SVG (scripts/assets/brand.mjs).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { encodePNG, encodeWAV } from "./assets/lib.mjs";
import * as Stones from "./assets/stones.mjs";
import * as Snd from "./assets/sounds.mjs";
import { brandSVG, iconHTML, iconSVG } from "./assets/brand.mjs";


const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/web/assets");
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

const report = [];
function note(rel, extra = "") {
  const size = fs.statSync(path.join(out, rel)).size;
  report.push([rel, size]);
  console.log(`  ${rel.padEnd(30)} ${(size / 1024).toFixed(1).padStart(8)} KB ${extra}`);
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
}

if (want("sounds")) {
  console.log("sounds");
  const emit = (name, samples, target, seed) => {
    const n = Snd.normalise(samples, target);
    write(`sounds/${name}.wav`, encodeWAV(n.samples, Snd.RATE, seed));
    note(`sounds/${name}.wav`, `${(n.samples.length / Snd.RATE).toFixed(2)} s  ${n.lufs.toFixed(1)} LU  peak ${n.peakDb.toFixed(1)} dBFS`);
  };
  Snd.PLACE_VARIANTS.forEach((v, i) => emit(`place-wood-${i}`, Snd.placeWood(500 + i, v), Snd.LOUDNESS.place, 1 + i));
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
  const p = await page();
  p.__html = iconHTML();
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
