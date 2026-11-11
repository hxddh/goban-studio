/**
 * Practice's pages (its home is the path, practice/path.jsx, with the catalog
 * below it): lessons, problems, a topic as a grid of positions, drills of
 * your own mistakes, and the quiet end of today's session.
 *
 * A problem says only its goal until it is solved or its answer is shown;
 * its name ("Straight three", "Snapback") would be most of the answer.
 */
import { useEffect, useState } from "preact/hooks";
import * as S from "../solver.js";
import { t, tn } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { Board, Button, GradeDots, Icon, Stone } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { PracticeHome, whyText } from "../practice/path.jsx";
import { CatalogView } from "../practice/catalog.jsx";
import { PositionTile } from "../practice/tile.jsx";
import { cleanFirst, comesBackIn, problemStatus } from "../practice/progress.js";
import { CaptureView, LessonDone } from "./beginner.jsx";

export function PracticeView() {
  const v = state.practice.view;
  if (v === "lesson") return <LessonView />;
  if (v === "problem") return <ProblemView />;
  if (v === "topic") return <TopicPage />;
  if (v === "mistake") return <MistakeView />;
  if (v === "dailyDone") return <SessionDone />;
  if (v === "capture") return <CaptureView />;
  if (v === "catalog") return <CatalogView />;
  return <PracticeHome />;
}

/** The toolbar's subtitle inside today's session: "Today 2 of 6". */
function sessionSub() {
  const at = C.sessionPlace();
  return at ? t("practice.session.of", [at.n, at.total]) : "";
}

/** The panel's eyebrow inside today's session: why this item is in the path. */
function SessionWhy() {
  const it = C.sessionItem();
  return it ? <span class="eyebrow">{whyText(it)}</span> : null;
}

/**
 * Enter goes on, as the primary button does, once there is something to go
 * on from (`ready`). Not while a button or a field has the key, nor a
 * sheet or a menu; `boardOnly` leaves everything but the board to the
 * shell's own Enter (lessons, app.jsx).
 */
function useEnterToContinue(ready, go, { boardOnly = false } = {}) {
  useEffect(() => {
    if (!ready) return undefined;
    const onKey = (e) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || state.sheet || state.menu) return;
      const el = e.target;
      if (el?.closest?.("button, a, input, textarea, select, [role=menu]")) return;
      if (boardOnly && !el?.closest?.("canvas")) return;
      e.preventDefault();
      go();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ready, go, boardOnly]);
}

/* ------------------------------------------------------------ a topic */

/** The quiet mark of a problem's state on its tile (nothing for one not tried). */
function StatusMark({ status }) {
  if (status === "tried") return <i class="tile-mark tried" />;
  if (status === "solved") return <span class="tile-mark solved"><Icon name="check" size={14} /></span>;
  if (status === "due") return <span class="tile-mark due"><Icon name="replay" size={14} /></span>;
  if (status === "mastered") return <span class="tile-mark mastered"><Icon name="check" size={12} /></span>;
  return null;
}

/** A problem's state in words, for the tile's label. */
function statusText(status, rec) {
  if (status === "solved" && cleanFirst(rec)) return t("practice.status.clean");
  return t("practice.status." + status);
}

/**
 * One grade's problems as a grid of positions. Arrow keys move through the
 * grid (one tile takes Tab), Home and End go to its ends, Enter opens.
 */
function ProblemGrid({ items, numberOf }) {
  const p = state.profile;
  const now = Date.now();
  const firstOpen = Math.max(0, items.findIndex((x) => !p.problems[x.id]?.solved));
  const [at, setAt] = useState(firstOpen);
  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tiles = [...e.currentTarget.querySelectorAll(".problem-card")];
    const i = tiles.indexOf(document.activeElement);
    if (i < 0) return;
    // How many tiles the first row holds, as laid out now.
    let cols = tiles.findIndex((el) => el.offsetTop !== tiles[0].offsetTop);
    if (cols < 0) cols = tiles.length;
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: tiles.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (to < 0 || to >= tiles.length) return;
    setAt(to);
    tiles[to].focus();
  };
  return (
    <div class="problem-grid" role="group" onKeyDown={onKeyDown}>
      {items.map((x, i) => {
        const rec = p.problems[x.id];
        const status = problemStatus(rec, now);
        const n = numberOf(x);
        const name = C.nameKnown(x.id) ? C.tx(x.title) : "";
        const toMove = C.defToMove(x);
        const label = [name ? t("common.labelValue", [t("practice.problemN", [n]), name]) : t("practice.problemN", [n]), C.defGoalText(x), statusText(status, rec)].filter(Boolean).join(t("a11y.sentence"));
        return (
          <button type="button" class={`problem-card ${status}`} data-status={status} tabIndex={i === at ? 0 : -1} aria-label={label} title={name || undefined} onFocus={() => setAt(i)} onClick={() => C.openProblem(x.id)}>
            <PositionTile def={x} />
            <span class="tile-foot">
              {toMove != null && <Stone color={toMove} size={10} />}
              <span class="problem-no">{n}</span>
              {name && <span class="problem-title">{name}</span>}
              <StatusMark status={status} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TopicPage() {
  const topic = state.practice.topic;
  const theme = state.practice.theme;
  const shape = state.practice.shape;
  const all = shape ? C.problemsOfShape(shape) : C.problemsOfTopic(topic);
  const themes = [...new Set(all.map((x) => x.theme).filter(Boolean))];
  const list = theme ? all.filter((x) => x.theme === theme) : all;
  const p = state.profile;
  const byGrade = [1, 2, 3, 4, 5].map((g) => ({ g, items: list.filter((x) => C.gradeOf(x.id) === g) })).filter((x) => x.items.length);
  const setTheme = (th) => update((s) => (s.practice = { ...s.practice, theme: th }));
  // Grades fold away: the first grade with unsolved problems starts open.
  const firstOpen = byGrade.find(({ items }) => items.some((x) => !p.problems[x.id]?.solved))?.g ?? byGrade[0]?.g;
  const [openGrades, setOpenGrades] = useState([firstOpen]);
  const numbers = new Map(all.map((x, i) => [x.id, i + 1]));
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={shape ? C.shapeName(shape) : t("topic." + topic)} />
    <div class="page topic-page">
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
          <section class="section grade-section" key={g}>
            <button type="button" class="section-title grade-head" aria-expanded={isOpen} onClick={() => setOpenGrades(isOpen ? openGrades.filter((x) => x !== g) : [...openGrades, g])}>
              <Icon name={isOpen ? "down" : "next"} size={14} />
              <GradeDots grade={g} /> {t("grade." + g)}
              <span class="grade-band">{C.gradeBandText(g)}</span>
              <span class="fine">{t("practice.ofN", [solved, items.length])}</span>
            </button>
            {isOpen && <ProblemGrid key={`${g}:${theme || ""}`} items={items} numberOf={(x) => numbers.get(x.id)} />}
          </section>
        );
      })}
    </div>
    </>
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
    view: null,
    hoverColor: m.color,
    interactive: D.status !== "right" && D.status !== "revealed",
  };
  useEnterToContinue(D.status === "right" || D.status === "revealed", C.nextAfterMistake);
  const msg =
    D.status === "right" ? t("mistakes.right") : D.status === "same" ? t("mistakes.same") : D.status === "wrong" ? t("mistakes.wrong") : D.status === "revealed" ? t("mistakes.revealed") : t("mistakes.prompt", [formatLoss(m.loss)]);
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={t("mistakes.title")} sub={sessionSub()} />
    <div class="workspace">
      <section class="stage" aria-label={t("mistakes.title")}>
        <Board model={model} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
        <div class="panel-title">
          {daily ? <SessionWhy /> : <span class="eyebrow">{t("mistakes.title")}</span>}
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
              {t("common.continue")}
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
    ghost: P.ghost ? { ...P.ghost, color: P.st.toMove } : null,
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

/**
 * What this problem is: how hard, your record with it and, once its name
 * may be said (`named`), its theme.
 */
function ProblemFacts({ def, grade, named }) {
  const rec = state.profile.problems[def.id];
  const record = !rec ? t("practice.recordNew") : cleanFirst(rec) && rec.tries === 1 ? t("practice.recordClean") : rec.solved ? tn("practice.recordSolved", rec.tries) : tn("practice.recordTried", rec.tries);
  return (
    <dl class="facts">
      <dt>{t("practice.difficulty")}</dt>
      <dd>
        <GradeDots grade={grade} /> {C.gradeBandText(grade)}
      </dd>
      {named && def.theme && (
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

/**
 * Under the verdict: the problem's name, once it is solved or its answer
 * shown; after a miss, when it comes back ("back in about 3 days"; not in
 * the placement quiz, which is not a review).
 */
function ProblemResult({ P, placing }) {
  const named = C.problemNamed(P);
  const back = !placing && P.missed ? comesBackIn(state.profile.problems[P.def.id], Date.now()) : null;
  if (!named && back == null) return null;
  return (
    <div class="result-lines">
      {named && <p class="result-name">{t("common.labelValue", [t("practice.thisProblem"), C.tx(P.def.title)])}</p>}
      {back != null && <p class="fine come-back">{back === 1 ? t("practice.backTomorrow") : t("practice.backInDays", [back])}</p>}
    </div>
  );
}

function ProblemView() {
  const pr = state.practice;
  const P = pr.problem;
  const def = P.def;
  const placing = C.placementPlace();
  const daily = pr.daily || placing;
  const list = state.practice.theme ? C.problemsOfTheme(state.practice.theme) : C.problemsOfTopic(def.topic);
  const n = list.findIndex((x) => x.id === def.id) + 1;
  const grade = C.gradeOf(def.id);
  const named = C.problemNamed(P);
  const done = P.status === "won" || !!P.answer;
  useEnterToContinue(done, C.nextProblem);
  const crumbs = [{ label: t("nav.practice"), onClick: C.practiceHome }];
  if (!daily) crumbs.push({ label: t("topic." + def.topic), onClick: () => C.openTopic(def.topic) });
  return (
    <>
    <Toolbar crumbs={crumbs} title={named ? C.tx(def.title) : t("practice.problem")} sub={placing ? t("placement.of", [placing.n, placing.total]) : daily ? sessionSub() : t("practice.ofN", [n, list.length])} />
    <div class="workspace">
      <section class="stage" aria-label={t("practice.problem")}>
        <Board model={puzzleModel(P)} onPlay={C.practicePlay} />
      </section>
      <aside class="panel">
        <div class="panel-title">
          {pr.daily && <SessionWhy />}
          <h1 class="goal">
            <Stone color={P.pz.userColor} size={14} /> {C.goalText(P.pz)}
          </h1>
        </div>
        {P.hintAt || P.used ? <p class="note">{C.tx(def.hint)}</p> : null}
        {def.shown && <p class="fine">{t("practice.turned")}</p>}
        {P.pz.counting && P.pz.ask === "value" && <ValueChoices P={P} />}
        <ProblemFeedback P={P} />
        <ProblemResult P={P} placing={!!placing} />
        {P.ghost && <p class="fine">{t("play.confirmHint")}</p>}
        <ProblemControls P={P} onNext={C.nextProblem} nextLabel={daily ? t("common.continue") : t("practice.nextProblem")} />
        <ProblemFacts def={def} grade={grade} named={named} />
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
  const L = state.practice.lesson;
  // Lesson complete, with its bridge into a game (beginner.jsx).
  return L.finished ? <LessonDone L={L} /> : <LessonStep L={L} />;
}

function LessonStep({ L }) {
  const steps = L.lesson.steps;
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
  // Enter on the board goes on too (the shell handles Enter anywhere else).
  useEnterToContinue(stepDone, C.lessonContinue, { boardOnly: true });
  const goal = C.stepGoalText(cur);
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={C.tx(L.lesson.title)} sub={sessionSub() || C.tx(L.unit.title)} />
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
        {goal && (
          <p class="goal">
            <Stone color={cur.kind === "problem" ? cur.pz.userColor : cur.toMove} size={14} /> {goal}
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

/** The quiet end of today's session. */
function SessionDone() {
  return (
    <>
    <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={t("practice.path.doneToday")} />
    <div class="page center-page">
      <section class="card celebrate session-done">
        <h1>{t("practice.path.doneToday")}</h1>
        <p class="muted">{t("practice.path.doneLine")}</p>
        <div class="actions center wrap">
          <Button kind="primary" onClick={C.practiceHome}>
            {t("practice.backHome")}
          </Button>
          <Button kind="ghost" onClick={C.openCatalog}>
            {t("practice.catalog")}
          </Button>
        </div>
      </section>
    </div>
    </>
  );
}
