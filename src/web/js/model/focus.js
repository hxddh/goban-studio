/**
 * The week's focus: the player's weak areas read from own games and
 * problems, the evidence for each, and the solving level. Pure.
 */
import { RULES, normalizeProfile } from "./profile.js";
import { DAY, finite } from "./util.js";
import { LADDER } from "./memory.js";

/** A day's size as the player chose it: one of RULES.DAILY_SIZES, else the default. */
export function dailySize(v) {
  return RULES.DAILY_SIZES.includes(v) ? v : RULES.DAILY_SIZE;
}

/** Endgame problem themes all belong to the one "endgame" focus. */
export const ENDGAME_THEMES = ["hane-connect", "sente-gote", "reverse-sente", "double-sente", "monkey-jump", "endgame-compare", "deiri"];

/** Mistake themes → the problem topic that teaches them (app/insight.js). */
export const THEME_TOPIC = {
  ladder: "capture",
  net: "capture",
  snapback: "capture",
  "throw-in": "capture",
  "double-atari": "capture",
  shortage: "capture",
  "connect-and-die": "capture",
  cut: "connect",
  "vital-point": "kill",
  "eye-space": "life",
  "false-eye": "kill",
  ko: "life",
  "race-outside": "race",
  "race-shared": "race",
};

/** A mistake theme or problem theme → focus key. */
export function focusKey(theme) {
  if (!theme) return null;
  if (theme === "race-shared") return "race";
  if (ENDGAME_THEMES.includes(theme)) return "endgame";
  return theme;
}

/** Lessons that teach a focus, in course order. */
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
  ko: ["stones-ko", "ko-threat", "ko-count", "ko-resolve", "adv-life-ko"],
  seki: ["adv-life-seki"],
  race: ["race-count", "race-read", "race-practice"],
  "race-outside": ["race-outside"],
  "race-eye": ["race-read"],
  "race-big-eye": ["race-read"],
  endgame: ["endgame-sente-gote", "endgame-first-line", "endgame-reverse-sente", "endgame-double-sente", "endgame-counting", "endgame-big", "endgame-japanese-counting", "endgame-order"],
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

/** Points each theme cost in one game's explained mistakes (of `color`), for a record's themeLoss. */
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

/** When a drill was last tried (older drills: one ladder step before its due date). */
export function drillLast(m) {
  if (finite(m.last)) return m.last;
  const step = m.streak > 0 ? LADDER[Math.min(LADDER.length - 1, m.streak - 1)] : 1;
  return m.due ? m.due - step * DAY : m.added || 0;
}

function area(map, key) {
  if (!map[key]) map[key] = { key, score: 0, games: null, problems: null, endgame: null };
  return map[key];
}

/**
 * The clean-solve rate expected at `grade` from a prior level (the
 * placement, the level before): likely at and below it, unlikely above.
 */
function priorRate(grade, prior) {
  if (!finite(prior)) return 0.5;
  return grade <= prior ? RULES.PRIOR_AT : RULES.PRIOR_ABOVE;
}

/** The clean rate at one grade, smoothed towards the prior: (clean + k·prior) / (tried + k). */
export function smoothedRate(clean, tried, grade, prior = null) {
  const k = RULES.LEVEL_PRIOR_WEIGHT;
  return (clean + k * priorRate(grade, prior)) / (tried + k);
}

/**
 * The player's solving level (it must be consistent). `results` are
 * first-sight results, [{ grade, miss }]: one per problem, `miss` when the
 * first ever attempt was not a clean solve — a problem missed and solved
 * on a later review is still a miss here, so reviewing cannot raise the
 * level (evidence() builds them from each record's `first`).
 *
 * The level is the highest grade (1–5) where
 *   - at least LEVEL_MIN problems were tried and the clean rate, smoothed
 *     towards the prior level (`prior`: the placement; LEVEL_PRIOR_WEIGHT
 *     pseudo-results), is at least LEVEL_CLEAN;
 *   - every lower grade with results is at least LEVEL_FLOOR, so a lucky
 *     run at grade 4 over misses at grade 2 is not a level 4;
 *   - every lower grade has results at all, or is covered: at or below
 *     `cover`, the grade the player was started at (the placement grade
 *     by default; practicePath passes the grade of the rank given when there
 *     is no placement). Results at grade 5 alone say nothing about grades
 *     3 and 4.
 * Grade 1 when none qualifies yet but enough were tried; null with too
 * few results to say.
 */
export function solvingLevel(results, { fallback = true, prior = null, cover = prior } = {}) {
  let level = null;
  let tried = 0;
  let floorOk = true;
  let reached = true; // no uncovered grade without results below
  for (let g = 1; g <= 5; g++) {
    const at = results.filter((r) => r.grade === g);
    tried += at.length;
    const clean = at.filter((r) => !r.miss).length;
    const rate = smoothedRate(clean, at.length, g, prior);
    if (floorOk && reached && at.length >= RULES.LEVEL_MIN && rate >= RULES.LEVEL_CLEAN) level = g;
    if (at.length && rate < RULES.LEVEL_FLOOR) floorOk = false;
    if (!at.length && !(finite(cover) && g <= cover)) reached = false;
  }
  if (fallback && level == null && tried >= RULES.LEVEL_MIN) level = 1;
  return level;
}

/**
 * Where to work while no grade measures a level yet: the grade the player
 * was started at (`start`: the placement, or the grade of their rank),
 * one lower for each grade from there down that has LEVEL_MIN first-sight
 * results and a clean rate under LEVEL_FLOOR. A start that proves too high
 * comes down a grade at a time, instead of holding the player there for
 * good. Null without a start.
 */
export function startGrade(results, start, prior = null) {
  if (!finite(start)) return null;
  let g = Math.max(1, Math.min(5, Math.round(start)));
  for (; g > 1; g--) {
    const at = results.filter((r) => r.grade === g);
    if (at.length < RULES.LEVEL_MIN) break;
    if (smoothedRate(at.filter((r) => !r.miss).length, at.length, g, prior) >= RULES.LEVEL_FLOOR) break;
  }
  return g;
}

/**
 * The evidence (app/plan.js playerModel): where the points go in the
 * player's analysed games, and which problem themes and drills are missed.
 *   { status: "focus" | "notEnough" | "none",
 *     games: { analysed, high, needed },
 *     problems: { tried, missed, missRate, level },
 *     areas: [{ key, score, claim, games?, problems?, endgame? }],  // strongest first
 *     focus: [area…] }                                             // claimed, at most MAX_FOCUS
 *
 * `problems.level` is the solving level from first-sight results
 * (solvingLevel); `cover` is the grade the player was started at when it is
 * not the placement's (levelPrior), so the grades below it need no results.
 * `problems.levelOnGrade` says whether a grade measured it (else `level`
 * is the grade-1 fallback or null), and `problems.start` is where to work
 * until one does (startGrade): show `levelOnGrade ? level : start`.
 * A theme's miss rate is another matter: it reads each problem's latest
 * result, because the focus is about what is missed now.
 */
export function evidence(profile, { problems = [], grades = {}, now = 0, cover = null } = {}) {
  const R = RULES;
  const map = {};
  const p = normalizeProfile(profile);

  /* Games: the newest analysed records, recent ones weighing more. */
  const records = (p.games || []).filter((g) => g.phases && now - g.at <= R.WINDOW_DAYS * DAY && g.at <= now);
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
  const defs = new Map(problems.map((d) => [d.id, d]));
  const results = [];
  for (const [id, e] of Object.entries(p.problems || {})) {
    const d = defs.get(id);
    if (!d || !e || !(e.tries > 0)) continue;
    results.push({ key: focusKey(d.theme || (d.topic === "endgame" ? "endgame" : null)), last: e.last || 0, miss: !e.solved || !(e.streak > 0), grade: grades[id]?.grade || 1, first: e.first || null, seen: e.seen ?? e.last ?? 0 });
  }
  for (const m of p.mistakes || []) {
    if (!m || !(m.tries > 0) || !m.theme || m.own === false) continue;
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

  // The level: first-sight results of the problems met in the window (a
  // record whose first result is not known is left out), smoothed towards
  // the placement, the only prior a level has.
  const recentProblems = results.filter((r) => !r.drill && r.first && now - r.seen <= R.PROBLEM_WINDOW_DAYS * DAY).map((r) => ({ grade: r.grade, miss: r.first === "miss" }));
  const prior = p.placement?.grade ?? null;
  const levelOpts = { prior, cover: finite(cover) ? Math.max(cover, prior ?? 0) : prior };

  /* Ranking: only claimed evidence counts towards the score. */
  for (const a of Object.values(map)) {
    a.claim = !!(a.games?.claim || a.problems?.claim || a.endgame?.claim);
    a.score = round1((a.games?.claim ? a.games.weight : 0) + (a.problems?.claim ? a.problems.weight : 0) + (a.endgame?.claim ? a.endgame.weight : 0));
  }
  const areas = Object.values(map).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const focusAreas = areas.filter((a) => a.claim).slice(0, R.MAX_FOCUS);
  const anything = records.length > 0 || live.length > 0;
  return {
    status: focusAreas.length ? "focus" : anything ? "notEnough" : "none",
    games: { analysed: recent.length, high: high.length, needed: Math.max(0, R.MIN_GAMES - recent.length) },
    problems: { tried: live.filter((r) => !r.drill).length, missed: live.filter((r) => !r.drill && r.miss).length, missRate: overall == null ? null : Math.round(overall * 100) / 100, level: solvingLevel(recentProblems, levelOpts), levelOnGrade: solvingLevel(recentProblems, { ...levelOpts, fallback: false }) != null, start: startGrade(recentProblems, levelOpts.cover, prior) },
    areas,
    focus: focusAreas,
  };
}

/**
 * The evidence for one focus as sentences: [{ key, params }] (i18n), the
 * strongest kind first.
 */
export function evidenceOf(a) {
  const out = [];
  if (a.games?.claim) {
    if (a.games.points != null) out.push({ key: "practice.why.points", params: [String(a.games.points), a.games.games] });
    else out.push({ key: "practice.why.times", params: [a.games.mistakes, a.games.games] });
  }
  if (a.endgame?.claim) out.push({ key: "practice.why.lateGame", params: [String(a.endgame.perGame), a.endgame.games] });
  if (a.problems?.claim) out.push({ key: "practice.why.problems", params: [a.problems.missed, a.problems.tried] });
  return out;
}

/** Monday 00:00 local time of the week `now` falls in. */
export function weekStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The profile as it stood when `start` came: games, problems and drills before it. */
function before(p, start) {
  return {
    ...p,
    games: p.games.filter((g) => g.at < start),
    problems: Object.fromEntries(Object.entries(p.problems).filter(([, e]) => (e.last || 0) < start)),
    mistakes: p.mistakes.filter((m) => (m.added || 0) < start && drillLast(m) < start),
  };
}

/**
 * This week's focus: the evidence as it stood when the week began
 * (Monday 00:00), so the focus stays put for the week; the current
 * evidence when the week began without one. Once a focus has been shown
 * in a week it is kept for that week (profile.week): problem records
 * keep only their latest attempt, so reviewing last week's misses would
 * otherwise erase the evidence the focus came from.
 *
 * `content` = { problems, grades, cover? } (problem definitions and grades;
 * without them only games and drills count; `cover`: see evidence). Returns the evidence (see evidence())
 * plus `since` (the week start the focus is from, or null) and `keep`
 * ({ start, focus: [key] } to store with keepFocus, or null).
 */
export function focus(profile, now = 0, content = {}) {
  const p = normalizeProfile(profile);
  const opts = { problems: content.problems || [], grades: content.grades || {}, cover: content.cover ?? null };
  const start = weekStart(now);
  const current = evidence(p, { ...opts, now });
  const atStart = start < now ? evidence(before(p, start), { ...opts, now: start }) : null;
  if (p.week?.start === start && p.week.focus.length) {
    const claimed = (list, key) => list?.find((a) => a.key === key && a.claim);
    const find = (key) => claimed(p.week.areas, key) || claimed(atStart?.areas, key) || claimed(current.areas, key) || { key, score: 0, claim: true, games: null, problems: null, endgame: null };
    return { ...current, status: "focus", focus: p.week.focus.map(find), since: start, keep: null };
  }
  const chosen = atStart?.focus.length ? { ...atStart, since: start } : { ...current, since: null };
  const keep = chosen.focus.length ? { start, focus: chosen.focus.map((a) => a.key), areas: chosen.focus } : null;
  return { ...chosen, keep };
}
