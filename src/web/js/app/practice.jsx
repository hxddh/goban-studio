/**
 * Learn (docs/v9.md, "Two spaces"): the path chosen for you on top
 * (learn/path.jsx), then the catalog: the course map, your mistakes,
 * problem topics and shapes. And the pages they open: lessons, problems,
 * topics, drills and the end of the day's problems.
 */
import { useState } from "preact/hooks";
import { BLACK } from "../rules.js";
import * as S from "../solver.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { Board, Button, GradeDots, Icon, Stone } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { LearnPath } from "../learn/path.jsx";
import { CaptureView, LessonDone } from "./beginner.jsx";

export const TOPICS = ["capture", "escape", "connect", "life", "kill", "race", "technique", "endgame"];


export function PracticeView() {
  const v = state.learn.view;
  if (v === "lesson") return <LessonView />;
  if (v === "problem") return <ProblemView />;
  if (v === "topic") return <TopicPage />;
  if (v === "mistake") return <MistakeView />;
  if (v === "dailyDone") return <DailyDone />;
  if (v === "capture") return <CaptureView />;
  return <PracticeHome />;
}

function PracticeHome() {
  const p = state.profile;
  const next = C.nextLesson();
  const plan = C.trainingFocus();
  const focusTopics = new Set(plan.items.map((f) => f.topic).filter(Boolean));
  return (
    <>
      <Toolbar />
      <div class="page learn-home">
        <header class="page-head">
          <h1>{t("nav.learn")}</h1>
        </header>

        <LearnPath plan={plan} />

        <section class="section">
          <h2 class="section-title">{t("practice.course")}</h2>
          <CourseMap next={next} />
        </section>

        <MistakesSection />

        <section class="section">
          <h2 class="section-title">{t("practice.problems")}</h2>
          <div class="topic-grid">
            {TOPICS.map((topic) => {
              const list = C.problemsOfTopic(topic);
              if (!list.length) return null;
              const solved = list.filter((x) => p.problems[x.id]?.solved).length;
              return (
                <button type="button" class={`topic-card ${focusTopics.has(topic) ? "focus" : ""}`} onClick={() => C.openTopic(topic)}>
                  <strong>
                    {t("topic." + topic)}
                    {focusTopics.has(topic) && <span class="plan-mark">{t("plan.mark")}</span>}
                  </strong>
                  <span class="muted">{t("topic." + topic + ".desc")}</span>
                  <span class="topic-foot">
                    <span class="mini-progress">
                      <i style={{ width: `${(solved / list.length) * 100}%` }} />
                    </span>
                    <span class="fine">{t("practice.ofN", [solved, list.length])}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {C.SHAPES.length > 0 && (
          <section class="section">
            <h2 class="section-title">{t("practice.shapes")}</h2>
            <div class="chips shape-chips">
              {C.SHAPES.map((sh) => {
                const id = typeof sh === "string" ? sh : sh.id;
                const list = C.problemsOfShape(id);
                if (!list.length) return null;
                const solved = list.filter((x) => p.problems[x.id]?.solved).length;
                return (
                  <button type="button" class={`chip ${solved === list.length ? "done" : ""}`} onClick={() => C.openShape(id)}>
                    {C.shapeName(id)}
                    <span class="chip-count">
                      {solved}/{list.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}


/**
 * The course as a map: every unit with its progress at a glance; the unit
 * you are in is open, the others open on click.
 */
function CourseMap({ next }) {
  const p = state.profile;
  const [open, setOpen] = useState(null);
  const current = next ? C.COURSE.findIndex((u) => u.lessons.some((l) => l.id === next.lesson.id)) : -1;
  const shown = open ?? current;
  return (
    <ol class="units map">
      {C.COURSE.map((unit, ui) => {
        const done = unit.lessons.filter((l) => p.lessons[l.id]?.done).length;
        const all = done === unit.lessons.length;
        const state_ = all ? "done" : ui === current ? "now" : done > 0 ? "some" : "todo";
        const expanded = shown === ui;
        const firstOfLevel = unit.level && C.COURSE[ui - 1]?.level !== unit.level;
        return (
          <>
          {firstOfLevel && <li class="units-heading">{t(unit.level === "advanced" ? "course.advanced" : "course.intermediate")}</li>}
          <li class={`unit ${state_} ${expanded ? "open" : ""}`}>
            <button type="button" class="unit-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : ui)}>
              <span class="unit-no">{all ? <Icon name="check" size={13} /> : ui + 1}</span>
              <span class="unit-text">
                <h3>{C.tx(unit.title)}</h3>
                <p>{C.tx(unit.summary)}</p>
              </span>
              <span class="unit-progress" aria-label={t("practice.ofN", [done, unit.lessons.length])}>
                <span class="mini-progress">
                  <i style={{ width: `${(done / unit.lessons.length) * 100}%` }} />
                </span>
                <span class="unit-count">{t("practice.ofN", [done, unit.lessons.length])}</span>
              </span>
              <Icon name={expanded ? "down" : "next"} size={14} />
            </button>
            {expanded && (
              <ul class="lesson-list">
                {unit.lessons.map((lesson) => {
                  const lp = p.lessons[lesson.id];
                  const isNext = next?.lesson.id === lesson.id;
                  return (
                    <li>
                      <button type="button" class={`lesson-row ${lp?.done ? "done" : ""} ${isNext ? "next" : ""}`} onClick={() => C.openLesson(lesson.id)}>
                        <span class="lesson-mark">{lp?.done ? <Icon name="check" size={13} /> : <i class="dot" />}</span>
                        <span class="lesson-title">{C.tx(lesson.title)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
          </>
        );
      })}
    </ol>
  );
}

function MistakesSection() {
  const list = state.profile.mistakes;
  if (!list.length) return null;
  return (
    <section class="section">
      <h2 class="section-title" title={t("mistakes.caption")}>
        {t("mistakes.title")}
      </h2>
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
  const topic = state.learn.topic;
  const theme = state.learn.theme;
  const shape = state.learn.shape;
  const all = shape ? C.problemsOfShape(shape) : C.problemsOfTopic(topic);
  const themes = [...new Set(all.map((x) => x.theme).filter(Boolean))];
  const list = theme ? all.filter((x) => x.theme === theme) : all;
  const p = state.profile;
  const byGrade = [1, 2, 3, 4, 5].map((g) => ({ g, items: list.filter((x) => C.gradeOf(x.id) === g) })).filter((x) => x.items.length);
  const setTheme = (th) => update((s) => (s.learn = { ...s.learn, theme: th }));
  // Grades fold away: the first grade with unsolved problems starts open.
  const firstOpen = byGrade.find(({ items }) => items.some((x) => !p.problems[x.id]?.solved))?.g ?? byGrade[0]?.g;
  const [openGrades, setOpenGrades] = useState([firstOpen]);
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.learn"), onClick: C.learnHome }]} title={shape ? C.shapeName(shape) : t("topic." + topic)} />
    <div class="page">
      <header class="page-head">
        <h1>{shape ? C.shapeName(shape) : t("topic." + topic)}</h1>
        <p class="muted">{shape ? t("practice.shapes") : t("topic." + topic + ".desc")}</p>
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
      {byGrade.map(({ g, items }) => {
        const solved = items.filter((x) => p.problems[x.id]?.solved).length;
        const isOpen = openGrades.includes(g);
        return (
          <section class="section grade-section">
            <button type="button" class="section-title grade-head" aria-expanded={isOpen} onClick={() => setOpenGrades(isOpen ? openGrades.filter((x) => x !== g) : [...openGrades, g])}>
              <Icon name={isOpen ? "down" : "next"} size={14} />
              <GradeDots grade={g} /> {t("grade." + g)}
              <span class="fine">{t("practice.ofN", [solved, items.length])}</span>
            </button>
            {isOpen && (
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
            )}
          </section>
        );
      })}
    </div>
    </>
  );
}

function MistakeView() {
  const D = state.learn.mistake;
  const m = D.m;
  const game = D.game;
  const node = game.current;
  const daily = state.learn.daily;
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
    view: null,
    hoverColor: m.color,
    interactive: D.status !== "right" && D.status !== "revealed",
  };
  const msg =
    D.status === "right" ? t("mistakes.right") : D.status === "same" ? t("mistakes.same") : D.status === "wrong" ? t("mistakes.wrong") : D.status === "revealed" ? t("mistakes.revealed") : t("mistakes.prompt", [formatLoss(m.loss)]);
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.learn"), onClick: C.learnHome }]} title={t("mistakes.title")} sub={daily ? t("practice.dailyOf", [daily.index + 1, daily.items.length]) : ""} />
    <div class="workspace">
      <section class="stage" aria-label={t("mistakes.title")}>
        <Board model={model} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
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
    </>
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
    view: pz.view,
    hoverColor: P.st.toMove,
    interactive: P.status === "open" && !P.busy && !P.answer,
    ...extra,
  };
}

function ProblemFeedback({ P, success }) {
  const counting = P.pz.counting;
  if (P.feedback === "solved" && counting) return <p class="feedback good">{t(C.feedbackKey(P), C.endgameArgs(P))}</p>;
  if (P.answer) return <p class="feedback info">{counting && P.pz.ask === "value" ? t(P.pz.value === 1 ? "practice.endgame.valueAnswerOne" : "practice.endgame.valueAnswer", C.endgameArgs(P)) : t("practice.answerShown")}</p>;
  if (P.feedback === "solved") return <p class="feedback good">{P.result === "seki" ? t(C.feedbackKey(P)) : success || t("practice.solved")}</p>;
  if (P.feedback === "ko" || P.feedback === "wrong") return <p class="feedback bad">{t(C.feedbackKey(P))}</p>;
  if (P.feedback === "keep") return <p class="feedback">{t("practice.keepGoing")}</p>;
  if (P.feedback === "retry" && !P.hintAt) return <p class="feedback">{t("practice.retryNow")}</p>;
  if (P.busy) return <p class="feedback muted">{t("practice.answering")}</p>;
  return null;
}

/**
 * A "how many points" question: the values to choose from. A wrong choice
 * stays crossed out; the right one is marked once found or shown.
 */
function ValueChoices({ P }) {
  const pz = P.pz;
  const done = P.status === "won" || !!P.answer;
  return (
    <div class="chips value-choices" role="group" aria-label={t("practice.endgame.choices")}>
      {pz.choices.map((v) => {
        const wrong = (P.wrongValues || []).includes(v);
        const right = done && v === pz.value;
        return (
          <button type="button" class={`chip ${right ? "on" : ""} ${wrong ? "off" : ""}`} aria-pressed={right} disabled={done || wrong} onClick={() => C.answerValue(v)}>
            {v === 1 ? t("practice.endgame.onePoint") : t("practice.endgame.points", [String(v)])}
          </button>
        );
      })}
    </div>
  );
}

function ProblemControls({ P, onNext, nextLabel }) {
  const value = P.pz.counting && P.pz.ask === "value";
  if (value) {
    const done = P.status === "won" || !!P.answer;
    return (
      <div class="actions wrap">
        {done && onNext && (
          <Button kind="primary" onClick={onNext}>
            {nextLabel}
          </Button>
        )}
        {!done && (
          <Button kind="ghost" icon="bulb" onClick={C.problemHint}>
            {t("common.hint")}
          </Button>
        )}
        {!done && (
          <Button kind="ghost" onClick={C.showAnswer}>
            {t("practice.showAnswer")}
          </Button>
        )}
      </div>
    );
  }
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
      {P.status !== "lost" && (P.answer || P.history.length > 0) && (
        <Button kind="ghost" icon="replay" onClick={C.retryProblem}>
          {t("practice.retry")}
        </Button>
      )}
      {P.status === "open" && !P.answer && (
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

/** What this problem is: difficulty, theme, and your record with it. */
function ProblemFacts({ def, grade }) {
  const rec = state.profile.problems[def.id];
  const record = !rec ? t("practice.recordNew") : rec.solved ? t("practice.recordSolved", [rec.tries]) : t("practice.recordTried", [rec.tries]);
  return (
    <dl class="facts">
      <dt>{t("practice.difficulty")}</dt>
      <dd>
        <GradeDots grade={grade} /> {t("grade." + grade)}
      </dd>
      {def.theme && (
        <>
          <dt>{t("practice.themes")}</dt>
          <dd>
            <button type="button" class="link" onClick={() => C.openTopic(def.topic, def.theme)}>
              {C.themeName(def.theme)}
            </button>
          </dd>
        </>
      )}
      <dt>{t("practice.record")}</dt>
      <dd>{record}</dd>
    </dl>
  );
}

function ProblemView() {
  const pr = state.learn;
  const P = pr.problem;
  const def = P.def;
  const daily = pr.daily;
  const list = state.learn.theme ? C.problemsOfTheme(state.learn.theme) : C.problemsOfTopic(def.topic);
  const n = list.findIndex((x) => x.id === def.id) + 1;
  const grade = C.gradeOf(def.id);
  const crumbs = [{ label: t("nav.learn"), onClick: C.learnHome }];
  if (!daily) crumbs.push({ label: t("topic." + def.topic), onClick: () => C.openTopic(def.topic) });
  return (
    <>
    <Toolbar crumbs={crumbs} title={daily ? t("practice.daily") : C.tx(def.title)} sub={daily ? t("practice.dailyOf", [daily.index + 1, daily.items.length]) : t("practice.ofN", [n, list.length])} />
    <div class="workspace">
      <section class="stage" aria-label={t("practice.problem")}>
        <Board model={puzzleModel(P)} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
        <div class="panel-title">
          <h1>{C.tx(def.title)}</h1>
        </div>
        <p class="goal">
          <Stone color={P.pz.userColor} size={14} /> {C.goalText(P.pz)}
        </p>
        {P.hintAt || P.used ? <p class="note">{C.tx(def.hint)}</p> : null}
        {P.pz.counting && P.pz.ask === "value" && <ValueChoices P={P} />}
        <ProblemFeedback P={P} />
        <ProblemControls P={P} onNext={C.nextProblem} nextLabel={daily ? t(daily.index >= daily.items.length - 1 ? "practice.finishDaily" : "practice.nextDaily") : t("practice.nextProblem")} />
        <ProblemFacts def={def} grade={grade} />
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
    </>
  );
}

function LessonView() {
  const L = state.learn.lesson;
  const steps = L.lesson.steps;
  // v8: lesson complete, with its bridge into a game (beginner.jsx).
  if (L.finished) return <LessonDone L={L} />;
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
      view: cur.pz.view,
      hoverColor: cur.kind === "place" && cur.result !== "right" ? cur.toMove : null,
      interactive: cur.kind === "place" && cur.result !== "right",
    };
    onPlay = C.practicePlay;
  }
  const stepDone = cur.kind === "read" || (cur.kind === "place" && cur.result === "right") || (cur.kind === "problem" && (cur.status === "won" || cur.answer));
  const last = L.index === steps.length - 1;
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.learn"), onClick: C.learnHome }]} title={C.tx(L.lesson.title)} sub={C.tx(L.unit.title)} />
    <div class="workspace">
      <section class="stage" aria-label={C.tx(L.lesson.title)}>
        {model ? <Board model={model} onPlay={onPlay} /> : <div class="board-placeholder" />}
      </section>
      <aside class="panel">
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
    </>
  );
}

function DailyDone() {
  const d = state.learn.daily || C.todaysDaily();
  const total = d?.items?.length || 5;
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.learn"), onClick: C.learnHome }]} title={t("practice.daily")} />
    <div class="page center-page">
      <section class="card celebrate">
        <span class="eyebrow">{t("practice.daily")}</span>
        <h1>{t("practice.dailyFinished")}</h1>
        <p class="muted">{t("practice.dailySolved", [d?.done?.length || 0, total])}</p>
        <div class="actions center">
          <Button kind="primary" onClick={C.learnHome}>
            {t("practice.backHome")}
          </Button>
        </div>
      </section>
    </div>
    </>
  );
}
