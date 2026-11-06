/**
 * Shell: the in-app update in the interface (app/update-ctl.js) with a fake
 * host, and where its last check is kept (update.json in the store).
 */
import { test, assert, bundle, sleep } from "./helpers.mjs";

async function until(fn, ms = 8000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(3);
  }
}

const A = await bundle([
  'export * as Upd from "./src/web/js/app/update-ctl.js";',
  'export * as U from "./src/web/js/update.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { store } from "./src/web/js/data/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
]);
const { Upd, U, state, store } = A;
// The store picks its backend on first use: the preview's, before the fake host below.
await store.open();
state.settings = { ...A.DEFAULT_SETTINGS, lang: "en" };

await test("shell update: a download cancelled and started again is not undone by the first one's late answer", async () => {
  const deferred = [];
  const host = {
    "studio.checkUpdate": () => ({ ok: true, latest: "v99.0.0", url: "", notes: "New", publishedAt: "" }),
    "studio.updateStatus": () => ({ ok: true, phase: "idle", canInstall: true, blocked: "" }),
    "studio.updateDownload": () => new Promise((resolve) => deferred.push(resolve)),
    "studio.updateCancel": () => ({ ok: true, phase: "idle" }),
  };
  const saved = globalThis.zero;
  globalThis.zero = { on: () => () => {}, invoke: async (c, p) => host[c](p) };
  try {
    state.updateCheck = null;
    assert.equal((await Upd.checkForUpdates({ quiet: true })).status, "available");
    const first = Upd.downloadUpdate();
    await until(() => deferred.length === 1, 2000, "first download");
    await Upd.cancelUpdate();
    assert.equal(state.updateCheck.status, "available");
    const second = Upd.downloadUpdate();
    await until(() => deferred.length === 2, 2000, "second download");
    assert.equal(state.updateCheck.status, "downloading");
    // The host answers the cancelled download late.
    deferred[0]({ ok: false, error: "Cancelled" });
    await first;
    assert.equal(state.updateCheck.status, "downloading", "the second download is still on screen");
    assert.equal(state.updateCheck.installError, undefined);
    deferred[1]({ ok: true, phase: "ready", tag: "v99.0.0" });
    await second;
    assert.equal(state.updateCheck.status, "ready", "and its answer counts");
  } finally {
    globalThis.zero = saved;
    state.updateCheck = null;
  }
});

await test("shell update: the last check is one small file in the store, read back on the next launch", async () => {
  assert.equal(U.UPDATE_KEY, "update.json");
  const check = async () => ({ ok: true, latest: "v1.0.0", url: "u", notes: "", publishedAt: "p" });
  await U.checkNow({ check, now: 1234, current: "1.0.0" });
  assert.deepEqual(store.get("update.json"), { lastCheck: 1234, lastResult: { status: "current", latest: "v1.0.0", url: "u", publishedAt: "p" } });
  assert.equal(U.loadUpdateState().lastCheck, 1234);
  // A failed check does not reset the week.
  await U.checkNow({ check: async () => ({ ok: false, error: "Network" }), now: 9999, current: "1.0.0" });
  assert.equal(U.loadUpdateState().lastCheck, 1234);
});
