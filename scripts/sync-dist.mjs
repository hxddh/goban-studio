/**
 * Assemble frontend/dist from src/web.
 *
 * One script, not a hand-copied list: the packaged page, styles, bundle,
 * fonts and icon are copied here. `npm run build` must run first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src/web");
const dist = path.join(root, "frontend/dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "js"), { recursive: true });
fs.mkdirSync(path.join(dist, "fonts"), { recursive: true });

for (const f of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(src, f), path.join(dist, f));
}
for (const f of ["bundle.js"]) {
  fs.copyFileSync(path.join(src, "js", f), path.join(dist, "js", f));
}
for (const f of fs.readdirSync(path.join(src, "fonts"))) {
  fs.copyFileSync(path.join(src, "fonts", f), path.join(dist, "fonts", f));
}
if (fs.existsSync(path.join(root, "assets/icon.png"))) {
  fs.copyFileSync(path.join(root, "assets/icon.png"), path.join(dist, "icon.png"));
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
  [path.join(src, "moka", "LICENSE"), "Moka-MIT.txt"],
  [path.join(src, "fonts", "Inter-OFL.txt"), "Inter-OFL.txt"],
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
