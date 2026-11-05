/**
 * v8 beginner path views: the lesson-complete page (with its bridge into a
 * game), capture Go, and the one-time note on the first count.
 */
import { useEffect } from "preact/hooks";
import { BLACK, WHITE } from "../rules.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { ataris } from "./insight.js";
import { bridgeAfter } from "./beginner.js";
import { Board, Button, Stone } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";

/* ------------------------------------------------------ lesson complete */

/**
 * "Lesson complete". One primary action: the game the lesson leads to when
 * there is one (capture Go, or the first 9×9 game), else the next lesson.
 */
export function LessonDone({ L }) {
  const next = C.nextLesson();
  const bridge = bridgeAfter(L.lesson.id, { settings: state.settings, progress: state.progress });
  const nextLesson = next && (
    <Button kind={bridge ? "secondary" : "primary"} onClick={() => C.openLesson(next.lesson.id)}>
      {t("practice.nextLesson")}
    </Button>
  );
  return (
    <>
      <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={C.tx(L.lesson.title)} />
      <div class="page center-page">
        <section class="card celebrate" data-bridge={bridge || undefined}>
          <span class="eyebrow">{C.tx(L.unit.title)}</span>
          <h1>{t("practice.lessonDone")}</h1>
          <p class="muted">{C.tx(L.lesson.title)}</p>
          {bridge && <p class="bridge-lead">{t(bridge === "capture" ? "capture.invite" : "firstGame.invite")}</p>}
          <div class="actions center wrap">
            {bridge === "capture" && (
              <Button kind="primary" onClick={() => C.startCapture({ from: L.lesson.id })}>
                {t("capture.play")}
              </Button>
            )}
            {bridge === "firstGame" && (
              <Button kind="primary" onClick={C.startFirstGame}>
                {t("firstGame.play")}
              </Button>
            )}
            {nextLesson}
            <Button kind="ghost" onClick={C.practiceHome}>
              {t("practice.backHome")}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- capture Go */

export function CaptureView() {
  const K = state.practice.capture;
  if (!K) return null;
  const game = K.game;
  const node = game.current;
  const over = K.over;
  const marks = [];
  if (over) for (const p of over.stones) marks.push({ ...p, type: "circle", tone: over.winner === K.human ? "good" : "bad" });
  // Teaching: stones in atari carry the same small triangle as in a game.
  else if (C.teachingOn()) {
    for (const ch of ataris(node.board.signMap)) marks.push({ ...ch.stones[0], type: "triangle", tone: ch.color === K.human ? "bad" : "good" });
  }
  const myTurn = !over && !K.thinking && game.turn === K.human;
  const model = {
    size: game.size,
    board: node.board.signMap,
    lastMove: node.move,
    marks,
    ownership: null,
    territory: null,
    deadStones: [],
    variation: null,
    moveNumbers: null,
    showCoords: false,
    material: state.settings.board,
    view: null,
    hoverColor: myTurn ? game.turn : null,
    interactive: myTurn,
  };
  const next = C.nextLesson();
  const won = over && over.winner === K.human;
  const title = t("capture.title");
  return (
    <>
      <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={title} sub={`${game.size} × ${game.size}`} />
      <div class={`workspace capture ${over ? "is-over" : ""}`}>
        <section class="stage" aria-label={title}>
          <Board model={model} onPlay={C.capturePlay} onHover={(v) => (v ? C.captureCanPlay(v.x, v.y) : true)} />
        </section>
        <aside class="panel" aria-label={title}>
          <div class="panel-title">
            <h1>{title}</h1>
          </div>
          <p class="goal">
            <Stone color={K.human} size={14} /> {t("capture.goal")}
          </p>
          <section class="players" aria-label={t("play.players")}>
            <CapturePlayer K={K} color={BLACK} />
            <CapturePlayer K={K} color={WHITE} />
          </section>
          <div class="panel-state" key={over ? "over" : "play"}>
            {!over && (
              <p class="status-line" aria-live="off">
                {K.thinking ? t("play.thinking") : t("play.yourTurn")}
              </p>
            )}
            {over && (
              <section class="card result-card enter-up" aria-live="polite">
                <span class="eyebrow">{title}</span>
                <strong class="result-big">{C.captureResultLine(K)}</strong>
                <div class="actions center wrap">
                  {/* One primary, first: move on after a win, try again after a loss. */}
                  {won && next && (
                    <Button kind="primary" onClick={() => C.openLesson(next.lesson.id)}>
                      {t("practice.nextLesson")}
                    </Button>
                  )}
                  <Button kind={won && next ? "secondary" : "primary"} onClick={C.captureAgain}>
                    {t("play.playAgain")}
                  </Button>
                  {!won && next && (
                    <Button kind="ghost" onClick={() => C.openLesson(next.lesson.id)}>
                      {t("practice.nextLesson")}
                    </Button>
                  )}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function CapturePlayer({ K, color }) {
  const active = !K.over && K.game.turn === color;
  const mine = color === K.human;
  return (
    <div class={`player ${active ? "active" : ""}`}>
      <Stone color={color} size={22} />
      <div class="player-name">
        <strong>{mine ? t("play.you") : t("capture.computer")}</strong>
      </div>
      {active && K.thinking && !mine && (
        <span class="thinking" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------- the first count */

let shownAt = null;

/**
 * The first time a player reaches the count of a game against the computer:
 * three short sentences on how the game ends, dead stones and the score. It
 * is marked seen as soon as it shows and stays for this count only (the
 * game and the position it was counted at).
 */
export function FirstCountNote() {
  const g = state.game;
  const here = g ? g.game.current : null;
  const show = !!g && g.opponent === "ai" && (!state.settings.firstCountSeen || shownAt === here);
  useEffect(() => {
    if (!show || state.settings.firstCountSeen) return;
    shownAt = here;
    C.setSetting("firstCountSeen", true);
  });
  if (!show) return null;
  return <p class="note first-count">{t("firstCount.note")}</p>;
}
