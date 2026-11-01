/**
 * The shell: a slim rail with three places, and the place itself.
 */
import { render } from "preact";
import { useEffect } from "preact/hooks";
import { Game } from "../rules.js";
import * as Engine from "../engine.js";
import * as KataGo from "../katago.js";
import { t } from "../i18n.js";
import { APP_VERSION } from "../version.js";
import {
  hasNative,
  normalizePaths,
  onDropFiles,
  onOpenFiles,
  selftestConfig,
  setupChrome,
  takeOpenFiles,
  writeTextFile,
} from "../host.js";
import { state, update, useAppState, toast } from "./store.js";
import * as C from "./controller.js";
import { Icon, MOD } from "./parts.jsx";
import { PlayView } from "./play.jsx";
import { PracticeView } from "./practice.jsx";
import { LibraryView } from "./library.jsx";
import { Sheets } from "./sheets.jsx";

const SPACES = [
  { id: "play", icon: "play", key: "nav.play" },
  { id: "practice", icon: "practice", key: "nav.practice" },
  { id: "library", icon: "library", key: "nav.library" },
];

function Rail() {
  return (
    <nav class="rail" aria-label={t("nav.main")}>
      <div class="rail-top" data-drag>
        <span class="mark" aria-hidden="true">
          <i />
          <i />
        </span>
      </div>
      <ul>
        {SPACES.map((sp, i) => (
          <li>
            <button
              type="button"
              class={`rail-btn ${state.space === sp.id ? "on" : ""}`}
              aria-current={state.space === sp.id ? "page" : undefined}
              title={`${t(sp.key)} (${MOD}${i + 1})`}
              onClick={() => C.goSpace(sp.id)}
            >
              <Icon name={sp.icon} size={20} />
              <span>{t(sp.key)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="rail-foot">
        <button type="button" class="rail-btn small" title={`${t("nav.settings")} (${MOD},)`} aria-label={t("nav.settings")} onClick={() => C.openSheet("settings")}>
          <Icon name="gear" size={19} />
        </button>
      </div>
    </nav>
  );
}

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
  const focus = s.settings.focus && s.space === "play" && !C.playReviewing();
  return (
    <div class={`app ${focus ? "focus" : ""}`} data-space={s.space}>
      {!focus && <Rail />}
      <main class="main" id="main">
        {s.space === "play" && <PlayView />}
        {s.space === "practice" && <PracticeView />}
        {s.space === "library" && <LibraryView />}
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

/* --------------------------------------------------------------- keyboard */

function onKeyDown(e) {
  const typing = e.target.closest?.("input, select, textarea") && !(e.target.type === "range" || e.target.type === "checkbox");
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (e.key === "Escape") {
    if (state.menu) return update({ menu: null });
    if (state.sheet) return C.closeSheet();
    if (state.review?.variation) {
      state.review.variation = null;
      return update();
    }
    if (state.settings.focus) return C.toggleFocus();
    return;
  }
  if (state.sheet?.kind === "onboarding") return;
  if (mod && !e.altKey) {
    if (k === "n" && !e.shiftKey) {
      e.preventDefault();
      return C.openSheet("newGame");
    }
    if (k === "," ) {
      e.preventDefault();
      return C.openSheet("settings");
    }
    if (k === "/" || k === "?") {
      e.preventDefault();
      return C.openSheet("shortcuts");
    }
    if (state.sheet) return;
    if (k === "." ) {
      e.preventDefault();
      return C.toggleFocus();
    }
    if (["1", "2", "3"].includes(k)) {
      e.preventDefault();
      return C.goSpace(SPACES[Number(k) - 1].id);
    }
    if (typing) return;
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      if (state.space === "practice") return C.undoProblemMove();
      if (state.space === "play" && !C.playReviewing()) return C.undo();
      return;
    }
    if (k === "p" && e.shiftKey && state.space === "play") {
      e.preventDefault();
      return C.requestPass();
    }
    if (k === "h" && e.shiftKey) {
      e.preventDefault();
      if (state.space === "play") return C.askHint();
      if (state.space === "practice") return C.problemHint();
    }
    return;
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

/**
 * A packaged build is launched by the release workflows with
 * GOBAN_SELFTEST_OUT set. The report is written from the real WebView: it
 * proves the page, the native bridge and KataGo's analysis all came up on
 * 9×9 and 19×19, not just that the executable linked.
 */
async function runSelfTest() {
  if (!hasNative()) return;
  const cfg = await selftestConfig();
  if (!cfg?.enabled || !cfg.path) return;
  const checks = { webview: true, bridge: typeof window.zero?.invoke === "function", ui: !!document.querySelector(".app") };
  const report = { version: APP_VERSION, language: state.settings.lang, checks };
  try {
    const g19 = new Game({ size: 19, komi: 6.5 });
    const a19 = await KataGo.analyze(g19, { visits: 16 });
    checks.analyze19 = !!(a19 && Number.isFinite(a19.winrate) && a19.ownership?.length === 361 && a19.moves.length > 0);
    report.winrate19 = a19?.winrate ?? null;
    const g9 = new Game({ size: 9, komi: 6.5 });
    g9.play(4, 4);
    const a9 = await KataGo.analyze(g9, { visits: 16 });
    checks.analyze9 = !!(a9 && Number.isFinite(a9.scoreLead) && a9.ownership?.length === 81);
    const h = new Game({ size: 19, komi: 0.5, handicap: 4 });
    const move = await Engine.chooseMove(h, "5k");
    checks.handicapMove = !!(move && !move.pass && h.canPlay(move.x, move.y).ok);
    report.engineMove = move && !move.pass ? `${move.x},${move.y}` : "";
    report.boardSize = 19;
  } catch (error) {
    report.error = String(error?.message || error);
  }
  report.ok = Object.values(checks).every(Boolean) && ["analyze19", "analyze9", "handicapMove"].every((k) => checks[k]);
  await writeTextFile(cfg.path, JSON.stringify(report, null, 2) + "\n");
}

export function start() {
  C.boot();
  render(<App />, document.getElementById("root"));
  document.addEventListener("keydown", onKeyDown);
  setTimeout(() => setupChrome().catch(() => {}), 0);
  onDropFiles(importPaths);
  onOpenFiles(importPaths);
  if (hasNative()) {
    drainOpenFiles();
    window.addEventListener("focus", drainOpenFiles);
    // Some hosts queue a launch document without an event; check a few
    // times after start, then rely on focus and the open:files event.
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

