/**
 * Onboarding: the language, then what the player already knows.
 */
import { useState } from "preact/hooks";
import { rulesetById } from "../rules.js";
import { LANG_IDS, LANG_NAMES, t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { Button } from "./parts.jsx";

/* ------------------------------------------------------------- onboarding */

export function Onboarding({ step = 0 }) {
  const s = state.settings;
  const [rank, setRank] = useState(15);
  const go = (n) => update((st) => (st.sheet = { kind: "onboarding", step: n }));
  return (
    <div class="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="drag" data-drag />
      <div class="ob-card">
        <img class="ob-mark" src="icon.png" width="72" height="72" alt="" />
        {step === 0 && (
          <>
            <h1 id="ob-title">{t("onboarding.welcome")}</h1>
            <p class="muted">{t("onboarding.lead")}</p>
            <div class="lang-grid big" role="radiogroup" aria-label={t("settings.language")}>
              {LANG_IDS.map((id) => (
                <button type="button" role="radio" lang={id} aria-checked={s.lang === id} class={s.lang === id ? "on" : ""} onClick={() => C.setSetting("lang", id)}>
                  {LANG_NAMES[id]}
                </button>
              ))}
            </div>
            <div class="actions center">
              <Button kind="primary" data-autofocus onClick={() => go(1)}>
                {t("common.continue")}
              </Button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1 id="ob-title">{t("onboarding.question")}</h1>
            <div class="choice-list">
              <button type="button" class="choice" data-autofocus onClick={() => C.finishOnboarding("new")}>
                <strong>{t("onboarding.new")}</strong>
                <span>{t("onboarding.newHelp")}</span>
              </button>
              <button type="button" class="choice" onClick={() => C.finishOnboarding("rules")}>
                <strong>{t("onboarding.rules")}</strong>
                <span>{t("onboarding.rulesHelp")}</span>
              </button>
              <button type="button" class="choice" onClick={() => go(2)}>
                <strong>{t("onboarding.player")}</strong>
                <span>{t("onboarding.playerHelp")}</span>
              </button>
            </div>
            <button type="button" class="link" onClick={() => go(0)}>
              ← {t("common.back")}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h1 id="ob-title">{t("onboarding.rankQuestion")}</h1>
            <div class="slider-field big">
              <input type="range" min="0" max="33" step="1" value={30 - rank} onInput={(e) => setRank(30 - Number(e.currentTarget.value))} aria-label={t("settings.you")} aria-valuetext={rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank])} />
              <output>{rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank])}</output>
            </div>
            <p class="fine">{t("onboarding.rankHelp")}</p>
            <div class="actions center">
              <Button kind="ghost" onClick={() => go(1)}>
                {t("common.back")}
              </Button>
              <Button kind="primary" data-autofocus onClick={() => C.finishOnboarding("player", rank)}>
                {t("common.continue")}
              </Button>
            </div>
          </>
        )}
        {/* One quiet line: offline on the first step; then which rules new games use (by language) and where to change it. */}
        <p class="fine ob-foot" data-ob-foot={step === 0 ? "offline" : "rules"}>
          {step === 0 ? t("onboarding.offline") : t("onboarding.rulesLine", [t(rulesetById(C.defaultRules()).labelKey)])}
        </p>
      </div>
    </div>
  );
}
