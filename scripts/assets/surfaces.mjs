/**
 * Board surfaces, generated pixel by pixel.
 *
 * Wood is modelled, not painted: a quarter-sawn (masame) board shows the
 * growth rings edge-on as long, nearly parallel bands. Each ring has a pale
 * earlywood part that darkens gradually into a thin latewood band and then
 * snaps back to earlywood at the next ring. Ring widths vary with "growth
 * years", the whole field is gently warped so the bands meander, fibres run
 * along the grain at a much finer scale, and a broad, low-contrast figure plus
 * a soft sheen sit on top. Nothing is a uniform line, which is what made the
 * v2 grain read as scratches.
 *
 * Output: an RGB Uint8Array (sRGB) of size*size*3.
 */
import { clamp, makeNoise, mix, rng, smoothstep, toLin, toSrgb } from "./lib.mjs";

function rings(r, { start, end, width, spread, trend }) {
  const pos = [];
  const w = [];
  const strength = [];
  let u = start;
  let i = 0;
  const phase = r() * 6.28;
  const phase2 = r() * 6.28;
  while (u < end) {
    const slow = 1 + trend * Math.sin(i / 19 + phase) + trend * 0.6 * Math.sin(i / 7.3 + phase2);
    const wi = Math.max(width * 0.35, width * slow * Math.exp(spread * r.gauss()));
    pos.push(u);
    w.push(wi);
    strength.push(clamp(0.5 + 0.38 * r.gauss(), 0.08, 1.15));
    u += wi;
    i++;
  }
  return { pos: Float64Array.from(pos), w: Float64Array.from(w), strength: Float64Array.from(strength) };
}

function findRing(pos, u) {
  let lo = 0;
  let hi = pos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pos[mid] <= u) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * @param {object} o
 *  early, late: sRGB [r,g,b] for earlywood and latewood
 *  ringWidth: mean ring width (px), ringSpread: log-normal spread
 *  ringContrast: how dark latewood gets (0..1)
 *  warp: meander amplitude (px)
 */
export function wood(size, seed, o) {
  const r = rng(seed);
  const N = makeNoise(seed * 7 + 1);
  const N2 = makeNoise(seed * 7 + 2);
  const N3 = makeNoise(seed * 7 + 3);
  const R = rings(r, { start: -400, end: size + 400, width: o.ringWidth, spread: o.ringSpread, trend: o.ringTrend });
  const E = o.early.map((c) => toLin(c / 255));
  const L = o.late.map((c) => toLin(c / 255));
  const F = o.figure.map((c) => toLin(c / 255));
  const out = new Uint8Array(size * size * 3);
  const SS = 2; // 2x2 supersampling across the grain keeps the latewood edge clean
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc0 = 0;
      let acc1 = 0;
      let acc2 = 0;
      // Large-scale terms are evaluated once per pixel.
      const warp =
        o.warp * N.fbm(x / 1100, y / 1700, 3) +
        o.warp * 0.35 * N.fbm(x / 260, y / 900, 2) +
        o.warp * 0.08 * N2.noise2(x / 60, y / 420);
      // Broad figure: soft, slightly darker clouds and a gentle across-grain ripple.
      const cloud = N2.fbm(x / 700 + 3.1, y / 520, 4);
      const ripple = N3.noise2(x / 300, y / 46) * 0.5 + N3.noise2(x / 140, y / 23) * 0.25;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // Neighbouring rings drift independently a little, so bands converge
          // and part instead of running as parallel rules.
          const u0 = fx + warp;
          const u = u0 + o.drift * N2.noise2(u0 / 26, fy / 640) + o.drift * 0.4 * N.noise2(u0 / 9, fy / 210);
          const i = findRing(R.pos, u);
          const t = (u - R.pos[i]) / R.w[i];
          // Density inside a ring: earlywood, a gradual transition, a latewood
          // band, and a soft (about 0.7 px) return to the next ring.
          const edge = Math.min(1, 0.7 / R.w[i]);
          let d = (0.35 * smoothstep(0.2, 0.8, t) + 0.65 * Math.pow(smoothstep(0.62, 0.96, t), 1.4)) * (1 - smoothstep(1 - edge, 1, t));
          d *= R.strength[i];
          // Fibres: long along the grain, thin across it.
          const fib =
            N3.noise2(u / 0.8, fy / 22) * 0.45 +
            N.noise2(u / 1.9, fy / 70) * 0.35 +
            N2.noise2(fx / 0.9, fy / 3.5) * 0.2;
          // Zones: groups of rings that are darker or paler as a whole.
          const zone = N.fbm(u / 140, fy / 2600, 3);
          const dens = clamp(d * o.ringContrast * (0.75 + zone * 0.9) + fib * o.fibre + cloud * o.cloud + zone * o.zone + ripple * o.ripple + o.bias);
          acc0 += mix(E[0], L[0], dens);
          acc1 += mix(E[1], L[1], dens);
          acc2 += mix(E[2], L[2], dens);
        }
      }
      const n = SS * SS;
      let c0 = acc0 / n;
      let c1 = acc1 / n;
      let c2 = acc2 / n;
      // Hue drift toward the figure colour in clouds.
      const fig = clamp(0.5 + cloud * 1.6) * o.figureAmt;
      c0 = mix(c0, F[0], fig);
      c1 = mix(c1, F[1], fig);
      c2 = mix(c2, F[2], fig);
      // Sheen: a very broad, soft lift from the top-left; finished boards are
      // waxed, not glossy.
      const sx = x / size - 0.18;
      const sy2 = y / size - 0.12;
      const sheen = o.sheen * Math.exp(-(sx * sx + sy2 * sy2) / 0.32) - o.sheen * 0.35;
      const k = 1 + sheen;
      const p = (y * size + x) * 3;
      out[p] = Math.round(toSrgb(c0 * k) * 255);
      out[p + 1] = Math.round(toSrgb(c1 * k) * 255);
      out[p + 2] = Math.round(toSrgb(c2 * k) * 255);
    }
  }
  return out;
}

export function kaya(size) {
  return wood(size, 1907, {
    early: [234, 190, 118],
    late: [168, 102, 44],
    figure: [212, 158, 92],
    ringWidth: (size / 2048) * 11,
    ringSpread: 0.32,
    ringTrend: 0.28,
    ringContrast: 0.5,
    drift: (size / 2048) * 5,
    zone: 0.14,
    fibre: 0.2,
    cloud: 0.1,
    ripple: 0.035,
    bias: 0.02,
    warp: (size / 2048) * 34,
    figureAmt: 0.16,
    sheen: 0.07,
  });
}

export function katsura(size) {
  return wood(size, 2211, {
    early: [238, 218, 178],
    late: [202, 168, 118],
    figure: [222, 192, 144],
    ringWidth: (size / 2048) * 15,
    ringSpread: 0.5,
    ringTrend: 0.3,
    ringContrast: 0.2,
    drift: (size / 2048) * 6,
    zone: 0.1,
    fibre: 0.17,
    cloud: 0.09,
    ripple: 0.02,
    bias: 0.06,
    warp: (size / 2048) * 26,
    figureAmt: 0.14,
    sheen: 0.05,
  });
}

/**
 * Washi: a cloudy sheet formation, fine pulp grain, long kozo fibres laid in
 * random curves, and a scattering of tiny bark specks (chiri).
 */
export function paper(size, seed = 3301) {
  const r = rng(seed);
  const N = makeNoise(seed);
  const N2 = makeNoise(seed + 1);
  const lum = new Float32Array(size * size);
  const tint = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const form = N.fbm(x / 160, y / 160, 5, 0.6) * 0.085 + N2.fbm(x / 30, y / 30, 2) * 0.02;
      const grain = N2.noise2(x / 1.7, y / 1.7) * 0.018;
      lum[i] = form + grain;
      tint[i] = N.fbm(x / 600 + 9, y / 600, 2) * 0.5;
    }
  }
  const splat = (fx, fy, amount, rad) => {
    const x0 = Math.floor(fx - rad - 1);
    const y0 = Math.floor(fy - rad - 1);
    for (let yy = y0; yy <= y0 + Math.ceil(rad * 2) + 2; yy++) {
      if (yy < 0 || yy >= size) continue;
      for (let xx = x0; xx <= x0 + Math.ceil(rad * 2) + 2; xx++) {
        if (xx < 0 || xx >= size) continue;
        const dx = xx + 0.5 - fx;
        const dy = yy + 0.5 - fy;
        const d2 = (dx * dx + dy * dy) / (rad * rad);
        if (d2 < 1) lum[yy * size + xx] += amount * (1 - d2) * (1 - d2);
      }
    }
  };
  const scale = size / 2048;
  const fibres = Math.round(7000 * scale * scale);
  for (let f = 0; f < fibres; f++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * Math.PI * 2;
    const len = (30 + Math.pow(r(), 1.8) * 380) * scale;
    const width = (1.3 + r() * 2.2) * scale + 0.3;
    // Most fibres are a touch brighter (they catch light); some are darker.
    const amount = (r() < 0.55 ? 0.8 : -1) * (0.006 + r() * 0.012);
    const curl = (r() - 0.5) * 0.0025;
    for (let s = 0; s < len; s += 0.5) {
      a += curl + (r() - 0.5) * 0.01;
      x += Math.cos(a) * 0.5;
      y += Math.sin(a) * 0.5;
      const fade = Math.sin((s / len) * Math.PI);
      splat(x, y, amount * fade * 0.5, width);
    }
  }
  const specks = Math.round(260 * scale * scale);
  for (let s = 0; s < specks; s++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI;
    const len = (1 + r() * 5) * scale;
    for (let t = -len; t <= len; t += 0.4) splat(x + Math.cos(a) * t, y + Math.sin(a) * t, -0.035 - r() * 0.05, 0.9 * scale + 0.3);
  }
  const base = [245, 238, 222].map((c) => toLin(c / 255));
  const warm = [240, 228, 204].map((c) => toLin(c / 255));
  const out = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const t = clamp(0.5 + tint[i]);
    const k = 1 + lum[i];
    const p = i * 3;
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(toSrgb(mix(base[c], warm[c], t) * k) * 255);
  }
  return out;
}

/**
 * Honed slate: dark green-grey with soft mottling, a fine mineral grain, very
 * faint bedding planes and sparse mica glints.
 */
export function slate(size, seed = 4409) {
  const r = rng(seed);
  const N = makeNoise(seed);
  const N2 = makeNoise(seed + 1);
  const N3 = makeNoise(seed + 2);
  const base = [56, 68, 63].map((c) => toLin(c / 255));
  const cool = [49, 61, 62].map((c) => toLin(c / 255));
  const out = new Uint8Array(size * size * 3);
  const ca = Math.cos(0.12);
  const sa = Math.sin(0.12);
  const lum = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * ca + y * sa;
      const v = -x * sa + y * ca;
      const mott = N.fbm(x / 420, y / 420, 5, 0.62) * 0.55;
      const bed = N2.fbm(u / 1400, v / 30, 3) * 0.2;
      const grain = N3.noise2(x / 1.3, y / 1.3) * 0.22 + N3.noise2(x / 3.7 + 50, y / 3.7) * 0.14;
      lum[y * size + x] = mott + bed + grain;
    }
  }
  const glints = Math.round(9000 * (size / 2048) ** 2);
  for (let g = 0; g < glints; g++) {
    const i = Math.floor(r() * size * size);
    lum[i] += 0.25 + r() * 0.6;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const t = clamp(0.5 + N.fbm(x / 900 + 7, y / 900, 2) * 1.4);
      const k = 1 + lum[i];
      const p = i * 3;
      for (let c = 0; c < 3; c++) out[p + c] = Math.round(toSrgb(mix(base[c], cool[c], t) * k) * 255);
    }
  }
  return out;
}
