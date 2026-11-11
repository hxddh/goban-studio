/**
 * The review over any game, which is also the post-game review the board
 * turns into when a game ends (docs/v9.md, "Two spaces → Play"): the
 * result, the balance chart, the three phases when KataGo analysed the
 * game, the key moments with their stories, trying a moment again,
 * comments and variations. v13: out of play.jsx.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BLACK, WHITE, coordLabel, formatPoints } from "../rules.js";
import { areaOf } from "../engine.js";
import { t, tn } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { storyText } from "./story.js";
import { Board, Button, Icon, IconButton, MoreMenu, Segmented, Stone, Thumb, MOD, SHIFT } from "./parts.jsx";
import { ScoreCard } from "./score-card.jsx";
import { BLUNDER, MISTAKE } from "./summary.js";
import { accuracyText, lossText, momentWords, ratingChangeText, reviewFacts, reviewHeadline } from "../play/review-image.js";
import { Toolbar } from "./chrome.jsx";
import { BookExitNote } from "./explorer.jsx";
import { classicYear, colorName, moveNumbers } from "./game-view.js";
import { rankText } from "./estimate-label.js";

export function ReviewView() {
  const s = state;
  const r = s.review;
  const game = r.game;
  const node = game.current;
  const marks = [];
  // Marks recorded on this move (SGF TR/SQ/CR/MA/LB).
  if (!r.variation) for (const mk of node.marks || []) marks.push({ x: mk.x, y: mk.y, type: mk.type, label: mk.text });
  const focusKm = r.focus != null ? r.keyMoves.find((k) => k.index === r.focus) : null;
  if (focusKm?.source && r.variation) for (const p of focusKm.source.points) marks.push({ ...p, type: "area", tone: "bad" });
  if (r.variation) {
    const km = r.keyMoves.find((k) => k.index === r.variation.index);
    if (km?.best && !km.best.pass && r.variation.kind === "played") marks.push({ ...km.best, type: "circle", tone: "good" });
  }
  // Live candidates on the board (not while a line is shown).
  const live = r.live && r.live.nodeId === node.id ? r.live : null;
  if (live && !r.variation) {
    const total = live.moves.reduce((a, m) => a + (m.visits || 0), 0) || 1;
    live.moves
      .filter((m) => !m.pass && (m.visits || 0) / total >= 0.03)
      .slice(0, 5)
      .forEach((m, i) => {
        const wr = node.turn === BLACK ? m.winrate : 1 - m.winrate;
        marks.push({ x: m.x, y: m.y, type: "candidate", rank: i, label: String(Math.round(wr * 100)) });
      });
  }
  // A story step hides the stones its moves have captured.
  let board = node.board.signMap;
  let varMoves = r.variation ? r.variation.moves : null;
  if (r.variation?.story) {
    const km = r.keyMoves.find((k) => k.index === r.variation.index);
    const steps = (km?.story?.[r.variation.kind] || []).slice(0, r.variation.step + 1);
    const gone = new Set(steps.flatMap((st) => (st.captured || []).map((p) => p.x + "," + p.y)));
    if (gone.size) {
      board = board.map((row, y) => row.map((v, x) => (gone.has(x + "," + y) ? 0 : v)));
      // A stone of the line itself can be captured later in the line.
      const lastAt = new Map();
      varMoves.forEach((m, i) => lastAt.set(m.x + "," + m.y, i));
      varMoves = varMoves.filter((m, i) => lastAt.get(m.x + "," + m.y) === i && !steps.slice(m.n).some((st) => (st.captured || []).some((p) => p.x === m.x && p.y === m.y)));
    }
  }
  const rc = r.recount;
  // Counting again: the final position with the count on it, and nothing else.
  if (rc) marks.length = 0;
  const tr = r.trial;
  if (tr) {
    // Trying a moment again: the position before it, the move tried, and
    // KataGo's better move once the try is judged a mistake.
    marks.length = 0;
    varMoves = tr.tried ? [{ ...tr.tried, c: tr.color, n: 1 }] : null;
    if (tr.status === "bad" && tr.best) marks.push({ ...tr.best, type: "circle", tone: "good" });
  }
  const model = {
    size: game.size,
    board,
    lastMove: tr || rc ? null : node.move,
    marks,
    ownership: tr || rc ? null : C.reviewOwnershipMap(),
    territory: rc ? rc.score.territory : null,
    deadStones: rc ? rc.dead : [],
    variation: rc ? null : varMoves,
    moveNumbers: r.variation || tr || rc ? null : moveNumbers(game),
    showCoords: s.settings.coords,
    view: null,
    hoverColor: rc ? null : tr ? tr.color : game.turn,
    interactive: !tr || tr.status === "open",
  };
  const h = reviewHeading(r);
  return (
    <>
      <Toolbar crumbs={h.crumbs} title={h.title} sub={h.sub}>
        <ReviewTools />
      </Toolbar>
      <div class="workspace review-layer">
        <section class="stage" aria-label={t("review.title")}>
          <Board model={model} onPlay={C.reviewPlay} />
          <ReviewNav />
        </section>
        {r.meta.free ? <FreeBoardPanel /> : <ReviewPanel />}
      </div>
    </>
  );
}

function reviewHeading(r) {
  const meta = r.meta;
  const space = meta.space || "play";
  const crumbs = [{ label: t(space === "learn" ? "nav.learn" : space === "library" ? "nav.library" : "nav.play"), onClick: C.closeReview }];
  let title = t("review.title");
  // A game with a result says it at the top of the panel (ResultLine).
  let sub = "";
  if (meta.classic) {
    title = C.tx(meta.classic.title);
    sub = `${C.tx(meta.classic.blackName)} · ${C.tx(meta.classic.whiteName)} · ${classicYear(meta.classic.date)}`;
  } else if (meta.name) title = meta.name;
  else if (meta.free) title = t("board.free");
  return { crumbs, title, sub };
}

/**
 * An icon-only tool of the toolbar. It has a name for assistive technology,
 * and the same name appears under it on hover and on keyboard focus (a
 * `title` alone shows late, and never for the keyboard).
 */
function Tool({ icon, label, onClick, active, disabled }) {
  return (
    <span class="tool">
      <button type="button" class={`icon-btn ${active ? "on" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : !!active} disabled={disabled} onClick={onClick}>
        <Icon name={icon} size={18} />
      </button>
      <span class="tool-tip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

/** Review tools live in the toolbar; Esc or × goes back. */
function ReviewTools() {
  const r = state.review;
  const meta = r.meta;
  return (
    <div class="tool-group">
      {state.engine.available && <Tool icon="sparkle" label={t("review.liveToggle")} active={state.settings.liveAnalysis} onClick={C.toggleLive} />}
      <Tool icon="eye" label={t("review.ownership")} active={r.ownership} onClick={C.toggleOwnership} />
      {!meta.classic && !meta.free && <Tool icon="image" label={t("report.exportImage")} onClick={C.exportReviewImage} disabled={r.analyzing || !r.model || r.model.confidence === "none"} />}
      <Tool icon="share" label={t("common.exportSgf")} onClick={() => C.exportSGF(r.game, meta.name || (meta.classic ? meta.classic.id : "goban-studio"))} />
      <span class="tool-sep" />
      <Tool icon="close" label={`${t("review.close")} (Esc)`} onClick={C.closeReview} />
    </div>
  );
}

function ReviewNav() {
  const r = state.review;
  const line = r.game.mainLine();
  const i = C.reviewIndex();
  const depth = C.reviewDepth();
  const max = line.length - 1;
  const inVar = i < 0;
  return (
    <div class="review-nav" role="toolbar" aria-label={t("review.nav")}>
      <IconButton icon="first" label={t("review.first")} onClick={() => C.reviewGoto(0)} disabled={depth === 0} />
      <IconButton icon="prev" label={`${t("review.previous")} (←)`} onClick={() => C.reviewStep(-1)} disabled={depth === 0} />
      <input
        type="range"
        min="0"
        max={max}
        value={inVar ? 0 : i}
        aria-label={t("review.position")}
        aria-valuetext={t("review.moveOf", [i, max])}
        onInput={(e) => C.reviewGoto(Number(e.currentTarget.value))}
        disabled={inVar}
      />
      <IconButton icon="next" label={`${t("review.next")} (→)`} onClick={() => C.reviewStep(1)} disabled={!r.game.current.children.length} />
      <IconButton icon="last" label={t("review.last")} onClick={() => C.reviewGoto(max)} disabled={!inVar && i >= max} />
      <span class="nav-count">{inVar ? t("review.variationDepth", [depth]) : t("review.moveOf", [i, max])}</span>
    </div>
  );
}

/**
 * The moments the chart marks: KataGo's key mistakes (with their stories),
 * or the offline estimate's turning points (v6: nothing more), never while
 * the analysis is still running.
 */
function chartMoments(r) {
  const m = r.model;
  if (r.analyzing || !m || m.confidence === "none") return [];
  if (m.confidence === "high") return r.keyMoves.map((km) => ({ index: km.index, color: km.move.color, played: km.move, km }));
  return m.moments.map((mo) => ({ index: mo.index, color: mo.color, played: mo.played, km: null }));
}

function Chart() {
  const r = state.review;
  const pts = r.points;
  const n = pts.length;
  const W = 300;
  const H = 120;
  const [hover, setHover] = useState(null);
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (p) => (1 - p) * H;
  let d = "";
  let started = false;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!p) continue;
    d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(p.winrate).toFixed(1)}`;
    started = true;
  }
  const lastIdx = pts.reduce((a, p, i) => (p ? i : a), -1);
  const area = started ? `${d}L${x(lastIdx).toFixed(1)},${H / 2}L0,${H / 2}Z` : "";
  const cur = C.reviewIndex();
  const idxAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(k * (n - 1));
  };
  const line = r.game.mainLine();
  const hv = hover != null ? line[hover] : null;
  return (
    <figure class="chart big">
      <div class="chart-box" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("review.chartLabel")} onClick={(e) => C.reviewGoto(idxAt(e))} onPointerMove={(e) => setHover(idxAt(e))}>
          <defs>
            <clipPath id="above">
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id="below">
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          <rect class="chart-bg" x="0" y="0" width={W} height={H} rx="6" />
          {area && <path d={area} class="chart-black" clip-path="url(#above)" />}
          {area && <path d={area} class="chart-white" clip-path="url(#below)" />}
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="chart-mid" />
          {started && <path d={d} class="chart-line" />}
          {cur >= 0 && <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} class="chart-cursor" />}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} class="chart-hover" />}
          {chartMoments(r).map(
            (k) =>
              pts[k.index] && (
                <circle
                  cx={x(k.index)}
                  cy={y(pts[k.index].winrate)}
                  r="4.5"
                  class="chart-key"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (k.km) C.focusMistake(k.km);
                    else C.reviewGoto(k.index);
                  }}
                >
                  <title>{t("review.moveLabel", [k.index, colorName(k.color), coordLabel(k.played.x, k.played.y, r.game.size)])}</title>
                </circle>
              ),
          )}
        </svg>
        {hv && (
          <div class="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <Thumb thumb={hv.board.signMap.map((row) => row.map((v) => (v > 0 ? "b" : v < 0 ? "w" : ".")).join("")).join("")} size={r.game.size} />
            <span>
              {t("review.moveShort", [hover])}
              {pts[hover] ? ` · ${pts[hover].scoreLead >= 0 ? t("common.black") : t("common.white")}+${formatPoints(Math.round(Math.abs(pts[hover].scoreLead) * 2) / 2)}` : ""}
            </span>
          </div>
        )}
      </div>
      <figcaption>
        <span>
          <Stone color={BLACK} size={10} /> {t("review.blackAhead")}
        </span>
        <span>
          {t("review.whiteAhead")} <Stone color={WHITE} size={10} />
        </span>
      </figcaption>
    </figure>
  );
}

function sentenceFor(km, size) {
  const best = km.best && !km.best.pass ? coordLabel(km.best.x, km.best.y, size) : null;
  const parts = [];
  if (km.source) {
    const area = t("area." + areaOf(km.source.center.x, km.source.center.y, size));
    if (km.source.kind === "group") parts.push(t("explain.group", [area, km.source.stones.length]));
    else parts.push(t("explain.area", [area, km.source.size]));
  }
  if (best) parts.push(t("review.sentence", [t("area." + areaOf(km.best.x, km.best.y, size)), best]));
  else parts.push(t("review.sentenceNoBest"));
  return parts.join(" ");
}

function KeyMove({ km }) {
  const r = state.review;
  const size = r.game.size;
  const v = r.variation?.index === km.index ? r.variation : null;
  const open = r.focus === km.index;
  const story = km.story;
  const line = v?.story ? v.kind : null;
  const steps = line ? story?.[line] || [] : [];
  const canBetter = story?.better?.length > 0;
  const canPlayed = story?.played?.length > 0;
  return (
    <li class={`key-move ${open ? "on" : ""}`}>
      <button type="button" class="key-head" aria-expanded={open} onClick={() => C.focusMistake(km)}>
        <Stone color={km.move.color} size={12} />
        <span>{t("review.moveLabel", [km.index, colorName(km.move.color), coordLabel(km.move.x, km.move.y, size)])}</span>
        <em>{tn("review.lossN", Math.round(km.loss * 2) / 2, [formatPoints(Math.round(km.loss * 2) / 2)])}</em>
      </button>
      {open && (
        <>
          <p>{story?.summary ? storyText(story.summary) : sentenceFor(km, size)}</p>
          <div class="seg-mini">
            {km.attribution?.kind && <span class="chip theme-chip">{t("lossKind." + km.attribution.kind)}</span>}
            {km.theme && <span class="chip theme-chip">{t("explain.looksLike", [C.themeName(km.theme)])}</span>}
          </div>
          <div class="seg-mini" role="group" aria-label={t("story.title")}>
            {canBetter ? (
              <button type="button" class={line === "better" ? "on" : ""} onClick={() => C.showStory(km, "better", 0)}>
                {t("story.better")}
              </button>
            ) : (
              km.best &&
              !km.best.pass && (
                <button type="button" class={v?.kind === "better" ? "on" : ""} onClick={() => C.showVariation(km, "better")}>
                  {t("review.showBetter")}
                </button>
              )
            )}
            {canPlayed ? (
              <button type="button" class={line === "played" ? "on" : ""} onClick={() => C.showStory(km, "played", 0)}>
                {t("story.played")}
              </button>
            ) : (
              <button type="button" class={v?.kind === "played" ? "on" : ""} onClick={() => C.showVariation(km, "played")}>
                {t("review.showPlayed")}
              </button>
            )}
            {C.canTry(km.index) && (
              <button type="button" class="try-again" onClick={() => C.tryAgain(km.index)}>
                {t("try.again")}
              </button>
            )}
          </div>
          {steps.length > 0 && (
            <ol class="story" aria-label={t("story.title")}>
              {steps.map((st, i) => (
                <li>
                  <button type="button" class={i === v.step ? "on" : ""} aria-current={i === v.step ? "step" : undefined} onClick={() => C.showStory(km, line, i)}>
                    <span class="sn">{st.n}</span>
                    <span>{storyText(st)}</span>
                  </button>
                </li>
              ))}
              {line === "played" && story.playedFrom === "game" && <li class="fine">{t("story.playedGame")}</li>}
            </ol>
          )}
        </>
      )}
    </li>
  );
}

function LiveLine() {
  const r = state.review;
  const e = C.currentEval();
  if (!e || !Number.isFinite(e.winrate)) return null;
  const b = Math.round(e.winrate * 100);
  const live = r.live && r.live.nodeId === r.game.current.id;
  return (
    <div class="eval-bar">
      <div class="eval-track">
        <i style={{ width: `${b}%` }} />
      </div>
      <span class="fine">
        {t("review.estimateAt", [Math.max(0, C.reviewIndex())])} · {t("play.evalText", [e.scoreLead >= 0 ? t("common.black") : t("common.white"), formatPoints(Math.round(Math.abs(e.scoreLead) * 2) / 2)])}
        {live && !r.live.done ? ` · ${t("review.liveSearching")}` : ""}
      </span>
      {live && !r.variation && <span class="fine">{t("review.candidatesLegend")}</span>}
    </div>
  );
}

function Variations() {
  const r = state.review;
  // A line being tried has its own bar (DraftBar); it is not a variation of the record yet.
  const inVar = !C.onMainLine() && !r.draft;
  const branches = C.branchPoints().filter((b) => !(r.draft && b.node === r.draft.from && b.count === 1));
  if (!inVar && !branches.length) return null;
  return (
    <section class="variations">
      {inVar && (
        <div class="var-bar">
          <Icon name="branch" size={15} />
          <span>{t("review.inVariation", [C.reviewDepth()])}</span>
          <button type="button" class="link" onClick={C.backToMainLine}>
            {t("review.backToMain")}
          </button>
          <button type="button" class="link" onClick={() => C.promoteVariation()}>
            {t("edit.promote")}
          </button>
          <button type="button" class="link danger" onClick={C.deleteVariation}>
            {t("review.deleteVariation")}
          </button>
        </div>
      )}
      {branches.length > 0 && (
        <ul class="branch-list" aria-label={t("review.variations")}>
          {branches.map((b) => (
            <li>
              <button type="button" class="link" onClick={() => C.gotoNode(b.node.children[1])}>
                {t("review.branchAt", [b.index, b.count])}
              </button>
            </li>
          ))}
        </ul>
      )}
      {void r}
    </section>
  );
}

/** No key mistakes: praise only a player who did not fall behind. */
function noMistakesText(r) {
  if (r.meta.classic || !C.ownGame(r)) return t("review.noKeyMovesNeutral");
  const line = r.game.mainLine();
  const res = line[line.length - 1].result || "";
  const pts = r.points.filter(Boolean);
  const lead = pts.length ? pts[pts.length - 1].scoreLead : 0;
  const me = r.meta.humanColor ?? null;
  if (me == null) return t("review.noKeyMovesNeutral");
  const lost = res ? res.startsWith("B") !== (me === BLACK) : me * lead < -2;
  return lost ? t("review.noKeyMovesBehind") : t("review.noKeyMoves");
}

/** The result of the game, its facts and the change of your estimate: the review's first line. */
function ResultLine() {
  const r = state.review;
  if (r.meta.classic) return null;
  const line = r.game.mainLine();
  const result = line[line.length - 1].result;
  if (!result) return null;
  const m = r.model;
  const headline = m ? reviewHeadline(m) : C.resultText(result);
  const rating = ratingChangeText(C.reviewRating());
  const unrated = rating ? "" : C.reviewUnrated(r);
  return (
    <header class="review-result" aria-live="polite">
      <div class="result-head">
        <h2 class="result-big">{headline}</h2>
        {C.canRecount(r) && !r.recount && <MoreMenu id="review-result" label={t("review.resultMore")} items={[{ icon: "replay", label: t("recount.again"), onClick: C.startRecount }]} />}
      </div>
      {m && <span class="fine">{reviewFacts(m)}</span>}
      {rating && <span class="fine review-rating">{rating}</span>}
      {unrated && <span class="fine unrated-note">{unrated}</span>}
    </header>
  );
}

/** A line being tried on the board: say so, and offer to keep it or drop it. */
function DraftBar() {
  // From the last move of a game still in play a line can be tried, not kept: the game goes on from there.
  const keepable = C.draftKeepable();
  return (
    <div class="var-bar draft-bar enter-up" role="group" aria-label={t("review.draft")}>
      <Icon name="branch" size={15} />
      <span>{t(keepable ? "review.draft" : "review.draftLive")}</span>
      {keepable && (
        <button type="button" class="link" onClick={C.keepDraft}>
          {t("review.draftKeep")}
        </button>
      )}
      <button type="button" class="link" onClick={C.discardDraft}>
        {t("review.draftDiscard")}
      </button>
    </div>
  );
}

/** The finished game counted again: the same card as the count, over the final position. */
function RecountCard() {
  const r = state.review;
  return <ScoreCard sc={r.recount} komi={r.game.komi} title={t("recount.title")} confirm={t("recount.confirm")} cancel={t("common.cancel")} onConfirm={C.confirmRecount} onCancel={C.cancelRecount} />;
}

/** What the foot of the panel offers: one primary, by what the review is of. */
function ReviewFoot() {
  const r = state.review;
  const line = r.game.mainLine();
  const mine = r.source === "current" && state.game?.game === r.game;
  // The game that just ended: the next game is the one primary action.
  if (mine && line[line.length - 1].result) {
    return (
      <div class="actions">
        <Button kind="primary" icon="plus" class="block" onClick={() => C.openNewGame()}>
          {t("common.newGame")}
        </Button>
        <Button kind="ghost" icon="resume" onClick={C.playFromHere}>
          {t("review.playFromHere")}
        </Button>
      </div>
    );
  }
  // "Review so far" of the game in play: the way back to it.
  if (mine) {
    return (
      <div class="actions">
        <Button kind="primary" icon="back" class="block back-to-game" onClick={C.closeReview}>
          {t("review.backToGame")}
        </Button>
        <Button kind="ghost" onClick={C.playFromHere}>
          {t("review.playFromHere")}
        </Button>
      </div>
    );
  }
  // A game left unfinished, looked at: continuing it is the primary.
  if (C.reviewUnfinished(r)) {
    return (
      <div class="actions">
        <Button kind="primary" icon="resume" class="block continue-game" onClick={() => C.resumeRecord(r.meta.recordId)}>
          {t("library.continue")}
        </Button>
        <Button kind="ghost" onClick={C.playFromHere}>
          {t("review.playFromHere")}
        </Button>
      </div>
    );
  }
  return (
    <Button kind="primary" icon="resume" class="block" onClick={C.playFromHere}>
      {t("review.playFromHere")}
    </Button>
  );
}

/**
 * The free board's panel: what it is, its size while it is empty, the
 * position's estimate, notes and the tree, and Save to Library (then Play
 * from here) as the one primary.
 */
function FreeBoardPanel() {
  const r = state.review;
  const saved = !!r.meta.recordId;
  const empty = C.freeBoardEmpty(r);
  return (
    <aside class="panel review-panel free-panel" aria-label={t("board.free")}>
      <header class="review-result">
        <h2 class="result-big">{t("board.free")}</h2>
        <span class="fine">{t("board.freeHelp")}</span>
      </header>
      {empty && <Segmented class="free-size" label={t("board.size")} value={r.game.size} options={[9, 13, 19].map((n) => ({ value: n, label: `${n} × ${n}` }))} onChange={C.setFreeBoardSize} />}
      <LiveLine />
      <Variations />
      <EditSection />
      <TreeView />
      <div class="panel-foot">
        {saved ? (
          <Button kind="primary" icon="resume" class="block" onClick={C.playFromHere}>
            {t("review.playFromHere")}
          </Button>
        ) : (
          <div class="actions">
            <Button kind="primary" icon="save" class="block save-board" onClick={C.saveFreeBoard} disabled={empty}>
              {t("board.save")}
            </Button>
            <Button kind="ghost" icon="resume" onClick={C.playFromHere} disabled={empty}>
              {t("review.playFromHere")}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * A classic's famous moves (v11; v12: written ones only — KataGo's swings
 * read as noise, docs/classics-katago.json keeps them for writing more).
 * Each row goes to its move; the note of the move on the board is shown.
 */

function ClassicMoments({ classic }) {
  const r = state.review;
  const line = r.game.mainLine();
  const at = C.reviewIndex();
  const moments = (classic.moments || []).filter((mo) => line[mo.index]?.move);
  if (!moments.length) return null;
  return (
    <section class="key-moves classic-moments">
      <h2 class="slot-title">{t("review.classicMoments")}</h2>
      <ol>
        {moments.map((mo) => {
          const mv = line[mo.index].move;
          const on = at === mo.index;
          const where = mv.pass ? t("common.pass") : coordLabel(mv.x, mv.y, r.game.size);
          return (
            <li class={`key-move ${on ? "on" : ""}`}>
              <button type="button" class="key-head" aria-current={on ? "step" : undefined} onClick={() => C.reviewGoto(mo.index)}>
                <Stone color={mv.color} size={12} />
                <span>{C.tx(mo.title)}</span>
                <em class="cm-at">
                  {mo.index} · {where}
                </em>
              </button>
              {on && <p>{C.tx(mo.note)}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The key moments: KataGo's key mistakes, or the offline estimate's turning points only. */
function Moments() {
  const r = state.review;
  const m = r.model;
  if (r.analyzing) return null;
  if (!m || m.confidence === "none") return <p class="muted">{t("report.noAnalysis")}</p>;
  if (m.confidence !== "high") {
    // v6 honesty: no loss and no better move from the estimate.
    if (!m.moments.length) return <p class="muted">{t("review.noTurningPoints")}</p>;
    return (
      <section class="key-moves turning-points">
        <h2 class="slot-title">{t("report.turningPoints")}</h2>
        <ol>
          {m.moments.map((mo) => {
            const w = momentWords(m, mo);
            return (
              <li class={`key-move ${r.focus === mo.index ? "on" : ""}`}>
                <button type="button" class="key-head" onClick={() => C.reviewGoto(mo.index)}>
                  <Stone color={mo.color} size={12} />
                  <span>
                    {w.title} · {w.played}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }
  return (
    <section class="key-moves">
      {r.refining && <p class="fine">{t("story.refining")}</p>}
      {r.keyMoves.length ? (
        <>
          <h2 class="slot-title">{t("report.moments")}</h2>
          <ol>
            {r.keyMoves.map((km) => (
              <KeyMove km={km} />
            ))}
          </ol>
        </>
      ) : (
        <p class="muted">{noMistakesText(r)}</p>
      )}
    </section>
  );
}

/** A key moment tried again: the prompt, then KataGo's verdict. */
function TryCard() {
  const r = state.review;
  const tr = r.trial;
  const size = r.game.size;
  const next = C.triable(r).some((m) => m.index > tr.index);
  let text;
  let tone = "";
  if (tr.status === "open") text = t("try.prompt", [colorName(tr.color)]);
  else if (tr.status === "judging") text = t("try.judging");
  else if (tr.status === "good") {
    text = t("try.good");
    tone = "good";
  } else {
    text = t("try.bad", [formatPoints(tr.loss), tr.best ? coordLabel(tr.best.x, tr.best.y, size) : "—"]);
    tone = "bad";
  }
  return (
    <section class={`card try-card enter-up ${tone}`} aria-labelledby="try-title">
      <h2 id="try-title" class="slot-title">
        {t("try.title", [tr.index])}
      </h2>
      <p class="try-verdict" aria-live="polite">
        {text}
      </p>
      <div class="actions wrap">
        {tr.status === "bad" && (
          <Button icon="undo" onClick={C.tryRetry}>
            {t("try.again")}
          </Button>
        )}
        {(tr.status === "good" || tr.status === "bad") && (
          <Button kind={tr.status === "good" ? "secondary" : "ghost"} icon="next" onClick={C.tryNext}>
            {next ? t("try.next") : t("try.done")}
          </Button>
        )}
        {(tr.status === "open" || tr.status === "judging") && (
          <Button kind="ghost" onClick={C.closeTrial}>
            {t("try.stop")}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Which review tab is open; remembered for the session, not saved. */
let reviewTab = "analysis";

function ReviewPanel() {
  const r = state.review;
  const meta = r.meta;
  const line = r.game.mainLine();
  const progress = r.analyzing ? Math.round((r.analyzed / line.length) * 100) : 100;
  // The phases only say what the analysis can back: never for the offline
  // estimate, which can only point at turning points.
  const hasSummary = !r.analyzing && !!r.model?.phases?.length;
  const tabs = [
    { value: "analysis", label: t("review.tab.analysis") },
    ...(hasSummary ? [{ value: "summary", label: t("review.tab.summary") }] : []),
    { value: "notes", label: t("review.tab.notes") },
  ];
  const tab = tabs.some((x) => x.value === reviewTab) ? reviewTab : "analysis";
  const setTab = (v) => {
    reviewTab = v;
    update();
  };
  return (
    <aside class="panel review-panel" aria-label={t("review.title")}>
      <ResultLine />
      <Chart />
      <LiveLine />
      {/* v8: one quiet status line — the analysis, then where the game left the book. */}
      <p class="fine review-status" aria-live="polite">
        {(r.analyzing || r.engine !== "katago") && (
          <span>{r.analyzing ? t(r.engine === "estimate" ? "review.estimating" : "review.analyzing", [progress]) : t("review.estimateNote")}</span>
        )}
        <BookExitNote game={r.game} onGoto={C.reviewGoto} inline />
      </p>
      {r.draft && <DraftBar />}
      {r.recount ? (
        <RecountCard />
      ) : r.trial ? (
        <TryCard />
      ) : (
        <>
          <Segmented class="review-tabs" value={tab} options={tabs} onChange={setTab} label={t("review.tabs")} />
          <div class="review-tab" role="tabpanel" aria-label={tabs.find((x) => x.value === tab).label}>
            {tab === "analysis" && (
              <>
                {meta.classic && (
                  <section class="quiet-note">
                    <p>{C.tx(meta.classic.note)}</p>
                    {meta.classic.event && <p class="fine">{meta.classic.event}</p>}
                  </section>
                )}
                {meta.classic && <ClassicMoments classic={meta.classic} />}
                <Moments />
                <Variations />
              </>
            )}
            {tab === "summary" && <GameSummary />}
            {tab === "notes" && (
              <>
                <EditSection />
                <TreeView />
              </>
            )}
          </div>
        </>
      )}

      {!r.recount && (
        <div class="panel-foot">
          <ReviewFoot />
        </div>
      )}
    </aside>
  );
}

/** The game in three phases (KataGo only), per player, and three things to remember. */
/** v13: "Your moves look like ≈ 12 kyu (8 kyu to 15 kyu)", from the human-style model, when there is a reading. */
function MoveRankLine() {
  const mr = C.moveRankOf(state.review);
  if (!mr) return null;
  return (
    <p class="fine move-rank" title={t("review.moveRankHelp")}>
      {t("review.moveRank", [rankText(mr.rank), rankText(mr.lo), rankText(mr.hi)])}
    </p>
  );
}

function GameSummary() {
  const m = state.review.model;
  if (!m?.phases?.length) return null;
  return (
    <section class="game-summary">
      <MoveRankLine />
      {m.players.map((who) => (
        <table class="phase-table">
          <caption class="sr-only">{t("report.phasesOf", [t("common." + who)])}</caption>
          <thead>
            <tr>
              <th scope="col">
                {m.players.length > 1 && <Stone color={who === "black" ? BLACK : WHITE} size={10} />}
                <span class="sr-only">{t("common." + who)}</span>
              </th>
              <th scope="col" title={t("report.lossHelp")}>
                {t("gameSummary.pointsLost")}
              </th>
              <th scope="col" title={t("gameSummary.mistakesHelp", [MISTAKE, BLUNDER])}>
                {t("gameSummary.mistakes")}
              </th>
              <th scope="col" title={t("gameSummary.accuracyHelp")}>
                {t("gameSummary.accuracy")}
              </th>
            </tr>
          </thead>
          <tbody>
            {m.phases.map((ph) => {
              const st = ph.players[who];
              return (
                <tr>
                  <th scope="row" title={t("gameSummary.phaseMoves", [ph.from, ph.to])}>
                    {t("phase." + ph.id)}
                  </th>
                  <td>{lossText(st.loss)}</td>
                  <td>{st.mistakes + st.blunders || "—"}</td>
                  <td>{accuracyText(st.accuracy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {m.takeaways.length > 0 && (
        <ol class="takeaways">
          {m.takeaways.slice(0, 3).map((tk) => (
            <li class={tk.tone}>
              {tk.index != null ? (
                <button type="button" class="link" onClick={() => C.reviewGoto(tk.index)}>
                  {storyText(tk)}
                </button>
              ) : (
                storyText(tk)
              )}
              {tk.kind === "theme" && (tk.theme || tk.topic) && (
                <>
                  {" "}
                  <button type="button" class="link take-practise" onClick={() => C.practiseTheme(tk.theme, tk.topic)}>
                    {t("gameSummary.practise")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The variation tree: every branch of the record, the current move ringed. */
function TreeView() {
  const lay = C.treeLayout();
  const box = useRef(null);
  useEffect(() => {
    const el = box.current?.querySelector(".tree-node.cur");
    el?.scrollIntoView?.({ block: "nearest", inline: "center" });
  });
  if (!lay || lay.height <= 1) return null;
  const S = 14;
  const pad = 8;
  const w = lay.width * S + pad * 2;
  const h = lay.height * S + pad * 2;
  const X = (x) => pad + x * S;
  const Y = (y) => pad + y * S;
  return (
    <section class="tree-view">
      <h2 class="slot-title">{t("edit.tree")}</h2>
      <div class="tree-scroll" ref={box}>
        <svg width={w} height={h} role="img" aria-label={t("edit.tree")}>
          {lay.edges.map((e) => (
            <polyline class={`tree-edge ${e.isMain ? "main" : ""}`} points={e.points.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} />
          ))}
          {lay.nodes.map((n) => (
            <circle
              class={`tree-node ${n.color > 0 ? "b" : n.color < 0 ? "w" : "root"} ${n.isCurrent ? "cur" : ""} ${n.hasComment ? "note" : ""}`}
              cx={X(n.x)}
              cy={Y(n.y)}
              r={n.isCurrent ? 5 : 4}
              onClick={() => C.gotoNode(n.node)}
            >
              <title>{n.x}</title>
            </circle>
          ))}
        </svg>
      </div>
    </section>
  );
}

/** Comment on the current move, and the marking tools. */
function EditSection() {
  const r = state.review;
  const node = r.game.current;
  const kinds = ["triangle", "square", "circle", "cross", "label"];
  const glyph = { triangle: "△", square: "□", circle: "○", cross: "×", label: "A" };
  return (
    <section class="edit-section">
      <div class="edit-head">
        <h2 class="slot-title">{t("edit.comment")}</h2>
        <span class="edit-history">
          <IconButton icon="undo" size={16} label={`${t("edit.undo")} (${MOD}Z)`} onClick={C.reviewUndo} disabled={!C.canUndoEdit(r)} />
          <IconButton icon="redo" size={16} label={`${t("edit.redo")} (${SHIFT}${MOD}Z)`} onClick={C.reviewRedo} disabled={!C.canRedoEdit(r)} />
        </span>
      </div>
      <textarea
        class="comment-box"
        aria-label={t("edit.comment")}
        rows="3"
        key={node.id}
        placeholder={t("edit.commentPlaceholder")}
        value={node.comment || ""}
        onInput={(e) => C.setComment(e.currentTarget.value)}
        onBlur={C.commitComment}
      />
      <div class="mark-tools" role="toolbar" aria-label={t("edit.marks")}>
        {kinds.map((k) => (
          <button type="button" class={`mark-btn ${r.markTool === k ? "on" : ""}`} aria-pressed={r.markTool === k} title={t("edit.mark." + k)} onClick={() => C.setMarkTool(r.markTool === k ? null : k)}>
            {glyph[k]}
          </button>
        ))}
        {(node.marks || []).length > 0 && (
          <button type="button" class="link" onClick={() => C.clearMarks()}>
            {t("edit.clearMarks")}
          </button>
        )}
      </div>
      {r.edits?.target === null && !r.meta.free && <p class="fine">{t("edit.notSaved")}</p>}
    </section>
  );
}
