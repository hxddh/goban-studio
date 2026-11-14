/**
 * The sheet on screen (state.sheet): each kind is a module of its own (the
 * New game sheet, Settings, onboarding, the shortcuts, the import sheets);
 * the two small ones every place uses, a confirmation and a rename, are here.
 */
import { useState } from "preact/hooks";
import { t } from "../i18n.js";
import { AREA_SLICES, state, toast, update, useSlice } from "./store.js";
import * as C from "./controller.js";
import { Button } from "./parts.jsx";
import { CrashProbe, ErrorBoundary } from "./feedback.jsx";
import { ImportReportSheet, SgfGamesSheet } from "./import-sheet.jsx";
import { NewGameSheet } from "./new-game-sheet.jsx";
import { LevelSheet, SettingsSheet } from "./settings-sheet.jsx";
import { Onboarding } from "./onboarding.jsx";
import { ShortcutsSheet } from "./shortcuts-sheet.jsx";
import { Modal } from "./modal.jsx";

/** Every kind of sheet: `state.sheet.kind` → its component. */
const SHEETS = { newGame: NewGameSheet, settings: SettingsSheet, level: LevelSheet, onboarding: Onboarding, shortcuts: ShortcutsSheet, confirm: ConfirmSheet, rename: RenameSheet, sgfGames: SgfGamesSheet, importReport: ImportReportSheet };
export const SHEET_KINDS = Object.keys(SHEETS);

/** A sheet that cannot render closes itself and says so; the app behind it stays usable. */
function sheetFailed() {
  update({ sheet: null });
  toast(t("error.sheet"), "error", { key: "sheet" });
}

export function Sheets() {
  // A sheet may show the area under it (the game, the review): it follows the same slices as the page.
  useSlice(...AREA_SLICES);
  const sheet = state.sheet;
  if (!sheet) return null;
  const Comp = SHEETS[sheet.kind];
  if (!Comp) return null;
  return (
    <ErrorBoundary resetKey={sheet} fallback={null} onError={sheetFailed}>
      <CrashProbe at="sheet" />
      <Comp {...sheet} />
    </ErrorBoundary>
  );
}

/* ---------------------------------------------------------------- confirm */

/**
 * A question before an action. A dangerous one (delete, replace) starts
 * with Cancel focused, so Enter or Space alone never confirms it.
 */
function ConfirmSheet({ title, body, confirm, danger, onConfirm }) {
  return (
    <Modal
      title={title}
      footer={
        <>
          <Button kind="ghost" data-autofocus={danger ? true : undefined} data-confirm-cancel onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button
            kind={danger ? "danger-solid" : "primary"}
            class="primary"
            data-autofocus={danger ? undefined : true}
            onClick={() => {
              update({ sheet: null });
              onConfirm?.();
            }}
          >
            {confirm || t("common.confirm")}
          </Button>
        </>
      }
    >
      {body ? <p class="muted">{body}</p> : null}
    </Modal>
  );
}

function RenameSheet({ id, name }) {
  const [value, setValue] = useState(name || "");
  const save = () => {
    C.renameRecord(id, value.trim());
    update({ sheet: null });
  };
  const title = t("library.rename");
  return (
    <Modal
      title={title}
      footer={
        <>
          <Button kind="ghost" onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <input
        class="text-input"
        type="text"
        data-autofocus
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        maxLength={120}
        aria-label={title}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          // Enter saves, but not the Enter that confirms an input method's candidate.
          if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
          // (Prevented: the focus goes back to the menu's button as the sheet
          // closes, and the same key press would open the menu again.)
          e.preventDefault();
          save();
        }}
      />
    </Modal>
  );
}
