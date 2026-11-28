/**
 * Onboarding: what the player already knows, in the system's language
 * (boot.js detectLang; a quiet switch in the corner changes it). Someone
 * who plays picks one of a few levels described in words, and their game
 * starts from that pick; the rating (Glicko-1) then finds the level from
 * the games.
 */
import { rulesetById } from "../rules.js";
import { LANG_IDS, LANG_NAMES, t } from "../i18n.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";

/**
 * The levels a player can say they are at, weakest first: a rank (kyu > 0,
 * dan = 1 − rank, as settings.playerRank) and the words that describe it.
 * Five, so the choice is about how one plays, not a number on a slider.
 */
export const RANK_ANCHORS = [
  { id: "casual", rank: 20 },
  { id: "regular", rank: 12 },
  { id: "club", rank: 5 },
  { id: "dan", rank: 0 },
  { id: "strong", rank: -3 },
];

const rankLabel = (rank) => (rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]));

/** The language, changed in place: a row of four quiet names in the corner. */
function LangSwitch() {
  const lang = state.settings.lang;
  return (
    <div class="ob-lang" role="radiogroup" aria-label={t("settings.language")}>
      {LANG_IDS.map((id) => (
        <button type="button" role="radio" lang={id} aria-checked={lang === id} class={lang === id ? "on" : ""} onClick={() => C.setSetting("lang", id)}>
          {LANG_NAMES[id]}
        </button>
      ))}
    </div>
  );
}

export function Onboarding({ step = 0 }) {
  const go = (n) => update((st) => (st.sheet = { kind: "onboarding", step: n }));
  return (
    <div class="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="drag" data-drag />
      <LangSwitch />
      <div class="ob-card">
        <img class="ob-mark" src="icon.png" width="72" height="72" alt="" />
        {step === 0 && (
          <>
            <p class="ob-welcome">
              {t("onboarding.welcome")}
              <span> · {t("onboarding.offline")}</span>
            </p>
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
              <button type="button" class="choice" onClick={() => go(1)}>
                <strong>{t("onboarding.player")}</strong>
                <span>{t("onboarding.playerHelp")}</span>
              </button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1 id="ob-title">{t("onboarding.howYouPlay")}</h1>
            {/* A pick starts the suggested game at once: someone who plays has said enough. */}
            <div class="choice-list rank-anchors">
              {RANK_ANCHORS.map((a, i) => (
                <button
                  type="button"
                  class="choice rank-anchor"
                  data-rank={a.rank}
                  data-autofocus={i === 1 ? true : undefined}
                  onClick={() => {
                    C.finishOnboarding("player", a.rank);
                    C.startFirstRun();
                  }}
                >
                  <strong>
                    {t(`onboarding.anchor.${a.id}`)}
                    <em class="anchor-rank">{rankLabel(a.rank)}</em>
                  </strong>
                  <span>{t(`onboarding.anchor.${a.id}Help`)}</span>
                </button>
              ))}
            </div>
            <p class="fine">{t("onboarding.rankHelp")}</p>
            <button type="button" class="link" onClick={() => go(0)}>
              ← {t("common.back")}
            </button>
          </>
        )}
        {/* One quiet line: which rules new games use (by language) and where to change it. */}
        <p class="fine ob-foot" data-ob-foot="rules">
          {t("onboarding.rulesLine", [t(rulesetById(C.defaultRules()).labelKey)])}
        </p>
      </div>
    </div>
  );
}
