/**
 * The interface checks inside a packaged Goban Studio (Windows).
 *
 * Every other interface check runs in a browser against frontend/dist,
 * where the page's own files come from a web server. v16.0.0 showed what
 * that misses: the packaged app's WebView answered those files differently
 * (on macOS with status 0), and the language switch, the lessons, problems
 * and classics read on demand, the opening book and the sounds all failed
 * in the app while every check passed. This script launches the packaged
 * executable as scripts/selftest-app.mjs does, with WebView2's DevTools
 * port open (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS), connects Playwright to
 * it (chromium.connectOverCDP: Playwright's library only, no browser of its
 * own) and clicks the user path of scripts/packaged-ui-steps.mjs: the
 * first run, a language change in Settings, a lesson and a problem from
 * Practice, a classic from the Library, the openings explorer, a move in a
 * new game and its review. Each step reads back what the page shows and
 * fails with what it waited for.
 *
 * Nothing real is touched: the app's data, its optional networks and the
 * WebView2 profile go to a temporary folder (GOBAN_DATA_DIR,
 * GOBAN_MODELS_DIR, WEBVIEW2_USER_DATA_FOLDER), deleted afterwards.
 * On a failure the window's page is saved as packaged-ui-failure.png in
 * the output folder; report.json there lists each step.
 *
 * WKWebView (macOS) has no such port: there the self-test walks the same
 * path from inside the page (src/web/js/selftest-path.js, check userPath).
 *
 *   node scripts/packaged-ui.mjs <path-to-goban-studio.exe> [output-dir]
 *
 * GOBAN_PACKAGED_UI_BROWSER=<chromium> runs the same connection and steps
 * against frontend/dist in that Chromium instead of the app (to check this
 * script itself on a machine without the package).
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { runSteps } from "./packaged-ui-steps.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.argv[2];
const outDir = path.resolve(process.argv[3] || "packaged-ui");
const browserExe = process.env.GOBAN_PACKAGED_UI_BROWSER || "";
const totalMs = Number(process.env.GOBAN_PACKAGED_UI_TIMEOUT_MS || 300000);
const START_MS = 90000; // the app's window and its DevTools port
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!browserExe && (!exe || !fs.existsSync(exe))) {
  console.error("packaged-ui: missing executable:", exe || "(none)");
  process.exit(1);
}
if (!browserExe && process.platform !== "win32") {
  console.error("packaged-ui: only the Windows app (WebView2) can be driven from outside; macOS runs the same path in its self-test (check userPath)");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "goban-packaged-ui-"));

/** A free local port for the DevTools endpoint. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {net.AddressInfo} */ (s.address());
      s.close(() => resolve(port));
    });
  });
}

/** frontend/dist on a local port (the GOBAN_PACKAGED_UI_BROWSER rehearsal). */
async function serveDist() {
  const dist = path.join(root, "frontend/dist");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".wav": "audio/wav", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(dist, url === "/" ? "index.html" : url);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  return { server, url: `http://127.0.0.1:${/** @type {net.AddressInfo} */ (server.address()).port}/` };
}

const port = await freePort();
let served = null;
const POLICY_KEY = "HKCU\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments";
let policySet = false;
/** The WebView2 arguments for this executable, as a per-user policy (Windows only). */
function setPolicy(args) {
  if (process.platform !== "win32") return;
  const r = spawnSync("reg", ["add", POLICY_KEY, "/v", path.basename(exe), "/t", "REG_SZ", "/d", args, "/f"], { encoding: "utf8" });
  policySet = r.status === 0;
  console.log(`packaged-ui: WebView2 arguments policy ${policySet ? "set" : "not set: " + (r.stderr || r.stdout).trim()}`);
}
function clearPolicy() {
  if (!policySet) return;
  spawnSync("reg", ["delete", POLICY_KEY, "/v", path.basename(exe), "/f"], { encoding: "utf8" });
  policySet = false;
}

let child;
if (browserExe) {
  served = await serveDist();
  child = spawn(browserExe, ["--headless", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(temp, "browser")}`, "--no-first-run", "--window-size=1200,860", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), served.url], { stdio: ["ignore", "ignore", "inherit"] });
} else {
  const env = {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview2"),
    GOBAN_DATA_DIR: path.join(temp, "data"),
    GOBAN_MODELS_DIR: path.join(temp, "models"),
  };
  // A normal launch: no self-test, tour or updater probe.
  for (const k of ["GOBAN_SELFTEST_OUT", "GOBAN_SELFTEST_MODELS", "GOBAN_TOUR_OUT", "GOBAN_UPDATE_PROBE_OUT", "GOBAN_UPDATE_PROBE_TAG"]) delete env[k];
  // WebView2 157 on the runner reads the profile folder from the environment
  // but not the browser arguments (PR #24's run: no --remote-debugging-port
  // on its command line), so they are also given the documented other way:
  // the per-executable policy under HKCU, set for this run and removed after.
  setPolicy(`--remote-debugging-port=${port}`);
  child = spawn(path.resolve(exe), [], { cwd: path.dirname(path.resolve(exe)), env, stdio: "inherit" });
}
let exited = null;
child.on("exit", (code, signal) => (exited = { code, signal }));

let browser = null;
let page = null;
const report = { target: browserExe ? `browser ${browserExe}` : exe, port, steps: [], pageErrors: [], consoleErrors: [] };

async function stopApp() {
  if (browser) await browser.close().catch(() => {}); // disconnects; the app stays up
  if (!exited) {
    child.kill();
    const until = Date.now() + 15000;
    while (!exited && Date.now() < until) await sleep(100);
    if (!exited) child.kill("SIGKILL");
    await sleep(800);
  }
  served?.server.close();
  clearPolicy();
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

async function fail(message) {
  console.error("packaged-ui: " + message);
  report.error = message;
  if (page) {
    const shot = path.join(outDir, "packaged-ui-failure.png");
    await page
      .screenshot({ path: shot, timeout: 10000 })
      .then(() => console.error("packaged-ui: the page at the failure: " + shot))
      .catch((e) => console.error("packaged-ui: no screenshot: " + e.message.split("\n")[0]));
    report.page = await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 600) })).catch(() => null);
  }
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await stopApp();
  process.exit(1);
}

const watchdog = setTimeout(() => fail(`timed out after ${totalMs / 1000} s`), totalMs);

/* ------------------------------------------------ the DevTools endpoint */

/**
 * The port WebView2 wrote in its profile (DevToolsActivePort, first line),
 * if it opened one at all: the port asked for may be refused or moved.
 */
function activePort() {
  const root = path.join(temp, "webview2");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name === "DevToolsActivePort") {
        const n = Number(fs.readFileSync(full, "utf8").split(/\r?\n/)[0]);
        if (n > 0) return n;
      }
    }
  }
  return null;
}

/** What the WebView2 processes were started with, and what is in their profile (on failure, for the log). */
function diagnose() {
  if (browserExe || process.platform !== "win32") return;
  const ps = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object -First 3 -ExpandProperty CommandLine"], { encoding: "utf8" });
  console.error("packaged-ui: WebView2 processes:\n" + (ps.stdout || ps.stderr || "(none)").slice(0, 3000));
  const listing = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      listing.push(path.relative(temp, path.join(dir, e.name)));
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(path.join(temp, "webview2"), 0);
  console.error("packaged-ui: the WebView2 profile: " + (listing.slice(0, 40).join(", ") || "(empty: the folder asked for was not used)"));
}

let endpoint = `http://127.0.0.1:${port}`;
const startBy = Date.now() + START_MS;
let version = null;
while (Date.now() < startBy && !exited) {
  const other = activePort();
  if (other && other !== port) endpoint = `http://127.0.0.1:${other}`;
  version = await fetch(endpoint + "/json/version")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (version) break;
  await sleep(500);
}
if (exited) await fail(`the app exited before its DevTools port opened (${JSON.stringify(exited)})`);
if (!version) {
  diagnose();
  await fail(`no DevTools endpoint on ${endpoint} after ${START_MS / 1000} s (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS not honoured?)`);
}
console.log(`packaged-ui: DevTools endpoint up: ${version.Browser}`);

try {
  browser = await chromium.connectOverCDP(endpoint, { timeout: 30000 });
} catch (e) {
  await fail("connectOverCDP failed: " + e.message.split("\n")[0]);
}

/** The app's page: the one with the app's shell in it (not DevTools, not about:blank). */
async function appPage() {
  const by = Date.now() + 60000;
  while (Date.now() < by && !exited) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (/^(devtools|about|chrome|edge):/.test(p.url())) continue;
        if (await p.locator(".app").count().catch(() => 0)) return p;
      }
    }
    await sleep(500);
  }
  return null;
}
page = await appPage();
if (!page) await fail(`no page of the app's shell among: ${browser.contexts().flatMap((c) => c.pages().map((p) => p.url())).join(", ") || "(none)"}`);
console.log(`packaged-ui: driving ${page.url()}`);
page.on("pageerror", (e) => report.pageErrors.push(e.message));
page.on("console", (m) => m.type() === "error" && report.consoleErrors.push(m.text()));

/* ------------------------------------------------------------ the path */

const result = await runSteps(page, { log: (line) => console.log("packaged-ui: " + line) });
report.steps = result.steps;
if (!result.ok) await fail(`step "${result.failed}" failed: ${result.steps.at(-1).error}`);
if (report.pageErrors.length) await fail("errors in the page: " + report.pageErrors.join("; "));
if (report.consoleErrors.length) console.warn("packaged-ui: console errors (not failing): " + report.consoleErrors.join("; "));
await page.screenshot({ path: path.join(outDir, "packaged-ui-last.png"), timeout: 10000 }).catch(() => {});
clearTimeout(watchdog);
report.ok = true;
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
await stopApp();
console.log(`packaged-ui: ${result.steps.length} steps passed in the ${browserExe ? "browser rehearsal" : "packaged app"} (${result.steps.map((s) => `${s.name} ${s.ms} ms`).join(", ")})`);
process.exit(0);
