/**
 * Shell: release — the static page, updates, signing notes, screenshots, the tour, the updater and the optional networks.
 */
import { test, APP_VERSION, DEFAULT_SETTINGS, Host, M, MESSAGES, PNG, Shots, Sign, U, assert, fs, normalizeSettings, path, root, t } from "./helpers.mjs";

await test("Moka 9x9 assets are present and attributed", () => {
  for (const file of ["host.js", "index.js", "worker.js", "go-model.json", "go-model.bin", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web/moka", file)), `moka/${file}`);
  }
  const model = JSON.parse(fs.readFileSync(path.join(root, "src/web/moka/go-model.json"), "utf8").replace(/\r\n/g, "\n"));
  assert.equal(model.architecture.boardSize, 9);
  assert.equal(fs.statSync(path.join(root, "src/web/moka/go-model.bin")).size, model.weightsBytes);
});

await test("design tokens meet the contrast rules in docs/design.md (light and dark)", () => {
  const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8").replace(/\r\n/g, "\n");
  const block = (sel) => css.slice(css.indexOf(sel + " {"), css.indexOf("}", css.indexOf(sel + " {")));
  const tokens = (b) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const light = tokens(block(":root"));
  const dark = { ...light, ...tokens(block(':root[data-theme="dark"]')) };
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    for (const bg of ["bg", "surface", "sidebar"]) {
      assert.ok(ratio(t.text, t[bg]) >= 7, `${name} text on ${bg}`);
      assert.ok(ratio(t["text-2"], t[bg]) >= 4.5, `${name} text-2 on ${bg}: ${ratio(t["text-2"], t[bg]).toFixed(2)}`);
      assert.ok(ratio(t["text-3"], t[bg]) >= 3, `${name} text-3 on ${bg}: ${ratio(t["text-3"], t[bg]).toFixed(2)}`);
    }
    assert.ok(ratio(t["on-primary"], t.text) >= 7, `${name} primary button label`);
    assert.ok(ratio(t.bad, t.surface) >= 3, `${name} bad on surface`);
    assert.ok(ratio(t.good, t.surface) >= 3, `${name} good on surface`);
  }
});

await test("removing a network retries while the engine is busy, without blocking", async () => {
  let calls = 0;
  const invoke = async () => {
    calls++;
    return calls < 3 ? { ok: false, error: "Busy", models: {} } : { ok: true, models: {} };
  };
  const r = await M.remove("human", { invoke, hasHost: true, sleep: async () => {} });
  assert.equal(r.ok, true);
  assert.equal(calls, 3);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /if \(!self\.katago\.stopSlot\(modelSlot\(kind\)\)\) return modelReply\(self, output, false, "Busy"\);/);
  const engine = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(engine, /pub fn stopSlot\(self: \*Worker, slot: Slot\) bool \{\n\s+\/\/ Never wait on the worker/);
});

await test("static page inputs and build script are present", () => {
  for (const file of ["index.html", "styles.css", "js/main.jsx", "js/app/app.jsx"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web", file)), `src/web/${file}`);
  }
  assert.ok(fs.existsSync(path.join(root, "scripts/bundle.mjs")));
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8").replace(/\r\n/g, "\n");
  assert.match(html, /js\/bundle\.js/);
  // WebView2 injects window.zero as an inline script; without unsafe-inline
  // its CSP drops the bridge and the packaged page silently becomes static.
  assert.match(html, /script-src 'self' 'unsafe-inline'/);
});

await test("versions compare as semver (v-prefix, missing parts, pre-releases)", () => {
  assert.deepEqual(U.parseVersion("v4.1.0"), { major: 4, minor: 1, patch: 0, pre: [] });
  assert.deepEqual(U.parseVersion("4.1"), { major: 4, minor: 1, patch: 0, pre: [] });
  assert.deepEqual(U.parseVersion("4.0.0-beta.2+build.7").pre, ["beta", "2"]);
  for (const bad of ["", "latest", "v", "4.x", "release-4", null, undefined]) assert.equal(U.parseVersion(bad), null, String(bad));
  assert.equal(U.compareVersions("v3.0.0", "3.0.0"), 0);
  assert.equal(U.compareVersions("3.0.1", "3.0.0"), 1);
  assert.equal(U.compareVersions("3.10.0", "3.9.9"), 1, "numeric, not lexical");
  assert.equal(U.compareVersions("4.0.0-beta.1", "4.0.0"), -1, "a pre-release is older than its release");
  assert.equal(U.compareVersions("4.0.0-beta.2", "4.0.0-beta.10"), -1);
  assert.equal(U.compareVersions("4.0.0-alpha", "4.0.0-beta"), -1);
  assert.equal(U.compareVersions("4.0.0-1", "4.0.0-alpha"), -1, "numeric identifiers sort first");
  assert.equal(U.compareVersions("4.0.0-beta", "4.0.0-beta.1"), -1);
  assert.equal(U.compareVersions("nonsense", "3.0.0"), null);
  assert.equal(U.isNewer("v4.0.0", "3.0.0"), true);
  assert.equal(U.isNewer("v3.0.0", "3.0.0"), false);
  assert.equal(U.isNewer("v2.9.9", "3.0.0"), false);
  assert.equal(U.isNewer("garbage", "3.0.0"), false);
  assert.equal(U.isNewer(`v${APP_VERSION}`), false, "the running version is not an update");
});

await test("the weekly check is off by default and runs at most once a week", () => {
  assert.equal(DEFAULT_SETTINGS.autoUpdateCheck, false, "opt-in");
  assert.equal(normalizeSettings({}).autoUpdateCheck, false);
  const now = Date.UTC(2026, 10, 1);
  assert.equal(U.isCheckDue({ enabled: false, lastCheck: 0, now }), false, "never when off");
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: 0, now }), true, "first check when on");
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now - U.WEEK_MS + 60000, now }), false);
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now - U.WEEK_MS, now }), true);
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now + 3600000, now }), false, "a clock set back is not 'never checked'");
  assert.equal(U.nextCheckAt({ enabled: false, lastCheck: 0, now }), null);
  assert.equal(U.nextCheckAt({ enabled: true, lastCheck: now - 1000, now }), now - 1000 + U.WEEK_MS);
  assert.equal(U.nextCheckAt({ enabled: true, lastCheck: 0, now }), now);
});

await test("host replies become available / current / error / unavailable", () => {
  const ok = { ok: true, latest: "v4.1.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v4.1.0", notes: "New", publishedAt: "2026-11-01T00:00:00Z" };
  assert.deepEqual(U.interpretReply(ok, "4.0.0"), { status: "available", latest: "v4.1.0", current: "4.0.0", url: ok.url, publishedAt: ok.publishedAt, notes: "New" });
  assert.equal(U.interpretReply(ok, "4.1.0").status, "current");
  assert.equal(U.interpretReply(ok, "5.0.0").status, "current", "an older release is not offered");
  assert.deepEqual(U.interpretReply({ ok: false, error: "unavailable" }), { status: "unavailable" });
  assert.deepEqual(U.interpretReply({ ok: false, error: "RateLimited" }), { status: "error", error: "RateLimited" });
  assert.deepEqual(U.interpretReply({ ok: true, latest: "<b>" }), { status: "error", error: "BadResponse" });
  assert.deepEqual(U.interpretReply(null), { status: "error", error: "BadResponse" });
});

await test("without a native host there is no update request and the API says unavailable", async () => {
  assert.equal(globalThis.zero, undefined);
  assert.deepEqual(await Host.checkUpdate(), { ok: false, error: "unavailable" });
  assert.equal(await Host.openReleasePage(), false);
  assert.equal(Host.canCheckUpdates(), false);
  assert.equal(U.canCheckUpdates(), false);
  assert.deepEqual(await U.checkNow(), { status: "unavailable" });
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: true }), null, "the weekly check needs a host");
});

await test("checkNow / autoCheckIfDue ask only when allowed and remember successful checks", async () => {
  const store = new Map();
  const read = (k, fallback) => (store.has(k) ? store.get(k) : fallback);
  const write = (k, v) => store.set(k, v);
  let calls = 0;
  const check = async () => {
    calls++;
    return { ok: true, latest: "v9.0.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v9.0.0", notes: "x" };
  };
  const now = Date.UTC(2026, 10, 1);
  const deps = { check, read, write, hasHost: true, current: "4.0.0" };
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: false }, { ...deps, now }), null);
  assert.equal(await U.autoCheckIfDue({}, { ...deps, now }), null, "missing setting means off");
  assert.equal(calls, 0, "no request while the weekly check is off");
  const first = await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now });
  assert.equal(first.status, "available");
  assert.equal(calls, 1);
  assert.equal(U.loadUpdateState(read).lastCheck, now);
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now: now + 86400000 }), null, "not again the next day");
  assert.equal(calls, 1);
  assert.equal((await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now: now + U.WEEK_MS })).status, "available");
  assert.equal(calls, 2);
  // A failed check does not count as this week's check.
  const failing = { ...deps, check: async () => ({ ok: false, error: "Network" }) };
  const later = now + 3 * U.WEEK_MS;
  assert.deepEqual(await U.checkNow({ ...failing, now: later }), { status: "error", error: "Network" });
  assert.equal(U.loadUpdateState(read).lastCheck, now + U.WEEK_MS);
  const throwing = { ...deps, check: async () => { throw new Error("bridge"); } };
  assert.deepEqual(await U.checkNow({ ...throwing, now: later }), { status: "error", error: "Network" });
});

await test("the native update commands are fixed to this repository", () => {
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  const zig = fs.readFileSync(path.join(root, "src/update.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /"studio\.checkUpdate"/);
  assert.match(main, /"studio\.openReleasePage"/);
  assert.match(zig, /releases_api_url = "https:\/\/api\.github\.com\/repos\/hxddh\/goban-studio\/releases\/latest"/);
  assert.match(zig, /releases_page_url = "https:\/\/github\.com\/hxddh\/goban-studio\/releases\/latest"/);
  // openReleasePage never reads the page's payload.
  const open = main.slice(main.indexOf("fn openReleasePage("), main.indexOf("fn spawnBrowser("));
  assert.match(open, /_ = invocation;/);
  assert.doesNotMatch(open, /payload/);
  // The page itself still cannot reach the network.
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8").replace(/\r\n/g, "\n");
  assert.match(html, /connect-src 'self'/);
  const zon = fs.readFileSync(path.join(root, "app.zon"), "utf8").replace(/\r\n/g, "\n");
  assert.match(zon, /external_links = \.\{ \.action = "deny" \}/);
  for (const key of ["update.check", "update.auto", "update.available", "update.current", "update.error", "update.unavailable", "update.download"]) assert.ok(MESSAGES[key], key);
});

await test("release notes and package READMEs say how the build was really signed", () => {
  const v3 = fs.readFileSync(path.join(root, ".github/release-notes/v3.0.0.md"), "utf8").replace(/\r\n/g, "\n");
  const adhoc = Sign.normalizeStatus("macos", { mode: "adhoc" });
  const unsigned = Sign.normalizeStatus("windows", {});
  const notarized = Sign.normalizeStatus("macos", { mode: "developer-id", notarized: true });
  const signedWin = Sign.normalizeStatus("windows", { mode: "authenticode", timestamped: true });
  const plain = Sign.applyToNotes(v3, adhoc, unsigned);
  assert.match(plain, /Ad-hoc signed, \*\*not notarized\*\*/);
  assert.match(plain, /\*\*Not Authenticode-signed\.\*\*/);
  assert.equal(plain.split("| macOS (Apple Silicon)").length, 2, "one macOS row");
  const signed = Sign.applyToNotes(v3, notarized, signedWin);
  assert.match(signed, /notarized by Apple/);
  assert.match(signed, /\*\*Authenticode-signed\.\*\*/);
  assert.doesNotMatch(signed, /Ad-hoc|Not Authenticode/);
  assert.ok(signed.includes("## Playing"), "the rest of the notes is kept");
  // Markers win; a notes file without the section gets one.
  const marked = Sign.applyToNotes("# T\n\n<!-- first-launch -->\nold\n<!-- /first-launch -->\n\nBody\n", notarized, unsigned);
  assert.match(marked, /<!-- first-launch -->\n\| Platform/);
  assert.doesNotMatch(marked, /\nold\n/);
  assert.match(Sign.applyToNotes("# T\n\nBody\n", adhoc, unsigned), /^# T\n\n## Download and first launch\n\n\| Platform/);
  // "notarized" without Developer ID cannot be claimed.
  assert.equal(Sign.normalizeStatus("macos", { mode: "adhoc", notarized: true }).notarized, false);
  for (const platform of ["macos", "windows"]) {
    const file = path.join(root, `packaging/README-${platform === "macos" ? "macOS" : "Windows"}.txt`);
    const text = fs.readFileSync(file, "utf8");
    const off = Sign.normalizeStatus(platform, {});
    assert.equal(Sign.applyToReadme(text, off), text.replace(/\r\n/g, "\n"), `${platform} unsigned README unchanged`);
    const on = platform === "macos" ? notarized : signedWin;
    const out = Sign.applyToReadme(text, on);
    assert.notEqual(out, text);
    assert.doesNotMatch(out, /ad-hoc signed|not Authenticode-signed/);
    assert.match(out, /Check for updates/, "the README states the one network request");
  }
});

await test("screenshot checks catch blank and repeated screens", () => {
  const make = (w, h, fn) => {
    const png = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * w + x) * 4;
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
    return PNG.sync.read(PNG.sync.write(png));
  };
  const black = make(200, 120, () => [0, 0, 0]);
  const today = make(200, 120, (x, y) => [(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256]);
  const game = make(200, 120, (x, y) => (x > 60 && x < 160 ? [220, 180, 110] : [(x * 11) % 256, (y * 3) % 256, 90]));
  assert.equal(Shots.isBlank(Shots.imageStats(black)), true);
  assert.equal(Shots.isBlank(Shots.imageStats(today)), false);
  assert.equal(Shots.diffFraction(today, today), 0);
  assert.ok(Shots.diffFraction(today, game) > 0.3);
  assert.equal(Shots.diffFraction(today, make(100, 100, () => [1, 2, 3])), 1, "different sizes differ");
  assert.equal(Shots.checkSequence([{ name: "today", png: today }, { name: "game", png: game }]).ok, true);
  const repeated = Shots.checkSequence([{ name: "today", png: today }, { name: "game", png: today }]);
  assert.equal(repeated.ok, false);
  assert.match(repeated.failures[0], /game: same as the previous screen/);
  assert.match(Shots.checkSequence([{ name: "blank", png: black }]).failures[0], /blank/);
  assert.equal(Shots.checkSequence([]).ok, false);
});

await test("the screenshot tour visits five screens and starts only with GOBAN_TOUR_OUT", () => {
  const tour = fs.readFileSync(path.join(root, "src/web/js/tour.js"), "utf8").replace(/\r\n/g, "\n");
  const steps = tour.slice(tour.indexOf("export const STEPS"), tour.indexOf("async function waitForAck"));
  const names = [...steps.matchAll(/name: "([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["play", "game19", "review", "learn", "settings"]);
  for (const fn of ["C.goSpace(", "C.newGame(", "C.reviewCurrentGame(", "C.openSheet(\"settings\")"]) assert.ok(tour.includes(fn), fn);
  const app = fs.readFileSync(path.join(root, "src/web/js/app/app.jsx"), "utf8").replace(/\r\n/g, "\n");
  // v13: one look at the configuration; the tour module loads only when it asks for it.
  assert.match(app, /if \(c\?\.tour\)[^\n]*import\("\.\.\/tour\.js"\)/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /GOBAN_TOUR_OUT/);
  for (const wf of ["build-macos.yml", "build-windows.yml"]) {
    const y = fs.readFileSync(path.join(root, ".github/workflows", wf), "utf8").replace(/\r\n/g, "\n");
    assert.match(y, /scripts\/tour-app\.mjs/, wf);
    assert.match(y, wf.includes("macos") ? /native-screenshots-macos/ : /native-screenshots-windows/, wf);
  }
});

await test("without a native host the install API says unavailable and asks nothing", async () => {
  assert.equal(globalThis.zero, undefined);
  for (const call of [Host.updateStatus, () => Host.updateDownload("v9.0.0"), Host.updateCancel, Host.updateApply]) {
    assert.deepEqual(await call(), { ok: false, error: "unavailable" });
  }
  const info = await U.installInfo();
  assert.equal(info.can, false);
  assert.equal(info.blocked, "Unsupported");
  assert.deepEqual(await U.downloadNow("v9.0.0", { pollMs: 1 }), { ok: false, error: "Unsupported" });
  assert.deepEqual(await U.applyNow(), { ok: false, error: "Unsupported" });
});

await test("install status, download replies and error explanations", () => {
  const s = U.interpretInstallStatus({ ok: true, phase: "downloading", tag: "v5.1.0", received: 50, total: 200, error: "", canInstall: true, blocked: "", justUpdated: false, installFailed: false });
  assert.equal(s.phase, "downloading");
  assert.equal(s.progress, 0.25);
  assert.equal(s.canInstall, true);
  assert.equal(U.interpretInstallStatus({ ok: true, phase: "downloading", received: 5, total: 0 }).progress, null, "unknown size");
  assert.equal(U.interpretInstallStatus({ ok: true, phase: "nonsense" }).phase, "idle");
  const ro = U.interpretInstallStatus({ ok: true, phase: "idle", canInstall: true, blocked: "ReadOnlyLocation" });
  assert.equal(ro.canInstall, false, "a block always wins");
  assert.equal(ro.blocked, "ReadOnlyLocation");
  assert.equal(U.interpretInstallStatus(null).phase, "unavailable");
  assert.equal(U.interpretInstallStatus({ ok: true, justUpdated: true }).justUpdated, true);

  assert.deepEqual(U.interpretDownloadReply({ ok: true, phase: "ready", tag: "v5.1.0", asset: "GobanStudio-macOS-arm64.zip" }), { ok: true, tag: "v5.1.0" });
  assert.deepEqual(U.interpretDownloadReply({ ok: false, error: "ChecksumMismatch" }), { ok: false, error: "ChecksumMismatch" });
  assert.deepEqual(U.interpretDownloadReply({ ok: false, error: "unavailable" }), { ok: false, error: "Unsupported" });
  assert.deepEqual(U.interpretDownloadReply("x"), { ok: false, error: "BadResponse" });

  assert.equal(U.installStatusOf("downloading"), "downloading");
  assert.equal(U.installStatusOf("verifying"), "downloading");
  assert.equal(U.installStatusOf("unpacking"), "downloading");
  assert.equal(U.installStatusOf("ready"), "ready");
  assert.equal(U.installStatusOf("installing"), "installing");
  assert.equal(U.installStatusOf("failed"), null);
  assert.deepEqual(["downloading", "verifying", "unpacking"].map(U.installStepOf), ["download", "verify", "unpack"]);

  // Every error the host can answer is explained in all four languages.
  for (const code of U.INSTALL_ERRORS) {
    const key = U.installMessageKey(code);
    assert.ok(MESSAGES[key], `${code} → ${key}`);
  }
  for (const code of U.INSTALL_BLOCKED) assert.equal(U.installFallsBack(code), true, code);
  for (const code of ["ChecksumMismatch", "NoAsset", "BadPackage"]) assert.equal(U.installFallsBack(code), true, code);
  for (const code of ["Network", "Stalled", "Cancelled", "Disk"]) assert.equal(U.installFallsBack(code), false, `${code} can be retried`);
  assert.equal(U.installMessageKey("ReadOnlyLocation"), "update.readOnly");
  assert.equal(U.installMessageKey("Translocated"), "update.translocated");
  assert.equal(U.formatBytes(512 * 1024), "512 KB");
  assert.equal(U.formatBytes(98.04 * 1024 * 1024), "98.0 MB");
});

await test("a download reports progress until the host answers", async () => {
  const seen = [];
  let polls = 0;
  let finish;
  const download = (tag) => {
    assert.equal(tag, "v5.1.0");
    return new Promise((resolve) => (finish = resolve));
  };
  const status = async () => {
    polls++;
    const phase = polls < 3 ? "downloading" : polls < 4 ? "verifying" : "unpacking";
    if (polls === 5) finish({ ok: true, phase: "ready", tag: "v5.1.0", asset: "x" });
    return { ok: true, phase, tag: "v5.1.0", received: polls * 10, total: 100, canInstall: true };
  };
  const sleep = () => new Promise((r) => setImmediate(r));
  const result = await U.downloadNow("v5.1.0", { download, status, sleep, onProgress: (s) => seen.push([s.phase, s.received]) });
  assert.deepEqual(result, { ok: true, tag: "v5.1.0" });
  assert.deepEqual(seen.slice(0, 4), [
    ["downloading", 10],
    ["downloading", 20],
    ["verifying", 30],
    ["unpacking", 40],
  ]);
  const failed = await U.downloadNow("v5.1.0", { download: async () => ({ ok: false, error: "Stalled" }), status, sleep });
  assert.deepEqual(failed, { ok: false, error: "Stalled" });
  const threw = await U.downloadNow("v5.1.0", {
    download: async () => {
      throw new Error("bridge");
    },
    status,
    sleep,
  });
  assert.deepEqual(threw, { ok: false, error: "Network" });
  assert.deepEqual(await U.applyNow({ apply: async () => ({ ok: true, phase: "installing" }) }), { ok: true });
  assert.deepEqual(await U.applyNow({ apply: async () => ({ ok: false, error: "ReadOnlyLocation" }) }), { ok: false, error: "ReadOnlyLocation" });
});

await test("the interface goes available → downloading → ready → installing through the host", async () => {
  const calls = [];
  let phase = "idle";
  const host = {
    "studio.checkUpdate": () => ({ ok: true, latest: "v99.0.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v99.0.0", notes: "New", publishedAt: "" }),
    "studio.updateStatus": () => ({ ok: true, phase, tag: "v99.0.0", received: 3, total: 6, error: "", canInstall: true, blocked: "", justUpdated: false, installFailed: false }),
    "studio.updateDownload": async (p) => {
      assert.deepEqual(p, { tag: "v99.0.0" }, "the page names only the tag, never a URL");
      phase = "downloading";
      await new Promise((r) => setTimeout(r, 30));
      phase = "ready";
      return { ok: true, phase: "ready", tag: "v99.0.0", asset: "GobanStudio-macOS-arm64.zip" };
    },
    "studio.updateCancel": () => ({ ok: true, phase: "idle" }),
    "studio.updateApply": () => ({ ok: true, phase: "installing" }),
  };
  globalThis.zero = {
    invoke: async (command, payload) => {
      calls.push(command);
      if (!host[command]) throw new Error(`unknown command ${command}`);
      return host[command](payload);
    },
  };
  try {
    const store = await import("../../src/web/js/app/store.js");
    const C = await import("../../src/web/js/app/update-ctl.js");
    store.state.settings = { autoUpdateCheck: false };
    const found = await C.checkForUpdates({ quiet: true });
    assert.equal(found.status, "available");
    assert.deepEqual(found.install, { can: true, blocked: "" });
    const pending = C.downloadUpdate();
    assert.equal(store.state.updateCheck.status, "downloading");
    assert.equal(store.state.updateCheck.notes, "New", "the release notes stay on screen");
    assert.equal((await pending).status, "ready");
    assert.equal(store.state.updateCheck.latest, "v99.0.0");
    // Discarding the download goes back to "available".
    await C.cancelUpdate();
    assert.equal(store.state.updateCheck.status, "available");
    phase = "idle";
    await C.downloadUpdate();
    assert.equal(store.state.updateCheck.status, "ready");
    await C.applyUpdate();
    assert.equal(store.state.updateCheck.status, "installing");
    assert.ok(calls.includes("studio.updateApply"));

    // A read-only installation never downloads: it explains and falls back.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", tag: "", received: 0, total: 0, error: "", canInstall: false, blocked: "ReadOnlyLocation" });
    store.state.updateCheck = null;
    const ro = await C.checkForUpdates({ quiet: true });
    assert.deepEqual(ro.install, { can: false, blocked: "ReadOnlyLocation" });
    const before = calls.filter((c) => c === "studio.updateDownload").length;
    await C.downloadUpdate();
    assert.equal(calls.filter((c) => c === "studio.updateDownload").length, before);

    // A failed download returns to "available" with the reason.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", canInstall: true, blocked: "" });
    host["studio.updateDownload"] = async () => ({ ok: false, error: "ChecksumMismatch" });
    store.state.updateCheck = null;
    await C.checkForUpdates({ quiet: true });
    const bad = await C.downloadUpdate();
    assert.equal(bad.status, "available");
    assert.equal(bad.installError, "ChecksumMismatch");

    // After a restart: the new version says so; a rolled-back one says that.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", canInstall: true, blocked: "", justUpdated: true });
    const restored = await C.restoreUpdateState();
    assert.equal(restored.justUpdated, true);
    assert.ok(store.state.toasts.some((x) => x.message === t("update.installed", [APP_VERSION])));
  } finally {
    delete globalThis.zero;
  }
});

await test("the native install commands are fixed to this repository's release downloads", () => {
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  const zig = fs.readFileSync(path.join(root, "src/install.zig"), "utf8").replace(/\r\n/g, "\n");
  for (const cmd of ["studio.updateStatus", "studio.updateCancel", "studio.updateDownload", "studio.updateApply"]) assert.match(main, new RegExp(`"${cmd.replace(".", "\\.")}"`), cmd);
  assert.match(zig, /download_prefix = "https:\/\/github\.com\/hxddh\/goban-studio\/releases\/download\/"/);
  // The page's payload carries a tag and nothing else; no URL is ever read from it.
  const payload = main.slice(main.indexOf("const DownloadPayload"), main.indexOf("fn updateDownload("));
  assert.match(payload, /tag: \[\]const u8/);
  assert.doesNotMatch(payload, /url|path/i);
  // Every asset this app can install is one the release publishes.
  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  for (const asset of ["GobanStudio-macOS-arm64.zip", "GobanStudio-macOS-x64.zip", "GobanStudio-Windows-x64.zip", "SHA256SUMS"]) {
    assert.ok(zig.includes(`"${asset}"`) || asset === "SHA256SUMS", asset);
    assert.ok(release.includes(asset), `release.yml publishes ${asset}`);
  }
  // The helpers are embedded in the app, not downloaded.
  assert.match(zig, /@embedFile\("updater\/apply-macos\.sh"\)/);
  assert.match(zig, /@embedFile\("updater\/apply-windows\.ps1"\)/);
  for (const key of ["update.install", "update.restart", "update.ready", "update.installed", "update.rolledBack", "update.readOnly"]) assert.ok(MESSAGES[key], key);
});

await test("both platform builds test the update helpers, and an Intel Mac build is released", () => {
  const mac = fs.readFileSync(path.join(root, ".github/workflows/build-macos.yml"), "utf8").replace(/\r\n/g, "\n");
  const win = fs.readFileSync(path.join(root, ".github/workflows/build-windows.yml"), "utf8").replace(/\r\n/g, "\n");
  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  for (const y of [mac, win]) assert.match(y, /scripts\/test-updater\.mjs/);
  assert.match(release, /macos-15-intel/);
  assert.match(release, /GobanStudio-macOS-x64\.dmg/);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  assert.match(readme, /GobanStudio-macOS-x64\.dmg/);
  assert.match(readme, /Windows on ARM/);
  const status = { macos: Sign.normalizeStatus("macos", { mode: "adhoc" }), win: Sign.normalizeStatus("windows", {}) };
  const table = Sign.firstLaunchTable(status.macos, status.win, status.macos);
  assert.match(table, /\| macOS \(Intel\) \| `GobanStudio-macOS-x64\.dmg`/);
  assert.equal(Sign.firstLaunchTable(status.macos, status.win).split("\n").length, 4, "without an Intel status the table keeps its v4 rows");
});

await test("model status replies normalize; the browser preview is unavailable", async () => {
  const none = M.initialModels();
  assert.equal(none.available, false);
  assert.equal(none.human.status, "unavailable");
  assert.equal(none.strong.total, M.MODELS.strong.bytes);
  // No host: no call is made and both kinds are unavailable.
  let called = 0;
  const invoke = async () => {
    called++;
    return {};
  };
  assert.deepEqual(await M.fetchStatus({ hasHost: false, invoke }), none);
  assert.equal((await M.download("human", { hasHost: false, invoke })).ok, false);
  assert.equal(called, 0);
  assert.equal(M.canDownload(), false);

  const raw = {
    available: true,
    human: { status: "downloading", bytes: 49_533_115, total: 99_066_230, idleMs: 31_000, needed: 0, name: "b18c384nbt-humanv0", error: "" },
    strong: { status: "failed", bytes: 0, total: 48_038_914, idleMs: 0, needed: 112_000_000, name: "g170e", error: "DiskFull" },
  };
  const st = M.normalizeStatus(raw);
  assert.equal(st.available, true);
  assert.equal(st.human.status, "downloading");
  assert.equal(st.human.progress, 0.5);
  assert.equal(st.human.stalled, true);
  assert.equal(M.percent(st.human), 50);
  assert.equal(st.strong.error, "DiskFull");
  assert.equal(st.strong.needed, 112_000_000);
  assert.equal(M.needsPolling(st), true);
  assert.equal(M.isInstalled(st, "human"), false);
  // An unknown status or a missing record is "unavailable", never "ready".
  assert.equal(M.normalizeOne("human", { status: "hacked", bytes: 1 }).status, "unavailable");
  assert.equal(M.normalizeStatus({ available: false, human: raw.human }).human.status, "unavailable");
  // Bytes are clamped to the file size; ready is 100 %, nothing else is.
  assert.equal(M.normalizeOne("strong", { status: "partial", bytes: 9e9, total: 100 }).bytes, 100);
  assert.equal(M.percent(M.normalizeOne("strong", { status: "verifying", bytes: 100, total: 100 })), 99);
  assert.equal(M.percent(M.normalizeOne("strong", { status: "ready", bytes: 100, total: 100 })), 100);
});

await test("model actions name a kind only, and report what changed", async () => {
  const calls = [];
  const status = { available: true, human: { status: "downloading", bytes: 0, total: 1 }, strong: { status: "absent", bytes: 0, total: 1 } };
  const invoke = async (command, payload) => {
    calls.push([command, payload]);
    return command === "studio.modelStatus" ? status : { ok: true, models: status };
  };
  const deps = { hasHost: true, invoke };
  assert.equal((await M.download("human", deps)).ok, true);
  await M.cancel("human", deps);
  await M.remove("strong", deps);
  await M.fetchStatus(deps);
  assert.deepEqual(calls, [
    ["studio.modelDownload", { kind: "human" }],
    ["studio.modelCancel", { kind: "human" }],
    ["studio.modelRemove", { kind: "strong" }],
    ["studio.modelStatus", {}],
  ]);
  await assert.rejects(() => M.download("https://example.com/x.bin.gz", deps), /unknown model kind/);
  // A failing host call is an error result, not an exception.
  const broken = await M.download("human", { hasHost: true, invoke: async () => Promise.reject(new Error("x")) });
  assert.deepEqual([broken.ok, broken.error], [false, "Unavailable"]);

  const before = M.normalizeStatus({ available: true, human: { status: "downloading", bytes: 5, total: 10 }, strong: { status: "verifying", bytes: 10, total: 10 } });
  const after = M.normalizeStatus({ available: true, human: { status: "failed", bytes: 5, total: 10, error: "Network" }, strong: { status: "ready", bytes: 10, total: 10 } });
  assert.deepEqual(M.transitions(before, after), [
    { kind: "human", event: "failed" },
    { kind: "strong", event: "ready" },
  ]);
  assert.deepEqual(M.transitions(after, after), []);
  assert.equal(M.errorKey("DiskFull"), "models.error.DiskFull");
  assert.equal(M.errorKey("TlsInitializationFailed"), "models.error.generic");
  for (const e of M.ERROR_KEYS) assert.ok(MESSAGES[`models.error.${e}`], e);
  assert.equal(M.megabytes(99_066_230), "99");
  assert.equal(M.megabytes(9_500_000), "9.5");
});

await test("the downloader fetches only pinned KataGo release files, verified before use", () => {
  const zig = fs.readFileSync(path.join(root, "src/models.zig"), "utf8").replace(/\r\n/g, "\n");
  const urls = [...zig.matchAll(/\.url = "([^"]+)"/g)].map((m) => m[1]);
  // No other address is ever built: every http(s) literal outside the specs is a test value.
  assert.equal([...zig.slice(0, zig.indexOf("// ------------------------------------------------------------------ tests")).matchAll(/"https?:\/\//g)].length, 2);
  assert.deepEqual(urls, [
    "https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz",
    "https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz",
  ]);
  assert.match(zig, /\.sha256 = "637746e44f0efe00ad1245a50aa9bbf0716efe364c43965ead97bd6835d84ab5"/);
  assert.match(zig, /\.sha256 = "09456899f1b9155217f4ca059cf8a68f79b7eba22cf6b7c00ffb7f17ce067967"/);
  assert.match(zig, /\.size = 99_066_230/);
  assert.match(zig, /\.size = 48_038_914/);
  assert.equal(M.MODELS.human.bytes, 99_066_230);
  assert.equal(M.MODELS.strong.bytes, 48_038_914);
  // Only the verified file is renamed into place, inside the models folder.
  assert.match(zig, /if \(!std\.mem\.eql\(u8, &hex, s\.sha256\)\)/);
  assert.match(zig, /renameAbsolute\(part, final/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  for (const name of ["studio.modelStatus", "studio.modelDownload", "studio.modelCancel", "studio.modelRemove"]) assert.ok(main.includes(`"${name}"`), name);
  // The page names a kind; the payload has no URL or path field.
  assert.match(main, /const ModelPayload = struct \{\n    kind: \[\]const u8 = "",\n\};/);
  // The human process: the shipped config, KataGo's human recipe, Black's view.
  const cfg = fs.readFileSync(path.join(root, "engine/model/human.cfg"), "utf8").replace(/\r\n/g, "\n");
  for (const line of ["humanSLChosenMoveProp = 1.0", "humanSLChosenMoveIgnorePass = true", "reportAnalysisWinratesAs = BLACK", "ignorePreRootHistory = false", "allowResignation = false", "ponderingEnabled = false"]) {
    assert.ok(cfg.includes(line), line);
  }
  assert.doesNotMatch(cfg, /humanSLProfile\s*=/, "the profile is set per request");
  const engineZig = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(engineZig, /"-human-model", extra, "-config", resolved\.human_config/);
});

await test("the packaged self-test checks the downloads only when the workflow asks", () => {
  const st = fs.readFileSync(path.join(root, "src/web/js/selftest.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(st, /if \(cfg\.models\) await modelChecks\(checks, report, cfg\)/);
  for (const k of ["modelsResume", "modelsHuman", "modelsStrong", "modelsRemove"]) assert.ok(st.includes(`checks.${k} =`), k);
  const app = fs.readFileSync(path.join(root, "scripts/selftest-app.mjs"), "utf8").replace(/\r\n/g, "\n");
  assert.match(app, /GOBAN_MODELS_DIR: modelsDir/);
  assert.match(app, /fs\.rmSync\(modelsDir/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /GOBAN_SELFTEST_MODELS/);
  assert.match(main, /GOBAN_MODELS_DIR/);
});
