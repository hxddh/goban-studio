/**
 * The post-game review as words and as one PNG image: the result line and
 * the game's facts, a key moment in words, the change of the strength
 * estimate, the small boards of the key moments, and the image *Export
 * image* saves (play/review-model.js is what they draw).
 *
 * The image always uses the light palette (docs/design.md §4), so a shared
 * review looks the same whatever the viewer's appearance setting was.
 */
import { BLACK, coordLabel, formatPoints, rulesetById } from "../rules.js";
import { t, tn } from "../i18n.js";
import { resultText } from "../app/ctl-core.js";
import { storyText } from "../app/story.js";

/* ------------------------------------------------------------ words */

const half = (v) => formatPoints(Math.round(Math.max(0, v) * 2) / 2);

/** The headline: from the player's side when there is one. */
export function reviewHeadline(model) {
  if (!model.result) return t("library.unfinished");
  if (model.won === true) return t("result.youWon");
  if (model.won === false) return t("result.youLost");
  return resultText(model.result);
}

/** "Black wins by 3.5 · Japanese rules · Komi 6.5 · 19 × 19" */
export function reviewFacts(model) {
  const out = [];
  if (model.result && model.won != null) out.push(resultText(model.result));
  out.push(t(rulesetById(model.rules).labelKey));
  out.push(t("play.komiN", [formatPoints(model.komi ?? 0)]));
  out.push(`${model.size} × ${model.size}`);
  return out.join(" · ");
}

export const accuracyText = (a) => (a == null ? "—" : Math.round(a * 100) + "%");
export const lossText = (v) => (v == null ? "—" : "≈ " + half(v));

/** One moment in words: { title, played, better, lost, why }. */
export function momentWords(model, mo) {
  return {
    title: t("report.move", [mo.index]),
    played: t("report.played", [coordLabel(mo.played.x, mo.played.y, model.size)]),
    better: mo.best ? t("report.better", [coordLabel(mo.best.x, mo.best.y, model.size)]) : "",
    lost: mo.loss != null ? tn("report.lost", Number(half(mo.loss)), [half(mo.loss)]) : "",
    why: mo.why ? storyText(mo.why) : "",
  };
}

/* ------------------------------------------------------- small board */

const LIGHT = {
  bg: "#f7f6f3",
  surface: "#ffffff",
  line: "rgba(29,28,26,0.09)",
  text: "#1d1c1a",
  text2: "#5f5d58",
  text3: "#8a8780",
  good: "#2e7d4f",
  bad: "#b3402c",
  board: "#e4cb9a",
  boardLine: "rgba(60,40,20,0.42)",
};

/**
 * The position before a moment's move, `px` wide at (x0, y0): the move
 * played as a stone ringed in the mistake colour, the better move as a ring
 * in the good colour.
 */
export function drawMoment(g, x0, y0, px, mo, size, colors = {}) {
  const c = { ...LIGHT, ...colors };
  const cell = px / size;
  g.save();
  g.translate(x0, y0);
  g.fillStyle = c.board;
  g.fillRect(0, 0, px, px);
  g.strokeStyle = c.boardLine;
  g.lineWidth = Math.max(0.5, cell / 14);
  g.beginPath();
  for (let i = 0; i < size; i++) {
    const p = cell * (i + 0.5);
    g.moveTo(cell / 2, p);
    g.lineTo(px - cell / 2, p);
    g.moveTo(p, cell / 2);
    g.lineTo(p, px - cell / 2);
  }
  g.stroke();
  const stone = (x, y, color, alpha = 1) => {
    g.globalAlpha = alpha;
    g.fillStyle = color === BLACK ? "#1d1d1b" : "#f7f4ec";
    g.beginPath();
    g.arc(cell * (x + 0.5), cell * (y + 0.5), cell * 0.47, 0, Math.PI * 2);
    g.fill();
    if (color !== BLACK) {
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.lineWidth = Math.max(0.5, cell / 16);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const thumb = mo.thumb || "";
  for (let i = 0; i < thumb.length; i++) {
    const ch = thumb[i];
    if (ch !== "b" && ch !== "w") continue;
    stone(i % size, Math.floor(i / size), ch === "b" ? BLACK : -BLACK);
  }
  const ring = (x, y, color, r) => {
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, cell * 0.13);
    g.beginPath();
    g.arc(cell * (x + 0.5), cell * (y + 0.5), cell * r, 0, Math.PI * 2);
    g.stroke();
  };
  if (mo.played) {
    // The move played: its stone, marked inside in the mistake colour.
    stone(mo.played.x, mo.played.y, mo.color);
    ring(mo.played.x, mo.played.y, c.bad, 0.26);
  }
  if (mo.best) ring(mo.best.x, mo.best.y, c.good, 0.4);
  g.restore();
}

/* -------------------------------------------------------- the image */

function fontStack() {
  try {
    const f = getComputedStyle(document.documentElement).getPropertyValue("--font").trim();
    if (f) return f;
  } catch (_) {}
  return "system-ui, sans-serif";
}

/** Lines of `text` no wider than `max` (words, or characters for CJK). */
export function wrap(g, text, max) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    const tokens = para.match(/[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+|\s+/g) || [];
    let line = "";
    for (const tok of tokens) {
      const next = line + tok;
      if (line && g.measureText(next.trimEnd()).width > max) {
        out.push(line.trimEnd());
        line = /^\s+$/.test(tok) ? "" : tok;
      } else line = next;
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}

/**
 * Lay out (and, with `draw`, paint) the review at width W. Returns the
 * height used, so the first pass sizes the canvas for the second.
 */
const rankText = (rank) => (rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]));

/**
 * v7: the words for a rated game's change of strength estimate
 * ({ before: { rank, pm }, after: { rank, pm } }, the game file's `rating`):
 * "Strength ≈ 12 kyu → ≈ 11 kyu (±1)", or "".
 */
export function ratingChangeText(rt) {
  if (!rt?.before || !rt?.after || !Number.isFinite(rt.before.rank) || !Number.isFinite(rt.after.rank)) return "";
  if (rt.before.rank === rt.after.rank) return t("sched.report.ratingSame", [rankText(rt.after.rank), rt.after.pm]);
  return t("sched.report.rating", [rankText(rt.before.rank), rankText(rt.after.rank), rt.after.pm]);
}

function layout(g, model, { W, date, draw, rating = null }) {
  const F = fontStack();
  const c = LIGHT;
  const pad = 72;
  const inner = W - pad * 2;
  let y = pad;
  const text = (s, x, yy, font, color, align = "left") => {
    if (!draw) return;
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = "alphabetic";
    g.fillText(s, x, yy);
  };
  const para = (s, font, color, lh, x = pad, max = inner) => {
    g.font = font;
    for (const ln of wrap(g, s, max)) {
      y += lh;
      text(ln, x, y - lh * 0.28, font, color);
    }
  };
  const rule = () => {
    y += 32;
    if (draw) {
      g.fillStyle = c.line;
      g.fillRect(pad, y, inner, 2);
    }
    y += 34;
  };
  // Head
  let when = "";
  try {
    when = new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {}
  para(["Goban Studio", t("review.title"), when].filter(Boolean).join(" · "), `500 22px ${F}`, c.text3, 30);
  y += 8;
  para(reviewHeadline(model), `600 52px ${F}`, c.text, 64);
  y += 4;
  para(reviewFacts(model), `400 26px ${F}`, c.text2, 36);
  const change = ratingChangeText(rating);
  if (change) para(change, `400 24px ${F}`, c.text2, 34);
  rule();

  // Phases, or what the estimate can say
  if (model.phases) {
    para(t("report.phases"), `600 30px ${F}`, c.text, 40);
    y += 12;
    const cols = [t("gameSummary.pointsLost"), t("gameSummary.mistakes"), t("gameSummary.blunders"), t("gameSummary.accuracy")];
    const colX = (i) => pad + inner * 0.36 + (inner * 0.64 * (i + 1)) / cols.length;
    for (const who of model.players) {
      y += 40;
      const label = model.players.length > 1 ? t(who === "black" ? "common.black" : "common.white") : "";
      text(label, pad, y, `500 22px ${F}`, c.text3);
      cols.forEach((h, i) => text(h, colX(i), y, `500 22px ${F}`, c.text3, "right"));
      y += 14;
      for (const ph of model.phases) {
        const st = ph.players[who];
        y += 50;
        text(t("phase." + ph.id), pad, y, `500 26px ${F}`, c.text);
        text(t("gameSummary.phaseMoves", [ph.from, ph.to]), pad + 200, y, `400 22px ${F}`, c.text3);
        const vals = [lossText(st.loss), String(st.mistakes || "—"), String(st.blunders || "—"), accuracyText(st.accuracy)];
        vals.forEach((v, i) => text(v, colX(i), y, `400 26px ${F}`, c.text, "right"));
        if (draw) {
          g.fillStyle = c.line;
          g.fillRect(pad, y + 18, inner, 1);
        }
      }
      y += 18;
    }
    if (model.takeaways.length) {
      y += 24;
      model.takeaways.slice(0, 3).forEach((tk, i) => {
        y += 10;
        const top = y;
        para(storyText(tk), `400 26px ${F}`, c.text2, 38, pad + 40, inner - 40);
        text(i + 1 + ".", pad, top + 38 - 38 * 0.28, `500 26px ${F}`, tk.tone === "bad" ? c.bad : tk.tone === "good" ? c.good : c.text3);
      });
    }
  } else {
    para(t(model.confidence === "none" ? "report.noAnalysis" : "report.estimate"), `400 26px ${F}`, c.text2, 38);
  }

  // Key moments
  if (model.moments.length) {
    rule();
    para(t(model.phases ? "report.moments" : "report.turningPoints"), `600 30px ${F}`, c.text, 40);
    y += 24;
    const gap = 32;
    const n = 3;
    const bw = (inner - gap * (n - 1)) / n;
    const top = y;
    let bottom = y;
    model.moments.slice(0, n).forEach((mo, i) => {
      const x = pad + i * (bw + gap);
      if (draw) drawMoment(g, x, top, bw, mo, model.size);
      const w = momentWords(model, mo);
      let yy = top + bw + 44;
      text(w.title, x, yy, `600 26px ${F}`, c.text);
      for (const ln of [w.played, w.better].filter(Boolean)) {
        yy += 36;
        text(ln, x, yy, `400 23px ${F}`, c.text2);
      }
      if (w.lost) {
        yy += 36;
        text(w.lost, x, yy, `500 23px ${F}`, c.bad);
      }
      bottom = Math.max(bottom, yy);
    });
    y = bottom;
  }
  y += pad;
  return Math.ceil(y);
}

/** The review as a PNG blob (≤ 380 KB, so it fits the native file bridge). */
export async function renderReviewPNG(model, { date = Date.now(), W = 1080, rating = null } = {}) {
  const measure = document.createElement("canvas").getContext("2d");
  const H = layout(measure, model, { W, date, draw: false, rating });
  for (const scale of [1, 0.8, 0.6]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const g = canvas.getContext("2d");
    g.scale(scale, scale);
    g.fillStyle = LIGHT.bg;
    g.fillRect(0, 0, W, H);
    layout(g, model, { W, date, draw: true, rating });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob && blob.size <= 380 * 1024) return blob;
  }
  return null;
}
