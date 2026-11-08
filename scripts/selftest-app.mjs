/**
 * Launch a packaged Goban Studio and wait for the page's self-test report.
 *
 * The report is written by the real WebView after it has initialized the
 * native bridge, run KataGo's analysis on 9×9 and 19×19, and chosen a move
 * in a handicap game, and checked that analysis runs off the UI thread
 * (async, streaming, incremental, cancellable). This is the step that
 * distinguishes "the executable linked" from "the app a player double-clicks
 * actually starts".
 *
 * v5: the optional downloads are exercised too, end to end against the
 * pinned KataGo release URLs (human model 99 MB, stronger network 48 MB:
 * seconds on a GitHub-hosted runner), into a temporary models folder that
 * is deleted afterwards. GOBAN_SELFTEST_MODELS=0 skips them (offline runs).
 *
 * Usage: node scripts/selftest-app.mjs <path-to-executable>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) {
  console.error("selftest: missing executable:", exe || "(none)");
  process.exit(1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "goban-selftest-"));
const reportPath = path.join(temp, "report.json");
const withModels = process.env.GOBAN_SELFTEST_MODELS !== "0";
const modelsDir = path.join(temp, "models");
// Below the workflow step's 10-minute limit, so a stall is reported here.
const timeoutMs = Number(process.env.GOBAN_SELFTEST_TIMEOUT_MS || (withModels ? 480000 : 180000));
const child = spawn(path.resolve(exe), [], {
  cwd: path.dirname(path.resolve(exe)),
  env: {
    ...process.env,
    GOBAN_SELFTEST_OUT: reportPath,
    GOBAN_SELFTEST_MODELS: withModels ? "1" : "0",
    GOBAN_MODELS_DIR: modelsDir,
  },
  stdio: "inherit",
});

let exited = null;
child.on("exit", (code, signal) => {
  exited = { code, signal };
});

const deadline = Date.now() + timeoutMs;
let report = null;
while (Date.now() < deadline) {
  if (fs.existsSync(reportPath)) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      break;
    } catch {
      // The writer may be midway through the file; try again next tick.
    }
  }
  if (exited) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// v13: the app must quit when asked (SIGTERM → [NSApp terminate:] on macOS,
// where the page first gets a bounded chance to flush its writes). A quit
// that does not finish within 15 s is a failure, reported as such, and the
// process is then killed so the step never hangs.
let quitStuck = false;
if (!exited) {
  child.kill();
  const until = Date.now() + 15000;
  while (!exited && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!exited) {
    quitStuck = true;
    child.kill("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Give WebView2 / WKWebView a moment to tear down before the next step.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// The downloaded networks never outlive the test.
fs.rmSync(modelsDir, { recursive: true, force: true });

if (quitStuck) {
  console.error("selftest: the packaged app did not quit within 15 s of SIGTERM");
  process.exit(1);
}

if (!report) {
  console.error("selftest: no report from the packaged app");
  const progress = reportPath + ".progress";
  if (fs.existsSync(progress)) console.error("selftest: last progress mark:\n" + fs.readFileSync(progress, "utf8"));
  process.exit(1);
}

const checks = report.checks || {};
const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key);
// analyze19/analyze9/handicapMove: KataGo answers on both board sizes and
// plays in a handicap game. async/stream/incremental/cancel: the search
// runs off the UI thread (no frame gap ≥ 250 ms), reports partial results,
// re-syncs a one-move change with one `play`, and stops within 1 s.
// modelsResume/modelsHuman/modelsStrong/modelsRemove (v5): the pinned
// downloads stop, resume, verify, run on their own KataGo processes and are
// removed again.
const required = ["bridge", "ui", "analyze19", "analyze9", "handicapMove", "async", "stream", "incremental", "cancel", "menus"];
if (withModels) required.push("modelsResume", "modelsHuman", "modelsStrong", "modelsRemove");
const ok = report.ok === true && report.boardSize === 19 && required.every((k) => checks[k] === true) && failed.length === 0 && report.modelsChecked === withModels;
console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error("selftest: failed checks:", failed.join(", ") || "report.ok/boardSize/engine");
  process.exit(1);
}
console.log(`selftest: packaged app analysed 9×9 and 19×19 with KataGo off the UI thread (max frame gap ${report.timings?.asyncMaxFrameGapMs} ms, cancel ${report.timings?.cancelMs} ms) and played ${report.engineMove} in a handicap game`);
