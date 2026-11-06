/**
 * The shell: the sidebar with the two spaces (Play and Learn, docs/v9.md)
 * and Settings, the native menu bar, keyboard handling, and the space
 * itself. Each page starts with the shared toolbar (chrome.jsx).
 *
 * Play shows its home (play/home.jsx) or the board (play.jsx); Learn its
 * home (the path, learn/path.jsx, then the catalog) or one of its pages
 * (practice.jsx). The report page and the review layer open over either.
 */
import { render } from "preact";
import { useEffect } from "preact/hooks";
import { t } from "../i18n.js";
import * as Host from "../host.js";
import { hasNative, normalizePaths, onDropFiles, onOpenFiles, setupChrome, takeOpenFiles } from "../host.js";
import { state, update, useAppState, toast } from "./store.js";
import * as C from "./controller.js";
import * as S from "../solver.js";
import { SPACES, Sidebar, isFocus } from "./chrome.jsx";
import { PlayView, ReviewView } from "./play.jsx";
import { PracticeView } from "./practice.jsx";
import { PlayHome } from "../play/home.jsx";
import { Sheets } from "./sheets.jsx";
import { ExplorerView } from "./explorer.jsx";
import { ReportView } from "./report.jsx";
import { useAnnouncements } from "./announcer.js";
import { installKeys, textSizeKeys } from "./a11y-keys.js";

function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {state.toasts.map((x) => (
        <div class={`toast ${x.tone}`} key={x.id}>
          {x.message}
        </div>
      ))}
    </div>
  );
}

/** What Play shows: a review, the explorer, the board, or its home. */
function PlaySpace() {
  if (C.playReviewing()) return <ReviewView />;
  if (state.play.explorer) return <ExplorerView />;
  return state.play.view === "game" ? <PlayView /> : <PlayHome />;
}

function App() {
  const s = useAppState();
  useEffect(() => {
    document.documentElement.lang = s.settings?.lang === "zh" ? "zh-CN" : s.settings?.lang || "en";
    document.title = "Goban Studio";
  });
  useAnnouncements(); // v6 a11y: review moves, problems, lessons
  if (!s.ready) return null;
  const focus = isFocus();
  const reviewKey = s.review ? "review-" + s.review.source : "";
  const report = C.reportVisible();
  const page = s.space === "learn" ? s.learn.view : s.play.explorer ? "explorer" : s.play.view;
  return (
    <div class={`app ${focus ? "focus" : ""}`} data-space={s.space}>
      {!focus && <Sidebar />}
      <main class="main" id="main">
        <div class="place" key={s.space + reviewKey + (report ? "report" : "") + page}>
          {report && <ReportView />}
          {!report && s.space === "play" && <PlaySpace />}
          {!report && s.space === "learn" && <PracticeView />}
        </div>
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
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) C.importFromFile(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ commands */

/** The game's board is what Play shows (not its home, a review or the report). */
function onBoard() {
  return state.space === "play" && state.play.view === "game" && !state.play.explorer && !C.playReviewing() && !C.reportVisible();
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
  "game.undo": () => (state.space === "learn" ? C.undoProblemMove() : onBoard() ? C.undo() : null),
  "game.hint": () => (onBoard() ? C.askHint() : state.space === "learn" ? C.problemHint() : null),
  "game.resign": () => onBoard() && C.requestResign(),
  "game.review": () => C.reviewCurrentGame(),
  "game.save": () => C.saveToLibrary(),
  "view.focus": () => C.toggleFocus(),
  "view.coords": () => C.setSetting("coords", !state.settings.coords),
  "view.numbers": () => C.setSetting("numbers", !state.settings.numbers),
  "view.eval": () => C.setSetting("showEval", !state.settings.showEval),
  "view.live": () => C.toggleLive(),
  "view.largeText": () => C.setSetting("largeText", !state.settings.largeText),
  "go.play": () => C.goSpace("play"),
  "go.learn": () => C.goSpace("learn"),
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
        { label: t("common.newGame"), command: "file.new", key: "n" },
        { label: t("library.import"), command: "file.import", key: "o" },
        { label: t("common.exportSgf"), command: "file.export", key: "e", shift: true },
        { separator: true },
        { label: t("common.pass"), command: "game.pass", key: "p", shift: true },
        { label: t("common.undo"), command: "game.undo" },
        { label: t("common.hint"), command: "game.hint", key: "h", shift: true },
        { label: t("play.reviewSoFar"), command: "game.review", key: "r", shift: true },
        { label: t("play.save"), command: "game.save", key: "s" },
        { separator: true },
        { label: t("common.resign"), command: "game.resign" },
      ],
    },
    {
      title: t("menu.view"),
      items: [
        { label: t("play.focus"), command: "view.focus", key: ".", checked: !!s.focus },
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
        { label: t("nav.play"), command: "go.play", key: "1" },
        { label: t("nav.learn"), command: "go.learn", key: "2" },
        { separator: true },
        { label: t("nav.back"), command: "go.back", key: "[" },
        { label: t("nav.forward"), command: "go.forward", key: "]" },
      ],
    },
    {
      title: t("menu.help"),
      items: [
        { label: t("nav.settings"), command: "app.settings", key: "," },
        { label: t("shortcuts.title"), command: "help.shortcuts", key: "/" },
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
  const k = e.key.toLowerCase();
  if (e.key === "Escape") {
    if (state.menu) return update({ menu: null });
    if (state.sheet) return C.closeSheet();
    if (state.game?.ghost) return C.clearGhost();
    if (state.review?.variation) {
      state.review.variation = null;
      return update();
    }
    if (state.review && (state.review.meta.space || "play") === state.space) return C.closeReview();
    if (C.reportVisible()) return C.closeReport();

    // The explorer: Esc goes back to Play's home.
    if (state.space === "play" && state.play.explorer) return C.closeExplorer();
    if (state.settings.focus) return C.toggleFocus();
    return;
  }
  if (state.sheet?.kind === "onboarding") return;
  if (mod && !e.altKey) {
    if (textSizeKeys(e)) return;
    const map = { n: "file.new", ",": "app.settings", "/": "help.shortcuts", "?": "help.shortcuts", o: "file.import", "[": "go.back", "]": "go.forward" };
    if (!e.shiftKey && map[k]) {
      e.preventDefault();
      return runCommand(map[k]);
    }
    if (state.sheet) return;
    if (k === ".") {
      e.preventDefault();
      return runCommand("view.focus");
    }
    if (k === "1" || k === "2") {
      e.preventDefault();
      return C.goSpace(SPACES[Number(k) - 1].id);
    }
    if (typing) return;
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      return runCommand("game.undo");
    }
    if (k === "s" && !e.shiftKey) {
      e.preventDefault();
      return runCommand("game.save");
    }
    if (e.shiftKey && k === "p") {
      e.preventDefault();
      return runCommand("game.pass");
    }
    if (e.shiftKey && k === "h") {
      e.preventDefault();
      return runCommand("game.hint");
    }
    if (e.shiftKey && k === "r") {
      e.preventDefault();
      return runCommand("game.review");
    }
    if (e.shiftKey && k === "e") {
      e.preventDefault();
      return runCommand("file.export");
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
  if (!reviewing && state.space === "play" && state.play.explorer) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      return C.explorerStep(e.key === "ArrowLeft" ? -1 : 1);
    }
    if (e.key === "Home") return C.explorerReset();
  }
  // ← in a live game steps back into review of that game.
  if (!reviewing && onBoard() && e.key === "ArrowLeft" && !e.target.closest("canvas") && state.game?.game.mainLine().length > 1) {
    e.preventDefault();
    C.reviewCurrentGame();
    return C.reviewStep(-1);
  }
  if (state.space === "learn" && state.learn.view === "lesson" && e.key === "Enter" && !e.target.closest("button, canvas")) {
    const cur = state.learn.lesson?.cur;
    if (cur && (cur.kind === "read" || cur.result === "right" || cur.status === "won" || cur.answer)) C.lessonContinue();
  }
  if (e.key === "?") C.openSheet("shortcuts");
}

/* ---------------------------------------------------------- native events */

async function drainOpenFiles() {
  const paths = await takeOpenFiles();
  for (const path of paths) if (/\.sgf$/i.test(path)) await C.importFromPath(path);
}

function importPaths(detail) {
  const paths = normalizePaths((detail && detail.paths) || detail);
  const sgf = paths.find((p) => /\.sgf$/i.test(p));
  if (sgf) C.importFromPath(sgf);
  else if (paths.length) toast(t("library.onlySgf"), "warn");
}

export async function start() {
  // The store opens before the first render (docs/v9.md, "Storage").
  await C.boot();
  // Handles for the interface tests (scripts/ui-test.mjs); harmless in use.
  window.__state = state;
  window.__solver = S;
  window.__autoAnalyse = () => C.autoAnalyse({ offline: true });
  render(<App />, document.getElementById("root"));
  document.addEventListener("keydown", onKeyDown);
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
    setTimeout(() => import("../selftest.js").then((m) => m.runSelfTest({ state })), 900);
    // v4 release checks: the screenshot tour, only when the host was launched with GOBAN_TOUR_OUT.
    setTimeout(() => Host.selftestConfig().then((c) => c?.tour && import("../tour.js").then((m) => m.runTour(c))), 1200);
  }
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (/\.sgf$/i.test(f.name)) C.importFromFile(f);
    else toast(t("library.onlySgf"), "warn");
  });
}

export { COMMANDS, menuSpec };
