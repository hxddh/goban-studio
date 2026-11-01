/**
 * Practice: the course, problem collections and today's five.
 */
import { BLACK } from "../rules.js";
import * as S from "../solver.js";
import { t } from "../i18n.js";
import { todayKey } from "../persist.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { Board, Button, GradeDots, Icon, Stone } from "./parts.jsx";

export const TOPICS = ["capture", "escape", "connect", "life", "kill", "race", "technique"];


export function PracticeView() {
  const v = state.practice.view;
  if (v === "lesson") return <LessonView />;
  if (v === "problem") return <ProblemView />;
  if (v === "topic") return <TopicPage />;
  if (v === "mistake") return <MistakeView />;
  if (v === "dailyDone") return <DailyDone />;
  return <PracticeHome />;
}

function PracticeHome() {
  const p = state.progress;
  const lessons = C.allLessons();
  const doneLessons = lessons.filter(({ lesson }) => p.lessons[lesson.id]?.done).length;
  const next = C.nextLesson();
  return (
    <div class="page">
      <div class="drag" data-drag />
      <header class="page-head">
        <h1>{t("nav.practice")}</h1>
        <p class="muted">{t("practice.caption")}</p>
      </header>
      <div class="hero-row">
        <DailyCard />
        <section class="card hero">
          <span class="eyebrow">{t("practice.course")}</span>
          {next ? (
            <>
              <h2>{C.tx(next.lesson.title)}</h2>
              <p class="muted">{C.tx(next.unit.title)}</p>
            </>
          ) : (
            <h2>{t("practice.courseDone")}</h2>
          )}
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax={lessons.length} aria-valuenow={doneLessons}>
            <i style={{ width: `${lessons.length ? (doneLessons / lessons.length) * 100 : 0}%` }} />
          </div>
          <p class="fine">{t("practice.lessonsDone", [doneLessons, lessons.length])}</p>
          {next && (
            <Button kind="primary" onClick={C.openNextLesson}>
              {doneLessons ? t("practice.continue") : t("practice.start")}
            </Button>
          )}
        </section>
      </div>

      <section class="section">
        <h2 class="section-title">{t("practice.course")}</h2>
        <ol class="units">
          {C.COURSE.map((unit, ui) => {
            const done = unit.lessons.filter((l) => p.lessons[l.id]?.done).length;
            return (
              <li class="unit">
                <div class="unit-head">
                  <span class="unit-no">{String(ui + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{C.tx(unit.title)}</h3>
                    <p class="muted">{C.tx(unit.summary)}</p>
                  </div>
                  <span class="fine">{t("practice.ofN", [done, unit.lessons.length])}</span>
                </div>
                <ul class="lesson-list">
                  {unit.lessons.map((lesson) => {
                    const lp = p.lessons[lesson.id];
                    const isNext = next?.lesson.id === lesson.id;
                    return (
                      <li>
                        <button type="button" class={`lesson-row ${lp?.done ? "done" : ""} ${isNext ? "next" : ""}`} onClick={() => C.openLesson(lesson.id)}>
                          <span class="lesson-mark">{lp?.done ? <Icon name="check" size={15} /> : isNext ? <i class="dot" /> : null}</span>
                          <span class="lesson-title">{C.tx(lesson.title)}</span>
                          <span class="fine">{t("practice.stepsN", [lesson.steps.length])}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <MistakesSection />

      <section class="section">
        <h2 class="section-title">{t("practice.problems")}</h2>
        <p class="muted section-sub">{t("practice.problemsCaption", [C.PROBLEMS.length])}</p>
        <div class="topic-grid">
          {TOPICS.map((topic) => {
            const list = C.problemsOfTopic(topic);
            if (!list.length) return null;
            const solved = list.filter((x) => p.problems[x.id]?.solved).length;
            return (
              <button type="button" class="topic-card" onClick={() => C.openTopic(topic)}>
                <strong>{t("topic." + topic)}</strong>
                <span class="muted">{t("topic." + topic + ".desc")}</span>
                <span class="topic-foot">
                  <span class="fine">{t("practice.ofN", [solved, list.length])}</span>
                  <span class="mini-progress">
                    <i style={{ width: `${(solved / list.length) * 100}%` }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DailyCard() {
  const p = state.progress;
  const daily = C.todaysDaily();
  const done = daily ? daily.done.length : 0;
  const finished = daily && daily.index >= daily.items.length;
  const streak = p.streak?.count || 0;
  return (
    <section class="card hero daily">
      <span class="eyebrow">{t("practice.daily")}</span>
      <h2>{finished ? t("practice.dailyFinished") : t("practice.dailyTitle")}</h2>
      <div class="daily-dots" aria-label={t("practice.ofN", [daily ? daily.index : 0, 5])}>
        {Array.from({ length: 5 }, (_, i) => {
          const it = daily?.items[i];
          const cls = it && daily.done.includes(it.id) ? "done" : daily && i < daily.index ? "missed" : daily && i === daily.index ? "on" : "";
          return <i class={`${cls} ${it?.kind === "m" ? "own" : ""}`} />;
        })}
      </div>
      <p class="fine">
        {streak > 0 ? (
          <>
            <Icon name="flame" size={13} /> {t("practice.streak", [streak])}
          </>
        ) : (
          t("practice.dailyHelp")
        )}
      </p>
      {!finished && (
        <Button kind="primary" onClick={C.startDaily}>
          {daily && daily.index > 0 ? t("practice.continue") : t("practice.start")}
        </Button>
      )}
      {finished && <p class="muted">{t("practice.dailySolved", [done, daily.items.length])}</p>}
    </section>
  );
}

function MistakesSection() {
  const list = state.progress.mistakes;
  if (!list.length) return null;
  return (
    <section class="section">
      <h2 class="section-title">{t("mistakes.title")}</h2>
      <p class="muted section-sub">{t("mistakes.caption")}</p>
      <div class="problem-grid">
        {list.slice(0, 12).map((m) => (
          <button type="button" class={`problem-card ${m.streak >= 2 ? "done" : ""}`} onClick={() => C.openMistakeDrill(m.id)}>
            <Stone color={m.color} size={12} />
            <span class="problem-title">{t("mistakes.item", [m.index, m.size])}</span>
            {m.theme ? <span class="fine">{C.themeName(m.theme)}</span> : <span />}
          </button>
        ))}
      </div>
    </section>
  );
}

function TopicPage() {
  const topic = state.practice.topic;
  const theme = state.practice.theme;
  const all = C.problemsOfTopic(topic);
  const themes = [...new Set(all.map((x) => x.theme).filter(Boolean))];
  const list = theme ? all.filter((x) => x.theme === theme) : all;
  const p = state.progress;
  const byGrade = [1, 2, 3, 4, 5].map((g) => ({ g, items: list.filter((x) => C.gradeOf(x.id) === g) })).filter((x) => x.items.length);
  const setTheme = (th) => update((s) => (s.practice = { ...s.practice, theme: th }));
  return (
    <div class="page">
      <div class="drag" data-drag />
      <header class="page-head">
        <button type="button" class="back" onClick={C.practiceHome}>
          <Icon name="back" size={16} /> {t("nav.practice")}
        </button>
        <h1>{t("topic." + topic)}</h1>
        <p class="muted">{t("topic." + topic + ".desc")}</p>
      </header>
      {themes.length > 1 && (
        <div class="chips theme-filter" role="radiogroup" aria-label={t("practice.themes")}>
          <button type="button" role="radio" aria-checked={!theme} class={`chip ${!theme ? "on" : ""}`} onClick={() => setTheme(null)}>
            {t("library.kind.all")}
          </button>
          {themes.map((th) => (
            <button type="button" role="radio" aria-checked={theme === th} class={`chip ${theme === th ? "on" : ""}`} onClick={() => setTheme(th)}>
              {C.themeName(th)}
            </button>
          ))}
        </div>
      )}
      {byGrade.map(({ g, items }) => (
        <section class="section">
          <h2 class="section-title">
            <GradeDots grade={g} /> {t("grade." + g)}
          </h2>
          <div class="problem-grid">
            {items.map((x) => {
              const pr = p.problems[x.id];
              const n = all.indexOf(x) + 1;
              return (
                <button type="button" class={`problem-card ${pr?.solved ? "done" : ""}`} onClick={() => C.openProblem(x.id)}>
                  <span class="problem-no">{n}</span>
                  <span class="problem-title">{C.tx(x.title)}</span>
                  {pr?.solved ? <Icon name="check" size={14} /> : pr ? <i class="dot tried" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MistakeView() {
  const D = state.practice.mistake;
  const m = D.m;
  const game = D.game;
  const node = game.current;
  const daily = state.practice.daily;
  const marks = [];
  if (D.status === "wrong" || D.status === "same") marks.push({ ...D.last, type: "cross", tone: "bad" });
  if (D.status === "revealed" || D.status === "right") for (const a of m.accept || [m.best]) marks.push({ ...a, type: "circle", tone: "good" });
  if (D.status === "revealed") marks.push({ ...m.played, type: "cross", tone: "bad" });
  const board = node.board.signMap.map((r) => r.slice());
  if (D.status === "right" && D.last) board[D.last.y][D.last.x] = m.color;
  const model = {
    size: game.size,
    board,
    lastMove: D.status === "right" ? D.last : node.move,
    marks,
    showCoords: state.settings.coords,
    material: state.settings.board,
    view: null,
    hoverColor: m.color,
    interactive: D.status !== "right" && D.status !== "revealed",
  };
  const msg =
    D.status === "right" ? t("mistakes.right") : D.status === "same" ? t("mistakes.same") : D.status === "wrong" ? t("mistakes.wrong") : D.status === "revealed" ? t("mistakes.revealed") : t("mistakes.prompt", [formatLoss(m.loss)]);
  return (
    <div class="workspace">
      <section class="stage" aria-label={t("mistakes.title")}>
        <div class="drag" data-drag />
        <Board model={model} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
        <header class="panel-head" data-drag>
          <button type="button" class="back" onClick={C.practiceHome}>
            <Icon name="back" size={16} /> {t("nav.practice")}
          </button>
          {daily && <span class="fine">{t("practice.dailyOf", [daily.index + 1, daily.items.length])}</span>}
        </header>
        <div class="panel-title">
          <span class="eyebrow">{t("mistakes.title")}</span>
          <h1>{t("mistakes.item", [m.index, m.size])}</h1>
          {m.theme && <span class="chip theme-chip">{C.themeName(m.theme)}</span>}
        </div>
        <p class="goal">
          <Stone color={m.color} size={14} /> {t("mistakes.goal")}
        </p>
        <p class={`feedback ${D.status === "right" ? "good" : D.status === "wrong" || D.status === "same" ? "bad" : "info"}`}>{msg}</p>
        <div class="actions wrap">
          {(D.status === "right" || D.status === "revealed") && (
            <Button kind="primary" onClick={C.nextAfterMistake}>
              {daily ? t("practice.nextDaily") : t("common.continue")}
            </Button>
          )}
          {D.status !== "right" && D.status !== "revealed" && (
            <Button kind="ghost" onClick={C.revealMistake}>
              {t("practice.showAnswer")}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatLoss(v) {
  return String(Math.round((v || 0) * 2) / 2);
}

function puzzleModel(P, extra = {}) {
  const pz = P.pz;
  const marks = [];
  let board = S.signMap(pz, P.st);
  // The stones the goal is about carry a small triangle while they stand.
  for (const k of pz.keys) if (board[k.y][k.x] === pz.keyColor) marks.push({ x: k.x, y: k.y, type: "triangle" });
  if (P.hintAt) marks.push({ ...P.hintAt, type: "circle", tone: "accent" });
  let variation = null;
  if (P.answer) {
    board = S.signMap(pz, S.initialState(pz));
    variation = P.answer;
  }
  const lastMove = P.last ? { x: P.last.x, y: P.last.y } : null;
  return {
    size: pz.size,
    board,
    lastMove,
    marks,
    ownership: null,
    territory: null,
    deadStones: [],
    variation,
    moveNumbers: null,
    showCoords: false,
    material: state.settings.board,
    view: pz.view,
    hoverColor: P.st.toMove,
    interactive: P.status === "open" && !P.busy && !P.answer,
    ...extra,
  };
}

function ProblemFeedback({ P, success }) {
  if (P.answer) return <p class="feedback info">{t("practice.answerShown")}</p>;
  if (P.feedback === "solved") return <p class="feedback good">{success || t("practice.solved")}</p>;
  if (P.feedback === "wrong") return <p class="feedback bad">{t("practice.wrongExplained")}</p>;
  if (P.feedback === "keep") return <p class="feedback">{t("practice.keepGoing")}</p>;
  if (P.feedback === "retry") return <p class="feedback bad">{t("practice.retryNow")}</p>;
  if (P.busy) return <p class="feedback muted">{t("practice.answering")}</p>;
  return null;
}

function ProblemControls({ P, onNext, nextLabel }) {
  return (
    <div class="actions wrap">
      {P.status === "won" && onNext && (
        <Button kind="primary" onClick={onNext}>
          {nextLabel}
        </Button>
      )}
      {P.status === "open" && !P.answer && (
        <Button kind="ghost" icon="bulb" onClick={C.problemHint} disabled={P.busy}>
          {t("common.hint")}
        </Button>
      )}
      {(P.status === "lost" || P.answer || P.history.length > 0) && (
        <Button kind={P.status === "lost" ? "secondary" : "ghost"} icon="replay" onClick={C.retryProblem}>
          {t("practice.retry")}
        </Button>
      )}
      {P.status === "lost" && (
        <Button kind="ghost" icon="undo" onClick={C.undoProblemMove}>
          {t("practice.takeBack")}
        </Button>
      )}
      {P.status !== "won" && !P.answer && (
        <Button kind="ghost" onClick={C.showAnswer}>
          {t("practice.showAnswer")}
        </Button>
      )}
      {P.answer && onNext && (
        <Button kind="primary" onClick={onNext}>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}

function ProblemView() {
  const pr = state.practice;
  const P = pr.problem;
  const def = P.def;
  const daily = pr.daily;
  const list = state.practice.theme ? C.problemsOfTheme(state.practice.theme) : C.problemsOfTopic(def.topic);
  const n = list.findIndex((x) => x.id === def.id) + 1;
  const grade = C.gradeOf(def.id);
  return (
    <div class="workspace">
      <section class="stage" aria-label={t("practice.problem")}>
        <div class="drag" data-drag />
        <Board model={puzzleModel(P)} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
        <header class="panel-head" data-drag>
          <button type="button" class="back" onClick={daily ? C.practiceHome : () => C.openTopic(def.topic)}>
            <Icon name="back" size={16} /> {daily ? t("nav.practice") : t("topic." + def.topic)}
          </button>
          {daily && (
            <span class="fine">
              {t("practice.dailyOf", [daily.index + 1, daily.items.length])}
            </span>
          )}
        </header>
        <div class="panel-title">
          <span class="eyebrow">
            {t("topic." + def.topic)} · {n}
          </span>
          <h1>{C.tx(def.title)}</h1>
          <GradeDots grade={grade} />
        </div>
        <p class="goal">
          <Stone color={P.pz.userColor} size={14} /> {C.goalText(P.pz)}
        </p>
        {P.hintAt || P.used ? <p class="note">{C.tx(def.hint)}</p> : null}
        <ProblemFeedback P={P} />
        <ProblemControls P={P} onNext={C.nextProblem} nextLabel={daily ? t("practice.nextDaily") : t("practice.nextProblem")} />
        {!daily && (
          <footer class="panel-foot">
            <button type="button" class="link" onClick={C.prevProblem} disabled={n <= 1}>
              ← {t("practice.prev")}
            </button>
            <span>{t("practice.ofN", [n, list.length])}</span>
            <button type="button" class="link" onClick={C.nextProblem}>
              {t("practice.skip")} →
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function LessonView() {
  const L = state.practice.lesson;
  const steps = L.lesson.steps;
  if (L.finished) {
    const next = C.nextLesson();
    return (
      <div class="page center-page">
        <div class="drag" data-drag />
        <section class="card celebrate">
          <span class="eyebrow">{C.tx(L.unit.title)}</span>
          <h1>{t("practice.lessonDone")}</h1>
          <p class="muted">{C.tx(L.lesson.title)}</p>
          <div class="actions center">
            {next && (
              <Button kind="primary" onClick={() => C.openLesson(next.lesson.id)}>
                {t("practice.nextLesson")}
              </Button>
            )}
            <Button kind="ghost" onClick={C.practiceHome}>
              {t("practice.backHome")}
            </Button>
          </div>
        </section>
      </div>
    );
  }
  const cur = L.cur;
  const step = cur.step;
  let model = null;
  let onPlay = null;
  if (cur.kind === "problem") {
    model = puzzleModel(cur);
    onPlay = C.practicePlay;
  } else if (cur.pz) {
    const marks = [];
    const ox = cur.pz.x0;
    const oy = cur.pz.y0;
    if (cur.kind === "read") for (const m of step.board.marks || []) marks.push({ ...m, x: m.x + ox, y: m.y + oy });
    if (cur.kind === "place" && cur.result === "wrong" && cur.wrongAt) marks.push({ ...cur.wrongAt, type: "cross", tone: "bad" });
    if (cur.kind === "place" && cur.showAccept) for (const a of step.accept) marks.push({ x: a.x + ox, y: a.y + oy, type: "circle", tone: "good" });
    const board = cur.pz.board.map((r) => r.slice());
    if (cur.placed) board[cur.placed.y][cur.placed.x] = cur.toMove;
    model = {
      size: cur.pz.size,
      board,
      lastMove: cur.placed || null,
      marks,
      ownership: null,
      territory: null,
      deadStones: [],
      variation: null,
      moveNumbers: null,
      showCoords: false,
      material: state.settings.board,
      view: cur.pz.view,
      hoverColor: cur.kind === "place" && cur.result !== "right" ? cur.toMove : null,
      interactive: cur.kind === "place" && cur.result !== "right",
    };
    onPlay = C.practicePlay;
  }
  const stepDone = cur.kind === "read" || (cur.kind === "place" && cur.result === "right") || (cur.kind === "problem" && (cur.status === "won" || cur.answer));
  const last = L.index === steps.length - 1;
  return (
    <div class="workspace">
      <section class="stage" aria-label={C.tx(L.lesson.title)}>
        <div class="drag" data-drag />
        {model ? <Board model={model} onPlay={onPlay} /> : <div class="board-placeholder" />}
      </section>
      <aside class="panel">
        <header class="panel-head" data-drag>
          <button type="button" class="back" onClick={C.practiceHome}>
            <Icon name="back" size={16} /> {t("nav.practice")}
          </button>
        </header>
        <div class="panel-title">
          <span class="eyebrow">{C.tx(L.unit.title)}</span>
          <h1>{C.tx(L.lesson.title)}</h1>
        </div>
        <div class="steps" role="progressbar" aria-valuemin="1" aria-valuemax={steps.length} aria-valuenow={L.index + 1} aria-label={t("practice.stepOf", [L.index + 1, steps.length])}>
          {steps.map((_, i) => (
            <i class={i < L.index ? "done" : i === L.index ? "on" : ""} />
          ))}
        </div>
        <p class="lesson-text">{C.tx(step.text)}</p>
        {cur.kind === "problem" && (
          <p class="goal">
            <Stone color={cur.pz.userColor} size={14} /> {C.goalText(cur.pz)}
          </p>
        )}
        {cur.kind === "place" && (
          <p class="goal">
            <Stone color={cur.toMove === BLACK ? 1 : -1} size={14} /> {t("goal.place", [t(cur.toMove === BLACK ? "common.black" : "common.white")])}
          </p>
        )}
        {cur.kind === "problem" && <ProblemFeedback P={cur} success={step.success ? C.tx(step.success) : null} />}
        {cur.kind === "place" && cur.result === "right" && <p class="feedback good">{C.tx(step.success)}</p>}
        {cur.kind === "place" && cur.result === "wrong" && <p class="feedback bad">{C.tx(step.wrong)}</p>}
        <div class="actions wrap">
          {stepDone && (
            <Button kind="primary" onClick={C.lessonContinue}>
              {last ? t("practice.finishLesson") : t("common.continue")}
            </Button>
          )}
          {cur.kind === "problem" && !stepDone && <ProblemControls P={cur} />}
          {cur.kind === "problem" && cur.answer && <ProblemControls P={cur} />}
          {cur.kind === "place" && cur.result !== "right" && (
            <Button
              kind="ghost"
              icon="bulb"
              onClick={() => {
                cur.showAccept = true;
                update();
              }}
            >
              {t("common.hint")}
            </Button>
          )}
        </div>
        <footer class="panel-foot">
          <button type="button" class="link" onClick={C.lessonBack} disabled={L.index === 0}>
            ← {t("practice.prevStep")}
          </button>
          <span>{t("practice.stepOf", [L.index + 1, steps.length])}</span>
          <span />
        </footer>
      </aside>
    </div>
  );
}

function DailyDone() {
  const d = state.practice.daily || state.progress.daily;
  const total = d?.items?.length || 5;
  const streak = state.progress.streak?.count || 0;
  return (
    <div class="page center-page">
      <div class="drag" data-drag />
      <section class="card celebrate">
        <span class="eyebrow">{t("practice.daily")}</span>
        <h1>{t("practice.dailyFinished")}</h1>
        <p class="muted">{t("practice.dailySolved", [d?.done?.length || 0, total])}</p>
        {streak > 0 && (
          <p class="fine">
            <Icon name="flame" size={13} /> {t("practice.streak", [streak])}
          </p>
        )}
        <div class="actions center">
          <Button kind="primary" onClick={C.practiceHome}>
            {t("practice.backHome")}
          </Button>
        </div>
      </section>
    </div>
  );
}
