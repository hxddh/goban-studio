/**
 * Goban Studio — application shell and view orchestration.
 *
 * The app has one canvas and four places: play, review, learn, library.
 * State is a handful of plain objects; views are rendered from them. There is
 * no framework, and no view owns game rules: rules.js does.
 */
import { BLACK, WHITE, EMPTY, Game, coordLabel, formatPoints } from "./rules.js";
import { loadSGF } from "./sgf.js";
import { BoardView } from "./board.js";
import { chooseMove, hintMove, LEVELS } from "./ai.js";
import { analyze, ownership } from "./review.js";
import { apply, detectLang, LANG_IDS, LANG_NAMES, setLang, t } from "./i18n.js";
import { LESSONS } from "./content/lessons.js";
import { TSUMEGO } from "./content/tsumego.js";
import {
  KEYS,
  DEFAULT_SETTINGS,
  duePuzzles,
  loadProgress,
  loadSettings,
  markLesson,
  markPuzzle,
  saveProgress,
  saveSettings,
  touchStreak,
} from "./persist.js";
import * as Lib from "./library.js";
import { lose, pass as soundPass, setSound, stone as soundStone, win } from "./audio.js";
import {
  hasFileDialogs,
  hasNative,
  normalizePaths,
  onDropFiles,
  onOpenFiles,
  openFileDialog,
  readTextFile,
  revealPath,
  saveFileDialog,
  setupChrome,
  writeTextFile,
} from "./host.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function tx(obj) {
  if (!obj) return "";
  return obj[state.settings.lang] ?? obj.zh ?? "";
}

function icon(name) {
  const paths = {
    board: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.2"/><path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11"/>',
    chart: '<path d="M2.5 13.5h11"/><path d="M4 11l3-3 2.2 1.8L13 5.5"/><path d="M10.8 5.5H13v2.2"/>',
    book: '<path d="M2.5 3.5h4.2c.9 0 1.3.4 1.3 1.3v8.7c0-.9-.4-1.3-1.3-1.3H2.5z"/><path d="M13.5 3.5H9.3c-.9 0-1.3.4-1.3 1.3v8.7c0-.9.4-1.3 1.3-1.3h4.2z"/>',
    folder: '<path d="M2.5 4.5h4l1.2 1.5h5.8v7H2.5z"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    undo: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.8 6.5H9a3.5 3.5 0 0 1 0 7H6.5"/>',
    pass: '<path d="M2.5 8h11"/><path d="M10.5 5l3 3-3 3"/>',
    flag: '<path d="M4 14V2.5"/><path d="M4 3h7l-1.2 2.5L11 8H4z"/>',
    bulb: '<path d="M6 12.5h4"/><path d="M6.4 11c-1.2-.8-2-2-2-3.5a3.6 3.6 0 0 1 7.2 0c0 1.5-.8 2.7-2 3.5"/><path d="M6.8 14h2.4"/>',
    first: '<path d="M4 3v10M12 4l-5 4 5 4z"/>',
    prev: '<path d="M10.5 3.5L5.5 8l5 4.5"/>',
    next: '<path d="M5.5 3.5L10.5 8l-5 4.5"/>',
    last: '<path d="M12 3v10M4 4l5 4-5 4z"/>',
    eye: '<path d="M1.8 8s2.4-4 6.2-4 6.2 4 6.2 4-2.4 4-6.2 4S1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.6"/>',
    download: '<path d="M8 2.5v7"/><path d="M5 7l3 3 3-3"/><path d="M2.5 12.5h11"/>',
    upload: '<path d="M8 13.5v-7"/><path d="M5 9l3-3 3 3"/><path d="M2.5 3.5h11"/>',
    trash: '<path d="M3.5 5h9"/><path d="M5.5 5V3.5h5V5"/><path d="M4.5 5l.5 8.5h6L11.5 5"/>',
    play: '<path d="M5 3.5l7 4.5-7 4.5z"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    x: '<path d="M4 4l8 8M12 4l-8 8"/>',
    back: '<path d="M9.5 3.5L5 8l4.5 4.5"/>',
    more: '<circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/>',
  };
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
}

function toast(message, tone = "info") {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast " + tone;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => {
    el.classList.remove("in");
    setTimeout(() => el.remove(), 250);
  }, 2400);
}

function fmtDate(value) {
  try {
    return new Date(value).toLocaleDateString(state.settings.lang === "zh" ? "zh-CN" : state.settings.lang, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (_) {
    return String(value).slice(0, 10);
  }
}

const state = {
  view: "play",
  settings: loadSettings(),
  progress: loadProgress(),
  game: null,
  gameRecordId: null,
  gameName: "",
  humanColor: BLACK,
  opponent: "ai",
  level: 2,
  thinking: false,
  gen: 0,
  hint: null,
  scoring: null,
  review: null,
  reviewOwnership: false,
  learn: {
    tab: "lessons",
    mode: null,
    lesson: null,
    puzzle: null,
    game: null,
    step: 0,
    feedback: null,
    busy: false,
    daily: null,
    showHint: false,
    preview: null,
  },
};

let boardView = null;

function lang() {
  return state.settings.lang;
}

function resultText(result) {
  if (!result) return t("play.gameOver");
  if (result === "Draw") return t("common.draw");
  if (result.endsWith("+R")) {
    return (result[0] === "B" ? t("common.black") : t("common.white")) + " +R";
  }
  return result;
}

function captureTotal(game = state.game) {
  const c = game?.capturesOf(game.current) || { black: 0, white: 0 };
  return (c.black || 0) + (c.white || 0);
}

function goView(view) {
  if (view !== "play" && state.thinking) {
    state.gen++;
    state.thinking = false;
  }
  state.view = view;
  if (view === "review") {
    state.review = state.game && state.game.mainLine().length > 1 ? analyze(state.game) : null;
  }
  if (view === "learn" && state.learn.mode && state.learn.lesson === null && state.learn.puzzle === null) {
    state.learn.mode = null;
  }
  render();
  if (view === "play") maybeAiMove();
}

function setTheme() {
  const theme = state.settings.theme;
  document.documentElement.dataset.theme = theme === "night" ? "dark" : "light";
  document.documentElement.dataset.boardTheme = theme;
  document.getElementById("app").dataset.theme = theme === "night" ? "dark" : "light";
  if (boardView) boardView.setTheme(theme);
}

function persistCurrent() {
  if (!state.game) return;
  Lib.saveCurrent(state.game, {
    recordId: state.gameRecordId,
    humanColor: state.humanColor,
    opponent: state.opponent,
    level: state.level,
    name: state.gameName,
  });
}

function saveToLibrary() {
  if (!state.game || state.game.moveNumber === 0) return null;
  const rec = Lib.saveGame(state.game, {
    id: state.gameRecordId,
    name: state.gameName,
    humanColor: state.humanColor,
    opponent: state.opponent,
    level: state.level,
  });
  state.gameRecordId = rec.id;
  return rec;
}

function afterMove({ sound = true } = {}) {
  state.hint = null;
  const game = state.game;
  if (game.phase === "scoring" && !state.scoring) {
    state.scoring = { dead: [], score: game.score([]) };
  }
  if (game.current.result) {
    const winnerBlack = game.current.result.startsWith("B");
    if (state.opponent === "ai") {
      if (winnerBlack === (state.humanColor === BLACK)) win();
      else lose();
    }
  }
  persistCurrent();
  saveToLibrary();
  render();
  if (state.view === "play" && game.phase === "playing" && state.opponent === "ai" && game.turn !== state.humanColor) {
    maybeAiMove();
  }
}

function humanPlay(x, y) {
  if (state.view === "learn") return learnPlay(x, y);
  if (state.view !== "play" || !state.game) return;
  if (state.scoring) return toggleDead(x, y);
  if (state.thinking) return;
  if (state.game.phase !== "playing") return;
  if (state.opponent === "ai" && state.game.turn !== state.humanColor) return;
  const before = captureTotal();
  const res = state.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  soundStone(captureTotal() > before);
  afterMove();
}

async function maybeAiMove() {
  if (state.view !== "play" || state.thinking || !state.game) return;
  if (state.opponent !== "ai" || state.game.phase !== "playing" || state.game.turn === state.humanColor) return;
  const gen = ++state.gen;
  state.thinking = true;
  render();
  let move = null;
  try {
    move = await chooseMove(state.game, { level: state.level, color: state.game.turn });
  } catch (_) {
    move = null;
  }
  if (gen !== state.gen || state.view !== "play" || !state.game) return;
  state.thinking = false;
  if (!move) {
    render();
    return;
  }
  const before = captureTotal();
  if (move.pass) state.game.pass();
  else {
    const res = state.game.play(move.x, move.y);
    if (!res.ok) state.game.pass();
  }
  soundStone(captureTotal() > before);
  afterMove();
}

function undo() {
  if (!state.game) return;
  state.gen++;
  state.thinking = false;
  state.scoring = null;
  state.hint = null;
  if (!state.game.current.parent) return;
  state.game.undo();
  if (state.opponent === "ai" && state.game.turn !== state.humanColor && state.game.current.parent) {
    state.game.undo();
  }
  persistCurrent();
  saveToLibrary();
  render();
  if (state.opponent === "ai" && state.game.phase === "playing" && state.game.turn !== state.humanColor) maybeAiMove();
}

function passTurn() {
  if (!state.game || state.game.phase !== "playing" || state.thinking) return;
  if (state.opponent === "ai" && state.game.turn !== state.humanColor) return;
  state.game.pass();
  soundPass();
  afterMove();
}

function resign() {
  if (!state.game || state.game.phase !== "playing") return;
  const color = state.opponent === "ai" ? state.humanColor : state.game.turn;
  openDialog(t("play.resignConfirm"), "", [
    { label: t("common.cancel"), kind: "ghost" },
    {
      label: t("common.resign"),
      kind: "danger",
      action: () => {
        state.game.resign(color);
        afterMove();
      },
    },
  ]);
}

async function askHint() {
  if (!state.game || state.game.phase !== "playing" || state.thinking) return;
  state.thinking = true;
  render();
  let move = null;
  try {
    move = await hintMove(state.game, Math.max(3, state.level));
  } catch (_) {
    move = null;
  }
  state.thinking = false;
  if (move && !move.pass) {
    state.hint = { x: move.x, y: move.y };
    toast(coordLabel(move.x, move.y, state.game.size), "info");
  } else {
    toast(t("common.pass"), "info");
  }
  render();
}

function toggleDead(x, y) {
  if (!state.game || !state.scoring) return;
  const v = state.game.board.get([x, y]);
  if (!v) return;
  const idx = state.scoring.dead.findIndex((d) => d.x === x && d.y === y);
  if (idx >= 0) state.scoring.dead.splice(idx, 1);
  else state.scoring.dead.push({ x, y });
  state.scoring.score = state.game.score(state.scoring.dead);
  render();
}

function confirmScore() {
  if (!state.game || !state.scoring) return;
  state.game.setResult(state.scoring.score.result);
  state.scoring = null;
  persistCurrent();
  saveToLibrary();
  render();
  const winnerBlack = state.game.current.result.startsWith("B");
  if (state.opponent === "ai" && winnerBlack === (state.humanColor === BLACK)) win();
  else if (state.opponent === "ai") lose();
}

function resumePlay() {
  if (!state.game || !state.scoring) return;
  state.game.resumePlay();
  state.scoring = null;
  persistCurrent();
  render();
}

function newGame(opts = {}) {
  const size = [9, 13, 19].includes(Number(opts.size)) ? Number(opts.size) : 9;
  const handicap = Math.max(0, Math.min(9, Number(opts.handicap) || 0));
  const komi = opts.komi !== undefined ? Number(opts.komi) : handicap > 0 ? 0.5 : size === 9 ? 6.5 : 7.5;
  state.game = new Game({
    size,
    rules: opts.rules === "japanese" ? "japanese" : "chinese",
    komi: Number.isFinite(komi) ? komi : 6.5,
    handicap,
  });
  state.opponent = opts.opponent === "human" ? "human" : "ai";
  state.humanColor = state.opponent === "human" ? BLACK : opts.color === WHITE ? WHITE : BLACK;
  state.level = Math.max(1, Math.min(5, Number(opts.level) || state.settings.level || 2));
  state.gameRecordId = null;
  state.gameName = "";
  state.scoring = null;
  state.hint = null;
  state.review = null;
  state.reviewOwnership = false;
  state.thinking = false;
  state.gen++;
  state.view = "play";
  persistCurrent();
  render();
  maybeAiMove();
}

function newGameDialog() {
  const s = state.game?.size || 9;
  const levelOptions = LEVELS.map((l) => `<option value="${l.id}" ${l.id === state.level ? "selected" : ""}>${esc(t(l.key))} · ${l.id}</option>`).join("");
  const body = `
    <div class="form-grid">
      <label class="field"><span>${esc(t("play.opponent"))}</span>
        <select id="ng-opponent">
          <option value="ai" selected>${esc(t("play.ai"))}</option>
          <option value="human">${esc(t("play.human"))}</option>
        </select>
      </label>
      <label class="field"><span>${esc(t("play.yourColor"))}</span>
        <select id="ng-color"><option value="1">${esc(t("common.black"))}</option><option value="-1">${esc(t("common.white"))}</option></select>
      </label>
      <label class="field"><span>${esc(t("play.boardSize"))}</span>
        <select id="ng-size">${[9, 13, 19].map((n) => `<option value="${n}" ${n === s ? "selected" : ""}>${n} × ${n}</option>`).join("")}</select>
      </label>
      <label class="field"><span>${esc(t("play.difficulty"))}</span><select id="ng-level">${levelOptions}</select></label>
      <label class="field"><span>${esc(t("play.ruleset"))}</span>
        <select id="ng-rules"><option value="chinese">${esc(t("common.chinese"))}</option><option value="japanese">${esc(t("common.japanese"))}</option></select>
      </label>
      <label class="field"><span>${esc(t("common.komi"))}</span><input id="ng-komi" type="number" step="0.5" min="0" max="15" value="${s === 9 ? 6.5 : 7.5}" /></label>
      <label class="field"><span>${esc(t("common.handicap"))}</span>
        <select id="ng-handicap">${[0, 2, 3, 4, 5].map((n) => `<option value="${n}">${n || t("common.none")}</option>`).join("")}</select>
      </label>
    </div>
  `;
  openDialog(t("play.newGameTitle"), body, [
    { label: t("common.cancel"), kind: "ghost" },
    {
      label: t("play.start"),
      kind: "primary",
      action: () => {
        const opponent = $("#ng-opponent").value;
        const color = Number($("#ng-color").value);
        const size = Number($("#ng-size").value);
        const handicap = Number($("#ng-handicap").value);
        const komiInput = Number($("#ng-komi").value);
        newGame({
          size,
          opponent,
          color,
          level: Number($("#ng-level").value),
          rules: $("#ng-rules").value,
          komi: handicap > 0 ? Math.min(komiInput, 0.5) : komiInput,
          handicap,
        });
      },
    },
  ]);
  const sizeSelect = $("#ng-size");
  const komiInput = $("#ng-komi");
  const handicapSelect = $("#ng-handicap");
  sizeSelect?.addEventListener("change", () => {
    if (!komiInput) return;
    komiInput.value = Number(sizeSelect.value) === 9 ? "6.5" : "7.5";
  });
  handicapSelect?.addEventListener("change", () => {
    if (!komiInput) return;
    if (Number(handicapSelect.value) > 0) komiInput.value = "0.5";
  });
}

function openDialog(title, body, actions = []) {
  const dlg = $("#dialog");
  $("#dialog-title").textContent = title || "";
  $("#dialog-body").innerHTML = body || "";
  const host = $("#dialog-actions");
  host.innerHTML = "";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + (a.kind || "ghost");
    b.textContent = a.label;
    b.addEventListener("click", () => {
      try {
        a.action?.();
      } finally {
        if (a.close !== false) dlg.close();
      }
    });
    host.appendChild(b);
  }
  if (!actions.length) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn primary";
    b.textContent = t("common.close");
    b.addEventListener("click", () => dlg.close());
    host.appendChild(b);
  }
  if (!dlg.open) dlg.showModal();
}

function closeDialog() {
  $("#dialog").close();
}

function render() {
  apply();
  const app = $("#app");
  app.dataset.view = state.view;
  app.dataset.theme = state.settings.theme === "night" ? "dark" : "light";
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  renderTitle();
  renderTopbar();
  if (state.view === "library" || state.view === "settings") {
    $("#board-panel").hidden = true;
    $("#side").hidden = true;
    $("#page").hidden = false;
    renderPage();
  } else {
    $("#board-panel").hidden = false;
    $("#side").hidden = false;
    $("#page").hidden = true;
    renderBoard();
    renderSide();
  }
}

function renderTitle() {
  const title = $("#view-title");
  const status = $("#status");
  if (state.view === "play") {
    title.textContent = t("nav.play");
    status.textContent = statusText();
  } else if (state.view === "review") {
    title.textContent = t("nav.review");
    status.textContent = state.review ? `${state.review.moves} ${t("common.moves")}` : "";
  } else if (state.view === "learn") {
    if (state.learn.lesson) title.textContent = tx(state.learn.lesson.title);
    else if (state.learn.puzzle) title.textContent = tx(state.learn.puzzle.title);
    else title.textContent = t("nav.learn");
    status.textContent = state.learn.mode === "lesson" ? t("learn.lesson", [1]) : "";
  } else if (state.view === "library") {
    title.textContent = t("nav.library");
    status.textContent = "";
  } else {
    title.textContent = t("nav.settings");
    status.textContent = "";
  }
  if (state.view === "learn" && state.learn.mode === "lesson" && state.learn.lesson) {
    const idx = LESSONS.findIndex((l) => l.id === state.learn.lesson.id) + 1;
    status.textContent = t("learn.lesson", [idx]);
  } else if (state.view === "learn" && !state.learn.mode) {
    status.textContent = `${LESSONS.length} ${t("learn.lessons")} · ${TSUMEGO.length} ${t("learn.tsumego")}`;
  } else if (state.view === "learn" && state.learn.mode === "puzzle" && state.learn.puzzle) {
    const idx = TSUMEGO.findIndex((p) => p.id === state.learn.puzzle.id) + 1;
    status.textContent = t("learn.puzzle", [idx]);
  }
}

function statusText() {
  if (!state.game) return "";
  if (state.thinking) return t("play.aiThinking");
  if (state.game.phase === "scoring") return t("play.scoring");
  if (state.game.current.result) return resultText(state.game.current.result);
  if (state.opponent === "human") {
    return state.game.turn === BLACK ? t("play.blackToPlay") : t("play.whiteToPlay");
  }
  if (state.game.turn === state.humanColor) return t("play.yourTurn") + " · " + (state.game.turn === BLACK ? t("common.black") : t("common.white"));
  return state.game.turn === BLACK ? t("play.blackToPlay") : t("play.whiteToPlay");
}

function btn(action, label, iconName, kind = "ghost", disabled = false) {
  return `<button type="button" class="btn ${kind}" data-action="${action}" ${disabled ? "disabled" : ""} title="${esc(label)}" aria-label="${esc(label)}">${icon(iconName)}<span class="btn-label">${esc(label)}</span></button>`;
}

function renderTopbar() {
  const host = $("#topbar-actions");
  let html = "";
  if (state.view === "play") {
    const playing = state.game?.phase === "playing";
    html += btn("new", t("common.newGame"), "plus", "primary");
    html += btn("undo", t("common.undo"), "undo", "ghost", !state.game?.current.parent || state.thinking);
    html += btn("pass", t("common.pass"), "pass", "ghost", !playing || state.thinking);
    html += btn("resign", t("common.resign"), "flag", "ghost", !playing || state.thinking);
    html += btn("hint", t("common.hint"), "bulb", "ghost", !playing || state.thinking);
  } else if (state.view === "review") {
    html += btn("first", t("review.first"), "first");
    html += btn("prev", t("review.previous"), "prev");
    html += btn("next", t("review.next"), "next");
    html += btn("last", t("review.last"), "last");
    html += btn("ownership", state.reviewOwnership ? t("review.hideOwnership") : t("review.showOwnership"), "eye", state.reviewOwnership ? "primary" : "ghost");
    html += btn("play-here", t("review.playFromHere"), "play", "primary");
  } else if (state.view === "learn") {
    if (state.learn.mode) html += btn("learn-back", t("common.back"), "back");
  }
  host.innerHTML = html;
}

function handleAction(action) {
  switch (action) {
    case "new":
      newGameDialog();
      break;
    case "undo":
      undo();
      break;
    case "pass":
      passTurn();
      break;
    case "resign":
      resign();
      break;
    case "hint":
      askHint();
      break;
    case "first":
      reviewGotoIndex(0);
      break;
    case "prev":
      reviewStep(-1);
      break;
    case "next":
      reviewStep(1);
      break;
    case "last":
      reviewGotoIndex(Infinity);
      break;
    case "ownership":
      state.reviewOwnership = !state.reviewOwnership;
      render();
      break;
    case "play-here":
      playFromHere();
      break;
    case "learn-back":
      state.learn.mode = null;
      state.learn.lesson = null;
      state.learn.puzzle = null;
      state.learn.game = null;
      state.learn.daily = null;
      render();
      break;
    case "import":
      pickImport();
      break;
    case "start-daily":
      startDaily();
      break;
    case "review-game":
      enterReview();
      break;
    case "confirm-score":
      confirmScore();
      break;
    case "resume-play":
      resumePlay();
      break;
    case "learn-hint":
      state.learn.showHint = true;
      render();
      break;
    case "learn-reset":
      resetLearn();
      break;
    case "learn-answer":
      answerLearn();
      break;
    case "learn-next":
      nextLesson();
      break;
    case "clear-data":
      clearData();
      break;
    default:
      break;
  }
}

function moveNumbersFor(game) {
  const numbers = {};
  const path = game.path;
  for (let i = 1; i < path.length; i++) {
    const move = path[i].move;
    if (!move || move.pass) continue;
    if (game.current.board.get([move.x, move.y]) === move.color) numbers[move.x + "," + move.y] = i;
  }
  return numbers;
}

function renderBoard() {
  const game = state.view === "learn" ? state.learn.game || state.learn.preview : state.game;
  if (!game) return;
  const node = game.current;
  const marks = [...(node.marks || [])];
  if (state.hint) marks.push({ ...state.hint, type: "circle" });
  if (state.view === "learn" && state.learn.showHint) {
    const target = nextLearnTarget();
    if (target) marks.push({ x: target.x, y: target.y, type: "circle" });
  }
  let ownershipMap = null;
  if (state.view === "review" && state.reviewOwnership) ownershipMap = ownership(node);
  const territory = state.view === "play" ? state.scoring?.score?.territory || null : null;
  const dead = state.view === "play" ? state.scoring?.dead || [] : [];
  boardView.setModel({
    size: game.size,
    board: node.board.signMap,
    lastMove: node.move,
    marks,
    ownership: ownershipMap,
    territory,
    deadStones: dead,
    showNumbers: state.settings.numbers,
    showCoords: state.settings.coords,
    phase: state.scoring ? "scoring" : node.phase,
    hoverColor: state.view === "review" ? null : game.turn,
    hoverValid: true,
    interactive: state.view !== "review",
    moveNumbers: state.settings.numbers ? moveNumbersFor(game) : null,
  });
  boardView.setTheme(state.settings.theme);
  const cap = $("#board-caption");
  cap.textContent =
    state.view === "play"
      ? state.scoring
        ? t("score.deadHint")
        : t("play.caption")
      : state.view === "review"
        ? t("review.caption")
        : state.learn.mode
          ? t("learn.caption")
          : t("learn.choose");
  const badge = $("#board-badge");
  if (state.view === "play" && state.game?.current.result) {
    badge.hidden = false;
    badge.textContent = resultText(state.game.current.result);
  } else {
    badge.hidden = true;
  }
}

function playerCard(color, game) {
  const active = game.turn === color && game.phase === "playing";
  const caps = game.board.getCaptures(color) || 0;
  return `<div class="player ${active ? "active" : ""}">
    <span class="stone-dot ${color === BLACK ? "b" : "w"}"></span>
    <div class="player-main"><strong>${color === BLACK ? t("common.black") : t("common.white")}</strong><small>${t("common.captures")} ${caps}</small></div>
    ${active ? `<span class="turn-pill">${t("play.turn")}</span>` : ""}
  </div>`;
}

function moveRows(game) {
  const line = game.mainLine().slice(1);
  if (!line.length) return `<p class="empty-line">${esc(t("play.noMoves"))}</p>`;
  const current = game.current.id;
  return `<div class="move-list">${line
    .map((n, i) => {
      const m = n.move;
      const label = m.pass ? t("common.pass") : coordLabel(m.x, m.y, game.size);
      return `<button type="button" class="move-row ${n.id === current ? "current" : ""}" data-node="${n.id}">
        <span class="move-no">${i + 1}</span>
        <span class="stone-dot ${m.color === BLACK ? "b" : "w"} tiny"></span>
        <span class="move-coord">${esc(label)}</span>
      </button>`;
    })
    .join("")}</div>`;
}

function renderSide() {
  const host = $("#side-content");
  if (state.view === "play") host.innerHTML = playSide();
  else if (state.view === "review") host.innerHTML = reviewSide();
  else if (state.view === "learn") host.innerHTML = learnSide();
  bindSide();
}

function playSide() {
  const game = state.game;
  if (!game) return "";
  const meta = `<div class="chips">
    <span class="chip">${game.size} × ${game.size}</span>
    <span class="chip">${esc(game.rules === "japanese" ? t("common.japanese") : t("common.chinese"))}</span>
    <span class="chip">${esc(t("common.komi"))} ${formatPoints(game.komi)}</span>
    ${game.handicap ? `<span class="chip">${esc(t("common.handicap"))} ${game.handicap}</span>` : ""}
  </div>`;
  let body = "";
  if (state.scoring) {
    const s = state.scoring.score;
    const sparse = game.board.signMap.flat().filter((v) => v !== 0).length < game.size * 2;
    body = `<section class="card score-card">
      <div class="card-head"><h3>${esc(t("play.scoreTitle"))}</h3><span class="muted">${esc(t("score.deadHint"))}</span></div>
      <div class="score-grid">
        <div><span class="muted">${esc(t("score.black"))}</span><strong>${formatPoints(s.black)}</strong></div>
        <div><span class="muted">${esc(t("score.white"))}</span><strong>${formatPoints(s.white)}</strong></div>
      </div>
      <div class="score-detail">
        <span>${esc(t("score.territory"))} ${s.blackTerritory} / ${s.whiteTerritory}</span>
        <span>${esc(t("score.prisoners"))} ${s.captures.black} / ${s.captures.white}</span>
        <span>${esc(t("score.komi"))} ${formatPoints(game.komi)}</span>
      </div>
      ${sparse ? `<p class="notice">${esc(t("score.sparse"))}</p>` : ""}
      <div class="card-actions">
        <button class="btn primary" data-action="confirm-score">${esc(t("score.confirm"))}</button>
        <button class="btn ghost" data-action="resume-play">${esc(t("score.resume"))}</button>
      </div>
    </section>`;
  } else if (game.current.result) {
    body = `<section class="card result-card">
      <span class="eyebrow">${esc(t("play.result"))}</span>
      <strong class="result-big">${esc(resultText(game.current.result))}</strong>
      <div class="card-actions">
        <button class="btn primary" data-action="review-game">${esc(t("play.reviewGame"))}</button>
        <button class="btn ghost" data-action="new">${esc(t("play.playAgain"))}</button>
      </div>
    </section>`;
  }
  return `<section class="players">${playerCard(BLACK, game)}${playerCard(WHITE, game)}</section>
    ${meta}
    ${body}
    <section class="card">
      <div class="card-head"><h3>${esc(t("play.moveList"))}</h3><span class="muted">${game.moveNumber} ${esc(t("common.moves"))}</span></div>
      ${moveRows(game)}
    </section>`;
}

function reviewSide() {
  if (!state.game || state.game.mainLine().length <= 1) {
    return `<section class="card empty-card"><span class="empty-icon">${icon("chart")}</span><h3>${esc(t("review.noGame"))}</h3><p>${esc(t("review.loadHint"))}</p></section>`;
  }
  if (!state.review) state.review = analyze(state.game);
  const r = state.review;
  const pts = r.points;
  const w = 560;
  const h = 120;
  const n = Math.max(1, pts.length - 1);
  const xy = pts.map((p, i) => [Math.round((i / n) * (w - 16) + 8), Math.round((1 - p.winrate) * (h - 24) + 12)]);
  const poly = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const keySet = new Set(r.keyMoves.map((k) => k.id));
  const currentId = state.game.current.id;
  const dots = pts
    .map((p, i) => {
      const [x, y] = xy[i];
      if (p.id === currentId) return `<circle cx="${x}" cy="${y}" r="4.5" class="graph-current"/>`;
      if (keySet.has(p.id)) return `<circle cx="${x}" cy="${y}" r="3.6" class="graph-key"/>`;
      return "";
    })
    .join("");
  const labels = r.points
    .map((p, i) => {
      if (![0, Math.floor(n / 2), n].includes(i)) return "";
      const [x, y] = xy[i];
      return `<text x="${x}" y="${h - 2}" class="graph-label">${i}</text>`;
    })
    .join("");
  const keyRows = r.keyMoves.length
    ? r.keyMoves
        .map((p) => {
          const m = p.move;
          const label = m.pass ? t("common.pass") : coordLabel(m.x, m.y, state.game.size);
          return `<button class="key-row" data-node="${p.id}">
            <span class="move-no">${p.moveNumber}</span>
            <span class="stone-dot ${m.color === BLACK ? "b" : "w"} tiny"></span>
            <span class="key-coord">${esc(label)}</span>
            <span class="grade ${p.grade}">${esc(t("review." + (p.grade === "good" ? "good" : p.grade)))}</span>
          </button>`;
        })
        .join("")
    : `<p class="empty-line">${esc(t("review.noKeyMoves"))}</p>`;
  return `<section class="card graph-card">
      <div class="card-head"><h3>${esc(t("review.eval"))}</h3><span class="muted">${esc(t("review.analyzed"))}</span></div>
      <svg class="eval-graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(t("review.eval"))}">
        <line x1="8" y1="${h / 2}" x2="${w - 8}" y2="${h / 2}" class="graph-mid"/>
        <polyline points="${poly}" class="graph-line"/>
        ${dots}${labels}
      </svg>
      <div class="graph-legend"><span>${esc(t("common.black"))}</span><span>${esc(t("common.white"))}</span></div>
    </section>
    <section class="card">
      <div class="card-head"><h3>${esc(t("review.keyMoves"))}</h3><span class="muted">${r.moves} ${esc(t("common.moves"))}</span></div>
      ${keyRows}
    </section>
    <section class="card summary-card">
      <div class="card-head"><h3>${esc(t("review.summary"))}</h3>${r.result ? `<span class="chip">${esc(resultText(r.result))}</span>` : ""}</div>
      <div class="grade-counts">
        <span><i class="grade-dot good"></i>${esc(t("review.good"))} ${r.counts.good || 0}</span>
        <span><i class="grade-dot inaccuracy"></i>${esc(t("review.inaccuracy"))} ${r.counts.inaccuracy || 0}</span>
        <span><i class="grade-dot mistake"></i>${esc(t("review.mistake"))} ${r.counts.mistake || 0}</span>
        <span><i class="grade-dot blunder"></i>${esc(t("review.blunder"))} ${r.counts.blunder || 0}</span>
      </div>
    </section>`;
}

function learnSide() {
  const l = state.learn;
  if (l.mode === "lesson" && l.lesson) return lessonPlayerSide();
  if (l.mode === "puzzle" && l.puzzle) return puzzlePlayerSide();
  const tabs = ["lessons", "tsumego", "daily"];
  const tabHtml = tabs
    .map(
      (id) =>
        `<button class="seg ${l.tab === id ? "on" : ""}" data-tab="${id}">${esc(t(id === "lessons" ? "learn.lessons" : id === "tsumego" ? "learn.tsumego" : "learn.daily"))}</button>`,
    )
    .join("");
  let body = "";
  if (l.tab === "lessons") {
    body = `<div class="lesson-grid">${LESSONS.map((lesson, i) => {
      const done = state.progress.lessons[lesson.id]?.done;
      return `<button class="lesson-card ${done ? "done" : ""}" data-lesson="${lesson.id}">
        <span class="lesson-no">${String(i + 1).padStart(2, "0")}</span>
        <span class="lesson-title">${esc(tx(lesson.title))}</span>
        <span class="lesson-mark">${done ? icon("check") : "→"}</span>
      </button>`;
    }).join("")}</div>`;
  } else if (l.tab === "tsumego") {
    body = `<div class="level-group">${[1, 2, 3]
      .map((level) => {
        const list = TSUMEGO.filter((p) => p.level === level);
        return `<div class="level-block"><div class="level-head"><span>${esc(t(level === 1 ? "learn.easy" : level === 2 ? "learn.medium" : "learn.hard"))}</span><span class="muted">${list.filter((p) => state.progress.puzzles[p.id]?.solved).length}/${list.length}</span></div>
          <div class="puzzle-grid">${list
            .map(
              (p) =>
                `<button class="puzzle-card ${state.progress.puzzles[p.id]?.solved ? "done" : ""}" data-puzzle="${p.id}"><span>${esc(tx(p.title))}</span>${state.progress.puzzles[p.id]?.solved ? icon("check") : ""}</button>`,
            )
            .join("")}</div></div>`;
      })
      .join("")}</div>`;
  } else {
    const daily = l.daily;
    const streak = state.progress.streak?.count || 0;
    body = `<section class="card daily-card">
      <span class="eyebrow">${esc(t("learn.daily"))}</span>
      <strong class="daily-title">${esc(t("learn.today"))}</strong>
      <p class="muted">${esc(t("learn.streak", [streak]))}</p>
      ${
        daily
          ? `<div class="daily-progress">${daily.ids.map((id, i) => `<span class="daily-dot ${i < daily.index ? "done" : i === daily.index ? "on" : ""}"></span>`).join("")}</div>
             <button class="btn primary" data-action="start-daily">${esc(t("learn.startDaily"))}</button>`
          : `<button class="btn primary" data-action="start-daily">${esc(t("learn.startDaily"))}</button>`
      }
    </section>`;
  }
  return `<div class="seg-row">${tabHtml}</div>${body}`;
}

function lessonPlayerSide() {
  const l = state.learn;
  const lesson = l.lesson;
  const total = lesson.line.length;
  const done = l.step >= total;
  return `<section class="card player-card">
    <div class="card-head"><h3>${esc(tx(lesson.title))}</h3><span class="muted">${Math.min(l.step, total)} / ${total}</span></div>
    <p class="lesson-text">${esc(tx(lesson.text))}</p>
    ${l.feedback === "wrong" ? `<p class="feedback bad">${esc(t("learn.wrong"))}</p>` : ""}
    ${l.feedback === "correct" ? `<p class="feedback good">${esc(t("learn.correct"))}</p>` : ""}
    ${done ? `<p class="feedback good">${esc(t("learn.lessonDone"))}</p>` : ""}
    <div class="card-actions">
      <button class="btn ghost" data-action="learn-hint">${esc(t("learn.hint"))}</button>
      <button class="btn ghost" data-action="learn-reset">${esc(t("learn.tryAgain"))}</button>
      <button class="btn ghost" data-action="learn-answer">${esc(t("learn.showAnswer"))}</button>
      ${done ? `<button class="btn primary" data-action="learn-next">${esc(t("learn.nextLesson"))}</button>` : ""}
    </div>
  </section>`;
}

function puzzlePlayerSide() {
  const l = state.learn;
  const p = l.puzzle;
  const prog = state.progress.puzzles[p.id];
  return `<section class="card player-card">
    <div class="card-head"><h3>${esc(tx(p.title))}</h3><span class="chip">${esc(t(p.level === 1 ? "learn.easy" : p.level === 2 ? "learn.medium" : "learn.hard"))}</span></div>
    <p class="lesson-text">${esc(tx(p.hint))}</p>
    ${l.feedback === "wrong" ? `<p class="feedback bad">${esc(t("learn.wrong"))}</p>` : ""}
    ${l.feedback === "correct" ? `<p class="feedback good">${esc(t("learn.correct"))}</p>` : ""}
    <p class="muted">${esc(t("learn.attempts"))} ${prog?.attempts || 0}${prog?.solved ? " · " + esc(t("learn.solved")) : ""}</p>
    <div class="card-actions">
      <button class="btn ghost" data-action="learn-hint">${esc(t("learn.hint"))}</button>
      <button class="btn ghost" data-action="learn-reset">${esc(t("learn.tryAgain"))}</button>
      <button class="btn ghost" data-action="learn-answer">${esc(t("learn.showAnswer"))}</button>
      ${l.feedback === "correct" ? `<button class="btn primary" data-action="learn-next">${esc(t("learn.next"))}</button>` : ""}
    </div>
  </section>`;
}

function renderPage() {
  if (state.view === "library") renderLibraryPage();
  else renderSettingsPage();
  bindPage();
}

function renderLibraryPage() {
  const games = Lib.listGames();
  const rows = games.length
    ? games
        .map(
          (g) => `<div class="lib-row" data-id="${g.id}">
        <div class="lib-main"><strong>${esc(g.name || t("library.untitled"))}</strong><span class="muted">${fmtDate(g.updatedAt)} · ${g.size} × ${g.size} · ${g.moves} ${esc(t("common.moves"))}</span></div>
        <span class="chip">${esc(g.result ? resultText(g.result) : t("library.resume"))}</span>
        <div class="lib-actions">
          <button class="btn ghost sm" data-open="${g.id}">${esc(t("library.open"))}</button>
          <button class="btn ghost sm icon-only" data-export="${g.id}" title="${esc(t("library.export"))}">${icon("download")}</button>
          <button class="btn ghost sm icon-only danger" data-del="${g.id}" title="${esc(t("common.delete"))}">${icon("trash")}</button>
        </div>
      </div>`,
        )
        .join("")
    : `<div class="empty-state"><span class="empty-icon">${icon("folder")}</span><h3>${esc(t("library.empty"))}</h3><p>${esc(t("library.importHint"))}</p><button class="btn primary" data-action="import">${esc(t("library.import"))}</button></div>`;
  $("#page").innerHTML = `<div class="page-head"><div><h2>${esc(t("nav.library"))}</h2><p>${esc(t("library.caption"))}</p></div><div class="page-actions"><button class="btn primary" data-action="import">${icon("upload")} ${esc(t("library.import"))}</button><button class="btn ghost" data-action="new">${icon("plus")} ${esc(t("common.newGame"))}</button></div></div>
    <div class="lib-list">${rows}</div>`;
}

function renderSettingsPage() {
  const s = state.settings;
  const langButtons = LANG_IDS.map(
    (id) => `<button class="lang-btn ${s.lang === id ? "on" : ""}" data-lang="${id}"><strong>${LANG_NAMES[id]}</strong><span>${id.toUpperCase()}</span></button>`,
  ).join("");
  const themes = [
    ["wood", "settings.wood"],
    ["night", "settings.night"],
    ["paper", "settings.paper"],
  ]
    .map(
      ([id, label]) => `<button class="theme-card ${s.theme === id ? "on" : ""}" data-theme-btn="${id}"><span class="theme-swatch swatch-${id}"></span><span>${esc(t(label))}</span></button>`,
    )
    .join("");
  $("#page").innerHTML = `<div class="page-head"><div><h2>${esc(t("settings.title"))}</h2><p>${esc(t("settings.caption"))}</p></div></div>
    <div class="settings-grid">
      <section class="settings-card"><h3>${esc(t("settings.language"))}</h3><div class="lang-grid">${langButtons}</div></section>
      <section class="settings-card"><h3>${esc(t("settings.theme"))}</h3><div class="theme-grid">${themes}</div></section>
      <section class="settings-card"><h3>${esc(t("settings.interface"))}</h3>
        <label class="switch"><input type="checkbox" data-toggle="coords" ${s.coords ? "checked" : ""}/><span>${esc(t("settings.coordinates"))}</span></label>
        <label class="switch"><input type="checkbox" data-toggle="sound" ${s.sound ? "checked" : ""}/><span>${esc(t("settings.sound"))}</span></label>
        <label class="switch"><input type="checkbox" data-toggle="numbers" ${s.numbers ? "checked" : ""}/><span>${esc(t("settings.moveNumbers"))}</span></label>
      </section>
      <section class="settings-card"><h3>${esc(t("settings.game"))}</h3>
        <label class="field inline"><span>${esc(t("settings.defaultLevel"))}</span><select data-level>${LEVELS.map((l) => `<option value="${l.id}" ${l.id === s.level ? "selected" : ""}>${esc(t(l.key))} · ${l.id}</option>`).join("")}</select></label>
        <p class="muted small">${esc(t("settings.offline"))}</p>
      </section>
      <section class="settings-card"><h3>${esc(t("settings.data"))}</h3><button class="btn danger" data-action="clear-data">${esc(t("settings.clearData"))}</button></section>
      <section class="settings-card about-card"><h3>${esc(t("settings.about"))}</h3><p>${esc(t("settings.aboutText"))}</p><p class="muted small">${esc(t("settings.version"))} 1.0.0 · ${esc(t("settings.licenses"))}: MIT · @sabaki/go-board · Inter (OFL)</p></section>
    </div>`;
}

function bindSide() {
  const host = $("#side-content");
  $$("[data-node]", host).forEach((b) => b.addEventListener("click", () => {
    const id = Number(b.dataset.node);
    state.game.goto(id);
    render();
  }));
  $$("[data-action]", host).forEach((b) => b.addEventListener("click", () => handleAction(b.dataset.action)));
  $$("[data-tab]", host).forEach((b) => b.addEventListener("click", () => {
    state.learn.tab = b.dataset.tab;
    render();
  }));
  $$("[data-lesson]", host).forEach((b) => b.addEventListener("click", () => startLesson(b.dataset.lesson)));
  $$("[data-puzzle]", host).forEach((b) => b.addEventListener("click", () => startPuzzle(b.dataset.puzzle)));
  const cur = host.querySelector(".move-row.current");
  if (cur && state.view === "play") cur.scrollIntoView({ block: "nearest" });
  if (state.view === "review") {
    const svg = host.querySelector(".eval-graph");
    if (svg && state.review) {
      svg.addEventListener("click", (e) => {
        const rect = svg.getBoundingClientRect();
        const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const idx = Math.round(rel * (state.review.points.length - 1));
        const p = state.review.points[idx];
        if (p) {
          state.game.goto(p.id);
          render();
        }
      });
    }
  }
}

function startLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return;
  const game = new Game({ size: lesson.size, komi: 6.5 });
  game.setup(lesson.setup, lesson.toMove);
  state.learn.daily = null;
  state.learn.mode = "lesson";
  state.learn.lesson = lesson;
  state.learn.puzzle = null;
  state.learn.game = game;
  state.learn.step = 0;
  state.learn.feedback = null;
  state.learn.showHint = false;
  state.view = "learn";
  render();
}

function startPuzzle(id, { daily = false } = {}) {
  const puzzle = TSUMEGO.find((p) => p.id === id);
  if (!puzzle) return;
  const game = new Game({ size: puzzle.size, komi: 6.5 });
  game.setup(puzzle.setup, puzzle.toMove);
  if (!daily) state.learn.daily = null;
  state.learn.mode = "puzzle";
  state.learn.puzzle = puzzle;
  state.learn.lesson = null;
  state.learn.game = game;
  state.learn.step = 0;
  state.learn.feedback = null;
  state.learn.showHint = false;
  state.view = "learn";
  render();
}

function nextLearnTarget() {
  const l = state.learn;
  const item = l.lesson || l.puzzle;
  if (!item) return null;
  const expected = item.line[l.step];
  return expected && expected.c === item.toMove ? expected : null;
}

function learnPlay(x, y) {
  const l = state.learn;
  const item = l.lesson || l.puzzle;
  if (!item || !l.game || l.busy) return;
  const expected = item.line[l.step];
  if (!expected) return;
  if (expected.c !== item.toMove) {
    // The scripted opponent reply is auto-played; a stray click should not
    // consume it.
    return;
  }
  if (x !== expected.x || y !== expected.y) {
    l.feedback = "wrong";
    if (l.mode === "puzzle" && l.puzzle) markPuzzle(state.progress, l.puzzle.id, false);
    render();
    return;
  }
  const res = l.game.play(x, y);
  if (!res.ok) {
    l.feedback = "wrong";
    render();
    return;
  }
  soundStone();
  l.step++;
  l.feedback = "correct";
  autoLearnReplies();
  if (l.step >= item.line.length) learnComplete();
  render();
}

function autoLearnReplies() {
  const l = state.learn;
  const item = l.lesson || l.puzzle;
  if (!item) return;
  while (l.step < item.line.length && item.line[l.step].c !== item.toMove) {
    const m = item.line[l.step];
    const res = l.game.play(m.x, m.y, { color: m.c });
    if (!res.ok) break;
    l.step++;
  }
}

function learnComplete() {
  const l = state.learn;
  if (l.mode === "lesson" && l.lesson) {
    markLesson(state.progress, l.lesson.id);
    win();
  } else if (l.mode === "puzzle" && l.puzzle) {
    markPuzzle(state.progress, l.puzzle.id, true);
    win();
    if (l.daily) l.daily.index = Math.min(l.daily.ids.length, l.daily.index + 1);
  }
}

function resetLearn() {
  const l = state.learn;
  const item = l.lesson || l.puzzle;
  if (!item) return;
  const game = new Game({ size: item.size, komi: 6.5 });
  game.setup(item.setup, item.toMove);
  l.game = game;
  l.step = 0;
  l.feedback = null;
  l.showHint = false;
  render();
}

function answerLearn() {
  const l = state.learn;
  const item = l.lesson || l.puzzle;
  if (!item) return;
  resetLearn();
  for (const m of item.line) {
    l.game.play(m.x, m.y, { color: m.c, force: true });
    l.step++;
  }
  l.feedback = "correct";
  render();
}

function nextLesson() {
  const l = state.learn;
  if (l.daily) {
    if (l.daily.index < l.daily.ids.length) {
      startPuzzle(l.daily.ids[l.daily.index], { daily: true });
    } else {
      touchStreak(state.progress);
      l.daily = null;
      l.mode = null;
      l.puzzle = null;
      l.game = null;
      render();
    }
    return;
  }
  if (l.lesson) {
    const idx = LESSONS.findIndex((x) => x.id === l.lesson.id);
    if (idx >= 0 && idx + 1 < LESSONS.length) startLesson(LESSONS[idx + 1].id);
    else {
      l.mode = null;
      l.lesson = null;
      l.game = null;
      render();
    }
    return;
  }
  if (l.puzzle) {
    const idx = TSUMEGO.findIndex((x) => x.id === l.puzzle.id);
    if (idx >= 0 && idx + 1 < TSUMEGO.length) startPuzzle(TSUMEGO[idx + 1].id);
    else {
      l.mode = null;
      l.puzzle = null;
      l.game = null;
      render();
    }
  }
}

function startDaily() {
  if (state.learn.daily && state.learn.daily.index < state.learn.daily.ids.length) {
    startPuzzle(state.learn.daily.ids[state.learn.daily.index], { daily: true });
    return;
  }
  const picks = duePuzzles(state.progress, TSUMEGO, 5);
  state.learn.daily = { ids: picks.map((p) => p.id), index: 0 };
  startPuzzle(picks[0].id, { daily: true });
}

async function importSGFText(text, name = "goban-studio.sgf") {
  const { game, warnings } = loadSGF(text);
  state.game = game;
  state.gameRecordId = null;
  state.gameName = String(name || "goban-studio").replace(/\.sgf$/i, "");
  state.humanColor = BLACK;
  // An imported record is for study first. Do not let the computer answer
  // the last move of the file before the player has even seen it.
  state.opponent = "human";
  state.scoring = null;
  state.review = null;
  state.thinking = false;
  persistCurrent();
  saveToLibrary();
  goView("play");
  if (warnings.length) toast(warnings[0], "warn");
}

async function importSGF(file) {
  if (!file) return;
  try {
    await importSGFText(await file.text(), file.name);
  } catch (e) {
    console.error("SGF import failed", e);
    toast(t("library.importError"), "error");
  }
}

async function importSGFPath(path) {
  try {
    const text = await readTextFile(path);
    if (text == null) throw new Error("read failed");
    await importSGFText(text, String(path).split(/[/\\]/).pop() || "goban-studio.sgf");
  } catch (e) {
    console.error("SGF import failed", e);
    toast(t("library.importError"), "error");
  }
}

async function pickImport() {
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("library.import"), allowMultiple: false });
    const paths = normalizePaths(files);
    if (paths.length) importSGFPath(paths[0]);
    return;
  }
  $("#file-input").click();
}

function openRecord(id) {
  const rec = Lib.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    state.game = game;
    state.gameRecordId = rec.id;
    state.gameName = rec.name || "";
    state.humanColor = rec.humanColor === WHITE ? WHITE : BLACK;
    state.opponent = rec.opponent === "human" ? "human" : "ai";
    state.level = rec.level || state.settings.level;
    state.scoring = null;
    state.review = null;
    state.thinking = false;
    persistCurrent();
    goView("play");
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
}

async function exportSGF(game, name) {
  const text = game.toSGF();
  const filename = (name || "goban-studio") + ".sgf";
  if (hasNative() && hasFileDialogs()) {
    const path = await saveFileDialog({ title: t("library.export"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return;
    const chosen = normalizePaths(path)[0];
    if (chosen) {
      const saved = await writeTextFile(chosen, text);
      if (saved) {
        revealPath(chosen);
        toast(t("play.saved"), "info");
        return;
      }
    }
  }
  const blob = new Blob([text], { type: "application/x-go-sgf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("play.saved"), "info");
}

function bindPage() {
  const page = $("#page");
  $$("[data-action]", page).forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.action === "clear-data") clearData();
    else handleAction(b.dataset.action);
  }));
  $$("[data-open]", page).forEach((b) => b.addEventListener("click", () => openRecord(b.dataset.open)));
  $$("[data-del]", page).forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.del;
      openDialog(t("library.deleteConfirm"), "", [
        { label: t("common.cancel"), kind: "ghost" },
        { label: t("common.delete"), kind: "danger", action: () => { Lib.deleteGame(id); render(); } },
      ]);
    }),
  );
  $$("[data-export]", page).forEach((b) =>
    b.addEventListener("click", () => {
      const rec = Lib.getGame(b.dataset.export);
      if (rec) {
        try {
          const { game } = loadSGF(rec.sgf);
          exportSGF(game, rec.name || "goban-studio");
        } catch (_) {
          toast(t("library.importError"), "error");
        }
      }
    }),
  );
  $$("[data-lang]", page).forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.lang = b.dataset.lang;
      setLang(state.settings.lang);
      saveSettings(state.settings);
      render();
    }),
  );
  $$("[data-theme-btn]", page).forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.theme = b.dataset.themeBtn;
      saveSettings(state.settings);
      setTheme();
      render();
    }),
  );
  $$("[data-toggle]", page).forEach((input) =>
    input.addEventListener("change", () => {
      const key = input.dataset.toggle;
      state.settings[key] = input.checked;
      if (key === "sound") setSound(input.checked);
      saveSettings(state.settings);
      render();
    }),
  );
  const level = page.querySelector("[data-level]");
  if (level) {
    level.addEventListener("change", () => {
      state.settings.level = Number(level.value);
      saveSettings(state.settings);
    });
  }
}

function clearData() {
  openDialog(t("settings.clearConfirm"), "", [
    { label: t("common.cancel"), kind: "ghost" },
    {
      label: t("common.delete"),
      kind: "danger",
      action: () => {
        try {
          for (const k of Object.values(KEYS)) localStorage.removeItem(k);
        } catch (_) {}
        state.settings = { ...DEFAULT_SETTINGS };
        state.progress = loadProgress();
        saveSettings(state.settings);
        saveProgress(state.progress);
        location.reload();
      },
    },
  ]);
}

function bindGlobal() {
  $$(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.view;
      if (v === "learn" && state.view === "learn" && state.learn.mode) {
        state.learn.mode = null;
        state.learn.lesson = null;
        state.learn.puzzle = null;
        state.learn.game = null;
        render();
        return;
      }
      goView(v);
    }),
  );
  $("#topbar-actions").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (b && !b.disabled) handleAction(b.dataset.action);
  });
  $("#dialog-close").addEventListener("click", closeDialog);
  $("#dialog").addEventListener("click", (e) => {
    if (e.target === $("#dialog")) closeDialog();
  });
  $("#file-input").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importSGF(f);
    e.target.value = "";
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea")) return;
    if ($("#dialog").open) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); newGameDialog(); }
    else if (k === "z") { e.preventDefault(); undo(); }
    else if (k === "p") { e.preventDefault(); passTurn(); }
    else if (k === "h") { e.preventDefault(); askHint(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (state.view === "review") reviewStep(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (state.view === "review") reviewStep(1); }
  });
}

function reviewGotoIndex(index) {
  if (!state.game || !state.review) return;
  const line = state.game.mainLine();
  if (!line.length) return;
  const i = index === Infinity ? line.length - 1 : Math.max(0, Math.min(line.length - 1, index));
  state.game.goto(line[i].id);
  render();
}

function reviewStep(delta) {
  if (!state.game || !state.review) return;
  const line = state.game.mainLine();
  let i = line.findIndex((n) => n.id === state.game.current.id);
  if (i < 0) i = 0;
  reviewGotoIndex(i + delta);
}

function playFromHere() {
  if (!state.game) return;
  if (state.game.current.result) state.game.current.result = null;
  if (state.game.current.phase === "ended") state.game.current.phase = "playing";
  if (state.game.current.phase === "scoring") state.game.current.phase = "playing";
  state.review = null;
  state.reviewOwnership = false;
  state.scoring = null;
  goView("play");
}

function enterReview() {
  state.reviewOwnership = false;
  goView("review");
}

function onboarding() {
  if (!state.settings.firstRun) return;
  const body = `<div class="onboarding">
    <p class="onboarding-lead">${esc(t("onboarding.subtitle"))}</p>
    <div class="lang-grid">${LANG_IDS.map((id) => `<button class="lang-btn" data-onboard-lang="${id}"><strong>${LANG_NAMES[id]}</strong><span>${id.toUpperCase()}</span></button>`).join("")}</div>
    <p class="muted small">${esc(t("onboarding.rulesText"))}</p>
  </div>`;
  openDialog(t("onboarding.welcome"), body, [
    {
      label: t("onboarding.start"),
      kind: "primary",
      action: () => {
        state.settings.firstRun = false;
        saveSettings(state.settings);
      },
    },
  ]);
  $$("[data-onboard-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.lang = b.dataset.onboardLang;
      setLang(state.settings.lang);
      saveSettings(state.settings);
      apply();
      render();
      onboarding();
    }),
  );
}

function bootGame() {
  const saved = Lib.loadCurrent();
  if (saved && saved.sgf) {
    try {
      const { game } = loadSGF(saved.sgf);
      state.game = game;
      state.gameRecordId = saved.recordId || null;
      state.gameName = saved.name || "";
      state.humanColor = saved.humanColor === WHITE ? WHITE : BLACK;
      state.opponent = saved.opponent === "human" ? "human" : "ai";
      state.level = saved.level || state.settings.level || 2;
      return;
    } catch (_) {
      /* fall through to a fresh game */
    }
  }
  state.game = new Game({ size: 9, komi: 6.5 });
  state.humanColor = BLACK;
  state.opponent = "ai";
  state.level = state.settings.level || 2;
}

function init() {
  $$("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
  state.settings.lang = state.settings.lang || detectLang();
  setLang(state.settings.lang);
  setSound(state.settings.sound);
  setTheme();
  apply();

  boardView = new BoardView($("#board"), {
    onPlay: (x, y) => humanPlay(x, y),
    onHover: (v) => {
      if (state.view === "play" && state.game && v && !state.scoring) {
        const ok = state.game.canPlay(v.x, v.y).ok;
        boardView.model.hoverValid = ok;
      } else {
        boardView.model.hoverValid = true;
      }
    },
  });
  boardView.setTheme(state.settings.theme);

  state.learn.preview = new Game({ size: 9, komi: 6.5 });
  bootGame();
  bindGlobal();
  render();


  setTimeout(() => setupChrome().catch(() => {}), 0);
  const importPaths = (detail) => {
    const paths = normalizePaths((detail && detail.paths) || detail);
    const sgf = paths.find((path) => /\.sgf$/i.test(path));
    if (sgf) importSGFPath(sgf);
    else if (paths.length) toast(t("library.importHint"), "warn");
  };
  onDropFiles(importPaths);
  onOpenFiles(importPaths);
  setTimeout(() => onboarding(), 120);
  setTimeout(() => {
    if (state.view === "play") maybeAiMove();
  }, 250);
}

document.addEventListener("DOMContentLoaded", init);
