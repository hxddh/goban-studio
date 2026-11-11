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
**`@native-sdk/cli` 0.11.0**. The SDK is a devDependency at that exact
version, so `npm ci` installs it — and the `native` binary for your
platform — with the hashes in `package-lock.json`; do not install it
globally. It is patched by `scripts/patch-sdk.mjs` (it keeps the system
menus on macOS; the script is idempotent and fails loudly if the SDK
source changed).

```bash
npm ci
SDK="$(node scripts/native-sdk.mjs path)"   # node_modules/@native-sdk/cli, checked against the pin
node scripts/patch-sdk.mjs "$SDK"
```

### Linux: tests and a compile with the null platform

Linux has no desktop host, but the SDK's null platform compiles the whole
shell and runs its unit tests without a window. This is what every pull
request runs (`checks.yml`, job `native`); the `native` binary and the
SDK's own toolchain are not needed, so `npm ci --ignore-scripts` is enough:

```bash
npm ci --ignore-scripts
npm run test:native
# = zig build test -Dnative-sdk-path=node_modules/@native-sdk/cli -Dplatform=null --summary all
zig build -Dnative-sdk-path=node_modules/@native-sdk/cli -Dplatform=null
```

Expect three tests to be skipped on Linux: one needs macOS's `codesign`,
the other two the network. `GOBAN_NET_LIVE=1 npm run test:native` runs the
first (a small download from a published release, through `HTTPS_PROXY`
if you have one, with a resume); `GOBAN_NET_LIVE=package` the second (the
updater's own thread downloads, verifies and unpacks a published Windows
package, about 16 MB).

### macOS and Windows: the real app

```bash
npm run build && npm run sync
node scripts/native-sdk.mjs toolchain        # the SDK's own toolchain (its install script), hash-checked
SDK="$(node scripts/native-sdk.mjs path)"
npx native test --yes -Dnative-sdk-path="$SDK" -Dplatform=macos   # or windows
zig build -Dnative-sdk-path="$SDK" -Doptimize=ReleaseSafe
```

A pull request that touches `src/*.zig`, `src/*.m`, `src/updater/`,
`build.zig`, `app.zon`, the workflows or the SDK pin also runs these on
macOS and Windows (`checks.yml`, job `native-hosts`), so platform-specific
code is compiled before it is merged.

`scripts/package.sh` packages, installs KataGo and signs ad hoc on macOS.
KataGo itself is not in the repository: the workflows build it (macOS) or
download a hash-pinned release (Windows); see `engine/model/README.md` for
the committed network. macOS- and Windows-only code cannot be compiled on
Linux, so be careful there and say in your pull request what you could not
run.

## Tests

| What | Command | Notes |
| --- | --- | --- |
| Static checks | `npm run lint` | ESLint (`eslint.config.js`): undefined names, unused variables and imports, duplicate keys, unreachable code. No warnings are allowed; fix the code rather than disabling a rule |
| Unit and data tests | `npm test` | Node only, about a minute. `node scripts/test.mjs play-,practice-` runs only files whose names contain those |
| Content gate | `npm run release-check` | counts, four languages, pins and versions |
| Interface tests | `npm run build && npm run sync && npm run ui-test` | Chromium via Playwright (`npx playwright install chromium` once). `UI_ONLY=<text>` runs matching checks |
| Visual baselines | `npm run ui-update` | only after an intended visual change; look at every changed picture and commit it |
| Zig tests | `npm run test:native` | Linux null platform, see above |

A new sheet or menu must be added to `scripts/ui-tests/shell-sheets.mjs`,
which opens every one of them (it reads the kinds from the source and
fails until the new one is listed). A new keyboard shortcut goes in the
one table, `src/web/js/app/shortcuts.js`; toasts, loading states and error
cards come from the shared pieces described at the top of
`src/web/js/app/parts.jsx`.

Write a test for every behaviour change, in the area's file
(`scripts/tests/{core,data,model,play,practice,shell}-*.mjs`,
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
  strings go through `m(zh, en, ko, ja)` in the area's file under
  `src/web/js/messages/`; a string no view uses fails the tests.
  `docs/l10n/strings.csv` is generated (`node scripts/export-strings.mjs`),
  never edited by hand.
  A count goes through `tn(key, n)` (its English singular is `key.one`);
  a label and its value through `common.labelValue` (CJK takes a
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
  The README describes the app as it is, with no version history;
  `release-check` also fails when a count it states (units, lessons,
  steps, problems, classics) is not the real one.
- Releases are made by the maintainer from `main` with `release.yml` (see
  `docs/signing.md`); a pull request never changes the version on its own.
- Pin new GitHub Actions by commit SHA with the version as a comment
  (`uses: owner/action@<sha> # v1.2.3`) and give jobs the narrowest
  permissions; `scripts/tests/shell-ci.mjs` checks both.
