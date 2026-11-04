/**
 * Checks on OS screenshots of the packaged app (v4 release checks).
 *
 * The packaged-app tour (scripts/tour-app.mjs) captures each screen with
 * the operating system's own tools. A capture can silently fail in ways a
 * file-exists check misses: a black or single-colour image (no screen
 * recording permission, a window that never painted), or the same frame
 * twice (navigation did nothing). These functions catch both.
 *
 *   node scripts/screenshots.mjs <dir|file.png...>   check a set, in order
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

/** Sample about this many pixels per image (fast on 4K captures). */
const SAMPLES = 40000;
/** A pixel "differs" when its RGB channels differ by this much in total. */
const PIXEL_DELTA = 30;

export const LIMITS = {
  /** Below this luminance standard deviation an image counts as blank. */
  minStddev: 6,
  /** …or with fewer distinct (quantized) colours than this. */
  minColors: 12,
  /** Consecutive screens must differ in at least this fraction of pixels. */
  minDiff: 0.01,
};

function samplePoints(width, height) {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / SAMPLES)));
  const points = [];
  for (let y = Math.floor(step / 2); y < height; y += step) {
    for (let x = Math.floor(step / 2); x < width; x += step) points.push(y * width + x);
  }
  return points;
}

/** Luminance spread and colour count of a decoded PNG ({width, height, data}). */
export function imageStats(png) {
  const { width, height, data } = png;
  const points = samplePoints(width, height);
  let sum = 0;
  let sum2 = 0;
  const colors = new Set();
  for (const p of points) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    sum2 += l * l;
    colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const n = points.length || 1;
  const mean = sum / n;
  const stddev = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { width, height, mean: Math.round(mean * 10) / 10, stddev: Math.round(stddev * 10) / 10, colors: colors.size };
}

export function isBlank(stats, limits = LIMITS) {
  return stats.width < 16 || stats.height < 16 || stats.stddev < limits.minStddev || stats.colors < limits.minColors;
}

/** Fraction of sampled pixels that differ between two images (1 if sizes differ). */
export function diffFraction(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  const points = samplePoints(a.width, a.height);
  let differ = 0;
  for (const p of points) {
    const i = p * 4;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > PIXEL_DELTA) differ++;
  }
  return differ / (points.length || 1);
}

/**
 * Check decoded images in order: each non-blank and different from the
 * one before. `images` is [{ name, png }]. Returns { ok, rows, failures }.
 */
export function checkSequence(images, limits = LIMITS) {
  const rows = [];
  const failures = [];
  let prev = null;
  for (const { name, png } of images) {
    const stats = imageStats(png);
    const blank = isBlank(stats, limits);
    const diff = prev ? Math.round(diffFraction(prev, png) * 1000) / 1000 : null;
    if (blank) failures.push(`${name}: blank (stddev ${stats.stddev}, ${stats.colors} colours)`);
    if (diff !== null && diff < limits.minDiff) failures.push(`${name}: same as the previous screen (${(diff * 100).toFixed(1)}% of pixels differ)`);
    rows.push({ name, ...stats, blank, diffFromPrevious: diff });
    prev = png;
  }
  if (!images.length) failures.push("no screenshots");
  return { ok: failures.length === 0, rows, failures };
}

export function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

export function checkFiles(files, limits = LIMITS) {
  return checkSequence(
    files.map((file) => ({ name: path.basename(file), png: readPng(file) })),
    limits,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.flatMap((a) =>
    fs.statSync(a).isDirectory()
      ? fs.readdirSync(a).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(a, f))
      : [a],
  );
  const result = checkFiles(files);
  console.table(result.rows);
  if (!result.ok) {
    console.error("screenshots: " + result.failures.join("; "));
    process.exit(1);
  }
  console.log(`screenshots: ${files.length} screens, none blank, each different from the one before`);
}
