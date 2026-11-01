/**
 * Small synthesized sounds. No assets, no network, and no sound until the
 * first gesture has unlocked the audio context.
 */
let ctx = null;
let enabled = true;

function context() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = typeof AudioContext !== "undefined" ? AudioContext : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch (_) {
    return null;
  }
}

export function setSound(on) {
  enabled = !!on;
}

function tone(freq, duration, gainValue, type = "sine") {
  const c = context();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(c.destination);
  const t0 = c.currentTime;
  gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function stone(capture = false) {
  if (!context()) return;
  tone(capture ? 190 : 320, capture ? 0.09 : 0.06, capture ? 0.12 : 0.08, "triangle");
  if (capture) tone(120, 0.12, 0.06, "sine");
}

export function pass() {
  tone(220, 0.08, 0.05, "sine");
}

export function win() {
  tone(523, 0.14, 0.06, "sine");
  setTimeout(() => tone(659, 0.18, 0.05, "sine"), 90);
  setTimeout(() => tone(784, 0.24, 0.04, "sine"), 190);
}

export function lose() {
  tone(330, 0.16, 0.05, "sine");
  setTimeout(() => tone(247, 0.22, 0.04, "sine"), 110);
}
