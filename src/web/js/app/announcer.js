/**
 * Accessibility: the board for someone who cannot see it.
 *
 * Two small pieces, both reading the app state the views already render:
 *
 *  - boardKey(): the keys of a focused board (arrows, I, M, T, C, R, K, B,
 *    comma and period), answering with a sentence for the board's own live
 *    region. Parts.jsx's Board calls it.
 *  - useAnnouncements(): watches what changes between renders and speaks it
 *    through the app's live region (store.announce): each move stepped to
 *    in review (with its point loss when the game is analysed), a problem's
 *    goal, the opponent's reply, the solution, a lesson's step, a drill's
 *    verdict, an undo. Play's own moves, captures, passes, the computer's
 *    move and the result are announced where they happen (play-ctl.js).
 *
 * The words come from ../a11y.js, so they are tested in Node.
 */
import { useEffect } from "preact/hooks";
import { t } from "../i18n.js";
import * as A from "../a11y.js";
import { state, announce } from "./store.js";
import * as C from "./controller.js";

/* ------------------------------------------------------------ context */

function activeReview() {
  const r = state.review;
  return r && (r.meta.space || "play") === state.space ? r : null;
}

/** What the board on screen belongs to, for the T and C keys. */
function boardContext() {
  const r = activeReview();
  if (r) return { kind: "review", game: r.game };
  if (state.space === "play" && state.game) return { kind: "play", game: state.game.game };
  if (state.space !== "practice") return null;
  const pr = state.practice;
  if (pr.view === "problem" && pr.problem) return { kind: "problem", P: pr.problem };
  if (pr.view === "mistake" && pr.mistake) return { kind: "drill", D: pr.mistake, game: pr.mistake.game };
  if (pr.view === "lesson" && pr.lesson?.cur) {
    const cur = pr.lesson.cur;
    return cur.kind === "problem" ? { kind: "problem", P: cur, lesson: pr.lesson } : { kind: "lesson", lesson: pr.lesson };
  }
  return null;
}

function captureTotals(game, node = game.current) {
  const c = game.capturesOf(node);
  return { black: c.black || 0, white: c.white || 0 };
}

function stepText(L) {
  const steps = L.lesson.steps;
  return [t("practice.stepOf", [L.index + 1, steps.length]), C.tx(L.cur?.step?.text)].filter(Boolean).join(t("a11y.sentence"));
}

function turnSentence(ctx, model) {
  if (!ctx) return model.hoverColor ? A.turnText(model.hoverColor) : "";
  if (ctx.kind === "problem") {
    const goal = C.goalText(ctx.P.pz);
    return ctx.lesson ? [stepText(ctx.lesson), goal].join(t("a11y.sentence")) : goal;
  }
  if (ctx.kind === "lesson") return stepText(ctx.lesson);
  if (ctx.kind === "drill") return [A.turnText(ctx.D.m.color), t("mistakes.goal")].join(t("a11y.sentence"));
  const node = ctx.game.current;
  if (node.result) return C.resultText(node.result);
  return A.turnText(ctx.game.turn);
}

function capturesSentence(ctx) {
  if (!ctx?.game) return t("a11y.noPrisoners");
  const c = captureTotals(ctx.game);
  return A.capturesText(c.black, c.white);
}

/* ---------------------------------------------------------- board keys */

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let lastCursor = null;

function hasMark(model, p) {
  return (model.marks || []).some((m) => m.x === p.x && m.y === p.y);
}

/** The last move with its colour (problem and lesson models carry only x, y). */
function lastMoveOf(model) {
  const lm = model.lastMove;
  if (!lm) return null;
  if (lm.pass) return lm;
  const color = lm.color || model.board?.[lm.y]?.[lm.x];
  return color ? { ...lm, color } : null;
}

/**
 * A key on the focused board. Returns "play" for Enter/Space on an
 * interactive board (the Board plays the cursor), a sentence to speak, or
 * null when the key is not the board's.
 */
export function boardKey(e, bv) {
  if (!bv || e.metaKey || e.ctrlKey || e.altKey) return null;
  const m = bv.model;
  const board = m.board;
  if (!board) return null;
  const size = m.size;
  const d = ARROWS[e.key];
  if (d) {
    if (e.shiftKey) return null;
    if (!m.cursor && lastCursor && lastCursor.size === size) m.cursor = { x: lastCursor.x, y: lastCursor.y };
    const c = bv.moveCursor(d[0], d[1]);
    lastCursor = { ...c, size };
    return A.pointText(board, c.x, c.y, { size, last: m.lastMove, marked: hasMark(m, c) });
  }
  if (e.key === "Enter" || e.key === " ") return m.interactive && m.cursor ? "play" : null;
  const cursor = m.cursor || (lastCursor && lastCursor.size === size ? lastCursor : null);
  const ctx = boardContext();
  switch (e.key.toLowerCase()) {
    case "i":
      return cursor ? A.pointText(board, cursor.x, cursor.y, { size, detail: true, last: m.lastMove, marked: hasMark(m, cursor) }) : t("a11y.noCursor");
    case "m": {
      const last = lastMoveOf(m);
      if (last && !last.pass) {
        m.cursor = { x: last.x, y: last.y };
        lastCursor = { ...m.cursor, size };
        bv.draw();
      }
      return A.lastMoveText(last, size);
    }
    case "t":
      return turnSentence(ctx, m);
    case "c":
      return capturesSentence(ctx);
    // The part of the board on screen (a problem window is widened before
    // it is drawn; see windowOf in board.js), not the problem's own view.
    case "r":
      return cursor ? A.rowText(board, cursor.y, { size, view: A.shownWindow(m, size) }) : t("a11y.noCursor");
    case "k":
      return cursor ? A.columnText(board, cursor.x, { size, view: A.shownWindow(m, size) }) : t("a11y.noCursor");
    case "b":
      return A.boardText(board, { size, view: A.shownWindow(m, size) });
    case ",":
    case ".":
      if (ctx?.kind !== "review") return null;
      C.reviewStep(e.key === "," ? -1 : 1);
      return ""; // the move is spoken by useAnnouncements
    default:
      return null;
  }
}

/* ------------------------------------------------------ announcements */

/** The words for the node the review is on. */
export function reviewNodeText(r) {
  const game = r.game;
  const node = game.current;
  let number = 0;
  for (let n = node; n && n.parent; n = n.parent) number++;
  if (!node.parent || !node.move) return A.reviewMoveText({ number: 0 });
  const before = captureTotals(game, node.parent);
  const after = captureTotals(game, node);
  const captured = after.black + after.white - before.black - before.white;
  let loss = null;
  const line = game.mainLine();
  const i = line.findIndex((n) => n.id === node.id);
  if (i > 0 && r.points[i - 1] && r.points[i] && !node.move.pass) {
    const delta = r.points[i].scoreLead - r.points[i - 1].scoreLead;
    loss = node.move.color === 1 ? -delta : delta;
  }
  return A.reviewMoveText({ number, move: node.move, size: game.size, captured, loss });
}

let seen = {};

/** Compare what is on screen with the last render and speak the difference. */
export function watch() {
  const now = { space: state.space };
  // A place reached from the keyboard (⌘1–4, history) is named first.
  if (seen.space && seen.space !== now.space) announce(t("nav." + now.space), { first: true });
  const r = activeReview();
  if (r) {
    now.review = r;
    now.node = r.game.current.id;
    if (seen.review !== r) announce(t("review.title") + t("a11y.sentence") + reviewNodeText(r));
    else if (seen.node !== now.node) announce(reviewNodeText(r), { first: true });
  } else if (state.space === "play" && state.game) {
    const g = state.game;
    now.game = g;
    now.node = g.game.current;
    // An undo: the position went back to an earlier node of the same game.
    if (seen.game === g && seen.node && seen.node !== now.node) {
      let up = seen.node.parent;
      while (up && up !== now.node) up = up.parent;
      if (up) announce(t("a11y.undone") + t("a11y.sentence") + A.turnText(g.game.turn));
    }
  } else if (state.space === "practice") {
    const pr = state.practice;
    const L = pr.view === "lesson" ? pr.lesson : null;
    if (L) {
      now.lesson = L;
      now.step = L.finished ? "done" : L.index;
      if (seen.lesson !== L || seen.step !== now.step) {
        if (L.finished) announce(t("practice.lessonDone"));
        else {
          const goal = L.cur?.kind === "problem" ? C.goalText(L.cur.pz) : "";
          announce([stepText(L), goal].filter(Boolean).join(t("a11y.sentence")));
        }
      }
    }
    const P = pr.view === "problem" ? pr.problem : L?.cur?.kind === "problem" ? L.cur : null;
    if (P) watchProblem(P, now, !L);
    const D = pr.view === "mistake" ? pr.mistake : null;
    if (D) {
      now.drill = D;
      now.status = D.status;
      if (seen.drill !== D) announce([t("mistakes.goal"), t("mistakes.prompt", [Math.round((D.m.loss || 0) * 2) / 2])].join(t("a11y.sentence")));
      else if (seen.status !== D.status) {
        const key = { right: "mistakes.right", same: "mistakes.same", wrong: "mistakes.wrong", revealed: "mistakes.revealed" }[D.status];
        if (key) announce(t(key));
      }
    }
  }
  seen = now;
}

function watchProblem(P, now, standalone) {
  now.problem = P;
  now.last = P.last;
  now.feedback = P.feedback;
  now.answer = P.answer;
  now.hint = P.hintAt;
  const size = P.pz.size;
  if (seen.problem !== P) {
    if (standalone) announce(t("a11y.problem", [C.goalText(P.pz)]));
    return;
  }
  if (P.last && P.last !== seen.last) {
    const color = -P.st.toMove;
    announce(A.moveText({ color, x: P.last.x, y: P.last.y, size, captured: P.st.captured || 0 }), { first: true });
  }
  if (P.feedback !== seen.feedback) {
    if (P.feedback === "retry") announce(t("practice.retryNow"));
    else if (P.feedback === "keep") announce(t("practice.keepGoing"));
  }
  if (P.answer && P.answer !== seen.answer) {
    const line = P.answer.map((m) => A.moveText({ color: m.c ?? m.color ?? (m.n % 2 ? P.pz.userColor : -P.pz.userColor), x: m.x, y: m.y, pass: !!m.pass || m.x == null, size }));
    announce([t("practice.answerShown"), t("a11y.answer", [line.join(t("a11y.listSep"))])].join(t("a11y.sentence")));
  }
  if (P.hintAt && P.hintAt !== seen.hint) announce(t("play.hintAt", [A.coordName(P.hintAt.x, P.hintAt.y, size)]));
}

/** The hook the shell calls once per render. */
export function useAnnouncements() {
  useEffect(() => {
    try {
      watch();
    } catch (_) {
      /* never let speech break the page */
    }
  });
}
