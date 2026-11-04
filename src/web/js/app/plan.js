/**
 * v7: a personal training plan.
 *
 * playerModel() reads what the player has actually done — the per-game
 * records of analysed games (progress.games: themes of the explained
 * mistakes, the points each theme cost, the loss per phase), problem
 * results (progress.problems) and mistake-drill results (progress.mistakes)
 * — and says where the points go and which problem themes are missed.
 * Recent games weigh more; nothing is claimed without enough evidence (see
 * RULES and docs/plan.md). planDaily() turns the model into today's five.
 *
 * Pure: no DOM, no app state, no engine. Everything comes from arguments.
 */
import { THEME_TOPIC } from "./insight.js";
import { DAY, LADDER, dailySet, normalizeGameRecords, todayKey } from "../persist.js";

/** Thresholds of the model (documented in docs/plan.md). */
export const RULES = {
  WINDOW_GAMES: 10, // the newest analysed games considered…
  WINDOW_DAYS: 90, // …played in the last 90 days
  GAME_HALF_LIFE: 5, // a game five games back weighs half as much
  MIN_GAMES: 3, // analysed games before any game-based claim
  MIN_GAMES_WITH: 2, // a theme must come up in at least two games…
  MIN_POINTS: 6, // …and cost at least this many points (when the points are known)
  MIN_MISTAKES: 3, // …or, without points, come up at least three times
  COUNT_POINTS: 4, // a mistake of unknown cost counts as this many points for ranking
  ENDGAME_MIN_GAMES: 3, // KataGo-analysed games before an endgame claim
  ENDGAME_PER_GAME: 5, // average endgame loss per game, in points…
  ENDGAME_SHARE: 0.4, // …and at least this share of all the points lost
  ENDGAME_WEIGHT: 0.5, // endgame points rank at half weight (spread over many moves)
  PROBLEM_WINDOW_DAYS: 60, // problem results older than this are ignored
  PROBLEM_HALF_LIFE_DAYS: 21,
  MIN_PROBLEMS: 4, // problems tried in a theme before a claim
  MISS_RATE: 0.5, // missed at least half of them (recency-weighted)…
  MISS_MARGIN: 0.15, // …and clearly more than usual (once 10+ problems are tried)
  MISS_POINTS: 3, // a missed problem ranks like a three-point mistake
  LEVEL_MIN: 3, // problems tried at a grade before it can set the level
  LEVEL_CLEAN: 0.6, // clean-solve rate that counts as "solves this grade"
  MAX_FOCUS: 2,
  MAX_REVIEWS: 3, // with a focus, reviews take at most three of the five
};

/** Endgame problem themes all belong to the one "endgame" focus. */
export const ENDGAME_THEMES = ["hane-connect", "sente-gote", "reverse-sente", "double-sente", "monkey-jump", "endgame-compare", "deiri"];

/** A mistake theme (explain.describeMistakes) or problem theme → focus key. */
export function focusKey(theme) {
  if (!theme) return null;
  if (theme === "race-shared") return "race";
  if (ENDGAME_THEMES.includes(theme)) return "endgame";
  return theme;
}

/** Lessons that teach a focus, in course order (the first not yet done is offered). */
export const FOCUS_LESSONS = {
  atari: ["capture-direction"],
  ladder: ["capture-ladder", "escape-ladder"],
  net: ["capture-net"],
  snapback: ["capture-snapback", "adv-tesuji-throw-in-snapback"],
  "throw-in": ["capture-snapback", "adv-tesuji-throw-in-snapback"],
  "double-atari": ["capture-double"],
  "connect-and-die": ["adv-tesuji-throw-in-connect"],
  shortage: ["adv-tesuji-throw-in-connect"],
  "capture-to-save": ["escape-counter"],
  escape: ["escape-extend", "escape-connect"],
  connect: ["connect-solid", "connect-hanging"],
  cut: ["connect-cut", "connect-cut-capture", "fight-cutting-stones"],
  "vital-point": ["kill-straight-three", "kill-bent-three", "kill-reduce"],
  placement: ["kill-reduce"],
  "eye-space": ["life-space", "life-corner"],
  "capture-eye": ["life-eye"],
  "false-eye": ["life-false-eye"],
  ko: ["stones-ko", "adv-life-ko"],
  seki: ["adv-life-seki"],
  race: ["race-count", "race-read", "race-practice"],
  "race-outside": ["race-outside"],
  "race-eye": ["race-read"],
  "race-big-eye": ["race-read"],
  endgame: ["endgame-sente-gote", "endgame-first-line", "endgame-double-sente", "endgame-reverse-sente", "endgame-order"],
};

/** The lesson to offer for a focus: the first not done, else the first. */
export function focusLesson(key, isDone = () => false) {
  const ids = FOCUS_LESSONS[key] || [];
  return ids.find((id) => !isDone(id)) || ids[0] || null;
}

/** The problem topic (and theme filter) for a focus. */
export function focusTopic(key, problems = []) {
  if (key === "endgame") return { topic: "endgame", theme: null };
  if (THEME_TOPIC[key] && problems.some((p) => p.topic === THEME_TOPIC[key] && p.theme === key)) return { topic: THEME_TOPIC[key], theme: key };
  const count = {};
  for (const p of problems) if (p.theme === key) count[p.topic] = (count[p.topic] || 0) + 1;
  const topic = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
  return { topic, theme: topic ? key : null };
}

/** Points each theme cost in one game's explained mistakes (of `color`). */
export function themeLosses(mistakes, color = null) {
  const out = {};
  for (const m of mistakes || []) {
    if (!m.theme || (color != null && m.move?.color !== color)) continue;
    out[m.theme] = (out[m.theme] || 0) + Math.max(0, Number(m.loss) || 0);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

const round1 = (v) => Math.round(v * 10) / 10;
const half = (v) => Math.round(v * 2) / 2;

/** When a drill was last tried: persist.markMistake set its next date one ladder step later. */
export function drillLast(m) {
  const step = m.streak > 0 ? LADDER[Math.min(LADDER.length - 1, m.streak - 1)] : 1;
  return m.due ? m.due - step * DAY : m.added || 0;
}

function area(map, key) {
  if (!map[key]) map[key] = { key, score: 0, games: null, problems: null, endgame: null };
  return map[key];
}

/**
 * The player model. `progress` is the stored progress; `problems` the
 * problem definitions (id, topic, theme); `grades` problem-grades.json.
 * Returns
 *   { status: "focus" | "notEnough" | "none",
 *     games: { analysed, high, needed },   // needed: analysed games still missing
 *     problems: { tried, missed, missRate, level },
 *     areas: [{ key, score, claim, games?, problems?, endgame? }],  // strongest first
 *     focus: [area…] }                      // claimed areas, at most MAX_FOCUS
 * games:    { games, mistakes, points (null when a game did not keep them), claim }
 * problems: { tried, missed, rate, claim }
 * endgame:  { games, points, perGame, share, claim }
 */
export function playerModel(progress, { problems = [], grades = {}, now = Date.now() } = {}) {
  const R = RULES;
  const map = {};

  /* Games: the newest analysed records, recent ones weighing more. */
  const records = normalizeGameRecords(progress?.games).filter((g) => g.phases && now - g.at <= R.WINDOW_DAYS * DAY && g.at <= now);
  const recent = records.slice(0, R.WINDOW_GAMES);
  const weightOf = (i) => Math.pow(0.5, i / R.GAME_HALF_LIFE);
  const enoughGames = recent.length >= R.MIN_GAMES;
  recent.forEach((g, i) => {
    const w = weightOf(i);
    const keyed = {};
    for (const [theme, count] of Object.entries(g.themes || {})) {
      const key = focusKey(theme);
      const lost = g.themeLoss && Number.isFinite(g.themeLoss[theme]) ? g.themeLoss[theme] : null;
      const k = (keyed[key] ||= { count: 0, points: 0, known: true });
      k.count += count;
      if (lost == null) k.known = false;
      else k.points += lost;
    }
    for (const [key, k] of Object.entries(keyed)) {
      const a = area(map, key);
      const st = (a.games ||= { games: 0, mistakes: 0, points: 0, known: true, weight: 0 });
      st.games++;
      st.mistakes += k.count;
      st.points += k.points;
      if (!k.known) st.known = false;
      st.weight += w * (k.known ? k.points : k.count * R.COUNT_POINTS);
    }
  });
  for (const a of Object.values(map)) {
    const st = a.games;
    if (!st) continue;
    st.points = st.known ? half(st.points) : null;
    st.claim = enoughGames && st.games >= R.MIN_GAMES_WITH && (st.points != null ? st.points >= R.MIN_POINTS : st.mistakes >= R.MIN_MISTAKES);
    st.weight = round1(st.weight);
    delete st.known;
  }

  /* Endgame: only from KataGo-analysed games (the offline estimate is too rough per phase). */
  const high = recent.map((g, i) => ({ g, w: weightOf(i) })).filter(({ g }) => g.confidence === "high");
  if (high.length) {
    const end = high.reduce((s, { g }) => s + g.phases.endgame.loss, 0);
    const total = high.reduce((s, { g }) => s + g.phases.opening.loss + g.phases.middle.loss + g.phases.endgame.loss, 0);
    const perGame = end / high.length;
    const share = total > 0 ? end / total : 0;
    if (end > 0) {
      const a = area(map, "endgame");
      a.endgame = {
        games: high.length,
        points: half(end),
        perGame: half(perGame),
        share: Math.round(share * 100) / 100,
        weight: round1(R.ENDGAME_WEIGHT * high.reduce((s, { g, w }) => s + w * g.phases.endgame.loss, 0)),
        claim: high.length >= R.ENDGAME_MIN_GAMES && perGame >= R.ENDGAME_PER_GAME && share >= R.ENDGAME_SHARE,
      };
    }
  }

  /* Problems and drills: recent results per theme. */
  const defs = new Map(problems.map((p) => [p.id, p]));
  const results = [];
  for (const [id, e] of Object.entries(progress?.problems || {})) {
    const p = defs.get(id);
    if (!p || !e || !(e.attempts > 0)) continue;
    results.push({ key: focusKey(p.theme || (p.topic === "endgame" ? "endgame" : null)), last: e.last || 0, miss: !e.solved || !(e.streak > 0), grade: grades[id]?.grade || 1 });
  }
  for (const m of progress?.mistakes || []) {
    if (!m || !(m.attempts > 0) || !m.theme) continue;
    results.push({ key: focusKey(m.theme), last: drillLast(m), miss: !(m.streak > 0), grade: null, drill: true });
  }
  const live = results.filter((r) => r.key && now - r.last <= R.PROBLEM_WINDOW_DAYS * DAY);
  const wOf = (r) => Math.pow(0.5, Math.max(0, now - r.last) / DAY / R.PROBLEM_HALF_LIFE_DAYS);
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const allW = sum(live, wOf);
  const overall = allW > 0 ? sum(live, (r) => wOf(r) * (r.miss ? 1 : 0)) / allW : null;
  const byKey = {};
  for (const r of live) (byKey[r.key] ||= []).push(r);
  for (const [key, rs] of Object.entries(byKey)) {
    const w = sum(rs, wOf);
    const rate = w > 0 ? sum(rs, (r) => wOf(r) * (r.miss ? 1 : 0)) / w : 0;
    const missed = rs.filter((r) => r.miss).length;
    if (!missed) continue;
    const a = area(map, key);
    a.problems = {
      tried: rs.length,
      missed,
      rate: Math.round(rate * 100) / 100,
      weight: round1(sum(rs, (r) => wOf(r) * (r.miss ? 1 : 0)) * R.MISS_POINTS),
      claim: rs.length >= R.MIN_PROBLEMS && rate >= R.MISS_RATE && (live.length < 10 || rate >= overall + R.MISS_MARGIN),
    };
  }

  /* Ranking: only claimed evidence counts towards the score. */
  for (const a of Object.values(map)) {
    a.claim = !!(a.games?.claim || a.problems?.claim || a.endgame?.claim);
    a.score = round1((a.games?.claim ? a.games.weight : 0) + (a.problems?.claim ? a.problems.weight : 0) + (a.endgame?.claim ? a.endgame.weight : 0));
  }
  const areas = Object.values(map).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const focus = areas.filter((a) => a.claim).slice(0, R.MAX_FOCUS);
  const anything = records.length > 0 || live.length > 0;
  return {
    status: focus.length ? "focus" : anything ? "notEnough" : "none",
    games: { analysed: recent.length, high: high.length, needed: Math.max(0, R.MIN_GAMES - recent.length) },
    problems: { tried: live.filter((r) => !r.drill).length, missed: live.filter((r) => !r.drill && r.miss).length, missRate: overall == null ? null : Math.round(overall * 100) / 100, level: solvingLevel(results.filter((r) => !r.drill && now - r.last <= R.PROBLEM_WINDOW_DAYS * DAY)) },
    areas,
    focus,
  };
}

/**
 * The player's solving level: the highest grade (1–5) where at least
 * LEVEL_MIN problems were tried and LEVEL_CLEAN of them are cleanly solved
 * now; grade 1 when none qualifies yet but enough were tried; null with
 * too few results to say.
 */
export function solvingLevel(results) {
  let level = null;
  let tried = 0;
  for (let g = 1; g <= 5; g++) {
    const at = results.filter((r) => r.grade === g);
    tried += at.length;
    if (at.length >= RULES.LEVEL_MIN && at.filter((r) => !r.miss).length / at.length >= RULES.LEVEL_CLEAN) level = g;
  }
  if (level == null && tried >= RULES.LEVEL_MIN) level = 1;
  return level;
}

/**
 * The evidence for one focus as a sentence: { key, params } (i18n), the
 * strongest kind first. Games with known points → points; games without →
 * how often; the endgame → points per game; problems → misses.
 */
export function evidenceOf(a) {
  const out = [];
  if (a.games?.claim) {
    if (a.games.points != null) out.push({ key: "plan.why.points", params: [String(a.games.points), a.games.games] });
    else out.push({ key: "plan.why.times", params: [a.games.mistakes, a.games.games] });
  }
  if (a.endgame?.claim) out.push({ key: "plan.why.lateGame", params: [String(a.endgame.perGame), a.endgame.games] });
  if (a.problems?.claim) out.push({ key: "plan.why.problems", params: [a.problems.missed, a.problems.tried] });
  return out;
}

/**
 * The model for "this week's focus": the evidence as it stood when the week
 * began (Monday 00:00, `weekStart`), so the focus stays put for the week;
 * the current evidence when the week began without a focus.
 */
export function weeklyModel(progress, { problems = [], grades = {}, now = Date.now(), weekStart } = {}) {
  if (Number.isFinite(weekStart) && weekStart < now) {
    const before = {
      ...progress,
      games: (progress?.games || []).filter((g) => (g?.at || 0) < weekStart),
      problems: Object.fromEntries(Object.entries(progress?.problems || {}).filter(([, e]) => (e?.last || 0) < weekStart)),
      mistakes: (progress?.mistakes || []).filter((m) => m && (m.added || 0) < weekStart && drillLast(m) < weekStart),
    };
    const m = playerModel(before, { problems, grades, now: weekStart });
    if (m.focus.length) return { ...m, since: weekStart };
  }
  return { ...playerModel(progress, { problems, grades, now }), since: null };
}

function seeded(now) {
  let seed = Number(todayKey(new Date(now)).replace(/-/g, "")) * 7 + 3 || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

/**
 * Today's five, chosen by the plan:
 *   1. due reviews (mistake drills from your games, then problems; the
 *      spaced-repetition ladder of persist.js), at most MAX_REVIEWS;
 *   2. problems from the focus themes around the solving level (the level
 *      and one above), the two focuses taking turns; from `pool` (what the
 *      player has been taught), else the easiest of `bank` (all problems);
 *   3. one stretch problem two grades above the level;
 *   4. anything left as before (persist.dailySet).
 * Returns null without a focus, so the caller keeps its own choice.
 * Items: { kind: "m" | "p", id, role: "review" | "focus" | "stretch" | "new", why? }.
 */
export function planDaily({ progress, model, pool, bank = null, grades = {}, now = Date.now(), limit = 5 }) {
  if (!model?.focus?.length || !pool?.length) return null;
  const gradeOf = (p) => grades[p.id]?.grade || 1;
  const entry = (p) => progress.problems?.[p.id];
  const items = [];
  const taken = new Set();
  const add = (it) => {
    if (items.length >= limit || taken.has(it.id)) return false;
    taken.add(it.id);
    items.push(it);
    return true;
  };
  const focusKeys = model.focus.map((a) => a.key);
  const keyOf = (p) => focusKey(p.theme || (p.topic === "endgame" ? "endgame" : null));

  // 1. Reviews.
  const dueDrills = (progress.mistakes || []).filter((m) => (m.due || 0) <= now).slice(0, 2);
  for (const m of dueDrills) add({ kind: "m", id: m.id, role: "review", ...(focusKeys.includes(focusKey(m.theme)) ? { why: focusKey(m.theme) } : {}) });
  const dueProblems = pool.filter((p) => entry(p)?.due && entry(p).due <= now).sort((a, b) => entry(a).due - entry(b).due);
  for (const p of dueProblems) {
    if (items.length >= Math.min(RULES.MAX_REVIEWS, limit - 2)) break;
    add({ kind: "p", id: p.id, role: "review" });
  }

  // 2. Focus problems around the level.
  const unseen = pool.filter((p) => !entry(p));
  const level = model.problems?.level ?? (unseen.length ? Math.min(...unseen.map(gradeOf)) : 1);
  const rand = seeded(now);
  const all = bank?.length ? bank : pool;
  const order = new Map(all.map((p) => [p.id, rand()]));
  const open = (p) => !entry(p)?.solved && !taken.has(p.id);
  const rank = (list) => list.slice().sort((a, b) => Math.abs(gradeOf(a) - level) - Math.abs(gradeOf(b) - level) || (entry(a) ? 1 : 0) - (entry(b) ? 1 : 0) || order.get(a.id) - order.get(b.id));
  const lists = focusKeys.map((key) => {
    const mine = pool.filter((p) => keyOf(p) === key && open(p));
    const near = mine.filter((p) => gradeOf(p) >= level && gradeOf(p) <= level + 1);
    const lower = mine.filter((p) => gradeOf(p) < level);
    if (near.length || lower.length) return [...rank(near), ...rank(lower)];
    // The pool (a beginner's taught topics) has none: the easiest of the
    // whole bank, never above the level, since the games asked for it.
    return rank(all.filter((p) => keyOf(p) === key && open(p) && gradeOf(p) <= level));
  });
  const focusSlots = limit - items.length - 1;
  for (let placed = 0; placed < focusSlots && lists.some((l) => l.length); ) {
    for (let k = 0; k < lists.length && placed < focusSlots; k++) {
      while (lists[k].length) {
        const p = lists[k].shift();
        if (add({ kind: "p", id: p.id, role: "focus", why: focusKeys[k] })) {
          placed++;
          break;
        }
      }
    }
  }

  // 3. One stretch problem: two grades up, a focus theme if there is one.
  const target = Math.min(5, level + 2);
  const stretchOf = (list) => rank(list.filter((p) => open(p) && gradeOf(p) === target))[0] || rank(list.filter((p) => open(p) && gradeOf(p) > level).sort((a, b) => gradeOf(b) - gradeOf(a)))[0];
  const stretch = stretchOf(pool.filter((p) => focusKeys.includes(keyOf(p)))) || stretchOf(pool);
  if (stretch) {
    const why = focusKeys.includes(keyOf(stretch)) ? keyOf(stretch) : null;
    add({ kind: "p", id: stretch.id, role: "stretch", ...(why ? { why } : {}) });
  }

  // 4. The rest as before.
  const rest = dailySet(progress, pool.filter((p) => !taken.has(p.id)), grades, limit - items.length, now);
  for (const p of rest) add({ kind: "p", id: p.id, role: "new" });
  return items.slice(0, limit);
}
