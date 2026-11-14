/**
 * Play: the live game and scoring. The review over any game, which is also
 * the post-game review the board turns into when a game ends, is
 * review.jsx (split out of this file).
 */
import { useEffect, useRef } from "preact/hooks";
import { BLACK, WHITE, coordLabel, formatPoints, rulesetById } from "../rules.js";
import { t, tn } from "../i18n.js";
import { state, useClockTicks } from "./store.js";
import * as C from "./controller.js";
import { ataris } from "./insight.js";
import { hintText, warningText } from "./teach-why.js";
import { formatClock } from "./clock.js";
import { tallyVerdicts, verdictOf } from "../play/verdict.js";
import { Board, Button, Icon, IconButton, MoreMenu, Stone, MOD, SHIFT } from "./parts.jsx";
import { ScoreCard } from "./score-card.jsx";
import { NarrowFold, Toolbar } from "./chrome.jsx";
import { ReviewView } from "./review.jsx";
import { classicYear, colorName, moveNumbers, rankLabel } from "./game-view.js";
import { FirstCountNote } from "./beginner.jsx";

// Shared with the review (review.jsx); classicYear and rankLabel are still imported from here.
export { classicYear, rankLabel };

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
    showCoords: s.settings.coords, coordsAround: s.settings.coordsAround, tall: s.settings.tallBoard,
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
          {g.proposal && !scoring && !node.result && !g.passAsk && <ProposalBar />}
          {focus && g.passAsk && <PassAsk float />}
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
    game.moveNumber ? tn("play.moveN", game.moveNumber) : null,
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

/**
 * A pass just played, in words: "You passed", "The computer passed",
 * "Black passed" (a game between two people); "" otherwise.
 */
function passText(g) {
  const last = g.game.current.move;
  if (!last?.pass) return "";
  if (g.opponent === "human") return t("play.passedBy", [colorName(last.color)]);
  return t(last.color === g.humanColor ? "play.youPassed" : "play.theyPassed");
}

/** The status line: whose turn it is, after what a pass just played says. */
function statusText(g) {
  const passed = !g.scoring && !g.game.current.result ? passText(g) : "";
  const now = turnText(g);
  return passed ? `${passed} · ${now}` : now;
}

function turnText(g) {
  const game = g.game;
  if (g.scoring) return t("play.scoring");
  if (game.current.result) return C.resultText(game.current.result);
  if (g.pending) return t("teach.paused");
  if (g.engineFailed && C.isComputerTurn()) return t("play.engineFailed");
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
      {g.clock && <ClockFace color={g.game.turn} mini />}
      <IconButton icon="pass" label={t("common.pass")} onClick={C.requestPass} />
      <IconButton icon="undo" label={t("common.undo")} onClick={C.undo} />
      <IconButton icon="focus" label={t("play.exitFocus")} active onClick={C.toggleFocus} />
    </div>
  );
}

/**
 * The pass waiting for its confirmation: in the panel (or over the board
 * in focus mode, which has no panel). Its button takes the focus, and gives
 * it back when the question goes.
 */
function PassAsk({ float = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = /** @type {HTMLElement | null} */ (document.activeElement);
    ref.current?.querySelector(".btn.primary")?.focus({ preventScroll: true });
    return () => {
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div class={`pass-ask enter-up ${float ? "float-bar" : ""}`} role="group" aria-label={t("play.passConfirm")} ref={ref}>
      <p>{C.passAskText()}</p>
      <div class="actions">
        <Button kind="primary" size="sm" icon="pass" onClick={C.passNow}>
          {t("common.pass")}
        </Button>
        <Button kind="ghost" size="sm" onClick={C.cancelPass}>
          {t("common.cancel")}
        </Button>
      </div>
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
    sub = rankLabel(g.rank);
  } else if (g.opponent === "ai") {
    name = t("play.you");
    // Your level — the estimate once a game is rated, else what you said you are.
    const e = C.playerEstimate({ size: game.size });
    const rank = e.games > 0 ? e.rank : C.playerRankNow();
    if (rank != null) sub = rankLabel(rank);
  } else name = colorName(color);
  const fx = g.captureFx && g.captureFx.color === color && performance.now() - g.captureFx.at < 1200 ? g.captureFx : null;
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
      {g.clock && <ClockFace color={color} active={active} />}
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

/**
 * One side's clock. It re-renders on each tick by itself
 * (store.js useClockTicks); a tick no longer re-renders the app.
 */
function ClockFace({ color, active = false, mini = false }) {
  useClockTicks();
  const clock = state.game?.clock;
  const side = clock ? clock[color === BLACK ? "b" : "w"] : null;
  if (!side) return null;
  if (mini) return <span class="clock mini">{formatClock(side)}</span>;
  const low = side.left <= 10 && active;
  return (
    <span class={`clock ${active ? "running" : ""} ${low ? "low" : ""}`} aria-label={t("play.clock")}>
      {side.inByo && clock.mode === "byoyomi" ? `${formatClock(side)} ×${side.periods}` : formatClock(side)}
    </span>
  );
}

function EvalBar() {
  const g = state.game;
  const e = g.eval;
  if (!state.settings.showEval || !e || !Number.isFinite(e.winrate)) return null;
  const b = Math.round(e.winrate * 100);
  const lead = e.scoreLead;
  return (
    <div class="eval-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={b} aria-label={t("play.evalLabel")}>
      <div class="eval-track">
        <i style={{ width: `${b}%` }} />
      </div>
      <span class="fine">{t("play.evalText", [lead >= 0 ? t("common.black") : t("common.white"), formatPoints(Math.round(Math.abs(lead) * 2) / 2)])}</span>
    </div>
  );
}

/** The verdict on the player's last move (play/verdict.js), when the balance is shown or the game teaches. */
function verdictShown(g) {
  return g.opponent === "ai" && !!g.verdicts && (state.settings.showEval || C.teachingOn());
}

function LastVerdict() {
  const g = state.game;
  if (!verdictShown(g) || g.pending) return null;
  const line = g.game.mainLine();
  const node = [...line].reverse().find((n) => n.move && !n.move.pass && n.move.color === g.humanColor);
  const loss = node ? g.verdicts[node.id] : null;
  const v = verdictOf(loss, state.settings.playerRank);
  if (!v) return null;
  const pts = formatPoints(Math.round(loss * 2) / 2);
  return (
    <p class={`verdict v-${v}`} aria-live="polite">
      <i aria-hidden="true" />
      {t(`play.verdict.${v}`, [pts])}
    </p>
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
  // Before the first move, one quiet line (the opening tip while
  // teaching, else where to start and how to find the keys) instead of a
  // heading, "No moves yet" and a table of keys.
  const tip = line.length < 12 && C.teachingOn() && g.opponent === "ai" && game.size >= 13;
  return (
    <section class="moves" aria-label={t("play.moveList")}>
      {line.length > 0 && <h2 class="slot-title">{t("play.moveList")}</h2>}
      {tip && <p class="quiet-note opening-tip">{t("tip.opening." + (Math.floor(line.length / 4) + 1))}</p>}
      {line.length === 0 ? (
        !tip && (
          <p class="moves-empty fine">
            {t("play.firstMove")}{" "}
            <button type="button" class="link" onClick={() => C.openSheet("shortcuts")}>
              {t("play.keys")}
            </button>
          </p>
        )
      ) : (
        <ol class="move-grid" ref={ref}>
          {line.map((n, k) => {
            const i = k + 1;
            const m = n.move;
            const v = verdictShown(g) ? verdictOf(g.verdicts[n.id], state.settings.playerRank) : null;
            const marked = v === "slack" || v === "mistake";
            return (
              <li class={`${i === line.length ? "last" : ""} ${marked ? `v-${v}` : ""}`}>
                <button type="button" onClick={() => peek(i)} title={marked ? `${t("play.peek")} · ${t(`play.verdict.${v}Short`)}` : t("play.peek")}>
                  <span class="mn">{i}</span>
                  <Stone color={m.color} size={8} />
                  <span>{m.pass ? t("common.pass") : coordLabel(m.x, m.y, game.size)}</span>
                  {marked && <i class="v-dot" aria-label={t(`play.verdict.${v}Short`)} />}
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
      <p>{warningText(formatPoints(p.loss), p.reason)}</p>
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
      <LastVerdict />
      <div class="panel-state" key={g.scoring ? "scoring" : over ? "over" : g.pending ? "pending" : "play"}>
        {!g.scoring && !over && (
          <p class="status-line" aria-live="off">
            {statusText(g)}
          </p>
        )}
        {g.engineFailed && playing && C.isComputerTurn() && (
          <div class="actions">
            <Button kind="primary" icon="resume" onClick={C.retryComputerMove}>
              {t("play.retryMove")}
            </Button>
          </div>
        )}
        {g.pending && <TeachCard />}
        {g.scoring && <ScoringCard />}
        {over && !g.scoring && <ResultCard />}
        {playing && g.passAsk && <PassAsk />}
        {playing && !g.pending && !g.passAsk && (
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
                { icon: "redo", label: t("common.redo"), kbd: `${SHIFT}${MOD}Z`, onClick: C.redo, disabled: !C.canRedo() },
                { icon: "bulb", label: t("common.hint"), kbd: `${SHIFT}${MOD}H`, onClick: C.askHint, disabled: !myTurn || g.thinking },
                { icon: "chart", label: t("play.reviewSoFar"), onClick: C.reviewCurrentGame, disabled: game.mainLine().length < 2 },
                { icon: "check", label: t("play.countNow"), onClick: C.acceptCount, disabled: game.moveNumber < game.size * 2 },
                "-",
                { icon: "save", label: g.saved ? t("play.saveAgain") : t("play.save"), onClick: () => C.saveToLibrary(), disabled: game.moveNumber === 0 },
                { icon: "share", label: t("common.exportSgf"), onClick: () => C.exportSGF() },
                { icon: "focus", label: t("play.focus"), kbd: `${MOD}.`, onClick: C.toggleFocus },
                "-",
                { icon: "flag", label: t("common.resign"), onClick: C.requestResign, danger: true },
              ]}
            />
          </div>
        )}
        {g.hint && (
          <p class="note">
            <Icon name="bulb" size={15} /> {hintText(coordLabel(g.hint.x, g.hint.y, game.size), g.hint.reason)}
          </p>
        )}
        {g.ghost && <p class="fine">{t("play.confirmHint")}</p>}
      </div>
      <NarrowFold label={t("play.moveList")}>
        <MoveStrip />
      </NarrowFold>
      {!state.engine.available && g.opponent === "ai" && <p class="fine panel-note">{t("play.offlineNote")}</p>}
    </aside>
  );
}

function ScoringCard() {
  const g = state.game;
  return (
    <ScoreCard sc={g.scoring} komi={g.game.komi} onConfirm={C.confirmScore} onCancel={C.resumePlay}>
      <FirstCountNote />
    </ScoreCard>
  );
}

/**
 * A finished game on the board without its review (rare: the review opens
 * by itself when a game ends): the result and the way into the review.
 */
/**
 * The game in one line under the result: its length, and how your moves
 * went (play/verdict.js) when they were judged.
 */
function GameTally() {
  const g = state.game;
  const moves = g.game.mainLine().length - 1;
  // Only the moves the game kept (a move taken back keeps its verdict in g.verdicts).
  const counts = tallyVerdicts(g.game.mainLine(), g.verdicts, state.settings.playerRank);
  const judged = counts.good + counts.slack + counts.mistake > 0;
  return (
    <div class="game-tally">
      <span>{tn("play.moveN", moves)}</span>
      {judged && <span>{t("play.result.verdicts", [counts.good, counts.slack, counts.mistake])}</span>}
    </div>
  );
}

function ResultCard() {
  const g = state.game;
  const headline = C.resultHeadline(g);
  return (
    <section class="card result-card enter-up" aria-live="polite">
      <span class="eyebrow">{t("play.gameOver")}</span>
      <strong class="result-big">{headline}</strong>
      {headline !== C.resultText(g.game.current.result) && <span class="muted">{C.resultText(g.game.current.result)}</span>}
      {C.unratedReason(g) && <span class="fine unrated-note">{C.unratedReason(g)}</span>}
      <GameTally />
      <div class="actions center">
        <Button kind="primary" icon="chart" onClick={() => C.openPostGame(g, { inPlace: false })}>
          {t("play.reviewGame")}
        </Button>
        <Button kind="ghost" onClick={() => C.openNewGame()}>
          {t("play.playAgain")}
        </Button>
      </div>
    </section>
  );
}

