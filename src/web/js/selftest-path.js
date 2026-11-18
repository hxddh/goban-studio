/**
 * The packaged self-test's user path (selftest.js, check `userPath`).
 *
 * WKWebView cannot be driven from outside, so on macOS the packaged app
 * walks a player's first minutes itself: each step calls what the button
 * a person presses calls (the app's controller) and then reads the page,
 * as a person would see it, until it shows the result. On Windows
 * scripts/packaged-ui.mjs clicks the same path from outside as well.
 *
 *   language   the language changed as Settings changes it; the sidebar
 *              shows the new language, then the old one again
 *   lesson     the first lesson opens from Practice (its steps are read
 *              from content/course.json); its title and steps are shown
 *   problem    the first problem opens (content/problems.json); a board
 *              and the goal are shown
 *   classic    the first classic opens in review (content/classics.js
 *              records, content/classics.json)
 *   explorer   the openings explorer opens (content/book.json) and lists
 *              book moves for the empty board
 *   game       a new two-player 9×9 game; a move played on it; the move
 *              count says one move
 *   review     that game's review opens and shows its moves
 *
 * Every step is timed and records what the page showed (or why not). The
 * start is put back afterwards: the language, the place, the open sheet and
 * the game that was on the board.
 */

export const USER_PATH = ["language", "lesson", "problem", "classic", "explorer", "game", "review"];
const STEP_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
const textOf = (sel) => squash(document.querySelector(sel)?.textContent);

/**
 * Wait until `read()` returns something truthy (polled every 50 ms, up to
 * `ms`). Throws with `what` and the last value read when it never does.
 */
export async function waitUntil(read, what, ms = STEP_MS) {
  const end = Date.now() + ms;
  let last = null;
  for (;;) {
    try {
      last = read();
    } catch (e) {
      last = `error: ${e?.message || e}`;
    }
    if (last && !(typeof last === "string" && last.startsWith("error: "))) return last;
    if (Date.now() >= end) throw new Error(`${what} (after ${ms} ms; last: ${JSON.stringify(last)})`);
    await sleep(50);
  }
}

/**
 * Run `steps` (`[name, run]`, run returning what the page showed) in
 * order. A step that throws fails, and the next steps still run (each
 * starts from a controller call of its own). Returns
 * `{ ok, steps: { name: { ok, ms, shown?, error? } } }`.
 */
export async function runSteps(steps) {
  /** @type {Record<string, { ok: boolean, ms: number, shown?: any, error?: string }>} */
  const out = {};
  for (const [name, run] of steps) {
    const t0 = Date.now();
    try {
      const shown = await run();
      out[name] = { ok: true, ms: Date.now() - t0, shown };
    } catch (e) {
      out[name] = { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
    }
  }
  return { ok: Object.values(out).every((s) => s.ok) && Object.keys(out).length === steps.length, steps: out };
}

/** The user path against the running app. */
export async function runUserPath() {
  const C = await import("./app/controller.js");
  const { state, update } = await import("./app/store.js");
  const I18n = await import("./i18n.js");
  const Games = await import("./data/games.js");

  const start = { lang: state.settings.lang, space: state.space, playView: state.play.view, sheet: state.sheet, game: state.game };
  const nav = () => textOf("nav");

  /** @type {Array<[string, () => Promise<any>]>} */
  const steps = [
    [
      "language",
      async () => {
        const other = start.lang === "zh" ? "en" : "zh";
        const before = nav();
        C.setSetting("lang", other);
        const shown = await waitUntil(() => I18n.currentLang() === other && nav() !== before && nav().includes(I18n.t("nav.today")) && nav(), `the sidebar in ${other}`);
        C.setSetting("lang", start.lang);
        await waitUntil(() => I18n.currentLang() === start.lang && nav().includes(I18n.t("nav.today")), `the sidebar back in ${start.lang}`);
        return { lang: other, sidebar: shown.slice(0, 60) };
      },
    ],
    [
      "lesson",
      async () => {
        C.goSpace("practice");
        const first = C.COURSE[0].lessons[0];
        await C.openLesson(first.id, 0);
        const title = C.tx(first.title);
        const shown = await waitUntil(() => document.querySelector(".panel .steps") && textOf(".panel .lesson-text") && textOf(".panel-title h1") === title && textOf(".panel .lesson-text"), `lesson "${title}" with its first step`);
        return { lesson: first.id, title, text: shown.slice(0, 60) };
      },
    ],
    [
      "problem",
      async () => {
        const first = C.PROBLEMS[0];
        await C.openProblem(first.id);
        const shown = await waitUntil(() => state.practice.view === "problem" && document.querySelector(".stage canvas.board") && textOf(".panel h1.goal"), `problem ${first.id} with its goal`);
        return { problem: first.id, goal: shown.slice(0, 60) };
      },
    ],
    [
      "classic",
      async () => {
        const first = C.CLASSICS[0];
        await C.openClassic(first.id);
        const shown = await waitUntil(() => state.review?.meta?.classicId === first.id && document.querySelector(".review-layer canvas.board") && textOf(".toolbar h1"), `classic ${first.id} in review`);
        const moves = state.review.game.mainLine().length - 1;
        if (moves < 50) throw new Error(`classic ${first.id} has ${moves} moves (its record was not read)`);
        C.goSpace("library");
        await waitUntil(() => !document.querySelector(".review-layer"), "the classic's review closed");
        return { classic: first.id, title: shown.slice(0, 60), moves };
      },
    ],
    [
      "explorer",
      async () => {
        C.openExplorer("whole");
        const rows = await waitUntil(() => document.querySelector(".explorer-panel") && document.querySelectorAll(".explorer-row").length, "the explorer with book moves");
        const inBook = document.querySelectorAll('.explorer-row[data-in-book="1"]').length;
        if (!inBook) throw new Error(`the explorer lists ${rows} moves, none from the book`);
        C.closeExplorer();
        await waitUntil(() => !document.querySelector(".explorer-panel"), "the explorer closed");
        return { rows, inBook };
      },
    ],
    [
      "game",
      async () => {
        C.newGame({ size: 9, opponent: "human", handicap: 0, timeControl: "none" });
        await waitUntil(() => state.space === "play" && document.querySelector(".stage canvas.board"), "a new 9×9 game on the board");
        const g = state.game;
        C.humanPlay(4, 4);
        if (state.settings.confirmMove) C.humanPlay(4, 4);
        const want = I18n.tn("play.moveN", 1);
        const shown = await waitUntil(() => state.game === g && g.game.moveNumber === 1 && textOf(".toolbar .tb-sub").includes(want) && textOf(".toolbar .tb-sub"), `"${want}" after a move`);
        // A second move, so the review has a line to show.
        C.humanPlay(2, 2);
        if (state.settings.confirmMove) C.humanPlay(2, 2);
        await waitUntil(() => g.game.moveNumber === 2, "the second move");
        return { facts: shown };
      },
    ],
    [
      "review",
      async () => {
        C.reviewCurrentGame();
        const shown = await waitUntil(() => state.review?.source === "current" && document.querySelector(".review-layer canvas.board") && textOf(".review-layer .panel"), "the game's review");
        C.closeReview();
        await waitUntil(() => !document.querySelector(".review-layer"), "the review closed");
        return { panel: shown.slice(0, 60) };
      },
    ],
  ];

  let result;
  try {
    result = await runSteps(steps);
  } finally {
    restore(C, Games, state, update, start);
  }
  return result;
}

/** Back to where the path started: the language, the game, the place, the sheet. */
function restore(C, Games, state, update, start) {
  try {
    if (state.review) C.closeReview();
    if (state.play?.explorer) C.closeExplorer();
    if (state.settings.lang !== start.lang) C.setSetting("lang", start.lang);
    update((s) => {
      s.game = start.game;
      s.space = start.space;
      s.play = { ...s.play, view: start.playView, explorer: null };
      s.sheet = start.sheet;
    });
    if (start.game) C.persistCurrent();
    else Games.clearCurrent();
  } catch (e) {
    console.warn("self-test: the start could not be put back", e);
  }
}
