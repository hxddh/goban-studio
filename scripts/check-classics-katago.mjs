/**
 * Every move of the classic games valued by KataGo (docs/classics-katago.json).
 *
 *   node scripts/check-classics-katago.mjs list
 *       one line per classic: id, moves, komi (no engine needed)
 *   node scripts/check-classics-katago.mjs run --katago PATH --model PATH --out FILE
 *       [--shard i/n] [--visits 400] [--threads 4] [--only ID,ID (shared by the shards)]
 *       search every position of this shard's games and write the results
 *   node scripts/check-classics-katago.mjs report FILE...
 *       merge shard results into docs/classics-katago.json
 *   node scripts/check-classics-katago.mjs swings [--top 8]
 *       print each classic's largest swings from docs/classics-katago.json
 *
 * The key moments written for each classic (content/classics.js) are checked
 * against this data: a moment that calls a move a mistake or the best move
 * must agree with KataGo here (scripts/tests/classics.mjs).
 *
 * Each position before move n (and after the last move) is searched with the
 * same visits, under Japanese rules with the game's komi (6.5 when the
 * record has none; the oldest games were played without komi, which shifts
 * every lead by the same amount and changes no loss). For move n:
 *   lead  the score lead for Black before the move, with best play
 *   best  KataGo's most visited move there
 *   loss  how many points the move gave away: the lead before minus the lead
 *         after, from the mover's side (negative when the search found the
 *         move better than it first thought)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { Analysis, vertex } from "./check-lessons-katago.mjs";

const OUT = "docs/classics-katago.json";

/** The main line of a classic: size, komi and the moves as [color, x, y] (null x for a pass). */
export function mainLine(sgf) {
  const prop = (k) => (new RegExp(`\\b${k}\\[([^\\]]*)\\]`).exec(sgf) || [])[1];
  const size = Number(prop("SZ") || 19);
  const km = prop("KM");
  const komi = km === undefined || km === "" ? 6.5 : Number(km);
  const moves = [];
  for (const m of sgf.matchAll(/;\s*([BW])\[([a-s]{0,2})\]/g)) {
    const c = m[1] === "B" ? 1 : -1;
    if (!m[2] || (m[2] === "tt" && size <= 19)) moves.push([c, null, null]);
    else moves.push([c, m[2].charCodeAt(0) - 97, m[2].charCodeAt(1) - 97]);
  }
  return { size, komi, moves };
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

async function checkGame(kg, c, { visits }) {
  const { size, komi, moves } = mainLine(c.sgf);
  const pos = { size, stones: [] };
  // A pass is sent as "pass"; the wrapper takes coordinates, so passes are
  // written as an off-board point and mapped back.
  const played = (n) => moves.slice(0, n).map(([col, x, y]) => [col, x ?? -1, y ?? -1]);
  const roots = await Promise.all(
    Array.from({ length: moves.length + 1 }, (_, n) =>
      kg.query({ pos, toMove: 1, moves: played(n), visits, komi }).then((r) => {
        if (r.error) throw new Error(`${c.id} move ${n}: ${r.error}`);
        return r;
      }),
    ),
  );
  const out = [];
  for (let n = 0; n < moves.length; n++) {
    const [col, x, y] = moves[n];
    const best = (roots[n].moves || []).find((m) => m.visits > 0);
    const before = roots[n].lead;
    const after = roots[n + 1].lead;
    out.push({
      n: n + 1,
      c: col === 1 ? "B" : "W",
      move: x == null ? "pass" : vertex(x, y, size),
      lead: r1(before),
      best: !best ? null : best.pass ? "pass" : vertex(best.x, best.y, size),
      loss: r1((before - after) * col),
    });
  }
  return { id: c.id, size, komi, visits, final: r1(roots[moves.length].lead), moves: out };
}

/** Each classic's largest losses (one per 10-move window, so one fight does not fill the list). */
export function swings(game, top = 8) {
  const picked = [];
  for (const m of game.moves.slice().sort((a, b) => b.loss - a.loss)) {
    if (picked.length >= top) break;
    if (picked.some((p) => Math.abs(p.n - m.n) < 10)) continue;
    picked.push(m);
  }
  return picked.sort((a, b) => a.n - b.n);
}

function writeReport(files) {
  const games = {};
  let network = null;
  let runId = null;
  const shards = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  for (const j of shards) {
    network ||= j.network;
    runId ||= j.runId;
  }
  // A rerun of some games (--only) keeps the others from the last report,
  // when they were searched with the same network and visits.
  const visits = shards.find((j) => j.results.length)?.results[0].visits;
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    if (prev.network === network) for (const g of prev.games) if (g.visits === visits) games[g.id] = g;
  }
  for (const j of shards) for (const g of j.results) games[g.id] = g;
  const order = CLASSICS.map((c) => c.id).filter((id) => games[id]);
  const missing = CLASSICS.map((c) => c.id).filter((id) => !games[id]);
  const report = { network, runId, missing, games: order.map((id) => games[id]) };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 0).replace(/\},\{"n"/g, '},\n{"n"') + "\n");
  console.log(`${order.length} classics in ${OUT}${missing.length ? `; missing ${missing.join(", ")}` : ""}`);
}

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      a[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else (a._ ||= []).push(argv[i]);
  }
  return a;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (cmd === "list") {
    for (const c of CLASSICS) {
      const { moves, komi } = mainLine(c.sgf);
      console.log(`${c.id} ${moves.length} ${komi}`);
    }
    return;
  }
  if (cmd === "report") return writeReport(a._ || []);
  if (cmd === "swings") {
    const r = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const g of r.games) {
      console.log(`\n${g.id} (komi ${g.komi}, final lead ${g.final})`);
      for (const m of swings(g, Number(a.top || 8))) console.log(`  ${m.n} ${m.c} ${m.move} loss ${m.loss}  lead ${m.lead}  best ${m.best}`);
    }
    return;
  }
  if (cmd !== "run") {
    console.error("usage: check-classics-katago.mjs list | run --katago PATH --model PATH --out FILE [--shard i/n] | report FILE... | swings");
    process.exit(2);
  }
  const visits = Number(a.visits || 400);
  const threads = Number(a.threads || os.availableParallelism?.() || 4);
  const [si, sn] = String(a.shard || "0/1").split("/").map(Number);
  const only = a.only ? new Set(String(a.only).split(",")) : null;
  // --only picks the games first; the shards then share those.
  const games = CLASSICS.filter((c) => !only || only.has(c.id)).filter((c, i) => i % sn === si);
  const kg = new Analysis({ katago: a.katago || process.env.KATAGO, model: a.model || process.env.KATAGO_STRONG_MODEL, threads });
  const started = Date.now();
  const results = [];
  for (const c of games) {
    const t0 = Date.now();
    results.push(await checkGame(kg, c, { visits }));
    console.log(`${c.id} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  kg.close();
  const network = path.basename(a.model || process.env.KATAGO_STRONG_MODEL || "").replace(/\.(bin|txt)\.gz$/, "");
  const outFile = a.out || "classics-check.json";
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ network, visits, runId: process.env.GITHUB_RUN_ID || null, seconds: Math.round((Date.now() - started) / 1000), results }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
