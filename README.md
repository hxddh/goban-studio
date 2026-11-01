# Goban Studio

A calm, offline Go app for macOS and Windows. Learn from the first stone,
play a computer opponent that is as strong as you want it to be, and review
every game with KataGo.

**Languages:** 中文 · English · 한국어 · 日本語  
**Boards:** 9×9, 13×13, 19×19 · Japanese rules · komi and handicap up to nine stones

Goban Studio is the Go application built alongside — not instead of — the
existing Gomoku app. It deliberately uses a different bundle ID
(`dev.hxddh.gobanstudio`), app name (`Goban Studio`) and repository
(`goban-studio`), so the two apps can be installed and updated independently.

## Download

| Platform | File | First launch |
| --- | --- | --- |
| macOS (Apple Silicon) | `GobanStudio-macOS-arm64.dmg` / `.zip` | See the release notes. A build made with the project's Developer ID is signed and notarized and opens normally. A build made without it is ad-hoc signed and not notarized: right-click the app → Open once; if blocked, `xattr -dr com.apple.quarantine /Applications/Goban\ Studio.app` |
| Windows (x64) | `GobanStudio-Windows-x64.zip` | See the release notes. A build made without the code-signing certificate is not Authenticode-signed: if SmartScreen appears, More info → Run anyway. WebView2 is normally preinstalled. |

Each release's notes (and the README inside the download) state how *that*
build was signed: the release workflow writes the "First launch" text from
what the signing steps actually did, not from a template. Until the
certificates in [`docs/signing.md`](docs/signing.md) are in place, releases
are ad-hoc signed (macOS) and unsigned (Windows).

`SHA256SUMS` is attached to every GitHub release. The v3.0.0 notes are in
[`.github/release-notes/v3.0.0.md`](.github/release-notes/v3.0.0.md).

## v3 at a glance

- **Today** — one starting screen: continue, today's five (with your own
  mistakes), the next lesson, a suggested game, your level over time and
  what to work on.
- **Playing** — KataGo on its own thread (the window never waits),
  incremental positions, a human pace, resignation at stronger levels, an
  offer to count, clocks, teaching mode, two-click placement, a three-point
  summary and a rating after each game.
- **Review** — free variations with live analysis, explained mistakes with
  "practise this", a hover chart.
- **Craft** — generated kaya/katsura/paper/slate boards, shell and slate
  stones, modelled sounds, one icon family, a motion system, a native macOS
  menu bar alongside the system Edit and Window menus.
- **Quality** — real-browser interface checks with budgets and visual
  comparison in CI; a four-language glossary; a usability protocol (not yet
  run with people).

## Places, one board

- **Today** — see "v3 at a glance".
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
- **Practice** — a course that starts from zero (units → multi-step lessons
  with explanation, placement exercises and live problems), problem
  collections by topic, and a daily five with spaced review. Every problem is
  answered live by a built-in solver: a wrong move is met with the real
  refutation on the board, a right move with the most stubborn defence.
- **Library** — the game in progress (“Continue”), your games with
  thumbnails, filters (won / lost / imported) and search, 20 classic games
  and 40 professional openings to replay as guess-the-move drills. SGF import
  and export; double-clicking an `.sgf` opens it on macOS and Windows; a
  record that declares a non-Japanese ruleset is rejected with an
  explanation rather than silently re-scored.
- **Settings** (⌘, / Ctrl+,) — language, light/dark/system appearance,
  wood/paper/slate board, coordinates, move numbers, sound, your level.
- **Keyboard** — ⌘N new game, ⌘Z undo, ⇧⌘P pass, ⇧⌘H hint, ⌘. focus mode,
  ⌘1/2/3 places, ←/→ through a review, and the board itself is playable with
  Tab, the arrow keys and Space (⌘/ lists them all; Ctrl on Windows).
- **Offline by design** — no account, no telemetry, and no network request
  unless you ask for one: **Check for updates…** makes a single request to
  GitHub for the latest release, and the weekly automatic check is off
  until you turn it on in Settings. Nothing about you or your games is
  sent; everything else (KataGo, lessons, your library) stays on your
  computer.

## Honest content

The course and the problems are verified, not counted:

- `scripts/check-problems.mjs` proves every problem with the solver in
  `src/web/js/solver.js`: it must have between one and three correct first
  moves, the solution line must end in a won position, no two problems may be
  the same shape under rotation or reflection, and the difficulty grade in
  `problem-grades.json` must match a fresh measurement (solution length,
  proof size and number of tempting wrong moves).
- `scripts/check-course.mjs` checks every lesson in four languages and proves
  every lesson problem the same way.
- The solver treats a ko or an unsettled position as a failure for the
  attacker, so a problem is only listed when its answer is unconditional.

v1 shipped 300 drills that were 25 one-move shapes repeated by symmetry,
with cyclic difficulty labels. v2 removed them.

## Engine

The packaged app ships KataGo 1.18.1 (Eigen CPU build) with the b6c96
network and uses it on every board size, through one bridge command
(`studio.katagoAnalyze`) that returns KataGo's search report: candidates
with visits, win rate, score lead, principal variations and ownership. The
opponent's strength comes from the visit budget and from choosing among
those candidates within a per-rank loss window; ranks are approximate and
labelled “≈”. In the browser preview there is no KataGo: 9×9 falls back to
Moka v2.1 and other sizes to a small heuristic engine, and the interface
says so wherever it matters.

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
npm run ui-test        # real Chromium: flows, budgets, four languages, visuals
npm run ui-update      # rewrite tests/visual baselines after an intended change
```

The suite covers Japanese rules and scoring, ko and suicide, SGF round trips
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
gh workflow run release.yml -f tag=v3.0.0
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

## Architecture

```
src/web/index.html            shell markup (one root element)
src/web/styles.css            design tokens, light/dark, every component
src/web/js/main.jsx           entry
src/web/js/app/store.js       one state object, update(), toasts, announcements
src/web/js/app/controller.js  everything the app does (play, review, practice, library)
src/web/js/app/*.jsx          views: shell, play + review, practice, library, sheets
src/web/js/board.js           canvas renderer: zoom windows, overlays, keyboard cursor
src/web/js/engine.js          one engine interface: strength ladder, hints, review, dead stones
src/web/js/katago.js          native bridge client and KataGo report parser
src/web/js/ai.js              offline fallback: Moka 9×9 and the heuristic engine
src/web/js/solver.js          life-and-death / capturing solver (nets, snapbacks, ko)
src/web/js/materials.js       board textures and stone sprites (src/web/assets)
src/web/js/selftest.js        packaged-app self-test (async, stream, incremental, cancel)
src/web/js/tour.js            packaged-app screenshot tour (GOBAN_TOUR_OUT)
src/web/js/update.js          update check: version compare, opt-in weekly schedule
src/update.zig                the one network request: GitHub's latest-release API
src/web/js/app/insight.js     mistake sources, themes, atari, complexity
src/web/js/app/rating.js      rating on the EGF kyu/dan scale
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
