/**
 * Say truthfully how a release was signed (v4).
 *
 * Each platform build writes a signing status file (dist/signing-macos.json,
 * dist/signing-windows.json) describing what actually happened:
 *
 *   { "platform": "macos",   "mode": "developer-id" | "adhoc", "notarized": bool }
 *   { "platform": "windows", "mode": "authenticode" | "unsigned", "timestamped": bool }
 *
 * The release job turns those into the "First launch" text of the release
 * notes, and the platform builds into the README shipped inside the
 * package. Usage:
 *
 *   node scripts/signing-notes.mjs status macos|windows <mode> [--notarized|--timestamped] > status.json
 *   node scripts/signing-notes.mjs notes <notes.md> <signing-macos.json> <signing-windows.json> [<signing-macos-x64.json>] > out.md
 *
 * v5: with the Intel Mac status (fourth file) the table gains a
 * "macOS (Intel)" row for GobanStudio-macOS-x64.*.
 *   node scripts/signing-notes.mjs readme <README-*.txt> <signing-*.json> > out.txt
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUARANTINE = "xattr -dr com.apple.quarantine /Applications/Goban\\ Studio.app";

export function normalizeStatus(platform, value) {
  const s = value && typeof value === "object" ? value : {};
  if (platform === "macos") {
    const signed = s.mode === "developer-id";
    return { platform, mode: signed ? "developer-id" : "adhoc", notarized: signed && s.notarized === true };
  }
  if (platform === "windows") {
    const signed = s.mode === "authenticode";
    return { platform, mode: signed ? "authenticode" : "unsigned", timestamped: signed && s.timestamped === true };
  }
  throw new Error(`unknown platform ${platform}`);
}

/** The "First launch" cell of the release-notes table. */
export function firstLaunchText(status) {
  if (status.platform === "macos") {
    if (status.mode === "developer-id" && status.notarized) return "Signed with a Developer ID and **notarized by Apple**. Open it like any other app.";
    if (status.mode === "developer-id") return `Signed with a Developer ID, **not notarized**. Right-click the app → Open once. If macOS still blocks it: \`${QUARANTINE}\``;
    return `Ad-hoc signed, **not notarized**. Right-click the app → Open once. If macOS still blocks it: \`${QUARANTINE}\``;
  }
  if (status.mode === "authenticode") return "**Authenticode-signed.** SmartScreen may still ask while the certificate builds reputation: More info → Run anyway. WebView2 is preinstalled on Windows 10/11.";
  return "**Not Authenticode-signed.** If SmartScreen appears, choose More info → Run anyway. WebView2 is preinstalled on Windows 10/11.";
}

export function firstLaunchTable(macos, windows, macosIntel = null) {
  return [
    "| Platform | File | First launch |",
    "| --- | --- | --- |",
    `| macOS (Apple Silicon) | \`GobanStudio-macOS-arm64.dmg\` or \`.zip\` | ${firstLaunchText(macos)} |`,
    ...(macosIntel ? [`| macOS (Intel) | \`GobanStudio-macOS-x64.dmg\` or \`.zip\` | ${firstLaunchText(macosIntel)} |`] : []),
    `| Windows (x64) | \`GobanStudio-Windows-x64.zip\` | ${firstLaunchText(windows)} |`,
  ].join("\n");
}

/**
 * Put the real first-launch table into release notes. Replaces the block
 * between `<!-- first-launch -->` and `<!-- /first-launch -->`, else the
 * table under "## Download and first launch", else inserts that section
 * after the title.
 */
export function applyToNotes(notes, macos, windows, macosIntel = null) {
  const table = firstLaunchTable(macos, windows, macosIntel);
  const marked = /<!-- first-launch -->[\s\S]*?<!-- \/first-launch -->/;
  if (marked.test(notes)) return notes.replace(marked, `<!-- first-launch -->\n${table}\n<!-- /first-launch -->`);
  const lines = notes.split("\n");
  const head = lines.findIndex((l) => /^##\s+Download and first launch/i.test(l));
  if (head >= 0) {
    let start = head + 1;
    while (start < lines.length && !lines[start].startsWith("|") && !lines[start].startsWith("## ")) start++;
    if (start < lines.length && lines[start].startsWith("|")) {
      let end = start;
      while (end < lines.length && lines[end].startsWith("|")) end++;
      lines.splice(start, end - start, table);
      return lines.join("\n");
    }
    lines.splice(head + 1, 0, "", table);
    return lines.join("\n");
  }
  const title = lines.findIndex((l) => l.startsWith("# "));
  lines.splice(title + 1, 0, "", "## Download and first launch", "", table);
  return lines.join("\n");
}

/* ------------------------------------------------- README in the package */

/** The paragraphs in packaging/README-*.txt that describe an unsigned build. */
export const README_UNSIGNED = {
  macos: `2. This build is ad-hoc signed, not notarized. On first launch macOS may
   say it cannot verify the app. Right-click the app, choose Open, then
   confirm Open. You only need to do this once.
   If macOS still blocks it, run:

     ${QUARANTINE}
`,
  windows: `This build is not Authenticode-signed. Windows SmartScreen may show
"Windows protected your PC"; choose "More info" and then "Run anyway".
`,
};

export function readmeText(status) {
  if (status.platform === "macos") {
    if (status.mode === "developer-id" && status.notarized) {
      return `2. This build is signed with a Developer ID and notarized by Apple.
   It opens like any other app.
`;
    }
    if (status.mode === "developer-id") {
      return `2. This build is signed with a Developer ID but not notarized. On first
   launch macOS may say it cannot verify the app. Right-click the app,
   choose Open, then confirm Open. You only need to do this once.
   If macOS still blocks it, run:

     ${QUARANTINE}
`;
    }
    return README_UNSIGNED.macos;
  }
  if (status.mode === "authenticode") {
    return `This build is Authenticode-signed. While the certificate is new,
SmartScreen may still show "Windows protected your PC"; choose "More info"
and then "Run anyway".
`;
  }
  return README_UNSIGNED.windows;
}

export function applyToReadme(text, status) {
  const anchor = README_UNSIGNED[status.platform];
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.includes(anchor)) throw new Error(`README for ${status.platform} no longer contains the unsigned-build paragraph`);
  return normalized.replace(anchor, readmeText(status));
}

/* ------------------------------------------------------------------ CLI */

function readStatus(file, platform) {
  try {
    return normalizeStatus(platform, JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    // No status file means nothing was signed.
    return normalizeStatus(platform, {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "status") {
    const [platform, mode] = args;
    const status = normalizeStatus(platform, { mode, notarized: args.includes("--notarized"), timestamped: args.includes("--timestamped") });
    process.stdout.write(JSON.stringify(status) + "\n");
  } else if (cmd === "notes") {
    const [notesFile, macFile, winFile, macIntelFile] = args;
    const notes = fs.readFileSync(notesFile, "utf8");
    const intel = macIntelFile ? readStatus(macIntelFile, "macos") : null;
    process.stdout.write(applyToNotes(notes, readStatus(macFile, "macos"), readStatus(winFile, "windows"), intel));
  } else if (cmd === "readme") {
    const [readmeFile, statusFile] = args;
    const platform = /windows/i.test(readmeFile) ? "windows" : "macos";
    process.stdout.write(applyToReadme(fs.readFileSync(readmeFile, "utf8"), readStatus(statusFile, platform)));
  } else {
    console.error("usage: signing-notes.mjs status|notes|readme …");
    process.exit(2);
  }
}
