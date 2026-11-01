/**
 * Play: the live game, scoring, the result, and review of any game.
 */
import { BLACK, WHITE, coordLabel, formatPoints } from "../rules.js";
import { rankParts, strengthById } from "../engine.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { Board, Button, CountUp, Icon, IconButton, MoreMenu, Stone, MOD, SHIFT } from "./parts.jsx";

export function rankLabel(id) {
  const r = rankParts(id);
  return t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n]);
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
    hoverColor: scoring ? null : game.turn,
    interactive: !g.thinking && (scoring ? true : game.phase === "playing" && !node.result && (g.opponent === "human" || game.turn === g.humanColor)),
  };
  return (
    <div class="workspace">
      <section class="stage" aria-label={t("nav.play")}>
        <div class="drag" data-drag />
        {focus && <FocusBar />}
        <Board model={model} onPlay={C.humanPlay} onHover={(v) => (v ? C.canPlayHere(v.x, v.y) : true)} />
      </section>
      {!focus && <PlayPanel />}
    </div>
  );
}

function statusText(g) {
  const game = g.game;
  if (g.scoring) return t("play.scoring");
  if (game.current.result) return C.resultText(game.current.result);
  if (g.thinking && C.isComputerTurn()) return t("play.thinking");
  if (g.thinking) return t("play.hintThinking");
  const color = t(game.turn === BLACK ? "common.black" : "common.white");
  if (g.opponent === "human") return t("play.toPlay", [color]);
  return game.turn === g.humanColor ? t("play.yourTurn") : t("play.theirTurn");
}

function FocusBar() {
  const g = state.game;
  return (
    <div class="focus-bar" role="toolbar" aria-label={t("play.focus")}>
      <span class="focus-status">
        <Stone color={g.game.turn} size={12} /> {statusText(g)}
      </span>
      <IconButton icon="pass" label={t("common.pass")} onClick={C.requestPass} />
      <IconButton icon="undo" label={t("common.undo")} onClick={C.undo} />
      <IconButton icon="focus" label={t("play.exitFocus")} onClick={C.toggleFocus} />
    </div>
  );
}

function PlayerRow({ color }) {
  const g = state.game;
  const game = g.game;
  const active = game.turn === color && game.phase === "playing" && !game.current.result && !g.scoring;
  const caps = game.board.getCaptures(color) || 0;
  let name;
  let sub;
  if (g.opponent === "ai" && color !== g.humanColor) {
    name = state.engine.available ? "KataGo" : t("play.offlineEngine");
    sub = rankLabel(g.strength);
  } else if (g.opponent === "ai") {
    name = t("play.you");
    sub = "";
  } else {
    name = t(color === BLACK ? "common.black" : "common.white");
    sub = "";
  }
  return (
    <div class={`player ${active ? "active" : ""}`}>
      <Stone color={color} size={22} />
      <div class="player-name">
        <strong>{name}</strong>
        {sub && <span>{sub}</span>}
      </div>
      <span class="player-caps" title={t("play.captures")}>
        {caps > 0 ? t("play.capturesN", [caps]) : ""}
      </span>
      {active && g.thinking && C.isComputerTurn() && <span class="thinking" aria-hidden="true"><i /><i /><i /></span>}
    </div>
  );
}

function PlayPanel() {
  const g = state.game;
  const game = g.game;
  const playing = game.phase === "playing" && !game.current.result && !g.scoring;
  const myTurn = g.opponent === "human" || game.turn === g.humanColor;
  const canUndo = !!game.current.parent && !g.thinking;
  const meta = [
    `${game.size} × ${game.size}`,
    t("play.komiN", [formatPoints(game.komi)]),
    game.handicap ? t("play.handicapN", [game.handicap]) : null,
    t("common.japanese"),
  ].filter(Boolean);
  return (
    <aside class="panel" aria-label={t("play.panel")}>
      <header class="panel-head" data-drag>
        <h1>{t("nav.play")}</h1>
        <Button kind="ghost" icon="plus" size="sm" onClick={() => C.openSheet("newGame")} title={`${t("common.newGame")} (${MOD}N)`}>
          {t("common.newGame")}
        </Button>
      </header>
      <section class="players" aria-label={t("play.players")}>
        <PlayerRow color={BLACK} />
        <PlayerRow color={WHITE} />
      </section>
      {!g.scoring && !game.current.result && (
        <p class="status-line" aria-live="off">
          {statusText(g)}
        </p>
      )}
      {g.scoring && <ScoringCard />}
      {game.current.result && !g.scoring && <ResultCard />}
      {playing && (
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
              { icon: "bulb", label: t("common.hint"), onClick: C.askHint, disabled: !myTurn || g.thinking },
              { icon: "chart", label: t("play.reviewSoFar"), onClick: C.reviewCurrentGame, disabled: game.mainLine().length < 2 },
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
      <footer class="panel-foot">
        <span>{meta.join(" · ")}</span>
        <span>{t("play.moveN", [game.moveNumber])}</span>
      </footer>
      {!state.engine.available && g.opponent === "ai" && <p class="fine">{t("play.offlineNote")}</p>}
    </aside>
  );
}

function ScoringCard() {
  const g = state.game;
  const sc = g.scoring;
  const s = sc.score;
  const pending = sc.source === "pending";
  return (
    <section class="card score-card" aria-live="polite">
      <h2>{t("score.title")}</h2>
      <p class="muted">{pending ? t("score.judging") : sc.source === "katago" ? t("score.engineMarked") : t("score.manual")}</p>
      <div class="score-pair">
        <div>
          <Stone color={BLACK} size={14} />
          <strong>
            <CountUp value={s.black} format={formatPoints} />
          </strong>
          <span>{t("score.detail", [s.blackTerritory, s.black - s.blackTerritory])}</span>
        </div>
        <div>
          <Stone color={WHITE} size={14} />
          <strong>
            <CountUp value={s.white} format={formatPoints} />
          </strong>
          <span>{t("score.detailKomi", [s.whiteTerritory, s.white - s.whiteTerritory - g.game.komi, formatPoints(g.game.komi)])}</span>
        </div>
      </div>
      <p class="score-result">{C.resultText(s.result)}</p>
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

function ResultCard() {
  const g = state.game;
  const r = g.game.current.result;
  const aids = [];
  if (g.undos) aids.push(t("play.undosN", [g.undos]));
  if (g.hints) aids.push(t("play.hintsN", [g.hints]));
  return (
    <section class="card result-card" aria-live="polite">
      <span class="eyebrow">{t("play.gameOver")}</span>
      <strong class="result-big">{C.resultHeadline(g)}</strong>
      {C.resultHeadline(g) !== C.resultText(r) && <span class="muted">{C.resultText(r)}</span>}
      {aids.length > 0 && <span class="fine">{aids.join(" · ")}</span>}
      <div class="actions center">
        <Button kind="primary" icon="chart" onClick={C.reviewCurrentGame}>
          {t("play.reviewGame")}
        </Button>
        <Button kind="ghost" onClick={() => C.openSheet("newGame")}>
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
  if (r.variation) {
    const km = r.keyMoves.find((k) => k.index === r.variation.index);
    if (km?.best && !km.best.pass && r.variation.kind === "played") marks.push({ ...km.best, type: "circle", tone: "good" });
  }
  const model = {
    size: game.size,
    board: node.board.signMap,
    lastMove: node.move,
    marks,
    ownership: C.reviewOwnershipMap(),
    territory: null,
    deadStones: [],
    variation: r.variation ? r.variation.moves : null,
    moveNumbers: r.variation ? null : moveNumbers(game),
    showCoords: s.settings.coords,
    material: s.settings.board,
    view: null,
    hoverColor: r.guess ? game.turn : null,
    interactive: !!r.guess && !r.guess.done,
  };
  return (
    <div class="workspace">
      <section class="stage" aria-label={t("review.title")}>
        <div class="drag" data-drag />
        <Board model={model} onPlay={C.guessPlay} />
        <ReviewNav />
      </section>
      <ReviewPanel />
    </div>
  );
}

function ReviewNav() {
  const r = state.review;
  const line = r.game.mainLine();
  const i = C.reviewIndex();
  const max = line.length - 1;
  return (
    <div class="review-nav" role="toolbar" aria-label={t("review.nav")}>
      <IconButton icon="first" label={t("review.first")} onClick={() => C.reviewGoto(0)} disabled={i === 0} />
      <IconButton icon="prev" label={`${t("review.previous")} (←)`} onClick={() => C.reviewStep(-1)} disabled={i === 0} />
      <input
        type="range"
        min="0"
        max={max}
        value={i}
        aria-label={t("review.position")}
        aria-valuetext={t("review.moveOf", [i, max])}
        onInput={(e) => C.reviewGoto(Number(e.currentTarget.value))}
        disabled={!!r.guess}
      />
      <IconButton icon="next" label={`${t("review.next")} (→)`} onClick={() => C.reviewStep(1)} disabled={i >= max || !!r.guess} />
      <IconButton icon="last" label={t("review.last")} onClick={() => C.reviewGoto(max)} disabled={i >= max || !!r.guess} />
      <span class="nav-count">{t("review.moveOf", [i, max])}</span>
    </div>
  );
}

function Chart() {
  const r = state.review;
  const pts = r.points;
  const n = pts.length;
  const W = 300;
  const H = 96;
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
  const onPick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    C.reviewGoto(Math.round(k * (n - 1)));
  };
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("review.chartLabel")} onClick={onPick}>
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
        {r.keyMoves.map((k) => pts[k.index] && <circle cx={x(k.index)} cy={y(pts[k.index].winrate)} r="3.5" class="chart-key" />)}
        <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} class="chart-cursor" />
      </svg>
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

function colorName(c) {
  return t(c === BLACK ? "common.black" : "common.white");
}

function KeyMove({ km }) {
  const r = state.review;
  const size = r.game.size;
  const best = km.best && !km.best.pass ? coordLabel(km.best.x, km.best.y, size) : null;
  const area = km.best && !km.best.pass ? t("area." + C_area(km.best, size)) : "";
  const active = r.variation?.index === km.index ? r.variation.kind : null;
  return (
    <li class={`key-move ${active ? "on" : ""}`}>
      <button type="button" class="key-head" onClick={() => C.reviewGoto(km.index)}>
        <Stone color={km.move.color} size={12} />
        <span>{t("review.moveLabel", [km.index, colorName(km.move.color), coordLabel(km.move.x, km.move.y, size)])}</span>
        <em>{t("review.lossN", [formatPoints(Math.round(km.loss * 2) / 2)])}</em>
      </button>
      <p>{best ? t("review.sentence", [area, best]) : t("review.sentenceNoBest")}</p>
      {best && (
        <div class="seg-mini">
          <button type="button" class={active === "played" ? "on" : ""} onClick={() => C.showVariation(km, "played")}>
            {t("review.showPlayed")}
          </button>
          <button type="button" class={active === "better" ? "on" : ""} onClick={() => C.showVariation(km, "better")}>
            {t("review.showBetter")}
          </button>
        </div>
      )}
    </li>
  );
}

function C_area(p, size) {
  const third = size / 3;
  const col = p.x < third ? "left" : p.x >= size - third ? "right" : "center";
  const row = p.y < third ? "top" : p.y >= size - third ? "bottom" : "center";
  if (row === "center" && col === "center") return "center";
  if (row === "center") return col;
  if (col === "center") return row;
  return `${row}-${col}`;
}

function ReviewPanel() {
  const r = state.review;
  const meta = r.meta;
  const game = r.game;
  const line = game.mainLine();
  const backLabel = meta.back === "library" ? t("nav.library") : t("review.backToGame");
  let title = t("review.title");
  let sub = "";
  if (meta.classic) {
    title = C.tx(meta.classic.title);
    sub = `${C.tx(meta.classic.blackName)} · ${C.tx(meta.classic.whiteName)} · ${meta.classic.date}`;
  } else if (meta.opening) {
    title = C.tx(meta.opening.title);
  } else if (meta.name) title = meta.name;
  const result = line[line.length - 1].result;
  const progress = r.analyzing ? Math.round((r.analyzed / line.length) * 100) : 100;
  return (
    <aside class="panel" aria-label={t("review.title")}>
      <header class="panel-head" data-drag>
        <button type="button" class="back" onClick={C.closeReview}>
          <Icon name="back" size={16} /> {backLabel}
        </button>
      </header>
      <div class="panel-title">
        <h1>{title}</h1>
        {sub && <p class="muted">{sub}</p>}
        {result && <p class="muted">{C.resultText(result)}</p>}
      </div>

      {r.guess ? (
        <GuessCard />
      ) : (
        <>
          <Chart />
          <p class="fine" aria-live="polite">
            {r.analyzing
              ? t(r.engine === "estimate" ? "review.estimating" : "review.analyzing", [progress])
              : r.engine === "katago"
                ? t("review.analyzedBy", [state.engine.name || "KataGo"])
                : t("review.estimateNote")}
          </p>
          <section class="key-moves">
            <h2>{t("review.keyMoves")}</h2>
            {r.keyMoves.length ? (
              <ol>
                {r.keyMoves.map((km) => (
                  <KeyMove km={km} />
                ))}
              </ol>
            ) : (
              <p class="muted">{r.analyzing ? t("review.waiting") : t("review.noKeyMoves")}</p>
            )}
          </section>
        </>
      )}

      {meta.classic && (
        <section class="card quiet">
          <p>{C.tx(meta.classic.note)}</p>
          {meta.classic.event && <p class="fine">{meta.classic.event}</p>}
        </section>
      )}
      {meta.opening && !r.guess && (
        <section class="card quiet">
          <p>{C.tx(meta.opening.text)}</p>
        </section>
      )}

      <div class="actions wrap">
        <Button kind="primary" icon="resume" onClick={C.playFromHere}>
          {t("review.playFromHere")}
        </Button>
        <IconButton icon="eye" label={t("review.ownership")} active={r.ownership} onClick={C.toggleOwnership} />
        <IconButton icon="target" label={t("review.guess")} active={!!r.guess} onClick={C.toggleGuess} />
        <IconButton icon="download" label={t("common.exportSgf")} onClick={() => C.exportSGF(game, meta.name || (meta.classic ? meta.classic.id : "goban-studio"))} />
      </div>
    </aside>
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

export { SHIFT };
