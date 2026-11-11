/**
 * Shell: the sidebar's status line (app/status-chip.jsx). An update that
 * is ready, a download in progress or an update to download is said
 * outside Settings, one thing at a time, with the pane that handles it.
 */
import { test, assert, bundle } from "./helpers.mjs";

const { statusOf, setLang, t, initialModels } = await bundle([
  'export { statusOf } from "./src/web/js/app/status-chip.jsx";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
  'export { initialModels } from "./src/web/js/models.js";',
]);
setLang("en");
const models = (patch = {}) => ({ ...initialModels(), ...patch });

await test("shell status: nothing to say, nothing shown", () => {
  assert.equal(statusOf({ updateCheck: null, models: models() }), null);
  assert.equal(statusOf({ updateCheck: { status: "current" }, models: models() }), null);
  assert.equal(statusOf({ updateCheck: { status: "checking" }, models: models() }), null);
  assert.equal(statusOf({ updateCheck: { status: "error", error: "x" }, models: models() }), null);
  assert.equal(statusOf({}), null);
});

await test("shell status: an update ready, being downloaded or there to download opens About; a network being downloaded opens Playing", () => {
  const ready = statusOf({ updateCheck: { status: "ready" }, models: models() });
  assert.deepEqual([ready.kind, ready.pane, ready.text], ["updateReady", "about", t("status.updateReady")]);
  const down = statusOf({ updateCheck: { status: "downloading", progress: 0.426 }, models: models() });
  assert.deepEqual([down.kind, down.pane, down.text], ["updateDownloading", "about", t("status.downloading", [42])]);
  assert.equal(down.text, "Downloading 42%");
  assert.equal(statusOf({ updateCheck: { status: "downloading", progress: null }, models: models() }).text, t("status.downloadingUpdate"));
  assert.equal(statusOf({ updateCheck: { status: "downloading", progress: 1 }, models: models() }).text, t("status.downloading", [99]), "never 100% before it is ready");
  const model = statusOf({ updateCheck: null, models: models({ human: { status: "downloading", progress: 0.07 } }) });
  assert.deepEqual([model.kind, model.pane, model.text], ["modelDownloading", "playing", t("status.downloading", [7])]);
  assert.equal(statusOf({ updateCheck: null, models: models({ strong: { status: "verifying", progress: 1 } }) }).kind, "modelDownloading");
  const there = statusOf({ updateCheck: { status: "available", latest: "14.0.0" }, models: models() });
  assert.deepEqual([there.kind, there.pane, there.text], ["updateAvailable", "about", t("status.updateAvailable")]);
});

await test("shell status: what needs the player comes first", () => {
  const busy = models({ human: { status: "downloading", progress: 0.5 } });
  assert.equal(statusOf({ updateCheck: { status: "ready" }, models: busy }).kind, "updateReady");
  assert.equal(statusOf({ updateCheck: { status: "available" }, models: busy }).kind, "modelDownloading", "a download in progress before an update that only waits");
});
