/**
 * Today (v12, as before v9): the one screen to start from. One hero — the
 * game in progress, or the suggested game — carries the only primary
 * button; below it a short group of what else is for today (today's
 * practice, or the placement quiz first), your level, then this week and
 * your last games. Empty things collapse to nothing, never to an empty card.
 */
import * as Games from "../data/games.js";
import { PLACEMENT } from "../model/player.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Icon, Thumb } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { ContinueHero, Level, SuggestedHero, gameInProgress, outcome, recordTitle } from "../play/home.jsx";
import { pathRow } from "../learn/path.jsx";

const DAY = 86400000;

function greeting(h = new Date().getHours()) {
  return t(h < 5 ? "today.night" : h < 12 ? "today.morning" : h < 18 ? "today.afternoon" : "today.evening");
}

/** Games finished and problems solved in the last seven days. */
export function weekCounts(now = Date.now(), games = Games.listGames(), problems = state.profile?.problems || {}) {
  const since = now - 7 * DAY;
  const played = games.filter((g) => g.source !== "import" && g.result && (g.finishedAt || g.updatedAt || 0) >= since).length;
  const solved = Object.values(problems).filter((p) => p.solved && (p.last || 0) >= since).length;
  return { played, solved };
}

export function TodayView() {
  const lang = state.settings.lang;
  const date = new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : lang, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <Toolbar />
      <div class="page today">
        <header class="page-head">
          <span class="eyebrow">{date}</span>
          <h1>{greeting()}</h1>
        </header>
        {gameInProgress() ? <ContinueHero /> : <SuggestedHero />}
        <TodayList />
        <Level />
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
      <button type="button" class="group-row today-row" data-row="placement" onClick={C.startPlacement}>
        <span class="gr-icon">
          <Icon name="target" size={18} />
        </span>
        <span class="gr-text">
          <strong>{t("placement.title")}</strong>
          <span>{t("placement.lead", [PLACEMENT.LENGTH])}</span>
        </span>
        <span class="row-action">{t("placement.start")}</span>
      </button>
    );
  } else {
    const now = C.pathNow();
    const rows = now.items.map((it) => pathRow(it)).filter(Boolean);
    if (!rows.length) return null;
    const done = now.items.filter((it) => now.done.has(it.key)).length;
    const next = now.items.find((it) => !now.done.has(it.key));
    const nextRow = next && pathRow(next);
    row = (
      <button type="button" class={`group-row today-row ${now.finished ? "done" : ""}`} data-row="path" onClick={now.finished ? C.learnHome : C.startPath}>
        <span class="gr-icon">
          <Icon name="practice" size={18} />
        </span>
        <span class="gr-text">
          <strong>{t("today.practice")}</strong>
          <span>{now.finished ? t("learn.path.doneLine") : nextRow ? `${t("today.next")}: ${nextRow.title}` : ""}</span>
        </span>
        <span class="row-count">{t("practice.ofN", [done, now.items.length])}</span>
        {now.finished ? <Icon name="check" size={16} /> : <span class="row-action">{now.started ? t("learn.path.resume") : t("learn.path.start")}</span>}
      </button>
    );
  }
  return (
    <ul class="group today-list">
      <li>{row}</li>
    </ul>
  );
}

function Week() {
  const { played, solved } = weekCounts();
  return (
    <section class="section today-week">
      <h2 class="section-title">{t("today.week")}</h2>
      <p class="muted">{played || solved ? t("today.weekLine", [played, solved]) : t("today.weekNone")}</p>
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
                  <strong>{recordTitle(g)}</strong>
                  <span>
                    {g.size} × {g.size} · {t("play.moveN", [g.moves])}
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
