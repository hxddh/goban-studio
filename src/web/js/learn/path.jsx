/**
 * Learn's home (docs/v9.md, "Two spaces"): one path chosen for you, as a
 * short list of rows in the order they are played (learn/session.js). Each
 * row says what it is and why it is there in a few words; the week's focus
 * is named with its reason in one line above them. One primary button
 * starts the session or goes on with it; when everything is done, a quiet
 * "done for today" takes its place. Below, one row opens the catalog.
 */
import { t } from "../i18n.js";
import { state } from "../app/store.js";
import * as C from "../app/controller.js";
import { PROBLEMS } from "../content.js";
import { PLACEMENT } from "../model/player.js";
import { Button, DiagramThumb, Icon, Stone } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";

/** Why an item is in the path, in a few words. */
export function whyText(it) {
  if (it.kind === "lesson") return t("learn.path.next");
  if (it.kind === "capture") return t("learn.path.bridge");
  if (it.kind === "game") return t("learn.path.firstGame");
  if (it.role === "review") return t("learn.path.review");
  if (it.role === "focus" && it.why) return t("learn.path.focus", [C.focusName(it.why)]);
  if (it.role === "stretch") return t("learn.path.stretch");
  return t("learn.path.new");
}

/** One path item → what its row shows: { icon | stone, title, why, more }. */
export function pathRow(it) {
  if (it.kind === "lesson") {
    const found = C.allLessons().find(({ lesson }) => lesson.id === it.id);
    if (!found) return null;
    return { icon: "practice", title: C.tx(found.lesson.title), why: whyText(it), more: C.tx(found.unit.title) };
  }
  if (it.kind === "capture") return { icon: "play", title: t("capture.play"), why: whyText(it), more: "" };
  if (it.kind === "game") return { icon: "play", title: t("firstGame.play"), why: whyText(it), more: "" };
  if (it.kind === "mistake") {
    const m = state.profile.mistakes.find((x) => x.id === it.id);
    if (!m) return null;
    return { stone: m.color, title: t("mistakes.item", [m.index, m.size]), why: whyText(it), more: m.theme ? C.focusName(m.theme) : t("learn.path.mistake") };
  }
  const def = PROBLEMS.find((x) => x.id === it.id);
  if (!def) return null;
  // Many problems share a title: the position tells them apart (v10), how hard it is says what to expect.
  return { icon: "target", diagram: def.diagram, title: C.tx(def.title), why: whyText(it), more: t("grade." + C.gradeOf(def.id)) };
}

/** The week's focus and its reason, in one line; its lesson as a quiet link. */
function FocusLine({ wf }) {
  if (!wf) return null;
  const lesson = wf.lesson && C.allLessons().find(({ lesson: l }) => l.id === wf.lesson);
  return (
    <p class="path-focus">
      <span class="path-focus-name">{t("learn.path.focus", [wf.names.join(" · ")])}</span>
      {wf.why.length > 0 && <span> — {wf.why.join(" · ")}</span>}
      {lesson && (
        <>
          {" "}
          <button type="button" class="link" onClick={() => C.openLesson(lesson.lesson.id)}>
            {t("learn.focus.lesson", [C.tx(lesson.lesson.title)])}
          </button>
        </>
      )}
    </p>
  );
}

/**
 * v10: before the first path, someone who knows the rules is asked to place
 * themselves with six problems (learn/placement.js). The page's one primary
 * starts the quiz; "Not now" keeps what onboarding said.
 */
function PlacementOffer() {
  return (
    <section class="placement-offer hero enter-up" aria-labelledby="placement-title">
      <div class="hero-text">
        <span class="eyebrow">{t("placement.eyebrow")}</span>
        <h2 id="placement-title">{t("placement.title")}</h2>
        <p class="muted">{t("placement.lead", [PLACEMENT.LENGTH])}</p>
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

export function LearnHome() {
  // The focus first: the first one shown in a week is kept, and the path reads it.
  const wf = C.weekFocus();
  const now = C.pathNow();
  const rows = now.items.map((it) => ({ it, row: pathRow(it) })).filter((r) => r.row);
  return (
    <>
      <Toolbar />
      <div class="page learn-home">
        <header class="page-head">
          <h1>{t("nav.learn")}</h1>
        </header>
        {C.placementOffered() ? (
          <PlacementOffer />
        ) : rows.length > 0 && (
          <section class="learn-path enter-up" aria-labelledby="path-title">
            <div class="path-head">
              <h2 class="section-title" id="path-title">
                {now.finished ? t("learn.path.doneToday") : t("learn.path.title")}
              </h2>
              {!now.finished && (
                <Button kind="primary" onClick={C.startPath}>
                  {now.started ? t("learn.path.resume") : t("learn.path.start")}
                </Button>
              )}
            </div>
            {now.finished ? <p class="path-focus">{t("learn.path.doneLine")}</p> : <FocusLine wf={wf} />}
            <ol class="group path-list">
              {rows.map(({ it, row }) => {
                const done = now.done.has(it.key);
                return (
                  <li>
                    <button type="button" class={`group-row path-row ${done ? "done" : ""}`} data-kind={it.kind} data-role={it.role} onClick={() => C.openPathItem(it.key)}>
                      <span class={`gr-icon ${row.diagram ? "has-thumb" : ""}`}>
                        {row.diagram ? <DiagramThumb diagram={row.diagram} /> : row.stone ? <Stone color={row.stone} size={14} /> : <Icon name={row.icon} size={18} />}
                      </span>
                      <span class="gr-text">
                        <strong>{row.title}</strong>
                        <span>
                          <span class="path-why">{row.why}</span>
                          {row.more && ` · ${row.more}`}
                        </span>
                      </span>
                      {done && (
                        <span class="path-done" role="img" aria-label={t("learn.path.done")}>
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
        <ul class="group catalog-link">
          <li>
            <button type="button" class="group-row" onClick={C.openCatalog}>
              <span class="gr-text">
                <strong>{t("learn.catalog")}</strong>
              </span>
              <Icon name="next" size={14} />
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
