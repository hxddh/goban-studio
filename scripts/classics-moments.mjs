#!/usr/bin/env node
/**
 * Key moments for the classics from KataGo's check of every move
 * (docs/classics-katago.json, made by check-classics-katago.mjs and the
 * classics-check workflow).
 *
 *   node scripts/classics-moments.mjs [--min 3] [--check]
 *
 * Every classic gets at least --min moments. The hand-written ones stay;
 * the rest are the game's largest swings (1.5 points or more, else 1) while it was still in the
 * balance, at least 8 moves from another moment, with a note in four
 * languages that says only what the check measured: what KataGo would
 * play instead and where, how much the move cost, and how the lead
 * changed. They are marked "source": "katago" and are replaced on every
 * run, so a new check (a new network) rewrites them. --check fails when
 * src/web/js/content/classics.js is not what this would write.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src/web/js/content/classics.js");
const DATA = path.join(root, "docs/classics-katago.json");
const GAP = 8;

const COLS = "ABCDEFGHJKLMNOPQRST";
const REGION = {
  zh: ["左上", "上边", "右上", "左边", "中央", "右边", "左下", "下边", "右下"],
  en: ["upper left", "top", "upper right", "left side", "centre", "right side", "lower left", "bottom", "lower right"],
  ko: ["좌상", "상변", "우상", "좌변", "중앙", "우변", "좌하", "하변", "우하"],
  ja: ["左上", "上辺", "右上", "左辺", "中央", "右辺", "左下", "下辺", "右下"],
};
const COLOUR = { zh: ["黑棋", "白棋"], en: ["Black", "White"], ko: ["흑", "백"], ja: ["黒", "白"] };

/** "Q16" on 19×19 → index into REGION (thirds of the board). */
export function region(vertex, size = 19) {
  const x = COLS.indexOf(vertex[0]);
  const row = Number(vertex.slice(1));
  if (x < 0 || !(row >= 1 && row <= size)) return -1;
  const third = (v) => (v < size / 3 ? 0 : v < (2 * size) / 3 ? 1 : 2);
  return third(size - row) * 3 + third(x);
}

const pts = (v) => {
  const a = Math.abs(v);
  return a >= 3 ? String(Math.round(a)) : a.toFixed(1);
};

/** The four notes' lead sentence, from the lead before and after (Black's view). */
function leadText(before, after) {
  const side = (v) => (v > 0 ? 0 : 1);
  const even = (v) => Math.abs(v) < 1;
  if (even(before) && even(after)) {
    return { zh: "局面仍大致均势。", en: "The game stays about even.", ko: "형세는 여전히 비슷합니다.", ja: "形勢はほぼ互角のままです。" };
  }
  if (even(before)) {
    const s = side(after);
    return {
      zh: `原本大致均势，此后${COLOUR.zh[s]}领先约 ${pts(after)} 目。`,
      en: `The game was about even; now ${COLOUR.en[s]} leads by about ${pts(after)} points.`,
      ko: `비슷하던 형세에서 이제 ${COLOUR.ko[s]}이 약 ${pts(after)}집 앞섭니다.`,
      ja: `ほぼ互角だった形勢が、${COLOUR.ja[s]}の約${pts(after)}目リードになります。`,
    };
  }
  if (even(after)) {
    const s = side(before);
    return {
      zh: `${COLOUR.zh[s]}约 ${pts(before)} 目的领先没有了，局面回到均势。`,
      en: `${COLOUR.en[s]}'s lead of about ${pts(before)} points is gone: the game is about even.`,
      ko: `${COLOUR.ko[s]}의 약 ${pts(before)}집 우세가 사라져 형세가 비슷해집니다.`,
      ja: `${COLOUR.ja[s]}の約${pts(before)}目のリードが消え、ほぼ互角になります。`,
    };
  }
  if (side(before) !== side(after)) {
    const [a, b] = [side(before), side(after)];
    return {
      zh: `领先一方由${COLOUR.zh[a]}（约 ${pts(before)} 目）变为${COLOUR.zh[b]}（约 ${pts(after)} 目）。`,
      en: `The lead passes from ${COLOUR.en[a]} (about ${pts(before)} points) to ${COLOUR.en[b]} (about ${pts(after)}).`,
      ko: `우세가 ${COLOUR.ko[a]}(약 ${pts(before)}집)에서 ${COLOUR.ko[b]}(약 ${pts(after)}집)으로 넘어갑니다.`,
      ja: `リードが${COLOUR.ja[a]}（約${pts(before)}目）から${COLOUR.ja[b]}（約${pts(after)}目）に移ります。`,
    };
  }
  const s = side(after);
  return {
    zh: `${COLOUR.zh[s]}的领先由约 ${pts(before)} 目变为约 ${pts(after)} 目。`,
    en: `${COLOUR.en[s]}'s lead goes from about ${pts(before)} to about ${pts(after)} points.`,
    ko: `${COLOUR.ko[s]}의 우세가 약 ${pts(before)}집에서 약 ${pts(after)}집이 됩니다.`,
    ja: `${COLOUR.ja[s]}のリードが約${pts(before)}目から約${pts(after)}目になります。`,
  };
}

/** The lead (Black's view) after a checked move: its `lead` is the position's before it. */
export const leadAfter = (m) => (m.c === "B" ? m.lead - m.loss : m.lead + m.loss);

/**
 * What KataGo would play and what the move cost, in three forms per
 * language; a game's moments take them in turn, so its notes do not read
 * alike. Each says the same measured facts.
 */
const SAYS = {
  zh: [
    (x) => `KataGo 会下${x.where}的 ${x.best}；这一手让${x.who}损失约 ${x.loss} 目。`,
    (x) => `KataGo 更倾向${x.where}的 ${x.best}：这一手${x.who}亏了约 ${x.loss} 目。`,
    (x) => `按 KataGo 的计算，${x.who}这一手比${x.where}的 ${x.best} 差约 ${x.loss} 目。`,
  ],
  en: [
    (x) => `KataGo would play ${x.best} (${x.where}) instead; this costs ${x.who} about ${x.loss} points.`,
    (x) => `KataGo prefers ${x.best} (${x.where}): this move gives up about ${x.loss} points for ${x.who}.`,
    (x) => `By KataGo's count this ${x.who} move is about ${x.loss} points worse than ${x.best} (${x.where}).`,
  ],
  ko: [
    (x) => `KataGo는 ${x.where}의 ${x.best}에 둡니다. 이 수로 ${x.who}은 약 ${x.loss}집을 손해 봅니다.`,
    (x) => `KataGo는 ${x.where}의 ${x.best} 쪽을 더 좋게 봅니다. 이 수는 ${x.who}에게 약 ${x.loss}집 손해입니다.`,
    (x) => `KataGo의 계산으로는 ${x.who}의 이 수가 ${x.where}의 ${x.best}보다 약 ${x.loss}집 나쁩니다.`,
  ],
  ja: [
    (x) => `KataGo は${x.where}の ${x.best} を選びます。この手で${x.who}は約${x.loss}目損をしています。`,
    (x) => `KataGo は${x.where}の ${x.best} を推します。この手は${x.who}にとって約${x.loss}目の損です。`,
    (x) => `KataGo の計算では、${x.who}のこの手は${x.where}の ${x.best} より約${x.loss}目悪い手です。`,
  ],
};

/** One moment from a checked move; `top` when it is the game's largest swing among those chosen; `form` picks the wording. */
export function momentOf(m, size, top, form = 0) {
  const c = m.c === "B" ? 0 : 1;
  const r = region(m.best, size);
  const [before, after] = [m.lead, leadAfter(m)];
  const lead = leadText(before, after);
  const flips = Math.abs(before) >= 1 && Math.abs(after) >= 1 && Math.sign(before) !== Math.sign(after);
  const title = top
    ? { zh: "全局最大的转折", en: "The largest swing", ko: "가장 큰 승부처", ja: "最大の分岐点" }
    : flips
      ? { zh: "形势逆转", en: "The lead changes hands", ko: "형세 역전", ja: "形勢逆転" }
      : { zh: `${COLOUR.zh[c]}代价较大的一手`, en: `A costly ${COLOUR.en[c]} move`, ko: `${COLOUR.ko[c]}의 손해가 큰 수`, ja: `${COLOUR.ja[c]}の損が大きい一手` };
  return {
    index: m.n,
    source: "katago",
    title,
    note: Object.fromEntries(Object.keys(SAYS).map((lang) => [lang, SAYS[lang][form % SAYS[lang].length]({ best: m.best, where: REGION[lang][r], who: COLOUR[lang][c], loss: pts(m.loss) }) + (lang === "en" || lang === "ko" ? " " : "") + lead[lang]])),
  };
}

/** The moments to add to a classic with these hand-written ones, from its check. */
export function pick(game, kept, min) {
  const want = min - kept.length;
  if (want <= 0) return [];
  const taken = kept.map((k) => k.index);
  const chosen = [];
  // The game in the balance first; a game decided early is allowed a wider
  // margin, and a game played this well (AlphaGo's) smaller swings.
  const tries = [1.5, 1].flatMap((loss) => [20, 35, Infinity].map((margin) => ({ loss, margin })));
  for (const { loss, margin } of tries) {
    const cands = game.moves
      .map((m) => ({ m }))
      .filter(({ m }) => m.best && /^[A-HJ-T]\d+$/.test(m.best) && m.loss >= loss && Math.abs(m.lead) <= margin)
      .sort((p, q) => q.m.loss - p.m.loss || p.m.n - q.m.n);
    for (const c of cands) {
      if (chosen.length >= want) break;
      if ([...taken, ...chosen.map((x) => x.m.n)].some((n) => Math.abs(n - c.m.n) < GAP)) continue;
      chosen.push(c);
    }
    if (chosen.length >= want) break;
  }
  const most = Math.max(...chosen.map((c) => c.m.loss));
  // The forms in move order, so the notes of one game differ.
  return chosen
    .slice()
    .sort((a, b) => a.m.n - b.m.n)
    .map((c, i) => momentOf(c.m, game.size, c.m.loss === most, i));
}

export function withMoments(classics, report, min) {
  const games = Object.fromEntries(report.games.map((g) => [g.id, g]));
  return classics.map((c) => {
    const kept = (c.moments || []).filter((m) => m.source !== "katago");
    const game = games[c.id];
    const added = game ? pick(game, kept, min) : [];
    const moments = [...kept, ...added].sort((a, b) => a.index - b.index);
    const out = { ...c };
    if (moments.length) out.moments = moments;
    else delete out.moments;
    return out;
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const min = Number(argv[argv.indexOf("--min") + 1]) || 3;
  const text = fs.readFileSync(SRC, "utf8");
  const head = text.slice(0, text.indexOf("export const CLASSICS = "));
  const { CLASSICS } = await import(`${pathToFileURL(SRC).href}?t=${Date.now()}`); // a file URL: a Windows path is not one
  const report = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const next = withMoments(CLASSICS, report, min);
  const out = `${head}export const CLASSICS = ${JSON.stringify(next, null, 2)};\n`;
  if (argv.includes("--check")) {
    if (out !== text) {
      console.error("classics.js is not what classics-moments.mjs writes from docs/classics-katago.json; run it");
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(SRC, out);
  const added = next.reduce((a, c) => a + (c.moments || []).filter((m) => m.source === "katago").length, 0);
  const short = next.filter((c) => (c.moments || []).length < min).map((c) => c.id);
  console.log(`${added} KataGo moments from ${report.network}${short.length ? `; fewer than ${min}: ${short.join(", ")}` : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
