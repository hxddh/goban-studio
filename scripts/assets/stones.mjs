/**
 * Stone sprites, shaded per pixel in linear light.
 *
 * Geometry: a Go stone seen from above is a flattened, double-convex lens.
 * We use an oblate ellipsoid (height 0.42 of the radius) for the normal, which
 * gives a broad, almost flat top that rolls off quickly at the rim.
 * Light: one key from the top-left and slightly above, plus a dim sky term.
 * No drop shadow is baked in; the renderer draws its own contact shadow.
 *
 * Each sprite fills its square edge to edge: the disc's diameter equals the
 * sprite width, with a 3x3 supersampled anti-aliased rim and alpha.
 */
import { clamp, makeNoise, mix, rng, toSrgb } from "./lib.mjs";

const LIGHT = (() => {
  const v = [-0.45, -0.58, 0.68];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();
const HALF = (() => {
  const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

function normalAt(nx, ny, flat = 0.42) {
  const rho2 = nx * nx + ny * ny;
  const z = Math.sqrt(Math.max(0, 1 - rho2)) / flat;
  const l = Math.hypot(nx, ny, z);
  return [nx / l, ny / l, z / l];
}

function render(size, shade) {
  const out = new Uint8Array(size * size * 4);
  const R = size / 2;
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - R) / R;
          const y = (py + (sy + 0.5) / SS - R) / R;
          if (x * x + y * y >= 1) continue;
          const c = shade(x, y);
          r += c[0];
          g += c[1];
          b += c[2];
          cover++;
        }
      }
      const p = (py * size + px) * 4;
      if (!cover) continue;
      // Average in linear light, then encode; alpha is coverage (straight).
      out[p] = Math.round(toSrgb(r / cover) * 255);
      out[p + 1] = Math.round(toSrgb(g / cover) * 255);
      out[p + 2] = Math.round(toSrgb(b / cover) * 255);
      out[p + 3] = Math.round((cover / (SS * SS)) * 255);
    }
  }
  return out;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * White clam-shell stone. The growth lines of the shell show as soft
 * parallel bands, gently curved (concentric about a point well off the
 * stone), with irregular spacing and a faint grey-blue in the denser bands.
 */
export function whiteStone(size, seed, { angle, spacing, curve }) {
  const N = makeNoise(seed);
  const r = rng(seed);
  // Centre of the growth arcs, far outside the stone along -angle.
  const dist = curve;
  const cx = -Math.cos(angle) * dist;
  const cy = -Math.sin(angle) * dist;
  const albedo = [0.9, 0.885, 0.84];
  const band = [0.76, 0.785, 0.8];
  const phase = r() * 10;
  const spec = [0.93, 0.97, 1.0];
  return render(size, (x, y) => {
    const n = normalAt(x, y);
    const q = Math.hypot(x - cx, y - cy) * (size / 2);
    // Irregular spacing: the growth coordinate is warped by smooth noise.
    const w = q / spacing + 1.6 * N.fbm(q / 90, phase, 2) + 0.25 * N.noise2(x * 3 + 7, y * 3);
    const s1 = 0.5 + 0.5 * Math.sin(w * Math.PI * 2);
    const s2 = 0.5 + 0.5 * Math.sin(w * Math.PI * 2 * 2.7 + 1.3);
    const broad = 0.5 + 0.5 * N.fbm(q / 40 + 3, 1.7, 2);
    let stripe = Math.pow(s1, 2) * 0.8 + Math.pow(s2, 3) * 0.2;
    stripe *= 0.55 + 0.9 * broad;
    const k = clamp(stripe * 0.62);
    const base = [mix(albedo[0], band[0], k), mix(albedo[1], band[1], k), mix(albedo[2], band[2], k)];
    // Shell is translucent: wrapped diffuse and a little ambient fill.
    const ndl = dot(n, LIGHT);
    const wrap = clamp((ndl + 0.45) / 1.45);
    const sky = 0.3 + 0.2 * n[2];
    const ndh = Math.max(0, dot(n, HALF));
    const gloss = 0.45 * Math.pow(ndh, 110) + 0.06 * Math.pow(ndh, 14);
    const rim = Math.pow(1 - n[2], 2.2);
    const ao = 1 - 0.18 * rim;
    return [0, 1, 2].map((c) => (base[c] * (wrap * 0.8 + sky * 0.46) * ao + gloss * spec[c] + 0.02 * rim * spec[c]));
  });
}

/**
 * Black slate stone (nachiguro style): matte, near-neutral, a very fine
 * mineral grain and a broad soft highlight rather than a glossy spot.
 */
export function blackStone(size, seed, { tint, sheen }) {
  const N = makeNoise(seed);
  const albedo = [0.0115 + tint[0], 0.012 + tint[1], 0.0128 + tint[2]];
  return render(size, (x, y) => {
    const n = normalAt(x, y);
    const gx = x * (size / 2);
    const gy = y * (size / 2);
    const grain = 1 + 0.12 * N.noise2(gx / 1.4, gy / 1.4) + 0.08 * N.fbm(gx / 9, gy / 9, 2);
    const ndl = Math.max(0, dot(n, LIGHT));
    const ndh = Math.max(0, dot(n, HALF));
    const sky = 0.25 + 0.2 * n[2];
    const soft = sheen * (0.022 * Math.pow(ndh, 10) + 0.03 * Math.pow(ndh, 60)) * (1 + 0.2 * N.noise2(gx / 3, gy / 3));
    const rim = Math.pow(1 - n[2], 2.5);
    return [0, 1, 2].map((c) => albedo[c] * grain * (ndl * 0.9 + sky) + soft + 0.05 * rim * (0.6 + 0.4 * Math.max(0, -n[0] * 0.6 - n[1] * 0.8)));
  });
}

export const WHITE_VARIANTS = [
  { angle: 0.35, spacing: 10, curve: 3.2 },
  { angle: 1.2, spacing: 8.5, curve: 4.5 },
  { angle: 2.1, spacing: 12, curve: 2.6 },
  { angle: 2.9, spacing: 9, curve: 6.0 },
  { angle: 3.9, spacing: 13, curve: 3.6 },
  { angle: 4.7, spacing: 9.5, curve: 2.4 },
  { angle: 5.5, spacing: 11, curve: 5.0 },
  { angle: 0.9, spacing: 7.5, curve: 3.0 },
];

export const BLACK_VARIANTS = [
  { tint: [0, 0, 0], sheen: 1 },
  { tint: [0.0012, 0.0006, 0], sheen: 0.85 },
  { tint: [0, 0.0005, 0.0018], sheen: 1.1 },
  { tint: [0.0006, 0.0006, 0.0006], sheen: 0.95 },
];
