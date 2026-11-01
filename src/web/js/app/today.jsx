/**
 * Today: one screen to start from. Continue the game, today's five, the
 * next lesson, a game suggested from your level and recent mistakes, your
 * progress, and what to work on.
 */
import * as Lib from "../library.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { topWeaknesses, THEME_TOPIC } from "./insight.js";
import { rankLabel, ratingLabel } from "./play.jsx";
import { Button, Icon, Thumb } from "./parts.jsx";

function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? "today.night" : h < 12 ? "today.morning" : h < 18 ? "today.afternoon" : "today.evening");
}

function Sparkline({ history }) {
  const pts = (history || []).slice(-30);
  if (pts.length < 2) return null;
  const W = 220;
  const H = 48;
  const min = Math.min(...pts.map((p) => p.r)) - 20;
  const max = Math.max(...pts.map((p) => p.r)) + 20;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (r) => H - ((r - min) / (max - min || 1)) * H;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join("");
  return (
    <svg class="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("today.progressLabel")}>
      <path d={d} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].r)} r="3" />
    </svg>
  );
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
  return (
    <div class="page today">
      <div class="drag" data-drag />
      <header class="page-head">
        <span class="eyebrow">{new Date().toLocaleDateString(state.settings.lang === "zh" ? "zh-CN" : state.settings.lang, { weekday: "long", month: "long", day: "numeric" })}</span>
        <h1>{greeting()}</h1>
        {streak > 0 && (
          <p class="muted">
            <Icon name="flame" size={14} /> {t("practice.streak", [streak])}
          </p>
        )}
      </header>

      <div class="today-grid">
        {inProgress && (
          <section class="card tile continue-tile enter-up">
            <Thumb thumb={Lib.thumbnail(g.game)} size={g.game.size} />
            <div>
              <span class="eyebrow">{t("library.inProgress")}</span>
              <strong>{t("library.continueTitle", [g.game.size, g.game.moveNumber])}</strong>
              <span class="muted">{g.opponent === "ai" ? t("library.vsEngine", [rankLabel(g.strength)]) : t("library.twoPlayers")}</span>
            </div>
            <Button kind="primary" onClick={C.continueCurrent}>
              {t("library.continue")}
            </Button>
          </section>
        )}

        <section class="card tile enter-up">
          <span class="eyebrow">{t("practice.daily")}</span>
          <h2>{dailyDone ? t("practice.dailyFinished") : t("practice.dailyTitle")}</h2>
          <div class="daily-dots">
            {Array.from({ length: 5 }, (_, i) => {
              const it = daily?.items[i];
              const cls = it && daily.done.includes(it.id) ? "done" : daily && i < daily.index ? "missed" : daily && i === daily.index ? "on" : "";
              return <i class={cls} />;
            })}
          </div>
          <p class="fine">{dueMistakes ? t("today.dailyMistakes", [Math.min(2, dueMistakes)]) : t("practice.dailyHelp")}</p>
          {!dailyDone && (
            <Button kind="primary" onClick={C.startDaily}>
              {daily && daily.index > 0 ? t("practice.continue") : t("practice.start")}
            </Button>
          )}
        </section>

        <section class="card tile enter-up">
          <span class="eyebrow">{t("today.suggestedGame")}</span>
          <h2>{t("today.suggestedTitle", [rec.size, rankLabel(rec.strength)])}</h2>
          <p class="muted">
            {rec.handicap ? t("today.withHandicap", [rec.handicap]) : t("today.even")} · {rec.weak ? t("today.because", [C.themeName(rec.weak.theme)]) : t("today.becauseLevel")}
          </p>
          <Button onClick={() => C.newGame({ size: rec.size, strength: rec.strength, handicap: rec.handicap, opponent: "ai", color: 1 })}>
            {t("today.play")}
          </Button>
        </section>

        <section class="card tile enter-up">
          <span class="eyebrow">{t("practice.course")}</span>
          {next ? (
            <>
              <h2>{C.tx(next.lesson.title)}</h2>
              <p class="muted">{C.tx(next.unit.title)}</p>
              <Button onClick={C.openNextLesson}>{t("today.nextLesson")}</Button>
            </>
          ) : (
            <h2>{t("practice.courseDone")}</h2>
          )}
        </section>

        <section class="card tile rating-tile enter-up">
          <span class="eyebrow">{t("today.level")}</span>
          {r ? (
            <>
              <h2>{ratingLabel(r.r)}</h2>
              <Sparkline history={r.history} />
              <p class="fine">{r.games ? t("today.levelGames", [r.games]) : t("today.levelStart")}</p>
            </>
          ) : (
            <p class="muted">{t("today.levelStart")}</p>
          )}
        </section>

        <section class="card tile enter-up">
          <span class="eyebrow">{t("today.workOn")}</span>
          {weak.length ? (
            <ul class="weak-list">
              {weak.map((w) => (
                <li>
                  <span>
                    <strong>{C.themeName(w.theme)}</strong>
                    <span class="fine">{t("today.seenN", [w.count])}</span>
                  </span>
                  <button type="button" class="link" onClick={() => C.openTopic(THEME_TOPIC[w.theme] || topicFor(w.theme), w.theme)}>
                    {t("summary.practice")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">{t("today.noWeak")}</p>
          )}
        </section>
      </div>

      {recent.length > 0 && (
        <section class="section">
          <h2 class="section-title">{t("today.recent")}</h2>
          <ul class="game-grid">
            {recent.map((rg) => (
              <li class="game-card">
                <button type="button" class="game-open" onClick={() => C.openRecord(rg.id)}>
                  <Thumb thumb={rg.thumb} size={rg.size} />
                  <span class="game-text">
                    <strong>{rg.name || (rg.opponent === "ai" ? t("library.vsEngine", [rg.strength ? rankLabel(rg.strength) : "KataGo"]) : t("library.untitled"))}</strong>
                    <span class="muted">
                      {rg.size}×{rg.size} · {t("play.moveN", [rg.moves])}
                    </span>
                    <span class="outcome">{rg.result ? C.resultText(rg.result) : t("library.unfinished")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function topicFor(theme) {
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
