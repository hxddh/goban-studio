/**
 * Shell: what the app says back (app/store.js toasts and tasks,
 * app/feedback.jsx, app/shortcuts.js, app/debug.js) — toasts with four
 * tones, a duration that follows the text, one action and a reason for
 * closing; tasks that show only when slow and offer Retry when they fail;
 * a content part that cannot be fetched; the error boundary's fallback and
 * the one toast for an error nobody caught; deleting a game with Undo; a
 * reset or a clear that could not remove a file; the one table of
 * shortcuts; and the test handles that stay off `window` in the real app.
 * The controller runs in Node with a minimal window.
 */
import { mock } from "node:test";
import { test, assert, bundle, fs, path, root, sleep, Game, TEARDOWN_EXPORTS, register } from "./helpers.mjs";

const had = { window: globalThis.window, document: globalThis.document, matchMedia: globalThis.matchMedia, fetch: globalThis.fetch, zero: globalThis.zero };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { documentElement: { dataset: {}, lang: "" }, hidden: false, getElementById: () => null };
globalThis.window = { requestIdleCallback: () => 0 };

const LINES = [
  'export * as C from "./src/web/js/app/controller.js";',
  'export * as Store from "./src/web/js/app/store.js";',
  'export * as F from "./src/web/js/app/feedback.jsx";',
  'export * as P from "./src/web/js/app/parts.jsx";',
  'export * as K from "./src/web/js/app/shortcuts.js";',
  'export * as D from "./src/web/js/app/debug.js";',
  'export * as Games from "./src/web/js/data/games.js";',
  'export * as Content from "./src/web/js/content.js";',
  'export { store } from "./src/web/js/data/store.js";',
  'export { COMMANDS, menuSpec } from "./src/web/js/app/app.jsx";',
  'export { SHEET_KINDS } from "./src/web/js/app/sheets.jsx";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
];
const A = await bundle(LINES);
const { C, Store, F, P, K, D, Games, store, t } = A;
const { state, toast } = Store;
/** Let update()'s microtask and any promise chain settle. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const finished = (result = "B+R") => {
  const g = new Game({ size: 9 });
  g.play(2, 2);
  g.play(6, 6);
  g.setResult(result);
  return g;
};
const quiet = async (fn) => {
  const saved = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
};

try {
  await C.boot();
  A.setLang("en");
  state.sheet = null;

  /* ------------------------------------------------------------ toasts */

  await test("toasts: four tones, and the old calls keep working (\"warn\" is a warning, an unknown tone is info)", () => {
    state.toasts = [];
    assert.deepEqual(Store.TOAST_TONES, ["info", "success", "warning", "error"]);
    const ids = [toast("a"), toast("b", "success"), toast("c", "warn")];
    assert.ok(ids.every((id) => Number.isInteger(id)), "toast() returns the id");
    assert.deepEqual(state.toasts.map((x) => x.tone), ["info", "success", "warning"]);
    state.toasts = [];
    toast("d", "error", 5000, { key: "store" }); // the store's call, as before
    toast("e", "neon");
    toast("f", "warning", { key: "k" }); // options as the third argument
    assert.deepEqual(state.toasts.map((x) => [x.message, x.tone, x.key]), [["d", "error", "store"], ["e", "info", null], ["f", "warning", "k"]]);
    assert.ok(state.toasts.every((x) => x.action === null));
    state.toasts = [];
  });

  await test("toasts: the time on screen follows the text; an action gets eight seconds; an error stays until dismissed", () => {
    const d = Store.toastDuration;
    assert.equal(d("Saved"), 3000, "never under three seconds");
    const long = "The update could not be installed because the app is running from a read-only location, so nothing was changed.";
    assert.ok(d(long) > 8000 && d(long) <= 15000, `a long sentence stays longer: ${d(long)}`);
    assert.ok(d("x".repeat(85)) > 7000, `85 characters are no longer cut at 2.6 s: ${d("x".repeat(85))}`);
    assert.ok(d("无法把更改存到磁盘，现在退出可能会丢失最近的更改。") > 4500, "a CJK sentence counts for what it says, not its length in characters");
    assert.equal(d("Deleted", { action: { label: "Undo", run() {} } }), 8000);
    assert.equal(d("Saved", { ms: 7000 }), 7000, "a caller can ask for longer");
    assert.equal(d("Saved", { ms: 100 }), 3000, "never for shorter");
    assert.equal(d("Export failed", { tone: "error", ms: 6000 }), Infinity);
  });

  await test("toasts: they time out, pause while pointed at or focused, and say why they closed", async () => {
    state.toasts = [];
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    try {
      const why = [];
      toast("Saved", "success", { onClose: (r) => why.push(["saved", r]) });
      toast("Export failed", "error", { onClose: (r) => why.push(["failed", r]) });
      mock.timers.tick(2999);
      assert.equal(state.toasts.length, 2);
      mock.timers.tick(1);
      assert.deepEqual(state.toasts.map((x) => x.message), ["Export failed"], "the success went; the error stays");
      mock.timers.tick(60000);
      assert.equal(state.toasts.length, 1, "an error does not time out");
      assert.equal(Store.dismissToast(state.toasts[0].id), true);
      assert.equal(Store.dismissToast(12345), false);
      assert.deepEqual(why, [["saved", "timeout"], ["failed", "dismiss"]]);
      // Paused: nothing times out; resumed: at least a moment is left to read it.
      toast("Saved again");
      mock.timers.tick(2900);
      Store.pauseToasts();
      mock.timers.tick(30000);
      assert.equal(state.toasts.length, 1, "paused");
      toast("And one more"); // a toast that arrives while paused waits too
      mock.timers.tick(30000);
      assert.equal(state.toasts.length, 2);
      Store.resumeToasts();
      mock.timers.tick(1499);
      assert.equal(state.toasts.length, 2, "not gone the instant the pointer leaves");
      mock.timers.tick(1);
      assert.deepEqual(state.toasts.map((x) => x.message), ["And one more"]);
      mock.timers.tick(3000);
      assert.equal(state.toasts.length, 0);
    } finally {
      mock.timers.reset();
      Store.resumeToasts();
      state.toasts = [];
    }
  });

  await test("toasts: one per key (or the newest with replace), at most three on screen, and one action that closes the toast", () => {
    state.toasts = [];
    const why = [];
    const first = toast("one", "error", { key: "k", onClose: (r) => why.push(["one", r]) });
    assert.equal(toast("two", "error", { key: "k" }), null, "the same key again is not shown");
    assert.equal(state.toasts.length, 1);
    const third = toast("three", "info", { key: "k", replace: true });
    assert.deepEqual(state.toasts.map((x) => x.message), ["three"]);
    assert.deepEqual(why, [["one", "replaced"]]);
    assert.notEqual(first, third);
    assert.equal(Store.dismissToastKey("k"), true);
    assert.equal(Store.dismissToastKey("k"), false);
    // The oldest makes room.
    for (const m of ["a", "b", "c", "d", "e"]) toast(m, "error", { onClose: (r) => why.push([m, r]) });
    assert.deepEqual(state.toasts.map((x) => x.message), ["c", "d", "e"]);
    assert.equal(Store.TOAST_MAX, 3);
    assert.deepEqual(why.slice(1), [["a", "replaced"], ["b", "replaced"]]);
    state.toasts = [];
    // The action: the toast goes first, then the action runs, once.
    let ran = 0;
    const closed = [];
    const id = toast("Game deleted", "info", { action: { label: "Undo", run: () => (ran += state.toasts.length === 0 ? 1 : 100) }, onClose: (r) => closed.push(r) });
    assert.deepEqual(state.toasts[0].action.label, "Undo");
    Store.runToastAction(id);
    Store.runToastAction(id);
    assert.equal(ran, 1);
    assert.deepEqual(closed, ["action"]);
    assert.equal(toast("x", "info", { action: { label: "", run() {} } }) > 0 && state.toasts.at(-1).action, null, "an action needs a label and a function");
    state.toasts = [];
  });

  await test("toasts: spoken once — by the announcer, with the action's name; an error speaks for itself (role=alert)", async () => {
    state.toasts = [];
    await sleep(60); // whatever the checks before this one said has been spoken
    toast("Game deleted", "info", { action: { label: "Undo", run() {} } });
    await sleep(60);
    assert.equal(state.announce, "Game deleted. Undo");
    toast("Export failed", "error");
    await sleep(60);
    assert.equal(state.announce, "Game deleted. Undo", "an error is not sent through the announcer as well");
    // A caller that announces what its toast says (the computer passed) is still heard once.
    toast("The computer passed");
    Store.announce("The computer passed");
    Store.announce("Black to play");
    await sleep(60);
    assert.equal(state.announce, "The computer passed. Black to play");
    // What draws them (feedback.jsx): an alert for an error, a status that is not live for the rest.
    const src = fs.readFileSync(path.join(root, "src/web/js/app/feedback.jsx"), "utf8");
    assert.match(src, /role=\{error \? "alert" : "status"\}/);
    assert.match(src, /aria-live=\{error \? undefined : "off"\}/);
    state.toasts = [];
  });

  /* ------------------------------------------------------------- tasks */

  await test("tasks: a quick one shows nothing; a slow one shows its label after 300 ms; a failure offers Retry", async () => {
    state.tasks = [];
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      assert.equal(Store.TASK_DELAY, 300);
      // Quick.
      assert.equal(await Store.runTask("quick", async () => 7, { label: "Loading…" }), 7);
      mock.timers.tick(1000);
      assert.deepEqual(state.tasks, []);
      // Slow.
      let done;
      const slow = Store.runTask("slow", () => new Promise((r) => (done = r)), { label: "Opening this game…" });
      mock.timers.tick(299);
      assert.equal(Store.taskOf("slow"), null, "nothing yet");
      mock.timers.tick(1);
      assert.deepEqual(Store.taskOf("slow"), { key: "slow", status: "loading", label: "Opening this game…" });
      done("there");
      assert.equal(await slow, "there");
      assert.equal(Store.taskOf("slow"), null);
      // Failing, then retried.
      let n = 0;
      const flaky = async () => {
        if (++n === 1) throw new Error("offline");
        return "ok";
      };
      const out = await quiet(() => Store.runTask("flaky", flaky, { label: "Loading…", error: "Couldn't load this." }));
      assert.equal(out, undefined, "a failure resolves with undefined: it never rejects");
      const failed = Store.taskOf("flaky");
      assert.deepEqual([failed.status, failed.message, typeof failed.retry], ["error", "Couldn't load this.", "function"]);
      mock.timers.tick(1000);
      assert.equal(Store.taskOf("flaky").status, "error", "the error stays (no late spinner over it)");
      assert.equal(await failed.retry(), "ok");
      assert.equal(Store.taskOf("flaky"), null, "a retry that works clears the error");
      // A value can be a failure (a read that answers null).
      await quiet(() => Store.runTask("null", async () => null, { failed: (v) => v == null, error: "nope" }));
      assert.equal(Store.taskOf("null").status, "error");
      Store.dismissTask("null");
      assert.equal(Store.taskOf("null"), null);
      // A function that throws at once is a failure too.
      await quiet(() => Store.runTask("sync", () => { throw new Error("now"); }));
      assert.equal(Store.taskOf("sync").status, "error");
      Store.clearTaskErrors();
      assert.deepEqual(state.tasks, []);
    } finally {
      mock.timers.reset();
      state.tasks = [];
    }
  });

  await test("tasks: opening a game whose file cannot be read says so, with Retry, instead of doing nothing", async () => {
    state.tasks = [];
    state.toasts = [];
    const rec = Games.saveGame(finished(), { name: "unreadable" });
    await store.flush();
    const realLoad = store.load;
    const realIsLoaded = store.isLoaded;
    let fail = true;
    // The file is on disk, not read yet, and the read fails (then works).
    store.isLoaded = (key) => (key === Games.gameKey(rec.id) ? !fail && realIsLoaded.call(store, key) : realIsLoaded.call(store, key));
    store.load = async (key) => {
      if (key === Games.gameKey(rec.id) && fail) throw new Error("ReadFailed");
      return realLoad.call(store, key);
    };
    try {
      await quiet(() => C.openRecord(rec.id));
      const task = Store.taskOf("game:" + rec.id);
      assert.equal(task?.status, "error");
      assert.equal(task.message, t("task.gameFailed"));
      assert.equal(state.review, null, "nothing opened");
      fail = false;
      await task.retry();
      await settle();
      assert.equal(Store.taskOf("game:" + rec.id), null);
      assert.equal(state.review?.meta.recordId, rec.id, "a Retry that works opens the game that was clicked");
    } finally {
      store.load = realLoad;
      store.isLoaded = realIsLoaded;
      state.tasks = [];
      state.toasts = [];
      if (state.review) C.dropReview();
      Games.deleteGame(rec.id);
    }
  });

  /* ------------------------------------------------------------ errors */

  await test("errors: a child that throws renders the error card (Try again, Go to Today); another page tries again", async () => {
    await quiet(async () => {
      F.resetErrorReports();
      state.toasts = [];
      const seen = [];
      const b = new F.ErrorBoundary({ children: "the page", resetKey: "play", onError: (e) => seen.push(e.message) });
      b.props = { children: "the page", resetKey: "play", onError: (e) => seen.push(e.message) };
      assert.equal(b.render(), "the page", "children as they are while nothing is wrong");
      // Preact calls these when a descendant throws while rendering.
      const boom = new Error("title is not defined");
      Object.assign(b.state, F.ErrorBoundary.getDerivedStateFromError(boom));
      b.componentDidCatch(boom);
      assert.deepEqual(seen, ["title is not defined"]);
      assert.equal(F.errorLog.at(-1).source, "render");
      assert.equal(state.toasts.length, 0, "the card says it: no toast on top");
      const page = b.render();
      assert.match(page.props.class, /error-page/);
      const card = page.props.children;
      assert.equal(card.type, P.ErrorCard);
      assert.equal(card.props.title, t("error.page.title"));
      assert.equal(card.props.body, t("error.page.body"));
      assert.deepEqual(card.props.actions.map((a) => [a.label, !!a.primary]), [["Try again", true], ["Go to Today", false]]);
      // Try again: the children are rendered again.
      let next = null;
      b.setState = (s) => (next = s);
      card.props.actions[0].onClick();
      assert.deepEqual(next, { error: null });
      // Go to Today: nothing left open, and the children again.
      state.space = "practice";
      state.sheet = { kind: "settings" };
      state.menu = "x";
      state.practice = { ...state.practice, view: "problem" };
      next = null;
      card.props.actions[1].onClick();
      await settle();
      assert.deepEqual([state.space, state.sheet, state.menu, state.practice.view, state.play.view], ["today", null, null, "home", "home"]);
      assert.deepEqual(next, { error: null });
      // Another page (resetKey changed): tried again without asking.
      next = null;
      b.props = { ...b.props, resetKey: "today" };
      b.componentDidUpdate({ resetKey: "play" });
      assert.deepEqual(next, { error: null });
      next = null;
      b.componentDidUpdate({ resetKey: "today" });
      assert.equal(next, null, "the same page: the card stays");
      // A fallback of its own (a sheet shows nothing and closes itself).
      const s = new F.ErrorBoundary({});
      s.props = { fallback: null, children: "sheet" };
      s.state = { error: boom };
      assert.equal(s.render(), null);
      // The whole app: the card fills the window.
      const whole = new F.ErrorBoundary({});
      whole.props = { scope: "app" };
      whole.state = { error: boom };
      assert.match(whole.render().props.class, /whole/);
    });
  });

  await test("errors: the error card is one component: title, body, actions; compact for a section", () => {
    const full = P.ErrorCard({ title: "T", body: "B", actions: [{ label: "Retry", onClick() {}, primary: true }] });
    assert.equal(full.props.role, "alert");
    assert.doesNotMatch(full.props.class, /compact/);
    const compact = P.ErrorCard({ body: "B", compact: true });
    assert.match(compact.props.class, /compact/);
    // <Async> draws a useAsync state: nothing while quick, a line when slow, the card with Retry on failure.
    assert.equal(P.Async({ state: { status: "loading", slow: false }, children: () => "x" }), null);
    assert.equal(P.Async({ state: { status: "loading", slow: true }, label: "Loading games…", children: () => "x" }).type, P.Loading);
    assert.equal(P.Async({ state: { status: "ready", value: 3 }, children: (v) => v + 1 }), 4);
    let retried = 0;
    const err = P.Async({ state: { status: "error", retry: () => retried++ }, error: "Couldn't load your games.", children: () => "x" });
    assert.equal(err.type, P.ErrorCard);
    assert.equal(err.props.body, "Couldn't load your games.");
    err.props.actions[0].onClick();
    assert.equal(retried, 1);
    assert.equal(P.ASYNC_DELAY, 300);
  });

  await test("errors: an error nobody caught is one toast — not one per error, not while it is up, not for browser noise — and never fatal", async () => {
    await quiet(async () => {
      F.resetErrorReports();
      state.toasts = [];
      const listeners = {};
      F.installErrorHandlers({ addEventListener: (name, fn) => (listeners[name] = fn) });
      assert.deepEqual(Object.keys(listeners).sort(), ["error", "unhandledrejection"]);
      let prevented = 0;
      listeners.error({ error: new Error("x is not defined"), message: "x is not defined" });
      listeners.unhandledrejection({ reason: new Error("fetch failed"), preventDefault: () => prevented++ });
      listeners.unhandledrejection({ reason: "a string" });
      listeners.error({ message: "ResizeObserver loop completed with undelivered notifications." });
      listeners.error({ message: "Script error." });
      assert.equal(prevented, 1);
      assert.equal(state.toasts.length, 1, "one toast for the burst");
      assert.deepEqual([state.toasts[0].tone, state.toasts[0].message, state.toasts[0].key], ["error", t("error.unexpected"), "unexpected"]);
      assert.deepEqual(F.errorLog.map((e) => [e.source, e.message]), [["error", "x is not defined"], ["promise", "fetch failed"], ["promise", "a string"]], "all of them are logged; the noise is not");
      // Dismissed, and another error at once: still within the gap, so no second toast.
      const t0 = Date.now();
      Store.dismissToastKey("unexpected");
      assert.equal(F.reportError(new Error("again"), { now: t0 + 1000 }), false);
      assert.equal(state.toasts.length, 0);
      // After the gap: said again.
      assert.equal(F.reportError(new Error("later"), { now: t0 + F.ERROR_TOAST_GAP + 1000 }), true);
      assert.equal(state.toasts.length, 1);
      // A boundary reports quietly.
      Store.dismissToastKey("unexpected");
      assert.equal(F.reportError(new Error("render"), { quiet: true, now: t0 + 60000 }), false);
      assert.equal(state.toasts.length, 0);
      state.toasts = [];
      F.resetErrorReports();
    });
  });

  await test("errors: every string of the error surfaces exists in four languages", () => {
    for (const lang of ["zh", "en", "ko", "ja"]) {
      A.setLang(lang);
      for (const key of ["error.unexpected", "error.sheet", "error.page.title", "error.page.body", "error.tryAgain", "error.goToday", "common.retry", "common.undoAction", "library.deleted", "task.loading", "task.failed", "task.contentFailed", "task.openingGame", "task.gameFailed", "toast.region", "safe.resetFailed", "clear.failed", "clear.failedMore"]) {
        const text = t(key, ["a", "b"]);
        assert.ok(text && text !== key, `${lang}: ${key}`);
      }
    }
    A.setLang("en");
  });

  /* ---------------------------------------------- delete, with an undo */

  await test("library: deleting a game removes it at once and offers Undo; Undo brings it back; no Undo makes it final", async () => {
    state.toasts = [];
    const a = Games.saveGame(finished("B+R"), { name: "first" });
    const b = Games.saveGame(finished("W+R"), { name: "second" });
    await store.flush();
    const names = () => Games.listGames().map((g) => g.name).sort();
    assert.deepEqual(names(), ["first", "second"]);

    C.deleteRecord(a.id);
    assert.equal(state.sheet, null, "no confirmation sheet");
    assert.deepEqual(names(), ["second"], "gone at once");
    assert.equal(state.toasts.length, 1);
    const shown = state.toasts[0];
    assert.deepEqual([shown.message, shown.tone, shown.action.label], [t("library.deleted"), "info", t("common.undoAction")]);
    assert.equal(store.has(Games.gameKey(a.id)), true, "the file waits for the undo");
    Store.runToastAction(shown.id);
    assert.deepEqual(names(), ["first", "second"], "Undo: back");
    assert.equal(state.toasts.length, 0);
    assert.equal(Games.trashedGame(), null);

    // Deleted again, and the toast goes (time, the close button): final.
    C.deleteRecord(a.id);
    Store.dismissToast(state.toasts[0].id, "timeout");
    assert.equal(store.has(Games.gameKey(a.id)), false, "the file is deleted");
    assert.deepEqual(names(), ["second"]);

    // Two deletes in a row: one toast, for the newest; the first is final.
    const c = Games.saveGame(finished("B+2.5"), { name: "third" });
    C.deleteRecord(b.id);
    C.deleteRecord(c.id);
    assert.equal(state.toasts.length, 1, "one toast, replaced");
    assert.equal(store.has(Games.gameKey(b.id)), false, "the delete before is final");
    assert.equal(Games.trashedGame(), c.id);
    Store.runToastAction(state.toasts[0].id);
    assert.deepEqual(names(), ["third"]);
    assert.equal(store.has(Games.gameKey(c.id)), true);

    // A game that is not there: nothing happens.
    C.deleteRecord("missing");
    assert.equal(state.toasts.length, 0);
    Games.deleteGame(c.id);
    // Clear all data and restoring a backup still ask first.
    const ctl = fs.readFileSync(path.join(root, "src/web/js/app/controller.js"), "utf8");
    for (const fn of ["clearData", "offerRestore", "undoRestore"]) {
      const at = ctl.indexOf(`export function ${fn}(`);
      assert.match(ctl.slice(at, ctl.indexOf("\n}\n", at)), /confirmAction\(\{[^]*danger: true/, `${fn} asks first`);
    }
  });

  /* --------------------------------------------------------- shortcuts */

  await test("shortcuts: one table for the key handler, the menu bar and the shortcuts sheet", () => {
    const rows = K.shortcutRows({ mod: "⌘", shift: "⇧", t });
    const text = Object.fromEntries(rows);
    // Every command of the table exists, and every one is on the sheet.
    for (const sc of K.SHORTCUTS) {
      assert.ok(sc.command in A.COMMANDS, sc.command);
      assert.ok(sc.group || text[K.keyText(sc, "⌘", "⇧")] === t(sc.label), `${sc.command} is listed`);
      assert.ok(t(sc.label) !== sc.label, `${sc.label} is a string`);
    }
    // The ones the sheet used to leave out.
    assert.equal(text["⌘S"], t("play.save"));
    assert.equal(text["⇧⌘R"], t("play.reviewSoFar"));
    assert.equal(text["⇧⌘E"], "Export SGF");
    assert.equal(text["⌘O"], "Import SGF");
    assert.equal(text["⌘1 – 4"], "Today / Play / Practice / Library");
    assert.equal(text["⌘[  ⌘]"], "Back / forward");
    for (const p of K.PLAIN_KEYS) assert.equal(text[p.keys], t(p.label));
    assert.equal(rows.length, new Set(rows.map((r) => r[0])).size, "no key twice");
    // On Windows the same rows read Ctrl+…
    assert.ok(K.shortcutRows({ mod: "Ctrl+", shift: "Shift+", t }).some(([k]) => k === "Shift+Ctrl+P"));
    // The sheet renders that table and nothing of its own.
    const sheets = fs.readFileSync(path.join(root, "src/web/js/app/sheets.jsx"), "utf8");
    assert.match(sheets, /shortcutRows\(\{ mod: MOD, shift: SHIFT, t \}\)/);
    assert.doesNotMatch(sheets, /\$\{MOD\}[A-Z]`/, "no shortcut is written out in the sheet");
    // The menu bar takes its keys from the table too.
    for (const menu of A.menuSpec()) {
      for (const item of menu.items) {
        if (!item.key) continue;
        const sc = K.shortcutFor(item.command);
        assert.ok(sc, `${item.command} has a key in the menu, so it is in the table`);
        assert.deepEqual([item.key, !!item.shift], [sc.key, !!sc.shift], item.command);
      }
    }
    // And every shortcut the menu bar can show is shown there.
    const inMenus = new Set(A.menuSpec().flatMap((m) => m.items.filter((i) => i.key).map((i) => i.command)));
    for (const sc of K.SHORTCUTS) assert.ok(inMenus.has(sc.command) || sc.command === "game.undo" || sc.command === "game.redo", `${sc.command} is in a menu`);
  });

  await test("shortcuts: what a key press means depends on the sheet and the text field, as before", () => {
    const m = (key, shiftKey, ctx) => K.matchShortcut({ key, shiftKey: !!shiftKey }, ctx)?.command ?? null;
    assert.equal(m("n"), "file.new");
    assert.equal(m("N"), "file.new", "Caps Lock makes no difference");
    assert.equal(m("n", true), null, "⇧⌘N is not ⌘N");
    assert.equal(m("p", true), "game.pass");
    assert.equal(m("p"), null);
    assert.equal(m("/"), "help.shortcuts");
    assert.equal(m("?", true), "help.shortcuts");
    assert.equal(m("s"), "game.save");
    assert.equal(m("e", true), "file.export");
    assert.equal(m("r", true), "game.review");
    assert.equal(m("x"), null);
    // With a sheet open: the ones that open or go somewhere still work; the game's do not.
    const sheet = { sheet: true };
    assert.deepEqual(["n", "o", ",", "[", "]", "/"].map((k) => m(k, false, sheet)), ["file.new", "file.import", "app.settings", "go.back", "go.forward", "help.shortcuts"]);
    assert.deepEqual(["s", "z", ".", "1", "4"].map((k) => m(k, false, sheet)), [null, null, null, null, null]);
    assert.equal(m("p", true, sheet), null);
    // While typing in a field: ⌘Z and ⌘S belong to the field.
    const typing = { typing: true };
    assert.deepEqual(["z", "s"].map((k) => m(k, false, typing)), [null, null]);
    assert.deepEqual([".", "2", "n"].map((k) => m(k, false, typing)), ["view.focus", "go.play", "file.new"]);
    assert.deepEqual(K.menuKey("game.pass"), { key: "p", shift: true });
    assert.deepEqual(K.menuKey("file.new"), { key: "n" });
    assert.deepEqual(K.menuKey("game.resign"), {});
  });

  await test("shortcuts: Save does nothing outside Play (the game is not on screen there)", async () => {
    state.toasts = [];
    C.newGame({ size: 9, opponent: "human", handicap: 0 });
    state.game.game.play(2, 2);
    const before = Games.listGames().length;
    for (const space of ["today", "practice", "library"]) {
      state.space = space;
      A.COMMANDS["game.save"]();
    }
    assert.equal(Games.listGames().length, before, "nothing saved from another space");
    assert.equal(state.toasts.length, 0, "and nothing said");
    state.space = "play";
    A.COMMANDS["game.save"]();
    assert.equal(Games.listGames().length, before + 1, "saved in Play");
    assert.equal(state.toasts.at(-1).tone, "success");
    state.toasts = [];
  });

  /* ---------------------------------------------------------- handles */

  await test("test handles: only in a browser a test drives, or with ?test — never in the app a person runs", () => {
    const win = (webdriver, search = "") => ({ navigator: { webdriver }, location: { search } });
    assert.equal(D.testHandles(win(true)), true);
    assert.equal(D.testHandles(win(false)), false);
    assert.equal(D.testHandles(win(undefined)), false);
    assert.equal(D.testHandles(win(false, "?test")), true);
    assert.equal(D.testHandles(win(false, "?lang=en&test=1")), true);
    assert.equal(D.testHandles(win(false, "?testing")), false);
    assert.equal(D.testHandles(null), false);
    assert.equal(D.testHandles({ get navigator() { throw new Error("no"); } }), false);
    // Nothing writes a handle to window except through expose().
    const js = path.join(root, "src/web/js");
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "content" || e.name === "content-lazy" ? [] : walk(path.join(dir, e.name))) : /\.jsx?$/.test(e.name) && e.name !== "bundle.js" ? [path.join(dir, e.name)] : []));
    for (const f of walk(js)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /window\.__\w+\s*=[^=]/, path.relative(js, f));
    // In Node's fake window (not a driven browser) expose() leaves it alone.
    D.expose("__probe", 1);
    assert.equal("__probe" in globalThis.window, false);
  });

  await test("sheets: the kinds a test must open are the kinds the app has", () => {
    assert.deepEqual([...A.SHEET_KINDS].sort(), ["confirm", "importReport", "level", "newGame", "onboarding", "rename", "settings", "sgfGames", "shortcuts"]);
  });
} finally {
  mock.timers.reset();
}

/* --------------------------------- a content part that cannot be fetched */

await test("content: a click that needs a part not here yet waits for it; a failed fetch is an error with Retry, and Retry carries on", async () => {
  // The app's bundle: content split into an index and parts fetched later (scripts/bundle.mjs).
  const esbuild = await import("esbuild");
  const Split = await import("../../src/web/js/content-split.js");
  const Problems = await import("../../src/web/js/content/problems.js");
  const split = Split.splitContent({
    course: (await import("../../src/web/js/content/course.js")).COURSE,
    problems: Problems.PROBLEMS,
    themes: Problems.THEMES,
    shapes: Problems.SHAPES,
    grades: JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8")),
    classics: (await import("../../src/web/js/content/classics.js")).CLASSICS,
  });
  const out = await esbuild.build({
    stdin: { contents: ['export * as C from "./src/web/js/app/controller.js";', 'export * as Store from "./src/web/js/app/store.js";', 'export * as Content from "./src/web/js/content.js";', 'export { t } from "./src/web/js/i18n.js";', ...TEARDOWN_EXPORTS, "export const BUNDLE = 'lazy';"].join("\n"), resolveDir: root, loader: "js" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".json": "json" },
    plugins: [Split.indexPlugin(Split.indexModules(split.index))],
    write: false,
    logLevel: "error",
  });
  const L = register(await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")));
  const calls = [];
  let online = false;
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (!online) throw new TypeError("Failed to fetch");
    const part = /content\/(\w+)\.json$/.exec(url)[1];
    return { ok: true, status: 200, json: async () => split.bodies[part] };
  };
  await L.C.boot();
  const st = L.Store.state;
  st.sheet = null;
  assert.equal(L.Content.loaded("classics"), false, "the classics' records are not in the start-up script");
  const first = L.Content.CLASSICS[0];
  assert.ok(!first.sgf, "only the index is here");

  // Offline: the click is not a silent no-op.
  await quiet(() => L.C.openClassic(first.id));
  assert.deepEqual(calls, ["content/classics.json"]);
  assert.equal(st.review, null, "nothing opened");
  const task = L.Store.taskOf("content:classics");
  assert.deepEqual([task?.status, task?.message], ["error", L.t("task.contentFailed")]);
  // Retry while still offline: still an error, asked again.
  await quiet(() => task.retry());
  assert.equal(L.Store.taskOf("content:classics").status, "error");
  assert.equal(calls.length, 2, "the next use asks again");
  // Back online: Retry loads the part and opens what was clicked.
  online = true;
  await L.Store.taskOf("content:classics").retry();
  assert.equal(L.Store.taskOf("content:classics"), null);
  assert.equal(L.Content.loaded("classics"), true);
  assert.equal(st.review?.meta.classicId, first.id, "the classic that was clicked opens");
  L.C.dropReview();

  // A slow part shows that it is loading after 300 ms; a quick one shows nothing.
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let arrive;
    globalThis.fetch = (url) => new Promise((r) => (arrive = () => r({ ok: true, status: 200, json: async () => split.bodies[/content\/(\w+)\.json$/.exec(url)[1]] })));
    let ran = 0;
    const waiting = L.Content.withContent("course", () => ++ran);
    mock.timers.tick(299);
    assert.equal(L.Store.taskOf("content:course"), null);
    mock.timers.tick(1);
    assert.deepEqual([L.Store.taskOf("content:course")?.status, L.Store.taskOf("content:course")?.label], ["loading", L.t("task.loading")]);
    assert.equal(ran, 0);
    arrive();
    assert.equal(await waiting, 1, "withContent resolves with what f returned");
    assert.equal(L.Store.taskOf("content:course"), null);
    // Here already: f runs at once, with no task at all.
    assert.equal(L.Content.withContent("course", () => "now"), "now");
  } finally {
    mock.timers.reset();
  }
  // A status that is not ok is a failure too.
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  let ran = false;
  await quiet(() => L.Content.withContent("problems", () => (ran = true)));
  assert.equal(ran, false);
  assert.equal(L.Store.taskOf("content:problems").status, "error");
  st.tasks = [];
});

/* ------------------------------- a file that could not be removed is named */

await test("data safety: Start over and Clear data that cannot remove a file say which one, and can be tried again", async () => {
  // A host whose files live in a Map, and whose removals can be made to fail.
  const files = new Map([
    ["settings.json", '{"lang":"en","onboarded":true, BROKEN'],
    ["profile.json", JSON.stringify({ v: 13 })],
  ]);
  const enc = (text) => ({ b64: Buffer.from(text, "utf8").toString("base64"), size: Buffer.byteLength(text) });
  let failRemove = () => false;
  // (host.js looks for the bridge on window.)
  globalThis.window.zero = {
    on: () => () => {},
    invoke: async (command, p) => {
      if (command === "studio.storeList") return [...files.keys()].filter((k) => k.startsWith(p.prefix || ""));
      if (command === "studio.storeRead") return files.has(p.key) ? enc(files.get(p.key)) : null;
      if (command === "studio.storeWrite") {
        files.set(p.key, (p.offset ? files.get(p.key) || "" : "") + Buffer.from(p.b64, "base64").toString("utf8"));
        return true;
      }
      if (command === "studio.storeRemove") {
        if (failRemove(p.key)) throw new Error("AccessDenied");
        files.delete(p.key);
        return true;
      }
      if (command === "studio.katagoStatus") return { available: false };
      return null;
    },
  };
  const B = await bundle(LINES);
  let reloads = 0;
  B.C.setReloader(() => reloads++);
  await quiet(async () => {
    await B.C.boot();
    const st = B.Store.state;
    assert.equal(st.storeProblem?.resettable, true, "the damaged settings file can be started over");
    assert.equal(st.storeProblem.resetFailed ?? null, null);

    // Start over, but the file cannot be removed: it says which, and nothing reloads.
    failRemove = (key) => key === "settings.json";
    assert.equal(await B.C.resetDamaged(), false);
    assert.deepEqual(st.storeProblem.resetFailed, ["settings.json"]);
    assert.equal(reloads, 0);
    assert.equal(B.store.readOnly, true, "back in the safe state: still nothing written");
    assert.match(B.t("safe.resetFailed", ["Settings"]), /Settings couldn't be removed/);
    // Tried again once it can be removed: the message goes and the app starts afresh.
    failRemove = () => false;
    assert.equal(await B.C.resetDamaged(), true);
    assert.equal(reloads, 1);
    assert.equal(files.has("settings.json"), false);
    assert.equal(files.has("profile.json"), true, "the rest is kept");

    // Clear data: one file refuses.
    st.toasts = [];
    B.store.put("games/a1.json", { id: "a1", sgf: "(;)" });
    await B.store.flush();
    failRemove = (key) => key === "profile.json";
    await B.C.clearDataNow();
    assert.equal(reloads, 1, "no fresh start over half-deleted data");
    assert.equal(st.toasts.length, 1, "one toast (not the store's own as well)");
    const said = st.toasts[0];
    assert.equal(said.tone, "error");
    assert.match(said.message, /profile\.json/, "it names the file");
    assert.equal(said.action.label, B.t("common.retry"));
    assert.equal(files.has("profile.json"), true);
    // Retry, now that it can be removed.
    failRemove = () => false;
    B.Store.runToastAction(said.id);
    await sleep(20);
    assert.equal(reloads, 2);
    assert.equal([...files.keys()].filter((k) => !k.startsWith("bad/")).length, 0, "everything is gone");
    assert.equal(st.toasts.length, 0);
  });
});

delete globalThis.window.zero;
for (const [k, v] of Object.entries(had)) {
  if (v === undefined) delete globalThis[k];
  else globalThis[k] = v;
}
