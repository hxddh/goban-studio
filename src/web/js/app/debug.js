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
