/**
 * Today's hero for someone who has never played (first-run.js firstOffer
 * "lesson"): lesson one, started in one click. The two other first offers
 * are games, and use the suggested-game hero as it is (play/home.jsx).
 */
import { t } from "../i18n.js";
import * as C from "./controller.js";
import { Button, Thumb } from "./parts.jsx";

/** A 9×9 board with the one stone lesson one begins with. */
const FIRST_STONE = ".".repeat(40) + "b" + ".".repeat(40);

export function FirstLessonHero() {
  return (
    <section class="hero enter-up" data-hero="first-lesson">
      <Thumb thumb={FIRST_STONE} size={9} />
      <div class="hero-text">
        <span class="eyebrow">{t("first.eyebrow")}</span>
        <h2>{t("first.lesson.title")}</h2>
        <p class="muted">{t("first.lesson.body")}</p>
      </div>
      <Button kind="primary" size="lg" onClick={C.startFirstRun}>
        {t("first.lesson.start")}
      </Button>
    </section>
  );
}
