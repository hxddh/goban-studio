/**
 * Play's home (docs/v9.md, "Two spaces"; docs/design.md §1): what to play,
 * and what you played. The game in progress or the suggested game comes
 * first, with the page's one primary button (a quieter 9×9 beside the
 * suggestion); then your games as a compact list, the classics, and one
 * row that opens the opening explorer. No tabs: one column, every element
 * about playing.
 *
 * A game in the list opens in the same review as after a game
 * (app/review-ctl.js), its stored analysis at once. The suggestion comes
 * from the player model (model/player.js suggestedGame, through
 * app/play-ctl.js recommendedGame).
 */
import * as Games from "../data/games.js";
import { t } from "../i18n.js";
import { state, update } from "../app/store.js";
import * as C from "../app/controller.js";
import { rankLabel } from "../app/play.jsx";
import { estimateLabel } from "../app/estimate-label.js";
import { Button, Icon, MoreMenu, Thumb } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";
import { useJobs } from "../app/background.jsx";

/** A game is on the board and not finished. */
export function gameInProgress(g = state.game) {
  return !!g && g.game.moveNumber > 0 && !g.game.current.result;
}

/** With more games than this the list gets its filter and search, and shows this many at first. */
export const LIST_COMPACT = 8;

export function PlayHome() {
  return (
    <>
      <Toolbar>
        <Button size="sm" icon="upload" onClick={C.pickImport}>
          {t("library.import")}
        </Button>
      </Toolbar>
      <div class="page play-home">
        <header class="page-head">
          <h1>{t("nav.play")}</h1>
        </header>
        {gameInProgress() ? <ContinueHero /> : <SuggestedHero />}
        <Level />
        <MyGames />
        <Classics />
        <Explorer />
      </div>
    </>
  );
}

function ContinueHero() {
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

function SuggestedHero() {
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
          {t("play.suggest.quick9")}
        </button>
      </div>
    </section>
  );
}

/** The estimate as one number with its ±, once a game is rated. */
function Level() {
  const e = C.playerEstimate();
  if (!(e.games > 0)) return null;
  return (
    <p class="fine play-level">
      {t("play.home.level")}: <strong title={t("strength.about")}>{estimateLabel(e)}</strong> · {t("play.home.levelGames", [e.games])}
    </p>
  );
}

/** A row's analysis being made ("Analysing… 40%"). */
function rowNote(id) {
  const a = C.rowAnalysis(id);
  if (!a || a.queued) return null;
  return <span class="row-analysis">{t("sched.row.progress", [Math.round(a.progress * 100)])}</span>;
}

function fmtDate(value) {
  try {
    const lang = state.settings.lang;
    return new Date(value).toLocaleDateString(lang === "zh" ? "zh-CN" : lang, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

export function recordTitle(g) {
  if (g.name) return g.name;
  if (g.source === "import") return t("library.untitled");
  return g.opponent === "ai" ? t("library.vsEngine", [g.rank != null ? rankLabel(g.rank) : "KataGo"]) : t("library.twoPlayers");
}

function outcome(g) {
  if (!g.result) return { label: t("library.unfinished"), cls: "" };
  if (g.source === "import" || g.opponent !== "ai") return { label: C.resultText(g.result), cls: "" };
  const won = g.result.startsWith("B") === (g.humanColor !== -1);
  return { label: won ? t("library.won") : t("library.lost"), cls: won ? "good" : "bad" };
}

/** Whether the whole history is shown (the first LIST_COMPACT otherwise); kept for the session. */
let showAll = false;

/** Your games (and imported records): a compact list, newest first. */
function MyGames() {
  useJobs(); // a row's "Analysing… 40%" follows its analysis
  const P = state.play;
  const all = Games.listGames();
  const many = all.length > LIST_COMPACT;
  const games = many ? Games.filterGames(all, { kind: P.kind, query: P.query }) : all;
  const shown = many && !showAll && !P.query && P.kind === "all" ? games.slice(0, LIST_COMPACT) : games;
  const set = (patch) => update((s) => (s.play = { ...s.play, ...patch }));
  return (
    <section class="home-section home-games">
      <h2 class="section-title">{t("library.mine")}</h2>
      {!all.length && <p class="muted">{t("library.emptyHelp")}</p>}
      {many && (
        <div class="filters">
          <div class="chips" role="radiogroup" aria-label={t("library.filter")}>
            {["all", "won", "lost", "imported"].map((k) => (
              <button type="button" role="radio" aria-checked={P.kind === k} class={`chip ${P.kind === k ? "on" : ""}`} onClick={() => set({ kind: k })}>
                {t("library.kind." + k)}
              </button>
            ))}
          </div>
          <label class="search">
            <Icon name="search" size={15} />
            <input type="search" placeholder={t("library.search")} aria-label={t("library.search")} value={P.query} onInput={(e) => set({ query: e.currentTarget.value })} />
          </label>
        </div>
      )}
      {all.length > 0 && games.length === 0 && <p class="muted center-text">{t("library.noMatch")}</p>}
      {shown.length > 0 && (
        <ul class="group games">
          {shown.map((g) => {
            const o = outcome(g);
            return (
              <li class="game-item">
                <button type="button" class="group-row game-row" onClick={() => C.openRecord(g.id)} aria-label={`${recordTitle(g)} · ${o.label}`}>
                  <Thumb thumb={g.thumb} size={g.size} />
                  <span class="gr-text">
                    <strong>{recordTitle(g)}</strong>
                    <span>
                      {fmtDate(g.updatedAt)} · {g.size} × {g.size} · {t("play.moveN", [g.moves])}
                      {rowNote(g.id)}
                    </span>
                  </span>
                  <span class={`outcome ${o.cls}`}>{o.label}</span>
                </button>
                <MoreMenu
                  id={"rec-" + g.id}
                  label={t("a11y.moreFor", [recordTitle(g)])}
                  items={[
                    { icon: "edit", label: t("library.rename"), onClick: () => C.openSheet("rename", { id: g.id, name: g.name || recordTitle(g) }) },
                    { icon: "download", label: t("common.exportSgf"), onClick: () => C.exportRecord(g.id) },
                    "-",
                    { icon: "trash", label: t("common.delete"), danger: true, onClick: () => C.deleteRecord(g.id) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
      {shown.length < games.length && (
        <button
          type="button"
          class="link show-all"
          onClick={() => {
            showAll = true;
            update();
          }}
        >
          {t("play.home.showAll", [games.length])}
        </button>
      )}
    </section>
  );
}

function Classics() {
  const done = state.profile.classics || {};
  return (
    <section class="home-section home-classics">
      <h2 class="section-title">{t("library.classics")}</h2>
      <ul class="group collection">
        {C.CLASSICS.map((g) => (
          <li>
            <button type="button" class={`collection-row ${done[g.id]?.done ? "done" : ""}`} onClick={() => C.openClassic(g.id)}>
              <span class="collection-main">
                <strong>{C.tx(g.title)}</strong>
                <span class="muted">
                  {C.tx(g.blackName)} · {C.tx(g.whiteName)}
                </span>
              </span>
              <span class="fine">
                {String(g.date).split("..")[0]} · {C.resultText(g.result)}
              </span>
              {done[g.id]?.done && <Icon name="check" size={15} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The opening explorer: one row (the whole board first; its corner tree is one click inside). */
function Explorer() {
  return (
    <section class="home-section home-explorer">
      <ul class="group collection">
        <li>
          <button type="button" class="collection-row" data-explorer="whole" onClick={() => C.openExplorer("whole")}>
            <span class="collection-main">
              <strong>{t("play.home.explorer")}</strong>
              <span class="muted">{t("explorer.help")}</span>
            </span>
            <Icon name="next" size={15} />
          </button>
        </li>
      </ul>
    </section>
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
