/**
 * Screenshot tour for the packaged apps (v4 release checks).
 *
 * `scripts/tour-app.mjs` launches a packaged build with GOBAN_TOUR_OUT set.
 * The host reports that path through `studio.selftest` ({tour}), and the
 * page walks through its main screens with the app's own controller:
 *
 *   today → a 19×19 game → its review → Practice → Settings
 *
 * For each screen it writes `{step, name, total}` to the tour path and
 * waits until the script has captured the window and written the same
 * step number to `<path>.ack`. The script compares the OS screenshots
 * (non-blank, each different from the one before). Nothing here runs in
 * a normal launch.
 */
import * as C from "./app/controller.js";
import { state, update } from "./app/store.js";
import { readTextFile, selftestConfig, writeTextFile } from "./host.js";

const SETTLE_MS = 1500;
const ACK_TIMEOUT_MS = 60000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A short, legal 19×19 opening so the board is not empty. */
const OPENING = [
  [15, 3], [3, 15], [16, 15], [2, 3], [13, 16], [15, 9], [9, 2], [3, 9],
  [16, 6], [5, 2], [9, 16], [16, 12],
];

export const STEPS = [
  {
    name: "play",
    go: () => C.playHome(),
  },
  {
    name: "game19",
    go: () => {
      C.newGame({ size: 19, opponent: "human", handicap: 0, timeControl: "none" });
      const g = state.game.game;
      for (const [x, y] of OPENING) if (g.canPlay(x, y).ok) g.play(x, y);
      C.persistCurrent();
      update();
    },
  },
  {
    name: "review",
    go: () => C.reviewCurrentGame(),
  },
  {
    name: "learn",
    go: () => C.goSpace("learn"),
  },
  {
    name: "settings",
    go: () => C.openSheet("settings"),
  },
];

async function waitForAck(path, step) {
  const deadline = Date.now() + ACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = await readTextFile(path + ".ack");
    if (text != null && Number(text.trim()) >= step) return true;
    await sleep(200);
  }
  return false;
}

export async function runTour(cfg = null) {
  const config = cfg || (await selftestConfig());
  const path = config?.tour;
  if (!path) return;
  // A fresh profile opens on the onboarding sheet; the tour is about the
  // places behind it.
  if (!state.settings.onboarded) C.setSetting("onboarded", true);
  update({ sheet: null });
  for (let i = 0; i < STEPS.length; i++) {
    const step = i + 1;
    const { name, go } = STEPS[i];
    let error = null;
    try {
      go();
    } catch (e) {
      error = String(e?.message || e);
    }
    await sleep(SETTLE_MS);
    await writeTextFile(path, JSON.stringify({ step, name, total: STEPS.length, space: state.space, sheet: state.sheet?.kind ?? null, review: !!state.review, error }));
    if (!(await waitForAck(path, step))) break;
  }
  await writeTextFile(path, JSON.stringify({ step: STEPS.length + 1, name: "done", total: STEPS.length, done: true }));
}
