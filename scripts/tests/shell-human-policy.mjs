/**
 * Shell: the JS ↔ native contract of `studio.katagoHumanPolicy` (v13,
 * docs/strength.md "your moves"). The fake host checks the payload the way
 * src/main.zig parsePolicyRequest does and answers with the exact reply the
 * Zig test "human policy replies are JSON the page reads" expects from
 * policyReply, so both sides are pinned to the same shapes.
 */
import { test, assert, Game, BLACK, WHITE } from "./helpers.mjs";

const PROFILE = /^(rank|preaz)_([1-9]|1[0-9]|20)k$|^(rank|preaz)_[1-9]d$/;
const VERTEX = /^[BW] ([A-HJ-T](1[0-9]|[1-9])|pass)$/;
// From the Zig test, byte for byte.
const NATIVE_REPLY =
  '{"ok":true,"id":"p7","engine":"human","moves":[{"index":10,"p":{"rank_20k":0.250000,"rank_3d":0.500000}},{"index":12,"p":{"rank_20k":0.000000,"rank_3d":1.000000}}],"truncated":false}';

function pairs(list) {
  const t = list.split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i < t.length; i += 2) out.push(`${t[i]} ${t[i + 1]}`);
  return out;
}

function nativeCheck(p) {
  assert.ok(Number.isInteger(p.size) && p.size >= 2 && p.size <= 19, "size");
  assert.ok(Number.isFinite(p.komi) && Math.floor(p.komi * 2) === p.komi * 2, "komi");
  assert.ok(["japanese", "chinese", "korean"].includes(p.rules), "rules");
  assert.ok(p.color === "B" || p.color === "W", "color");
  assert.ok(Array.isArray(p.profiles) && p.profiles.length >= 1 && p.profiles.length <= 8, "profiles");
  for (const pr of p.profiles) assert.match(pr, PROFILE);
  for (const m of pairs(p.moves)) assert.match(m, VERTEX);
  for (const m of pairs(p.setup)) assert.match(m, VERTEX);
  assert.match(p.id, /^[A-Za-z0-9._:-]{1,64}$/);
}

const { humanMoveProbabilities, canReadHumanPolicy } = await import("../../src/web/js/katago.js?human-policy");

await test("human policy: the page sends what the host validates and reads what the host replies", async () => {
  const sent = [];
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, async: true, stream: true, models: true, humanPolicy: true };
      if (command === "studio.katagoHumanPolicy") {
        nativeCheck(payload);
        sent.push(payload);
        return JSON.parse(NATIVE_REPLY);
      }
      throw new Error("unexpected " + command);
    },
  };
  try {
    assert.equal(await canReadHumanPolicy(), true);
    const g = new Game({ size: 9, rules: "chinese" });
    for (const [x, y] of [[4, 4], [2, 2], [6, 6], [2, 6]]) g.play(x, y);
    const rows = await humanMoveProbabilities(g, WHITE, ["rank_20k", "rank_3d"]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].color, "W");
    assert.equal(sent[0].moves, "B E5 W C7 B G3 W C3");
    assert.deepEqual(sent[0].profiles, ["rank_20k", "rank_3d"]);
    assert.deepEqual(rows, [
      { index: 10, p: { rank_20k: 0.25, rank_3d: 0.5 } },
      { index: 12, p: { rank_20k: 0, rank_3d: 1 } },
    ]);
    // A host error or cancellation reads as "no reading".
    globalThis.zero.invoke = async (command) =>
      command === "studio.katagoStatus" ? { available: true, async: true, humanPolicy: true } : { ok: false, id: "p1", error: "ModelMissing" };
    assert.equal(await humanMoveProbabilities(g, BLACK, ["rank_10k"]), null);
  } finally {
    delete globalThis.zero;
  }
});

await test("human policy: an abort cancels the host's work by the request's id", async () => {
  const calls = [];
  let answer;
  globalThis.zero = {
    on: () => () => {},
    invoke: (command, payload) => {
      calls.push({ command, payload });
      if (command === "studio.katagoStatus") return Promise.resolve({ available: true, async: true, humanPolicy: true });
      if (command === "studio.katagoHumanPolicy") return new Promise((r) => (answer = r));
      return Promise.resolve({ ok: true, cancelled: 1 });
    },
  };
  try {
    const ac = new AbortController();
    const g = new Game({ size: 9 });
    g.play(4, 4);
    const pending = humanMoveProbabilities(g, BLACK, ["rank_10k"], { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 0));
    const req = calls.find((c) => c.command === "studio.katagoHumanPolicy");
    assert.ok(req, "asked");
    ac.abort();
    const cancel = calls.find((c) => c.command === "studio.katagoCancel");
    assert.deepEqual(cancel.payload, { id: req.payload.id });
    answer({ ok: false, id: req.payload.id, cancelled: true });
    assert.equal(await pending, null);
  } finally {
    delete globalThis.zero;
  }
});
