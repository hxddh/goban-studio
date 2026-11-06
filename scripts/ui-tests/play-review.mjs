/**
 * Play: the post-game review in the browser — a game that ends turns into
 * its review on the same board; a key moment tried again, judged by a fake
 * KataGo host, is a drill in the player model; a game from the history
 * opens in the same review, its stored analysis at once; older games are
 * analysed by themselves; the offline estimate stays honest; and the new
 * views in four languages, light and dark, larger text, with the audit.
 * Loaded by scripts/ui-test.mjs before the visual baselines; receives its
 * helpers (check, assert, fresh, onboard, clickPoint, pointOf, origin,
 * browser, audit).
 */

/**
 * A KataGo host in the page, with a file store in memory (window.__files).
 * On 9×9 the position after k moves has Black's lead 0.5, and 6.5 points
 * less once Black's 5th move is on the board (k ≥ 5): that move is the one
 * key mistake. KataGo's best move is the first empty point of the first
 * line (A1, B1 …), the second candidate the next one, a point worse. (The
 * computer may play them: it picks among the candidates like a person.) The computer plays the first empty point near the
 * centre.
 */
function reviewHost() {
  const L = "ABCDEFGHJKLMNOPQRST";
  window.__files = {};
  window.__judged = 0;
  const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const enc = (text) => {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return { b64: btoa(s), size: bytes.length };
  };
  window.zero = {
    on: () => () => {},
    invoke: async (command, p) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo (test)", async: true, stream: true };
      if (command === "studio.katagoCancel") return { ok: true };
      if (command === "studio.storeList") return Object.keys(window.__files).filter((k) => k.startsWith(p.prefix || ""));
      if (command === "studio.storeRead") return window.__files[p.key] == null ? null : enc(window.__files[p.key]);
      if (command === "studio.storeWrite") {
        window.__files[p.key] = (p.offset ? window.__files[p.key] || "" : "") + dec(p.b64);
        return { ok: true };
      }
      if (command === "studio.storeRemove") {
        delete window.__files[p.key];
        return { ok: true };
      }
      if (command === "studio.katagoAnalyzeAsync") {
        const words = (p.moves || "").split(/\s+/).filter(Boolean);
        const taken = new Set(words.filter((w, i) => i % 2 === 1));
        const k = words.length / 2;
        if (p.visits >= 240) window.__judged++;
        let v = "pass";
        for (const y of [4, 3, 5, 2, 6]) {
          for (let x = 2; x < p.size - 2; x++) {
            const tt = L[x] + (p.size - y);
            if (!taken.has(tt)) {
              v = tt;
              break;
            }
          }
          if (v !== "pass") break;
        }
        const lead = 0.5 - (k >= 5 ? 6.5 : 0);
        const second = k % 2 === 0 ? lead - 1 : lead + 1;
        const wr = (l) => 1 / (1 + Math.exp(-l / 8));
        const own = Array(p.size * p.size).fill("0").join(" ");
        const row = [...L.slice(0, p.size)].map((c) => c + "1").filter((v) => !taken.has(v));
        const [a, b] = row;
        const info = `info move ${a} visits ${p.visits} winrate ${wr(lead)} scoreLead ${lead} order 0 pv ${a} info move ${b} visits ${Math.max(1, p.visits >> 2)} winrate ${wr(second)} scoreLead ${second} order 1 pv ${b} ownership ${own}`;
        return { ok: true, id: p.id, play: v, info };
      }
      return null;
    },
  };
}

export default async function ({ check, assert, fresh, onboard, clickPoint, audit }) {
  /** A 9×9 game against the computer (Black), `n` moves of yours, then resigned: the board becomes its review. */
  async function playAndResign(page, n = 4) {
    // No teaching pause: the fake makes Black's third move a big mistake on purpose.
    await page.evaluate(() => (window.__state.settings = { ...window.__state.settings, teaching: false }));
    // The new game, not the one onboarding opened (same size, same board canvas).
    const was = await page.evaluate(() => window.__state.game?.owner);
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction((was) => window.__state.game?.owner !== was && window.__board?.model.size === 9 && window.__board.geom?.cell > 30 && window.__state.game.opponent === "ai", was);
    const mine = [[2, 2], [6, 6], [6, 2], [2, 6], [5, 3]];
    for (let i = 0; i < n; i++) {
      await page.waitForFunction((m) => window.__state.game.game.moveNumber === m && !window.__state.game.thinking, i * 2, { timeout: 15000 }); // the reply is paced like a person (feel.js thinkTime, up to a few seconds)
      await clickPoint(page, ...mine[i]);
    }
    await page.waitForFunction((m) => window.__state.game.game.moveNumber === m && !window.__state.game.thinking, n * 2, { timeout: 15000 });
    await page.click(".panel .menu-wrap > button");
    await page.click(".menu [role=menuitem].danger");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForSelector(".review-layer .review-result");
  }
  /** Wait for KataGo's verdict on the try; on a timeout, say where the try stood. */
  async function verdict(page, status) {
    try {
      await page.waitForFunction((s) => window.__state.review.trial?.status === s, status, { timeout: 5000 });
    } catch (_) {
      const at = await page.evaluate(() => {
        const tr = window.__state.review?.trial;
        return tr && { status: tr.status, tried: tr.tried, loss: tr.loss, before: !!tr.before, index: tr.index, board: tr.pos.current.board.signMap.map((r) => r.map((v) => (v > 0 ? "X" : v < 0 ? "O" : ".")).join("")), toasts: window.__state.toasts.map((x) => x.message) };
      });
      throw new Error(`no "${status}" verdict: ${JSON.stringify(at)}`);
    }
  }
  const analysed = (page) => page.waitForFunction(() => window.__state.review && !window.__state.review.analyzing && !window.__state.review.refining, null, { timeout: 15000 });

  await check("play review: a game that ends turns into its review on the same board, with the result, the phases and the key moment", async () => {
    const page = await fresh();
    await page.addInitScript(reviewHost);
    await onboard(page, 1);
    await page.waitForFunction(() => window.__state.engine?.available === true, null, { timeout: 3000 });
    const before = await page.evaluate(() => window.__state.space + "/" + window.__state.play.view);
    await playAndResign(page, 4);
    const s = await page.evaluate(() => ({ space: window.__state.space, view: window.__state.play.view, source: window.__state.review.source, inPlace: window.__state.review.meta.inPlace, report: "report" in window.__state }));
    assert(s.space === "play" && s.view === "game" && s.source === "current" && s.inPlace, `not in place: ${JSON.stringify(s)} (was ${before})`);
    assert(!s.report, "a report state");
    assert((await page.locator(".report, .result-card").count()) === 0, "a report page or a result card");
    await analysed(page);
    const out = await page.evaluate(() => ({
      result: document.querySelector(".review-result").innerText,
      moments: [...document.querySelectorAll(".key-moves .key-move")].length,
      tabs: [...document.querySelectorAll(".review-tabs button")].map((b) => b.textContent),
      tryBtn: document.querySelectorAll(".key-move .try-again").length,
      primaries: [...document.querySelectorAll(".btn.primary")].filter((el) => el.offsetParent !== null).map((b) => b.textContent.trim()),
      tools: [...document.querySelectorAll(".toolbar .icon-btn")].map((b) => b.getAttribute("aria-label")),
    }));
    assert(/You lost/.test(out.result) && /Japanese rules/.test(out.result), `result line: ${out.result}`);
    assert(out.moments === 1, `${out.moments} key moments`);
    assert(out.tabs.join() === "Analysis,Summary,Notes", `tabs ${out.tabs}`);
    assert(out.tryBtn === 1, "Try again on the key moment");
    assert(out.primaries.length === 1 && out.primaries[0] === "New game", `primary: ${out.primaries}`);
    assert(out.tools.includes("Export image") && out.tools.includes("Export SGF"), `tools: ${out.tools}`);
    // The analysis and its review are in the game's file, once (the store writes a moment later).
    await page.waitForFunction(() => Object.entries(window.__files).some(([k, v]) => k.startsWith("games/") && JSON.parse(v).analysis), null, { timeout: 3000 });
    const file = await page.evaluate(() => {
      const k = Object.keys(window.__files).find((x) => x.startsWith("games/"));
      return JSON.parse(window.__files[k]);
    });
    assert(Array.isArray(file.analysis) && file.analysis.length === file.review.moves + 1, "the analysis in the file");
    assert(file.review.confidence === "high" && file.review.moments.map((m) => m.index).join() === "5", `review ${JSON.stringify(file.review.moments)}`);
    // The Summary tab: the three phases, from KataGo.
    await page.click(".review-tabs button >> nth=1");
    assert((await page.locator(".game-summary .phase-table tbody tr").count()) >= 1, "phase rows");
    await page.click(".review-tabs button >> nth=0");
    // Esc: Play's home; the history row opens the same review again.
    await page.keyboard.press("Escape");
    await page.waitForSelector(".play-home .game-row");
    await page.click(".play-home .game-row");
    await page.waitForSelector(".review-layer .review-result");
    assert(await page.evaluate(() => window.__state.review.source === "record" && !window.__state.review.analyzing && window.__state.review.model.confidence === "high"), "the stored analysis, at once");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("play review: try again from the position — KataGo judges on the board, a miss shows its move, each try is a drill", async () => {
    const page = await fresh();
    await page.addInitScript(reviewHost);
    await onboard(page, 1);
    await page.waitForFunction(() => window.__state.engine?.available === true, null, { timeout: 3000 });
    await playAndResign(page, 4);
    await analysed(page);
    await page.click(".key-move .try-again");
    await page.waitForSelector(".try-card");
    const at = await page.evaluate(() => {
      const r = window.__state.review;
      return { index: r.trial.index, cur: r.game.mainLine().findIndex((n) => n === r.game.current), moves: r.game.mainLine().length };
    });
    assert(at.index === 5 && at.cur === 4, `the position before the mistake: ${JSON.stringify(at)}`);
    assert((await page.textContent(".try-card")).includes("Black to play"), "the prompt");
    // A move KataGo did not list: it looks at the position after it — 6.5 points lost.
    await page.waitForFunction(() => window.__state.review.trial.before);
    await clickPoint(page, 8, 0);
    await verdict(page, "bad");
    // The board shows KataGo's move once the verdict is drawn.
    const best = await page.evaluate(() => window.__state.review.trial.best);
    const bestLabel = "ABCDEFGHJ"[best.x] + (9 - best.y);
    assert(best.y === 8, `KataGo's move on the first line: ${JSON.stringify(best)}`);
    await page.waitForFunction((b) => window.__board.model.marks.some((m) => m.x === b.x && m.y === b.y && m.tone === "good"), best, { timeout: 3000 });
    const bad = await page.evaluate(() => ({ text: document.querySelector(".try-card").innerText, marks: window.__board.model.marks, judged: window.__judged }));
    assert(/loses about 6\.5 points/.test(bad.text) && bad.text.includes(bestLabel), `verdict: ${bad.text}`);
    assert(bad.marks.some((m) => m.x === best.x && m.y === best.y && m.tone === "good"), "KataGo's move on the board");
    assert(bad.judged >= 1, "a search of the position after the try");
    // Try again: KataGo's own move is good.
    await page.click(".try-card .btn >> nth=0");
    await page.waitForFunction(() => window.__state.review.trial.status === "open" && window.__board.model.interactive && !window.__board.model.variation);
    await clickPoint(page, best.x, best.y);
    await verdict(page, "good");
    assert((await page.textContent(".try-card")).includes("Good move"), "the good verdict");
    // Both tries are in the player model, as one drill of this game.
    const drill = await page.evaluate(() => window.__state.profile.mistakes.find((m) => m.index === 5));
    assert(drill && drill.tries === 2 && drill.streak === 1 && drill.solved, `drill ${JSON.stringify(drill && { tries: drill.tries, streak: drill.streak })}`);
    const kept = await page.evaluate(() => JSON.parse(window.__files["profile.json"] || "{}").mistakes?.find((m) => m.index === 5)?.tries);
    await page.waitForFunction(() => JSON.parse(window.__files["profile.json"] || "{}").mistakes?.some((m) => m.index === 5 && m.tries === 2), null, { timeout: 3000 });
    void kept;
    // The game itself is untouched; Done goes back to the review.
    assert(await page.evaluate((n) => window.__state.review.game.mainLine().length === n, at.moves), "a try became a move of the game");
    await page.click(".try-card .btn >> nth=-1");
    await page.waitForSelector(".try-card", { state: "detached" });
    assert(await page.evaluate(() => !window.__state.review.trial && window.__state.review.focus === 5), "back to the moment");
    // Missed once more: the moment comes back in Learn's path, as a review due the next day.
    await page.click(".key-move .try-again");
    await page.waitForFunction(() => window.__state.review.trial?.before && window.__board.model.interactive);
    await clickPoint(page, 8, 0);
    await verdict(page, "bad");
    // Today the miss put it on tomorrow's list (the game had made it a drill due at once).
    await page.keyboard.press("Control+2");
    await page.waitForSelector(".learn-path .path-row");
    assert((await page.locator(".learn-path .path-row[data-kind=mistake]").count()) === 0, "due before tomorrow");
    await page.evaluate(() => {
      const real = Date.now.bind(Date);
      Date.now = () => real() + 26 * 3600 * 1000;
    });
    await page.keyboard.press("Control+1");
    await page.keyboard.press("Control+2");
    await page.waitForSelector(".learn-path .path-row");
    const rows = await page.locator(".learn-path .path-row[data-kind=mistake]").allInnerTexts();
    assert(rows.some((r) => r.includes("Due for review") && /\b5\b/.test(r)), `Learn's path: ${rows.join(" | ") || "no mistake row"}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("play review: the offline estimate shows turning points only — no phase numbers, no loss, no better move, no Try again", async () => {
    const page = await fresh();
    await onboard(page, 1);
    // A two-player 9×9 game to the count: its review comes up in place.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__board?.model.size === 9 && window.__board.geom?.cell > 30);
    const pts = [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4], [4, 2], [2, 4], [6, 4], [4, 6], [3, 3], [5, 5], [3, 5]];
    for (let i = 0; i < pts.length; i++) {
      await clickPoint(page, ...pts[i]);
      await page.waitForFunction((n) => window.__state.game?.game.moveNumber === n, i + 1, { timeout: 3000 });
    }
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("Control+Shift+P");
      await page.click(".sheet-foot .btn.primary");
    }
    await page.waitForSelector(".score-card");
    await page.click(".score-card .btn.primary");
    await page.waitForSelector(".review-layer .review-result");
    await analysed(page);
    const out = await page.evaluate(() => ({
      model: window.__state.review.model,
      tabs: [...document.querySelectorAll(".review-tabs button")].map((b) => b.textContent),
      text: document.querySelector(".review-panel").innerText,
    }));
    assert(out.model.confidence === "low" && out.model.phases === null, "an estimate, without phases");
    assert(out.model.moments.every((m) => m.best === null && m.loss === null), "no better move, no loss");
    assert(!out.tabs.includes("Summary"), `tabs ${out.tabs}`);
    assert((await page.locator(".phase-table, .try-again").count()) === 0, "a phase table or Try again");
    assert(!/Better|points lost|≈ \d/.test(out.text), `numbers from the estimate: ${out.text}`);
    assert(/Offline estimate/.test(out.text), "the estimate says what it is");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  /** `n` finished two-player 19×19 games of `moves` moves, written straight into the preview's store (one file each). */
  async function seed(page, n, moves) {
    await page.evaluate(
      ({ n, moves }) => {
        const L = "abcdefghijklmnopqrs";
        for (let k = 0; k < n; k++) {
          let sgf = "(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]RE[B+R]";
          let i = 0;
          for (let y = 0; y < 19 && i < moves; y += 2) for (let x = 0; x < 19 && i < moves; x++, i++) sgf += `;${i % 2 ? "W" : "B"}[${L[x]}${L[y]}]`;
          sgf += ")";
          const at = Date.now() - k * 60000;
          const g = { id: "seed-" + k, createdAt: at, updatedAt: at, finishedAt: at, source: "game", sgf, meta: { opponent: "human", size: 19, moves, result: "B+R", name: "Seed " + k, thumb: "" } };
          localStorage.setItem(`goban9:games/${g.id}.json`, JSON.stringify(g));
        }
      },
      { n, moves },
    );
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
  }

  await check("play review: older games are analysed by themselves, quietly; each file keeps its analysis; a history game opens at once", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 14, 150);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".game-row");
    assert((await page.locator(".game-row").count()) === 8, "a compact list: the first eight");
    assert((await page.locator(".play-home .filters").count()) === 1, "filters once the list is long");
    await page.click(".play-home .show-all");
    assert((await page.locator(".game-row").count()) === 14, "then all of them");
    await page.evaluate(() => window.__autoAnalyse());
    await page.waitForFunction(() => window.__state.batch && window.__state.batch.total === 14);
    await page.waitForSelector(".game-row .row-analysis", { timeout: 5000 });
    const notes = await page.locator(".game-row .row-analysis").allTextContents();
    assert(notes.length === 1 && /Analysing… \d+%/.test(notes[0]), `only the game being analysed says so: ${notes.join(" | ")}`);
    await page.close();

    const p2 = await fresh();
    await onboard(p2, 1);
    await seed(p2, 3, 30);
    await p2.keyboard.press("Control+1");
    await p2.evaluate(() => window.__autoAnalyse());
    await p2.waitForFunction(
      () => window.__state.batch === null && Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).every((k) => { const g = JSON.parse(localStorage.getItem(k)); return g.review && g.analysis?.length === 31; }),
      null,
      { timeout: 20000 },
    );
    assert((await p2.evaluate(() => localStorage.getItem("goban9:batch.json"))) === null, "the finished pass leaves nothing to resume");
    const t0 = Date.now();
    await p2.click(".game-row >> nth=0");
    await p2.waitForSelector(".review-layer .chart");
    const ms = Date.now() - t0;
    assert(await p2.evaluate(() => !window.__state.review.analyzing && window.__state.review.analyzed === 31), "opened with its stored analysis");
    // Two people: the review describes both sides; the estimate's moments keep their words.
    assert(await p2.evaluate(() => window.__state.review.model.players.length === 2), "both sides");
    assert(p2.errors.length === 0, p2.errors.join("; "));
    await p2.close();
    return `opened in ${ms} ms`;
  });

  // The new views in four languages, light and dark, with larger text.
  const combos = [
    { locale: "zh-CN", scheme: "dark", large: true },
    { locale: "en-US", scheme: "light", large: false },
    { locale: "ko-KR", scheme: "light", large: true },
    { locale: "ja-JP", scheme: "dark", large: false },
  ];
  for (const c of combos) {
    await check(`play review: the post-game review, try again and Play's home in ${c.locale}, ${c.scheme}${c.large ? ", larger text" : ""} — audit, no raw keys, no clipping, one primary`, async () => {
      const page = await fresh(c.locale);
      await page.addInitScript(reviewHost);
      await page.emulateMedia({ colorScheme: c.scheme });
      await onboard(page, 1);
      await page.waitForFunction(() => window.__state.engine?.available === true, null, { timeout: 3000 });
      if (c.large) await page.keyboard.press("Control+Equal");
      const { MESSAGES } = await import("../../src/web/js/messages.js");
      const keys = Object.keys(MESSAGES);
      const inspect = async (where) => {
        await page.waitForTimeout(60);
        await audit(page, where);
        const bad = await page.evaluate((keys) => {
          const set = new Set(keys);
          const raw = [...new Set(document.body.innerText.match(/\b[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){1,3}\b/g) || [])].filter((s) => set.has(s));
          const clipped = [...document.querySelectorAll(".btn, .chip, .segmented button, .key-head, .seg-mini button")].filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
          const primaries = [...document.querySelectorAll(".btn.primary")].filter((el) => el.offsetParent !== null).length;
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          return { raw, clipped, primaries, overflow };
        }, keys);
        assert(!bad.raw.length, `${where}: raw keys ${bad.raw.join(", ")}`);
        assert(!bad.clipped.length, `${where}: clipped ${bad.clipped.join(" | ")}`);
        assert(bad.primaries <= 1, `${where}: ${bad.primaries} primary buttons`);
        assert(!bad.overflow, `${where}: the page scrolls sideways`);
      };
      await page.keyboard.press("Control+1");
      await inspect("Play's home");
      await playAndResign(page, 4);
      await analysed(page);
      for (let i = 0; i < 3; i++) {
        await page.click(`.review-tabs button >> nth=${i}`);
        await inspect(`post-game review, tab ${i + 1}`);
      }
      await page.click(".review-tabs button >> nth=0");
      await page.click(".key-move .try-again");
      await page.waitForSelector(".try-card");
      await inspect("try again");
      await page.waitForFunction(() => window.__state.review.trial.before);
      await clickPoint(page, 8, 0);
      await verdict(page, "bad");
      await inspect("try again, missed");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".try-card", { state: "detached" });
      await page.keyboard.press("Escape");
      await page.waitForSelector(".play-home .game-row");
      await inspect("Play's home with a game in the history");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    });
  }
}
