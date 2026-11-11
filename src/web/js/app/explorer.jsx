/**
 * v6 explorer: the opening and joseki explorer (a Library page).
 *
 * Board left, panel right, as in review. The book's continuations are
 * accent marks with letters on the board (mistakes in --bad), and the same
 * letters head the rows in the panel. "Play from here" is the one primary
 * action.
 */
import { t, tn } from "../i18n.js";
import { BLACK, formatPoints } from "../rules.js";
import { state } from "./store.js";
import * as X from "./explorer-ctl.js";
import { Button, IconButton, Segmented } from "./parts.jsx";
import { Board } from "./parts.jsx";
import { Toolbar } from "./chrome.jsx";

const pct = (w) => `${Math.round(w * 100)}%`;

/** "B+0.5" style balance in words: "Black ahead by 0.5". */
function balance(score) {
  if (Math.abs(score) < X.LOSS_NOISE) return t("explorer.even");
  const who = score >= 0 ? t("common.black") : t("common.white");
  return t("play.evalText", [who, formatPoints(Math.round(Math.abs(score) * 2) / 2)]);
}

/** "loses 1.2", or "" for a move within the noise (explorer-ctl candidateShows). */
function lossText(c) {
  const { loss } = X.candidateShows(c);
  return loss == null ? "" : t("explorer.loss", [loss.toFixed(1)]);
}

/** A move's kind and what it costs, when it costs something: "Joseki", "Mistake · loses 4.5". */
function kindText(mode, c) {
  return [tagLabel(mode, c.tag), lossText(c)].filter(Boolean).join(" · ");
}

function tagLabel(mode, tag) {
  if (!tag) return "";
  if (tag === "joseki") return t(mode === "corner" ? "explorer.tag.joseki" : "explorer.tag.standard");
  return t("explorer.tag." + tag);
}

function lineName(mode, id) {
  if (!id) return null;
  return t(`explorer.name.${mode}.${id}`);
}

export function ExplorerView() {
  const e = X.explorerState();
  // v8: the book is fetched on first use; a moment's empty page until then.
  if (!e) return <Toolbar crumbs={[{ label: t("nav.library"), onClick: X.closeExplorer }]} title={t("explorer.title")} />;
  const mode = e.mode;
  const node = e.game.current;
  const cands = X.explorerCandidates(e);
  const marks = cands.map((c) => ({ x: c.x, y: c.y, type: "book", label: c.label, tag: c.tag, inBook: c.inBook }));
  const model = {
    size: 19,
    board: node.board.signMap,
    lastMove: node.move,
    marks,
    ownership: null,
    territory: null,
    deadStones: [],
    variation: null,
    moveNumbers: null,
    showCoords: state.settings.coords,
    view: X.explorerView(e),
    hoverColor: node.turn,
    interactive: true,
  };
  const title = t(mode === "corner" ? "explorer.corner" : "explorer.whole");
  return (
    <>
      <Toolbar crumbs={[{ label: t("nav.library"), onClick: X.closeExplorer }]} title={t("explorer.title")} sub={title}>
        <div class="tool-group">
          {X.explorerZoomable(e) && (
            <IconButton
              icon={e.zoom === false ? "focus" : "grid"}
              class="explorer-zoom"
              label={t(e.zoom === false ? "explorer.zoomCorner" : "explorer.zoomWhole")}
              onClick={X.toggleExplorerZoom}
            />
          )}
          <IconButton icon="close" label={`${t("review.close")} (Esc)`} onClick={X.closeExplorer} />
        </div>
      </Toolbar>
      <div class="workspace explorer-layer">
        <section class="stage" aria-label={t("explorer.title")}>
          <Board model={model} onPlay={X.explorerPlay} label={t("explorer.boardLabel")} />
          <ExplorerNav />
        </section>
        <ExplorerPanel cands={cands} />
      </div>
    </>
  );
}

function ExplorerNav() {
  const n = X.explorerMoveCount();
  return (
    <div class="review-nav" role="toolbar" aria-label={t("review.nav")}>
      <IconButton icon="first" label={t("explorer.reset")} onClick={X.explorerReset} disabled={n === 0} />
      <IconButton icon="prev" label={`${t("review.previous")} (←)`} onClick={() => X.explorerStep(-1)} disabled={!X.explorerCanStep(-1)} />
      <IconButton icon="next" label={`${t("review.next")} (→)`} onClick={() => X.explorerStep(1)} disabled={!X.explorerCanStep(1)} />
      <span class="nav-count">{t("explorer.moveN", [n])}</span>
    </div>
  );
}

function ExplorerPanel({ cands }) {
  const e = X.explorerState();
  const mode = e.mode;
  const hit = X.explorerBook(e);
  const ev = X.explorerEval(e);
  const verdict = X.lastMoveVerdict(e);
  const node = e.game.current;
  const toPlay = t(node.turn === BLACK ? "common.black" : "common.white");
  const name = hit ? lineName(mode, hit.name) : null;
  const meta = X.theBook().meta;
  return (
    <aside class="panel explorer-panel" aria-label={t("explorer.title")}>
      <Segmented
        label={t("explorer.mode")}
        value={mode}
        onChange={X.setExplorerMode}
        options={[
          { value: "whole", label: t("explorer.whole") },
          { value: "corner", label: t("explorer.corner") },
        ]}
      />
      <section class="explorer-status" aria-live="polite">
        <h2 class="slot-title">{name || t(mode === "corner" ? "explorer.corner" : "explorer.whole")}</h2>
        <p class="explorer-line">
          {t("explorer.toPlay", [toPlay])} · {hit ? t("explorer.inBook") : <strong class="explorer-out">{t("explorer.outOfBook")}</strong>}
        </p>
        {verdict && (
          <p class={`explorer-verdict tag-${verdict.tag || "none"}`} data-tag={verdict.tag || "none"}>
            {verdict.tag ? t("explorer.lastMoveKind", [X.pointLabel(node.move.x, node.move.y), kindText(mode, verdict)]) : t("explorer.lastMoveUnknown", [X.pointLabel(node.move.x, node.move.y)])}
          </p>
        )}
        {ev && Number.isFinite(ev.winrate) && (
          <div class="eval-bar">
            <div class="eval-track">
              <i style={{ width: `${Math.round(ev.winrate * 100)}%` }} />
            </div>
            <span class="fine">
              {t("explorer.blackWin", [pct(ev.winrate)])} · {balance(ev.score)}
              {ev.source === "live" && !ev.done ? ` · ${t("review.liveSearching")}` : ""}
            </span>
          </div>
        )}
        {!hit && !state.engine.available && <p class="muted">{t("explorer.outOfBookPreview")}</p>}
        {!hit && state.engine.available && !ev && <p class="muted">{t("explorer.analysing")}</p>}
      </section>
      {cands.length > 0 && (
        <section class="explorer-cands">
          <h2 class="slot-title">{t(hit ? "explorer.continuations" : "explorer.liveCandidates")}</h2>
          <ol class="group explorer-list">
            {cands.filter((c) => !c.image).map((c) => {
              const shows = X.candidateShows(c);
              return (
              <li>
                <button
                  type="button"
                  class={`group-row explorer-row tag-${c.tag}`}
                  data-tag={c.tag}
                  data-in-book={c.inBook ? "1" : "0"}
                  onClick={() => X.explorerPlay(c.x, c.y)}
                  aria-label={`${c.label} ${X.pointLabel(c.x, c.y)} · ${kindText(mode, c)}`}
                >
                  <span class={`explorer-letter ${c.tag}`}>{c.label}</span>
                  <span class="explorer-main">
                    <strong>
                      {X.pointLabel(c.x, c.y)}
                      {!X.isLocal(mode, c.x, c.y) && <span class="fine"> · {t("explorer.elsewhere")}</span>}
                    </strong>
                    <span class="fine">{kindText(mode, c)}</span>
                  </span>
                  {(shows.winrate || shows.visits) && (
                    <span class="explorer-num">
                      {shows.winrate && pct(c.winrate)}
                      {shows.visits && <span class="fine">{t("explorer.visits", [c.visits])}</span>}
                    </span>
                  )}
                </button>
              </li>
              );
            })}
          </ol>
        </section>
      )}
      <details class="explorer-about">
        <summary>{t("explorer.about")}</summary>
        <p class="fine">{t("explorer.aboutBook", [meta.visits, meta.network])}</p>
        <p class="fine explorer-build">{t("explorer.aboutBuild", [X.theBook().trees[mode]?.nodes.length || 0, meta.network, meta.visits, meta.katago || "–", meta.made || "–"])}</p>
        <p class="fine">{t("explorer.aboutTags", ["1.5", "4"])}</p>
        {mode === "corner" && <p class="fine">{t("explorer.aboutCorner")}</p>}
      </details>
      <div class="panel-foot">
        <Button kind="primary" icon="resume" class="block" onClick={X.explorerPlayFromHere}>
          {t("review.playFromHere")}
        </Button>
      </div>
    </aside>
  );
}

/**
 * Review: where a 19×19 game left the opening book, as one quiet line with
 * a link to that move. Nothing for games the book does not cover.
 */
export function BookExitNote({ game, onGoto, inline = false }) {
  const n = X.bookExit(game);
  if (!n) return null;
  const Tag = inline ? "span" : "p";
  const total = game.mainLine().length - 1;
  if (n >= total) return <Tag class="fine book-exit">{tn("explorer.inBookAll", n)}</Tag>;
  return (
    <Tag class="fine book-exit">
      <button type="button" class="link" onClick={() => onGoto(n + 1)}>
        {t("explorer.leftBook", [n + 1])}
      </button>
    </Tag>
  );
}
