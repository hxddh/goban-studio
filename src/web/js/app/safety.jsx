/**
 * v13: what the app shows instead of starting over (docs/storage.md, "Safe state").
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
  if (key === "settings.json") return t("v13.file.settings");
  if (key === "profile.json") return t("v13.file.profile");
  if (key === "current.json") return t("v13.file.current");
  return key;
}

function Screen({ title, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("[data-autofocus]")?.focus({ preventScroll: true });
  }, []);
  return (
    <div class="safe-screen" role="alertdialog" aria-modal="true" aria-labelledby="safe-title" aria-describedby="safe-body" ref={ref}>
      <div class="safe-card">
        <h1 id="safe-title">{title}</h1>
        <div id="safe-body">{children}</div>
        <div class="safe-actions">{actions}</div>
      </div>
    </div>
  );
}

export function BootError() {
  return (
    <Screen
      title={t("v13.bridge.title")}
      actions={
        <Button kind="primary" class="primary" data-autofocus onClick={C.retryStore}>
          {t("v13.retry")}
        </Button>
      }
    >
      <p class="muted">{t("v13.bridge.body")}</p>
    </Screen>
  );
}

export function StoreProblem() {
  const p = state.storeProblem;
  const body = p.kind === "list" ? t("v13.safe.list") : p.newer ? t("v13.safe.newer") : t("v13.safe.files");
  return (
    <Screen
      title={t("v13.safe.title")}
      actions={
        <>
          <Button kind="primary" class="primary" data-autofocus data-safe="retry" onClick={C.retryStore}>
            {t("v13.retry")}
          </Button>
          <Button data-safe="readonly" onClick={C.continueReadOnly}>
            {t("v13.safe.readOnly")}
          </Button>
          {p.resettable && (
            <Button kind="ghost" data-safe="reset" onClick={C.resetDamaged}>
              {t("v13.safe.reset")}
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
              {f.preserved && <span class="fine"> · {t("v13.safe.copied", [f.preserved])}</span>}
            </li>
          ))}
        </ul>
      )}
      <p class="muted">{t("v13.safe.nothingWritten")}</p>
      {p.resettable && <p class="fine">{t("v13.safe.resetHelp")}</p>}
    </Screen>
  );
}

export function ReadOnlyBanner() {
  return (
    <div class="safe-banner" role="status">
      <span>{t("v13.safe.banner")}</span>
      <button type="button" class="link" data-safe="banner-retry" onClick={C.retryStore}>
        {t("v13.retry")}
      </button>
    </div>
  );
}
