/**
 * The sheets of importing records (controller.js, "Importing SGF"):
 *
 * - SgfGamesSheet: a file with several games. It lists them a page at a
 *   time (a collection can hold a thousand problems; a page is read when
 *   it is shown), each row opening its game; "Import all" brings in every
 *   one.
 * - ImportReportSheet: what an import came to, with every warning and
 *   every file that could not be read, and the way to take it back.
 */
import { useState } from "preact/hooks";
import { t, tn } from "../i18n.js";
import * as C from "./controller.js";
import { Async, Button, Icon, useAsync } from "./parts.jsx";
import { Modal } from "./sheets.jsx";
import { COLLECTION_PAGE, listCollection } from "../play/import.js";

/** A game of the file, named: its players, else "Game 12" (or "Problem 12" for a set-up position). */
function entryTitle(e) {
  if (e.black || e.white) return `${e.black} · ${e.white}`;
  return t(e.setup ? "import.problemN" : "import.gameN", [e.index + 1]);
}

function entryFacts(e) {
  return [e.date, `${e.size} × ${e.size}`, tn("play.moveN", e.moves), e.result ? C.resultText(e.result) : ""].filter(Boolean).join(" · ");
}

export function SgfGamesSheet({ name, texts, head = [] }) {
  const [page, setPage] = useState(0);
  const total = texts.length;
  const pages = Math.ceil(total / COLLECTION_PAGE);
  // Read after a paint, so the sheet is on screen before a large page is parsed.
  const list = useAsync(() => new Promise((resolve) => setTimeout(() => resolve(listCollection(texts, { from: page * COLLECTION_PAGE })), 0)), [page]);
  const first = page * COLLECTION_PAGE + 1;
  const last = Math.min(total, first + COLLECTION_PAGE - 1);
  return (
    <Modal
      title={tn("import.gamesTitle", total)}
      wide
      class="import-sheet"
      footer={
        <>
          <Button kind="ghost" onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" class="primary import-all" onClick={() => C.importAllFromCollection(texts, name, head)}>
            {tn("import.allN", total)}
          </Button>
        </>
      }
    >
      <p class="muted import-help">{t("import.gamesHelp", [name])}</p>
      <div class="import-list">
        <Async state={list} label={t("import.reading")} error={t("library.importError")}>
          {(v) => (
            <ol class="group import-games">
              {v.entries.map((e) => (
                <li>
                  {e.error ? (
                    <div class="group-row import-row bad">
                      <span class="import-n">{e.index + 1}</span>
                      <span class="gr-text">
                        <strong>{t("import.gameN", [e.index + 1])}</strong>
                        <span>{t("import.unreadableGame")}</span>
                      </span>
                    </div>
                  ) : (
                    <button type="button" class="group-row import-row" onClick={() => C.importFromCollection(texts, name, e.index)}>
                      <span class="import-n">{e.index + 1}</span>
                      <span class="gr-text">
                        <strong>{entryTitle(e)}</strong>
                        <span>{entryFacts(e)}</span>
                      </span>
                      <span class="row-continue">
                        {t("import.open")}
                        <Icon name="next" size={14} />
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Async>
      </div>
      {pages > 1 && (
        <div class="pager" role="group" aria-label={t("import.pages")}>
          <Button kind="ghost" size="sm" icon="prev" disabled={page === 0} onClick={() => setPage(page - 1)} title={t("import.prevPage")} />
          <span class="fine">{t("import.range", [first, last, total])}</span>
          <Button kind="ghost" size="sm" icon="next" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} title={t("import.nextPage")} />
        </div>
      )}
    </Modal>
  );
}

export function ImportReportSheet({ summary, undoable = true }) {
  const said = [summary.imported ? tn("import.done", summary.imported) : "", summary.failed ? tn("import.failedN", summary.failed) : ""].filter(Boolean).join(t("a11y.sentence"));
  return (
    <Modal
      title={t("import.reportTitle")}
      class="import-sheet"
      footer={
        <>
          {undoable && summary.ids.length > 0 && (
            <Button kind="ghost" class="undo-import" onClick={() => C.undoImport(summary.ids)}>
              {t("import.undo")}
            </Button>
          )}
          <Button kind="primary" class="primary" onClick={C.closeSheet}>
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      {said && <p class="import-help">{said}</p>}
      <ul class="import-notes">
        {summary.notes.map((n) => (
          <li class={n.tone}>
            <Icon name={n.tone === "error" ? "error" : "warning"} size={16} />
            <span>
              {n.name && <strong>{n.name}</strong>}
              <span>{n.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
