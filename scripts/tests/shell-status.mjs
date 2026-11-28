/**
 * Shell: the sidebar's status line (app/status-chip.jsx). An update that
 * is ready, a download in progress or an update to download is said
 * outside Settings, one thing at a time, with the pane that handles it.
 */
import { test, assert, bundle } from "./helpers.mjs";

const { statusOf, setLang, t, initialModels, offerHuman, normalizeSettings } = await bundle([
  'export { statusOf } from "./src/web/js/app/status-chip.jsx";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
  'export { initialModels, offerHuman } from "./src/web/js/models.js";',
  'export { normalizeSettings } from "./src/web/js/data/settings.js";',
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
  assert.deepEqual([model.kind, model.pane, model.text], ["modelDownloading", "engines", t("status.downloading", [7])]);
  assert.equal(statusOf({ updateCheck: null, models: models({ strong: { status: "verifying", progress: 1 } }) }).kind, "modelDownloading");
  const there = statusOf({ updateCheck: { status: "available", latest: "14.0.0" }, models: models() });
  assert.deepEqual([there.kind, there.pane, there.text], ["updateAvailable", "about", t("status.updateAvailable")]);
});

await test("shell status: what needs the player comes first", () => {
  const busy = models({ human: { status: "downloading", progress: 0.5 } });
  assert.equal(statusOf({ updateCheck: { status: "ready" }, models: busy }).kind, "updateReady");
  assert.equal(statusOf({ updateCheck: { status: "available" }, models: busy }).kind, "modelDownloading", "a download in progress before an update that only waits");
});

await test("the human-style model is offered in one line only where it can be downloaded, until it is installed or the line is closed", () => {
  const one = (status) => ({ ...initialModels(), available: true, human: { ...initialModels().human, status } });
  assert.equal(offerHuman(initialModels()), false, "the browser preview cannot download");
  assert.equal(offerHuman(one("absent")), true);
  assert.equal(offerHuman(one("partial")), true, "a download to resume");
  assert.equal(offerHuman(one("failed")), true, "a download to retry");
  assert.equal(offerHuman(one("downloading")), true, "the line shows the progress");
  assert.equal(offerHuman(one("ready")), false, "installed: nothing to offer");
  assert.equal(offerHuman(one("absent"), true), false, "closed once, closed for good");
  // The choice is a setting like the others: kept, and only true or false.
  assert.equal(normalizeSettings({}).humanHintDismissed, false);
  assert.equal(normalizeSettings({ humanHintDismissed: true }).humanHintDismissed, true);
  assert.equal(normalizeSettings({ humanHintDismissed: "yes" }).humanHintDismissed, false);
});
