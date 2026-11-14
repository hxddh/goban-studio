/**
 * Sound synthesis by modal (physical) modelling.
 *
 * A stone landing on a board is an impact: a very short contact force pulse
 * (shorter = harder = brighter) excites the resonant modes of the board and of
 * the stone. Each mode is a damped two-pole resonator; wood damps high modes
 * quickly, so their decay times fall with frequency. A short burst of noise
 * through the same modes adds the "grit" of the contact, and two faint early
 * reflections place the board in a room. The result is a "pachi", not a beep.
 *
 * Everything is mono float32 at RATE and is loudness-normalised before it is
 * written: we K-weight the signal (ITU-R BS.1770 pre-filter + RLB high-pass),
 * take the loudest 50 ms window, and scale to a per-category target, then cap
 * the sample peak at -1 dBFS.
 */
import { rng } from "./lib.mjs";

export const RATE = 44100;

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

/** Contact force: a raised-cosine pulse of `ms` duration at `t0` seconds. */
function pulse(out, t0, ms, amp = 1) {
  const n = Math.max(2, Math.round((ms / 1000) * RATE));
  const s = Math.round(t0 * RATE);
  for (let i = 0; i < n && s + i < out.length; i++) out[s + i] += amp * 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
}

/** Exponentially decaying white noise burst. */
function burst(out, t0, ms, amp, r) {
  const s = Math.round(t0 * RATE);
  const tau = (ms / 1000) * RATE;
  for (let i = 0; i < tau * 6 && s + i < out.length; i++) out[s + i] += amp * (r() * 2 - 1) * Math.exp(-i / tau);
}

/**
 * Drive a bank of modes with an excitation signal and sum the result.
 * modes: [{f, t60, a}] — frequency (Hz), decay to -60 dB (s), gain.
 */
function modal(exc, modes) {
  const out = new Float32Array(exc.length);
  for (const m of modes) {
    if (m.f >= RATE / 2.2) continue;
    const w = (2 * Math.PI * m.f) / RATE;
    const rad = Math.exp(-6.9078 / (m.t60 * RATE));
    const b1 = 2 * rad * Math.cos(w);
    const b2 = -rad * rad;
    // Normalise so a unit impulse rings at amplitude m.a.
    const g = m.a * Math.sin(w);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < exc.length; i++) {
      const y = g * exc[i] + b1 * y1 + b2 * y2;
      out[i] += y;
      y2 = y1;
      y1 = y;
    }
  }
  return out;
}

function biquad(x, { b0, b1, b2, a1, a2 }) {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function lowpass(x, fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / RATE;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return biquad(x, { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 });
}

function highpass(x, fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / RATE;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return biquad(x, { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 });
}

function highshelf(x, fc, gainDb, q = 0.707) {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * fc) / RATE;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const sA = 2 * Math.sqrt(A) * al;
  const a0 = A + 1 - (A - 1) * c + sA;
  return biquad(x, {
    b0: (A * (A + 1 + (A - 1) * c + sA)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * c)) / a0,
    b2: (A * (A + 1 + (A - 1) * c - sA)) / a0,
    a1: (2 * (A - 1 - (A + 1) * c)) / a0,
    a2: (A + 1 - (A - 1) * c - sA) / a0,
  });
}

function add(dst, src, gain = 1, offset = 0) {
  const o = Math.round(offset * RATE);
  for (let i = 0; i < src.length && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * gain;
  return dst;
}

/** Two faint, low-passed early reflections: a table and a nearby wall. */
function room(x, r) {
  const out = Float32Array.from(x);
  const lp = lowpass(x, 3200);
  add(out, lp, 0.11, 0.0047 + r() * 0.0015);
  add(out, lp, 0.06, 0.0113 + r() * 0.003);
  add(out, lowpass(lp, 1800), 0.035, 0.019 + r() * 0.004);
  return out;
}

/** Fade the tail to exact silence and trim trailing near-silence. */
function finish(x, fadeMs = 30) {
  let end = x.length;
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const floor = peak * 0.0008;
  while (end > 1 && Math.abs(x[end - 1]) < floor) end--;
  end = Math.min(x.length, end + Math.round(0.01 * RATE));
  const y = x.slice(0, end);
  const f = Math.round((fadeMs / 1000) * RATE);
  for (let i = 0; i < f && i < y.length; i++) y[y.length - 1 - i] *= i / f;
  return y;
}

// ------------------------------------------------------------ loudness ----
function kWeight(x) {
  // BS.1770 stage 1 (head shelf, +4 dB above ~1.5 kHz) and stage 2 (RLB high-pass at 38 Hz).
  return highpass(highshelf(x, 1681.97, 4.0, 0.7071752), 38.13, 0.5003270);
}

/** Loudest 50 ms K-weighted mean square, in LUFS-like dB. */
export function loudness(x) {
  const k = kWeight(x);
  const win = Math.round(0.05 * RATE);
  let acc = 0;
  let best = 0;
  for (let i = 0; i < k.length; i++) {
    acc += k[i] * k[i];
    if (i >= win) acc -= k[i - win] * k[i - win];
    best = Math.max(best, acc / win);
  }
  return -0.691 + 10 * Math.log10(best + 1e-12);
}

export function normalise(x, targetLufs, peakDb = -1) {
  const g = Math.pow(10, (targetLufs - loudness(x)) / 20);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i] * g));
  const cap = Math.pow(10, peakDb / 20);
  const gain = peak * 1 > cap ? (g * cap) / peak : g;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
  return { samples: y, lufs: loudness(y), peakDb: 20 * Math.log10(Math.max(1e-9, peak * (gain / g))) };
}

// ------------------------------------------------------------- sounds ----

/** Board modes for a thick block of wood, scaled by `pitch`. */
function boardModes(r, { pitch = 1, top = 6800, bright = 1, damp = 1, centre = 1700 }) {
  // Ratios loosely follow a thick plate: dense, inharmonic, more modes up high.
  const base = [1, 1.52, 2.05, 2.71, 3.38, 4.12, 4.9, 5.83, 6.85, 8.1, 9.4, 11.2, 13.1, 15.6, 18.3, 21.7, 25.6];
  const f0 = 196 * pitch;
  const modes = [];
  for (const k of base) {
    const f = f0 * k * (1 + (r() - 0.5) * 0.06);
    if (f > top) break;
    // Emphasis around `centre` (by default 0.9 to 3 kHz): the bright "pachi" of kaya.
    const emph = Math.exp(-Math.pow(Math.log(f / centre) / 1.1, 2));
    const a = (0.25 + emph * bright) * (0.6 + r() * 0.8);
    const t60 = (0.34 / Math.pow(f / 200, 0.55)) * damp * (0.85 + r() * 0.3);
    modes.push({ f, t60, a });
  }
  // A low body "thock" from the whole block.
  modes.push({ f: 118 * pitch * (1 + (r() - 0.5) * 0.05), t60: 0.09 * damp, a: 0.55 });
  return modes;
}

/** Slate stone's own modes: high, short. */
function stoneModes(r, scale = 1) {
  return [5900, 8150, 10400, 12900].map((f, i) => ({ f: f * scale * (1 + (r() - 0.5) * 0.05), t60: 0.035 / (1 + i * 0.4), a: 0.18 / (1 + i * 0.5) }));
}

export function placeWood(seed, { pitch, hard }) {
  const r = rng(seed);
  const exc = buffer(0.42);
  const t0 = 0.002;
  pulse(exc, t0, 0.1 + (1 - hard) * 0.2, 1);
  burst(exc, t0, 0.35, 0.22 * hard, r);
  // Measured against a real stone on kaya (energy mostly 2–5 kHz, a click
  // above 6 kHz), the first version was dull: centroid 1.3 kHz, nothing
  // above 6 kHz. The emphasis sits higher and the stone's own modes and the
  // contact click are louder (docs/review-v14-zh.md, G13).
  const body = modal(exc, boardModes(r, { pitch, bright: 1.25 * hard, centre: 2600 }));
  const stone = modal(exc, stoneModes(r));
  const click = highpass(exc, 2500);
  const out = add(add(body, stone, 1.1 * hard), click, 0.22 * hard);
  return finish(room(out, r));
}

/** Stones dropped into a wooden lid: a short rattle of stone-on-stone clicks. */
export function capture(seed, count) {
  const r = rng(seed);
  const out = buffer(0.25 + count * 0.07);
  let t = 0.004;
  for (let i = 0; i < count; i++) {
    const exc = buffer(0.2);
    const amp = (0.55 + r() * 0.45) * Math.pow(0.86, i);
    pulse(exc, 0.001, 0.12 + r() * 0.08, amp);
    burst(exc, 0.001, 0.2, 0.1 * amp, r);
    // Stone-on-stone: a bright, glassy pair of high modes.
    const s = modal(exc, [
      { f: 3100 + r() * 900, t60: 0.05, a: 0.5 },
      { f: 4700 + r() * 1300, t60: 0.04, a: 0.45 },
      { f: 7300 + r() * 1500, t60: 0.03, a: 0.3 },
      { f: 9800 + r() * 1200, t60: 0.02, a: 0.18 },
    ]);
    // The thin lid answers each click with its own low, short body.
    const lid = modal(exc, [
      { f: 420 + r() * 60, t60: 0.06, a: 0.25 },
      { f: 910 + r() * 90, t60: 0.05, a: 0.22 },
      { f: 1650 + r() * 150, t60: 0.04, a: 0.16 },
    ]);
    add(out, add(s, lid, 0.8), 1, t);
    t += 0.018 + r() * (i < 2 ? 0.05 : 0.035);
  }
  // Stones settling against each other.
  const hiss = buffer(out.length / RATE);
  burst(hiss, 0.01, 30, 0.012 * Math.min(1, count / 3), r);
  add(out, lowpass(highpass(hiss, 2200), 6000));
  return finish(room(out, r));
}

/** Pass: a soft, low knock on the side of the board. */
export function passSound(seed) {
  const r = rng(seed);
  const exc = buffer(0.3);
  pulse(exc, 0.002, 2.2, 1);
  const body = modal(exc, boardModes(r, { pitch: 0.82, top: 1400, bright: 0.4, damp: 0.75 }));
  return finish(room(lowpass(body, 1500), r));
}

/** A wooden bar (marimba-like): partials at 1, 3.93, 9.2 with fast-decaying uppers. */
function bar(f, seconds, mallet = 1.4, velocity = 1) {
  const exc = buffer(seconds);
  pulse(exc, 0.001, mallet, velocity);
  return modal(exc, [
    { f, t60: Math.min(1.2, 260 / f), a: 1 },
    { f: f * 3.93, t60: 0.22, a: 0.22 },
    { f: f * 9.2, t60: 0.06, a: 0.06 },
    { f: f * 0.5 * 1.002, t60: 0.15, a: 0.06 },
  ]);
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Correct: two warm notes rising a fourth. */
export function correct() {
  const out = buffer(0.9);
  add(out, bar(NOTE(72), 0.8, 1.6, 0.8), 1, 0.003); // C5
  add(out, bar(NOTE(77), 0.8, 1.6, 1), 1, 0.11); // F5
  return finish(lowpass(out, 5000), 80);
}

/** Wrong: one soft low note sliding down a semitone, dull mallet. */
export function wrong() {
  const out = buffer(0.7);
  add(out, bar(NOTE(55), 0.6, 3.2, 1), 1, 0.003); // G3
  add(out, bar(NOTE(54), 0.6, 3.2, 0.7), 0.8, 0.12); // F#3
  return finish(lowpass(out, 1800), 80);
}

/** Lose (kept for the existing lose() export): two descending soft notes. */
export function lose() {
  const out = buffer(1.0);
  add(out, bar(NOTE(64), 0.9, 2.2, 0.9), 1, 0.003); // E4
  add(out, bar(NOTE(59), 0.9, 2.2, 0.8), 1, 0.16); // B3
  return finish(lowpass(out, 2600), 120);
}

/**
 * Game end: a rising three-note figure on the wooden bar, then a small
 * temple bowl (rin): inharmonic partials with slow beating pairs.
 */
export function gameEnd() {
  const out = buffer(3.0);
  add(out, bar(NOTE(67), 1.0, 1.6, 0.7), 0.8, 0.003); // G4
  add(out, bar(NOTE(71), 1.0, 1.6, 0.75), 0.8, 0.1); // B4
  add(out, bar(NOTE(74), 1.0, 1.6, 0.8), 0.8, 0.2); // D5
  const exc = buffer(2.8);
  pulse(exc, 0.001, 1.0, 1);
  const f = NOTE(79); // G5
  const rin = modal(exc, [
    { f, t60: 2.6, a: 0.5 },
    { f: f * 1.0025, t60: 2.6, a: 0.45 },
    { f: f * 2.71, t60: 1.4, a: 0.22 },
    { f: f * 2.71 * 1.003, t60: 1.4, a: 0.2 },
    { f: f * 5.2, t60: 0.6, a: 0.07 },
  ]);
  add(out, rin, 0.9, 0.3);
  return finish(lowpass(out, 6000), 200);
}

export const PLACE_VARIANTS = [
  { pitch: 1.0, hard: 1.0 },
  { pitch: 0.94, hard: 0.92 },
  { pitch: 1.06, hard: 0.96 },
  { pitch: 0.97, hard: 0.85 },
  { pitch: 1.03, hard: 1.0 },
  { pitch: 0.9, hard: 0.9 },
];

export const LOUDNESS = {
  place: -15,
  capture: -19,
  pass: -24,
  correct: -21,
  wrong: -24,
  lose: -23,
  end: -21,
};
