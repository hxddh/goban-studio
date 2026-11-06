/**
 * Play: the clocks.
 */
import { test, assert, formatClock, moveMade, newClock, tick } from "./helpers.mjs";

await test("per-move clock flags after 30 seconds and resets after a move", () => {
  let c = newClock("move30");
  let r = tick(c, 1, 29);
  assert.equal(r.flagged, false);
  c = moveMade(r.clock, 1);
  assert.equal(c.b.left, 30);
  r = tick(c, 1, 30.5);
  assert.equal(r.flagged, true);
  assert.equal(newClock("none"), null);
});

await test("byo-yomi uses main time, then periods, then flags", () => {
  let c = newClock("byoyomi");
  let r = tick(c, -1, 600);
  assert.equal(r.flagged, false);
  assert.equal(r.clock.w.inByo, true);
  r = tick(r.clock, -1, 31); // one period used
  assert.equal(r.clock.w.periods, 2);
  r = tick(r.clock, -1, 61);
  assert.equal(r.flagged, true);
  assert.equal(formatClock({ left: 75 }), "1:15");
});
