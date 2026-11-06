/**
 * The top of Learn (docs/v9.md, "Two spaces"): the one path chosen for you,
 * model/player.js learnPath, as rows in its order — the next lesson, the
 * beginner bridges while they apply, then reviews, the week's focus and new
 * problems. The first row carries the one primary button.
 *
 * Wave 2b rebuilds the Learn path view around this; the order and what is
 * in it are the player model's, and app/practice-ctl.js learnPath is the
 * one call that reads it.
 */
import { t } from "../i18n.js";
import { state } from "../app/store.js";
import * as C from "../app/controller.js";
import { PROBLEMS } from "../content.js";
import { Button, Icon, Stone } from "../app/parts.jsx";

function focusName(key) {
  return key === "endgame" ? t("topic.endgame") : C.themeName(key);
}

/** One path item → what its row says and does. */
export function pathRow(it) {
  if (it.kind === "lesson") {
    const found = C.allLessons().find(({ lesson }) => lesson.id === it.id);
    if (!found) return null;
    const started = !!state.profile.lessons[it.id]?.step;
    return { icon: "practice", title: C.tx(found.lesson.title), sub: `${t("learn.path.next")} · ${C.tx(found.unit.title)}`, action: started ? t("practice.continue") : t("practice.start"), open: () => C.openLesson(it.id) };
  }
  if (it.kind === "capture") return { icon: "play", title: t("capture.play"), sub: t("capture.invite"), action: t("practice.start"), open: () => C.startCapture({}) };
  if (it.kind === "game") return { icon: "play", title: t("firstGame.play"), sub: t("firstGame.invite"), action: t("practice.start"), open: () => C.startFirstGame() };
  const role = it.role === "review" ? t("learn.path.review") : it.role === "stretch" ? t("learn.path.stretch") : it.role === "focus" && it.why ? t("plan.focusOf", [focusName(it.why)]) : t("learn.path.new");
  if (it.kind === "mistake") {
    const m = state.profile.mistakes.find((x) => x.id === it.id);
    if (!m) return null;
    return { stone: m.color, title: t("mistakes.item", [m.index, m.size]), sub: `${t("learn.path.mistake")} · ${m.theme ? focusName(m.theme) : role}`, action: t("practice.start"), open: () => C.openPathItem(it.id) };
  }
  const def = PROBLEMS.find((x) => x.id === it.id);
  if (!def) return null;
  return { icon: "target", title: C.tx(def.title), sub: `${role} · ${t("topic." + def.topic)}`, action: t("practice.start"), open: () => C.openPathItem(it.id) };
}

export function LearnPath({ plan = null }) {
  const rows = C.learnPath().map(pathRow).filter(Boolean);
  if (!rows.length) return null;
  return (
    <section class="section learn-path enter-up" aria-label={t("learn.path.title")}>
      <h2 class="section-title">{t("learn.path.title")}</h2>
      {plan?.items?.length > 0 && <p class="fine plan-line">{t("plan.focusOf", [plan.items.map((f) => f.name).join(" · ")])}</p>}
      <ul class="group">
        {rows.map((r, i) => (
          <li class="group-row path-row">
            <span class="gr-icon">{r.stone ? <Stone color={r.stone} size={14} /> : <Icon name={r.icon} size={18} />}</span>
            <span class="gr-text">
              <strong>{r.title}</strong>
              <span>{r.sub}</span>
            </span>
            <Button kind={i === 0 ? "primary" : "secondary"} size="sm" onClick={r.open}>
              {r.action}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
