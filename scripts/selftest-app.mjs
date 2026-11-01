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
const timeoutMs = Number(process.env.GOBAN_SELFTEST_TIMEOUT_MS || 180000);
const child = spawn(path.resolve(exe), [], {
  cwd: path.dirname(path.resolve(exe)),
  env: { ...process.env, GOBAN_SELFTEST_OUT: reportPath },
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

if (!exited) {
  child.kill();
  // Give WebView2 / WKWebView a moment to tear down before the next step.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!report) {
  console.error("selftest: no report from the packaged app");
  process.exit(1);
}

const checks = report.checks || {};
const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key);
// analyze19/analyze9/handicapMove: KataGo answers on both board sizes and
// plays in a handicap game. async/stream/incremental/cancel: the search
// runs off the UI thread (no frame gap ≥ 250 ms), reports partial results,
// re-syncs a one-move change with one `play`, and stops within 1 s.
const required = ["bridge", "ui", "analyze19", "analyze9", "handicapMove", "async", "stream", "incremental", "cancel", "menus"];
const ok = report.ok === true && report.boardSize === 19 && required.every((k) => checks[k] === true) && failed.length === 0;
console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error("selftest: failed checks:", failed.join(", ") || "report.ok/boardSize/engine");
  process.exit(1);
}
console.log(`selftest: packaged app analysed 9×9 and 19×19 with KataGo off the UI thread (max frame gap ${report.timings?.asyncMaxFrameGapMs} ms, cancel ${report.timings?.cancelMs} ms) and played ${report.engineMove} in a handicap game`);
