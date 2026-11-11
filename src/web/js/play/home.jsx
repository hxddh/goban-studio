/**
 * Play without a game on the board (下棋): the suggested game with the
 * page's one primary button, a quieter 9×9 beside it, and New game for
 * every other setting (PlayStart). Today (app/today.jsx) shares the heroes.
 * The suggestion comes from the player model (model/player.js
 * suggestedGame, through app/play-ctl.js recommendedGame).
 */
import * as Games from "../data/games.js";
import { t, tn } from "../i18n.js";
import { state } from "../app/store.js";
import * as C from "../app/controller.js";
import { rankLabel } from "../app/play.jsx";
import { estimateLabel } from "../app/estimate-label.js";
import { Button, Thumb } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";

/**
 * A game is in progress: on the board, not finished, and with at least one
 * move of the player's (the same rule that keeps it when something
 * replaces it, play-ctl unfinishedGame; a board where only the computer
 * moved is not one).
 */
export function gameInProgress(g = state.game) {
  return C.unfinishedGame(g);
}

/** Play with no game on the board: what to play next. */
export function PlayStart() {
  return (
    <>
      <Toolbar>
        <Button size="sm" icon="plus" onClick={() => C.openNewGame()}>
          {t("common.newGame")}
        </Button>
      </Toolbar>
      <div class="page play-home">
        <header class="page-head">
          <h1>{t("nav.play")}</h1>
        </header>
        {gameInProgress() ? <ContinueHero /> : <SuggestedHero />}
        <Level />
      </div>
    </>
  );
}

export function ContinueHero() {
  const g = state.game;
  return (
    <section class="hero enter-up">
      <Thumb thumb={Games.thumbnail(g.game)} size={g.game.size} />
      <div class="hero-text">
        <span class="eyebrow">{t("library.inProgress")}</span>
        <h2>{t("library.continueTitle", [g.game.size, g.game.moveNumber])}</h2>
        <p class="muted">{g.opponent === "ai" ? t("library.vsEngine", [rankLabel(g.rank)]) : t("library.twoPlayers")}</p>
      </div>
      <Button kind="primary" size="lg" onClick={C.continueCurrent}>
        {t("library.continue")}
      </Button>
    </section>
  );
}

function playSuggested(rec, quick) {
  const g = quick ? rec.quick : rec;
  C.newGame({ size: g.size, opponentRank: g.opponentRank, handicap: g.handicap, opponent: "ai", color: 1 });
}

export function SuggestedHero() {
  const rec = C.recommendedGame();
  const why = `${rec.handicap ? t("play.suggest.handicap", [rec.handicap]) : t("play.suggest.even")} · ${rec.weak ? t("play.suggest.because", [rec.weak.theme === "endgame" ? t("topic.endgame") : C.themeName(rec.weak.theme)]) : t("play.suggest.level")}`;
  return (
    <section class="hero enter-up">
      <EmptyBoard size={rec.size} />
      <div class="hero-text">
        <span class="eyebrow">{t("play.suggest.title")}</span>
        <h2>{t("play.suggest.game", [rec.size, rankLabel(rec.label)])}</h2>
        <p class="muted">{why}</p>
      </div>
      <div class="hero-actions">
        <Button kind="primary" size="lg" onClick={() => playSuggested(rec)}>
          {t("play.suggest.play")}
        </Button>
        <button type="button" class="link" onClick={() => playSuggested(rec, true)}>
          {t("play.suggest.other", [rec.quick.size])}
        </button>
      </div>
    </section>
  );
}

/** The estimate as one number with its ±, once a game is rated. */
export function Level() {
  const e = C.playerEstimate();
  if (!(e.games > 0)) return null;
  return (
    <p class="fine play-level">
      {t("common.label", [t("play.home.level")])}<strong title={t("strength.about")}>{estimateLabel(e)}</strong> · {tn("play.home.levelGames", e.games)}
    </p>
  );
}

/** An empty board of the suggested size, as the hero's picture. */
function EmptyBoard({ size }) {
  const n = size;
  const pad = 6;
  const span = 88;
  const step = span / (n - 1);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = pad + i * step;
    lines.push(<line x1={pad} x2={pad + span} y1={p} y2={p} />, <line y1={pad} y2={pad + span} x1={p} x2={p} />);
  }
  const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
  return (
    <svg class="empty-board" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="4" />
      {lines}
      {stars.flatMap((a) => stars.map((b) => <circle cx={pad + a * step} cy={pad + b * step} r="1" />))}
    </svg>
  );
}
