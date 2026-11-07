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

`SHA256SUMS` is attached to every GitHub release. The v8.0.0 notes are in
[`.github/release-notes/v8.0.0.md`](.github/release-notes/v8.0.0.md).

## v9: one loop

v9 is rebuilt around one loop: **play a game → see what mattered, on the
board → try that moment again → play the next game**. It starts empty: no
data from earlier versions is read (see the v9 release notes).

## v10: the first ten minutes

A new mark (two stones in kosumi on a plain board, the same in the icon,
the sidebar and the welcome screen); a six-problem placement quiz for
players who already know the rules, which sets where the course starts;
Learn's problem rows show their position; Play's home lists four classics
and a link to the rest. v10 reads everything v9 saved.

## Two spaces

- **Play** (⌘1) — opens on the game in progress, or the suggested game with
  one button (9×9 for a beginner, 19×19 from about 20 kyu). Below it: your
  level ("≈ 12 kyu (±1)"), your games, the classics (four, then all 20) and the opening
  explorer. The opponent is one choice: a measured rank, 30 kyu to 7 dan;
  the app picks the KataGo setting that measured closest. Teaching mode
  warns before a costly move and says why; a hint gives its reason too.
- **The post-game review** — when a game ends, the same board becomes its
  review: the result, the balance of the game, the three phases (with
  KataGo), up to three key moments with their stories, comments and
  variations. Each key moment of your own game can be **tried again from
  the position**: KataGo judges your new move on the board, and a miss
  comes back in Learn on the spaced-review ladder. One analysis per game,
  stored with the game; your older games are analysed quietly in the
  background.
- **Learn** (⌘2) — one short path for today, chosen for you and played as
  one session: the next lesson, your own mistakes and problems due for
  review, this week's focus (named, with its reason), one stretch problem,
  new problems at your level, and for beginners capture Go and a first 9×9
  game. A quiet catalog holds every lesson (18 units, 82 lessons) and the
  624 solver-proved problems.
- **Settings** (⌘, / Ctrl+,) — language, appearance, larger text, board
  coordinates and move numbers, sound, teaching, rules, your level, the
  optional KataGo networks, backup, updates.
- **Keyboard** — ⌘N new game, ⌘Z undo, ⇧⌘P pass, ⇧⌘H hint, ⌘1/⌘2 the two
  spaces, ←/→ through a review; the board is playable with Tab, the arrow
  keys and Space, and with a screen reader (⌘/ lists every key; Ctrl on
  Windows).
- **Your data** — files in the app's data folder (`data/settings.json`,
  `profile.json`, `current.json`, `games/<id>.json`), written atomically by
  the desktop shell, with no size limit; *Export backup* writes them all as
  one file.
- **Offline by design** — no account, no telemetry, and no network request
  unless you ask for one: **Check for updates…** makes a single request to
  GitHub for the latest release, and the weekly automatic check is off
  until you turn it on in Settings. **Download and install** fetches that
  release's package and its `SHA256SUMS` from GitHub — nothing else, and
  only when you choose it.
- **Optional downloads** — two KataGo networks you may add in Settings,
  fetched only when you choose them: KataGo's human model (more human-like
  opponents) and a larger network (the strongest ranks and deeper
  analysis). They come from KataGo's official GitHub releases (pinned
  addresses and SHA-256 hashes) and can be removed again.

Earlier versions are described in their release notes in
[`.github/release-notes/`](.github/release-notes/).

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
- 624 problems: 75 endgame problems (first-line hane and connect, sente and
  reverse sente, double sente, the monkey jump, comparing moves, counting a
  move), 57 capturing races (16 big eye against small eye, eye
  against no eye, outside liberties), 23 seki problems (from grade 1 up),
  19 ko problems, 19 false-eye and 23 eye-space problems, 28 classic
  textbook shapes (straight and bent three, pyramid four, bulky and crossed
  five, rabbity six, rectangular six, seven stones on the second line) and
  six kills at the 2-1 point of the corner, each in four languages and
  graded by measurement into five grades of about 120 problems each. The
  247 problems added in v5 came from shape generators and were proved,
  filtered and reviewed the same way (`docs/problems-audit.md`, "v5"); the
  81 added in v11 give every grade at least 15 capture, save, life, kill
  and endgame problems (`docs/problems-audit.md`, "v11").

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

Tests are organised by area (`scripts/tests/{core,data,model,shell,play,learn}-*.mjs`,
`scripts/ui-tests/*.mjs`); `node scripts/test.mjs play-,learn-` runs some of
them, `UI_ONLY=<text> npm run ui-test` one browser check. They cover the
rules and scoring under three rulesets, SGF, the solver and every problem
and lesson, the file store and backups, the player model (rating, spaced
review, focus, Learn's path), the engine scheduler and the opponent
ladder, teaching warnings, capture Go, the post-game review and try
again, every string in four languages, the accessibility audit, start-up
budgets and the visual baselines. The unit suite runs in Node without a
browser or native SDK.

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
(`scripts/tour-app.mjs`: Play, a 19×19 game, its review, Learn,
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
src/web/js/app/controller.js  boot, the two spaces, history, import, backup
src/web/js/app/chrome.jsx     sidebar and toolbar (docs/design.md)
src/web/js/app/*.jsx          the board views (play, lessons, problems) and sheets
src/web/js/play/              Play's home, the post-game review model, the analysis, try again
src/web/js/learn/             Learn's path, today's session, the catalog
src/web/js/data/              the file store (store.js), settings, games, backups
src/web/js/model/player.js    the one player model: rating, spaced review, focus, Learn's path
src/web/js/opponents.js       the opponent ladder: ranks, implementations, measured strengths
src/store.zig                 the host side of the store: data/ files, atomic, chunked
src/web/js/app/story.js       step-by-step mistake stories (rules-derived descriptions)
src/web/js/app/explain.js     key mistakes and loss attribution
src/web/js/board.js           canvas renderer: zoom windows, overlays, keyboard cursor
src/web/js/engine.js          one engine interface: strength ladder, hints, review, dead stones
src/web/js/katago.js          native bridge client and KataGo report parser
src/web/js/ai.js              offline fallback: Moka 9×9 and the heuristic engine
src/web/js/solver.js          life-and-death / capturing solver (nets, snapbacks, ko)
src/web/js/materials.js       the stone sprites (src/web/assets)
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
scripts/calibrate-strength.mjs  strength-ladder calibration (KataGo self-play, Bradley–Terry)
scripts/make-assets.mjs       regenerates every texture, stone, sound and icon
scripts/patch-sdk.mjs         keeps the system Edit/Window menus beside app menus
src/web/js/rules.js           game tree, legality, Japanese scoring, SGF export
src/web/js/sgf.js             dependency-free FF[4] reader
src/web/js/content/           course, problems (+ measured grades), classics, book
src/web/js/content.js         content in two steps: a start-up index, then lesson steps,
                              problem bodies and classic records fetched on idle or first use
src/web/js/i18n.js            one key → four strings
src/engine.zig                persistent KataGo GTP child process
src/main.zig                  Native SDK entry, bridge, window, open-file queue
```
