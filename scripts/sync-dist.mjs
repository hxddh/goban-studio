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

const appZon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
const version = (appZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1] || "0.0.0";
fs.writeFileSync(
  path.join(dist, "build-info.json"),
  JSON.stringify({ app: version, builtAt: new Date().toISOString() }, null, 2) + "\n",
);

console.log("frontend/dist ← src/web");
