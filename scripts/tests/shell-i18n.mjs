/**
 * Shell, localisation: a key missing in a language falls back to
 * English; counts take their plural form (tn); a label and its value use
 * each language's own colon; a Korean particle follows the word before it.
 */
import { test, assert } from "./helpers.mjs";

const I = await import("../../src/web/js/i18n.js");
const { t, tn, josa, setLang, DICT, FALLBACK_LANG } = I;

await test("i18n: a key missing in a language reads in English, not Chinese", () => {
  assert.equal(FALLBACK_LANG, "en");
  const saved = DICT.ko["common.cancel"];
  try {
    delete DICT.ko["common.cancel"];
    setLang("ko");
    assert.equal(t("common.cancel"), DICT.en["common.cancel"]);
  } finally {
    DICT.ko["common.cancel"] = saved;
  }
  assert.equal(t("no.such.key"), "no.such.key");
});

await test("i18n: counts take their plural form: 1 move, 2 moves; one form in Chinese, Korean and Japanese", () => {
  setLang("en");
  assert.equal(tn("play.moveN", 1), "1 move");
  assert.equal(tn("play.moveN", 2), "2 moves");
  assert.equal(tn("play.moveN", 0), "0 moves");
  assert.equal(tn("play.home.levelGames", 1), "estimated from 1 game");
  assert.equal(tn("practice.recordSolved", 1), "Solved · 1 try");
  assert.equal(tn("practice.recordTried", 3), "3 tries, not solved yet");
  assert.equal(tn("report.lost", 1, ["1"]), "≈ 1 point lost");
  assert.equal(tn("report.lost", 1.5, ["1.5"]), "≈ 1.5 points lost");
  assert.equal(tn("backup.confirmFiles", 1, [1, 5]).startsWith("The backup holds 1 game in 5 files."), true);
  assert.equal(tn("explorer.inBookAll", 1), "The first move is in the opening book");
  assert.equal(t("today.week.line", [tn("today.week.games", 1), tn("today.week.problems", 1)]), "1 game played, 1 problem solved.");
  // A key with no plural forms of its own is itself.
  assert.equal(tn("common.cancel", 1), t("common.cancel"));
  for (const lang of ["zh", "ko", "ja"]) {
    setLang(lang);
    assert.equal(tn("play.moveN", 1), t("play.moveN", [1]), lang);
  }
  setLang("zh");
  assert.equal(t("today.week.line", [tn("today.week.games", 1), tn("today.week.problems", 2)]), "下了 1 盘棋，做对 2 道题。");
  setLang("en");
});

await test("i18n: every .one form has a base form; CJK repeats it (only English picks one)", () => {
  for (const key of Object.keys(DICT.en)) {
    if (!key.endsWith(".one")) continue;
    const base = key.slice(0, -4);
    assert.ok(DICT.en[base], `${key} has its base ${base}`);
    for (const lang of ["zh", "ko", "ja"]) {
      setLang(lang);
      assert.equal(new Intl.PluralRules(lang).select(1), "other", `${lang} has one form`);
    }
  }
  setLang("en");
});

await test("i18n: a label and its value: full-width colon in Chinese and Japanese, none of an ASCII colon", () => {
  setLang("zh");
  assert.equal(t("common.labelValue", [t("today.next"), "打吃"]), "下一项：打吃");
  assert.equal(t("common.label", ["你的棋力"]), "你的棋力：");
  setLang("ja");
  assert.equal(t("common.labelValue", ["次", "アタリ"]), "次：アタリ");
  setLang("en");
  assert.equal(t("common.labelValue", ["Next", "Atari"]), "Next: Atari");
  assert.equal(t("common.label", ["Your level"]), "Your level: ");
});

await test("i18n: Korean particles follow the word before them", () => {
  assert.equal(josa("흑", "이", "가"), "이");
  assert.equal(josa("상대", "이", "가"), "가");
  assert.equal(josa("≈ 12급", "과", "와"), "과");
  assert.equal(josa("≈ 2단", "과", "와"), "과");
  assert.equal(josa("13.0.2", "이", "가"), "가", "이 (2) ends in a vowel");
  assert.equal(josa("13.0.1", "으로", "로"), "로", "일 (1) ends in ㄹ: 로");
  assert.equal(josa("13.0.3", "으로", "로"), "으로");
  assert.equal(josa("13.0.4", "을", "를"), "를");
  assert.equal(josa("KataGo", "은", "는"), "은(는)", "unknown sound: both");
  setLang("ko");
  assert.equal(t("library.vsEngine", ["≈ 12급"]), "컴퓨터 ≈ 12급과 대국");
  assert.equal(t("update.available", ["13.0.2"]), "Goban Studio 13.0.2가 나왔습니다");
  assert.equal(t("update.installed", ["13.1.0"]), "Goban Studio 13.1.0으로 업데이트했습니다");
  setLang("en");
  // The particle marker is Korean's only: other languages keep plain placeholders.
  assert.equal(t("library.vsEngine", ["≈ 12 kyu"]), "Computer, ≈ 12 kyu");
});
