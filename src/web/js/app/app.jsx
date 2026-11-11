/**
 * The shell: the sidebar with the four spaces (v12: Today, Play, Practice, Library)
 * and Settings, the native menu bar, keyboard handling, and the space
 * itself. Each page starts with the shared toolbar (chrome.jsx).
 *
 * Play shows its home (play/home.jsx) or the board (play.jsx), which a
 * finished game turns into its review; Practice its home (the path,
 * practice/path.jsx, then the catalog) or one of its pages (practice.jsx).
 */
import { render } from "preact";
import { useEffect } from "preact/hooks";
import { t } from "../i18n.js";
import * as Host from "../host.js";
import { hasNative, normalizePaths, onDropFiles, onOpenFiles, setupChrome, takeOpenFiles } from "../host.js";
import { state, update, useAppState } from "./store.js";
import { CrashProbe, ErrorBoundary, TaskNotice, Toasts, crashRender, installErrorHandlers } from "./feedback.jsx";
import { matchShortcut, menuKey } from "./shortcuts.js";
import { expose } from "./debug.js";
import { store } from "../data/store.js";
import * as C from "./controller.js";
import * as S from "../solver.js";
import { Sidebar, isFocus } from "./chrome.jsx";
import { PlayView } from "./play.jsx";
import { ReviewView } from "./review.jsx";
import { PracticeView } from "./practice.jsx";
import { LibraryHome, PlayStart } from "../play/home.jsx";
import { TodayView } from "./today.jsx";
import { Sheets } from "./sheets.jsx";
import { ExplorerView } from "./explorer.jsx";
import { useAnnouncements } from "./announcer.js";
import { installKeys, textSizeKeys } from "./a11y-keys.js";
import { BootError, ReadOnlyBanner, StoreProblem } from "./safety.jsx";

/** What Play shows: a review, the board, or (no game on it) what to play. */
function PlaySpace() {
  if (C.playReviewing()) return <ReviewView />;
  // The game view, or a game in progress (v13: play-ctl playShowsBoard); else what to play.
  return C.playShowsBoard() ? <PlayView /> : <PlayStart />;
}

/** What the Library shows: a review of a record or classic, the explorer, or its list. */
function LibrarySpace() {
  if (state.review && state.review.meta.space === "library") return <ReviewView />;
  if (state.play.explorer) return <ExplorerView />;
  return <LibraryHome />;
}

function App() {
  const s = useAppState();
  useEffect(() => {
    document.documentElement.lang = s.settings?.lang === "zh" ? "zh-CN" : s.settings?.lang || "en";
    document.title = "Goban Studio";
  });
  useAnnouncements(); // v6 a11y: review moves, problems, lessons
  // v13: no bridge in the packaged app, or the store could not be read (app/safety.jsx).
  if (s.bootError) return <BootError />;
  if (!s.ready) return null;
  if (s.storeProblem && !s.storeProblem.continued) return <StoreProblem />;
  return <Shell s={s} />;
}

/** The app itself: the sidebar, the page of the space, and what lies over them. */
function Shell({ s }) {
  const focus = isFocus();
  // The game that ends turns into its review on the same page (no new place).
  const reviewKey = s.review && !(s.review.source === "current" && s.review.meta.inPlace) ? "review-" + s.review.source : "";
  const page = s.space === "practice" ? s.practice.view : s.space === "library" ? (s.play.explorer ? "explorer" : "list") : s.space === "play" ? s.play.view : "today";
  const place = s.space + reviewKey + page;
  return (
    <div class={`app ${focus ? "focus" : ""}`} data-space={s.space}>
      {!focus && <Sidebar />}
      <main class="main" id="main">
        {s.storeProblem && <ReadOnlyBanner />}
        <TaskNotice />
        {/* A page that throws is replaced by an error card; the sidebar stays (feedback.jsx). */}
        <ErrorBoundary resetKey={place}>
          <div class="place" key={place}>
            <CrashProbe at="page" />
            {s.space === "today" && <TodayView />}
            {s.space === "play" && <PlaySpace />}
            {s.space === "practice" && <PracticeView />}
            {s.space === "library" && <LibrarySpace />}
          </div>
        </ErrorBoundary>
      </main>
      <Sheets />
      <Toasts />
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {s.announce}
      </div>
      <input
        id="file-input"
        type="file"
        accept=".sgf,application/x-go-sgf"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files || [])];
          if (files.length) C.importFiles(files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ commands */

/** The game's board is what Play shows (not its home or a review). */
function onBoard() {
  return C.boardShown();
}

/** A review is what the space on screen shows. */
function reviewOnScreen() {
  return !!state.review && (state.review.meta.space || "play") === state.space;
}

/** One table of commands for keyboard, native menus and the page. */
const COMMANDS = {
  "app.settings": () => C.openSheet("settings"),
  "help.shortcuts": () => C.openSheet("shortcuts"),
  "help.checkUpdates": () => C.checkForUpdates(),
  "file.new": () => C.openNewGame(),
  "file.import": () => C.pickImport(),
  "file.export": () => (C.playReviewing() || state.review ? C.exportSGF(state.review.game, state.review.meta.name) : C.exportSGF()),
  "game.pass": () => onBoard() && C.requestPass(),
  // In a review on screen ⌘Z takes back an edit of the record; in a game, a move.
  "game.undo": () => (reviewOnScreen() ? C.reviewUndo() : state.space === "practice" ? C.undoProblemMove() : onBoard() ? C.undo() : null),
  "game.redo": () => (reviewOnScreen() ? C.reviewRedo() : onBoard() ? C.redo() : null),
  "game.hint": () => (onBoard() ? C.askHint() : state.space === "practice" ? C.problemHint() : null),
  "game.resign": () => onBoard() && C.requestResign(),
  "game.review": () => C.reviewCurrentGame(),
  // Only where the game is: in another space the board is not on screen,
  // and saving a game you cannot see would be a surprise.
  "game.save": () => state.space === "play" && !!state.game && C.saveToLibrary(),
  "view.focus": () => C.toggleFocus(),
  "view.coords": () => C.setSetting("coords", !state.settings.coords),
  "view.numbers": () => C.setSetting("numbers", !state.settings.numbers),
  "view.eval": () => C.setSetting("showEval", !state.settings.showEval),
  "view.live": () => C.toggleLive(),
  "view.largeText": () => C.setSetting("largeText", !state.settings.largeText),
  "go.today": () => C.goSpace("today"),
  "go.play": () => C.goSpace("play"),
  "go.practice": () => C.goSpace("practice"),
  "go.library": () => C.goSpace("library"),
  "go.back": () => C.back(),
  "go.forward": () => C.forward(),
};

function runCommand(id) {
  const fn = COMMANDS[id];
  if (fn) fn();
}

/** The native menu bar (macOS), in the interface language. */
function menuSpec() {
  const s = state.settings;
  return [
    {
      title: t("menu.game"),
      items: [
        { label: t("common.newGame"), command: "file.new", ...menuKey("file.new") },
        { label: t("library.import"), command: "file.import", ...menuKey("file.import") },
        { label: t("common.exportSgf"), command: "file.export", ...menuKey("file.export") },
        { separator: true },
        { label: t("common.pass"), command: "game.pass", ...menuKey("game.pass") },
        { label: t("common.undo"), command: "game.undo" },
        { label: t("common.redo"), command: "game.redo" },
        { label: t("common.hint"), command: "game.hint", ...menuKey("game.hint") },
        { label: t("play.reviewSoFar"), command: "game.review", ...menuKey("game.review") },
        { label: t("play.save"), command: "game.save", ...menuKey("game.save") },
        { separator: true },
        { label: t("common.resign"), command: "game.resign" },
      ],
    },
    {
      title: t("menu.view"),
      items: [
        { label: t("play.focus"), command: "view.focus", ...menuKey("view.focus"), checked: !!s.focus },
        { label: t("settings.coordinates"), command: "view.coords", checked: !!s.coords },
        { label: t("settings.moveNumbers"), command: "view.numbers", checked: !!s.numbers },
        { label: t("settings.showEval"), command: "view.eval", checked: !!s.showEval },
        { label: t("settings.liveAnalysis"), command: "view.live", checked: !!s.liveAnalysis },
        { separator: true },
        { label: t("a11y.largeText"), command: "view.largeText", checked: !!s.largeText },
      ],
    },
    {
      title: t("menu.go"),
      items: [
        { label: t("nav.today"), command: "go.today", ...menuKey("go.today") },
        { label: t("nav.play"), command: "go.play", ...menuKey("go.play") },
        { label: t("nav.practice"), command: "go.practice", ...menuKey("go.practice") },
        { label: t("nav.library"), command: "go.library", ...menuKey("go.library") },
        { separator: true },
        { label: t("nav.back"), command: "go.back", ...menuKey("go.back") },
        { label: t("nav.forward"), command: "go.forward", ...menuKey("go.forward") },
      ],
    },
    {
      title: t("menu.help"),
      items: [
        { label: t("nav.settings"), command: "app.settings", ...menuKey("app.settings") },
        { label: t("shortcuts.title"), command: "help.shortcuts", ...menuKey("help.shortcuts") },
        { separator: true },
        { label: t("update.check"), command: "help.checkUpdates" },
      ],
    },
  ];
}

function installMenus() {
  if (typeof Host.setNativeMenus !== "function") return;
  try {
    Host.setNativeMenus(menuSpec());
  } catch (_) {}
}

/* --------------------------------------------------------------- keyboard */

function onKeyDown(e) {
  const typing = e.target.closest?.("input, select, textarea") && !(e.target.type === "range" || e.target.type === "checkbox");
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === "Escape") {
    if (state.menu) return update({ menu: null });
    if (state.sheet) return C.closeSheet();
    if (state.game?.ghost) return C.clearGhost();
    if (C.clearProblemGhost()) return;
    if (C.boardShown() && C.cancelPass()) return;
    if (state.review?.recount) return C.cancelRecount();
    if (state.review?.trial) return C.closeTrial();
    if (state.review?.draft) return C.discardDraft();
    if (state.review?.variation) {
      state.review.variation = null;
      return update();
    }
    if (state.review && (state.review.meta.space || "play") === state.space) return C.closeReview();

    // The explorer: Esc goes back to the Library.
    if (state.space === "library" && state.play.explorer) return C.closeExplorer();
    if (state.settings.focus) return C.toggleFocus();
    return;
  }
  if (state.sheet?.kind === "onboarding") return;
  if (mod && !e.altKey) {
    if (textSizeKeys(e)) return;
    // Every ⌘/Ctrl shortcut is in one table (shortcuts.js), which the
    // shortcuts sheet and the menu bar read too.
    const sc = matchShortcut(e, { sheet: !!state.sheet, typing: !!typing });
    if (sc) {
      e.preventDefault();
      runCommand(sc.command);
    }
    return;
  }
  if (e.altKey && !mod && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    return runCommand(e.key === "ArrowLeft" ? "go.back" : "go.forward");
  }
  if (state.sheet || typing || e.altKey) return;
  const reviewing = state.review && (state.review.meta.space || "play") === state.space;
  if (reviewing && state.review.variation?.story && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    return C.storyStep(e.key === "ArrowLeft" ? -1 : 1);
  }
  if (reviewing) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      return C.reviewStep(-1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      return C.reviewStep(1);
    }
    if (e.key === "Home") return C.reviewGoto(0);
    if (e.key === "End") return C.reviewGoto(Infinity);
  }
  // v6 explorer: ← / → step through the line, Home goes back to the start.
  if (!reviewing && state.space === "library" && state.play.explorer) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      return C.explorerStep(e.key === "ArrowLeft" ? -1 : 1);
    }
    if (e.key === "Home") return C.explorerReset();
  }
  // (← and → do nothing during a game: looking back is "Review so far", chosen from the menu.)
  // (Not the Enter that confirms an input method's candidate.)
  if (state.space === "practice" && state.practice.view === "lesson" && e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && !e.target.closest("button, canvas")) {
    const cur = state.practice.lesson?.cur;
    if (cur && (cur.kind === "read" || cur.result === "right" || cur.status === "won" || cur.answer)) C.lessonContinue();
  }
  if (e.key === "?") C.openSheet("shortcuts");
}

/* ---------------------------------------------------------- native events */

async function drainOpenFiles() {
  const paths = (await takeOpenFiles()).filter((path) => /\.sgf$/i.test(path));
  if (paths.length) await C.importPaths(paths);
}

/** Files dropped on the window or opened with the app: every .sgf among them is imported. */
function importPaths(detail) {
  const paths = normalizePaths((detail && detail.paths) || detail);
  if (paths.length) C.importPaths(paths);
}

/** ⌘V on the Library's list (not in a field, a sheet, a review or the explorer): an SGF on the clipboard is imported. */
function onPaste(e) {
  if (state.space !== "library" || state.sheet || state.review || state.play.explorer) return;
  if (e.target?.closest?.("input, select, textarea")) return;
  const text = e.clipboardData?.getData("text") || "";
  if (!text.trim()) return;
  e.preventDefault();
  C.pasteSGF(text);
}

export async function start() {
  // First, so nothing that goes wrong from here on is silent (feedback.jsx).
  installErrorHandlers();
  // The store opens before the first render (docs/v9.md, "Storage").
  await C.boot();
  // Handles for the interface tests (scripts/ui-test.mjs), only in a
  // browser a test drives (debug.js): nothing is put on window otherwise.
  expose("__state", state);
  expose("__solver", S);
  expose("__autoAnalyse", () => C.autoAnalyse({ offline: true }));
  expose("__crashRender", crashRender);
  render(
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>,
    document.getElementById("root"),
  );
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("paste", onPaste);
  installKeys();
  // Mouse back/forward buttons move through history.
  window.addEventListener("mouseup", (e) => {
    if (e.button === 3) C.back();
    if (e.button === 4) C.forward();
  });
  setTimeout(() => setupChrome().catch(() => {}), 0);
  onDropFiles(importPaths);
  onOpenFiles(importPaths);
  C.onMenusChanged(installMenus);
  if (typeof Host.onMenuCommand === "function") Host.onMenuCommand(runCommand);
  setInterval(C.clockTick, 250);
  if (hasNative()) {
    installMenus();
    drainOpenFiles();
    window.addEventListener("focus", drainOpenFiles);
    let n = 0;
    const timer = setInterval(() => {
      drainOpenFiles();
      if (++n >= 6) clearInterval(timer);
    }, 1500);
    // Release checks: the packaged self-test (GOBAN_SELFTEST_OUT, or the
    // updater's probe) and the screenshot tour (GOBAN_TOUR_OUT). v13: one
    // look at the host's configuration, and their modules are evaluated
    // only when it asks for them (never in a normal launch).
    setTimeout(() => {
      Host.selftestConfig().then((c) => {
        if (c?.enabled || c?.updateProbe) import("../selftest.js").then((m) => m.runSelfTest({ state }));
        if (c?.tour) setTimeout(() => import("../tour.js").then((m) => m.runTour(c)), 300);
      });
    }, 900);
  }
  // Whatever the store has not written yet goes out when the page goes (data/store.js).
  window.addEventListener("pagehide", () => {
    store.flush();
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    C.importFiles(files);
  });
}

export { COMMANDS, menuSpec };
