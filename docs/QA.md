# Verification

What is checked, by what, and when — and what no machine checks. Product
claims live in the README; this file says how far they are verified.

Counts are as of the v13 pipeline work and grow with every change; each
command prints its own exact numbers.

## Where each gate runs

| Gate | Command | Pull request (`checks.yml`) | Release (`release.yml`) |
| --- | --- | --- | --- |
| Unit and data tests | `npm test` | Node 24 and 26 | macOS arm64, macOS x64, Windows |
| Content gate | `npm run release-check` | yes | every platform build, twice (before and after the frontend build) |
| Interface tests | `npm run ui-test` | Chromium on Linux | — (the packaged app has its own checks below) |
| Zig unit tests | `npm run test:native` / `native test` | Linux, SDK null platform | macOS (both CPUs) and Windows, real platform |
| Zig build | `zig build -Dplatform=null` | Linux | `native build -Doptimize=ReleaseSafe` per platform |
| Packaged-app self-test | `scripts/selftest-app.mjs` | — | each platform, in the real WebView with KataGo |
| Updater end to end | `scripts/test-updater.mjs` | — | each platform, on the real OS |
| Native screenshot tour | `scripts/tour-app.mjs` | — | each platform |

## Unit and data tests (`npm test`, 316 checks)

Plain `node:test`-style checks in `scripts/tests/`, one file per area, each
file in its own Node process. No browser, no native SDK.

| Area | Files | Checks | What they cover |
| --- | --- | --- | --- |
| core | `core-*.mjs` | 113 | rules and scoring under Japanese, Chinese and Korean rules (captures, ko, suicide, seki, territory, dead stones); SGF import and export; the solver and every problem it proves; every lesson step; the opening book and its build; the engine scheduler and KataGo request/response parsing; strength calibration data; the accessibility helpers |
| data | `data-*.mjs` | 17 | the file store (write chains, chunked writes, retries, key allow-list), saved games, settings, backups |
| model | `model-*.mjs` | 29 | the player model: rating, spaced review, focus, the practice calendar |
| play | `play-*.mjs` | 83 | the game controller, clock, opponent ladder and pacing, teaching warnings, explanations, the post-game review and summary, suggestions, the explorer |
| learn | `learn-*.mjs` | 24 | the beginner path, Learn's path, placement, problem sessions |
| shell | `shell-*.mjs` | 50 | the four spaces, every UI string in four languages, the release and update logic (signing notes, the updater's page side, optional networks), the user's files, and the CI and release workflows themselves (`shell-ci.mjs`) |

`shell-ci.mjs` reads the workflow files as data and checks what this page
and `SECURITY.md` promise: actions pinned by commit, read-only tokens except
for the jobs that publish or commit, signing secrets only in signing steps,
the Zig job on pull requests, ReleaseSafe builds, the release tag bound to
the built commit and to `package.json`'s version, hash-pinned downloads.

## Content gate (`npm run release-check`)

Fails the build unless: the course has at least 13 units, 60 lessons and
240 steps (5+ intermediate units); at least 500 problems, each with a
theme and a measured grade 1–5; 20 classics; every title, hint and note in
zh/en/ko/ja; the licences, engine config and SDK patch are present; the
committed KataGo network `engine/model/model.txt.gz` has its pinned SHA-256
(source: `engine/model/README.md`); `package.json`, `app.zon`,
`build.zig.zon`, the web `APP_VERSION` and `index.html` agree on the
version; release notes exist for it; and `.nvmrc` is the lowest Node that
`engines` allows. Currently: 18 units · 82 lessons · 294 steps · 543
problems in 30 themes · 20 classics.

## Interface tests (`npm run ui-test`, 74 checks)

Real Chromium against the built page (`frontend/dist`); `scripts/ui-test.mjs`
is the harness, `scripts/ui-tests/*.mjs` hold each area's checks.

- **Flows**: first run to lesson one, a two-player game played by keyboard
  to the count, a review variation, a wrong answer and its reset, history
  back/forward, the explorer, placement, problems, the beginner path, the
  post-game review, reload persistence, one toast for failed writes.
- **Four languages**: every place in zh-CN, en-US, ko-KR and ja-JP, light
  and dark, normal and larger text — no raw keys, no clipping, one primary
  action per screen.
- **Accessibility**: an audit of every place (`scripts/a11y-audit.js`), a
  visible focus ring at every Tab stop, the board's spoken moves, points and
  turn, problem and lesson announcements, radio groups and menus.
- **Budgets**: first render 1500 ms, board click to painted stone 60 ms, a
  300-move classic in review 600 ms, place switch 250 ms, plus the area
  budgets in `play-feel.mjs` (cold start, start-up script size, content
  parts, the computer's first move, the explorer, opening a reviewed game).
  The harness judges its own budgets on the **median of three runs**
  (`medianOf`, also offered to the area checks).
- **Visual regression**: Today, Play, Practice, the Library, Settings and
  the post-game review at 1200, 1440 and 1920 px against
  `tests/visual/*.png` (1.2 % pixel tolerance, time-dependent parts masked,
  one pinned font so the runner's fonts do not matter). Diffs are uploaded
  on failure. With `CI` set, a **missing baseline fails** the run instead of
  being written; locally it is written for you to review and commit
  (`npm run ui-update` rewrites all of them).

The job installs Chromium with `npx playwright install --with-deps` on the
runner image rather than in the Playwright container: the baselines were
taken there, and the container's different system fonts (which the CJK
fallback uses) have not been shown to give identical pictures.

## Zig tests

`zig build test` runs 35 tests (34 pass and 1 is skipped on Linux): the
updater's download address and redirect allow-list, `SHA256SUMS` parsing
and comparison, zip entry checks and extraction, CPU checks, the model
downloader's pins, path handling and the engine's command vocabulary. On a
pull request they run on Linux against the SDK's null platform (no window
system); the platform builds run them again on macOS and Windows with the
real hosts, where the macOS-only test (`ditto`, `codesign`, no quarantine
flag on a real signed bundle) also runs.

## Release gates

`release.yml` (see also `docs/signing.md`):

1. **Preflight**: runs only from `main` (or with `rehearse=true`); the tag
   must be `v` + `package.json`'s version; its notes file must exist; it must
   not already be published; if the apps will enforce signed updates
   (`vars.UPDATE_PUBKEY`), the signing key must exist.
2. **Three builds in parallel**, each on the CPU it ships for (Apple
   Silicon, Intel Mac, Windows x64): unit tests, content gate, KataGo
   (built from a pinned commit on macOS; the official Windows release,
   checked against its SHA-256) and a KataGo smoke test, `native validate`,
   `native test`, a ReleaseSafe build, packaging, signing when the secrets
   exist, the packaged self-test in the real WebView (KataGo analysis on
   9×9 and 19×19, a handicap move, the optional network downloads), the
   updater tests (swap, rollback, app that does not quit, read-only
   fallback), the screenshot tour, and the archive checks.
3. **Publish**: the five packages must exist; `SHA256SUMS` is written and,
   with the key, signed (`SHA256SUMS.sig`); the release notes' "First
   launch" table is generated from what each build really did; the tag is
   created at the built commit (`--target $GITHUB_SHA`), and an existing
   tag elsewhere stops the release. `rehearse=true` runs everything but this
   last step.

Supply chain: every action is pinned by commit SHA (Dependabot proposes
updates weekly, for npm too); tokens are read-only except for publishing
and the bot workflows' commit jobs; `npm ci --ignore-scripts` everywhere
(the Native SDK CLI is the one install that runs its script, to fetch its
binary); Node versions come from `.nvmrc` (24) plus a 24/26 matrix on pull
requests, with `engines` enforced in CI.

## What people have not verified

No machine can check these, and none has been done yet:

- **Usability with real players.** The protocol in `docs/usability.md`
  (5 beginners + 5 kyu players, SUS ≥ 75, SEQ ≥ 5.5) has not been run.
- **Screen readers on the real platforms.** The accessibility checks run
  in Chromium; VoiceOver on macOS and NVDA on Windows have not been tried
  with the packaged app.
- **Native-speaker review** of the Chinese, Korean and Japanese text
  (`docs/l10n/strings.csv`), and terminology against `docs/glossary.md`.
- **Strong-player review** of the course and the problem grades. Every
  problem and lesson is machine-proved, but a problem's grade comes from the
  solver's search effort, not from how hard people find it, so placement
  overestimates (see `docs/review-v12-zh.md`).
- **Signed builds.** Until the signing secrets exist, macOS builds are
  ad-hoc signed and Windows builds are unsigned; the release notes say so.
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
