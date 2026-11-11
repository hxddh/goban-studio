/**
 * Starting the app: the store first, then settings, the player model and the
 * game; and onboarding's last step.
 */
import { BLACK } from "../rules.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { SETTINGS_KEY, loadSettings } from "../data/settings.js";
import { CURRENT_KEY, GAMES_PREFIX, migrateFile } from "../data/migrate.js";
import { BACKUPS_PREFIX, expireSnapshots } from "../data/backup.js";
import { normalizeProfile, setPriorRank } from "../model/profile.js";
import { detectLang, setLang, t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasNative, isPackaged } from "../host.js";
import { onContentWait, preload as preloadContent, withContent } from "../content.js";
import { state, update, toast, runTask } from "./store.js";
import { PROFILE_KEY, applyAppearance, changeProfile, setRestorer, setSetting } from "./ctl-core.js";
import { unfinishedGame } from "./game-session.js";
import { maybeComputerMove, ponder } from "./game-turn.js";
import { newGame, recommendedGame, restoreCurrent, suggestedOpponent } from "./game-start.js";
import { allLessons, openLesson } from "./practice-ctl.js";
import { autoCheckForUpdates, restoreUpdateState } from "./update-ctl.js";
import { initModels } from "./models-ctl.js";
import { resumeBackground } from "../play/analysis.js";
import { storeError, takeNote } from "./data-ctl.js";
import { restore } from "./spaces.js";

/**
 * The files without which the app would take you for a new player. If one
 * of them cannot be read, the app does not start over on top of it: see
 * storeProblemOf and docs/storage.md, "Safe state".
 */
export const CORE_KEYS = [SETTINGS_KEY, PROFILE_KEY, CURRENT_KEY];
/** Read when needed, not at boot: the game files and the restore snapshots. */
const LAZY_PREFIXES = [GAMES_PREFIX, BACKUPS_PREFIX];

/**
 * What the store's open found that the player must hear about before
 * anything is written, or null:
 *   { kind: "list" }     nothing could be listed
 *   { kind: "files", failed, resettable, newer }
 *                        a core file could not be read (failed: [{ key,
 *                        kind, error, preserved }]); resettable when each
 *                        was only damaged and a copy of it is kept (bad/…);
 *                        newer when one was saved by a newer version.
 */
export function storeProblemOf(report) {
  if (!report) return null;
  if (report.listFailed) return { kind: "list", failed: [], resettable: false, newer: false };
  const failed = report.failed.filter((f) => CORE_KEYS.includes(f.key));
  if (!failed.length) return null;
  return { kind: "files", failed, resettable: failed.every((f) => f.kind === "parse" && !!f.preserved), newer: failed.some((f) => f.kind === "newer") };
}

/** The packaged app's bridge appears with the page; give it a moment before calling it missing. */
async function waitForBridge(ms = 1500) {
  const end = Date.now() + ms;
  while (!hasNative() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return hasNative();
}

/**
 * Start the app: open the store before the first render (settings, the
 * player model, the game on the board and the games index; the game files
 * themselves are read when a view needs one), bring what it read to the
 * current format (data/migrate.js), and only then decide what to show.
 *
 * Safety: in the packaged app a missing bridge is an error screen,
 * never a fresh start in the WebView's own storage; a core file that could
 * not be read puts the app in its safe state (read-only, no onboarding,
 * app/safety.jsx) instead of taking the player for a new one.
 */
export async function boot() {
  store.setErrorHandler(storeError);
  // A click that needs a content part not here yet shows that it is loading,
  // and says so when it could not be loaded (content.js, store.js runTask).
  onContentWait((part, load) => runTask("content:" + part, load, { label: t("task.loading"), error: t("task.contentFailed") }));
  if (isPackaged() && !hasNative() && !(await waitForBridge())) {
    const lang = detectLang();
    setLang(lang);
    update({ bootError: { kind: "bridge" }, settings: { ...loadSettings({ get: () => null }), lang } });
    return;
  }
  store.setMigrator(migrateFile);
  await store.open({ lazy: LAZY_PREFIXES, keepDamaged: CORE_KEYS });
  const problem = storeProblemOf(store.openReport);
  // Nothing is written while the player has not chosen what to do.
  if (problem) store.setReadOnly(true);
  // The games index (rebuilt from the files when it is missing or behind).
  const read = await Games.initIndex();
  if (read) store.evict(GAMES_PREFIX);
  const settings = loadSettings(store);
  if (!settings.lang) settings.lang = detectLang();
  // Games or a player model without settings are not a new player's (a
  // settings file lost, or reset in the safe state): no onboarding.
  if (!settings.onboarded && (problem || (!store.has(SETTINGS_KEY) && (store.has(PROFILE_KEY) || Games.listGames().length > 0)))) settings.onboarded = true;
  state.settings = settings;
  state.profile = normalizeProfile(store.get(PROFILE_KEY));
  state.storeProblem = problem ? { ...problem, continued: false } : null;
  setLang(settings.lang);
  Audio.setLevel(settings.volume);
  applyAppearance();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyAppearance);
  restoreCurrent();
  // Play opens on the board when a game is in progress (one with a
  // move of the player's, play-ctl unfinishedGame), else on its home.
  state.space = "today";
  state.play = { ...state.play, view: unfinishedGame() ? "game" : "home" };
  if (!settings.onboarded) state.sheet = { kind: "onboarding", step: 0 };
  setRestorer(restore);
  state.ready = true;
  update();
  const note = takeNote();
  if (note) toast(t("backup.note." + note), note === "restorePartial" ? "warning" : "success", 7000);
  // Lesson steps, problem bodies and classic records follow on idle
  // (content.js). Nothing on screen reads them before it is opened, and
  // what opens them waits for them, so their arrival renders nothing.
  preloadContent(() => update());
  Engine.info().then((info) => {
    update({ engine: info });
    maybeComputerMove();
    ponder();
    // The background analyses quitting interrupted (play/analysis.js).
    resumeBackground();
  });
  // A restore snapshot nobody can undo any more is removed.
  if (!problem) expireSnapshots(store).catch(() => {});
  // Which optional networks are installed (a local status call).
  initModels().catch(() => {});
  // The opt-in weekly update check (no request unless it is on and due).
  if (hasNative()) setTimeout(() => autoCheckForUpdates().catch(() => {}), 4000);
  // How the last in-app update went (no request).
  if (hasNative()) setTimeout(() => restoreUpdateState().catch(() => {}), 600);
}

/* ----------------------------------------------------------- onboarding */

/**
 * The last onboarding answer: language and experience are known. Every
 * new player lands on Today, whose hero offers what the answer asked for
 * in one click (startFirstRun): lesson one for someone who never played,
 * a gentle 9×9 game for someone who knows the rules, the full board for a
 * player. Nobody is dropped onto a board or into a lesson before seeing
 * the app's home.
 */
export function finishOnboarding(choice, rank = null) {
  const s = state.settings;
  const next = { ...s, onboarded: true, experience: choice };
  if (choice === "new") next.playerRank = 30;
  else if (choice === "rules") next.playerRank = 25;
  else next.playerRank = rank ?? 15;
  changeProfile((p) => setPriorRank(p, next.playerRank, Date.now()));
  // The gentlest rank of the ladder for a beginner, else the suggested game's.
  const opponentRank = choice === "new" || choice === "rules" ? 30 : suggestedOpponent(19).opponentRank;
  next.opponentRank = opponentRank;
  update((st) => {
    st.settings = next;
    st.sheet = null;
    st.space = "today";
  });
  setSetting("onboarded", true);
}

/**
 * Start what onboarding promised (the primary of Today's first hero):
 * lesson one, or the suggested first game — the small board against the
 * gentlest level with teaching on, or an even game on the full board.
 */
export function startFirstRun() {
  const rec = recommendedGame();
  if (rec.first === "lesson") {
    return withContent("course", () => {
      const first = allLessons()[0];
      if (first) openLesson(first.lesson.id, 0);
    });
  }
  return newGame({ size: rec.size, opponent: "ai", color: BLACK, opponentRank: rec.opponentRank, handicap: rec.handicap });
}

/** Your level changed by hand in Settings: the estimate starts from it again. */
export function setPlayerRank(rank) {
  setSetting("playerRank", rank);
  changeProfile((p) => setPriorRank(p, rank ?? 30, Date.now()));
  update();
}
