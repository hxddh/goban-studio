/**
 * UI localisation.
 *
 * The source table is messages.js: one key, four strings side by side. This
 * module turns it into per-language dictionaries, formats {0} placeholders,
 * and applies data-i18n attributes to the DOM. A string missing in a
 * language falls back to English; tn() picks a plural form; a Korean
 * placeholder can carry the particle that suits the word put in it
 * ({0:은/는}, see josa). It has no DOM side effects at
 * import time, so the Node tests can load it directly.
 */
import { MESSAGES } from "./messages.js";

export const LANG_IDS = ["zh", "en", "ko", "ja"];
// English (zh before): a key missing in a language reads in the language most users can read.
export const FALLBACK_LANG = "en";
export const LANG_NAMES = {
  zh: "中文",
  en: "English",
  ko: "한국어",
  ja: "日本語",
};

const DICT = {};
for (const id of LANG_IDS) {
  DICT[id] = {};
  for (const [key, values] of Object.entries(MESSAGES)) {
    DICT[id][key] = values[id] ?? values[FALLBACK_LANG] ?? key;
  }
}

let current = FALLBACK_LANG;

export function setLang(id) {
  if (LANG_IDS.includes(id)) current = id;
  if (typeof document !== "undefined") document.documentElement.lang = current === "zh" ? "zh-CN" : current;
  return current;
}

/** The language in use ("zh" | "en" | "ko" | "ja"). */
export function currentLang() {
  return current;
}

export function available() {
  return LANG_IDS.map((id) => ({ id, name: LANG_NAMES[id] }));
}

export function detectLang(nav) {
  const src = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!src) return "en";
  const tags = [].concat(src.languages || [], src.language || []);
  for (const raw of tags) {
    const tag = String(raw || "").toLowerCase();
    if (!tag) continue;
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("ko")) return "ko";
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

/**
 * The language tag a piece of user content needs so it is set in the right
 * faces whatever the interface language (styles.css `[lang]:lang(…)`): a
 * player's name in an imported record, a comment. Kana means Japanese,
 * hangul Korean; Han characters alone are Chinese or Japanese and cannot
 * be told apart, so they get no tag (null) and take the interface's face —
 * as does anything else. Use it as `<span lang={textLang(name) || undefined}>`.
 */
export function textLang(text) {
  const s = String(text ?? "");
  if (/[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/.test(s)) return "ja";
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(s)) return "ko";
  return null;
}

export function t(key, params) {
  const table = DICT[current] || DICT[FALLBACK_LANG];
  let s = table[key];
  if (s === undefined) s = DICT[FALLBACK_LANG][key];
  if (s === undefined) return String(key);
  if (params !== undefined) {
    const vals = Array.isArray(params) ? params : [params];
    // {0}, or {0:은/는} (the value, then the particle that suits it).
    s = String(s).replace(/\{(\d+)(?::([^{}/]+)\/([^{}/]+))?\}/g, (_, i, withFinal, withoutFinal) => {
      const v = vals[Number(i)];
      const text = v === undefined || v === null ? "" : String(v);
      return withFinal ? text + josa(text, withFinal, withoutFinal) : text;
    });
  }
  return s;
}

/* -------------------------------------------- Plurals and particles */

const pluralRules = {};
function pluralOf(n) {
  const lang = current;
  try {
    pluralRules[lang] ||= new Intl.PluralRules(lang === "zh" ? "zh-CN" : lang);
    return pluralRules[lang].select(Number(n));
  } catch (_) {
    return Number(n) === 1 ? "one" : "other";
  }
}

/**
 * A count in words: the key's plural form for `n` in the current language.
 * The key itself is the "other" form; `key.one` (and any other category
 * the language uses) the rest, where a language needs it. Chinese,
 * Japanese and Korean have one form, so only English writes `.one`; a
 * language that has no such key uses the key itself. `params` default to
 * [n].
 */
export function tn(key, n, params = [n]) {
  const form = pluralOf(n);
  if (form !== "other") {
    const k = key + "." + form;
    if ((DICT[current] || {})[k] !== undefined || DICT[FALLBACK_LANG][k] !== undefined) return t(k, params);
  }
  return t(key, params);
}

/** Whether a Korean reading of `word` ends in a final consonant (batchim), and whether that is ㄹ; null when unknown. */
function finalOf(word) {
  const w = String(word).replace(/[\s)\]}"'’”.,!?·…:;]+$/u, "");
  const c = w.slice(-1);
  if (!c) return null;
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return { has: jong !== 0, rieul: jong === 8 };
  }
  // Digits as read in Sino-Korean: 영 일 이 삼 사 오 육 칠 팔 구.
  const digit = "0123456789".indexOf(c);
  if (digit >= 0) return { has: [0, 1, 3, 6, 7, 8].includes(digit), rieul: [1, 7, 8].includes(digit) };
  return null;
}

/**
 * The Korean particle that follows `word`: `withFinal` after a final
 * consonant (은, 이, 을, 과, 으로), `withoutFinal` after a vowel (는, 가,
 * 를, 와, 로); 로 also after ㄹ. When the word's last sound is unknown (a
 * Latin name), both, as Korean writes it: 은(는).
 */
export function josa(word, withFinal, withoutFinal) {
  const f = finalOf(word);
  if (!f) return `${withFinal}(${withoutFinal})`;
  if (withFinal === "으로") return f.has && !f.rieul ? "으로" : "로";
  return f.has ? withFinal : withoutFinal;
}

export function apply(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope || !scope.querySelectorAll) return;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
}

export { MESSAGES, DICT };
