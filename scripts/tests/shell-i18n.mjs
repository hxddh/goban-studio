/**
 * Shell, localisation: a key missing in a language falls back to
 * English; counts take their plural form (tn); a label and its value use
 * each language's own colon; a Korean particle follows the word before it;
 * a language whose strings are a file of their own is read before it shows.
 */
import { test, assert, path, root } from "./helpers.mjs";

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

await test("i18n: a language kept in its own file reads as English until it is read, then as itself; a file that cannot be read is tried again", async () => {
  // The app's script is built with English only (scripts/bundle.mjs); here the same module over a two-key table.
  const esbuild = await import("esbuild");
  const table = {
    name: "table",
    setup(b) {
      b.onLoad({ filter: /[\\/]js[\\/]messages\.js$/ }, () => ({
        contents: 'export const LAZY_LANGS = ["zh", "ko", "ja"]; export const MESSAGES = { "a.hello": { en: "Hello {0}" }, "a.only": { en: "Only" } };',
        loader: "js",
      }));
    },
  };
  const out = await esbuild.build({ entryPoints: [path.join(root, "src/web/js/i18n.js")], bundle: true, format: "esm", write: false, plugins: [table], logLevel: "error" });
  const L = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  assert.equal(L.hasLang("en"), true, "English is in the script");
  assert.equal(L.hasLang("ko"), false);
  assert.equal(L.hasLang("xx"), false, "not a language");
  assert.equal(await L.loadLang("en"), true, "nothing to read");
  // Shown before its strings are there: English, never a raw key.
  L.setLang("ko");
  assert.equal(L.t("a.hello", ["A"]), "Hello A");
  // The file cannot be read: still English, and said to the caller.
  const asked = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await L.loadLang("ko", { read: async (url) => (asked.push(url), Promise.reject(new Error("404"))) }), false);
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(asked, ["content/strings-ko.json"]);
  assert.equal(L.hasLang("ko"), false);
  assert.equal(L.t("a.only"), "Only");
  // Read once, however many ask at the same moment; keys the table does not have are not taken in.
  let reads = 0;
  const read = async () => (reads++, { "a.hello": "안녕 {0}", "x.unknown": "?", "a.only": 7 });
  const [one, two] = await Promise.all([L.loadLang("ko", { read }), L.loadLang("ko", { read })]);
  assert.deepEqual([one, two, reads], [true, true, 1]);
  assert.equal(L.hasLang("ko"), true);
  assert.equal(L.t("a.hello", ["A"]), "안녕 A");
  assert.equal(L.t("a.only"), "Only", "a value that is not a string is left as it was");
  assert.equal(L.t("x.unknown"), "x.unknown");
  assert.equal(await L.loadLang("ko", { read }), true);
  assert.equal(reads, 1, "not read again");
  // The rest, in the background.
  const others = [];
  await Promise.all(["zh", "ja"].map((id) => L.loadLang(id, { read: async (url) => (others.push(url), {}) })));
  assert.deepEqual(others.sort(), ["content/strings-ja.json", "content/strings-zh.json"]);
  assert.deepEqual(await L.preloadLangs(), [], "nothing left to read");
});

await test("i18n: in the tests and the tools every language is in the table, and nothing is read", async () => {
  const { LAZY_LANGS } = await import("../../src/web/js/messages.js");
  assert.deepEqual(LAZY_LANGS, []);
  for (const id of I.LANG_IDS) {
    assert.equal(I.hasLang(id), true, id);
    assert.equal(await I.loadLang(id, { read: () => assert.fail("read " + id) }), true);
  }
});
