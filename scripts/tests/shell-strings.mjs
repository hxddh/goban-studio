/**
 * Shell: the string table — every key the interface uses exists, in all four languages, and the review sheet matches.
 */
import { test, LANG_IDS, MESSAGES, PROBLEMS, assert, fs, path, root, setLang, t } from "./helpers.mjs";

await test("shell strings: the area files (shell, play, learn) are merged into the table, in four languages with the same placeholders", async () => {
  // The same placeholders (a language may use one twice: "{0}×{0}").
  // v13: a Korean placeholder may carry its particle, {0:은/는} (i18n.js josa).
  const holes = (v) => [...new Set([...v.matchAll(/\{(\d)(?::[^{}]*)?\}/g)].map((m) => m[1]))].sort().join();
  for (const [key, v] of Object.entries(MESSAGES)) for (const lang of LANG_IDS) assert.equal(holes(v[lang]), holes(v.en), `${key} ${lang}`);
  for (const [file, name] of [["shell", "SHELL"], ["play", "PLAY"], ["learn", "LEARN"]]) {
    const mod = await import(`../../src/web/js/messages/${file}.js`);
    const table = mod[name];
    assert.ok(Object.keys(table).length > 0, file);
    for (const [key, v] of Object.entries(table)) assert.deepEqual(MESSAGES[key], v, `${key} (${file}.js) is the table's`);
  }
  // v12: the four spaces have their names (Practice keeps Learn's key).
  for (const key of ["nav.today", "nav.play", "nav.learn", "nav.library"]) assert.ok(MESSAGES[key], key);
  assert.ok(!MESSAGES["nav.practice"], "one key for Practice");
});

await test("every UI key exists in all four launch languages", () => {
  for (const [key, values] of Object.entries(MESSAGES)) {
    for (const lang of LANG_IDS) {
      assert.equal(typeof values[lang], "string", `${key} missing ${lang}`);
      assert.ok(values[lang].trim().length > 0, `${key} empty ${lang}`);
    }
  }
  setLang("ko");
  assert.equal(t("nav.play"), "대국");
  setLang("ja");
  assert.equal(t("nav.learn"), "練習");
  setLang("en");
  assert.equal(t("nav.learn"), "Practice");
  setLang("zh");
  assert.equal(t("nav.play"), "下棋");
  assert.equal(t("nav.learn"), "练习");
  assert.equal(t("nav.today"), "今天");
  assert.equal(t("nav.library"), "棋谱");
});

await test("every key the interface uses is in the string table", () => {
  const used = new Set();
  for (const area of ["app", "play", "learn", "data", "model"]) {
    const dir = path.join(root, "src/web/js", area);
    for (const file of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
    }
  }
  // Keys built at runtime from a fixed vocabulary.
  const dynamic = {
    "area.": ["top", "bottom", "left", "right", "center", "top-left", "top-right", "bottom-left", "bottom-right"],
    "error.": ["illegal", "occupied", "outside", "turn", "ko", "suicide", "superko"],
    "goal.": ["capture", "save", "kill", "live", "seki", "place"],
    "grade.": ["1", "2", "3", "4", "5"],
    "library.kind.": ["all", "won", "lost", "imported"],
    "newGame.": ["quick", "medium", "full"],
    "tip.opening.": ["1", "2", "3"],
  };
  for (const [prefix, list] of Object.entries(dynamic)) for (const v of list) used.add(prefix + v);
  for (const topic of new Set(PROBLEMS.map((p) => p.topic))) {
    used.add("topic." + topic);
    used.add("topic." + topic + ".desc");
  }
  const missing = [...used].filter((k) => !k.endsWith(".") && !MESSAGES[k]);
  assert.deepEqual(missing, [], "missing UI strings");
});

await test("the native-speaker review sheet matches messages.js", () => {
  const csv = fs.readFileSync(path.join(root, "docs/l10n/strings.csv"), "utf8").replace(/\r\n/g, "\n").replace(/^\ufeff/, "");
  const keys = csv.split("\n").slice(1).filter(Boolean).map((l) => JSON.parse(l.slice(0, l.indexOf('",') + 1)));
  assert.deepEqual(keys, Object.keys(MESSAGES), "run: node scripts/export-strings.mjs");
});

await test("every key the v3 views use is in the string table", () => {
  const dir = path.join(root, "src/web/js/app");
  const used = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
  }
  for (const k of ["time.none", "time.move30", "time.byoyomi"]) used.add(k);
  const missing = [...used].filter((k) => !k.endsWith(".") && !MESSAGES[k]);
  assert.deepEqual(missing, []);
  for (const [key, v] of Object.entries(MESSAGES)) for (const l of ["zh", "en", "ko", "ja"]) assert.ok(v[l]?.trim(), `${key} ${l}`);
});
