/**
 * One opponent axis. The player chooses a rank; this module says which
 * implementation plays it and how strong that implementation measured.
 * Pure: no engine, no state. engine.js plays what it returns; the rating
 * (app/strength.js, model/player.js) reads the measured strengths here.
 *
 *   ladder(installed)               [{ rank, label, impl }], weakest first
 *   levelFor(rank, installed)       { rank, label, impl } for any rank
 *   measured(rank, size, installed) θ of what plays `rank`, on that board
 *
 * `installed` is `{ human, strong }`: whether the optional human-style
 * network and the stronger network can play (models.js). A rank is the
 * app's encoding (rating.js): kyu as 30…1, 0 = 1 dan, -1 = 2 dan … `label`
 * is the measured 19×19 rank of the implementation that plays, rounded
 * (what the UI shows as "≈ 12 kyu"); it differs from `rank` when the
 * closest implementation measured a rank away, or when an optional network
 * is missing and a standard level stands in.
 *
 * Every number comes from the calibration games (docs/strength.md and
 * docs/calibration/results/). An implementation is a setting that was
 * played there, under its calibration name: `L:<id>` a standard level
 * (STRENGTHS), `HL:<id>` its human-style version, `LS:2d` the stronger
 * network, `C:<name>` / `CH:<name>` bridge candidates between the levels,
 * with exactly the settings they were measured with. Those names are
 * internal; games and settings store ranks.
 */

/* ------------------------------------------------------ the θ ↔ GoR scale */

/**
 * GoR(θ) = 4100 − K·e^(−θ/20): the EGF curve, anchored as the ladder is
 * (KataGo's human SL rank_10k profile at θ = 11.65 is 10 kyu, GoR 1100).
 * θ is Bradley–Terry strength in nats on 19×19 with the standard `30k`
 * level at 0.
 */
export const ANCHOR_K = 3000 * Math.exp(11.65 / 20);
export const thetaToGoR = (t) => 4100 - ANCHOR_K * Math.exp(-t / 20);
export const gorToTheta = (g) => -20 * Math.log((4100 - Math.min(g, 3900)) / ANCHOR_K);
/** EGF rating of a rank (rating.js rankToRating, for every rank). */
export const rankToGoR = (rank) => 2100 - 100 * rank;
/** The 19×19 rank of θ, unrounded (10.0 = 10 kyu, 0 = 1 dan, -3 = 4 dan). */
const rankOfTheta = (t) => (2100 - thetaToGoR(t)) / 100;

/** A rank as shown: rounded; the kyu scale stops at 30 (rating.js ratingToRank). */
export function roundRank(r) {
  const k = Math.round(r);
  return k >= 1 ? Math.min(30, k) : k || 0;
}

/* ------------------------------------------------ the calibrated settings */

/**
 * The calibrated levels, by their calibration id (docs/strength.md; the
 * `L:<id>`, `HL:<id>` and `LS:<id>` players of scripts/calibrate-strength.mjs).
 * The ids name settings, not ranks: `5k` measured 7 kyu. Nothing outside
 * this module, engine.js and the calibration harness uses them.
 *
 *   visits   KataGo's search budget
 *   maxLoss  choose only among candidates within this many points of the best
 *   temp     how widely to sample those candidates (0 = always the best)
 *   slip     chance of taking a searched candidate outside the window
 *   blunder  chance of a beginner's move instead (engine.js beginnerMove):
 *            the lever for every level below ≈ 2 kyu
 *   local    offline fallback level (ai.js) when KataGo is unavailable
 *   human    the human-style version: KataGo's human SL model imitating
 *            `profile`; `style` "raw" plays the profile's own move
 *            distribution, "search" lets `visits` of search veto losing
 *            moves; `blunder` adds beginner's moves below the model's
 *            20-kyu floor
 *   strong   the version on the stronger network: `visits` of its search
 *   rank     the standard level's label from its 19×19 measurement (kept for
 *            the calibration harness)
 */
export const STRENGTHS = [
  { id: "30k", rank: 30, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 1.0, local: 1, human: { profile: "rank_20k", blunder: 0.9 } },
  { id: "25k", rank: 29, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.95, local: 1, human: { profile: "rank_20k", blunder: 0.7 } },
  { id: "20k", rank: 23, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.75, local: 2, human: { profile: "rank_20k", blunder: 0.35 } },
  { id: "15k", rank: 18, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.6, local: 3, human: { profile: "rank_20k", blunder: 0.12 } },
  { id: "10k", rank: 12, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.25, local: 4, human: { profile: "rank_12k" } },
  { id: "5k", rank: 7, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.09, local: 5, human: { profile: "rank_7k", style: "search", visits: 24, blunder: 0.12 } },
  { id: "1k", rank: 2, visits: 32, temp: 0.7, maxLoss: 6, slip: 0.02, blunder: 0, local: 5, human: { profile: "rank_4k", style: "search", visits: 32 } },
  { id: "2d", rank: -3, visits: 160, temp: 0, maxLoss: 0, slip: 0, blunder: 0, local: 5, human: { profile: "rank_4d", style: "search", visits: 200 }, strong: { visits: 64 } },
];

/** A calibrated level by its calibration id (the calibration harness and tests). */
export function calibrated(id) {
  return STRENGTHS.find((s) => s.id === id) || null;
}

/**
 * Measured strength of each calibrated level, θ on 19×19, 9×9 and 13×13
 * (each board its own Bradley–Terry fit, all with the weakest standard
 * level at 0; docs/strength.md). standard: the ladder's own fit (527 + 620
 * games, "Results"); human and strong: the human-style fit ("the
 * human-style ladder without a gap"). 13×13, every mode: one fit of 960
 * games ("the ladder on 13×13").
 */
export const MEASURED = {
  standard: {
    "30k": { 19: 0, 9: 0, 13: 0 },
    "25k": { 19: 1.8, 9: 0.4, 13: 0.84 },
    "20k": { 19: 4.59, 9: 2.06, 13: 3.22 },
    "15k": { 19: 6.88, 9: 2.85, 13: 4.99 },
    "10k": { 19: 10.21, 9: 6.13, 13: 8.33 },
    "5k": { 19: 13.85, 9: 7.47, 13: 10.1 },
    "1k": { 19: 17.9, 9: 12.08, 13: 14.91 },
    "2d": { 19: 23.35, 9: 14.93, 13: 17.45 },
  },
  // 708 games on 19×19 and 824 on 9×9 (pooled with the earlier games of
  // the settings that did not change) against the standard levels held at
  // their own fit. The top two rest on a 400-visit bridge above the ladder.
  human: {
    "30k": { 19: 0.42, 9: 0.41, 13: 0.19 },
    "25k": { 19: 1.39, 9: 1.15, 13: 1.04 },
    "20k": { 19: 3.9, 9: 2.1, 13: 3.66 },
    "15k": { 19: 6.77, 9: 4.64, 13: 5.45 },
    "10k": { 19: 10.19, 9: 6.79, 13: 8.81 },
    "5k": { 19: 13.68, 9: 8.03, 13: 10.13 },
    "1k": { 19: 18.42, 9: 12.89, 13: 14.47 },
    "2d": { 19: 26.99, 9: 14.99, 13: 17.82 },
  },
  strong: {
    "2d": { 19: 28.11, 9: 16.82, 13: 22.78 },
  },
};

/* ------------------------------------------------------ the implementations */

const level = (id) => {
  const { id: _, human, strong, rank, ...rest } = calibrated(id);
  return rest;
};

/**
 * Everything the ladder can play. `theta` holds what was measured on each
 * board (a board left out was not measured: `implTheta` derives it from
 * the same kind's measured levels); `gor` is the published 95% bootstrap
 * interval of its 19×19 strength in EGF GoR (docs/strength.md: the
 * ladder's own table for `L:` and `C:`, which includes the anchor's
 * sampling error; the human-style fit with the ladder held fixed for
 * `HL:`, `CH:` and `LS:`, which does not). `level` is what engine.js plays: a standard level's fields,
 * plus `human` or `strong` for those kinds.
 */
/** @type {{ id: string, kind: string, level: any, theta: Record<number, number>, gor: number[] }[]} */
export const IMPLS = [
  // standard levels and the bridges between them (`C:bNN` is the
  // 8-visit base level with blunder 0.NN; C:b40 was also measured on 13×13)
  { id: "L:25k", kind: "standard", level: level("25k"), theta: MEASURED.standard["25k"], gor: [-1484, -520] },
  { id: "L:20k", kind: "standard", level: level("20k"), theta: MEASURED.standard["20k"], gor: [-573, 35] },
  { id: "L:15k", kind: "standard", level: level("15k"), theta: MEASURED.standard["15k"], gor: [-2, 454] },
  { id: "C:b40", kind: "standard", level: { ...level("15k"), blunder: 0.4, local: 3 }, theta: { 19: 8.56, 13: 6.36 }, gor: [391, 747] },
  { id: "L:10k", kind: "standard", level: level("10k"), theta: MEASURED.standard["10k"], gor: [729, 999] },
  { id: "C:b18", kind: "standard", level: { ...level("10k"), blunder: 0.18, local: 4 }, theta: { 19: 11.97 }, gor: [1009, 1280] },
  { id: "L:5k", kind: "standard", level: level("5k"), theta: MEASURED.standard["5k"], gor: [1285, 1587] },
  { id: "C:b0", kind: "standard", level: { ...level("5k"), blunder: 0, local: 5 }, theta: { 19: 14.98 }, gor: [1456, 1733] },
  { id: "L:1k", kind: "standard", level: level("1k"), theta: MEASURED.standard["1k"], gor: [1769, 2112] },
  { id: "L:2d", kind: "standard", level: level("2d"), theta: MEASURED.standard["2d"], gor: [2310, 2601] },
  // human-style levels and two earlier human-style settings measured
  // again as bridges (`CH:r20k` and `CH:s7k24`, once the human `15k` and `5k`)
  { id: "HL:25k", kind: "human", level: { human: calibrated("25k").human }, theta: MEASURED.human["25k"], gor: [-1115, -712] },
  { id: "HL:20k", kind: "human", level: { human: calibrated("20k").human }, theta: MEASURED.human["20k"], gor: [-498, -173] },
  { id: "HL:15k", kind: "human", level: { human: calibrated("15k").human }, theta: MEASURED.human["15k"], gor: [91, 425] },
  { id: "CH:r20k", kind: "human", level: { human: { profile: "rank_20k" } }, theta: { 19: 8.37, 9: 5.3 }, gor: [343, 783] },
  { id: "HL:10k", kind: "human", level: { human: calibrated("10k").human }, theta: MEASURED.human["10k"], gor: [748, 1009] },
  { id: "HL:5k", kind: "human", level: { human: calibrated("5k").human }, theta: MEASURED.human["5k"], gor: [1294, 1484] },
  { id: "CH:s7k24", kind: "human", level: { human: { profile: "rank_7k", style: "search", visits: 24 } }, theta: { 19: 16.81, 9: 11.97 }, gor: [1680, 1881] },
  { id: "HL:1k", kind: "human", level: { human: calibrated("1k").human }, theta: MEASURED.human["1k"], gor: [1867, 2066] },
  { id: "HL:2d", kind: "human", level: { human: calibrated("2d").human }, theta: MEASURED.human["2d"], gor: [2634, 2816] },
  // the stronger network: best move after its search, as the standard 2d
  { id: "LS:2d", kind: "strong", level: { ...level("2d"), strong: calibrated("2d").strong }, theta: MEASURED.strong["2d"], gor: [2736, 2841] },
];

const BY_ID = new Map(IMPLS.map((i) => [i.id, i]));

/** An implementation by id, or null. */
export function impl(id) {
  return BY_ID.get(id) || null;
}

/**
 * The ladder's ranks: six ranks apart in the double-digit kyu, where a
 * beginner moves fast and the measurements are coarse, then three:
 * 30, 24, 18, 15, 12, 10 kyu, 7, 4, 1 kyu, 4 dan, 7 dan.
 */
export const RANKS = [30, 24, 18, 15, 12, 10, 7, 4, 1, -3, -6];

/** Board sizes with a measurement; anything else counts as 19×19. */
const boardOf = (size) => (size === 9 || size === 13 ? size : 19);

/**
 * θ of `id` on a board of `size`, in that board's own frame. A board the
 * implementation was not measured on is derived from its 19×19 θ through
 * the fully measured levels of the same kind (piecewise linear in their
 * (θ19, θ board) pairs).
 */
export function implTheta(id, size = 19) {
  const it = impl(id);
  if (!it) return null;
  const b = boardOf(size);
  if (Number.isFinite(it.theta[b])) return it.theta[b];
  const pairs = Object.values(MEASURED[it.kind === "human" ? "human" : "standard"]).sort((p, q) => p[19] - q[19]);
  const x = it.theta[19];
  let i = 1;
  while (i < pairs.length - 1 && x > pairs[i][19]) i++;
  const a = pairs[i - 1];
  const c = pairs[i];
  return a[b] + ((x - a[19]) / (c[19] - a[19])) * (c[b] - a[b]);
}

/** Whether `id`'s 13×13 or 9×9 θ is derived rather than measured. */
export function derived(id, size) {
  const it = impl(id);
  return !!it && !Number.isFinite(it.theta[boardOf(size)]);
}

/** The measured 19×19 rank of an implementation, unrounded. */
export function implRank(id) {
  const it = impl(id);
  return it ? rankOfTheta(it.theta[19]) : null;
}

/** The rank shown for an implementation ("≈ 12 kyu"): its measured 19×19 rank, rounded. */
export function implLabel(id) {
  const r = implRank(id);
  return r == null ? null : roundRank(r);
}

/** Which kinds can play: the standard network always, the others when installed. */
function playable(it, installed = {}) {
  return it.kind === "standard" || (it.kind === "human" && !!installed.human) || (it.kind === "strong" && !!installed.strong);
}

/**
 * How much farther (in ranks) a human-style implementation may be than the
 * closest standard one and still be preferred: it plays more like a person.
 */
export const HUMAN_SLACK = 0.5;

/**
 * The implementation for `rank`: the one whose measured 19×19 rank is
 * closest, among what can play; a human-style one wins when it measured
 * within one rank of `rank` and at most HUMAN_SLACK farther than the
 * closest other. Returns { rank, label, impl }.
 */
export function levelFor(rank, installed = {}) {
  const want = Number.isFinite(Number(rank)) ? Number(rank) : RANKS[1];
  const dist = (it) => Math.abs(rankOfTheta(it.theta[19]) - want);
  let best = null;
  let human = null;
  for (const it of IMPLS) {
    if (!playable(it, installed)) continue;
    if (!best || dist(it) < dist(best)) best = it;
    if (it.kind === "human" && (!human || dist(it) < dist(human))) human = it;
  }
  let pick = best;
  if (human && human !== best && dist(human) <= 1 && dist(human) - dist(best) <= HUMAN_SLACK) pick = human;
  return { rank: want, label: implLabel(pick.id), impl: pick.id };
}

/**
 * The ranks the player can choose, weakest first: RANKS, each with what
 * plays it. Two ranks that would be played by the same implementation
 * (an optional network missing at the top) become one, at the rank
 * closest to what it measured.
 */
export function ladder(installed = {}) {
  const out = [];
  for (const r of RANKS) {
    const e = levelFor(r, installed);
    const same = out.findIndex((o) => o.impl === e.impl);
    if (same < 0) out.push(e);
    else if (Math.abs(e.rank - e.label) < Math.abs(out[same].rank - out[same].label)) out[same] = e;
  }
  return out;
}

/** The ladder entry nearest a rank (by the rank it plays at). */
export function nearest(rank, installed = {}) {
  const l = ladder(installed);
  const want = Number(rank);
  if (!Number.isFinite(want)) return l[1] || l[0];
  const exact = l.find((e) => e.rank === want);
  if (exact) return exact;
  return l.reduce((a, b) => (Math.abs(b.label - want) < Math.abs(a.label - want) ? b : a));
}

/** θ of what plays `rank` on a board of `size` (the rating's opponent strength). */
export function measured(rank, size = 19, installed = {}) {
  return implTheta(levelFor(rank, installed).impl, size);
}
