/**
 * What the app shows instead of starting over (docs/storage.md, "Safe state").
 *
 * - BootError: the packaged app started without its bridge to the host
 *   (no files can be read or written). Retry reloads the page.
 * - StoreProblem: a file the app needs at start (settings, the player
 *   model, the game on the board) could not be read, or the list of files
 *   itself. Nothing is written (data/store.js read-only) and no onboarding
 *   is shown; the player chooses Retry, Continue read-only, or, when every
 *   such file was merely damaged and a copy of it is kept, Start these
 *   files over.
 * - ReadOnlyBanner: after Continue read-only, a line that says changes are
 *   not saved, with Retry.
 */
import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Button } from "./parts.jsx";

/** The file names a person recognises, in their language. */
function fileName(key) {
  if (key === "settings.json") return t("data.file.settings");
  if (key === "profile.json") return t("data.file.profile");
  if (key === "current.json") return t("data.file.current");
  return key;
}

/** @param {{ title: any, children?: any, actions?: any }} props */
function Screen({ title, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("[data-autofocus]")?.focus({ preventScroll: true });
  }, []);
  return (
    // The page's main landmark (the screen replaces the whole app), the card its dialog.
    <main class="safe-screen" id="main" ref={ref}>
      <div class="safe-card" role="alertdialog" aria-modal="true" aria-labelledby="safe-title" aria-describedby="safe-body">
        <h1 id="safe-title">{title}</h1>
        <div id="safe-body">{children}</div>
        <div class="safe-actions">{actions}</div>
      </div>
    </main>
  );
}

export function BootError() {
  return (
    <Screen
      title={t("bridge.title")}
      actions={
        <Button kind="primary" class="primary" data-autofocus onClick={C.retryStore}>
          {t("common.retry")}
        </Button>
      }
    >
      <p class="muted">{t("bridge.body")}</p>
    </Screen>
  );
}

export function StoreProblem() {
  const p = state.storeProblem;
  const body = p.kind === "list" ? t("safe.list") : p.newer ? t("safe.newer") : t("safe.files");
  return (
    <Screen
      title={t("safe.title")}
      actions={
        <>
          <Button kind="primary" class="primary" data-autofocus data-safe="retry" onClick={C.retryStore}>
            {t("common.retry")}
          </Button>
          <Button data-safe="readonly" onClick={C.continueReadOnly}>
            {t("safe.readOnly")}
          </Button>
          {p.resettable && (
            <Button kind="ghost" data-safe="reset" onClick={C.resetDamaged}>
              {t("safe.reset")}
            </Button>
          )}
        </>
      }
    >
      <p>{body}</p>
      {p.failed.length > 0 && (
        <ul class="safe-files">
          {p.failed.map((f) => (
            <li>
              <strong>{fileName(f.key)}</strong> <span class="fine">({f.key})</span>
              {f.preserved && <span class="fine"> · {t("safe.copied", [f.preserved])}</span>}
            </li>
          ))}
        </ul>
      )}
      {p.resetFailed && (
        // Start over could not remove a file: which one, and that it can be tried again.
        <p class="error-line" role="alert" data-safe="reset-failed">
          {t("safe.resetFailed", [p.resetFailed.map(fileName).join(t("list.comma"))])}
        </p>
      )}
      <p class="muted">{t("safe.nothingWritten")}</p>
      {p.resettable && <p class="fine">{t("safe.resetHelp")}</p>}
    </Screen>
  );
}

export function ReadOnlyBanner() {
  return (
    <div class="safe-banner" role="status">
      <span>{t("safe.banner")}</span>
      <button type="button" class="link" data-safe="banner-retry" onClick={C.retryStore}>
        {t("common.retry")}
      </button>
    </div>
  );
}
