/**
 * Export every interface string as a review sheet for native speakers.
 *
 *   node scripts/export-strings.mjs            → docs/l10n/strings.csv
 *
 * Columns: key, English (the reference), then 中文, 한국어, 日本語, and an
 * empty "reviewer note" column per language. Glossary terms are in
 * docs/glossary.md; reviewers fill the note column and send the file back.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGES } from "../src/web/js/messages.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [["key", "en", "zh", "zh note", "ko", "ko note", "ja", "ja note"].map(q).join(",")];
for (const [key, v] of Object.entries(MESSAGES)) rows.push([key, v.en, v.zh, "", v.ko, "", v.ja, ""].map(q).join(","));
const out = path.join(root, "docs", "l10n", "strings.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, "﻿" + rows.join("\n") + "\n");
console.log(`${rows.length - 1} strings → ${path.relative(root, out)}`);
