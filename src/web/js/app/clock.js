/**
 * Game clocks. Pure state transitions; the controller ticks them.
 *
 * Modes:
 *   none      — no clock
 *   move30    — 30 seconds for every move (sudden death per move)
 *   byoyomi   — main time, then N periods of P seconds (Japanese byo-yomi)
 */
const TIME_CONTROLS = {
  none: null,
  move30: { main: 0, periods: 1, period: 30, perMove: true },
  byoyomi: { main: 600, periods: 3, period: 30, perMove: false },
};

export function newClock(mode) {
  const tc = TIME_CONTROLS[mode];
  if (!tc) return null;
  const side = () => ({ main: tc.main, periods: tc.periods, left: tc.perMove ? tc.period : tc.main > 0 ? tc.main : tc.period, inByo: tc.main === 0 });
  return { mode, b: side(), w: side(), running: null };
}

/** Advance the clock of `color` (1 black, -1 white) by `dt` seconds. */
export function tick(clock, color, dt) {
  if (!clock) return { clock, flagged: false };
  const tc = TIME_CONTROLS[clock.mode];
  const key = color > 0 ? "b" : "w";
  const s = { ...clock[key] };
  s.left -= dt;
  let flagged = false;
  while (s.left <= 0 && !flagged) {
    if (!s.inByo && s.main > 0) {
      s.inByo = true;
      s.left += tc.period;
    } else if (s.periods > 1 && !tc.perMove) {
      s.periods -= 1;
      s.left += tc.period;
    } else {
      s.left = 0;
      flagged = true;
    }
  }
  return { clock: { ...clock, [key]: s }, flagged };
}

/** A move was made by `color`: reset the per-move or byo-yomi period. */
export function moveMade(clock, color) {
  if (!clock) return clock;
  const tc = TIME_CONTROLS[clock.mode];
  const key = color > 0 ? "b" : "w";
  const s = { ...clock[key] };
  if (tc.perMove || s.inByo) s.left = tc.period;
  return { ...clock, [key]: s };
}

export function formatClock(side) {
  if (!side) return "";
  const t = Math.max(0, Math.ceil(side.left));
  const m = Math.floor(t / 60);
  const sec = String(t % 60).padStart(2, "0");
  return `${m}:${sec}`;
}
