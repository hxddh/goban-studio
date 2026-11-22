/**
 * Shell: the Windows installer (packaging/windows/GobanStudio.wxs, built by
 * scripts/make-msi.mjs) — read as XML and checked against what the app,
 * the zip and the updater expect. Installing it, opening an .sgf with it,
 * updating it in place and uninstalling it are tested on a real Windows by
 * scripts/test-msi.mjs (build-windows.yml); this file checks what can be
 * checked anywhere.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";
import * as Msi from "../make-msi.mjs";

/* ------------------------------------------------------- XML subset */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s, at) =>
  s.replace(/&([a-z]+);/g, (m, name) => {
    if (!(name in ENTITIES)) throw new Error(`xml-lite: unknown entity ${m} at ${at}`);
    return ENTITIES[name];
  });

/**
 * A strict reader for the XML this repository writes: elements, attributes,
 * comments, the declaration and text. It throws on anything malformed
 * (unclosed or mismatched tags, a duplicate attribute, a stray `<` or `&`)
 * and on what it does not read (DOCTYPE, CDATA, processing instructions
 * other than the declaration).
 */
export function parseXml(text) {
  let i = 0;
  const fail = (why) => {
    throw new Error(`xml-lite: ${why} at offset ${i}`);
  };
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const decl = /^<\?xml\s+version="1\.0"(\s+encoding="utf-8")?\s*\?>/i.exec(text.slice(i));
  if (decl) i += decl[0].length;
  const top = { name: "#document", attrs: {}, children: [] };
  const stack = [top];
  while (i < text.length) {
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) fail("unclosed comment");
      if (text.slice(i + 4, end).includes("--")) fail("-- inside a comment");
      i = end + 3;
    } else if (text.startsWith("</", i)) {
      const m = /^<\/([\w:.-]+)\s*>/.exec(text.slice(i));
      if (!m) fail("bad end tag");
      const open = stack.pop();
      if (!open || open === top || open.name !== m[1]) fail(`</${m[1]}> does not close <${open?.name}>`);
      i += m[0].length;
    } else if (text.startsWith("<?", i) || text.startsWith("<!", i)) {
      fail("unsupported markup");
    } else if (text[i] === "<") {
      const m = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(text.slice(i));
      if (!m) fail("bad start tag");
      const attrs = {};
      for (const a of m[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (Object.hasOwn(attrs, a[1])) fail(`duplicate attribute ${a[1]}`);
        attrs[a[1]] = unescape(a[2] ?? a[3], i);
      }
      const el = { name: m[1], attrs, children: [], parent: stack.at(-1) };
      stack.at(-1).children.push(el);
      if (!m[3]) stack.push(el);
      i += m[0].length;
    } else {
      const end = text.indexOf("<", i);
      const chunk = text.slice(i, end < 0 ? text.length : end);
      unescape(chunk, i);
      if (/&(?![a-z]+;)/.test(chunk)) fail("bare &");
      if (stack.length === 1 && chunk.trim()) fail("text outside the root element");
      i += chunk.length;
    }
  }
  if (stack.length !== 1) fail(`<${stack.at(-1).name}> is not closed`);
  const roots = top.children;
  if (roots.length !== 1) throw new Error(`xml-lite: ${roots.length} root elements`);
  return roots[0];
}

const all = (el, name) => {
  const out = [];
  const walk = (e) => {
    for (const c of e.children) {
      if (!name || c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
};
const one = (el, name, pred = () => true) => {
  const found = all(el, name).filter(pred);
  assert.equal(found.length, 1, `exactly one <${name}>`);
  return found[0];
};
const ancestors = (el) => {
  const out = [];
  for (let p = el.parent; p; p = p.parent) out.push(p);
  return out;
};
/** A registry value's full key: its own Key appended to its RegistryKey parent's. */
const fullKey = (v) => [v.parent?.name === "RegistryKey" ? v.parent.attrs.Key : null, v.attrs.Key].filter(Boolean).join("\\");
const rootOf = (v) => v.attrs.Root || (v.parent?.name === "RegistryKey" ? v.parent.attrs.Root : undefined);

const read = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
const WXS_TEXT = read(Msi.WXS);
const wix = parseXml(WXS_TEXT);
const pkg = one(wix, "Package");

/** The stable identity of the installed product: never change it (MajorUpgrade finds older versions by it). */
const UPGRADE_CODE = "049F0542-01C3-4E23-B802-35EF798E2AFC";

/* ------------------------------------------------------------ checks */

await test("installer: the XML reader reads what it should and refuses what it cannot", () => {
  const doc = parseXml('<?xml version="1.0" encoding="utf-8"?>\n<!-- c -->\n<A x="1 &amp; 2"><B y=\'q\' /><C>t &lt; u</C></A>\n');
  assert.equal(doc.name, "A");
  assert.equal(doc.attrs.x, "1 & 2");
  assert.deepEqual(
    doc.children.map((c) => [c.name, c.attrs]),
    [
      ["B", { y: "q" }],
      ["C", {}],
    ],
  );
  for (const bad of ["<A><B></A></B>", "<A>", '<A x="1" x="2"/>', "<A>&nope;</A>", "<A>a & b</A>", "<A/><B/>", "<!DOCTYPE A><A/>", "<A><!-- a -- b --></A>"]) {
    assert.throws(() => parseXml(bad), /xml-lite/, bad);
  }
});

await test("installer: the WiX source is WiX v4+ XML with the Util extension", () => {
  assert.equal(wix.name, "Wix");
  assert.equal(wix.attrs.xmlns, "http://wixtoolset.org/schemas/v4/wxs");
  assert.equal(wix.attrs["xmlns:util"], "http://wixtoolset.org/schemas/v4/wxs/util");
  assert.ok(WXS_TEXT.startsWith('<?xml version="1.0" encoding="utf-8"?>\n'));
  // WiX refuses an empty attribute value (WIX0006).
  for (const e of all(wix)) for (const [k, v] of Object.entries(e.attrs)) assert.notEqual(v.trim(), "", `<${e.name} ${k}="">`);
  // Every Id is unique.
  const ids = all(wix)
    .filter((e) => e.attrs.Id && !/Ref$/.test(e.name))
    .map((e) => e.attrs.Id);
  assert.deepEqual(
    ids.filter((x, k) => ids.indexOf(x) !== k),
    [],
    "duplicate Ids",
  );
});

await test("installer: one product identity for every version, replaced by a newer installer", () => {
  assert.equal(pkg.attrs.UpgradeCode, UPGRADE_CODE);
  assert.match(pkg.attrs.UpgradeCode, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  // A new ProductCode per build (WiX's default), which a major upgrade needs.
  assert.equal(pkg.attrs.ProductCode, undefined);
  const up = one(wix, "MajorUpgrade");
  assert.equal(up.parent, pkg);
  assert.ok(up.attrs.DowngradeErrorMessage, "an older installer refuses to replace a newer version");
  assert.equal(up.attrs.AllowSameVersionUpgrades, "yes", "running the same installer again replaces the copy (after in-app updates too)");
  assert.equal(pkg.attrs.Name, "Goban Studio");
  assert.ok(pkg.attrs.Manufacturer);
  assert.equal(one(wix, "MediaTemplate").attrs.EmbedCab, "yes", "one file");
});

await test("installer: the version is package.json's, and fits an MSI ProductVersion", () => {
  assert.equal(pkg.attrs.Version, "$(var.Version)", "the version comes from the build, not the source");
  const version = Msi.packageVersion(root);
  assert.equal(version, JSON.parse(read("package.json")).version);
  assert.equal((read("app.zon").match(/\.version = "([^"]+)"/) || [])[1], version, "app.zon agrees (the app reports it)");
  assert.equal(Msi.msiVersion(version), version);
  const args = Msi.wixArgs({ pkgDir: "dist/GobanStudio", out: "out.msi", version, utilExt: "util.dll" });
  assert.equal(args[0], "build");
  assert.equal(args[1], path.join(root, Msi.WXS));
  assert.equal(args[args.indexOf("-d") + 1], `Version=${version}`);
  assert.equal(args[args.indexOf("-arch") + 1], "x64");
  assert.equal(args[args.indexOf("-bindpath") + 1], "App=dist/GobanStudio");
  assert.equal(args[args.indexOf("-ext") + 1], "util.dll");
  assert.equal(args.at(-1), "out.msi");
  // WiX v5's build takes no -sice (and runs no ICE validation): the first run on Windows refused it.
  assert.ok(!args.includes("-sice"), "no -sice for wix build");
  for (const ok of ["1.0.0", "255.255.65535", "17.0.0"]) assert.equal(Msi.msiVersion(ok), ok);
  for (const bad of ["256.0.0", "1.256.0", "1.0.65536", "1.0", "v1.0.0", "1.0.0-rc.1", "1.0.0.1"]) assert.throws(() => Msi.msiVersion(bad), /version|ProductVersion/i, bad);
  // The CLI defaults to package.json's version and refuses a package that says otherwise.
  const cli = read("scripts/make-msi.mjs");
  assert.match(cli, /const version = at >= 0 \? args\[at \+ 1\] : packageVersion\(\);/);
  assert.match(cli, /if \(at < 0 && built !== version\) throw/);
});

await test("installer: per user, no administrator, into %LOCALAPPDATA%\\Programs\\Goban Studio", () => {
  assert.equal(pkg.attrs.Scope, "perUser");
  const dir = one(wix, "Directory", (d) => d.attrs.Id === "INSTALLFOLDER");
  const chain = [dir, ...ancestors(dir)].filter((e) => e.name === "Directory" || e.name === "StandardDirectory");
  assert.deepEqual(
    chain.map((e) => e.attrs.Name || e.attrs.Id),
    [...Msi.INSTALL_SUBDIR].reverse().concat("LocalAppDataFolder"),
  );
  // Everything it writes to the registry is the current user's.
  const values = all(wix, "RegistryValue");
  assert.ok(values.length >= 6);
  for (const v of [...values, ...all(wix, "RegistrySearch")]) assert.equal(rootOf(v), "HKCU", `${fullKey(v)} is under HKCU`);
  assert.doesNotMatch(WXS_TEXT, /HKLM|ProgramFiles|perMachine|Privileged/);
  // The folder the in-app updater swaps is one it can write and rename
  // (src/install_apply.zig: <root>\bin\goban-studio.exe, the parent writable).
  assert.match(read("src/install_apply.zig"), /Windows: <root>\\bin\\goban-studio\.exe {13}→ <root>/);
  assert.match(read("src/updater/apply-windows.ps1"), /\$exeRel = "bin\\goban-studio\.exe"/);
});

await test("installer: every file of the package, as in the zip", () => {
  const group = one(wix, "ComponentGroup", (g) => g.attrs.Id === "AppFiles");
  assert.equal(group.attrs.Directory, "INSTALLFOLDER");
  const files = one(group, "Files");
  assert.equal(files.attrs.Include, "!(bindpath.App)\\**");
  assert.equal(all(files, "Exclude").length, 0, "nothing of the package is left out");
  // make-msi binds App to the packaged folder and checks it is one.
  assert.ok(Msi.REQUIRED_FILES.includes("bin/goban-studio.exe"));
  assert.ok(Msi.REQUIRED_FILES.includes("app-icon.ico"), "the icon the Native SDK writes at the package root");
  assert.equal(Msi.MSI_NAME, "GobanStudio-Windows-x64.msi");
});

await test("installer: a Start menu shortcut to the installed app", () => {
  const sc = one(wix, "Shortcut");
  const comp = sc.parent;
  assert.equal(comp.name, "Component");
  assert.equal(comp.parent.name, "StandardDirectory");
  assert.equal(comp.parent.attrs.Id, "ProgramMenuFolder");
  assert.equal(sc.attrs.Name, "Goban Studio");
  assert.equal(sc.attrs.Target, "[INSTALLFOLDER]bin\\goban-studio.exe");
  assert.equal(sc.attrs.WorkingDirectory, "INSTALLFOLDER");
  // A per-user shortcut's key path is a registry value under HKCU (ICE43).
  const key = all(comp, "RegistryValue").filter((v) => v.attrs.KeyPath === "yes");
  assert.equal(key.length, 1);
  assert.equal(rootOf(key[0]), "HKCU");
  // No desktop shortcut.
  assert.doesNotMatch(WXS_TEXT, /DesktopFolder/);
});

await test("installer: .sgf files open with Goban Studio, the way the app takes them", () => {
  // The ProgId the Native SDK derives for the zip's register-file-types.ps1:
  // the app id and the association's name, letters, digits and dots only.
  const zon = read("app.zon");
  const id = zon.match(/\.id = "([^"]+)"/)[1];
  const assoc = zon.match(/\.file_associations = \.\{\s*\.\{\s*\.name = "([^"]+)"/)[1];
  const derived = `${id.replace(/[^A-Za-z0-9.]/g, "")}.${assoc.replace(/[^A-Za-z0-9.]/g, "")}`;
  assert.equal(Msi.PROG_ID, derived);
  assert.equal(Msi.PROG_ID, "dev.hxddh.gobanstudio.GogamerecordSGF");
  assert.ok(read("packaging/README-Windows.txt").includes(`HKCU\\Software\\Classes\\${Msi.PROG_ID}`), "the README names the same key");
  assert.match(zon, /\.extensions = \.\{"sgf"\}/);
  const values = all(wix, "RegistryValue");
  const at = (key, name) => values.filter((v) => fullKey(v) === key && (v.attrs.Name || "") === (name || ""));
  const ext = at("Software\\Classes\\.sgf");
  assert.equal(ext.length, 1);
  assert.equal(ext[0].attrs.Value, Msi.PROG_ID);
  assert.equal(at("Software\\Classes\\.sgf", "Content Type")[0].attrs.Value, zon.match(/\.mime_types = \.\{"([^"]+)"\}/)[1]);
  assert.equal(at("Software\\Classes\\.sgf\\OpenWithProgids", Msi.PROG_ID).length, 1);
  const progKey = `Software\\Classes\\${Msi.PROG_ID}`;
  assert.equal(at(progKey)[0].attrs.Value, assoc);
  assert.equal(at(`${progKey}\\DefaultIcon`)[0].attrs.Value, "[INSTALLFOLDER]app-icon.ico");
  // An absolute, quoted path: what src/instance.zig wantedPath accepts and hands over.
  assert.equal(at(`${progKey}\\shell\\open\\command`)[0].attrs.Value, '"[INSTALLFOLDER]bin\\goban-studio.exe" "%1"');
  assert.match(read("src/instance.zig"), /if \(!std\.ascii\.endsWithIgnoreCase\(arg, "\.sgf"\)\) return false;/);
  // Our own key goes whole on uninstall; .sgf only loses our values.
  const progKeyEl = one(wix, "RegistryKey", (k) => k.attrs.Key === progKey);
  assert.equal(progKeyEl.attrs.ForceDeleteOnUninstall, "yes");
  assert.ok(!all(wix, "RegistryKey").some((k) => k.attrs.Key === "Software\\Classes\\.sgf" && k.attrs.ForceDeleteOnUninstall === "yes"));
});

await test("installer: Apps & Features shows the icon; uninstalling removes the whole folder", () => {
  const props = Object.fromEntries(all(wix, "Property").map((p) => [p.attrs.Id, p]));
  const icon = one(wix, "Icon");
  assert.equal(props.ARPPRODUCTICON.attrs.Value, icon.attrs.Id);
  assert.equal(icon.attrs.SourceFile, "!(bindpath.App)\\app-icon.ico");
  assert.equal(one(wix, "Shortcut").attrs.Icon, icon.attrs.Id);
  assert.equal(props.ARPNOMODIFY.attrs.Value, "1");
  // RemoveFolderEx removes the folder named by a property the installer
  // itself remembered (the "remember property" pattern): files the in-app
  // updater or WebView2 put there go too.
  const rfx = one(wix, "util:RemoveFolderEx");
  assert.equal(rfx.attrs.On, "uninstall");
  const search = one(props[rfx.attrs.Property], "RegistrySearch");
  const remembered = all(rfx.parent, "RegistryValue").find((v) => v.attrs.Value === "[INSTALLFOLDER]");
  assert.ok(remembered, "the component that removes the folder remembers it");
  assert.equal(search.attrs.Key, fullKey(remembered));
  assert.equal(search.attrs.Name, remembered.attrs.Name);
  assert.equal(rfx.parent.attrs.Directory, "INSTALLFOLDER");
});

await test("installer: every component is in the one feature, and the feature cannot be left out", () => {
  const feature = one(wix, "Feature");
  assert.equal(feature.attrs.AllowAbsent, "no");
  const comps = all(wix, "Component").map((c) => c.attrs.Id);
  const refs = all(feature, "ComponentRef").map((r) => r.attrs.Id);
  assert.deepEqual([...refs].sort(), [...comps].sort());
  const groups = all(wix, "ComponentGroup").map((g) => g.attrs.Id);
  assert.deepEqual(
    all(feature, "ComponentGroupRef").map((r) => r.attrs.Id),
    groups,
  );
});
