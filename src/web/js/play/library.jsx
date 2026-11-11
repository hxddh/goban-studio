/**
 * The Library (棋谱): the games left unfinished (a short group of their
 * own), your games and records as a compact list with its filter, search
 * and order, the opening explorer and the classics; Open board and Import
 * SGF in the toolbar (LibraryHome). A game in the list opens in the same
 * review as after a game (app/review-ctl.js), its stored analysis at once.
 */
import * as Games from "../data/games.js";
import { t, textLang, tn } from "../i18n.js";
import { state, update } from "../app/store.js";
import * as C from "../app/controller.js";
import { classicYear, rankLabel } from "../app/play.jsx";
import { Button, Icon, MoreMenu, Thumb, MOD } from "../app/parts.jsx";
import { formatPoints } from "../rules.js";
import { playersOf, relativeDay } from "./import.js";
import { Toolbar } from "../app/chrome.jsx";
import { useJobs } from "../app/background.jsx";

/** The list shows this many games at first ("Show all" for the rest). */
const LIST_COMPACT = 8;
/** From this many games the list has its filter, search and order. */
const LIST_CONTROLS = 6;
/** Unfinished games shown before "Show all"; with more than this, "Clear unfinished games…" is offered. */
const UNFINISHED_SHOWN = 3;

/** Library: the unfinished games, your games and records, the opening explorer, the classics. */
export function LibraryHome() {
  return (
    <>
      <Toolbar>
        <Button kind="ghost" size="sm" icon="grid" class="open-board" onClick={() => C.openFreeBoard()}>
          {t("board.open")}
        </Button>
        <Button size="sm" icon="tray" onClick={C.pickImport} title={`${t("library.import")} (${MOD}O)`}>
          {t("library.import")}
        </Button>
        <MoreMenu
          id="lib-import"
          label={t("import.more")}
          items={[
            { icon: "tray", label: t("import.chooseFiles"), kbd: `${MOD}O`, onClick: C.pickImport },
            { icon: "clipboard", label: t("import.paste"), kbd: `${MOD}V`, onClick: () => C.pasteSGF() },
          ]}
        />
      </Toolbar>
      <div class="page library-home">
        <header class="page-head">
          <h1>{t("nav.library")}</h1>
        </header>
        <MyGames />
        <Explorer />
        <Classics />
      </div>
    </>
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

/** When a game was last played: "Today", "Yesterday", "3 days ago" within the week, then the date. */
function whenText(at, now = Date.now()) {
  const days = relativeDay(at, now);
  if (days === 0) return t("library.today");
  if (days === 1) return t("library.yesterday");
  if (days != null) return tn("library.daysAgo", days);
  return fmtDate(at);
}

export function recordTitle(g) {
  if (g.name) return g.name;
  if (g.source === "board") return t("board.free");
  if (g.source === "import") return t("library.untitled");
  return g.opponent === "ai" ? t("library.vsEngine", [g.rank != null ? rankLabel(g.rank) : "KataGo"]) : t("library.twoPlayers");
}

export function outcome(g) {
  // Only a game played here can be unfinished; a record or a board without a result says nothing.
  if (!g.result) return { label: g.source === "game" ? t("library.unfinished") : "", cls: "" };
  if (g.source === "import" || g.opponent !== "ai") return { label: C.resultText(g.result), cls: "" };
  const won = g.result.startsWith("B") === (g.humanColor !== -1);
  return { label: won ? t("library.won") : t("library.lost"), cls: won ? "good" : "bad" };
}

/** Who played, when the title does not say it: the opponent of a named game, the players of an imported record. */
function whoText(g) {
  if (g.source === "import") {
    const who = playersOf(g.playerBlack, g.playerWhite);
    return who ? `${who.black} · ${who.white}` : "";
  }
  if (!g.name || g.source === "board") return "";
  return g.opponent === "ai" ? t("library.vsEngine", [g.rank != null ? rankLabel(g.rank) : "KataGo"]) : t("library.twoPlayers");
}

/**
 * A row's facts, in one line: when, the board, the moves, who (when the
 * title does not say), and the biggest swing of an analysed game. The
 * names of a record are tagged with their script's language (a Japanese
 * or Korean name keeps its own glyphs whatever the interface language).
 */
function Facts({ g, swing = true }) {
  const turn = swing && g.swing ? t("library.swing", [g.swing.index, formatPoints(g.swing.loss)]) : "";
  const who = whoText(g);
  const before = [whenText(g.updatedAt), `${g.size} × ${g.size}`, tn("play.moveN", g.moves)].join(" · ");
  return (
    <>
      {before}
      {who && " · "}
      {who && <bdi lang={textLang(who) || undefined}>{who}</bdi>}
      {turn && " · " + turn}
    </>
  );
}

/** One game of the list. `unfinished`: its click continues the game, and its menu offers a look instead. */
function GameRow({ g, unfinished = false }) {
  const o = outcome(g);
  const title = recordTitle(g);
  const rename = { icon: "edit", label: t("library.rename"), onClick: () => C.openSheet("rename", { id: g.id, name: g.name || title }) };
  const exportIt = { icon: "share", label: t("common.exportSgf"), onClick: () => C.exportRecord(g.id) };
  const remove = { icon: "trash", label: t("common.delete"), danger: true, onClick: () => C.deleteRecord(g.id) };
  return (
    <li class={`game-item ${unfinished ? "unfinished" : ""}`}>
      <button type="button" class="group-row game-row" onClick={() => C.openRecord(g.id)} aria-label={unfinished ? `${t("library.continue")}: ${title}` : [title, o.label].filter(Boolean).join(" · ")}>
        <Thumb thumb={g.thumb} size={g.size} />
        <span class="gr-text">
          <strong lang={textLang(title) || undefined}>{title}</strong>
          <span>
            <Facts g={g} swing={!unfinished} />
            {rowNote(g.id)}
          </span>
        </span>
        {unfinished ? (
          <span class="row-continue">
            {t("library.continue")}
            <Icon name="next" size={14} />
          </span>
        ) : (
          o.label && <span class={`outcome ${o.cls}`}>{o.label}</span>
        )}
      </button>
      {unfinished ? (
        <MoreMenu id={"unf-" + g.id} label={t("a11y.moreFor", [title])} items={[{ icon: "eye", label: t("library.look"), onClick: () => C.lookAtRecord(g.id) }, exportIt, "-", remove]} />
      ) : (
        <MoreMenu id={"rec-" + g.id} label={t("a11y.moreFor", [title])} items={[rename, exportIt, "-", remove]} />
      )}
    </li>
  );
}

/** The games left unfinished: a short group of their own, each row continuing its game. */
function Unfinished({ games }) {
  if (!games.length) return null;
  const shown = state.ui.allUnfinished ? games : games.slice(0, UNFINISHED_SHOWN);
  return (
    <div class="games-group unfinished-group">
      <div class="group-head">
        <h3 class="slot-title">{t("library.unfinished")}</h3>
        {games.length > UNFINISHED_SHOWN && (
          <button type="button" class="link quiet clear-unfinished" onClick={C.clearUnfinished}>
            {t("library.clearUnfinished")}
          </button>
        )}
      </div>
      <ul class="group games">
        {shown.map((g) => (
          <GameRow g={g} unfinished />
        ))}
      </ul>
      {shown.length < games.length && (
        <button
          type="button"
          class="link show-all show-unfinished"
          onClick={() => {
            state.ui.allUnfinished = true;
            update();
          }}
        >
          {t("play.home.showAll", [games.length])}
        </button>
      )}
    </div>
  );
}

/** Your games (and imported records): the unfinished ones first, then a compact list. */
function MyGames() {
  useJobs(); // a row's "Analysing… 40%" follows its analysis
  const P = state.play;
  const { unfinished, finished: all } = Games.groupGames(Games.listGames());
  const controls = all.length >= LIST_CONTROLS;
  const sort = Games.SORTS.includes(P.sort) ? P.sort : "newest";
  const games = controls ? Games.sortGames(Games.filterGames(all, { kind: P.kind, query: P.query }), sort) : all;
  const compact = all.length > LIST_COMPACT && !state.ui.allGames && !P.query && P.kind === "all";
  const shown = compact ? games.slice(0, LIST_COMPACT) : games;
  const set = (patch) => update((s) => (s.play = { ...s.play, ...patch }));
  return (
    <section class="home-section home-games">
      <h2 class="section-title">{t("library.mine")}</h2>
      {!all.length && !unfinished.length && <p class="muted">{t("library.emptyHelp")}</p>}
      <Unfinished games={unfinished} />
      {all.length > 0 && (
        <div class="games-group">
          {unfinished.length > 0 && (
            <div class="group-head">
              <h3 class="slot-title">{t("library.finished")}</h3>
            </div>
          )}
          {controls && (
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
              <MoreMenu id="lib-sort" icon="sort" label={t("library.sort")} text={t("library.sort." + sort)} items={Games.SORTS.map((k) => ({ label: t("library.sort." + k), checked: sort === k, onClick: () => set({ sort: k }) }))} />
            </div>
          )}
          {games.length === 0 && <p class="muted center-text">{t("library.noMatch")}</p>}
          {shown.length > 0 && (
            <ul class="group games">
              {shown.map((g) => (
                <GameRow g={g} />
              ))}
            </ul>
          )}
          {shown.length < games.length && (
            <button
              type="button"
              class="link show-all"
              onClick={() => {
                state.ui.allGames = true;
                update();
              }}
            >
              {t("play.home.showAll", [games.length])}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Classics shown before "All classics" (the best-known first, as in content/classics.js). */
export const CLASSICS_SHOWN = 4;

function Classics() {
  const done = state.profile.classics || {};
  const list = state.ui.allClassics ? C.CLASSICS : C.CLASSICS.slice(0, CLASSICS_SHOWN);
  return (
    <section class="home-section home-classics">
      <h2 class="section-title">{t("library.classics")}</h2>
      <ul class="group collection">
        {list.map((g) => (
          <li>
            <button type="button" class={`collection-row ${done[g.id]?.done ? "done" : ""}`} onClick={() => C.openClassic(g.id)}>
              <span class="collection-main">
                <strong>{C.tx(g.title)}</strong>
                <span class="muted">
                  {C.tx(g.blackName)} · {C.tx(g.whiteName)}
                </span>
              </span>
              <span class="fine">
                {classicYear(g.date)} · {C.resultText(g.result)}
              </span>
              {done[g.id]?.done && <Icon name="check" size={15} />}
            </button>
          </li>
        ))}
      </ul>
      {list.length < C.CLASSICS.length && (
        <button
          type="button"
          class="link show-all"
          onClick={() => {
            state.ui.allClassics = true;
            update();
          }}
        >
          {t("play.home.allClassics", [C.CLASSICS.length])}
        </button>
      )}
    </section>
  );
}

/** Openings and joseki: a section of its own, one row for the whole board and one for the corner. */
function Explorer() {
  return (
    <section class="home-section home-explorer">
      <h2 class="section-title">{t("play.home.explorer")}</h2>
      <p class="muted section-note">{t("explorer.help")}</p>
      <ul class="group collection">
        {["whole", "corner"].map((mode) => (
          <li>
            <button type="button" class="collection-row" data-explorer={mode} onClick={() => C.openExplorer(mode)}>
              <span class="collection-main">
                <strong>{t("explorer." + mode)}</strong>
                <span class="muted">{t("explorer.row." + mode)}</span>
              </span>
              <Icon name="next" size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
