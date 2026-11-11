/**
 * Shell: the string table — every key the interface uses exists, in all four languages, and the review sheet matches.
 */
import { test, LANG_IDS, MESSAGES, PROBLEMS, assert, fs, path, root, setLang, t } from "./helpers.mjs";
import { MESSAGE_AREAS } from "../../src/web/js/messages.js";

await test("shell strings: the area files are merged into the table, in four languages with the same placeholders", () => {
  // The same placeholders (a language may use one twice: "{0}×{0}").
  // A Korean placeholder may carry its particle, {0:은/는} (i18n.js josa).
  const holes = (v) => [...new Set([...v.matchAll(/\{(\d)(?::[^{}]*)?\}/g)].map((m) => m[1]))].sort().join();
  for (const [key, v] of Object.entries(MESSAGES)) for (const lang of LANG_IDS) assert.equal(holes(v[lang]), holes(v.en), `${key} ${lang}`);
  const files = fs.readdirSync(path.join(root, "src/web/js/messages")).filter((f) => f !== "m.js").map((f) => f.replace(/\.js$/, "")).sort();
  assert.deepEqual(Object.keys(MESSAGE_AREAS).sort(), files, "every file under messages/ is an area of the table");
  let total = 0;
  for (const [file, table] of Object.entries(MESSAGE_AREAS)) {
    assert.ok(Object.keys(table).length > 0, file);
    total += Object.keys(table).length;
    for (const [key, v] of Object.entries(table)) assert.equal(MESSAGES[key], v, `${key} (${file}.js) is the table's`);
  }
  assert.equal(total, Object.keys(MESSAGES).length, "no key is defined in two files");
  // The four spaces have their names; the old key for Practice is gone.
  for (const key of ["nav.today", "nav.play", "nav.practice", "nav.library"]) assert.ok(MESSAGES[key], key);
  assert.ok(!MESSAGES["nav.learn"], "one key for Practice");
});

await test("shell strings: every key prefix lives in exactly one area file, and none is named after a version", () => {
  const home = new Map();
  for (const [file, table] of Object.entries(MESSAGE_AREAS)) {
    for (const key of Object.keys(table)) {
      const prefix = key.split(".")[0];
      assert.doesNotMatch(prefix, /^v\d/, `${key} is named after a version`);
      if (!home.has(prefix)) home.set(prefix, file);
      assert.equal(home.get(prefix), file, `${prefix}.* is split between ${home.get(prefix)}.js and ${file}.js`);
    }
  }
  // The source agrees with what was imported (a key written twice in one file would hide here otherwise).
  for (const file of Object.keys(MESSAGE_AREAS)) {
    const src = fs.readFileSync(path.join(root, "src/web/js/messages", file + ".js"), "utf8");
    const keys = [...src.matchAll(/^ {2}"([^"]+)":\s/gm)].map((m) => m[1]);
    assert.equal(new Set(keys).size, keys.length, `${file}.js writes a key twice`);
    assert.deepEqual(keys, Object.keys(MESSAGE_AREAS[file]), file);
  }
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
  assert.equal(t("nav.practice"), "練習");
  setLang("en");
  assert.equal(t("nav.practice"), "Practice");
  setLang("zh");
  assert.equal(t("nav.play"), "下棋");
  assert.equal(t("nav.practice"), "练习");
  assert.equal(t("nav.today"), "今天");
  assert.equal(t("nav.library"), "棋谱");
});

await test("every key the interface uses is in the string table", () => {
  const used = new Set();
  for (const area of ["app", "play", "practice", "data", "model"]) {
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

await test("every key in the string table is used by the interface", () => {
  // Every source file but the tables themselves; a key counts as used when it is written out somewhere as a string.
  const sources = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) {
        if (name !== "messages") walk(file);
      } else if (/\.(js|jsx)$/.test(name) && name !== "bundle.js" && name !== "messages.js") sources.push(fs.readFileSync(file, "utf8"));
    }
  };
  walk(path.join(root, "src/web/js"));
  const src = sources.join("\n");
  const written = new Set([...src.matchAll(/["'`]([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)["'`]/g)].map((m) => m[1]));
  /*
   * Keys built at runtime, by the prefix (or suffix) the code adds to a
   * value from a fixed vocabulary. Each line names where. A key that is
   * neither written out nor covered here is dead: remove it.
   */
  const DYNAMIC_PREFIXES = [
    "area.", // review.jsx, insight.js: "area." + areaOf(...)
    "backup.error.", // controller.js restoreError
    "edit.mark.", // review.jsx: the mark kinds (rules.js MARK_KINDS)
    "error.", // play-ctl.js: "error." + the rules' reason
    "explorer.name.", // explorer-ctl.js: named openings and joseki of the book
    "explorer.tag.", // explorer.jsx: "explorer.tag." + tag
    "goal.", // practice-ctl.js goalText: "goal." + pz.goal
    "grade.", // "grade." + 1…5
    "explorer.row.", // play/home.jsx: the two explorer rows, whole | corner
    "library.kind.", // play/home.jsx: the history's filter chips
    "library.sort.", // play/home.jsx: the sort choices
    "lossKind.", // insight.js loss kinds
    "models.error.", // models-ctl.js modelErrorText
    "models.human.", // sheets.jsx ModelRow: `models.${kind}.name` / `.desc`
    "models.strong.",
    "newGame.", // sheets.jsx PRESETS: "newGame." + quick | medium | full
    "phase.", // summary.js PHASES
    "phaseIn.",
    "practice.status.", // practice.jsx: a tile's status (new, tried, solved, due, mastered)
    "problem.endgame.", // content/problems.js: `problem.endgame.${k}.title` / `.hint`
    "settings.volume.", // sheets.jsx: the volume levels
    "shape.", // content: the classic shapes
    "theme.", // content: problem themes
    "tip.opening.", // play.jsx: "tip.opening." + 1…3
    "topic.", // "topic." + a problem topic, and its ".desc"
    "backup.note.", // controller.js: the note shown after a reload
    "why.", // teach-why.js: "why.warn." / "why.hint." + reason
  ];
  // Forms of a written key: plurals (i18n.js tn) and the two suffixes the code appends.
  const DYNAMIC_SUFFIXES = [
    /\.(one|two|few|many|zero)$/, // tn(key, n)
    /Of$/, // summary.js: a takeaway about the other player (key + "Of")
    /One$/, // practice-ctl.js: an endgame answer of exactly one point (key + "One")
  ];
  const isUsed = (key) => {
    if (written.has(key)) return true;
    if (DYNAMIC_PREFIXES.some((p) => key.startsWith(p))) return true;
    return DYNAMIC_SUFFIXES.some((re) => re.test(key) && written.has(key.replace(re, "")));
  };
  const unused = Object.keys(MESSAGES).filter((key) => !isUsed(key));
  assert.deepEqual(unused, [], "strings no code uses (remove them, or name how they are built)");
  // The allow-list itself stays honest: every prefix in it still has keys, and is still built somewhere.
  for (const p of DYNAMIC_PREFIXES) {
    assert.ok(Object.keys(MESSAGES).some((k) => k.startsWith(p)), `no key starts with ${p}`);
    const stem = p.split(".")[0];
    assert.ok(new RegExp(`["'\`]${stem}\\.[a-zA-Z0-9_.-]*["'\`$]`).test(src), `nothing builds ${p}`);
  }
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
