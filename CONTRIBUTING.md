# Contributing

Thanks for helping. This page covers setting up, running the tests, the
rules for content, and how changes and versions are organised. Security
problems go through `SECURITY.md`, not public issues.

## Set up: the web app (any OS)

Node.js 24 or newer (`.nvmrc` says 24; CI also runs 26).

```bash
nvm use            # or install Node 24+ another way
npm ci
npm run build      # bundle src/web into src/web/js/bundle.js + content parts
npm run sync       # copy the page into frontend/dist
python3 -m http.server 4173 --directory frontend/dist
```

Open <http://127.0.0.1:4173>. The page is exactly what the desktop shell
serves; without the native host it uses the browser fallbacks (local
storage, the Moka 9×9 engine, no KataGo).

CI runs `npm ci` with `engine-strict`, so a Node older than `engines`
allows fails there even if it works on your machine.

## Set up: the native shell (Zig + Native SDK)

The shell needs **Zig 0.16.0** exactly (the SDK pins it) and
**`@native-sdk/cli` 0.11.0**, patched by `scripts/patch-sdk.mjs` (it keeps
the system menus on macOS; the script is idempotent and fails loudly if the
SDK source changed).

```bash
npm install -g @native-sdk/cli@0.11.0
node scripts/patch-sdk.mjs                 # patches $(npm root -g)/@native-sdk/cli
```

### Linux: tests and a compile with the null platform

Linux has no desktop host, but the SDK's null platform compiles the whole
shell and runs its unit tests without a window. This is what every pull
request runs (`checks.yml`, job `native`); the `native` binary is not
needed, so the install script can be skipped:

```bash
npm install -g --ignore-scripts @native-sdk/cli@0.11.0
node scripts/patch-sdk.mjs
npm run test:native
# = zig build test -Dnative-sdk-path="$(npm root -g)/@native-sdk/cli" -Dplatform=null --summary all
zig build -Dnative-sdk-path="$(npm root -g)/@native-sdk/cli" -Dplatform=null
```

Expect one test to be skipped on Linux (it needs macOS's `codesign`).

### macOS and Windows: the real app

```bash
npm run build && npm run sync
native test --yes -Dnative-sdk-path="$(npm root -g)/@native-sdk/cli" -Dplatform=macos   # or windows
zig build -Dnative-sdk-path="$(npm root -g)/@native-sdk/cli" -Doptimize=ReleaseSafe
```

`scripts/package.sh` packages, installs KataGo and signs ad hoc on macOS.
KataGo itself is not in the repository: the workflows build it (macOS) or
download a hash-pinned release (Windows); see `engine/model/README.md` for
the committed network. macOS- and Windows-only code cannot be compiled on
Linux, so be careful there and say in your pull request what you could not
run.

## Tests

| What | Command | Notes |
| --- | --- | --- |
| Unit and data tests | `npm test` | Node only, about a minute. `node scripts/test.mjs play-,learn-` runs only files whose names contain those |
| Content gate | `npm run release-check` | counts, four languages, pins and versions |
| Interface tests | `npm run build && npm run sync && npm run ui-test` | Chromium via Playwright (`npx playwright install chromium` once). `UI_ONLY=<text>` runs matching checks |
| Visual baselines | `npm run ui-update` | only after an intended visual change; look at every changed picture and commit it |
| Zig tests | `npm run test:native` | Linux null platform, see above |

Write a test for every behaviour change, in the area's file
(`scripts/tests/{core,data,model,play,learn,shell}-*.mjs`,
`scripts/ui-tests/*.mjs`). Prefer tests that exercise behaviour over ones
that search source text. `docs/QA.md` lists what each gate covers.

## Content rules

- **Problems are proved.** Every problem must pass the solver
  (`src/web/js/solver.js`): one to three correct first moves, a won final
  position, real board rules. `npm test` checks every one; a problem the
  solver cannot prove does not go in.
- **Four languages, always.** Every user-visible string exists in Chinese,
  English, Korean and Japanese, written naturally and with the terms in
  `docs/glossary.md` (correct Korean particles included). New interface
  strings go through `m(zh, en, ko, ja)`; `docs/l10n/strings.csv` is
  generated (`node scripts/export-strings.mjs`), never edited by hand.
  A count goes through `tn(key, n)` (its English singular is `key.one`);
  a label and its value through `v13ui.labelValue` (CJK takes a
  full-width colon), never `` `${label}: ${value}` ``; a Korean particle
  after a placeholder is written `{0:은/는}` and follows the word put in.
- **No unreviewed generated content.** Problems, lessons, commentary or
  translations produced by an engine or a language model are not added
  until a strong player (for Go content) or a native speaker (for text)
  has reviewed them. Say in the pull request who reviewed what.
- **No telemetry, no new network access.** The app is offline; the only
  downloads are the pinned ones in `src/install.zig` and `src/models.zig`.

## Changes and versions

- **One feature or fix per pull request**, with its tests and docs. Keep
  history bisectable: do not squash a whole version into one commit, and do
  not mix refactors with behaviour changes.
- **Semantic versioning.** A **major** version only for a data-format or
  compatibility break (saved games, settings, backups, the bridge between
  page and shell); a **minor** version for features; a **patch** for fixes.
  Moving the interface around is not a reason for a major version.
- The version lives in `package.json`, `app.zon`, `build.zig.zon`,
  `src/web/js/version.js` and `src/web/index.html`; `release-check` fails
  if they disagree. Release notes go in `.github/release-notes/v<version>.md`.
- Releases are made by the maintainer from `main` with `release.yml` (see
  `docs/signing.md`); a pull request never changes the version on its own.
- Pin new GitHub Actions by commit SHA with the version as a comment
  (`uses: owner/action@<sha> # v1.2.3`) and give jobs the narrowest
  permissions; `scripts/tests/shell-ci.mjs` checks both.
