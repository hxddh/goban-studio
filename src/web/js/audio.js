/**
 * Game sounds.
 *
 * Sampled sounds (synthesised by scripts/make-assets.mjs, physical modelling
 * of a stone on a board) are fetched by relative URL and decoded with Web
 * Audio after the first user gesture unlocks the context. Until they are
 * ready, or if they fail to load, the small synthesised tones below play
 * instead, so every call always makes an appropriate sound (or none when
 * sound is off).
 *
 * Exports: setLevel(name) (Settings: off | quiet | normal | loud),
 * setSound(on), setVolume(v), stone(capture), capture(count), pass(),
 * correct(), wrong(), gameEnd(), win(), lose().
 */
let ctx = null;
let master = null;
let enabled = true;
let volume = 0.8;
let base = "assets/sounds/";

const FILES = {
  placeWood: ["place-wood-0", "place-wood-1", "place-wood-2", "place-wood-3", "place-wood-4", "place-wood-5"],
  capture1: ["capture-1"],
  capture2: ["capture-2"],
  capture3: ["capture-3"],
  pass: ["pass"],
  correct: ["correct"],
  wrong: ["wrong"],
  lose: ["lose"],
  end: ["game-end"],
};

/**
 * Levels relative to the stone (docs/design.md §9): captures −6 dB, the
 * result −3 dB, everything that is not the board −4.5 dB.
 */
export const LEVEL = { stone: 1, capture: 0.5, result: 0.71, ui: 0.6 };

const buffers = {};
const last = {};
let loading = null;

function context() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = typeof AudioContext !== "undefined" ? AudioContext : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    load();
    return ctx;
  } catch (_) {
    return null;
  }
}

function decode(c, data) {
  return new Promise((resolve, reject) => {
    try {
      const p = c.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

function load() {
  if (loading || !ctx || typeof fetch === "undefined") return loading;
  const c = ctx;
  const jobs = [];
  for (const [key, names] of Object.entries(FILES)) {
    buffers[key] = [];
    names.forEach((name, i) => {
      jobs.push(
        fetch(base + name + ".wav")
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
          .then((data) => decode(c, data))
          .then((buf) => {
            buffers[key][i] = buf;
          })
          .catch(() => {}),
      );
    });
  }
  loading = Promise.all(jobs).then(() => {
    for (const key of Object.keys(buffers)) buffers[key] = buffers[key].filter(Boolean);
  });
  return loading;
}

/** Unlock on the first gesture, as before: the context is created then. */
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    context();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

/** Pick a random variant, never the same one twice in a row. */
function pick(key) {
  const list = (buffers[key] || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const prev = last[key];
  let i;
  if (prev === undefined || prev >= list.length) i = Math.floor(Math.random() * list.length);
  else {
    i = Math.floor(Math.random() * (list.length - 1));
    if (i >= prev) i += 1;
  }
  last[key] = i;
  return list[i];
}

/** Play a sampled sound. Returns false when it is not available. */
function play(key, { gain = 1, delay = 0, detune = 0.03 } = {}) {
  const c = context();
  if (!c) return true; // sound off: nothing to fall back to
  const buf = pick(key);
  if (!buf) return false;
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start(c.currentTime + delay);
    return true;
  } catch (_) {
    return false;
  }
}

export function setSound(on) {
  enabled = !!on;
}

/**
 * The volume levels of Settings → General, as master gains. "normal" is
 * the level the app always had; "quiet" is about −10 dB and "loud" +2 dB.
 */
export const VOLUME_LEVELS = { off: 0, quiet: 0.25, normal: 0.8, loud: 1 };

/** The master gain of a stored volume setting; an unknown value is "normal". */
export function levelGain(name) {
  return Object.prototype.hasOwnProperty.call(VOLUME_LEVELS, name) ? VOLUME_LEVELS[name] : VOLUME_LEVELS.normal;
}

/** Apply the volume setting: "off" turns sound off, the others set the master gain. */
export function setLevel(name) {
  const gain = levelGain(name);
  setSound(gain > 0);
  if (gain > 0) setVolume(gain);
  return gain;
}

/** What is in force now: { enabled, volume } (for tests and the self-test). */
export function soundState() {
  return { enabled, volume };
}

/** Master volume, 0..1. */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = volume;
}

// ------------------------------------------------- synthesised fallback ----

function tone(freq, duration, gainValue, type = "sine", at = 0) {
  const c = context();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(master || c.destination);
    const t0 = c.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch (_) {}
}

// ------------------------------------------------------------ public ----

/** A stone is placed; `capture` (boolean or count) also drops prisoners into the lid. */
export function stone(captureFlag = false) {
  if (!context()) return;
  if (!play("placeWood")) tone(320, 0.06, 0.08, "triangle");
  if (captureFlag) capture(typeof captureFlag === "number" ? captureFlag : 1, 0.12);
}

/** Captured stones rattle into the lid: more stones, a longer rattle. */
export function capture(count = 1, delay = 0) {
  if (!context()) return;
  const n = Math.max(1, count | 0);
  const key = n === 1 ? "capture1" : n <= 3 ? "capture2" : "capture3";
  if (!play(key, { delay, detune: 0.04, gain: LEVEL.capture })) {
    tone(190, 0.09, 0.12, "triangle", delay);
    tone(120, 0.12, 0.06, "sine", delay);
  }
}

export function pass() {
  if (!play("pass", { detune: 0.02, gain: LEVEL.ui })) tone(220, 0.08, 0.05, "sine");
}

/** A correct answer: two warm rising notes. */
export function correct() {
  if (!play("correct", { detune: 0, gain: LEVEL.ui })) {
    tone(523, 0.14, 0.06, "sine");
    tone(698, 0.2, 0.05, "sine", 0.11);
  }
}

/** A wrong answer: a soft low note. */
export function wrong() {
  if (!play("wrong", { detune: 0, gain: LEVEL.ui })) {
    tone(196, 0.16, 0.05, "sine");
    tone(185, 0.2, 0.04, "sine", 0.12);
  }
}

/** The game is over (neutral). */
export function gameEnd() {
  if (!play("end", { detune: 0, gain: LEVEL.result })) win();
}

export function win() {
  if (play("end", { detune: 0, gain: LEVEL.result })) return;
  tone(523, 0.14, 0.06, "sine");
  tone(659, 0.18, 0.05, "sine", 0.09);
  tone(784, 0.24, 0.04, "sine", 0.19);
}

export function lose() {
  if (play("lose", { detune: 0 })) return;
  tone(330, 0.16, 0.05, "sine");
  tone(247, 0.22, 0.04, "sine", 0.11);
}
