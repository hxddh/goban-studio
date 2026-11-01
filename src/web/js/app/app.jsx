/**
 * The shell: the sidebar with four places (Today, Play, Practice, Library),
 * the native menu bar, keyboard handling, and the place itself. Each place
 * starts with the shared toolbar (chrome.jsx).
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
import { TodayView } from "./today.jsx";
import { PlayView } from "./play.jsx";
import { PracticeView } from "./practice.jsx";
import { LibraryView } from "./library.jsx";
import { Sheets } from "./sheets.jsx";

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

function App() {
  const s = useAppState();
  useEffect(() => {
    document.documentElement.lang = s.settings?.lang === "zh" ? "zh-CN" : s.settings?.lang || "en";
    document.title = "Goban Studio";
  });
  if (!s.ready) return null;
  const focus = isFocus();
  const reviewKey = s.review ? "review-" + s.review.source : "";
  return (
    <div class={`app ${focus ? "focus" : ""}`} data-space={s.space}>
      {!focus && <Sidebar />}
      <main class="main" id="main">
        <div class="place" key={s.space + reviewKey + (s.space === "practice" ? s.practice.view : "")}>
          {s.space === "today" && <TodayView />}
          {s.space === "play" && <PlayView />}
          {s.space === "practice" && <PracticeView />}
          {s.space === "library" && <LibraryView />}
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

/** One table of commands for keyboard, native menus and the page. */
const COMMANDS = {
  "app.settings": () => C.openSheet("settings"),
  "help.shortcuts": () => C.openSheet("shortcuts"),
  "file.new": () => C.openNewGame(),
  "file.import": () => C.pickImport(),
  "file.export": () => (C.playReviewing() || state.review ? C.exportSGF(state.review.game, state.review.meta.name) : C.exportSGF()),
  "game.pass": () => state.space === "play" && C.requestPass(),
  "game.undo": () => (state.space === "practice" ? C.undoProblemMove() : state.space === "play" && !C.playReviewing() ? C.undo() : null),
  "game.hint": () => (state.space === "play" ? C.askHint() : state.space === "practice" ? C.problemHint() : null),
  "game.resign": () => state.space === "play" && C.requestResign(),
  "game.review": () => C.reviewCurrentGame(),
  "game.save": () => C.saveToLibrary(),
  "view.focus": () => C.toggleFocus(),
  "view.coords": () => C.setSetting("coords", !state.settings.coords),
  "view.numbers": () => C.setSetting("numbers", !state.settings.numbers),
  "view.eval": () => C.setSetting("showEval", !state.settings.showEval),
  "view.live": () => C.toggleLive(),
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
      ],
    },
    {
      title: t("menu.go"),
      items: [
        { label: t("nav.today"), command: "go.today", key: "1" },
        { label: t("nav.play"), command: "go.play", key: "2" },
        { label: t("nav.practice"), command: "go.practice", key: "3" },
        { label: t("nav.library"), command: "go.library", key: "4" },
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
    if (state.settings.focus) return C.toggleFocus();
    return;
  }
  if (state.sheet?.kind === "onboarding") return;
  if (mod && !e.altKey) {
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
    if (["1", "2", "3", "4"].includes(k)) {
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
  if (reviewing && !state.review.guess) {
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
  // ← in a live game steps back into review of that game.
  if (!reviewing && state.space === "play" && e.key === "ArrowLeft" && !e.target.closest("canvas") && state.game?.game.mainLine().length > 1) {
    e.preventDefault();
    C.reviewCurrentGame();
    return C.reviewStep(-1);
  }
  if (state.space === "practice" && state.practice.view === "lesson" && e.key === "Enter" && !e.target.closest("button, canvas")) {
    const cur = state.practice.lesson?.cur;
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

export function start() {
  C.boot();
  // Handles for the interface tests (scripts/ui-test.mjs); harmless in use.
  window.__state = state;
  window.__solver = S;
  render(<App />, document.getElementById("root"));
  document.addEventListener("keydown", onKeyDown);
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
