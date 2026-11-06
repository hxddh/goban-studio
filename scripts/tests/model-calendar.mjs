/**
 * Model: the calendar the week's focus is kept by.
 */
import { test, assert } from "./helpers.mjs";
import { weekStart } from "../../src/web/js/model/player.js";

await test("model calendar: the week begins on Monday at 00:00 local time", () => {
  const now = new Date(2026, 10, 4, 15, 0); // Wednesday
  const mon = weekStart(now);
  assert.equal(new Date(mon).getDay(), 1);
  assert.equal(new Date(mon).getHours(), 0);
  assert.equal(weekStart(new Date(mon)), mon);
});
