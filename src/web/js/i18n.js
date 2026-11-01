/**
 * UI localisation.
 *
 * The source table is messages.js: one key, four strings side by side. This
 * module turns it into per-language dictionaries, formats {0} placeholders,
 * and applies data-i18n attributes to the DOM. It has no DOM side effects at
 * import time, so the Node tests can load it directly.
 */
import { MESSAGES } from "./messages.js";

export const LANG_IDS = ["zh", "en", "ko", "ja"];
export const FALLBACK_LANG = "zh";
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

export function getLang() {
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

export function t(key, params) {
  const table = DICT[current] || DICT[FALLBACK_LANG];
  let s = table[key];
  if (s === undefined) s = DICT[FALLBACK_LANG][key];
  if (s === undefined) return String(key);
  if (params !== undefined) {
    const vals = Array.isArray(params) ? params : [params];
    s = String(s).replace(/\{(\d+)\}/g, (_, i) => {
      const v = vals[Number(i)];
      return v === undefined || v === null ? "" : String(v);
    });
  }
  return s;
}

export const tf = t;

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
