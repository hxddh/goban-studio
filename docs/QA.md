# Verification

What is checked, by what, and when — and what no machine checks. Product
claims live in the README; this file says how far they are verified.

## Counts

The numbers on this page are in this one table; each command prints its
own exact numbers. `npm run release-check` fails if the content row
disagrees with the content.

<!-- counts -->
| Gate | Command | Count |
| --- | --- | --- |
| Static checks | `npm run lint` | 0 warnings allowed |
| Unit and data tests | `npm test` | 585 checks in 69 files |
| Interface tests | `npm run ui-test` | 141 checks, 18 visual baselines |
| Zig tests | `npm run test:native` | 72 pass on Linux, 3 more are skipped there |
| Content | `npm run release-check` | 23 units · 104 lessons · 377 steps · 543 problems in 30 themes · 20 classics |
<!-- /counts -->

## Where each gate runs

| Gate | Command | Pull request (`checks.yml`) | Release (`release.yml`) |
| --- | --- | --- | --- |
| Static checks | `npm run lint` | Node 24 and 26 | — |
| Unit and data tests | `npm test` | Node 24 and 26 | macOS arm64, macOS x64, Windows |
| Content gate | `npm run release-check` | Node 24 and 26 | every platform build, twice (before and after the frontend build) |
| Interface tests | `npm run ui-test` | Chromium on Linux | — (the packaged app has its own checks below) |
| Zig unit tests | `npm run test:native` / `native test` | Linux, SDK null platform; macOS and Windows when the shell changes | macOS (both CPUs) and Windows, real platform |
| Zig build | `zig build` / `native build` | Linux null platform; macOS and Windows ReleaseSafe when the shell changes | `native build -Doptimize=ReleaseSafe` per platform |
| Packaged-app self-test | `scripts/selftest-app.mjs` | — | each platform, in the real WebView with KataGo |
| Updater end to end | `scripts/test-updater.mjs` | — | each platform, on the real OS |
| Native screenshot tour | `scripts/tour-app.mjs` | — | each platform |

"When the shell changes" is the `native-hosts` job: a pull request that
touches `src/*.zig`, `src/*.m`, `src/updater/`, `build.zig`, `app.zon`,
the workflows, the SDK scripts or `package.json` / `package-lock.json`
compiles the shell and runs its unit tests on a macOS and a Windows
runner. It builds no KataGo, packages nothing and signs nothing.

## Static checks (`npm run lint`)

ESLint with `eslint.config.js`: undefined names, unused variables and
imports, duplicate keys, unreachable code, the hooks rules. No warning is
allowed, and it runs before the tests on every pull request. There is no
type checking.

## Unit and data tests (`npm test`)

Plain checks in `scripts/tests/`, one file per area, each file in its own
Node process. No browser, no native SDK.

| Area | Files | What they cover |
| --- | --- | --- |
| core | `core-*.mjs`, `course-*.mjs` | rules and scoring under Japanese, Chinese and Korean rules (captures, ko, superko, suicide, seki, territory, dead stones, a side with no living stones); SGF import and export (set-up stones, collections, old property names, charsets and the charset guess, komi and dates, very long records); the solver and every problem it proves; every lesson step; the opening book and its build; the engine scheduler, cancelling a search, KataGo request and reply parsing; the offline engine; strength calibration data; the accessibility helpers |
| data | `data-*.mjs` | the file store (write chains, chunked writes, retries, the key allow-list), the safe state for unreadable files, migrations, saved games and their index, deleting with undo, settings, backups and undoing a restore |
| model | `model-*.mjs` | the player model: rating, games with help left unrated, counting a game again, the solving level from first sight, spaced review and its daily cap, the path over simulated weeks, focus, progress and milestones |
| play | `play-*.mjs` | the game controller, undo and redo, the clock, the opponent ladder and pacing, teaching warnings, explanations, the post-game review and its edit history, the summary, suggestions, unfinished games, import, the explorer |
| practice | `practice-*.mjs` | the beginner path, today's path and session, placement, problem sessions, review transforms, tile status |
| shell | `shell-*.mjs` | the four spaces, first run, settings, toasts and error cards, the status line, board palettes; every string in four languages with the same placeholders, every key the interface uses present and **every key in the table used**; the release and update logic (signing notes, signed sums, the updater's page side, optional networks); the user's files and package READMEs; and the CI and release workflows themselves (`shell-ci.mjs`) |

`shell-ci.mjs` reads the workflow files as data and checks what this page
and `SECURITY.md` promise: actions pinned by commit, read-only tokens
except for the jobs that publish or commit, signing secrets only in
signing steps, the update key only in the `release-signing` environment
and never in a rehearsal, lint and the Zig job on pull requests, the
macOS and Windows compile for shell changes, the Native SDK from the
lockfile, ReleaseSafe builds, the release tag bound to the built commit
and to `package.json`'s version, hash-pinned downloads.

## Content gate (`npm run release-check`)

Fails the build unless:

- the course has at least 20 units, 90 lessons and 310 steps, with 7 or
  more intermediate units and 8 or more advanced units holding 27 or more
  lessons;
- there are at least 500 problems, each with a theme and a grade 1–5;
- there are 20 classics;
- every title, hint and note exists in zh, en, ko and ja;
- the licences, the engine configuration and the SDK patch are present,
  and the committed KataGo network `engine/model/model.txt.gz` has its
  pinned SHA-256 (source: `engine/model/README.md`);
- `package.json`, `app.zon`, `build.zig.zon`, the web `APP_VERSION` and
  `index.html` agree on the version, and release notes exist for it;
- `.nvmrc` is the lowest Node that `engines` allows;
- the README states the real number of units, lessons, steps, problems
  and classics, and no such number in the README, in this version's
  release notes or in the counts table above is a different one; the
  README names no other version and has no heading about a version.

## Interface tests (`npm run ui-test`)

Real Chromium against the built page (`frontend/dist`); `scripts/ui-test.mjs`
is the harness, `scripts/ui-tests/*.mjs` hold each area's checks.

- **Flows**: first run landing on Today and on to lesson one or a game, a
  two-player game played by keyboard to the count, undo and redo, passing,
  counting again, a trial line kept and discarded, review edits undone, a
  wrong answer and its reset, history back and forward, the explorer,
  placement, problems, the beginner path, the Library (unfinished games,
  sort and filter, paste and multi-file import, collections, delete with
  Undo), reload persistence, one toast for failed writes.
- **Every sheet and every menu** (`shell-sheets.mjs`): each kind of sheet
  and each menu item is opened and used. The check reads the kinds from
  the source and fails until a new one is listed, so no sheet can exist
  that no test has opened. Toast tones, the error card for a screen that
  throws, and loading and Retry states are checked here too.
- **Settings**: every pane, none scrolling at 1200×800 in four languages
  with larger text.
- **Four languages**: every place in zh-CN, en-US, ko-KR and ja-JP, light
  and dark, normal and larger text — no raw keys, no clipping, one primary
  action per screen.
- **Accessibility**: an audit of every place (`scripts/a11y-audit.js`), a
  visible focus ring at every Tab stop, the board's spoken moves, points
  and turn, problem and lesson announcements, radio groups and menus.
- **The board**: palettes in light, dark and high contrast, thumbnails,
  narrow windows (720 and 800 px wide) with the controls in view.
- **Budgets**: first render 1500 ms, board click to painted stone 60 ms, a
  300-move classic in review 600 ms, place switch 250 ms, plus the area
  budgets in `play-feel.mjs`. The harness judges its own budgets on the
  median of three runs.
- **Visual regression**: Today, Play, Practice, the Library, Settings and
  the post-game review at 1200, 1440 and 1920 px against
  `tests/visual/*.png` (1.2 % pixel tolerance, time-dependent parts masked,
  one pinned font so the runner's fonts do not matter). Diffs are uploaded
  on failure. With `CI` set, a missing baseline fails the run instead of
  being written; locally it is written for you to review and commit
  (`npm run ui-update` rewrites all of them).

The job installs Chromium with `npx playwright install --with-deps` on the
runner image rather than in the Playwright container: the baselines were
taken there, and the container's different system fonts (which the CJK
fallback uses) have not been shown to give identical pictures.

## Zig tests

`zig build test` covers the updater's download address and redirect
allow-list, `SHA256SUMS` parsing, the signature and the version it names,
zip entry checks and extraction, CPU checks, the model downloader's pins,
proxy choice and parsing (environment, `scutil`, registry), resuming a
download, the single-instance lock and inbox, save-path handling, the
JSON writer and the engine's command vocabulary. On Linux they run against
the SDK's null platform (no window system); three are skipped there (one
needs macOS's `codesign`, two the network — `CONTRIBUTING.md` says how to
run those). The `native-hosts` job and the platform builds run them on
macOS and Windows with the real hosts.

## Release gates

`release.yml` (see also `docs/signing.md`):

1. **Preflight**: runs only from `main` (or with `rehearse=true`); the tag
   must be `v` + `package.json`'s version; its notes file must exist; it
   must not already be published.
2. **Three builds in parallel**, each on the CPU it ships for (Apple
   Silicon, Intel Mac, Windows x64): unit tests, content gate, KataGo
   (built from a pinned commit on macOS; the official Windows release,
   checked against its SHA-256) and a KataGo smoke test, `native validate`,
   `native test`, a ReleaseSafe build, packaging, signing when the secrets
   exist, the packaged self-test in the real WebView (KataGo analysis on
   9×9 and 19×19, a handicap move, the optional network downloads), the
   updater tests (swap, rollback, an app that does not quit, the read-only
   fallback), the screenshot tour, and the archive checks.
3. **Assemble** (read-only token, no secret): the five packages must
   exist; `SHA256SUMS` is written with a sixth line that names the
   version; the release notes' "First launch" table is generated from what
   each build really did. `rehearse=true` stops here.
4. **Sign**, in the protected environment `release-signing`: with the
   key, `SHA256SUMS.sig` is written. If the apps were built to require a
   signature and the key is missing, the job fails and nothing is
   published.
5. **Publish**: every package is checked against `SHA256SUMS` once more;
   the tag is created at the built commit (`--target $GITHUB_SHA`), and an
   existing tag elsewhere stops the release; the files go into a draft,
   which is then published. No other job or workflow can write to a
   release.

Supply chain: every action is pinned by commit SHA (Dependabot proposes
updates weekly, for npm too); tokens are read-only except for publishing
and the bot workflows' commit jobs; `npm ci --ignore-scripts` everywhere,
the Native SDK included (an exact devDependency with its hash in the
lockfile; the platform builds run its toolchain install explicitly, and
that is hash-checked); Node versions come from `.nvmrc` (24) plus a 24/26
matrix on pull requests, with `engines` enforced in CI.

## What people have not verified

No machine can check these, and none has been done yet:

- **Usability with real players.** The protocol in `docs/usability.md`
  (5 beginners + 5 kyu players, SUS ≥ 75, SEQ ≥ 5.5) has not been run.
- **Screen readers on the real platforms.** The accessibility checks run
  in Chromium; VoiceOver on macOS and NVDA on Windows have not been tried
  with the packaged app.
- **Native-speaker review** of the Chinese, Korean and Japanese text
  (`docs/l10n/strings.csv`), and terminology against `docs/glossary.md`.
- **Strong-player review** of the course, the classics' notes and the
  problem grades. Every problem and lesson problem is machine-proved, but
  a grade is an estimate of what a person must read
  (`docs/problems-audit.md`), not a measurement on people. The corrected
  Chinese opening lesson is among the steps waiting
  (`docs/lesson-audit.md`).
- **The KataGo audit of the lessons** (`lesson-check`) has not been run
  since the newest units were written and steps were split.
- **Signed builds.** Until the signing secrets exist, macOS builds are
  ad-hoc signed and Windows builds are unsigned; the release notes say so.
  No update signing key is configured either.
- **Platform code by hand.** The single-instance hand-over, the system
  proxy lookup, Show data folder and holding quit until the page has saved
  compile and pass their unit tests on macOS and Windows in CI; nobody has
  tried them on a real Mac or PC.
- **The GTK/Linux desktop host** is not built or shipped; the Linux null
  platform proves that the shell compiles and its tests pass, not that a
  window works.
- **Real touch hardware, Safari outside WKWebView, Windows on ARM.**

## Dependency notes

- Zig stays at 0.16.0: Native SDK 0.11.0 pins that toolchain.
- Node.js 24 is the floor (the Native SDK's own); CI also runs 26.
- KataGo 1.18.1 is the latest release with official Eigen CPU builds.
- The b6c96 network stays deliberately: larger current networks would make
  the CPU sidecar slow. It is pinned by hash (`engine/model/README.md`).
