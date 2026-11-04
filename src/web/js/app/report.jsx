/**
 * v6 report: one page for a finished game (docs/design.md §7, a list-page
 * column). The result, the game in three phases, three key moments, and
 * "Practise this game" — the page's one primary action.
 */
import { useEffect, useRef } from "preact/hooks";
import { BLACK, WHITE } from "../rules.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { BLUNDER, MISTAKE } from "./summary.js";
import { storyText } from "./story.js";
import { accuracyText, drawMoment, lossText, momentWords, reportFacts, reportHeadline } from "./report-draw.js";
import { Button, Segmented, Stone } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";

export function ReportView() {
  const r = state.report;
  const m = r.model;
  const busy = r.status === "analyzing" || r.status === "waiting";
  const crumbs = r.space === "library" ? [{ label: t("nav.library"), onClick: C.closeReport }] : [];
  return (
    <>
      <Toolbar crumbs={crumbs} title={t("report.title")}>
        <Button size="sm" icon="download" onClick={C.exportReportImage} disabled={!m || busy}>
          {t("report.exportImage")}
        </Button>
      </Toolbar>
      <div class="page report">
        {busy && !m && <Pending />}
        {r.status === "missing" && !m && <p class="muted">{t("report.missing")}</p>}
        {m && (
          <>
            <header class="page-head">
              <h1>{reportHeadline(m)}</h1>
              <span class="muted">{reportFacts(m)}</span>
            </header>
            {busy && <Pending />}
            <Phases m={m} />
            <Moments m={m} />
            {!busy && <Practise m={m} />}
          </>
        )}
      </div>
    </>
  );
}

function Pending() {
  const p = Math.round(C.reportProgress() * 100);
  return (
    <section class="report-pending" aria-live="polite">
      <span class="fine">{t("report.analyzing", [p])}</span>
      <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
        <i style={{ width: `${p}%` }} />
      </div>
    </section>
  );
}

function Phases({ m }) {
  if (!m.phases) {
    return (
      <section class="report-section">
        <p class="report-note">{t(m.confidence === "none" ? "report.noAnalysis" : "report.estimate")}</p>
      </section>
    );
  }
  return (
    <section class="report-section">
      <h2 class="section-title">{t("report.phases")}</h2>
      {m.players.map((who) => (
        <table class="phase-table report-phases">
          <caption class="sr-only">{t("report.phasesOf", [t("common." + who)])}</caption>
          <thead>
            <tr>
              <th scope="col">
                {m.players.length > 1 && <Stone color={who === "black" ? BLACK : WHITE} size={10} />}
                <span class="sr-only">{t("common." + who)}</span>
              </th>
              <th title={t("report.lossHelp")}>{t("gameSummary.pointsLost")}</th>
              <th title={t("gameSummary.mistakesHelp", [MISTAKE, BLUNDER])}>{t("gameSummary.mistakes")}</th>
              <th title={t("gameSummary.mistakesHelp", [MISTAKE, BLUNDER])}>{t("gameSummary.blunders")}</th>
              <th title={t("gameSummary.accuracyHelp")}>{t("gameSummary.accuracy")}</th>
            </tr>
          </thead>
          <tbody>
            {m.phases.map((ph) => {
              const st = ph.players[who];
              return (
                <tr>
                  <th>
                    {t("phase." + ph.id)} <span class="fine">{t("gameSummary.phaseMoves", [ph.from, ph.to])}</span>
                  </th>
                  <td>{lossText(st.loss)}</td>
                  <td>{st.mistakes || "—"}</td>
                  <td>{st.blunders || "—"}</td>
                  <td>{accuracyText(st.accuracy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {m.takeaways.length > 0 && (
        <ol class="takeaways report-takeaways">
          {m.takeaways.slice(0, 3).map((tk) => (
            <li class={tk.tone}>{storyText(tk)}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Moments({ m }) {
  if (!m.moments.length) {
    if (!m.phases) return null;
    return (
      <section class="report-section">
        <h2 class="section-title">{t("report.moments")}</h2>
        <p class="muted">{t("report.momentsNone", [MISTAKE])}</p>
      </section>
    );
  }
  return (
    <section class="report-section">
      <h2 class="section-title">{t(m.phases ? "report.moments" : "report.turningPoints")}</h2>
      <ul class="report-moments">
        {m.moments.slice(0, 3).map((mo) => {
          const w = momentWords(m, mo);
          return (
            <li>
              <button type="button" class="report-moment" onClick={() => C.openReportMove(mo.index)} title={t("report.openMove", [mo.index])}>
                <MomentBoard mo={mo} size={m.size} />
                <strong>{w.title}</strong>
                <span>{w.played}</span>
                {w.better && <span>{w.better}</span>}
                {w.lost && <span class="report-lost">{w.lost}</span>}
                {w.why && <span class="fine">{w.why}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MomentBoard({ mo, size }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const px = c.clientWidth || 160;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(px * dpr);
    c.height = Math.round(px * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(c);
    const v = (name) => css.getPropertyValue(name).trim();
    drawMoment(g, 0, 0, px, mo, size, { board: v("--thumb-board") || undefined, good: v("--good") || undefined, bad: v("--bad") || undefined });
  });
  return <canvas ref={ref} class="report-board" aria-hidden="true" />;
}

function Practise({ m }) {
  const { add, have } = C.reportPractice();
  const n = add.length + have.length;
  let text;
  let action;
  if (m.confidence !== "high") {
    text = t(m.confidence === "none" ? "report.noAnalysis" : "report.practiseNeedsKatago");
    action = (
      <Button kind="primary" icon="chart" onClick={C.openReportReview}>
        {t("play.reviewGame")}
      </Button>
    );
  } else if (!n) {
    text = t("report.practiseNone", [MISTAKE]);
    action = (
      <Button kind="primary" icon="chart" onClick={C.openReportReview}>
        {t("play.reviewGame")}
      </Button>
    );
  } else {
    text = add.length ? t("report.practiseText", [n]) : t("report.practiseHave");
    action = (
      <Button kind="primary" icon="practice" onClick={C.practiseReport}>
        {add.length ? t("report.practise") : t("report.practiseNow")}
      </Button>
    );
  }
  const side = C.reportDrillColor();
  return (
    <section class="card report-practise">
      {side != null && m.confidence === "high" && (
        <div class="row">
          <span>{t("report.practiseSide")}</span>
          <Segmented
            label={t("report.practiseSide")}
            value={side}
            onChange={C.setReportDrillColor}
            options={[
              { value: BLACK, label: t("common.black") },
              { value: WHITE, label: t("common.white") },
            ]}
          />
        </div>
      )}
      <p>{text}</p>
      <div class="actions">
        {action}
        {m.confidence === "high" && n > 0 && (
          <Button kind="ghost" onClick={C.openReportReview}>
            {t("play.reviewGame")}
          </Button>
        )}
      </div>
    </section>
  );
}
