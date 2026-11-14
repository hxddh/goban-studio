/**
 * Core: KataGo's status is not cached as "unavailable" for good. A status call that failed, or a
 * KataGo not ready yet, is asked again after a wait that doubles; once KataGo answers, that is
 * kept for the session.
 *
 * A fake native host stands in for KataGo (this file has a process of its own).
 */
import { test, assert } from "./helpers.mjs";
import * as KataGo from "../../src/web/js/katago.js";
import * as Engine from "../../src/web/js/engine.js";

let asked = 0;
/** What the host answers: "throw", "unavailable" or "available". */
let answer = "throw";
globalThis.zero = {
  on() {},
  invoke(cmd) {
    if (cmd !== "studio.katagoStatus") return Promise.resolve(null);
    asked++;
    if (answer === "throw") return Promise.reject(new Error("not yet"));
    return Promise.resolve({ available: answer === "available", async: true, stream: true, models: true, version: "fake" });
  },
};

await test("engine status: \"unavailable\" is asked again with a growing wait, and an answer is kept", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    assert.equal((await KataGo.status()).available, false);
    assert.equal(asked, 1);
    const info = await Engine.info();
    assert.equal(info.available, false);
    assert.equal(asked, 1, "not asked again at once");
    assert.equal(info.retryAt, now + KataGo.STATUS_RETRY_MS);
    // KataGo still starting: unavailable again, and the wait doubles.
    answer = "unavailable";
    now += KataGo.STATUS_RETRY_MS - 1;
    assert.equal((await KataGo.status()).available, false);
    assert.equal(asked, 1);
    now += 1;
    assert.equal((await KataGo.status()).available, false);
    assert.equal(asked, 2);
    assert.equal(KataGo.statusRetryAt(), now + 2 * KataGo.STATUS_RETRY_MS);
    // Now it is there: found at the next check, and kept.
    answer = "available";
    now += 2 * KataGo.STATUS_RETRY_MS;
    assert.equal((await Engine.info()).available, true);
    assert.equal(asked, 3);
    assert.equal(KataGo.statusRetryAt(), null);
    answer = "throw";
    now += 10 * KataGo.STATUS_RETRY_MAX_MS;
    assert.equal((await KataGo.status()).available, true);
    assert.equal(asked, 3, "an available engine is not asked again");
  } finally {
    Date.now = realNow;
  }
});
