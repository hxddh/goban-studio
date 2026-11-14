/**
 * Handles for the interface tests (scripts/ui-test.mjs reads window.__state,
 * __board, __solver and __autoAnalyse).
 *
 * They exist only in a browser a test drives: one that says so itself
 * (navigator.webdriver, which Playwright's Chromium sets and the app's own
 * WebView never does), or a page opened with `?test` in its address. In
 * the app a person runs, nothing is put on `window`.
 */
export function testHandles(win = typeof window !== "undefined" ? window : null) {
  if (!win) return false;
  try {
    return win.navigator?.webdriver === true || /[?&]test(=|&|$)/.test(win.location?.search || "");
  } catch (_) {
    return false;
  }
}

/** Put `value` on window under `name`, for the tests only. */
export function expose(name, value) {
  if (testHandles()) window[name] = value;
}

/**
 * Component renders, for the tests: `{ total, by: { Name: n }, batches,
 * reset() }`. `batches` counts the store's notifications (`subscribe`).
 * Preact calls its render hook (`options.__r`, the name its own hooks use)
 * before each component renders.
 */
export function renderCounter(options, subscribe) {
  const counts = {
    total: 0,
    by: {},
    batches: 0,
    reset() {
      counts.total = 0;
      counts.by = {};
      counts.batches = 0;
    },
  };
  const hooks = /** @type {any} */ (options);
  const prev = hooks.__r;
  hooks.__r = (vnode) => {
    counts.total++;
    const name = vnode.type?.displayName || vnode.type?.name || "?";
    counts.by[name] = (counts.by[name] || 0) + 1;
    if (prev) prev(vnode);
  };
  subscribe(() => counts.batches++);
  return counts;
}
