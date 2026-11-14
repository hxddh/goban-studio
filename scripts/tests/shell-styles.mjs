/**
 * Shell: the stylesheet as a design system — the token tables of docs/design.md are the tokens of
 * :root, spacing, radii, shadows and layers come from tokens, colours are named only in :root, and
 * no rule styles a class the interface never writes.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";

const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8").replace(/\r\n/g, "\n");
const doc = fs.readFileSync(path.join(root, "docs/design.md"), "utf8").replace(/\r\n/g, "\n");

/** Custom properties of the block that starts at `head` ("--name" → value, comments dropped). */
function tokensOf(head) {
  const at = css.indexOf("\n" + head + " {");
  assert.ok(at >= 0, head);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("\n}", at)).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const LIGHT = tokensOf(":root");
const DARK = { ...LIGHT, ...tokensOf(':root[data-theme="dark"]') };

/** Every declaration outside the token blocks: [{ selector, prop, value }]. */
function declarations() {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (/^:root(\[data-(theme|text)="\w+"\])?$/.test(selector) || /^(from|to|[\d%, ]+)$/.test(selector)) continue;
    for (const d of m[2].split(";")) {
      const c = d.indexOf(":");
      if (c > 0) out.push({ selector, prop: d.slice(0, c).trim(), value: d.slice(c + 1).trim().replace(/\s+/g, " ") });
    }
  }
  return out;
}
const DECLS = declarations();

/** A value as written in the doc or the stylesheet → one spelling: lower case, no spaces after commas, .5 for 0.5, "4px" for "4 px". */
const norm = (v) =>
  String(v)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(\d) (px|ms)\b/g, "$1$2")
    .replace(/\b0\.(\d)/g, ".$1")
    .replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/g, "#$1$1$2$2$3$3")
    .replace(/\s*,\s*/g, ",")
    .trim();

/** The rows of every table in the doc whose first cell names a token: [{ token, cells: { header: text } }]. */
function tokenRows() {
  const rows = [];
  let header = null;
  for (const line of doc.split("\n")) {
    if (!line.startsWith("|")) { header = null; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!header) { header = cells; continue; }
    if (/^-+$/.test(cells[0].replace(/[ :]/g, ""))) continue;
    const m = /^`(--[\w-]+)`$/.exec(cells[0]);
    if (m && header[0] === "Token") rows.push({ token: m[1], cells: Object.fromEntries(header.map((h, i) => [h, cells[i]])) });
  }
  return rows;
}

await test("shell styles: the token tables of docs/design.md are the tokens of :root, value for value, and every token is in a table", () => {
  const rows = tokenRows();
  assert.ok(rows.length > 60, `${rows.length} token rows found`);
  const seen = new Set();
  for (const { token, cells } of rows) {
    assert.ok(token in LIGHT, `${token} is in the doc but not in :root`);
    assert.ok(!seen.has(token), `${token} is in two tables`);
    seen.add(token);
    if ("Size / line" in cells) {
      // Type: "28 / 34" and a weight → "600 28px/34px var(--font)".
      const [size, lineHeight] = cells["Size / line"].split("/").map((x) => x.trim());
      assert.equal(LIGHT[token], `${cells.Weight} ${size}px/${lineHeight}px var(--font)`, token);
    } else if ("Light" in cells) {
      assert.equal(norm(cells.Light), norm(LIGHT[token]), `${token} (light)`);
      assert.equal(norm(cells.Dark), norm(DARK[token]), `${token} (dark)`);
    } else {
      const value = cells.Value ?? cells.Duration;
      assert.equal(norm(value), norm(LIGHT[token]), token);
    }
  }
  // What the tables leave to prose: the layout widths of §3, the font stack of §2 and the alias of --ease-out.
  const PROSE = ["--sb", "--panel", "--inset", "--tb", "--page", "--font", "--ease"];
  for (const p of PROSE) assert.ok(doc.includes("`" + p + "`") || p === "--inset" || p === "--font", `${p} is named in the doc`);
  const missing = Object.keys(LIGHT).filter((k) => !seen.has(k) && !PROSE.includes(k));
  assert.deepEqual(missing, [], "tokens of :root that no table of docs/design.md lists");
  // The dark theme only overrides tokens that exist.
  for (const k of Object.keys(tokensOf(':root[data-theme="dark"]'))) assert.ok(k in LIGHT, `${k} is only defined in the dark theme`);
  // Larger text is the same type tokens one step up (the doc gives the sizes in its rule).
  const large = tokensOf(':root[data-text="large"]');
  assert.deepEqual(Object.keys(large).sort(), Object.keys(LIGHT).filter((k) => k.startsWith("--t-") && k !== "--t-label").sort());
  const sizes = Object.values(large).map((v) => /(\d+)px\/(\d+)px/.exec(v).slice(1).join("/")).join(", ");
  assert.ok(doc.replace(/\s+/g, " ").includes(`(${sizes})`), `Larger text sizes ${sizes} are the doc's`);
});

await test("shell styles: spacing, radii, shadows and layers come from tokens (coverage does not drop)", () => {
  const count = { space: [0, 0], radius: [0, 0], shadow: [0, 0], layer: [0, 0] };
  const raw = { space: [], radius: [], shadow: [], layer: [] };
  const tally = (kind, isToken, where) => {
    count[kind][1]++;
    if (isToken) count[kind][0]++;
    else raw[kind].push(where);
  };
  for (const { selector, prop, value } of DECLS) {
    const where = `${selector} { ${prop}: ${value} }`;
    if (/^(margin|padding)(-(top|right|bottom|left))?$|^(row-|column-)?gap$/.test(prop)) {
      // Each length of the value counts; 0 and auto are not lengths to tokenise.
      for (const part of value.match(/var\(--s-[\w]+\)|-?[\d.]+(px|em|ch|%)/g) || []) tally("space", part.startsWith("var("), where);
    } else if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) {
      for (const part of value.split(" ")) if (part !== "0" && part !== "50%") tally("radius", /^var\(--r-[\w]+\)$/.test(part), where);
    } else if (prop === "box-shadow") {
      tally("shadow", value === "none" || /^var\(--(shadow|ring|stone-edge)-[\w-]+\)/.test(value), where);
    } else if (prop === "z-index") {
      tally("layer", /^var\(--z-[\w]+\)$/.test(value), where);
    }
  }
  // The floors are what the stylesheet reaches now, rounded down: a new rule with a raw value where a token exists lowers them.
  const FLOOR = { space: 0.95, radius: 0.93, shadow: 1, layer: 1 };
  for (const [kind, [tokens, all]] of Object.entries(count)) {
    assert.ok(all > 0, kind);
    assert.ok(tokens / all >= FLOOR[kind], `${kind}: ${tokens} of ${all} from tokens (${(100 * tokens / all).toFixed(1)}%), the floor is ${FLOOR[kind] * 100}%. Raw: ${raw[kind].slice(0, 12).join(" | ")}`);
  }
  // A raw value that equals a token's is never right.
  const spaces = new Set(Object.entries(LIGHT).filter(([k]) => k.startsWith("--s-")).map(([, v]) => v));
  for (const { selector, prop, value } of DECLS) {
    if (!/^(margin|padding)(-(top|right|bottom|left))?$|^(row-|column-)?gap$/.test(prop) || /calc\(/.test(value)) continue;
    for (const part of value.split(" ")) assert.ok(!spaces.has(part.replace(/^-/, "")), `${selector} { ${prop}: ${value} } writes ${part} where a --s token has that value`);
  }
  // The repeated label type is the token.
  for (const { selector, prop, value } of DECLS) if (prop === "font") assert.notEqual(value, LIGHT["--t-label"], `${selector} repeats --t-label`);
});

await test("shell styles: colours are named in :root only", () => {
  const offenders = DECLS.filter(({ value }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)).map(({ selector, prop, value }) => `${selector} { ${prop}: ${value} }`);
  assert.deepEqual(offenders, [], "a colour written outside :root (name it as a token)");
});

await test("shell styles: every class the stylesheet names is written somewhere in the interface", () => {
  const sources = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) {
        if (!["messages", "content", "content-lazy"].includes(name)) walk(file);
      } else if (/\.(js|jsx)$/.test(name) && name !== "bundle.js") sources.push(fs.readFileSync(file, "utf8"));
    }
  };
  walk(path.join(root, "src/web/js"));
  const words = new Set(sources.join("\n").match(/[A-Za-z_][\w-]*/g));
  // Classes whose name is put together at run time, by the prefix the code writes.
  const BUILT = { "tag-mistake": "tag-", "v-good": "v-", "v-slack": "v-", "v-mistake": "v-" }; // explorer.jsx: `tag-${verdict.tag}`; play.jsx: `v-${verdict}`
  const classes = new Set();
  for (const { selector } of DECLS) for (const m of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1]);
  assert.ok(classes.size > 300, `${classes.size} classes`);
  const dead = [...classes].filter((c) => !words.has(c) && !(BUILT[c] && sources.some((s) => s.includes(BUILT[c] + "${")))).sort();
  assert.deepEqual(dead, [], "classes no view writes (remove their rules)");
});

await test("shell styles: one section per component, in the order the header gives", () => {
  const sections = [...css.matchAll(/^\/\* =+ (.+) \*\/$/gm)].map((m) => m[1]);
  assert.deepEqual(sections, [
    "TOKENS",
    "Base",
    "Layout: the window, the sidebar, the toolbar, pages",
    "Buttons and links",
    "Controls",
    "Rows and cards",
    "Sheets, menus, toasts, notices",
    "Board places: the stage and the panel",
    "Play",
    "Review",
    "Today",
    "Practice",
    "Library",
    "Settings and New game",
    "Onboarding and the safe state",
    "Responsive",
    "Reduced motion",
    "Forced colours",
  ]);
  // Each of the three that override is one block.
  assert.equal(css.split("@media (prefers-reduced-motion: reduce)").length, 2);
  assert.equal(css.split("@media (forced-colors: active)").length, 2);
  // Tokens are defined once: nothing redefines a custom property outside the token blocks.
  const stray = DECLS.filter(({ selector, prop }) => prop.startsWith("--") && !/^:root(:lang\(\w+\))?$/.test(selector)).map(({ selector, prop }) => `${selector} { ${prop} }`);
  assert.deepEqual(stray, [], "custom properties set outside :root");
});
