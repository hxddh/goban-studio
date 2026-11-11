/**
 * Assemble frontend/dist from src/web.
 *
 * One script, not a hand-copied list: the packaged page, styles, bundle,
 * assets and icon are copied here (the app uses system fonts). `npm run build` must run first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src/web");
const dist = path.join(root, "frontend/dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "js"), { recursive: true });

for (const f of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(src, f), path.join(dist, f));
}
for (const f of ["bundle.js"]) {
  fs.copyFileSync(path.join(src, "js", f), path.join(dist, "js", f));
}
// Data the bundle fetches on first use instead of parsing at start-up
// (scripts/bundle.mjs LAZY_DATA), served beside index.html.
fs.mkdirSync(path.join(dist, "content"), { recursive: true });
for (const f of ["book.json"]) {
  fs.copyFileSync(path.join(src, "js", "content", f), path.join(dist, "content", f));
}
// The course, problems and classics past the start-up index
// (src/web/js/content.js), written by bundle.mjs.
for (const f of ["course.json", "problems.json", "classics.json"]) {
  const from = path.join(src, "js", "content-lazy", f);
  if (!fs.existsSync(from)) throw new Error(`${from} is missing: run npm run build first`);
  fs.copyFileSync(from, path.join(dist, "content", f));
}
if (fs.existsSync(path.join(root, "assets/icon.png"))) {
  fs.copyFileSync(path.join(root, "assets/icon.png"), path.join(dist, "icon.png"));
}
// Generated stone sprites, sounds and the brand mark
// (scripts/make-assets.mjs). The preview page is a development aid only.
if (fs.existsSync(path.join(src, "assets"))) {
  fs.cpSync(path.join(src, "assets"), path.join(dist, "assets"), {
    recursive: true,
    filter: (from) => path.basename(from) !== "preview.html",
  });
}
if (fs.existsSync(path.join(src, "moka"))) {
  fs.cpSync(path.join(src, "moka"), path.join(dist, "moka"), { recursive: true });
}
// The network and config are small enough for the normal asset bundle. The
// platform binary is copied into the packaged app after `native package`:
// the SDK's asset bundler caps a single file at 16 MiB, and the CPU KataGo
// executable can be larger than that.
if (fs.existsSync(path.join(root, "engine", "model"))) {
  fs.mkdirSync(path.join(dist, "engine"), { recursive: true });
  fs.cpSync(path.join(root, "engine", "model"), path.join(dist, "engine", "model"), { recursive: true });
}

// Licence texts travel with every package. The app's own MIT text is not
// optional just because the source repository has it: a ZIP that only carries
// third-party notices is an incomplete redistribution.
fs.mkdirSync(path.join(dist, "licenses"), { recursive: true });
fs.copyFileSync(path.join(root, "LICENSE"), path.join(dist, "licenses", "Goban-Studio-MIT.txt"));
const licenseSources = [
  [path.join(root, "node_modules", "@sabaki", "go-board", "LICENSE"), "sabaki-go-board-MIT.txt"],
  [path.join(root, "node_modules", "preact", "LICENSE"), "Preact-MIT.txt"],
  [path.join(src, "moka", "LICENSE"), "Moka-MIT.txt"],
  [path.join(root, "engine", "model", "LICENSE-KataGo.txt"), "KataGo-MIT.txt"],
  [path.join(src, "licenses", "README.txt"), "README.txt"],
  [path.join(src, "moka", "THIRD_PARTY_NOTICES.md"), "Moka-THIRD_PARTY_NOTICES.md"],
];
for (const [from, name] of licenseSources) {
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dist, "licenses", name));
}

const appZon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
const version = (appZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1] || "0.0.0";
fs.writeFileSync(
  path.join(dist, "build-info.json"),
  JSON.stringify({ app: version, builtAt: new Date().toISOString() }, null, 2) + "\n",
);

console.log("frontend/dist ← src/web");
