/**
 * Learn's path as today's session (docs/v9.md, "Two spaces"): the one list
 * chosen for you (model/player.js learnPath — the next lesson, capture Go
 * while it applies, your mistakes and problems due for review, the week's
 * focus around your solving level, one stretch problem, new problems, the
 * first 9×9 game while it applies), played in order. The number of problem
 * items is the day's size the player chose (settings.dailySize: 3, 5 or
 * 10). Finishing an item
 * moves to the next; after the last one, a quiet "done for today".
 *
 * The session is the path as it stood when it started, kept for the day
 * (in the store, session.json, so a restart keeps what is done), so
 * solving a problem does not reshuffle what is left. Two
 * things join it on the way: the bridge a finished lesson leads to
 * (capture Go, the first 9×9 game), and drills that fall due meanwhile
 * (a moment of a game tried again in Play).
 *
 * Item: { kind: "lesson" | "capture" | "mistake" | "problem" | "game", id?,
 * unit?, role, why?, key }; the session: { date, items, done: [key], current }.
 */
import { t, tn } from "../i18n.js";
import { state, update } from "../app/store.js";
import { changeProfile, isRestoring, remember, setSetting } from "../app/ctl-core.js";
import { bridgeAfter, dailySize, evidenceOf, focus, focusLesson, keepFocus, learnPath as pathOf } from "../model/player.js";
import { COURSE, GRADES, PROBLEMS, withContent } from "../content.js";
import { store } from "../data/store.js";
import { allLessons, openLesson, openMistakeDrill, openProblem, themeName } from "../app/practice-ctl.js";
import { startCapture, startFirstGame } from "../app/capture-ctl.js";

/** The model's list for this player now, each item with its key. */
export function learnPath(now = Date.now()) {
  const s = state.settings;
  const list = pathOf(state.profile, { course: COURSE, problems: PROBLEMS, grades: GRADES, settings: { experience: s.experience, playerRank: s.playerRank }, captureWins: s.captureWins || 0, limit: s.dailySize }, now);
  return list.map(keyed);
}

export const itemKey = (it) => (it.id ? `${it.kind}:${it.id}` : it.kind);
const keyed = (it) => ({ ...it, key: itemKey(it) });

/** A focus key's name: a mistake theme, or the endgame. */
export function focusName(key) {
  return key === "endgame" ? t("topic.endgame") : themeName(key);
}

/* ------------------------------------------------------ the week's focus */

/**
 * This week's focus for the path's one line: { keys, names, why, lesson }
 * or null without one. `why` is the evidence of each focus as text (its
 * strongest kind); `lesson` the first lesson that teaches a focus and is
 * not done yet, or null. The first focus shown in a week is kept for the
 * week (model/player.js keepFocus), so it agrees with Play's suggestion.
 */
export function weekFocus(now = Date.now()) {
  const view = focus(state.profile, now, { problems: PROBLEMS, grades: GRADES });
  if (view.keep) changeProfile((p) => keepFocus(p, view));
  if (view.status !== "focus" || !view.focus?.length) return null;
  const done = (id) => !!state.profile.lessons?.[id]?.done;
  const known = new Set(allLessons().map(({ lesson }) => lesson.id));
  const lesson = view.focus.map((a) => focusLesson(a.key, done)).find((id) => id && known.has(id) && !done(id)) || null;
  // "came up 1 times" reads "came up once" (i18n.js tn, by the first count).
  const said = view.focus.map((a) => evidenceOf(a)[0]).map((e) => (e ? tn(e.key, e.params?.[0], e.params) : ""));
  return {
    keys: view.focus.map((a) => a.key),
    names: view.focus.map((a) => focusName(a.key)),
    why: said.filter(Boolean),
    // The same evidence by focus key, for the path's rows.
    reasons: Object.fromEntries(view.focus.map((a, i) => [a.key, said[i]]).filter(([, text]) => text)),
    lesson,
  };
}

/* -------------------------------------------------------- today's session */

let session = null;
const SESSION_KEY = "session.json";

/** The session as stored (today's, or another day's to be ignored); read once. */
function loaded() {
  if (session) return session;
  const v = store.get(SESSION_KEY);
  if (v && typeof v.date === "string" && Array.isArray(v.items) && Array.isArray(v.done)) {
    session = { date: v.date, items: v.items.filter((it) => it && it.kind), done: v.done.filter((k) => typeof k === "string"), current: typeof v.current === "string" ? v.current : null };
  }
  return session;
}

/** Keep the session across a restart. */
function save(s = session) {
  if (s) store.put(SESSION_KEY, { date: s.date, items: s.items, done: s.done, current: s.current ?? null });
}

const dayOf = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function known(it) {
  if (it.kind === "mistake") return state.profile.mistakes.some((m) => m.id === it.id);
  if (it.kind === "problem") return PROBLEMS.some((x) => x.id === it.id);
  if (it.kind === "lesson") return allLessons().some(({ lesson }) => lesson.id === it.id);
  return true;
}

const isDone = (s, it) => s.done.includes(it.key);

/** Where the next item goes in: after the one open now, else before the first not done. */
function insertAt(s) {
  const at = s.items.findIndex((it) => it.key === s.current);
  if (at >= 0) return at + 1;
  const open = s.items.findIndex((it) => !isDone(s, it));
  return open >= 0 ? open : s.items.length;
}

/**
 * Today's session, or null before it starts (and on another day). Items
 * that no longer exist (a drill removed) leave it; drills that fell due
 * since it started join it, before the first game (which leaves Learn).
 */
export function todaysSession(now = Date.now()) {
  const s = loaded();
  if (!s || s.date !== dayOf(now)) return null;
  s.items = s.items.filter(known);
  s.done = s.done.filter((k) => s.items.some((it) => it.key === k));
  const have = new Set(s.items.map((it) => it.key));
  const fresh = learnPath(now).filter((it) => it.kind === "mistake" && !have.has(it.key));
  if (fresh.length) {
    let at = insertAt(s);
    const game = s.items.findIndex((it) => it.kind === "game");
    if (game >= 0 && game < at && !isDone(s, s.items[game])) at = game;
    s.items.splice(at, 0, ...fresh);
    save(s);
  }
  return s.items.length ? s : null;
}

/** A new session from the path now, keeping what is already done today. */
function begin(now = Date.now()) {
  const before = todaysSession(now);
  const items = learnPath(now);
  session = { date: dayOf(now), items, done: (before?.done || []).filter((k) => items.some((it) => it.key === k)), current: null };
  save();
  return session;
}

const isPick = (it) => it.kind === "problem" || it.kind === "mistake";

/**
 * The day's size, chosen on the path (3, 5 or 10 problem items; kept in
 * the settings). A session nobody has started yet is simply made again at
 * the new size. One under way keeps what is done and what is open: a
 * smaller day drops problems not done from its end, a larger one takes
 * more from the path as it stands now.
 */
export function setDailySize(n, now = Date.now()) {
  const size = dailySize(n);
  if (size === state.settings.dailySize) return;
  setSetting("dailySize", size);
  const s = todaysSession(now);
  if (!s) return;
  if (!s.done.length && !s.current) {
    resetSession();
    update();
    return;
  }
  let picks = s.items.filter(isPick).length;
  for (let i = s.items.length - 1; i >= 0 && picks > size; i--) {
    const it = s.items[i];
    if (!isPick(it) || isDone(s, it) || it.key === s.current) continue;
    s.items.splice(i, 1);
    picks--;
  }
  if (picks < size) {
    const have = new Set(s.items.map((it) => it.key));
    const more = learnPath(now).filter((it) => isPick(it) && !have.has(it.key)).slice(0, size - picks);
    // Before the first game, which leaves Practice for Play.
    const game = s.items.findIndex((it) => it.kind === "game");
    s.items.splice(game >= 0 ? game : s.items.length, 0, ...more);
  }
  save(s);
  update();
}

/** The first item not done after the one open now, else the first not done. */
export function upNext(s = state.learn.daily || todaysSession()) {
  if (!s) return null;
  const at = s.items.findIndex((it) => it.key === s.current);
  return s.items.slice(at + 1).find((it) => !isDone(s, it)) || s.items.find((it) => !isDone(s, it) && it.key !== s.current) || null;
}

/**
 * What the home shows: { items, done: Set<key>, started, finished }: the
 * session once it has started today, else the path as it stands now.
 */
export function pathNow(now = Date.now()) {
  const s = todaysSession(now);
  const items = s ? s.items : learnPath(now);
  const done = new Set(s?.done || []);
  return { items, done, started: done.size > 0, finished: !!s && items.length > 0 && items.every((it) => done.has(it.key)) };
}

/** Where the open item stands in the session, for the toolbar: { n, total } or null. */
export function sessionPlace() {
  const s = state.learn.daily;
  if (!s) return null;
  const n = s.items.findIndex((it) => it.key === s.current);
  return n >= 0 ? { n: n + 1, total: s.items.length } : null;
}

/** The open session item, or null. */
export function sessionItem() {
  const s = state.learn.daily;
  return s ? s.items.find((it) => it.key === s.current) || null : null;
}

/** Start (or go on with) today's session: its first item not done. */
export function startPath() {
  // Lesson steps and the beginner pool (taughtPool reads the finished lessons' steps), problem bodies.
  return withContent("course", () =>
    withContent("problems", () => {
      const s = todaysSession() || begin();
      const it = s.items.find((x) => !isDone(s, x));
      if (!it) return finish(s);
      if (!isRestoring()) remember();
      openItem(s, it);
    }),
  );
}

/** One row of the path: the session from that item on. */
export function openPathItem(key) {
  return withContent("course", () =>
    withContent("problems", () => {
      let s = todaysSession();
      if (!s || !s.items.some((it) => it.key === key)) s = begin();
      const it = s.items.find((x) => x.key === key);
      if (!it) return;
      if (!isRestoring()) remember();
      openItem(s, it);
    }),
  );
}

function openItem(s, it) {
  s.current = it.key;
  save(s);
  if (it.kind === "lesson") return openLesson(it.id, null, { daily: s });
  if (it.kind === "problem") return openProblem(it.id, { daily: s });
  if (it.kind === "mistake") return openMistakeDrill(it.id, { daily: s });
  if (it.kind === "capture") return startCapture({ daily: s });
  if (it.kind === "game") {
    // The first 9×9 game is played in Play: starting it is doing it.
    markDone(s, it.key);
    s.current = null;
    return startFirstGame();
  }
}

function markDone(s, key) {
  if (s && key && !s.done.includes(key)) {
    s.done.push(key);
    save(s);
  }
}

/** The open session item is done (a problem solved, a drill found, a lesson finished, a capture game over). */
export function itemDone(kind, id = null) {
  const s = state.learn.daily;
  if (!s) return;
  const key = itemKey({ kind, id });
  if (s.items.some((it) => it.key === key)) markDone(s, key);
}

/**
 * A lesson of the session is finished: it is done, and the bridge it leads
 * to joins the session — capture Go next, the first 9×9 game at the end.
 */
export function lessonFinished(lessonId) {
  const s = state.learn.daily;
  if (!s) return;
  itemDone("lesson", lessonId);
  const bridge = bridgeAfter(lessonId, state.profile, { captureWins: state.settings.captureWins });
  if (bridge === "capture" && !s.items.some((it) => it.kind === "capture")) s.items.splice(insertAt(s), 0, keyed({ kind: "capture", role: "bridge" }));
  if (bridge === "firstGame" && !s.items.some((it) => it.kind === "game")) s.items.push(keyed({ kind: "game", role: "bridge" }));
  save(s);
}

/** "Continue": the open item is done; on to the next, or the quiet end of the day. */
export function continuePath() {
  const s = state.learn.daily || todaysSession();
  if (!s) return;
  markDone(s, s.current);
  const it = upNext(s);
  if (!it) return finish(s);
  openItem(s, it);
}

function finish(s) {
  s.current = null;
  save(s);
  update((st) => {
    st.space = "learn";
    st.learn = { ...st.learn, view: "dailyDone", lesson: null, problem: null, mistake: null, daily: null };
  });
}

/** For tests: forget today's session (`keepStored`: as a restart would, memory only). */
export function resetSession({ keepStored = false } = {}) {
  session = null;
  if (!keepStored) store.remove(SESSION_KEY);
}
