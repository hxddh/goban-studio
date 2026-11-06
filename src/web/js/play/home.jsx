/**
 * Play's home (docs/v9.md, "Two spaces"): the game in progress or the
 * suggested game, with the one primary button; below it the history of your
 * games, the classics and the opening explorer.
 *
 * Wave 2b rebuilds Play around this (the post-game review on the same
 * board); the data underneath is final: games come from data/games.js,
 * the suggestion from the player model (model/player.js suggestedGame,
 * through app/play-ctl.js recommendedGame).
 */
import * as Games from "../data/games.js";
import { t } from "../i18n.js";
import { state, update } from "../app/store.js";
import * as C from "../app/controller.js";
import { rankLabel } from "../app/play.jsx";
import { estimateLabel } from "../app/estimate-label.js";
import { Button, Icon, MoreMenu, Segmented, Thumb } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";
import { ExplorerEntries } from "../app/explorer.jsx";
import { useJobs } from "../app/background.jsx";

/** A game is on the board and not finished. */
export function gameInProgress(g = state.game) {
  return !!g && g.game.moveNumber > 0 && !g.game.current.result;
}

export function PlayHome() {
  const P = state.play;
  const tab = P.tab;
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
        <div class="tabs-row">
          <Segmented
            class="tabs"
            label={t("nav.play")}
            value={tab}
            onChange={(v) => update((s) => (s.play = { ...s.play, tab: v }))}
            options={[
              { value: "mine", label: t("library.mine") },
              { value: "classics", label: t("library.classics") },
              { value: "explorer", label: t("explorer.tab") },
            ]}
          />
        </div>
        {tab === "mine" && <MyGames />}
        {tab === "classics" && <Classics />}
        {tab === "explorer" && <ExplorerEntries />}
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

/** A row's report being made ("Analysing… 40%"). */
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

/** The history of your games (and imported records). */
function MyGames() {
  useJobs(); // a row's "Analysing… 40%" follows its report
  const P = state.play;
  const all = Games.listGames();
  const games = Games.filterGames(all, { kind: P.kind, query: P.query });
  const set = (patch) => update((s) => (s.play = { ...s.play, ...patch }));
  if (!all.length) {
    return (
      <section class="empty">
        <Icon name="library" size={28} />
        <h2>{t("library.empty")}</h2>
        <p class="muted">{t("library.emptyHelp")}</p>
        <div class="actions center">
          <Button onClick={C.pickImport}>{t("library.import")}</Button>
        </div>
      </section>
    );
  }
  return (
    <>
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
      {games.length === 0 ? (
        <p class="muted center-text">{t("library.noMatch")}</p>
      ) : (
        <ul class="group games">
          {games.map((g) => {
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
                    ...(C.hasReport(g) ? [{ icon: "chart", label: t("report.title"), onClick: () => C.openReport(g.id, { space: "play" }) }] : []),
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
    </>
  );
}

function Classics() {
  const done = state.profile.classics || {};
  return (
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
