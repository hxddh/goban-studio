# Goban Studio

A calm, offline Go app for macOS and Windows. Learn from the first stone,
play a computer opponent that is as strong as you want it to be, and review
every game with KataGo.

**Languages:** 中文 · English · 한국어 · 日本語  
**Boards:** 9×9, 13×13, 19×19 · Japanese, Chinese or Korean rules · komi and handicap up to nine stones

Goban Studio is the Go application built alongside — not instead of — the
existing Gomoku app. It deliberately uses a different bundle ID
(`dev.hxddh.gobanstudio`), app name (`Goban Studio`) and repository
(`goban-studio`), so the two apps can be installed and updated independently.

## Download

| Platform | File | First launch |
| --- | --- | --- |
| macOS (Apple Silicon) | `GobanStudio-macOS-arm64.dmg` / `.zip` | See the release notes. A build made with the project's Developer ID is signed and notarized and opens normally. A build made without it is ad-hoc signed and not notarized: right-click the app → Open once; if blocked, `xattr -dr com.apple.quarantine /Applications/Goban\ Studio.app` |
| macOS (Intel) | `GobanStudio-macOS-x64.dmg` / `.zip` | As for Apple Silicon. A native x86_64 build (app and KataGo), built and tested on an Intel Mac runner. |
| Windows (x64) | `GobanStudio-Windows-x64.zip` | See the release notes. A build made without the code-signing certificate is not Authenticode-signed: if SmartScreen appears, More info → Run anyway. WebView2 is normally preinstalled. |

**Windows on ARM:** use the x64 package. Windows 11 on ARM runs it, KataGo
included, under its built-in x64 emulation; there is no native ARM64 build
because KataGo publishes no ARM64 Windows binary, and analysis is slower
than on a comparable x64 PC. The in-app updater keeps such an installation
on the x64 package.

Each release's notes (and the README inside the download) state how *that*
build was signed: the release workflow writes the "First launch" text from
what the signing steps actually did, not from a template. Until the
certificates in [`docs/signing.md`](docs/signing.md) are in place, releases
are ad-hoc signed (macOS) and unsigned (Windows).

`SHA256SUMS` is attached to every GitHub release. The v7.0.0 notes are in
[`.github/release-notes/v7.0.0.md`](.github/release-notes/v7.0.0.md).

## v7 at a glance

- **A training plan** — *This week's focus* on Today: one or two themes
  chosen from your analysed games and problem results, with the reason, and
  a Daily five built around them ([`docs/plan.md`](docs/plan.md)).
- **Reports that make themselves** — prepared in the background after
  every game, with the change in your strength estimate; *Analyse all* in
  the Library for older games; two-player reports drill one side at a time.
- **Problem collections** — import SGF problems; each answer is proved by
  the solver before it is added, and an answer proved wrong is shown with
  its refutation.
- **The engine answers your move first** — analysis is scheduled (your
  opponent's move, then what you look at, then background work) and work
  that is no longer needed is cancelled.
- **Strength** — the human-style ladder measured again on GitHub's build
  machines (1,532 new games): no gap any more between ≈12 kyu and ≈3 kyu.
- **SGF coordinates** — records from other programs are read correctly
  (FF[4] uses the letter *i*; earlier versions skipped it); records saved by
  earlier versions of the app keep reading as they were.
- **Checked together** — every page in all four languages, light and dark,
  with and without larger text.

## v6 at a glance

- **Interface** — the review panel in three tabs (analysis, summary,
  notes), records that open on their key moment, Settings as a two-pane
  window, quiet empty states, problem windows at a natural stone size.
- **A report for every game** — result, the three phases, three key
  moments as small boards, *Practise this game* (your worst mistakes become
  drills), and an image export.
- **Strength** — your level as an estimate with an uncertainty
  ("≈ 12 kyu (±1)") and its curve over time; the human-style levels
  measured again in 426 games.
- **Learning** — an advanced course for about 5 kyu to 1 dan (5 units, 15
  lessons: whole-board judgement, invasion and reduction, advanced life and
  death, combined tesuji, middle-game strategy); the leaning attack and
  sabaki lessons; 34 endgame problems proved by exact counting. 18 units, 82
  lessons and 543 problems in all.
- **Opening explorer** — a KataGo book of whole-board openings and corner
  joseki (1,400 positions, offline), with live analysis past the book on
  the desktop; review says where a game left the book.
- **Accessibility** — the board can be played with a screen reader and the
  keyboard (spoken moves, point and group reading, region summaries), and a
  larger-text option.

## v5 at a glance

- **Rules** — Japanese (still the default for everyone), Chinese (area
  scoring) or Korean, chosen per game or as your default; SGF records in
  any of the three open and keep their ruleset.
- **Opponents** — an optional human-style opponent (KataGo's human model,
  downloaded only when you choose it) that plays like a person of its level,
  and an optional stronger network for analysis and the top level.
- **Review** — the game in three phases (points lost, mistakes, accuracy),
  three takeaways, trends across your recent games, comments and marks on
  any move, a variation tree, promote and delete variations; all saved in
  the SGF.
- **Learning** — an intermediate course (opening, joseki, shape, endgame,
  fighting; 26 lessons) and 509 solver-proved problems.
- **Your data** — one-click backup to a file and restore on another computer.
- **Updates** — download, verify and install a new version from inside the
  app (with automatic rollback); Intel Macs get their own build.
- **Interface** — this week on Today, the course as a map, problem facts,
  proportioned problem windows, thumbnails that follow the board.

## v4 at a glance

- **A calm board** — no texture by default (Plain; Light wood at a quarter of
  the old grain; Ink for dark rooms), lines snapped to whole pixels, star
  points and stones to a written spec, coordinates on.
- **The standard board** — 19×19 is the default everywhere (first launch,
  onboarding, the suggested game with a handicap, New game, which remembers
  your choice); 13×13 and 9×9 are the quicker games.
- **One design system** — [`docs/design.md`](docs/design.md): system fonts,
  an 8 px grid, neutral colours with one accent, one primary action per
  screen, a sidebar and a toolbar with back/forward; a tall hidden title bar
  on macOS.
- **Review that explains** — what each key mistake cost and where (group
  died, race or ko lost, territory, tempo), and the better line or the
  refutation as clickable, described steps.
- **Content proved on a real board** — seki, capturing races and classic
  shapes; every problem re-proved with captured points playable again
  ([`docs/problems-audit.md`](docs/problems-audit.md)).
- **Release** — conditional Developer ID signing and notarization (macOS) and
  Authenticode (Windows), a user-initiated update check, and native
  screenshots of the packaged apps in CI.

## Places, one board

- **Today** — one starting screen: continue (or the suggested game), today's
  five, the next lesson, what to work on, your level over time.
- **Play** — a game against KataGo at a rank-like strength (≈30 kyu to ≈2
  dan), or two players on one board. Handicap is suggested from your level.
  The panel shows only the players, whose turn it is, **Pass** (with a
  confirmation) and **Undo**; hint, review-so-far, save, export, focus mode
  and resign sit behind one menu. When both players pass, KataGo marks the
  dead stones and the score counts up; you accept it or keep playing.
  Finished games go to the Library automatically; abandoned ones never do.
- **Review** is a mode of any game, not a place: your current game, a saved
  game, an imported SGF, a classic. KataGo analyses every position (win rate
  and score lead), draws the balance of the game, and lists the three moves
  that lost the most, each with the move played and KataGo's better line to
  play through on the board. Territory estimate, “guess the next move” and
  “play from here” are one click away.
- **Practice** — a course that starts from zero and goes on to intermediate
  play (opening principles, basic joseki, shape, endgame, middle-game
  fighting) and, since v6, an advanced course for players around 5 kyu to
  1 dan (whole-board judgement, invasion and reduction, life and death with
  ko and seki, tesuji in combination, middle-game strategy; 5 units, 15
  lessons), 18 units and 82 lessons in all, in multi-step lessons with
  explanation, placement exercises and live problems; problem
  collections by topic, and a daily five with spaced review. Every problem is
  answered live by a built-in solver: a wrong move is met with the real
  refutation on the board, a right move with the most stubborn defence.
- **Library** — the game in progress (“Continue”), your games with
  thumbnails, filters (won / lost / imported) and search, 20 classic games
  and 40 professional openings to replay as guess-the-move drills. SGF import
  and export; double-clicking an `.sgf` opens it on macOS and Windows; records
  under Japanese, Chinese or Korean rules keep their ruleset, and one that
  declares another ruleset (AGA, Ing, New Zealand…) is rejected with an
  explanation rather than silently re-scored.
- **Settings** (⌘, / Ctrl+,) — language, light/dark/system appearance,
  Plain / Light wood / Ink board, coordinates, move numbers, sound, your
  level, and update checks.
- **Keyboard** — ⌘N new game, ⌘Z undo, ⇧⌘P pass, ⇧⌘H hint, ⌘. focus mode,
  ⌘1/2/3/4 places, ←/→ through a review, and the board itself is playable with
  Tab, the arrow keys and Space (⌘/ lists them all; Ctrl on Windows).
- **Offline by design** — no account, no telemetry, and no network request
  unless you ask for one: **Check for updates…** makes a single request to
  GitHub for the latest release, and the weekly automatic check is off
  until you turn it on in Settings. When a newer version is found you may
  choose **Download and install**, which fetches that release's package for
  your computer and its `SHA256SUMS` from GitHub — nothing else, and only
  when you choose it. Nothing about you or your games is sent; everything
  else (KataGo, lessons, your library) stays on your computer.
- **Optional downloads** (v5) — two KataGo networks you may add in
  Settings, fetched only when you choose them: KataGo's human model, which
  makes the opponent play like a person of its level, and a larger network
  for analysis and review. They come from KataGo's official GitHub
  releases (pinned addresses and SHA-256 hashes), are verified before use,
  live in the app's data folder and can be removed again.

## In-app updates (v5)

After **Check for updates…** finds a newer release, **Download and install**
does the rest:

1. The app downloads this computer's package (`GobanStudio-macOS-arm64.zip`,
   `GobanStudio-macOS-x64.zip` or `GobanStudio-Windows-x64.zip`) and the
   release's `SHA256SUMS`, only from
   `https://github.com/hxddh/goban-studio/releases/download/<tag>/`. The
   address is built by the native code from the release tag; redirects are
   followed only to GitHub's own download hosts, over HTTPS.
2. The package must match its line in `SHA256SUMS`. It is unpacked into a
   per-user temp folder and checked: the expected layout and bundle id, an
   executable for this CPU, and on macOS `codesign --verify --deep --strict`.
   The checksum catches a damaged, truncated or wrong download; it is not a
   signature (the builds are ad-hoc signed / unsigned, and `SHA256SUMS`
   comes from the same release), so the trust is in GitHub and HTTPS, as
   for a manual download.
3. **Restart to update** quits the app and hands over to a small helper the
   app carries inside itself (`src/updater/`; nothing downloaded is run
   except the verified new app). It waits for the app to exit, puts the new
   version in place of the old one under the same name — keeping the old one
   as a backup — and starts it. If the new version does not report that it
   started within 90 seconds, the helper puts the old version back and
   starts it, and the app says so.

Your games, progress and settings are kept: on macOS they live outside the
app; on Windows the helper moves the WebView2 profile
(`bin\goban-studio.exe.WebView2`) into the new folder. Files the app
downloads itself carry no quarantine flag, so macOS does not ask again.

When the app cannot replace itself — it is in a folder you cannot write to
(for example `/Applications` without administrator rights, or
`C:\Program Files`), macOS is running it from a temporary "translocated"
copy, or it is a development build — the app says why and offers **Open
download page** instead.

## Honest content

The course and the problems are verified, not counted:

- `scripts/check-problems.mjs` proves every problem with the solver in
  `src/web/js/solver.js`: it must have between one and three correct first
  moves, the solution line must end in a won position, no two problems may be
  the same shape under rotation or reflection, and the difficulty grade in
  `problem-grades.json` must match a fresh measurement (solution length,
  proof size and number of tempting wrong moves).
- `scripts/check-course.mjs` checks every lesson in four languages and proves
  every lesson problem the same way; advanced problems also pass the full
  `validate()` of the problem bank (a ko step must really be a ko, a seki
  step a real seki).
- Every problem is proved under real-board rules: a captured point can be
  played again (retake, throw back in, fill an eye), and the key stones of a
  life or kill problem must be sealed in, so they can never live through a
  liberty outside the problem area that nobody is allowed to fill. Both
  checks run for the course too. Before v4, problems were proved with
  captured points kept out of play and some lived through such outside
  liberties; the v4 audit (`docs/problems-audit.md`) fixed 17 of those
  problems and removed 37 that could not be fixed cleanly.
- The solver treats a ko or an unsettled position as a failure for the
  attacker, so a problem is only listed when its answer is unconditional
  (the 19 ko problems say so and are proved to be kos). Seki counts as life,
  as under Japanese rules: a kill that only reaches seki fails.
- Seki is recognised soundly: the defender survives even if the attacker
  moves first, cannot reach independent life even moving first (both with
  every ko counted against it), and lives alongside stones inside the fight
  rather than through a point outside the problem. The 23 seki problems
  (goal `seki`) are proved to have seki as their best result and to end in
  one. Bent four in the corner is never accepted as life.
- Endgame problems (v6) are proved by the solver's counting mode: exact
  minimax counting of a sealed region under Japanese counting (territory
  and prisoners), with sente, gote and every follow-up read out, and a
  proof that no unsettled end changes the count. A "biggest move" answer
  and its margin, and a "how many points" value (the difference between
  Black and White playing first), are stored only as the solver proves them.
- 543 problems: 34 endgame problems (first-line hane and connect, sente and
  reverse sente, double sente, the monkey jump, comparing moves, counting a
  move), 57 capturing races (16 big eye against small eye, eye
  against no eye, outside liberties), 23 seki problems (from grade 1 up),
  19 ko problems, 19 false-eye and 23 eye-space problems, 28 classic
  textbook shapes (straight and bent three, pyramid four, bulky and crossed
  five, rabbity six, rectangular six, seven stones on the second line) and
  six kills at the 2-1 point of the corner, each in four languages and
  graded by measurement into five grades of about 100 problems each. The
  247 problems added in v5 came from shape generators and were proved,
  filtered and reviewed the same way (`docs/problems-audit.md`, "v5").

v1 shipped 300 drills that were 25 one-move shapes repeated by symmetry,
with cyclic difficulty labels. v2 removed them.

## Engine

The packaged app ships KataGo 1.18.1 (Eigen CPU build) with the b6c96
network and uses it on every board size, through one bridge command
(`studio.katagoAnalyze`) that returns KataGo's search report: candidates
with visits, win rate, score lead, principal variations and ownership. The
opponent's strength comes from the visit budget, from choosing among those
candidates within a per-level loss window and, for all but the two
strongest levels, from a share of deliberate beginner's moves. The eight
levels are calibrated (v4): `scripts/calibrate-strength.mjs` plays them
against each other and against KataGo's human-imitation model on 19×19 and
9×9 and fits Bradley–Terry ratings, mapped to kyu/dan with the EGF rating
formula and a 10-kyu anchor. They run from ≈30 kyu to ≈4 dan, about five
ranks apart; labels stay “≈” because the anchor is a model, not people.
The human-style levels were measured again in v7 (708 games on 19×19 and
824 on 9×9, played on GitHub's runners by `.github/workflows/calibrate.yml`)
and run from ≈30 kyu to ≈6 dan without a gap; the stronger network's top
level is ≈7 dan.
Method, raw results and limitations: [docs/strength.md](docs/strength.md).
In the browser preview there is no KataGo: 9×9 falls back to Moka v2.1 and
other sizes to a small heuristic engine, and the interface says so
wherever it matters.

v5 adds two optional networks (`src/models.zig`, `studio.modelDownload`):
KataGo's human SL model `b18c384nbt-humanv0` (99 MB) and the larger
standard network `g170e-b15c192` (48 MB), each pinned by URL, size and
SHA-256, downloaded into `<app data>/models` with resume, verified and
renamed into place. With the human model the opponent plays human-style
(a second KataGo process, `-human-model`, started only for those games,
`engine/model/human.cfg`); with the larger network, analysis, review,
hints, scoring and the top level use it (a third process). The shipped
b6c96 process stays the ladder's engine and every fallback.

## Run the web app

Requires Node.js 24 or newer.

```bash
npm ci
npm run build
npm run sync
python3 -m http.server 4173 --directory frontend/dist
```

Open <http://127.0.0.1:4173>. The page is the exact asset bundle the desktop
shell serves.

## Test

```bash
npm test
npm run release-check
npm run ui-test        # real Chromium: flows, budgets, four languages, one primary per screen, visuals
npm run ui-update      # rewrite tests/visual baselines after an intended change
node scripts/export-strings.mjs   # refresh docs/l10n/strings.csv for native-speaker review
```

The suite covers Japanese, Chinese and Korean scoring (territory and area, seki, handicap compensation), ko and suicide, SGF round trips
and rules rejection, every UI string in four languages (and that every key
the interface uses exists), the solver on classic shapes and ladders,
Benson's unconditional life, every practice problem and course lesson, the
KataGo report parser and strength picker, the native bridge request,
handicap suggestion, v1 → v2 data migration, library rules and the
spaced-review ladder. It runs in Node without a browser or native SDK.

## Desktop shell

The macOS/Windows shell uses the Native SDK and the system WebView. It is
intentionally thin: `src/main.zig` wires the window, bridge, document-open
queue and the KataGo sidecar; `src/engine.zig` owns the persistent GTP
process and its narrow command vocabulary; `src/macos_open.m` receives the
macOS Apple Event that a double-clicked `.sgf` produces; `src/runner.zig` is
the platform runner.

On a machine with Node.js 24+, Zig 0.16.0 and Native SDK 0.11.0:

```bash
npm run build
npm run sync
zig build -Doptimize=ReleaseFast
native package --target macos --signing adhoc --assets frontend/dist \
  --output dist/GobanStudio.app --binary zig-out/bin/goban-studio
node scripts/install-engine.mjs dist/GobanStudio.app macos
```

`scripts/package.sh` wraps the build, packaging, sidecar install, signing,
zip and install for macOS. The release workflows run
`scripts/selftest-app.mjs` against the packaged executable: the real WebView
writes a report after KataGo has analysed a 9×9 and a 19×19 position
(win rate, score lead and ownership) and chosen a move in a handicap game.

The KataGo binary is copied into the package after `native package` because
the SDK asset bundler caps a single asset at 16 MiB.

## Release

One `release.yml` dispatch builds both platforms, runs the content and
native gates, and only then creates the tag and GitHub Release. Release
notes live in `.github/release-notes/<tag>.md`.

```bash
gh workflow run release.yml -f tag=v5.0.0
```

Use `-f rehearse=true` to run every gate and both builds without tagging or
publishing.

Signing is conditional on repository secrets (see
[`docs/signing.md`](docs/signing.md)): with them, the macOS app and its
KataGo sidecar are signed with a Developer ID under the hardened runtime,
notarized and stapled, and the Windows `goban-studio.exe` and `katago.exe`
are Authenticode-signed and timestamped; without them the builds fall back
to ad-hoc / unsigned and say so in the release notes. Both platform builds
also run a native screenshot tour of the packaged app
(`scripts/tour-app.mjs`: Today, a 19×19 game, its review, Practice,
Settings) and upload the captures as `native-screenshots-macos` /
`native-screenshots-windows`.

v5 adds an Intel Mac package: `build-macos.yml` takes `arch: x64` with the
`macos-15-intel` runner, builds KataGo and the app natively for x86_64,
and runs the same packaged self-test, updater tests and screenshot tour
there (`native-screenshots-macos-x64`). The release publishes
`GobanStudio-macOS-x64.dmg` / `.zip` beside the Apple Silicon package and
lists all five files in `SHA256SUMS`.

The updater is tested in three layers: Zig unit tests in
`src/install.zig` (the download address and redirect allow-list,
`SHA256SUMS` parsing and comparison, zip entry checks and extraction, CPU
checks, and on macOS `ditto` + `codesign` + no quarantine flag on a real
signed bundle) run in `native test` on every platform;
`scripts/test-updater.mjs` runs the embedded helpers against temp installs
of the packaged app on the real OS — a successful swap that starts the real
new app (on Windows with a file held locked and the WebView2 profile
carried over), a rollback when the new version does not start, nothing
changed when the app does not quit, and the read-only fallback; and a
non-blocking step downloads the newest published release for that platform
from GitHub, verifies and unpacks it, and discards it. The download address
is not configurable, so no test can point the app elsewhere.

## Architecture

```
src/web/index.html            shell markup (one root element)
src/web/styles.css            design tokens, light/dark, every component
src/web/js/main.jsx           entry
src/web/js/app/store.js       one state object, update(), toasts, announcements
src/web/js/app/controller.js  everything the app does (play, review, practice, library)
src/web/js/app/chrome.jsx     sidebar and toolbar (docs/design.md)
src/web/js/app/*.jsx          views: play + review, today, practice, library, sheets
src/web/js/app/story.js       step-by-step mistake stories (rules-derived descriptions)
src/web/js/app/explain.js     key mistakes and loss attribution
src/web/js/board.js           canvas renderer: zoom windows, overlays, keyboard cursor
src/web/js/engine.js          one engine interface: strength ladder, hints, review, dead stones
src/web/js/katago.js          native bridge client and KataGo report parser
src/web/js/ai.js              offline fallback: Moka 9×9 and the heuristic engine
src/web/js/solver.js          life-and-death / capturing solver (nets, snapbacks, ko)
src/web/js/materials.js       the wood grain and stone sprites (src/web/assets)
src/web/js/selftest.js        packaged-app self-test (async, stream, incremental, cancel)
src/web/js/tour.js            packaged-app screenshot tour (GOBAN_TOUR_OUT)
src/web/js/update.js          update check: version compare, opt-in weekly schedule
src/update.zig                the update check: GitHub's latest-release API
src/install.zig               v5 update install: download, SHA256SUMS, unpack, checks, helper start
src/updater/apply-macos.sh    v5 swap / relaunch / rollback helper (embedded in the app)
src/updater/apply-windows.ps1 v5 swap / relaunch / rollback helper (embedded in the app)
scripts/test-updater.mjs      v5 updater end-to-end tests on the packaged app
src/models.zig                optional downloads: pinned URLs, resume, SHA-256, atomic rename
src/web/js/models.js          optional downloads: status logic and host calls
src/web/js/app/models-ctl.js  optional downloads for the interface (state.models)
src/web/js/app/insight.js     mistake sources, themes, atari, complexity
src/web/js/app/rating.js      rating on the EGF kyu/dan scale
scripts/calibrate-strength.mjs  strength-ladder calibration (KataGo self-play, Bradley–Terry)
scripts/make-assets.mjs       regenerates every texture, stone, sound and icon
scripts/patch-sdk.mjs         keeps the system Edit/Window menus beside app menus
src/web/js/rules.js           game tree, legality, Japanese scoring, SGF export
src/web/js/sgf.js             dependency-free FF[4] reader
src/web/js/content/           course, problems (+ measured grades), openings, classics
src/web/js/i18n.js            one key → four strings
src/web/js/persist.js         guarded storage, v1 → v2 migration, spaced review
src/web/js/library.js         saved games and the current game
src/engine.zig                persistent KataGo GTP child process
src/main.zig                  Native SDK entry, bridge, window, open-file queue
```
