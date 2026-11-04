# Native-speaker review

Every interface string lives in `src/web/js/messages.js` in four languages.
The English column is the reference. The Chinese, Korean and Japanese text
was written and cross-checked by a model against `docs/glossary.md`;
**no native speaker has reviewed it yet.** This folder is how that review
happens.

## For reviewers

1. Open `strings.csv` in any spreadsheet app (UTF-8, comma-separated).
2. Read your language's column next to English. In the empty *note* column
   write a better wording, or "ok". Things to look for:
   * Go terms that a player in your country would not use
     (check `docs/glossary.md` first — if the glossary itself is wrong, say so);
   * text that sounds translated, too formal or too casual for a calm app;
   * placeholders `{0}`, `{1}` that land in an unnatural place;
   * Korean particles after `{0}` (흑/백 — 이/가, 은/는).
3. Send the file back. You do not need to touch the code.

Ideally one reviewer per language who plays Go (any level) and one who does
not, so both the terms and the plain text get a native read.

## For maintainers

* Regenerate the sheet after changing strings:
  `node scripts/export-strings.mjs`. The test suite fails if the sheet is
  out of date with `messages.js`.
* Apply notes in `messages.js`, then record the review below.

## Review log

| Language | Reviewer | Date | Scope |
| --- | --- | --- | --- |
| 中文 | — | — | not yet reviewed by a native speaker |
| 한국어 | — | — | not yet reviewed by a native speaker |
| 日本語 | — | — | not yet reviewed by a native speaker |
