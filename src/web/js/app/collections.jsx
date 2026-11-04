/**
 * v7: your own problem collections in Practice. A section at the foot of
 * Practice home, and a collection page: its problems (same cards, progress
 * and review dates as the built-in topics), the one primary action
 * (Practise), and the import report with every entry's verdict.
 */
import { coordLabel } from "../rules.js";
import { t } from "../i18n.js";
import { hasNative } from "../host.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Button, GradeDots, Icon, MoreMenu, Stone } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";

const label = (p, size) => coordLabel(p.x, p.y, size);
const lineText = (line, size) => line.map((m) => label(m, size)).join(" ");

function menuItems(c) {
  return [
    { icon: "edit", label: t("v7problems.rename"), onClick: () => C.askRenameCollection(c.id) },
    { icon: "download", label: t("common.exportSgf"), onClick: () => C.exportCollection(c.id) },
    "-",
    { icon: "trash", label: t("common.delete"), danger: true, onClick: () => C.deleteCollection(c.id) },
  ];
}

function ImportButtons() {
  const busy = !!state.problemImport;
  return (
    <div class="actions wrap collections-actions">
      <Button icon="upload" size="sm" onClick={() => C.pickProblemImport()} disabled={busy}>
        {t("v7problems.import")}
      </Button>
      {!hasNative() && (
        <Button kind="ghost" size="sm" onClick={() => C.pickProblemImport({ folder: true })} disabled={busy}>
          {t("v7problems.importFolder")}
        </Button>
      )}
      {busy && (
        <span class="fine" role="status">
          {t("v7problems.importing", [state.problemImport.done + 1 > state.problemImport.total ? state.problemImport.total : state.problemImport.done + 1, state.problemImport.total])}
        </span>
      )}
    </div>
  );
}

/** Practice home: the section listing your collections. */
export function YourCollections() {
  const list = C.loadCollections();
  return (
    <section class="section collections-section">
      <h2 class="section-title">{t("v7problems.section")}</h2>
      {list.length ? (
        <ul class="group collections">
          {list.map((c) => {
            const s = C.collectionStats(c);
            return (
              <li class="game-item collection-item">
                <button type="button" class="group-row" onClick={() => C.openCollection(c.id)}>
                  <span class="gr-icon">
                    <Icon name="grid" size={18} />
                  </span>
                  <span class="gr-text">
                    <strong>{c.name}</strong>
                    <span>
                      {t("v7problems.count", [s.total])}
                      {s.due ? ` · ${t("v7problems.due", [s.due])}` : ""}
                    </span>
                  </span>
                  <span class="mini-progress" aria-hidden="true">
                    <i style={{ width: `${s.total ? (s.solved / s.total) * 100 : 0}%` }} />
                  </span>
                  <span class="fine">{t("practice.ofN", [s.solved, s.total])}</span>
                </button>
                <MoreMenu id={"col-" + c.id} label={t("a11y.moreFor", [c.name])} items={menuItems(c)} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="muted">{t("v7problems.empty")}</p>
      )}
      <ImportButtons />
    </section>
  );
}

/** One collection: its problems, then the import report. */
export function CollectionPage() {
  const c = C.getCollection(state.practice.collection);
  if (!c) {
    return (
      <>
        <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={t("v7problems.section")} />
        <div class="page">
          <p class="muted">{t("v7problems.nothing")}</p>
        </div>
      </>
    );
  }
  const pr = state.progress.problems;
  const s = C.collectionStats(c);
  const now = Date.now();
  return (
    <>
      <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={c.name}>
        <MoreMenu id={"colpage-" + c.id} label={t("a11y.moreFor", [c.name])} items={menuItems(c)} />
      </Toolbar>
      <div class="page collection-page">
        <header class="page-head collection-head">
          <div>
            <h1>{c.name}</h1>
            <p class="muted">
              {t("v7problems.count", [s.total])} · {t("practice.ofN", [s.solved, s.total])}
              {s.due ? ` · ${t("v7problems.due", [s.due])}` : ""}
            </p>
          </div>
          {s.total > 0 && (
            <Button kind="primary" onClick={() => C.practiseCollection(c.id)}>
              {t("v7problems.practise")}
            </Button>
          )}
        </header>
        {s.total > 0 && (
          <div class="problem-grid">
            {c.problems.map((p) => {
              const r = pr[p.id];
              const due = r?.due && r.due <= now;
              return (
                <button type="button" class={`problem-card ${r?.solved && !due ? "done" : ""}`} onClick={() => C.openProblem(p.id)}>
                  <span class="problem-no">{p.n}</span>
                  <span class="problem-title">
                    <Stone color={p.toMove} size={10} /> {p.name || t("v7problems.problemN", [p.n])}
                  </span>
                  {due ? <span class="fine due-mark">{t("v7problems.dueMark")}</span> : r?.solved ? <Icon name="check" size={14} /> : r ? <i class="dot tried" /> : <GradeDots grade={p.grade || 1} />}
                </button>
              );
            })}
          </div>
        )}
        <ImportReport c={c} />
      </div>
    </>
  );
}

function ImportReport({ c }) {
  const rows = c.report || [];
  if (!rows.length) return null;
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  return (
    <section class="section import-report">
      <h2 class="section-title">{t("v7problems.report")}</h2>
      <p class="fine">{t("v7problems.summary", [n("accepted"), n("corrected"), n("rejected")])}</p>
      <ul class="group report-rows">
        {rows.map((r) => {
          const p = r.id ? c.problems.find((x) => x.id === r.id) : null;
          const size = r.size || 19;
          const color = t(r.toMove === -1 ? "common.white" : "common.black");
          return (
            <li class={`group-row report-row ${r.verdict}`}>
              <span class={`verdict ${r.verdict}`}>{t("v7problems.verdict." + r.verdict)}</span>
              <span class="gr-text">
                <strong>
                  {p ? `${p.n}. ` : ""}
                  {r.name || t("v7problems.source", [r.file || "SGF", (r.index || 0) + 1])}
                </strong>
                {r.verdict === "rejected" ? (
                  <span class="wrap-text">{t("v7problems.reason." + (r.reason || "noAnswer"))}</span>
                ) : (
                  <span class="wrap-text">
                    {t("goal." + r.goal, [color])}
                    {r.ko ? t("v7problems.koGoal") : ""} · {t("v7problems.answer", [(r.answer || []).map((a) => label(a, size)).join(", ")])}
                  </span>
                )}
                {r.refuted?.length > 0 && <span class="wrap-text">{t("v7problems.refuted", [r.refuted.map((a) => label(a, size)).join(", "), lineText(r.refutation || [], size)])}</span>}
                {r.alsoRight?.length > 0 && <span class="wrap-text">{t("v7problems.alsoRight", [r.alsoRight.map((a) => label(a, size)).join(", ")])}</span>}
              </span>
              {p && (
                <Button kind="ghost" size="sm" onClick={() => C.openProblem(p.id)} aria-label={p.name || t("v7problems.problemN", [p.n])}>
                  <Icon name="next" size={14} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
