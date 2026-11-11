/**
 * Practice's home: one path chosen for you, as a short list of rows in the
 * order they are played (practice/session.js). Problems that follow one
 * another with the same theme and reason are one row ("Ladders · 4
 * problems", with their positions as small tiles); each row says why it is
 * there in the model's own terms — a review that is due, what your games
 * showed, a step up, new at your level. Above the rows: the week's focus,
 * the review load in a few quiet words, and the day's size (3, 5 or 10
 * problems). One primary button starts the session or goes on with it;
 * when everything is done, a quiet "done for today" takes its place.
 * Below, the catalog.
 */
import { t, tn } from "../i18n.js";
import { state } from "../app/store.js";
import * as C from "../app/controller.js";
import { PROBLEMS } from "../content.js";
import { PLACEMENT, RULES, reviewLoad } from "../model/player.js";
import { Button, DiagramThumb, Icon, Segmented, Stone } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";
import { CatalogSections } from "./catalog.jsx";
import { groupPath } from "./progress.js";

/** How many positions a row shows as tiles. */
const MAX_TILES = 4;

/** Why an item is in the path, in a few words (the panel's eyebrow inside the session). */
export function whyText(it) {
  if (it.kind === "lesson") return t("practice.path.next");
  if (it.kind === "capture") return t("practice.path.bridge");
  if (it.kind === "game") return t("practice.path.firstGame");
  if (it.role === "review") return t("practice.path.review");
  if (it.role === "focus" && it.why) return t("practice.path.focus", [C.focusName(it.why)]);
  if (it.role === "stretch") return t("practice.path.stretch");
  return t("practice.path.new");
}

/**
 * Why a row is in the path, as specific as the model is: a review that is
 * due; for a focus, what the games (or the problems) showed — "came up 3
 * times in your last 4 games" — from the week's focus `wf`; a step up; new
 * at your level.
 */
function reasonText(row, wf) {
  const it = row.items[0];
  if (it.kind !== "problem" && it.kind !== "mistake") return whyText(it);
  if (row.role === "review") return t("practice.path.review");
  if (row.role === "stretch") return t("practice.path.stretch");
  if (row.why) return wf?.reasons?.[row.why] || t("practice.path.focusShort");
  return t("practice.path.new");
}

/** "Level 2", or "Level 1–2" when a row's problems span several. */
function gradesText(ids) {
  const gs = ids.map((id) => C.gradeOf(id));
  const lo = Math.min(...gs);
  const hi = Math.max(...gs);
  return lo === hi ? t("grade." + lo) : t("grade.range", [lo, hi]);
}

/**
 * The path's items as what its rows show, in order:
 *   { key, kind, role, items, icon | stone, title, why, more, diagrams, focus }
 * A row of problems is named after their theme with how many there are;
 * a problem's own name stays out of it (it would give the answer away).
 */
export function pathRows(items, wf = null) {
  const themeOf = (it) => PROBLEMS.find((x) => x.id === it.id)?.theme;
  const out = [];
  for (const row of groupPath(items, themeOf)) {
    const it = row.items[0];
    const base = { key: it.key, kind: row.kind, role: row.role, items: row.items, focus: row.why, why: reasonText(row, wf) };
    if (it.kind === "lesson") {
      const found = C.allLessons().find(({ lesson }) => lesson.id === it.id);
      if (found) out.push({ ...base, icon: "practice", title: C.tx(found.lesson.title), more: C.tx(found.unit.title) });
    } else if (it.kind === "capture") out.push({ ...base, icon: "play", title: t("capture.play"), more: "" });
    else if (it.kind === "game") out.push({ ...base, icon: "play", title: t("firstGame.play"), more: "" });
    else if (it.kind === "mistake") {
      const m = state.profile.mistakes.find((x) => x.id === it.id);
      if (m) out.push({ ...base, stone: m.color, title: t("mistakes.item", [m.index, m.size]), more: m.theme ? C.focusName(m.theme) : t("practice.path.mistake") });
    } else {
      const defs = row.items.map((x) => PROBLEMS.find((d) => d.id === x.id)).filter(Boolean);
      if (!defs.length) continue;
      const name = C.themeName(row.theme || defs[0].theme);
      const diagrams = defs.filter((d) => d.diagram).map((d) => ({ key: "problem:" + d.id, diagram: d.diagram }));
      out.push({ ...base, icon: "target", title: t("practice.path.group", [name, tn("practice.path.problems", defs.length)]), more: gradesText(defs.map((d) => d.id)), diagrams });
    }
  }
  return out;
}

/** The week's focus in one line; its lesson as a quiet link. The evidence is said here only when no row says it. */
function FocusLine({ wf, rows }) {
  if (!wf) return null;
  const lesson = wf.lesson && C.allLessons().find(({ lesson: l }) => l.id === wf.lesson);
  const said = new Set(rows.filter((r) => r.focus && wf.reasons?.[r.focus] === r.why).map((r) => r.focus));
  const why = wf.keys.filter((k) => !said.has(k)).map((k) => wf.reasons?.[k]).filter(Boolean);
  return (
    <p class="path-focus">
      <span class="path-focus-name">{t("practice.path.focus", [wf.names.join(" · ")])}</span>
      {why.length > 0 && <span> — {why.join(" · ")}</span>}
      {lesson && (
        <>
          {" "}
          <button type="button" class="link" onClick={() => C.openLesson(lesson.lesson.id)}>
            {t("practice.focus.lesson", [C.tx(lesson.lesson.title)])}
          </button>
        </>
      )}
    </p>
  );
}

/** The review load in a few quiet words: "4 to review today · 37 mastered". Empty while both are zero. */
export function loadText(load) {
  return [load.due > 0 ? tn("practice.load.due", load.due) : "", load.mastered > 0 ? tn("practice.load.mastered", load.mastered) : ""].filter(Boolean).join(" · ");
}

/** The load, and the day's size as a small choice. */
function PathMeta() {
  return (
    <div class="path-meta">
      <span class="path-load">{loadText(reviewLoad(state.profile, Date.now()))}</span>
      <span class="daily-size">
        <span class="fine">{t("practice.daily.label")}</span>
        <Segmented value={state.settings.dailySize} options={RULES.DAILY_SIZES.map((n) => ({ value: n, label: String(n) }))} onChange={C.setDailySize} label={t("practice.daily.label")} />
      </span>
    </div>
  );
}

/**
 * Before the first path, someone who knows the rules is asked to place
 * themselves with a short quiz (practice/placement.js). The page's one primary
 * starts the quiz; "Not now" keeps what onboarding said.
 */
function PlacementOffer() {
  return (
    <section class="placement-offer hero enter-up" aria-labelledby="placement-title">
      <div class="hero-text">
        <span class="eyebrow">{t("placement.eyebrow")}</span>
        <h2 id="placement-title">{t("placement.title")}</h2>
        <p class="muted">{t("placement.leadRange", [PLACEMENT.MIN, PLACEMENT.MAX])}</p>
      </div>
      <div class="hero-actions">
        <Button kind="primary" onClick={C.startPlacement}>
          {t("placement.start")}
        </Button>
        <button type="button" class="link" onClick={C.skipPlacement}>
          {t("placement.skip")}
        </button>
      </div>
    </section>
  );
}

export function PracticeHome() {
  // The focus first: the first one shown in a week is kept, and the path reads it.
  const wf = C.weekFocus();
  const now = C.pathNow();
  const rows = pathRows(now.items, wf);
  return (
    <>
      <Toolbar />
      <div class="page practice-home">
        <header class="page-head">
          <h1>{t("nav.practice")}</h1>
        </header>
        {C.placementOffered() ? (
          <PlacementOffer />
        ) : rows.length > 0 && (
          <section class="practice-path enter-up" aria-labelledby="path-title">
            <div class="path-head">
              <h2 class="section-title" id="path-title">
                {now.finished ? t("practice.path.doneToday") : t("practice.path.title")}
              </h2>
              {!now.finished && (
                <Button kind="primary" onClick={C.startPath}>
                  {now.started ? t("practice.path.resume") : t("practice.path.start")}
                </Button>
              )}
            </div>
            {now.finished ? <p class="path-focus">{t("practice.path.doneLine")}</p> : <FocusLine wf={wf} rows={rows} />}
            <PathMeta />
            <ol class="group path-list">
              {rows.map((row) => {
                const left = row.items.filter((it) => !now.done.has(it.key));
                const done = left.length === 0;
                const some = !done && left.length < row.items.length;
                return (
                  <li>
                    <button type="button" class={`group-row path-row ${done ? "done" : ""}`} data-kind={row.kind} data-role={row.role} data-count={row.items.length} onClick={() => C.openPathItem((left[0] || row.items[0]).key)}>
                      <span class="gr-icon">{row.stone ? <Stone color={row.stone} size={14} /> : <Icon name={row.icon} size={18} />}</span>
                      <span class="gr-text">
                        <strong>{row.title}</strong>
                        <span>
                          <span class="path-why">{row.why}</span>
                          {row.more && ` · ${row.more}`}
                        </span>
                      </span>
                      {row.diagrams?.length > 0 && (
                        <span class="path-tiles" aria-hidden="true">
                          {row.diagrams.slice(0, MAX_TILES).map((d) => (
                            <span class={now.done.has(d.key) ? "done" : ""}>
                              <DiagramThumb diagram={d.diagram} />
                            </span>
                          ))}
                        </span>
                      )}
                      {some && <span class="row-count">{t("practice.ofN", [row.items.length - left.length, row.items.length])}</span>}
                      {done && (
                        <span class="path-done" role="img" aria-label={t("practice.path.done")}>
                          <Icon name="check" size={16} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        <CatalogSections first={false} />
      </div>
    </>
  );
}
