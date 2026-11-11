/**
 * Native screenshot tour of a packaged Goban Studio (release checks).
 *
 * Launches the packaged executable with GOBAN_TOUR_OUT set. The page
 * (src/web/js/tour.js) visits Play, a 19×19 game, its review, Practice and
 * Settings with the app's own controller; after each it writes
 * {step, name} to GOBAN_TOUR_OUT and waits for `<GOBAN_TOUR_OUT>.ack`.
 * This script captures the window with the operating system's tools
 * (macOS `screencapture`, Windows System.Drawing via PowerShell), writes the
 * ack, and finally checks the set with scripts/screenshots.mjs: every
 * screen non-blank and different from the one before.
 *
 * Usage: node scripts/tour-app.mjs <path-to-executable> <output-dir>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkFiles } from "./screenshots.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const exe = process.argv[2];
const outDir = path.resolve(process.argv[3] || "screenshots");
if (!exe || !fs.existsSync(exe)) {
  console.error("tour: missing executable:", exe || "(none)");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "goban-tour-"));
const tourPath = path.join(temp, "tour.json");
const ackPath = tourPath + ".ack";
const totalMs = Number(process.env.GOBAN_TOUR_TIMEOUT_MS || 240000);
const stepMs = 60000;
const captureDelayMs = 600;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------- capture */

let macWindowTool = null;
function macWindowId(pid) {
  if (macWindowTool === null) {
    macWindowTool = "";
    try {
      const bin = path.join(temp, "window-id");
      execFileSync("swiftc", ["-O", "-o", bin, path.join(here, "macos-window-id.swift")], { stdio: "inherit" });
      macWindowTool = bin;
    } catch (e) {
      console.warn("tour: could not build the window-id helper; capturing the full screen", e.message);
    }
  }
  if (!macWindowTool) return null;
  try {
    const id = execFileSync(macWindowTool, [String(pid)], { encoding: "utf8" }).trim();
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function capture(pid, file) {
  if (process.platform === "darwin") {
    const id = macWindowId(pid);
    // -x: no sound; -o: no window shadow; -l: that window only.
    execFileSync("screencapture", id ? ["-x", "-o", "-l", id, file] : ["-x", file], { stdio: "inherit" });
    return id ? `window ${id}` : "full screen";
  }
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "capture-window.ps1"), "-ProcessId", String(pid), "-Out", file],
      { encoding: "utf8" },
    );
    return out.trim().split(/\r?\n/).pop() || "captured";
  }
  throw new Error(`no screen capture for ${process.platform}`);
}

/* ----------------------------------------------------------------- tour */

const child = spawn(path.resolve(exe), [], {
  cwd: path.dirname(path.resolve(exe)),
  env: { ...process.env, GOBAN_TOUR_OUT: tourPath, GOBAN_SELFTEST_OUT: "" },
  stdio: "inherit",
});
let exited = null;
child.on("exit", (code, signal) => {
  exited = { code, signal };
});

function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(tourPath, "utf8"));
  } catch {
    return null; // not written yet, or mid-write
  }
}

const shots = [];
const deadline = Date.now() + totalMs;
let lastStep = 0;
let lastProgressAt = Date.now();
let failure = null;
while (Date.now() < deadline) {
  if (exited) {
    failure = `the app exited during the tour (${JSON.stringify(exited)})`;
    break;
  }
  const progress = readProgress();
  if (progress?.done) break;
  if (progress && progress.step > lastStep) {
    lastStep = progress.step;
    lastProgressAt = Date.now();
    if (progress.error) console.warn(`tour: step ${progress.step} (${progress.name}) reported: ${progress.error}`);
    await sleep(captureDelayMs);
    const file = path.join(outDir, `${String(progress.step).padStart(2, "0")}-${progress.name}.png`);
    try {
      const how = capture(child.pid, file);
      console.log(`tour: ${progress.step}/${progress.total} ${progress.name} → ${path.basename(file)} (${how}; space=${progress.space}, sheet=${progress.sheet}, review=${progress.review})`);
      shots.push(file);
    } catch (e) {
      failure = `capture failed at ${progress.name}: ${e.message}`;
      break;
    }
    fs.writeFileSync(ackPath, String(progress.step));
  } else if (Date.now() - lastProgressAt > stepMs) {
    failure = lastStep ? `no progress after step ${lastStep} for ${stepMs / 1000} s` : "the page never started the tour";
    break;
  }
  await sleep(200);
}
if (!failure && Date.now() >= deadline) failure = "tour timed out";

if (!exited) {
  child.kill();
  await sleep(800);
}

if (failure) {
  console.error("tour: " + failure);
  process.exit(1);
}
const result = checkFiles(shots);
console.table(result.rows);
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(result, null, 2));
if (shots.length < 5) result.failures.push(`only ${shots.length} of 5 screens captured`);
if (result.failures.length) {
  console.error("tour: " + result.failures.join("; "));
  process.exit(1);
}
console.log(`tour: ${shots.length} native screenshots, none blank, each different from the one before → ${outDir}`);
