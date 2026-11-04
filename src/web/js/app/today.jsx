/**
 * Today: one screen to start from (docs/design.md §7). One hero — continue
 * the game, or the suggested game — carries the only primary button; the
 * rest is a grouped list: today's five, the next lesson, a weak spot, your
 * level, recent games. Empty things collapse to nothing, never to an empty
 * card.
 */
import * as Lib from "../library.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { topWeaknesses, THEME_TOPIC } from "./insight.js";
import { rankLabel, ratingLabel } from "./play.jsx";
import { Button, Icon, Thumb } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { weekSummary } from "./week.js";

function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? "today.night" : h < 12 ? "today.morning" : h < 18 ? "today.afternoon" : "today.evening");
}

function Sparkline({ history }) {
  const pts = (history || []).slice(-30);
  if (pts.length < 2) return null;
  const W = 160;
  const H = 32;
  const min = Math.min(...pts.map((p) => p.r)) - 20;
  const max = Math.max(...pts.map((p) => p.r)) + 20;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (r) => H - ((r - min) / (max - min || 1)) * H;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join("");
  return (
    <svg class="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("today.progressLabel")}>
      <path d={d} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].r)} r="2.5" />
    </svg>
  );
}

export function DailyDots({ daily }) {
  return (
    <span class="daily-dots" aria-label={t("practice.ofN", [daily ? daily.index : 0, 5])}>
      {Array.from({ length: 5 }, (_, i) => {
        const it = daily?.items[i];
        const cls = it && daily.done.includes(it.id) ? "done" : daily && i < daily.index ? "missed" : daily && i === daily.index ? "on" : "";
        return <i class={`${cls} ${it?.kind === "m" ? "own" : ""}`} />;
      })}
    </span>
  );
}

function playSuggested(rec, quick) {
  const g = quick ? rec.quick : rec;
  C.newGame({ size: g.size, strength: g.strength, handicap: g.handicap, opponent: "ai", color: 1 });
}

export function TodayView() {
  const p = state.progress;
  const g = state.game;
  const inProgress = g && g.game.moveNumber > 0 && !g.game.current.result;
  const rec = C.recommendedGame();
  const next = C.nextLesson();
  const daily = C.todaysDaily();
  const dailyDone = daily ? daily.index >= daily.items.length : false;
  const weak = topWeaknesses(p.weakness, 2);
  const recent = Lib.listGames().slice(0, 3);
  const r = p.rating;
  const dueMistakes = p.mistakes.filter((m) => (m.due || 0) <= Date.now()).length;
  const streak = p.streak?.count || 0;
  const recText = `${rec.handicap ? t("today.withHandicap", [rec.handicap]) : t("today.even")} · ${rec.weak ? t("today.because", [C.themeName(rec.weak.theme)]) : t("today.becauseLevel")}`;
  return (
    <>
      <Toolbar />
      <div class="page today">
        <header class="page-head">
          <span class="eyebrow">
            {new Date().toLocaleDateString(state.settings.lang === "zh" ? "zh-CN" : state.settings.lang, { weekday: "long", month: "long", day: "numeric" })}
            {streak > 0 && (
              <>
                {" · "}
                <Icon name="flame" size={12} /> {t("practice.streak", [streak])}
              </>
            )}
          </span>
          <h1>{greeting()}</h1>
        </header>

        {inProgress ? (
          <section class="hero enter-up">
            <Thumb thumb={Lib.thumbnail(g.game)} size={g.game.size} />
            <div class="hero-text">
              <span class="eyebrow">{t("library.inProgress")}</span>
              <h2>{t("library.continueTitle", [g.game.size, g.game.moveNumber])}</h2>
              <p class="muted">{g.opponent === "ai" ? t("library.vsEngine", [rankLabel(g.strength)]) : t("library.twoPlayers")}</p>
            </div>
            <Button kind="primary" size="lg" onClick={C.continueCurrent}>
              {t("library.continue")}
            </Button>
          </section>
        ) : (
          <section class="hero enter-up">
            <EmptyBoard size={rec.size} />
            <div class="hero-text">
              <span class="eyebrow">{t("today.suggestedGame")}</span>
              <h2>{t("today.suggestedTitle", [rec.size, rankLabel(rec.strength)])}</h2>
              <p class="muted">{recText}</p>
            </div>
            <div class="hero-actions">
              <Button kind="primary" size="lg" onClick={() => playSuggested(rec)}>
                {t("today.play")}
              </Button>
              <button type="button" class="link" onClick={() => playSuggested(rec, true)}>
                {t("today.quick9")}
              </button>
            </div>
          </section>
        )}

        <ul class="group enter-up">
          <li class="group-row">
            <span class="gr-icon">
              <Icon name="target" size={18} />
            </span>
            <span class="gr-text">
              <strong>{dailyDone ? t("practice.dailyFinished") : t("practice.dailyTitle")}</strong>
              <span>{dailyDone ? t("practice.dailySolved", [daily.done.length, daily.items.length]) : dueMistakes ? t("today.dailyMistakes", [Math.min(2, dueMistakes)]) : t("practice.dailyHelp")}</span>
            </span>
            <DailyDots daily={daily} />
            {!dailyDone && (
              <Button size="sm" onClick={C.startDaily}>
                {daily && daily.index > 0 ? t("practice.continue") : t("practice.start")}
              </Button>
            )}
          </li>
          {next && (
            <li class="group-row">
              <span class="gr-icon">
                <Icon name="practice" size={18} />
              </span>
              <span class="gr-text">
                <strong>{C.tx(next.lesson.title)}</strong>
                <span>
                  {t("practice.course")} · {C.tx(next.unit.title)}
                </span>
              </span>
              <Button size="sm" onClick={C.openNextLesson}>
                {t("today.nextLesson")}
              </Button>
            </li>
          )}
          {inProgress && (
            <li class="group-row">
              <span class="gr-icon">
                <Icon name="play" size={18} />
              </span>
              <span class="gr-text">
                <strong>{t("today.suggestedTitle", [rec.size, rankLabel(rec.strength)])}</strong>
                <span>{recText}</span>
              </span>
              <Button size="sm" onClick={() => playSuggested(rec)}>
                {t("today.play")}
              </Button>
            </li>
          )}
          {weak.map((w) => (
            <li class="group-row">
              <span class="gr-icon">
                <Icon name="bulb" size={18} />
              </span>
              <span class="gr-text">
                <strong>{C.themeName(w.theme)}</strong>
                <span>
                  {t("today.workOn")} · {t("today.seenN", [w.count])}
                </span>
              </span>
              <Button size="sm" onClick={() => C.openTopic(THEME_TOPIC[w.theme] || topicFor(w.theme), w.theme)}>
                {t("summary.practice")}
              </Button>
            </li>
          ))}
        </ul>

        <WeekStrip />

        {r?.games > 0 && (
        <section class="section level enter-up">
          <div class="level-text">
            <span class="eyebrow">{t("today.level")}</span>
            <strong>{r ? ratingLabel(r.r) : "—"}</strong>
            <span class="fine">{r?.games ? t("today.levelGames", [r.games]) : t("today.levelStart")}</span>
          </div>
          {r && <Sparkline history={r.history} />}
        </section>
        )}

        {recent.length > 0 && (
          <section class="section">
            <h2 class="section-title">{t("today.recent")}</h2>
            <ul class="group">
              {recent.map((rg) => (
                <li>
                  <button type="button" class="group-row game-row" onClick={() => C.openRecord(rg.id)}>
                    <Thumb thumb={rg.thumb} size={rg.size} />
                    <span class="gr-text">
                      <strong>{rg.name || (rg.opponent === "ai" ? t("library.vsEngine", [rg.strength ? rankLabel(rg.strength) : "KataGo"]) : t("library.untitled"))}</strong>
                      <span>
                        {rg.size} × {rg.size} · {t("play.moveN", [rg.moves])}
                      </span>
                    </span>
                    <span class="outcome">{rg.result ? C.resultText(rg.result) : t("library.unfinished")}</span>
                    <Icon name="next" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/** This week: four numbers, never an empty card (zeros are information). */
function WeekStrip() {
  const w = weekSummary(state.progress, Lib.listGames());
  const stats = [
    { n: w.played, key: "week.games" },
    { n: w.solved, key: "week.problems" },
    { n: w.lessons, key: "week.lessons" },
  ];
  return (
    <section class="section week enter-up" aria-label={t("week.title")}>
      <h2 class="section-title">{t("week.title")}</h2>
      <ul class="week-grid">
        {stats.map((x) => (
          <li>
            <strong>{x.n}</strong>
            <span>{t(x.key)}</span>
          </li>
        ))}
        <li>
          <strong class={w.delta > 0 ? "up" : w.delta < 0 ? "down" : ""}>{w.delta == null ? "—" : (w.delta > 0 ? "+" : "") + w.delta}</strong>
          <span>{t("week.level")}</span>
        </li>
      </ul>
    </section>
  );
}

/** An empty board of the suggested size, as the hero's picture. */
function EmptyBoard({ size }) {
  const n = size;
  const pad = 6;
  const span = 88;
  const step = span / (n - 1);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = pad + i * step;
    lines.push(<line x1={pad} x2={pad + span} y1={p} y2={p} />, <line y1={pad} y2={pad + span} x1={p} x2={p} />);
  }
  const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
  return (
    <svg class="empty-board" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="4" />
      {lines}
      {stars.flatMap((a) => stars.map((b) => <circle cx={pad + a * step} cy={pad + b * step} r="1" />))}
    </svg>
  );
}

export function topicFor(theme) {
  const map = {
    ladder: "capture",
    net: "capture",
    snapback: "capture",
    "throw-in": "capture",
    "double-atari": "capture",
    shortage: "capture",
    "connect-and-die": "capture",
    cut: "connect",
    "vital-point": "kill",
    "eye-space": "life",
    "false-eye": "kill",
    ko: "life",
    "race-outside": "race",
    "race-shared": "race",
  };
  return map[theme] || "capture";
}
