#!/usr/bin/env node
/**
 * Strength-ladder calibration: plays the computer opponent's levels against
 * each other (and against KataGo's human-imitation model as a rank anchor)
 * with a real KataGo, then fits Bradley–Terry ratings with bootstrap
 * confidence intervals. Method and results: docs/strength.md.
 *
 * It measures what players get: every ladder move comes from the same
 * KataGo report parser (katago.js `toAnalysis`) and the same picker
 * (engine.js `moveFromAnalysis` → `pickCandidate`) with the same STRENGTHS
 * entries the app uses, on a position kept in KataGo incrementally (`play`)
 * like the native host does, so tree reuse matches the app.
 *
 *   play   node scripts/calibrate-strength.mjs play --katago PATH --out results.jsonl \
 *            --size 9 --games 40 --pairs adjacent,gap2 [--workers 4]
 *          node scripts/calibrate-strength.mjs play ... --size 19 --pairs "L:10k-L:5k,L:5k-H:rank_5k" \
 *            --human-model b18c384nbt-humanv0.bin.gz
 *   fit    node scripts/calibrate-strength.mjs fit results.jsonl [more.jsonl …] [--size 19] [--anchor rank_10k] [--boot 1000]
 *            [--fixed]   (v6: hold the L: ladder at its v4 measurement; needs --size 9 or 19)
 *            [--alias "C:b100=L:30k,..."] [--with-hh] [--only A,B,...] [--markdown]
 *
 * Players:
 *   L:<id>        a STRENGTHS level, exactly as shipped
 *   C:<name>      a candidate level from --candidates FILE (JSON: name → strength fields)
 *   H:<profile>   KataGo's human SL model (raw policy, 1 visit) imitating a
 *                 human rank profile such as rank_10k — the absolute anchor
 *   HL:<id>       v5: a level's human-style opponent, exactly as shipped
 *                 (STRENGTHS[].human, engine/model/human.cfg, the style
 *                 parameters of src/engine.zig, engine.js
 *                 humanMoveFromAnalysis); needs --human-model
 *   LS:<id>       v5: a level on the optional stronger network
 *                 (STRENGTHS[].strong); needs --strong-model
 *   CH:<name>     v7: a candidate human-style level from --candidates FILE
 *                 (an entry with a `human` object: profile, style, visits,
 *                 blunder), played exactly like HL:; needs --human-model
 *
 * v7, for parallel runners (.github/workflows/calibrate.yml):
 *   --shard I/N   play only every N-th game of the schedule, starting at I
 *                 (0-based), so N machines split one schedule between them
 *   --deadline M  start no new game after M minutes (finished games are kept)
 *   merge OUT IN…  append the games of IN files to OUT, once per game key
 *   matrix PLAN    the runner matrix of a plan file (docs/calibration/plan.json)
 *
 * Pair specs: "adjacent" (neighbouring levels), "gap2"/"gap3" (two/three
 * levels apart), "anchors" (each H: profile in --anchors against the two
 * ladder levels nearest its nominal rank), or explicit "A-B" lists.
 *
 * Games already in --out are skipped, so a run can be stopped and resumed.
 * Binaries and models are never part of the repository: pass their paths.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BLACK, WHITE, Game, coordLabel } from "../src/web/js/rules.js";
import { STRENGTHS, humanMoveFromAnalysis, humanRequest, moveFromAnalysis } from "../src/web/js/engine.js";
import { parseVertex, toAnalysis } from "../src/web/js/katago.js";
import { MEASURED, thetaToGoR } from "../src/web/js/app/strength.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------ helpers */

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[k] = true;
      else out[k] = next, i++;
    } else out._.push(a);
  }
  return out;
}

/** Small deterministic PRNG, so a game's choices can be replayed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/* ------------------------------------------------------- rank scales */

/** EGF rating of a rank in the app's encoding (rating.js): 30…1 kyu, 0 = 1d, -1 = 2d. */
export const rankToGoR = (rank) => 2100 - 100 * rank;

/** Rank label (e.g. "7k", "1d") for an EGF rating, rounded to the nearest rank. */
export function goRLabel(g) {
  const k = Math.round((2100 - g) / 100);
  return k >= 1 ? `${k}k` : `${1 - k}d`;
}

/**
 * EGF winning expectancy (classic GoR system): P(weaker wins) =
 * 1/(e^(D/a)+1) − ε/2 with a = 200 − (GoR − 100)·130/2600 ≈ 205 − GoR/20
 * and ε = 0.016. Between two players the logit gap is D/a nats, so one
 * natural-log unit of Bradley–Terry strength is worth a(G) rating points.
 */
export const egfA = (g) => 205 - g / 20;

/** Logit gap (nats) EGF predicts between ratings g1 < g2: ∫ dG / a(G). */
export function egfNats(g1, g2) {
  return 20 * Math.log((4100 - g1) / (4100 - g2));
}

/** Win probability of the stronger player by EGF (ignoring ε). */
export function egfExpected(gStrong, gWeak) {
  const mid = (gStrong + gWeak) / 2;
  return 1 / (1 + Math.exp(-(gStrong - gWeak) / egfA(mid)));
}

/* ------------------------------------------------------------ players */

function loadCandidates(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolvePlayer(spec, candidates) {
  const [kind, name] = spec.split(":");
  if (kind === "L") {
    const s = STRENGTHS.find((x) => x.id === name);
    if (!s) throw new Error(`unknown level ${spec}`);
    return { spec, kind: "ladder", strength: s };
  }
  if (kind === "C") {
    const s = candidates[name];
    if (!s) throw new Error(`unknown candidate ${spec}`);
    return { spec, kind: "ladder", strength: { id: name, ...s } };
  }
  if (kind === "H") return { spec, kind: "human", profile: name };
  if (kind === "CH") {
    const s = candidates[name];
    if (!s?.human) throw new Error(`unknown human-style candidate ${spec}`);
    return { spec, kind: "humanLadder", strength: { id: name, human: s.human } };
  }
  if (kind === "HL" || kind === "LS") {
    const s = STRENGTHS.find((x) => x.id === name);
    if (!s || (kind === "HL" && !s.human) || (kind === "LS" && !s.strong)) throw new Error(`unknown level ${spec}`);
    return { spec, kind: kind === "HL" ? "humanLadder" : "strongLadder", strength: s };
  }
  throw new Error(`bad player ${spec}`);
}

/**
 * The human slot's move-choice parameters, read from src/engine.zig
 * (`style_params`) so the harness sends exactly what the app sends.
 */
export function humanStyleParams(source = fs.readFileSync(path.join(ROOT, "src/engine.zig"), "utf8")) {
  const out = { raw: [], search: [] };
  for (const m of source.matchAll(/\.\{ \.name = "(\w+)", \.raw = "([^"]+)", \.search = "([^"]+)" \}/g)) {
    out.raw.push([m[1], m[2]]);
    out.search.push([m[1], m[3]]);
  }
  if (!out.raw.length) throw new Error("style_params not found in src/engine.zig");
  return out;
}

/** Nominal EGF rating of a human profile (rank_5k → 1600, rank_1d → 2100). */
export function profileGoR(profile) {
  const m = /(\d+)([kd])$/.exec(profile);
  if (!m) return null;
  return m[2] === "k" ? 2100 - 100 * Number(m[1]) : 2000 + 100 * Number(m[1]);
}

/* ------------------------------------------------------------- KataGo */

class GTP {
  constructor(argv, label) {
    this.label = label;
    this.proc = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "ignore"] });
    this.buf = "";
    this.waiters = [];
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (d) => {
      this.buf += d;
      // Drop anything that is not a GTP reply (an AppImage launcher may
      // print a warning before the engine starts).
      while (this.buf && !/^[=?]/.test(this.buf) && this.buf.includes("\n")) this.buf = this.buf.slice(this.buf.indexOf("\n") + 1);
      let at;
      while (this.waiters.length && (at = this.buf.indexOf("\n\n")) >= 0) {
        const reply = this.buf.slice(0, at);
        this.buf = this.buf.slice(at + 2);
        this.waiters.shift()(reply);
      }
    });
    this.proc.on("exit", (code) => {
      for (const w of this.waiters.splice(0)) w(`? exited ${code}`);
    });
  }
  send(cmd) {
    return new Promise((resolve, reject) => {
      this.waiters.push((reply) => {
        const r = reply.replace(/\r/g, "");
        if (r.startsWith("=")) resolve(r.slice(1).trim());
        else reject(new Error(`${this.label}: ${cmd} → ${r}`));
      });
      this.proc.stdin.write(cmd + "\n");
    });
  }
  close() {
    try {
      this.proc.stdin.end("quit\n");
    } catch (_) {}
  }
}

function katagoArgv(opt, human, variant = "") {
  const logs = path.join(os.tmpdir(), "goban-calibrate-logs");
  fs.mkdirSync(logs, { recursive: true });
  const common = `logDir=${logs},homeDataDir=${logs},logAllGTPCommunication=false,logSearchInfo=false,logToStderr=false,ponderingEnabled=false,allowResignation=false,numSearchThreads=${opt.threads}`;
  // v5: the app's own human process (engine.zig Slot.human) and stronger network.
  if (variant === "humanLadder") {
    return [opt.katago, "gtp", "-model", opt.model, "-human-model", opt.humanModel, "-config", path.join(ROOT, "engine/model/human.cfg"), "-override-config", common];
  }
  if (variant === "strongLadder") return [opt.katago, "gtp", "-model", opt.strongModel, "-config", opt.config, "-override-config", common];
  if (!human) return [opt.katago, "gtp", "-model", opt.model, "-config", opt.config, "-override-config", common];
  // Human SL anchor: KataGo's own gtp_human5k_example.cfg recipe (raw human
  // policy picks every move; a short b6c96 search only decides passes).
  const humanCfg = [
    common,
    `humanSLProfile=${human}`,
    "humanSLChosenMoveProp=1.0",
    "humanSLChosenMoveIgnorePass=true",
    "humanSLChosenMovePiklLambda=100000000",
    "chosenMoveTemperatureEarly=0.85",
    "chosenMoveTemperature=0.70",
    "chosenMoveTemperatureHalflife=80",
    "chosenMoveTemperatureOnlyBelowProb=0.01",
    "chosenMoveSubtract=0",
    "chosenMovePrune=0",
    "maxVisits=8",
    "maxTime=60",
    "rootNumSymmetriesToSample=1",
    "useLcbForSelection=false",
    "useNoisePruning=false",
    "staticScoreUtilityFactor=0.30",
    "dynamicScoreUtilityFactor=0.00",
    "useUncertainty=false",
    "subtreeValueBiasFactor=0.0",
  ].join(",");
  return [opt.katago, "gtp", "-model", opt.model, "-human-model", opt.humanModel, "-config", opt.config, "-override-config", humanCfg];
}

/* --------------------------------------------------------------- game */

const MOVE_CAP = { 9: 150, 13: 260, 19: 420 };

async function setup(proc, size, komi) {
  await proc.send(`boardsize ${size}`);
  await proc.send("clear_board");
  await proc.send(`komi ${komi}`);
  await proc.send("kata-set-rules japanese");
}

/** One ladder move: the app's search, the app's picker. */
async function ladderMove(proc, game, strength, rnd) {
  await proc.send(`kata-set-param maxVisits ${strength.visits}`);
  // Visits, not wall time, bound the search (the app's maxTime only bites
  // on a machine far slower than the laptops it targets).
  await proc.send("kata-set-param maxTime 60");
  const color = game.turn === BLACK ? "B" : "W";
  const reply = await proc.send(`kata-search_analyze ${color}`);
  const lines = reply.split("\n");
  const info = lines.filter((l) => l.startsWith("info")).pop() || "";
  const playText = (lines.find((l) => l.startsWith("play")) || "").slice(5);
  const analysis = toAnalysis(info, playText, game.size);
  if (!analysis) return { move: { pass: true }, analysis: null };
  const move = moveFromAnalysis(game, analysis, strength, rnd);
  return { move: move || { pass: true }, analysis, fallback: !move };
}

/** v5: one human-style move, as the app plays it (engine.js decide, mode "human"). */
async function humanLadderMove(proc, game, strength, rnd) {
  const req = humanRequest(strength.human);
  const styles = (humanLadderMove.styles ||= humanStyleParams());
  if (proc.profile !== req.profile) {
    await proc.send(`kata-set-param humanSLProfile ${req.profile}`);
    proc.profile = req.profile;
  }
  if (proc.style !== req.humanStyle) {
    for (const [name, value] of styles[req.humanStyle]) await proc.send(`kata-set-param ${name} ${value}`);
    proc.style = req.humanStyle;
  }
  await proc.send(`kata-set-param maxVisits ${req.visits}`);
  await proc.send("kata-set-param maxTime 60");
  const color = game.turn === BLACK ? "B" : "W";
  const reply = await proc.send(`kata-search_analyze ${color}`);
  const lines = reply.split("\n");
  const info = lines.filter((l) => l.startsWith("info")).pop() || "";
  const playText = (lines.find((l) => l.startsWith("play")) || "").slice(5);
  const analysis = toAnalysis(info, playText, game.size);
  if (!analysis) return { move: { pass: true }, analysis: null };
  const move = humanMoveFromAnalysis(game, analysis, strength.human, rnd);
  return { move: move || { pass: true }, analysis, fallback: !move };
}

async function humanMove(proc, game) {
  const color = game.turn === BLACK ? "B" : "W";
  const text = await proc.send(`genmove ${color}`);
  const v = parseVertex(text, game.size) || { pass: true };
  return { move: v, analysis: null, played: true };
}

function vertex(move, size) {
  return move.pass ? "pass" : coordLabel(move.x, move.y, size);
}

/**
 * Play one game. Returns { winner, lead, plies, reason }. Ends on two
 * passes, adjudication (both sides' searches agree it is lost far beyond
 * what the loser's level could still turn around), or the move cap; the
 * result is KataGo's score lead at the end (400 visits, Japanese rules).
 */
async function playGame(task, procs, opt) {
  const { size, komi } = task;
  const game = new Game({ size, komi });
  const rnd = mulberry32(hash(task.key));
  const players = { [BLACK]: task.black, [WHITE]: task.white };
  const procOf = { [BLACK]: procs.black, [WHITE]: procs.white };
  await setup(procs.black, size, komi);
  if (procs.white !== procs.black) await setup(procs.white, size, komi);
  const evals = [];
  const slack = Math.max(...[task.black, task.white].map((p) => (p.strength ? p.strength.maxLoss : 20)));
  const threshold = 20 + 2 * slack;
  let reason = "passes";
  let fallbacks = 0;
  while (game.current.phase === "playing") {
    if (game.moveNumber >= (MOVE_CAP[size] || 4 * size * size)) {
      reason = "cap";
      break;
    }
    const color = game.turn;
    const p = players[color];
    const proc = procOf[color];
    const r =
      p.kind === "ladder"
        ? await ladderMove(proc, game, p.strength, rnd)
        : p.kind === "strongLadder"
          ? await ladderMove(proc, game, { ...p.strength, visits: p.strength.strong.visits }, rnd)
          : p.kind === "humanLadder"
            ? await humanLadderMove(proc, game, p.strength, rnd)
            : await humanMove(proc, game);
    if (r.fallback) fallbacks++;
    let move = r.move;
    if (!move.pass && !game.canPlay(move.x, move.y).ok) move = { pass: true }; // human SL under superko
    const text = `${color === BLACK ? "B" : "W"} ${vertex(move, size)}`;
    if (move.pass) game.pass();
    else game.play(move.x, move.y);
    if (!r.played) await proc.send(`play ${text}`);
    else if (vertex(move, size) !== vertex(r.move, size)) {
      throw new Error("human anchor move rejected by the app's rules");
    }
    const otherProc = procOf[-color];
    if (otherProc !== proc) await otherProc.send(`play ${text}`);

    if (r.analysis && Number.isFinite(r.analysis.winrate) && Number.isFinite(r.analysis.scoreLead)) {
      evals.push({ w: r.analysis.winrate, lead: r.analysis.scoreLead });
      const last = evals.slice(-6);
      if (last.length === 6 && game.moveNumber > (size * size) / 4) {
        if (last.every((e) => e.w >= 0.985 && e.lead >= threshold) || last.every((e) => e.w <= 0.015 && e.lead <= -threshold)) {
          reason = "adjudicated";
          break;
        }
      }
    }
  }
  // Score with the stronger search of a ladder process.
  const scorer = task.black.kind === "ladder" || task.black.kind === "strongLadder" ? procs.black : procs.white;
  await scorer.send(`kata-set-param maxVisits ${opt.scoreVisits}`);
  const reply = await scorer.send(`kata-search_analyze ${game.turn === BLACK ? "B" : "W"}`);
  const info = reply.split("\n").filter((l) => l.startsWith("info")).pop() || "";
  const a = toAnalysis(info, "", size);
  const lead = a?.scoreLead ?? 0;
  return { winner: lead > 0 ? "B" : lead < 0 ? "W" : "D", lead: Math.round(lead * 10) / 10, plies: game.moveNumber, reason, fallbacks };
}

/* ------------------------------------------------------------ schedule */

function expandPairs(text, opt) {
  const ids = STRENGTHS.map((s) => `L:${s.id}`);
  const out = [];
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part === "adjacent") for (let i = 0; i + 1 < ids.length; i++) out.push([ids[i], ids[i + 1]]);
    else if (/^gap\d$/.test(part)) {
      const g = Number(part.slice(3));
      for (let i = 0; i + g < ids.length; i++) out.push([ids[i], ids[i + g]]);
    } else if (part === "anchors") {
      for (const profile of opt.anchors) {
        const g = profileGoR(profile);
        const near = [...STRENGTHS].sort((a, b) => Math.abs(rankToGoR(a.rank) - g) - Math.abs(rankToGoR(b.rank) - g)).slice(0, 2);
        for (const s of near) out.push([`H:${profile}`, `L:${s.id}`]);
      }
    } else {
      const [a, b] = part.split(/-(?=(?:L|C|H|HL|LS|CH):)/);
      out.push([a, b]);
    }
  }
  return out;
}

function doneKeys(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l).key),
  );
}

/** "I/N" → { index, count } (v7 --shard); null when absent. */
export function parseShard(text) {
  if (text == null || text === true || text === "") return null;
  const m = /^(\d+)\/(\d+)$/.exec(String(text));
  if (!m || Number(m[2]) < 1 || Number(m[1]) >= Number(m[2])) throw new Error(`bad --shard ${text} (want I/N, 0 <= I < N)`);
  return { index: Number(m[1]), count: Number(m[2]) };
}

/**
 * The games of a schedule, round-robin over pairs (so a partial run is
 * still balanced), colours alternating by game number. v7: with `shard`,
 * only every count-th game of the full schedule, so parallel machines
 * play disjoint slices whose union is the whole schedule; games whose key
 * is in `done` are left out after slicing (a rerun keeps the same slices).
 */
export function planTasks(opt, candidates = {}, done = new Set()) {
  const pairs = expandPairs(opt.pairs, opt);
  const tasks = [];
  let n = 0;
  for (let g = 0; g < opt.games; g++) {
    for (const [a, b] of pairs) {
      const i = n++;
      if (opt.shard && i % opt.shard.count !== opt.shard.index) continue;
      const key = `${opt.size}|${opt.komi}|${a}|${b}|${g}${opt.tag ? "|" + opt.tag : ""}`;
      if (done.has(key)) continue;
      const pa = resolvePlayer(a, candidates);
      const pb = resolvePlayer(b, candidates);
      const [black, white] = g % 2 === 0 ? [pa, pb] : [pb, pa];
      tasks.push({ key, size: opt.size, komi: opt.komi, a, b, black, white });
    }
  }
  return tasks;
}

async function runPlay(opt) {
  const candidates = loadCandidates(opt.candidates);
  const done = doneKeys(opt.out);
  const tasks = planTasks(opt, candidates, done);
  console.error(`${tasks.length} games to play (${done.size} already in ${opt.out}), ${opt.workers} workers${opt.shard ? `, shard ${opt.shard.index}/${opt.shard.count}` : ""}`);
  let next = 0;
  let finished = 0;
  const started = Date.now();
  const deadline = opt.deadline ? started + opt.deadline * 60000 : Infinity;
  async function worker(w) {
    const cache = new Map();
    const proc = (key, human, variant) => {
      if (!cache.has(key)) cache.set(key, new GTP(katagoArgv(opt, human, variant), `w${w}:${key}`));
      return cache.get(key);
    };
    while (next < tasks.length && Date.now() < deadline) {
      const task = tasks[next++];
      const pick = (player, side) => {
        if (player.kind === "human") return proc(`H:${player.profile}`, player.profile);
        if (player.kind === "humanLadder" || player.kind === "strongLadder") return proc(`${player.kind}${side}`, null, player.kind);
        return proc(`ladder${side}`);
      };
      const black = pick(task.black, "B");
      const white = pick(task.white, "W");
      const t0 = Date.now();
      try {
        const r = await playGame(task, { black, white }, opt);
        const row = { key: task.key, size: task.size, komi: task.komi, black: task.black.spec, white: task.white.spec, ...r, ms: Date.now() - t0 };
        fs.appendFileSync(opt.out, JSON.stringify(row) + "\n");
        finished++;
        const rate = (Date.now() - started) / finished;
        console.error(
          `[${finished}/${tasks.length}] ${row.black} vs ${row.white}: ${row.winner}+${Math.abs(row.lead)} (${row.plies} plies, ${row.reason}, ${(row.ms / 1000).toFixed(0)}s) eta ${((rate * (tasks.length - finished)) / 60000).toFixed(0)}m`,
        );
      } catch (error) {
        console.error(`game ${task.key} failed: ${error.message}`);
        for (const p of cache.values()) p.close();
        cache.clear();
      }
    }
    for (const p of cache.values()) p.close();
  }
  await Promise.all(Array.from({ length: opt.workers }, (_, i) => worker(i)));
}

/* ----------------------------------------------------------------- fit */

/** Solve A x = b (small dense system, Gaussian elimination with pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Bradley–Terry with a first-move term: logit P(Black wins) = θ_B − θ_W + η.
 * Newton–Raphson on the log-likelihood with a weak Gaussian prior
 * (σ = `sigma` nats around the mean) so a clean sweep stays finite.
 * Returns θ in natural-log units, centred so that θ[ref] = 0.
 *
 * v6: `fixed` (player → θ) holds some players at known strengths (the v4
 * ladder) and fits only the others, in that frame; the prior is then
 * centred on the fixed players' mean and no recentring is done.
 */
export function fitBT(games, players, { ref = players[0], sigma = 6, fixed = null } = {}) {
  const idx = new Map(players.map((p, i) => [p, i]));
  const n = players.length + 1; // + η
  let x = new Array(n).fill(0);
  const held = fixed ? players.map((p, i) => [i, fixed[p]]).filter(([, v]) => Number.isFinite(v)) : [];
  const m0 = held.length ? held.reduce((s, [, v]) => s + v, 0) / held.length : 0;
  if (held.length) for (let i = 0; i < n - 1; i++) x[i] = m0;
  for (const [i, v] of held) x[i] = v;
  for (let it = 0; it < 200; it++) {
    const g = new Array(n).fill(0);
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n - 1; i++) {
      g[i] -= (x[i] - m0) / (sigma * sigma);
      H[i][i] -= 1 / (sigma * sigma);
    }
    g[n - 1] -= x[n - 1] / 4;
    H[n - 1][n - 1] -= 1 / 4;
    for (const gm of games) {
      const b = idx.get(gm.black);
      const w = idx.get(gm.white);
      const s = gm.winner === "B" ? 1 : gm.winner === "W" ? 0 : 0.5;
      const p = 1 / (1 + Math.exp(-(x[b] - x[w] + x[n - 1])));
      const d = s - p;
      const v = p * (1 - p);
      const coef = [
        [b, 1],
        [w, -1],
        [n - 1, 1],
      ];
      for (const [i, ci] of coef) {
        g[i] += ci * d;
        for (const [j, cj] of coef) H[i][j] -= ci * cj * v;
      }
    }
    for (const [i] of held) {
      for (let j = 0; j < n; j++) H[i][j] = H[j][i] = 0;
      H[i][i] = -1;
      g[i] = 0;
    }
    const step = solve(
      H.map((r) => r.map((v) => -v)),
      g,
    );
    // v6: damped (a held ladder can start the others far from the optimum).
    x = x.map((v, i) => v + (held.length ? Math.max(-2, Math.min(2, step[i])) : step[i]));
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  const r = held.length ? 0 : x[idx.get(ref)];
  const theta = Object.fromEntries(players.map((p, i) => [p, x[i] - r]));
  return { theta, eta: x[n - 1] };
}

/**
 * Map Bradley–Terry strength (nats) to EGF ratings. Relative spacing comes
 * from the games; the shape of the scale from EGF (one nat is worth a(GoR)
 * rating points, so G(θ) = 4100 − K·e^(−θ/20)); the single offset K from
 * the anchors (least squares on ln K over the chosen anchors). With one
 * anchor this is exactly "that anchor sits at its nominal rank".
 */
export function anchorMap(theta, anchors) {
  const pts = anchors.filter((a) => Number.isFinite(theta[a.player]));
  if (!pts.length) return null;
  const lnK = pts.reduce((sum, a) => sum + Math.log(4100 - a.gor) + theta[a.player] / 20, 0) / pts.length;
  const K = Math.exp(lnK);
  const map = (t) => 4100 - K * Math.exp(-t / 20);
  return { map, K, points: pts.map((a) => ({ player: a.player, nominal: a.gor, mapped: map(theta[a.player]) })) };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function playerOrder(players) {
  const ladder = STRENGTHS.map((s) => `L:${s.id}`);
  return [...players].sort((a, b) => {
    const ia = ladder.indexOf(a);
    const ib = ladder.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return (profileGoR(a.slice(2)) ?? 0) - (profileGoR(b.slice(2)) ?? 0) || a.localeCompare(b);
  });
}

export function analyse(games, { boot = 1000, seed = 1, anchors: use = null, fixed = null, gorMap = null } = {}) {
  const players = playerOrder([...new Set(games.flatMap((g) => [g.black, g.white]))]);
  const ref = players[0];
  const anchors = players
    .filter((p) => p.startsWith("H:") && (!use || use.includes(p.slice(2))))
    .map((p) => ({ player: p, gor: profileGoR(p.slice(2)) }));
  const fit = fitBT(games, players, { ref, fixed });
  // Report weakest to strongest (pairs read "weaker vs stronger").
  players.sort((a, b) => fit.theta[a] - fit.theta[b]);
  // v6: with the ladder held fixed, its known θ → GoR map replaces the anchors.
  const mapOf = (theta) => (gorMap ? { map: gorMap, points: [] } : anchorMap(theta, anchors));
  const am = mapOf(fit.theta);
  const rnd = mulberry32(seed);
  const samples = Object.fromEntries(players.map((p) => [p, []]));
  const gorSamples = Object.fromEntries(players.map((p) => [p, []]));
  for (let b = 0; b < boot; b++) {
    const res = games.map(() => games[Math.floor(rnd() * games.length)]);
    const f = fitBT(res, players, { ref, fixed });
    for (const p of players) samples[p].push(f.theta[p]);
    const m = mapOf(f.theta);
    if (m) for (const p of players) gorSamples[p].push(m.map(f.theta[p]));
  }
  const rows = players.map((p) => {
    const ts = samples[p].sort((a, b) => a - b);
    const gs = gorSamples[p].sort((a, b) => a - b);
    const gor = am ? am.map(fit.theta[p]) : null;
    return {
      player: p,
      theta: fit.theta[p],
      lo: quantile(ts, 0.025),
      hi: quantile(ts, 0.975),
      elo: (fit.theta[p] * 400) / Math.LN10,
      gor,
      gorLo: gs.length ? quantile(gs, 0.025) : null,
      gorHi: gs.length ? quantile(gs, 0.975) : null,
    };
  });
  // Pairwise results.
  const pairs = new Map();
  for (const g of games) {
    const [a, b] = players.indexOf(g.black) < players.indexOf(g.white) ? [g.black, g.white] : [g.white, g.black];
    const k = `${a} vs ${b}`;
    const e = pairs.get(k) || { a, b, aw: 0, bw: 0, aBlackWins: 0, aBlack: 0, plies: 0, adjudicated: 0, cap: 0, n: 0 };
    const aWon = (g.winner === "B" && g.black === a) || (g.winner === "W" && g.white === a);
    if (aWon) e.aw++;
    else e.bw++;
    e.n++;
    e.plies += g.plies;
    if (g.reason === "adjudicated") e.adjudicated++;
    if (g.reason === "cap") e.cap++;
    pairs.set(k, e);
  }
  // How each anchor alone would place every player (systematic spread).
  const single = Object.fromEntries(
    players
      .filter((p) => p.startsWith("H:"))
      .map((h) => {
        const m = anchorMap(fit.theta, [{ player: h, gor: profileGoR(h.slice(2)) }]);
        return [h, Object.fromEntries(players.map((p) => [p, m.map(fit.theta[p])]))];
      }),
  );
  const order = (p) => players.indexOf(p);
  const sorted = [...pairs.values()].sort((x, y) => order(x.a) - order(y.a) || order(x.b) - order(y.b));
  return { players, rows, eta: fit.eta, pairs: sorted, anchors: am ? am.points : [], single };
}

/** Wilson 95% interval for k wins in n games. */
export function wilson(k, n) {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function report(result, { markdown }) {
  const f0 = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.round(v).toString());
  const lines = [];
  const row = (cells) => lines.push(markdown ? `| ${cells.join(" | ")} |` : cells.join("\t"));
  row(["Pair (A vs B, A rated lower)", "Games", "A–B", "B win % (95% CI)", "Avg plies", "Adjudicated", "Capped"]);
  if (markdown) row(["---", "---:", "---:", "---:", "---:", "---:", "---:"]);
  for (const p of result.pairs) {
    const [lo, hi] = wilson(p.bw, p.n);
    row([`${p.a} vs ${p.b}`, p.n, `${p.aw}–${p.bw}`, `${f0((100 * p.bw) / p.n)} (${f0(100 * lo)}–${f0(100 * hi)})`, f0(p.plies / p.n), p.adjudicated, p.cap]);
  }
  lines.push("");
  row(["Player", "BT θ (nats)", "95% CI", "Elo (400·log10)", "EGF GoR", "GoR 95% CI", "≈ rank"]);
  if (markdown) row(["---", "---:", "---:", "---:", "---:", "---:", "---:"]);
  for (const r of result.rows) {
    row([r.player, r.theta.toFixed(2), `${r.lo.toFixed(2)} … ${r.hi.toFixed(2)}`, f0(r.elo), f0(r.gor), r.gorLo == null ? "–" : `${f0(r.gorLo)} … ${f0(r.gorHi)}`, r.gor == null ? "–" : goRLabel(r.gor)]);
  }
  lines.push("");
  lines.push(`First-move term η = ${result.eta.toFixed(2)} nats (positive favours Black at this komi).`);
  if (result.anchors.length) {
    lines.push(`Anchors used: ${result.anchors.map((a) => `${a.player} (nominal ${goRLabel(a.nominal)}, fitted ${goRLabel(a.mapped)})`).join(", ")}.`);
  }
  const hs = Object.keys(result.single);
  if (hs.length > 1) {
    lines.push("");
    row(["Player", ...hs.map((h) => `≈ rank if only ${h}`)]);
    if (markdown) row(["---", ...hs.map(() => "---:")]);
    for (const p of result.players) row([p, ...hs.map((h) => goRLabel(result.single[h][p]))]);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------ v7: CI plans */

/**
 * Merge JSONL game files: every line of `inputs` whose key is not already
 * in `existing` (or earlier in `inputs`), in input order. Lines that are
 * not JSON with a key (a job killed mid-write) are dropped.
 */
export function mergeGames(existing, inputs) {
  const seen = new Set(existing.map((g) => g.key));
  const out = [];
  for (const text of inputs) {
    for (const line of text.split("\n")) {
      let g;
      try {
        g = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (!g?.key || seen.has(g.key)) continue;
      seen.add(g.key);
      out.push(g);
    }
  }
  return out;
}

const readGames = (file) =>
  fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch (_) {
          return [];
        }
      })
    : [];

/**
 * A calibration plan (docs/calibration/plan.json): { runs: [{ id, size,
 * games, pairs, shards, workers?, scoreVisits?, candidates? }] }. Returns
 * the GitHub Actions matrix, one entry per (run, shard).
 */
export function planMatrix(plan) {
  const include = [];
  for (const r of plan.runs || []) {
    if (!/^[\w.-]+$/.test(r.id || "")) throw new Error(`plan: bad run id ${r.id}`);
    if (![9, 13, 19].includes(r.size)) throw new Error(`plan ${r.id}: size must be 9, 13 or 19`);
    if (!(r.games > 0) || !r.pairs) throw new Error(`plan ${r.id}: games and pairs are required`);
    const shards = r.shards || 1;
    for (let i = 0; i < shards; i++) include.push({ run: r.id, shard: `${i}/${shards}` });
  }
  if (!include.length) throw new Error("plan: no runs");
  if (include.length > 256) throw new Error("plan: more than 256 jobs");
  return { include };
}

/* ---------------------------------------------------------------- main */

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  if (cmd === "play") {
    const opt = {
      katago: a.katago || process.env.KATAGO,
      model: a.model || path.join(ROOT, "engine/model/model.txt.gz"),
      config: a.config || path.join(ROOT, "engine/model/gtp.cfg"),
      humanModel: a["human-model"] || process.env.KATAGO_HUMAN_MODEL,
      strongModel: a["strong-model"] || process.env.KATAGO_STRONG_MODEL,
      candidates: a.candidates,
      out: a.out || "calibration.jsonl",
      size: Number(a.size || 19),
      komi: Number(a.komi ?? 6.5),
      games: Number(a.games || 20),
      pairs: a.pairs || "adjacent",
      anchors: String(a.anchors || "rank_20k,rank_15k,rank_10k,rank_5k,rank_1k,rank_2d").split(","),
      workers: Number(a.workers || Math.max(1, os.availableParallelism())),
      threads: Number(a.threads || 1),
      scoreVisits: Number(a["score-visits"] || 400),
      tag: a.tag || "",
      shard: parseShard(a.shard),
      deadline: Number(a.deadline || 0),
    };
    if (!opt.katago) throw new Error("--katago PATH (or KATAGO=…) is required");
    if (opt.pairs.includes("H:") || opt.pairs.includes("HL:") || opt.pairs.includes("CH:") || opt.pairs.includes("anchors")) {
      if (!opt.humanModel) throw new Error("--human-model PATH is required for H: anchors and HL: levels");
    }
    if (opt.pairs.includes("LS:") && !opt.strongModel) throw new Error("--strong-model PATH is required for LS: levels");
    await runPlay(opt);
  } else if (cmd === "merge") {
    const [out, ...inputs] = a._.slice(1);
    if (!out) throw new Error("usage: merge OUT IN…");
    const add = mergeGames(readGames(out), inputs.map((f) => fs.readFileSync(f, "utf8")));
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.appendFileSync(out, add.map((g) => JSON.stringify(g) + "\n").join(""));
    console.error(`${add.length} new games → ${out} (${readGames(out).length} in all)`);
  } else if (cmd === "matrix") {
    console.log(JSON.stringify(planMatrix(JSON.parse(fs.readFileSync(a._[1] || "docs/calibration/plan.json", "utf8")))));
  } else if (cmd === "run-args") {
    // v7 CI: the play arguments of one plan run, one per line.
    const plan = JSON.parse(fs.readFileSync(a._[1], "utf8"));
    const r = (plan.runs || []).find((x) => x.id === a._[2]);
    if (!r) throw new Error(`no run ${a._[2]} in ${a._[1]}`);
    const out = ["--size", r.size, "--games", r.games, "--pairs", r.pairs, "--workers", r.workers || 4, "--score-visits", r.scoreVisits || (r.size === 19 ? 200 : 400)];
    if (r.candidates) out.push("--candidates", r.candidates);
    if (r.tag) out.push("--tag", r.tag);
    console.log(out.join("\n"));
  } else if (cmd === "fit") {
    // v7: several files are pooled (e.g. docs/calibration/results/*.jsonl).
    const files = a._.length > 1 ? a._.slice(1) : ["calibration.jsonl"];
    let games = files.flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    );
    if (a.size) games = games.filter((g) => g.size === Number(a.size));
    // --alias "C:b100=L:30k,...": pool games of a candidate whose settings are
    // identical to a ladder level (exploration runs) under the level's name.
    if (a.alias) {
      const alias = Object.fromEntries(String(a.alias).split(",").map((x) => x.split("=")));
      games = games.map((g) => ({ ...g, black: alias[g.black] || g.black, white: alias[g.white] || g.white }));
    }
    // Human-SL vs human-SL games are a consistency check, not part of the fit
    // (docs/strength.md) unless --with-hh.
    if (!a["with-hh"]) games = games.filter((g) => !(g.black.startsWith("H:") && g.white.startsWith("H:")));
    if (a.only) {
      const keep = new Set(String(a.only).split(","));
      games = games.filter((g) => keep.has(g.black) && keep.has(g.white));
    }
    // v6: --fixed holds the shipped ladder (L:) at its v4 measurement
    // (strength.js MEASURED.standard, for --size 9 or 19) and places only
    // the other players; on 19×19 their GoR comes from the v4 anchor map.
    const anchors = a.anchor ? String(a.anchor).split(",") : null;
    const opt = { boot: Number(a.boot || 1000), anchors };
    if (a.fixed) {
      const size = Number(a.size);
      if (size !== 9 && size !== 19) throw new Error("--fixed needs --size 9 or 19");
      opt.fixed = Object.fromEntries(STRENGTHS.map((s) => [`L:${s.id}`, MEASURED.standard[s.id][size]]));
      if (size === 19) opt.gorMap = thetaToGoR;
    }
    if (a.json) {
      console.log(JSON.stringify(analyse(games, opt), null, 1));
      return;
    }
    console.log(report(analyse(games, opt), { markdown: !!a.markdown }));
  } else {
    console.error("usage: calibrate-strength.mjs play|fit … (see the header of this file)");
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
