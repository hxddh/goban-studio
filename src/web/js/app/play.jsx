/**
 * Play: the live game, scoring, the result; and the review layer over any
 * game (whole-game analysis, live analysis, variations, key mistakes).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BLACK, WHITE, coordLabel, formatPoints, rulesetById } from "../rules.js";
import { areaOf, rankParts, strengthById } from "../engine.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { ataris } from "./insight.js";
import { storyText } from "./story.js";
import { formatClock } from "./clock.js";
import { ratingParts } from "./rating.js";
import { Board, Button, CountUp, Icon, IconButton, MoreMenu, Stone, Thumb, MOD, SHIFT } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";

export function rankLabel(id) {
  const r = rankParts(id);
  return t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n]);
}

export function ratingLabel(r) {
  const p = ratingParts(r);
  return t(p.unit === "kyu" ? "rank.kyu" : "rank.dan", [p.n]);
}

function moveNumbers(game) {
  if (!state.settings.numbers) return null;
  const numbers = {};
  const path = game.path;
  for (let i = 1; i < path.length; i++) {
    const m = path[i].move;
    if (!m || m.pass) continue;
    if (game.current.board.get([m.x, m.y]) === m.color) numbers[m.x + "," + m.y] = i;
  }
  return numbers;
}

function colorName(c) {
  return t(c === BLACK ? "common.black" : "common.white");
}

/* ------------------------------------------------------------------ play */

export function PlayView() {
  const s = state;
  if (C.playReviewing()) return <ReviewView />;
  const g = s.game;
  const game = g.game;
  const focus = s.settings.focus;
  const node = game.current;
  const scoring = g.scoring;
  const marks = [];
  if (g.hint) marks.push({ ...g.hint, type: "circle", tone: "accent" });
  if (g.pending?.showBest && g.pending.best) marks.push({ ...g.pending.best, type: "circle", tone: "good" });
  // Teaching: stones in atari carry a small warning triangle.
  if (C.teachingOn() && !scoring && !node.result && g.opponent === "ai") {
    for (const ch of ataris(node.board.signMap)) {
      const s0 = ch.stones[0];
      marks.push({ ...s0, type: "triangle", tone: ch.color === g.humanColor ? "bad" : "good" });
    }
  }
  const myTurn = g.opponent === "human" || game.turn === g.humanColor;
  const model = {
    size: game.size,
    board: node.board.signMap,
    lastMove: node.move,
    marks,
    ownership: null,
    territory: scoring ? scoring.score.territory : null,
    deadStones: scoring ? scoring.dead : [],
    variation: null,
    moveNumbers: moveNumbers(game),
    showCoords: s.settings.coords,
    material: s.settings.board,
    view: null,
    ghost: g.ghost ? { ...g.ghost, color: game.turn } : null,
    hoverColor: scoring ? null : game.turn,
    interactive: !g.thinking && !g.pending && (scoring ? true : game.phase === "playing" && !node.result && myTurn),
  };
  return (
    <>
      <Toolbar title={t("nav.play")} sub={gameFacts(g)}>
        {focus ? (
          <FocusTools />
        ) : (
          <Button kind="secondary" size="sm" icon="plus" onClick={() => C.openNewGame()} title={`${t("common.newGame")} (${MOD}N)`}>
            {t("common.newGame")}
          </Button>
        )}
      </Toolbar>
      <div class={`workspace ${focus ? "focus" : ""} ${scoring ? "is-scoring" : ""} ${node.result ? "is-over" : ""}`}>
        <section class="stage" aria-label={t("nav.play")}>
          <Board model={model} onPlay={C.humanPlay} onHover={(v) => (v ? C.canPlayHere(v.x, v.y) : true)} />
          {g.proposal && !scoring && !node.result && <ProposalBar />}
        </section>
        {!focus && <PlayPanel />}
      </div>
    </>
  );
}

/** Size, komi, handicap, time and move: the game's facts, in one line. */
function gameFacts(g) {
  const game = g.game;
  return [
    `${game.size} × ${game.size}`,
    t(rulesetById(game.rules).labelKey),
    t("play.komiN", [formatPoints(game.komi)]),
    game.handicap ? t("play.handicapN", [game.handicap]) : null,
    g.clock ? t("time." + g.clock.mode) : null,
    game.moveNumber ? t("play.moveN", [game.moveNumber]) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ProposalBar() {
  return (
    <div class="float-bar enter-up" role="status">
      <span>{t("play.proposeCount")}</span>
      <Button kind="primary" size="sm" onClick={C.acceptCount}>
        {t("play.countNow")}
      </Button>
      <Button kind="ghost" size="sm" onClick={C.dismissProposal}>
        {t("play.keepPlaying")}
      </Button>
    </div>
  );
}

function statusText(g) {
  const game = g.game;
  if (g.scoring) return t("play.scoring");
  if (game.current.result) return C.resultText(game.current.result);
  if (g.pending) return t("teach.paused");
  if (g.thinking && C.isComputerTurn()) return t("play.thinking");
  if (g.thinking) return t("play.hintThinking");
  const color = colorName(game.turn);
  if (g.opponent === "human") return t("play.toPlay", [color]);
  if (game.turn !== g.humanColor) return t("play.theirTurn");
  if (C.teachingOn()) {
    const mine = ataris(game.current.board.signMap).filter((c) => c.color === g.humanColor);
    if (mine.length) return t("teach.inAtari");
    const theirs = ataris(game.current.board.signMap).filter((c) => c.color !== g.humanColor);
    if (theirs.length) return t("teach.canCapture");
  }
  return t("play.yourTurn");
}

function FocusTools() {
  const g = state.game;
  return (
    <div class="focus-tools" role="toolbar" aria-label={t("play.focus")}>
      <span class="focus-status">
        <Stone color={g.game.turn} size={12} /> {statusText(g)}
      </span>
      {g.clock && <span class="clock mini">{formatClock(g.clock[g.game.turn === BLACK ? "b" : "w"])}</span>}
      <IconButton icon="pass" label={t("common.pass")} onClick={C.requestPass} />
      <IconButton icon="undo" label={t("common.undo")} onClick={C.undo} />
      <IconButton icon="focus" label={t("play.exitFocus")} active onClick={C.toggleFocus} />
    </div>
  );
}

function PlayerRow({ color }) {
  const g = state.game;
  const game = g.game;
  const over = !!game.current.result || !!g.scoring;
  const active = game.turn === color && game.phase === "playing" && !over;
  const caps = game.board.getCaptures(color) || 0;
  let name;
  let sub = "";
  if (g.opponent === "ai" && color !== g.humanColor) {
    name = state.engine.available ? "KataGo" : t("play.offlineEngine");
    sub = rankLabel(g.strength);
    if (g.opponentMode === "human" || g.opponentMode === "strong") sub += " · " + t("models.mode." + g.opponentMode);
  } else if (g.opponent === "ai") {
    name = t("play.you");
    const r = state.progress.rating?.r;
    if (r != null) sub = ratingLabel(r);
  } else name = colorName(color);
  const fx = g.captureFx && g.captureFx.color === color && performance.now() - g.captureFx.at < 1200 ? g.captureFx : null;
  const side = g.clock ? g.clock[color === BLACK ? "b" : "w"] : null;
  const low = side && side.left <= 10 && active;
  return (
    <div class={`player ${active ? "active" : ""}`}>
      <Stone color={color} size={22} />
      <div class="player-name">
        <strong>{name}</strong>
        {sub && <span>{sub}</span>}
      </div>
      <span class={`player-caps ${fx ? "bump" : ""}`} title={t("play.captures")} key={fx ? fx.at : "caps"}>
        {caps > 0 ? t("play.capturesN", [caps]) : ""}
        {fx && <em class="cap-fx">+{fx.n}</em>}
      </span>
      {side && (
        <span class={`clock ${active ? "running" : ""} ${low ? "low" : ""}`} aria-label={t("play.clock")}>
          {side.inByo && g.clock.mode === "byoyomi" ? `${formatClock(side)} ×${side.periods}` : formatClock(side)}
        </span>
      )}
      {active && g.thinking && C.isComputerTurn() && (
        <span class="thinking" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

function EvalBar() {
  const g = state.game;
  const e = g.eval;
  if (!state.settings.showEval || !e || !Number.isFinite(e.winrate)) return null;
  const b = Math.round(e.winrate * 100);
  const lead = e.scoreLead;
  return (
    <div class="eval-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={b} aria-label={t("play.evalLabel")}>
      <div class="eval-track">
        <i style={{ width: `${b}%` }} />
      </div>
      <span class="fine">{t("play.evalText", [lead >= 0 ? t("common.black") : t("common.white"), formatPoints(Math.round(Math.abs(lead) * 2) / 2)])}</span>
    </div>
  );
}

function MoveStrip() {
  const g = state.game;
  const game = g.game;
  const ref = useRef(null);
  const line = game.mainLine().slice(1);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [line.length]);
  const peek = (i) => {
    C.reviewCurrentGame();
    C.reviewGoto(i);
  };
  return (
    <section class="moves" aria-label={t("play.moveList")}>
      <h2 class="slot-title">{t("play.moveList")}</h2>
      {line.length < 12 && C.teachingOn() && g.opponent === "ai" && game.size >= 13 && (
        <p class="quiet-note opening-tip">{t("tip.opening." + (Math.floor(line.length / 4) + 1))}</p>
      )}
      {line.length === 0 ? (
        <p class="moves-empty">{t("play.noMoves")}</p>
      ) : (
        <ol class="move-grid" ref={ref}>
          {line.map((n, k) => {
            const i = k + 1;
            const m = n.move;
            return (
              <li class={i === line.length ? "last" : ""}>
                <button type="button" onClick={() => peek(i)} title={t("play.peek")}>
                  <span class="mn">{i}</span>
                  <Stone color={m.color} size={8} />
                  <span>{m.pass ? t("common.pass") : coordLabel(m.x, m.y, game.size)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TeachCard() {
  const g = state.game;
  const p = g.pending;
  return (
    <section class="card teach enter-up" role="alertdialog" aria-live="assertive" aria-labelledby="teach-title">
      <h2 id="teach-title">{t("teach.title")}</h2>
      <p>{t("teach.body", [formatPoints(p.loss)])}</p>
      <div class="actions wrap">
        <Button kind="primary" icon="undo" onClick={C.teachTakeBack}>
          {t("teach.takeBack")}
        </Button>
        {p.best && !p.showBest && (
          <Button kind="ghost" icon="bulb" onClick={C.teachShowBest}>
            {t("teach.showBetter")}
          </Button>
        )}
        <Button kind="ghost" onClick={C.teachKeep}>
          {t("teach.keep")}
        </Button>
      </div>
      <p class="fine">{t("teach.note")}</p>
    </section>
  );
}

function PlayPanel() {
  const g = state.game;
  const game = g.game;
  const over = !!game.current.result;
  const playing = game.phase === "playing" && !over && !g.scoring;
  const myTurn = g.opponent === "human" || game.turn === g.humanColor;
  const canUndo = !!game.current.parent && !g.thinking;
  return (
    <aside class="panel" aria-label={t("play.panel")}>
      <section class="players" aria-label={t("play.players")}>
        <PlayerRow color={BLACK} />
        <PlayerRow color={WHITE} />
      </section>
      <EvalBar />
      <div class="panel-state" key={g.scoring ? "scoring" : over ? "over" : g.pending ? "pending" : "play"}>
        {!g.scoring && !over && (
          <p class="status-line" aria-live="off">
            {statusText(g)}
          </p>
        )}
        {g.pending && <TeachCard />}
        {g.scoring && <ScoringCard />}
        {over && !g.scoring && <ResultCard />}
        {playing && !g.pending && (
          <div class="actions">
            <Button icon="pass" onClick={C.requestPass} disabled={!myTurn || g.thinking}>
              {t("common.pass")}
            </Button>
            <Button icon="undo" onClick={C.undo} disabled={!canUndo} title={`${t("common.undo")} (${MOD}Z)`}>
              {t("common.undo")}
            </Button>
            <MoreMenu
              id="play-more"
              items={[
                { icon: "bulb", label: t("common.hint"), kbd: `${SHIFT}${MOD}H`, onClick: C.askHint, disabled: !myTurn || g.thinking },
                { icon: "chart", label: t("play.reviewSoFar"), onClick: C.reviewCurrentGame, disabled: game.mainLine().length < 2 },
                { icon: "check", label: t("play.countNow"), onClick: C.acceptCount, disabled: game.moveNumber < game.size * 2 },
                "-",
                { icon: "save", label: g.saved ? t("play.saveAgain") : t("play.save"), onClick: () => C.saveToLibrary(), disabled: game.moveNumber === 0 },
                { icon: "download", label: t("common.exportSgf"), onClick: () => C.exportSGF() },
                { icon: "focus", label: t("play.focus"), kbd: `${MOD}.`, onClick: C.toggleFocus },
                "-",
                { icon: "flag", label: t("common.resign"), onClick: C.requestResign, danger: true },
              ]}
            />
          </div>
        )}
        {g.hint && (
          <p class="note">
            <Icon name="bulb" size={15} /> {t("play.hintAt", [coordLabel(g.hint.x, g.hint.y, game.size)])}
          </p>
        )}
        {g.ghost && <p class="fine">{t("play.confirmHint")}</p>}
      </div>
      <MoveStrip />
      {!state.engine.available && g.opponent === "ai" && <p class="fine panel-note">{t("play.offlineNote")}</p>}
    </aside>
  );
}

function ScoringCard() {
  const g = state.game;
  const sc = g.scoring;
  const s = sc.score;
  const pending = sc.source === "pending";
  return (
    <section class="card score-card enter-up" aria-live="polite">
      <h2>{t(s.method === "area" ? "score.titleArea" : "score.title")}</h2>
      <p class="muted">{pending ? t("score.judging") : sc.source === "katago" ? t("score.engineMarked") : t("score.manual")}</p>
      <div class="score-pair">
        <div>
          <Stone color={BLACK} size={14} />
          <strong>
            <CountUp value={pending ? 0 : s.black} format={formatPoints} />
          </strong>
          <span class="score-detail">{lines(s.method === "area" ? t("score.detailArea", [s.blackStones, s.blackTerritory]) : t("score.detail", [s.blackTerritory, s.blackPrisoners]))}</span>
        </div>
        <div>
          <Stone color={WHITE} size={14} />
          <strong>
            <CountUp value={pending ? 0 : s.white} format={formatPoints} />
          </strong>
          <span class="score-detail">
            {lines(
              s.method === "area"
                ? s.handicapCompensation > 0
                  ? t("score.detailAreaHandicap", [s.whiteStones, s.whiteTerritory, formatPoints(s.komi), s.handicapCompensation])
                  : t("score.detailAreaKomi", [s.whiteStones, s.whiteTerritory, formatPoints(s.komi)])
                : t("score.detailKomi", [s.whiteTerritory, s.whitePrisoners, formatPoints(s.komi ?? g.game.komi)]),
            )}
          </span>
        </div>
      </div>
      {!pending && s.seki?.length > 0 && <p class="fine">{t(s.method === "area" ? "score.sekiArea" : "score.sekiTerritory")}</p>}
      {!pending && <p class="score-result enter-fade">{C.resultText(s.result)}</p>}
      <div class="actions">
        <Button kind="primary" onClick={C.confirmScore} disabled={pending}>
          {t("score.confirm")}
        </Button>
        <Button kind="ghost" onClick={C.resumePlay}>
          {t("score.resume")}
        </Button>
      </div>
    </section>
  );
}

/** "a · b · c" → one fact per line. */
function lines(text) {
  return text.split(" · ").map((x) => <i>{x}</i>);
}

function SummaryBlock() {
  const g = state.game;
  const sm = g.summary;
  if (!sm) return null;
  if (sm.status === "analyzing") {
    return (
      <div class="summary pending" aria-live="polite">
        <span class="fine">{t("summary.analyzing", [Math.round((sm.progress || 0) * 100)])}</span>
        <div class="progress">
          <i style={{ width: `${Math.round((sm.progress || 0) * 100)}%` }} />
        </div>
      </div>
    );
  }
  const size = g.game.size;
  return (
    <ol class="summary enter-up" aria-label={t("summary.title")}>
      {sm.big && (
        <li>
          <strong>{t("summary.mistake")}</strong>
          <span>
            {t("summary.mistakeText", [sm.big.index, formatPoints(Math.round(sm.big.loss * 2) / 2), sm.big.best && !sm.big.best.pass ? coordLabel(sm.big.best.x, sm.big.best.y, size) : "—"])}
          </span>
        </li>
      )}
      {sm.good && (
        <li>
          <strong>{t("summary.good")}</strong>
          <span>{t("summary.goodText", [sm.good.index, coordLabel(sm.good.move.x, sm.good.move.y, size)])}</span>
        </li>
      )}
      <li>
        <strong>{t("summary.tip")}</strong>
        {sm.topic ? (
          <span>
            {t("summary.tipText", [C.themeName(sm.theme)])}{" "}
            <button type="button" class="link" onClick={() => C.openTopic(sm.topic, sm.theme)}>
              {t("summary.practice")}
            </button>
          </span>
        ) : (
          <span>{sm.big ? t("summary.tipReview") : t("summary.tipClean")}</span>
        )}
      </li>
    </ol>
  );
}

function ResultCard() {
  const g = state.game;
  const r = g.game.current.result;
  const aids = [];
  if (g.undos) aids.push(t("play.undosN", [g.undos]));
  if (g.hints) aids.push(t("play.hintsN", [g.hints]));
  const headline = C.resultHeadline(g);
  return (
    <section class="card result-card enter-up" aria-live="polite">
      <span class="eyebrow">{t("play.gameOver")}</span>
      <strong class="result-big">{headline}</strong>
      {headline !== C.resultText(r) && <span class="muted">{C.resultText(r)}</span>}
      {g.ratingDelta != null && (
        <span class={`rating-delta ${g.ratingDelta >= 0 ? "up" : "down"}`}>
          {t("summary.rating", [ratingLabel(state.progress.rating.r), (g.ratingDelta >= 0 ? "+" : "") + g.ratingDelta])}
        </span>
      )}
      {aids.length > 0 && <span class="fine">{aids.join(" · ")}</span>}
      <SummaryBlock />
      <div class="actions center">
        <Button kind="primary" icon="chart" onClick={C.reviewCurrentGame}>
          {t("play.reviewGame")}
        </Button>
        <Button kind="ghost" onClick={() => C.openNewGame()}>
          {t("play.playAgain")}
        </Button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- review */

export function ReviewView() {
  const s = state;
  const r = s.review;
  const game = r.game;
  const node = game.current;
  const marks = [];
  if (r.guess?.last === "wrong" && r.guess.wrongAt) marks.push({ ...r.guess.wrongAt, type: "cross", tone: "bad" });
  // Marks recorded on this move (SGF TR/SQ/CR/MA/LB).
  if (!r.variation) for (const mk of node.marks || []) marks.push({ x: mk.x, y: mk.y, type: mk.type, label: mk.text });
  const focusKm = r.focus != null ? r.keyMoves.find((k) => k.index === r.focus) : null;
  if (focusKm?.source && r.variation) for (const p of focusKm.source.points) marks.push({ ...p, type: "area", tone: "bad" });
  if (r.variation) {
    const km = r.keyMoves.find((k) => k.index === r.variation.index);
    if (km?.best && !km.best.pass && r.variation.kind === "played") marks.push({ ...km.best, type: "circle", tone: "good" });
  }
  // Live candidates on the board (not during guessing or while a line is shown).
  const live = r.live && r.live.nodeId === node.id ? r.live : null;
  if (live && !r.variation && !r.guess) {
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
  const model = {
    size: game.size,
    board,
    lastMove: node.move,
    marks,
    ownership: C.reviewOwnershipMap(),
    territory: null,
    deadStones: [],
    variation: varMoves,
    moveNumbers: r.variation ? null : moveNumbers(game),
    showCoords: s.settings.coords,
    material: s.settings.board,
    view: null,
    hoverColor: r.guess?.done ? null : game.turn,
    interactive: !(r.guess && r.guess.done),
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
        <ReviewPanel />
      </div>
    </>
  );
}

function reviewHeading(r) {
  const meta = r.meta;
  const line = r.game.mainLine();
  const result = line[line.length - 1].result;
  const space = meta.space || "play";
  const crumbs = [{ label: t(space === "library" ? "nav.library" : space === "practice" ? "nav.practice" : "nav.play"), onClick: C.closeReview }];
  let title = t("review.title");
  let sub = result ? C.resultText(result) : "";
  if (meta.classic) {
    title = C.tx(meta.classic.title);
    sub = `${C.tx(meta.classic.blackName)} · ${C.tx(meta.classic.whiteName)} · ${meta.classic.date}`;
  } else if (meta.opening) title = C.tx(meta.opening.title);
  else if (meta.name) title = meta.name;
  return { crumbs, title, sub };
}

/** Review tools live in the toolbar; Esc or × goes back. */
function ReviewTools() {
  const r = state.review;
  const meta = r.meta;
  return (
    <div class="tool-group">
      {state.engine.available && <IconButton icon="sparkle" label={t("review.liveToggle")} active={state.settings.liveAnalysis && !r.guess} onClick={C.toggleLive} />}
      <IconButton icon="eye" label={t("review.ownership")} active={r.ownership} onClick={C.toggleOwnership} />
      <IconButton icon="target" label={t("review.guess")} active={!!r.guess} onClick={C.toggleGuess} />
      <IconButton icon="download" label={t("common.exportSgf")} onClick={() => C.exportSGF(r.game, meta.name || (meta.classic ? meta.classic.id : "goban-studio"))} />
      <span class="tool-sep" />
      <IconButton icon="close" label={`${t("review.close")} (Esc)`} onClick={C.closeReview} />
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
        disabled={!!r.guess || inVar}
      />
      <IconButton icon="next" label={`${t("review.next")} (→)`} onClick={() => C.reviewStep(1)} disabled={!r.game.current.children.length || !!r.guess} />
      <IconButton icon="last" label={t("review.last")} onClick={() => C.reviewGoto(max)} disabled={(!inVar && i >= max) || !!r.guess} />
      <span class="nav-count">{inVar ? t("review.variationDepth", [depth]) : t("review.moveOf", [i, max])}</span>
    </div>
  );
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
          {r.keyMoves.map(
            (k) =>
              pts[k.index] && (
                <circle
                  cx={x(k.index)}
                  cy={y(pts[k.index].winrate)}
                  r="4.5"
                  class="chart-key"
                  onClick={(e) => {
                    e.stopPropagation();
                    C.focusMistake(k);
                  }}
                >
                  <title>{t("review.moveLabel", [k.index, colorName(k.move.color), coordLabel(k.move.x, k.move.y, r.game.size)])}</title>
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
        <em>{t("review.lossN", [formatPoints(Math.round(km.loss * 2) / 2)])}</em>
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
            {km.best && !km.best.pass && (
              <button type="button" onClick={() => C.practiceThis(km)}>
                {t("review.practiceThis")}
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
      {live && !r.variation && !r.guess && <span class="fine">{t("review.candidatesLegend")}</span>}
    </div>
  );
}

function Variations() {
  const r = state.review;
  const inVar = !C.onMainLine();
  const branches = C.branchPoints();
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
  if (r.meta.classic || r.meta.opening || r.meta.source === "import") return t("review.noKeyMovesNeutral");
  const line = r.game.mainLine();
  const res = line[line.length - 1].result || "";
  const pts = r.points.filter(Boolean);
  const lead = pts.length ? pts[pts.length - 1].scoreLead : 0;
  const me = r.meta.humanColor ?? (r.source === "current" && state.game?.opponent === "ai" ? state.game.humanColor : null);
  if (me == null) return t("review.noKeyMovesNeutral");
  const lost = res ? res.startsWith("B") !== (me === BLACK) : me * lead < -2;
  return lost ? t("review.noKeyMovesBehind") : t("review.noKeyMoves");
}

function ReviewPanel() {
  const r = state.review;
  const meta = r.meta;
  const line = r.game.mainLine();
  const progress = r.analyzing ? Math.round((r.analyzed / line.length) * 100) : 100;
  return (
    <aside class="panel" aria-label={t("review.title")}>
      {r.guess ? (
        <GuessCard />
      ) : (
        <>
          <Chart />
          <LiveLine />
          {(r.analyzing || r.engine !== "katago") && (
            <p class="fine" aria-live="polite">
              {r.analyzing ? t(r.engine === "estimate" ? "review.estimating" : "review.analyzing", [progress]) : t("review.estimateNote")}
            </p>
          )}
          <section class="key-moves">
            <h2 class="slot-title">{t("review.keyMoves")}</h2>
            {r.refining && <p class="fine">{t("story.refining")}</p>}
            {r.keyMoves.length ? (
              <ol>
                {r.keyMoves.map((km) => (
                  <KeyMove km={km} />
                ))}
              </ol>
            ) : (
              <p class="muted">{r.analyzing ? t("review.waiting") : noMistakesText(r)}</p>
            )}
          </section>
          <GameSummary />
          <Variations />
          <TreeView />
          <EditSection />
        </>
      )}

      {meta.classic && (
        <section class="quiet-note">
          <p>{C.tx(meta.classic.note)}</p>
          {meta.classic.event && <p class="fine">{meta.classic.event}</p>}
        </section>
      )}
      {meta.opening && !r.guess && (
        <section class="quiet-note">
          <p>{C.tx(meta.opening.text)}</p>
        </section>
      )}

      <div class="panel-foot">
        <Button kind="primary" icon="resume" class="block" onClick={C.playFromHere}>
          {t("review.playFromHere")}
        </Button>
      </div>
    </aside>
  );
}

/** The game in three phases, and three things to remember. */
function GameSummary() {
  const r = state.review;
  const sm = r.summary;
  if (!sm || sm.confidence === "none" || !sm.phases?.length) return null;
  const me = sm.humanColor === WHITE ? "white" : sm.humanColor === BLACK ? "black" : null;
  const cols = me ? [me] : ["black", "white"];
  const fmt = (v) => (v == null ? "—" : formatPoints(Math.round(v * 2) / 2));
  return (
    <section class="game-summary">
      <h2 class="slot-title">{t("gameSummary.title")}</h2>
      <table class="phase-table">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th>{me ? t("gameSummary.pointsLost") : <Stone color={c === "black" ? BLACK : WHITE} size={10} />}</th>
            ))}
            {me && <th>{t("gameSummary.mistakes")}</th>}
          </tr>
        </thead>
        <tbody>
          {sm.phases.map((ph) =>
            ph.from > ph.to ? null : (
              <tr>
                <th title={t("gameSummary.phaseMoves", [ph.from, ph.to])}>{t("phase." + ph.id)}</th>
                {cols.map((c) => (
                  <td>{fmt(ph.players[c].loss)}</td>
                ))}
                {me && <td>{ph.players[me].mistakes + ph.players[me].blunders || "—"}</td>}
              </tr>
            ),
          )}
        </tbody>
      </table>
      {sm.takeaways?.length > 0 && (
        <ol class="takeaways">
          {sm.takeaways.filter((tk) => tk.kind !== "estimate").slice(0, 3).map((tk) => (
            <li class={tk.tone}>
              {tk.index != null ? (
                <button type="button" class="link" onClick={() => C.reviewGoto(tk.index)}>
                  {storyText(tk)}
                </button>
              ) : (
                storyText(tk)
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
      <h2 class="slot-title">{t("edit.comment")}</h2>
      <textarea
        class="comment-box"
        aria-label={t("edit.comment")}
        rows="3"
        key={node.id}
        placeholder={t("edit.commentPlaceholder")}
        value={node.comment || ""}
        onInput={(e) => C.setComment(e.currentTarget.value)}
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
      {r.edits?.target === null && <p class="fine">{t("edit.notSaved")}</p>}
    </section>
  );
}

function GuessCard() {
  const r = state.review;
  const g = r.guess;
  const msg =
    g.done ? t("guess.done", [g.right, g.tries]) : g.last === "right" ? t("guess.right") : g.last === "wrong" ? t("guess.wrong") : g.last === "revealed" ? t("guess.revealed") : t("guess.prompt");
  return (
    <section class={`card guess ${g.last || ""}`} aria-live="polite">
      <h2>{t("review.guess")}</h2>
      <p>{msg}</p>
      <p class="fine">{t("guess.score", [g.right, g.tries])}</p>
      {!g.done && (
        <div class="actions">
          <Button kind="ghost" onClick={C.revealGuess}>
            {t("guess.reveal")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function strengthName(id) {
  return rankLabel(strengthById(id).id);
}

export { SHIFT, update };
