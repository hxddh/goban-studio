/**
 * Small pure helpers the model's parts share: reading numbers and objects
 * out of stored JSON, rounding, and local days.
 */


export const DAY = 86400000;
export const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
export const finite = (v) => typeof v === "number" && Number.isFinite(v);

export const num = (v, d = null) => (v !== null && v !== "" && v !== undefined && typeof v !== "boolean" && Number.isFinite(Number(v)) ? Number(v) : d);
export const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/* ============================================================ Practice's path */

export function dayKey(now) {
  const d = new Date(now);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Days kept in profile.days (a little over a year). */
export const MAX_DAYS_KEPT = 400;

/** profile.days with one more thing done on the local day of `at`. */
export function countDay(days, at) {
  if (!finite(at) || at <= 0) return days || {};
  const k = String(dayKey(at));
  return trimDays({ ...(days || {}), [k]: ((days || {})[k] || 0) + 1 });
}

export function trimDays(days) {
  const keys = Object.keys(days);
  if (keys.length <= MAX_DAYS_KEPT) return days;
  return Object.fromEntries(keys.sort().slice(-MAX_DAYS_KEPT).map((k) => [k, days[k]]));
}
