/**
 * Library: the game in progress, my games, classic games, and openings
 * (the explorer and the pro-opening drills, v8: one tab).
 */
import * as Lib from "../library.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { ReviewView, rankLabel } from "./play.jsx";
import { Button, Icon, MoreMenu, Segmented, Thumb } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";
import { ExplorerEntries, ExplorerView } from "./explorer.jsx";
import { useJobs } from "./background.jsx";

export function LibraryView() {
  if (state.review && state.review.meta.space === "library") return <ReviewView />;
  const L = state.library;
  if (L.explorer) return <ExplorerView />;
  // v8: the pro openings live with the explorer (one place for openings).
  const tab = L.tab === "openings" ? "explorer" : L.tab;
  return (
    <>
    <Toolbar>
      <Button size="sm" icon="upload" onClick={C.pickImport}>
        {t("library.import")}
      </Button>
    </Toolbar>
    <div class="page">
      <header class="page-head">
        <h1>{t("nav.library")}</h1>
      </header>
      <ContinueCard />
      <div class="tabs-row">
      <Segmented
        class="tabs"
        label={t("nav.library")}
        value={tab}
        onChange={(v) => update((s) => (s.library = { ...s.library, tab: v }))}
        options={[
          { value: "mine", label: t("library.mine") },
          { value: "classics", label: t("library.classics") },
          { value: "explorer", label: t("explorer.tab") },
        ]}
      />
      </div>
      {tab === "mine" && <MyGames />}
      {tab === "classics" && <Classics />}
      {tab === "explorer" && (
        <>
          <ExplorerEntries />
          <Openings />
        </>
      )}
    </div>
    </>
  );
}

/** v7: a row's report being made ("Analysing… 40%"). */
function rowNote(id) {
  // v8: only the game being analysed shows it; waiting games say nothing.
  const a = C.rowAnalysis(id);
  if (!a || a.queued) return null;
  return <span class="row-analysis">{t("sched.row.progress", [Math.round(a.progress * 100)])}</span>;
}

function ContinueCard() {
  const g = state.game;
  if (!g || g.game.moveNumber === 0 || g.game.current.result) return null;
  return (
    <ul class="group">
      <li class="group-row game-row">
        <Thumb thumb={Lib.thumbnail(g.game)} size={g.game.size} />
        <span class="gr-text">
          <strong>{t("library.continueTitle", [g.game.size, g.game.moveNumber])}</strong>
          <span>
            {t("library.inProgress")} · {g.opponent === "ai" ? t("library.vsEngine", [rankLabel(g.rank)]) : t("library.twoPlayers")}
          </span>
        </span>
        <Button size="sm" onClick={C.continueCurrent}>
          {t("library.continue")}
        </Button>
      </li>
    </ul>
  );
}

function fmtDate(value) {
  try {
    const lang = state.settings.lang;
    return new Date(value).toLocaleDateString(lang === "zh" ? "zh-CN" : lang, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

function recordTitle(g) {
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

function MyGames() {
  useJobs(); // a row's "Analysing… 40%" follows its report
  const L = state.library;
  const all = Lib.listGames();
  const games = Lib.filterGames(all, { kind: L.kind, query: L.query });
  const set = (patch) => update((s) => (s.library = { ...s.library, ...patch }));
  if (!all.length) {
    return (
      <section class="empty">
        <Icon name="library" size={28} />
        <h2>{t("library.empty")}</h2>
        <p class="muted">{t("library.emptyHelp")}</p>
        <div class="actions center">
          <Button kind="primary" onClick={() => C.openSheet("newGame")}>
            {t("common.newGame")}
          </Button>
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
            <button type="button" role="radio" aria-checked={L.kind === k} class={`chip ${L.kind === k ? "on" : ""}`} onClick={() => set({ kind: k })}>
              {t("library.kind." + k)}
            </button>
          ))}
        </div>
        <label class="search">
          <Icon name="search" size={15} />
          <input type="search" placeholder={t("library.search")} aria-label={t("library.search")} value={L.query} onInput={(e) => set({ query: e.currentTarget.value })} />
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
                    {
                      icon: "edit",
                      label: t("library.rename"),
                      onClick: () => C.openSheet("rename", { id: g.id, name: g.name || recordTitle(g) }),
                    },
                    ...(C.hasReport(g) ? [{ icon: "chart", label: t("report.title"), onClick: () => C.openReport(g.id, { space: "library" }) }] : []),
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
  const p = state.progress;
  return (
    <ul class="group collection">
      {C.CLASSICS.map((g) => (
        <li>
          <button type="button" class={`collection-row ${p.classics[g.id]?.done ? "done" : ""}`} onClick={() => C.openClassic(g.id)}>
            <span class="collection-main">
              <strong>{C.tx(g.title)}</strong>
              <span class="muted">
                {C.tx(g.blackName)} · {C.tx(g.whiteName)}
              </span>
            </span>
            <span class="fine">
              {String(g.date).split("..")[0]} · {C.resultText(g.result)}
            </span>
            {p.classics[g.id]?.done && <Icon name="check" size={15} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Openings() {
  const p = state.progress;
  return (
    <section class="section">
      <h2 class="section-title">{t("library.openings")}</h2>
      <p class="muted section-sub">{t("library.openingsHelp")}</p>
      <ul class="group collection">
        {C.OPENINGS.map((o, i) => (
          <li>
            <button type="button" class={`collection-row ${p.openings[o.id]?.done ? "done" : ""}`} onClick={() => C.openOpening(o.id)}>
              <span class="collection-no">{String(i + 1).padStart(2, "0")}</span>
              <span class="collection-main">
                {/* The heading already says "Pro openings": the rows keep the players. */}
                <strong>{C.tx(o.title).replace(/^[^：:]+[：:]\s*/, "")}</strong>
              </span>
              {p.openings[o.id]?.done && <Icon name="check" size={15} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
