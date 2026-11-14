/**
 * Today: the one screen to start from. One hero — the game in progress, or
 * the suggested game — carries the only primary button; below it one row
 * for today's practice (or the placement quiz first); then your progress,
 * kept calm: the level with its line over the last games, what is
 * mastered, the last four weeks as dots (days, never a streak) and the
 * newest milestones; then this week in one line and your last games.
 * Whatever has nothing to show is left out — a new player sees no empty
 * chart and no "0".
 */
import { useState } from "preact/hooks";
import * as Games from "../data/games.js";
import { PLACEMENT } from "../model/profile.js";
import { masteryByTheme } from "../model/review.js";
import { practiceDays, ratingHistory } from "../model/level.js";
import { GRADES, PROBLEMS } from "../content.js";
import { t, textLang, tn } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Icon, Thumb } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { estimateLabel } from "./estimate-label.js";
import { ContinueHero, SuggestedHero, gameInProgress } from "../play/home.jsx";
import { outcome, recordTitle } from "../play/library.jsx";
import { pathRows } from "../practice/path.jsx";
import { activeDays, masteryTotals, ratingTrend, recentMilestones, sparkline, themesMet, weekParts } from "../practice/progress.js";
import { milestoneText, reachedMilestones } from "../practice/milestones.js";
import { FirstLessonHero } from "./first-run.jsx";

const DAY = 86400000;

function greeting(h = new Date().getHours()) {
  return t(h < 5 ? "today.night" : h < 12 ? "today.morning" : h < 18 ? "today.afternoon" : "today.evening");
}

const localeOf = (lang) => (lang === "zh" ? "zh-CN" : lang);

/** Games finished and problems solved in the last seven days. */
export function weekCounts(now = Date.now(), games = Games.listGames(), problems = state.profile?.problems || {}) {
  const since = now - 7 * DAY;
  const played = games.filter((g) => g.source !== "import" && g.result && (g.finishedAt || g.updatedAt || 0) >= since).length;
  // A solve, not an attempt: a failed retry of an old problem updates `last` but not `solvedAt`.
  const solved = Object.values(problems).filter((p) => (p.solvedAt || 0) >= since).length;
  return { played, solved };
}

/** This week in one line, without its zero parts; the quiet empty line when there is nothing at all. */
export function weekText(counts) {
  const parts = weekParts(counts).map((p) => tn(p.key === "games" ? "today.week.games" : "today.week.problems", p.n));
  if (!parts.length) return t("today.weekNone");
  return parts.length === 2 ? t("today.week.line", parts) : t("today.weekOne", parts);
}

export function TodayView() {
  const date = new Date().toLocaleDateString(localeOf(state.settings.lang), { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <Toolbar />
      <div class="page today">
        <header class="page-head">
          <span class="eyebrow">{date}</span>
          <h1>{greeting()}</h1>
        </header>
        {gameInProgress() ? <ContinueHero /> : C.firstRunOffer() === "lesson" ? <FirstLessonHero /> : <SuggestedHero />}
        <TodayList />
        <Progress />
        <Week />
        <Recent />
      </div>
    </>
  );
}

/** What else is for today: the placement quiz first, else today's practice. */
function TodayList() {
  let row;
  if (C.placementOffered()) {
    row = (
      <button type="button" class="group-row today-row" data-row="placement" onClick={() => C.startPlacement()}>
        <span class="gr-icon">
          <Icon name="target" size={18} />
        </span>
        <span class="gr-text">
          <strong>{t("placement.title")}</strong>
          <span>{t("placement.leadRange", [PLACEMENT.MIN, PLACEMENT.MAX])}</span>
        </span>
        <span class="row-action">{t("placement.start")}</span>
      </button>
    );
  } else {
    const now = C.pathNow();
    const rows = pathRows(now.items);
    if (!rows.length) return null;
    const done = now.items.filter((it) => now.done.has(it.key)).length;
    // The row the next item is in: a problem is named by its theme there, never by its own name.
    const nextRow = rows.find((r) => r.items.some((it) => !now.done.has(it.key)));
    row = (
      <button type="button" class={`group-row today-row ${now.finished ? "done" : ""}`} data-row="path" onClick={now.finished ? C.practiceHome : C.startPath}>
        <span class="gr-icon">
          <Icon name="practice" size={18} />
        </span>
        <span class="gr-text">
          <strong>{t("today.practice")}</strong>
          <span>{now.finished ? t("practice.path.doneLine") : nextRow ? t("common.labelValue", [t("today.next"), nextRow.title]) : ""}</span>
        </span>
        <span class="row-count">{t("practice.ofN", [done, now.items.length])}</span>
        {now.finished ? <Icon name="check" size={16} /> : <span class="row-action">{now.started ? t("practice.path.resume") : t("practice.path.start")}</span>}
      </button>
    );
  }
  return (
    <ul class="group today-list">
      <li>{row}</li>
    </ul>
  );
}

/* ------------------------------------------------------------- progress */

/** "up about 2 ranks over 30 days" — the trend in words, honest about being approximate. */
export function trendText(trend) {
  const n = Math.abs(trend.ranks);
  const change = trend.ranks > 0 ? tn("progress.up", n) : trend.ranks < 0 ? tn("progress.down", n) : t("progress.same");
  return trend.days >= 2 ? t("progress.overDays", [change, trend.days]) : t("progress.overGames", [change, trend.games]);
}

/** The level: the estimate with its ±, and (from three rated games) its line over the last games. */
function LevelRow({ est, trend }) {
  const label = estimateLabel(est);
  const said = trend ? trendText(trend) : tn("play.home.levelGames", est.games);
  const W = 160;
  const H = 36;
  const sp = trend ? sparkline(trend.points, W, H) : null;
  return (
    <li class="progress-row" data-row="level">
      <span class="gr-text">
        <strong>{t("common.labelValue", [t("play.home.level"), label])}</strong>
        <span>{said}</span>
      </span>
      {sp && (
        <svg class="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("progress.sparkLabel", [label, said])}>
          <polyline points={sp.line} />
          <circle cx={sp.end.x} cy={sp.end.y} r="2.5" />
        </svg>
      )}
    </li>
  );
}

/** Mastered / learning / not yet as one thin bar. */
function MasteryBar({ row, label }) {
  const part = (n) => ({ flexGrow: n, minWidth: n > 0 ? "2px" : "0" });
  return (
    <span class="mastery-bar" role="img" aria-label={label}>
      <i class="mastered" style={part(row.mastered)} />
      <i class="learning" style={part(row.learning)} />
      <i class="unseen" style={part(row.unseen)} />
    </span>
  );
}

const masteryLabel = (row) => t("progress.masteryLabel", [row.mastered, row.learning, row.unseen]);

/** What is mastered; on demand, theme by theme. */
function MasteryRow({ byTheme, totals }) {
  const [open, setOpen] = useState(false);
  const themes = themesMet(byTheme);
  const sub = [totals.learning > 0 ? tn("progress.learning", totals.learning) : "", totals.unseen > 0 ? tn("progress.unseen", totals.unseen) : ""].filter(Boolean).join(" · ");
  return (
    <li data-row="mastery">
      <button type="button" class="progress-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="gr-text">
          <strong>{totals.mastered > 0 ? tn("progress.mastered", totals.mastered) : t("progress.masteredNone")}</strong>
          <span>{sub}</span>
        </span>
        <MasteryBar row={totals} label={masteryLabel(totals)} />
        <Icon name={open ? "down" : "next"} size={14} />
      </button>
      {open && (
        <ul class="mastery-themes">
          {themes.map((th) => (
            <li>
              <span class="mastery-name">{C.focusName(th.key)}</span>
              <MasteryBar row={th} label={masteryLabel(th)} />
              <span class="row-count">{t("practice.ofN", [th.mastered, th.total])}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The last four weeks, a dot a day (today last). Days practised, never a streak. */
function DaysRow({ days }) {
  const said = tn("progress.days", activeDays(days));
  return (
    <li class="progress-row" data-row="days">
      <span class="gr-text">
        <strong>{t("progress.weeks")}</strong>
        <span>{said}</span>
      </span>
      <span class="day-dots" role="img" aria-label={said}>
        {days.map((n, i) => (
          <i class={`${n > 0 ? "on" : ""} ${i % 7 === 0 && i > 0 ? "week" : ""}`} />
        ))}
      </span>
    </li>
  );
}

function Progress() {
  const now = Date.now();
  const p = state.profile;
  const est = C.playerEstimate();
  const rated = est.games > 0;
  const trend = rated ? ratingTrend(ratingHistory(p, est.size)) : null;
  const byTheme = masteryByTheme(p, PROBLEMS, GRADES);
  const totals = masteryTotals(byTheme);
  const met = totals.mastered + totals.learning > 0;
  const days = practiceDays(p, now, 28);
  const practised = activeDays(days) > 0;
  const lang = localeOf(state.settings.lang);
  const marks = recentMilestones(reachedMilestones(now))
    .map((m) => ({ ...m, text: milestoneText(m) }))
    .filter((m) => m.text);
  if (!rated && !met && !practised && !marks.length) return null;
  return (
    <section class="section today-progress" aria-labelledby="progress-title">
      <h2 class="section-title" id="progress-title">
        {t("progress.title")}
      </h2>
      <ul class="group progress-list">
        {rated && <LevelRow est={est} trend={trend} />}
        {met && <MasteryRow byTheme={byTheme} totals={totals} />}
        {practised && <DaysRow days={days} />}
        {marks.length > 0 && (
          <li class="progress-row milestones" data-row="milestones">
            <span class="gr-text">
              <strong>{t("progress.milestones")}</strong>
              <ul class="milestone-list">
                {marks.map((m) => (
                  <li class="milestone">
                    <span class="milestone-text">{m.text}</span>
                    <span class="row-count">{new Date(m.at).toLocaleDateString(lang, { month: "short", day: "numeric" })}</span>
                  </li>
                ))}
              </ul>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

function Week() {
  return (
    <section class="section today-week">
      <h2 class="section-title">{t("today.week")}</h2>
      <p class="muted">{weekText(weekCounts())}</p>
    </section>
  );
}

/** The last three games; the rest are in the Library. */
function Recent() {
  const games = Games.listGames().slice(0, 3);
  if (!games.length) return null;
  return (
    <section class="section today-recent">
      <h2 class="section-title">{t("today.recent")}</h2>
      <ul class="group games">
        {games.map((g) => {
          const o = outcome(g);
          return (
            <li class="game-item">
              <button type="button" class="group-row game-row" onClick={() => C.openRecord(g.id)} aria-label={`${recordTitle(g)} · ${o.label}`}>
                <Thumb thumb={g.thumb} size={g.size} />
                <span class="gr-text">
                  <strong lang={textLang(recordTitle(g)) || undefined}>{recordTitle(g)}</strong>
                  <span>
                    {g.size} × {g.size} · {tn("play.moveN", g.moves)}
                  </span>
                </span>
                <span class={`outcome ${o.cls}`}>{o.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
