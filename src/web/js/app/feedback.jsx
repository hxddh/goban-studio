/**
 * What the app says back: toasts, the notice of a task in progress, and
 * what it shows when something breaks.
 *
 * - <Toasts>: store.js toast(), drawn. Four tones, a close button, at most
 *   one action; paused while pointed at or focused.
 * - <TaskNotice>: store.js runTask(), drawn at the top of the page: the
 *   label with a spinner once the task is slow, the error with Retry when
 *   it failed.
 * - <ErrorBoundary>: a view that throws while rendering is replaced by an
 *   <ErrorCard> (Try again, Go to Today) instead of leaving half a screen;
 *   around a sheet (`onError`, `fallback={null}`) the sheet closes itself
 *   and a toast says so.
 * - installErrorHandlers(): an error nobody caught (an event handler, a
 *   promise) is logged and shown as one toast; the app carries on.
 */
import { Component } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n.js";
import { clearTaskErrors, dismissTask, dismissToast, pauseToasts, resumeToasts, runToastAction, state, toast, update } from "./store.js";
import { ErrorCard, Icon, Spinner } from "./parts.jsx";
import * as C from "./controller.js";

/* ------------------------------------------------------------- toasts */

const TONE_ICON = { success: "check", warning: "warning", error: "error" };

function Toast({ x }) {
  const error = x.tone === "error";
  return (
    <div
      class={`toast ${x.tone} ${x.action ? "has-action" : ""}`}
      data-tone={x.tone}
      // Spoken once: an error as an alert; the rest by the announcer (store.js toast).
      role={error ? "alert" : "status"}
      aria-live={error ? undefined : "off"}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        dismissToast(x.id);
      }}
    >
      {TONE_ICON[x.tone] && <Icon name={TONE_ICON[x.tone]} size={16} />}
      <span class="toast-text">{x.message}</span>
      {x.action && (
        <button type="button" class="toast-action" onClick={() => runToastAction(x.id)}>
          {x.action.label}
        </button>
      )}
      <button type="button" class="dismiss-btn" aria-label={t("common.close")} title={t("common.close")} onClick={() => dismissToast(x.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

/*
 * A toast sits over the bottom of the page, where the board's last rows
 * can be. A plain message (no action, not an error) therefore lets clicks
 * through to what is under it; its close button, and the whole of a toast
 * with an action or an error, take the pointer (styles.css). Pausing while
 * pointed at works for all of them: it follows the pointer's position
 * rather than the element under it.
 */
export function Toasts() {
  const ref = useRef(null);
  const any = state.toasts.length > 0;
  useEffect(() => {
    // A toast that goes while it is focused or pointed at must not leave the rest paused.
    if (!any) return resumeToasts();
    const over = (e) => {
      const el = ref.current;
      if (!el) return;
      const inside = [...el.children].some((c) => {
        const r = c.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (inside) pauseToasts();
      else if (!el.contains(document.activeElement)) resumeToasts();
    };
    document.addEventListener("pointermove", over);
    return () => document.removeEventListener("pointermove", over);
  }, [any]);
  if (!any) return null;
  return (
    <div
      class="toasts"
      ref={ref}
      role="region"
      aria-label={t("toast.region")}
      onFocusIn={pauseToasts}
      onFocusOut={(e) => !e.currentTarget.contains(e.relatedTarget) && resumeToasts()}
    >
      {state.toasts.map((x) => (
        <Toast x={x} key={x.id} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- tasks */

/** Tasks that are slow or failed (store.js runTask), at the top of the page. */
export function TaskNotice() {
  // Somewhere else now: what failed back there is no longer the question.
  useEffect(() => clearTaskErrors, [state.space]);
  const shown = state.tasks.filter((x) => x.status === "loading" || x.status === "error");
  if (!shown.length) return null;
  return (
    <div class="task-notices">
      {shown.map((x) =>
        x.status === "loading" ? (
          <div class="task-notice" role="status" data-task={x.key} key={x.key}>
            <Spinner />
            <span>{x.label || t("task.loading")}</span>
          </div>
        ) : (
          <div class="task-notice error" role="alert" data-task={x.key} key={x.key}>
            <Icon name="error" size={16} />
            <span>{x.message || t("task.failed")}</span>
            <button type="button" class="link" data-task-retry onClick={x.retry}>
              {t("common.retry")}
            </button>
            <button type="button" class="dismiss-btn" aria-label={t("common.close")} title={t("common.close")} onClick={() => dismissTask(x.key)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------- errors */

/** Seen by the tests and a bug report: the last few errors, newest last. */
export const errorLog = [];
let lastToastAt = 0;
/** At most one "something went wrong" toast in this long, however many errors. */
export const ERROR_TOAST_GAP = 5000;

/** Errors a browser raises that are not the app failing. */
const NOISE = /ResizeObserver loop|Script error\.?$/;

/**
 * Log an error nobody handled and, unless `quiet` (a boundary is already
 * showing it), say so in one toast: not again while that toast is up, and
 * not more often than ERROR_TOAST_GAP.
 */
export function reportError(error, { source = "error", quiet = false, now = Date.now() } = {}) {
  const message = String(error?.message || error || "");
  if (NOISE.test(message)) return false;
  errorLog.push({ source, message, at: now });
  if (errorLog.length > 20) errorLog.shift();
  try {
    console.error(`${source}:`, error);
  } catch (_) {}
  if (quiet || now - lastToastAt < ERROR_TOAST_GAP) return false;
  try {
    if (toast(t("error.unexpected"), "error", { key: "unexpected" }) == null) return false;
    lastToastAt = now;
    return true;
  } catch (_) {
    return false;
  }
}

/** Tests start from a clean slate. */
export function resetErrorReports() {
  errorLog.length = 0;
  lastToastAt = 0;
}

/** window "error" and "unhandledrejection": reported, never fatal. */
export function installErrorHandlers(win = window) {
  win.addEventListener("error", (e) => {
    // A script or image that failed to load is an event on its element, not an app error.
    if (e.target && e.target !== win && !e.error && !e.message) return;
    reportError(e.error || e.message, { source: "error" });
  });
  win.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, { source: "promise" });
    e.preventDefault?.();
  });
}

/** Back to Today with nothing open: the one place that is always there. */
export function goToday() {
  try {
    if (state.review) C.dropReview();
  } catch (_) {
    state.review = null;
  }
  update((s) => {
    s.space = "today";
    s.sheet = null;
    s.menu = null;
    s.learn = { ...s.learn, view: "home" };
    s.play = { ...s.play, view: "home", explorer: null };
  });
  C.syncMenus();
}

/*
 * For the interface tests only (app.jsx exposes crashRender under
 * debug.js's rule, so nothing can call it in the app a person runs): the
 * next render of the page or of the open sheet throws, once, so a test
 * sees what a person would see when a view breaks.
 */
let crashAt = null;
export function crashRender(at) {
  crashAt = at;
  update();
}
export function CrashProbe({ at }) {
  if (crashAt !== at) return null;
  crashAt = null;
  throw new Error(`render error (${at})`);
}

/**
 * Children, or what to show when rendering them threw.
 *
 *   resetKey   when it changes (another page), the children are tried again
 *   onError    called with the error (a sheet closes itself here)
 *   fallback   what to show instead of the default <ErrorCard>; null for nothing
 *   scope      "page" (default) or "app": the card fills the window
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    reportError(error, { source: "render", quiet: true });
    this.props.onError?.(error);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    if ("fallback" in this.props) return this.props.fallback;
    const retry = () => this.setState({ error: null });
    return (
      <div class={`error-page ${this.props.scope === "app" ? "whole" : ""}`}>
        <ErrorCard
          data-error-card
          title={t("error.page.title")}
          body={t("error.page.body")}
          actions={[
            { label: t("error.tryAgain"), onClick: retry, primary: true },
            {
              label: t("error.goToday"),
              onClick: () => {
                goToday();
                retry();
              },
            },
          ]}
        />
      </div>
    );
  }
}
