/**
 * Shell: settings that were migrated or that follow the language — the
 * volume (once a sound switch), the rules of new games (never chosen until
 * the player chooses), the board style — and which interface language a
 * system gets.
 */
import { test, assert, fs, path, root, DEFAULT_SETTINGS, normalizeSettings, createStore, bundle } from "./helpers.mjs";
import { defaultRulesOf, rulesForLang, saveSettings, loadSettings } from "../../src/web/js/data/settings.js";
import { detectLang, LANG_IDS, textLang } from "../../src/web/js/i18n.js";
import * as Audio from "../../src/web/js/audio.js";

await test("settings: the sound switch became a volume — off stays off, on is normal, and a chosen volume is kept", () => {
  assert.equal(DEFAULT_SETTINGS.volume, "normal");
  assert.ok(!("sound" in DEFAULT_SETTINGS), "one setting, not two");
  // A settings file written before the volume existed.
  const off = normalizeSettings({ v: 13, onboarded: true, sound: false });
  assert.equal(off.volume, "off");
  assert.ok(!("sound" in off), "the old switch is not carried along");
  assert.equal(normalizeSettings({ v: 13, onboarded: true, sound: true }).volume, "normal");
  // Once a volume is stored it wins over a stale switch.
  assert.equal(normalizeSettings({ sound: false, volume: "loud" }).volume, "loud");
  assert.equal(normalizeSettings({ volume: "quiet" }).volume, "quiet");
  // Anything else is the default.
  for (const bad of [0.5, "max", null, true]) assert.equal(normalizeSettings({ volume: bad }).volume, "normal", String(bad));
});

await test("settings: the volume levels are master gains — off silences, quiet is well under normal, loud is full", () => {
  assert.deepEqual(Object.keys(Audio.VOLUME_LEVELS), ["off", "quiet", "normal", "loud"]);
  assert.equal(Audio.setLevel("off"), 0);
  assert.equal(Audio.soundState().enabled, false);
  assert.equal(Audio.setLevel("quiet"), Audio.VOLUME_LEVELS.quiet);
  assert.deepEqual(Audio.soundState(), { enabled: true, volume: Audio.VOLUME_LEVELS.quiet });
  assert.ok(Audio.VOLUME_LEVELS.quiet <= Audio.VOLUME_LEVELS.normal / 2, "quiet is clearly quieter");
  assert.equal(Audio.setLevel("loud"), 1);
  assert.equal(Audio.soundState().volume, 1);
  // The level the app always had is "normal"; an unknown name is read as it.
  assert.equal(Audio.levelGain("normal"), 0.8);
  assert.equal(Audio.levelGain("deafening"), 0.8);
  // Off and on again: the gain of the level asked for, not the last one.
  Audio.setLevel("off");
  Audio.setLevel("normal");
  assert.deepEqual(Audio.soundState(), { enabled: true, volume: 0.8 });
});

await test("settings: a new profile has no rules chosen — new games use those of its language; a choice, once made, stays", () => {
  assert.equal(DEFAULT_SETTINGS.defaultRules, null, "never chosen");
  assert.deepEqual(LANG_IDS.map((l) => [l, rulesForLang(l)]), [["zh", "chinese"], ["en", "japanese"], ["ko", "korean"], ["ja", "japanese"]]);
  for (const lang of LANG_IDS) assert.equal(defaultRulesOf({ ...DEFAULT_SETTINGS, lang }), rulesForLang(lang), lang);
  // Read at use: changing the language before choosing rules changes them too.
  const fresh = normalizeSettings({ lang: "zh" });
  assert.equal(fresh.defaultRules, null);
  assert.equal(defaultRulesOf(fresh), "chinese");
  assert.equal(defaultRulesOf({ ...fresh, lang: "ko" }), "korean");
  // A choice is a choice, in any language — Japanese rules in Chinese included.
  assert.equal(defaultRulesOf({ ...fresh, defaultRules: "japanese" }), "japanese");
  assert.equal(defaultRulesOf({ ...fresh, lang: "en", defaultRules: "chinese" }), "chinese");
  assert.equal(defaultRulesOf(null), "japanese");
});

await test("settings: an existing player's settings file keeps its rules — Japanese stays Japanese in a Chinese interface", () => {
  // A settings file as v13 wrote it: every setting present, the rules it played with among them.
  const v13 = { v: 13, lang: "zh", appearance: "auto", coords: true, sound: true, numbers: false, opponentRank: 23, playerRank: 25, experience: "rules", onboarded: true, defaultRules: "japanese", boardSize: 9 };
  const kept = normalizeSettings(v13);
  assert.equal(kept.defaultRules, "japanese", "set to Japanese is not the same as never set");
  assert.equal(defaultRulesOf(kept), "japanese");
  // Through the store, as at launch.
  const files = new Map([["settings.json", JSON.stringify(v13)]]);
  const backend = { kind: "host", list: async () => [...files.keys()], read: async (k) => files.get(k) ?? null, write: async (k, t) => void files.set(k, t), remove: async (k) => void files.delete(k) };
  const store = createStore({ backend, delay: 1 });
  return store.open().then(async () => {
    const s = loadSettings(store);
    assert.equal(s.defaultRules, "japanese");
    assert.equal(s.volume, "normal");
    saveSettings(store, s);
    await store.flush();
    const written = JSON.parse(files.get("settings.json"));
    assert.equal(written.defaultRules, "japanese");
    assert.ok(!("sound" in written) && written.volume === "normal", "written in the new shape");
    // Older still: an onboarded player's file without the key played Japanese rules.
    assert.equal(normalizeSettings({ lang: "zh", onboarded: true }).defaultRules, "japanese");
    // Someone still in onboarding has chosen nothing.
    assert.equal(normalizeSettings({ lang: "zh", onboarded: false }).defaultRules, null);
    assert.equal(normalizeSettings({ defaultRules: "aga" }).defaultRules, null, "an unknown ruleset is no choice");
  });
});

await test("settings: the board style and the last-move mark fall back per setting", () => {
  assert.equal(DEFAULT_SETTINGS.boardStyle, "standard");
  assert.equal(DEFAULT_SETTINGS.lastMoveMark, true);
  assert.equal(normalizeSettings({ boardStyle: "contrast" }).boardStyle, "contrast");
  assert.equal(normalizeSettings({ boardStyle: "ink" }).boardStyle, "standard", "a board that no longer exists is the standard one");
  assert.equal(normalizeSettings({ lastMoveMark: "no" }).lastMoveMark, true);
  assert.equal(normalizeSettings({ lastMoveMark: false }).lastMoveMark, false);
});

await test("language: a Traditional Chinese system gets the Chinese interface, not English; the first supported language wins", () => {
  const nav = (...languages) => ({ languages, language: languages[0] });
  for (const tag of ["zh-TW", "zh-HK", "zh-Hant", "zh-Hant-TW", "zh-MO", "zh-CN", "zh-Hans-SG", "zh"]) assert.equal(detectLang(nav(tag)), "zh", tag);
  assert.equal(detectLang(nav("ja-JP")), "ja");
  assert.equal(detectLang(nav("ko-KR")), "ko");
  assert.equal(detectLang(nav("en-GB")), "en");
  // A language the app does not have is passed over for the next one in the list.
  assert.equal(detectLang(nav("fr-FR", "zh-TW", "en-US")), "zh");
  assert.equal(detectLang(nav("de-DE")), "en");
  assert.equal(detectLang({ language: "zh-HK" }), "zh", "no list, one language");
  assert.equal(detectLang({ languages: [] }), "en");
});

await test("language: user content is tagged by its script — kana Japanese, hangul Korean, Han alone untagged — and tagged text has its own font stacks", () => {
  assert.equal(textLang("井山裕太"), null, "Han characters alone could be Chinese or Japanese");
  assert.equal(textLang("いやま ゆうた"), "ja");
  assert.equal(textLang("一力 遼 (イチリキ)"), "ja");
  assert.equal(textLang("신진서"), "ko");
  assert.equal(textLang("申眞諝 신진서"), "ko");
  assert.equal(textLang("Ke Jie"), null);
  assert.equal(textLang(""), null);
  assert.equal(textLang(null), null);
  const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");
  const rule = (lang) => css.split("\n").find((l) => l.startsWith("[lang]:not(:root)") && l.includes(`:lang(${lang})`)) || "";
  assert.match(rule("zh-Hant"), /"PingFang TC".*"Microsoft JhengHei UI"/, "Traditional Chinese faces");
  assert.ok(rule("zh-Hant").includes(":lang(zh-TW)") && rule("zh-Hant").includes(":lang(zh-HK)"));
  assert.match(rule("ja"), /"Hiragino Sans".*"Yu Gothic UI"/, "Japanese faces for a tagged name in any interface language");
  assert.match(rule("ko"), /"Apple SD Gothic Neo".*"Malgun Gothic"/);
  // A plain zh tag is Simplified, and does not catch what is tagged Traditional.
  const plain = css.split("\n").find((l) => l.startsWith("[lang]:not(:root):lang(zh):not(")) || "";
  assert.match(plain, /"PingFang SC"/);
  assert.ok(plain.includes(":not(:lang(zh-Hant))"));
  // Latin faces come first in each, so Latin text looks the same everywhere.
  for (const l of ["zh-Hant", "ja", "ko"]) assert.match(rule(l), /font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text"/, l);
});

await test("new game: the rules a game starts with are the player's choice, else those of the interface language", async () => {
  const A = await bundle(['export * as C from "./src/web/js/app/controller.js";', 'export { state } from "./src/web/js/app/store.js";', 'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";', 'export * as PM from "./src/web/js/model/player.js";']);
  const { C, state } = A;
  const start = (lang, defaultRules = null) => {
    state.settings = { ...A.DEFAULT_SETTINGS, lang, onboarded: true, experience: "player", playerRank: 10, defaultRules };
    state.profile = A.PM.newProfile({ rank: 10 });
    C.newGame({ size: 9, opponent: "human" });
    return [state.game.game.rules, state.game.game.komi];
  };
  assert.deepEqual(start("zh"), ["chinese", 7.5]);
  assert.deepEqual(start("ko"), ["korean", 6.5]);
  assert.deepEqual(start("ja"), ["japanese", 6.5]);
  assert.deepEqual(start("en"), ["japanese", 6.5]);
  assert.deepEqual(start("zh", "japanese"), ["japanese", 6.5], "an existing choice wins over the language");
  assert.equal(state.settings.defaultRules, "japanese");
  // Starting games does not turn "never chosen" into a choice.
  start("zh");
  assert.equal(state.settings.defaultRules, null);
  assert.equal(C.defaultRules(), "chinese");
});
