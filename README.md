# Goban Studio

A calm, offline Go app for macOS and Windows. Learn from the first stone,
play a computer opponent of the rank you choose, and review every game
with KataGo.

**Languages:** 中文 · English · 한국어 · 日本語  
**Boards:** 9×9, 13×13, 19×19 · Japanese, Chinese or Korean rules · komi and handicap up to nine stones

## What you can do

The app has four places and opens on the first.

- **Today** (⌘1) — the game in progress or a suggested game behind one
  button, today's practice, and your progress: your level with its
  history, the problems you have mastered, the last four weeks as dots
  (no streaks), recent milestones and your last three games.
- **Play** (⌘2) — the board. The opponent is one choice: a rank from
  30 kyu to 7 dan, played by the KataGo setting that measured closest to
  it. Teaching mode warns before a costly move and says why; a hint gives
  its reason; each of your moves gets a quiet verdict (good, slack or a
  mistake, with the points) when the game teaches or the balance is shown.
  Undo and redo, pass, count; a game that used undo or hints
  is not rated, and says so. A beginner is offered 9×9, then 13×13, then
  19×19.
- **The review** — when a game ends, the same board becomes its review:
  the result, the balance of the game, up to three key moments with their
  explained lines, the game in three phases (with KataGo), comments,
  marks and variations with undo. A key moment of your own game can be
  tried again from the position; a miss comes back in Practice. A stone
  tried on the board is a trial line you keep or discard. A counted game
  can be counted again.
- **Practice** (⌘3) — one short path for today (the next lesson, reviews
  that are due, this week's focus, one stretch problem, new problems at
  your level; 3, 5 or 10 items), and on the same page the whole course —
  23 units, 104 lessons, 377 steps — and 543 problems by topic, shown as
  positions with their status. A problem's name appears once you solve
  it. Reviews are spaced by a memory model and come back turned, mirrored
  or in the other colour. Difficulty is Level 1–5.
- **Library** (⌘4) — your games (the one in progress and unfinished ones
  in their own group), 20 classics with their final positions, openings and joseki, and a free board. Import SGF from a
  file, several files, a collection or the clipboard; export SGF or an
  image.
- **Settings** (⌘, / Ctrl+,) — seven panes: General, Board, Playing, You,
  Engines, Data, About. Language, appearance, larger text, a
  high-contrast board, coordinates (on two or all four sides), traditional board proportions, sound volume, teaching, rules, your
  level, the optional KataGo networks, backup and restore, the data
  folder, updates.

The board is playable with Tab, the arrow keys and Space, and with a
screen reader. ⌘/ (Ctrl+/ on Windows) lists every shortcut.

## Download and first launch

Downloads are on the [releases page](https://github.com/hxddh/goban-studio/releases).

| Platform | File | First launch |
| --- | --- | --- |
| macOS 13 or later (Apple Silicon) | `GobanStudio-macOS-arm64.dmg` or `.zip` | Drag the app to Applications and open it from there. macOS says it cannot verify the app: close the message, then on macOS 15 or later go to System Settings → Privacy & Security → **Open Anyway**; on macOS 14 or earlier right-click the app → Open. |
| macOS 13 or later (Intel) | `GobanStudio-macOS-x64.dmg` or `.zip` | As for Apple Silicon. |
| Windows (x64) | `GobanStudio-Windows-x64.zip` | Unzip it and run `bin\goban-studio.exe`. If SmartScreen appears: More info → Run anyway. WebView2 is preinstalled on Windows 10 and 11. |

**The builds are not code-signed.** macOS builds are ad-hoc signed and not
notarized, and Windows builds are not Authenticode-signed, until the
certificates described in [`docs/signing.md`](docs/signing.md) exist.
Each release's notes, and the README inside each download, are written
from what that build's signing steps actually did, so they are the place
to look. There is no Windows installer: the download is a zip, and opening
`.sgf` files by double-click needs one command from the package README.
`SHA256SUMS` is attached to every release.

**Windows on ARM:** use the x64 package. Windows 11 on ARM runs it, KataGo
included, under its x64 emulation; analysis is slower than on a comparable
x64 PC. There is no native ARM64 build because KataGo publishes no ARM64
Windows binary.

### Where your data lives

| | Folder |
| --- | --- |
| macOS | `~/Library/Application Support/dev.hxddh.gobanstudio` |
| Windows | `%LOCALAPPDATA%\dev.hxddh.gobanstudio\Data` |

Inside it, `data` holds your games, progress and settings and `models`
the optional KataGo networks. Settings → Data → **Show data folder**
opens it. Nothing is kept inside the app, so replacing or updating the
app keeps your data and deleting the app leaves it behind. *Export
backup* writes everything to one file; a restore keeps a snapshot you can
undo. A file the app cannot read is copied aside and never written over.
Only one copy of the app runs at a time. Details:
[`docs/storage.md`](docs/storage.md).

## Offline by design

No account, no telemetry, and no network request unless you ask for one:

- **Check for updates…** makes one request to GitHub for the latest
  release. The weekly automatic check is off until you turn it on.
- **Download and install** fetches that release's package and its
  `SHA256SUMS` from GitHub.
- **The optional KataGo networks** (Settings → Engines) are fetched when
  you choose them: the human model from KataGo's GitHub releases, the
  stronger network from KataGo's own network server,
  `media.katagotraining.org`.

The addresses are fixed in the native code, and redirects are followed
only over HTTPS: for updates only to GitHub's own download hosts, for the
networks to those and `media.katagotraining.org`. If your system, or the
`HTTPS_PROXY` variable, names an HTTP proxy, these requests go through it
as a tunnel, with TLS still verified end to end. SOCKS proxies and proxy
auto-config (PAC) scripts are not used. An interrupted download continues
where it stopped. See [`SECURITY.md`](SECURITY.md).

## Updates

After a check finds a newer release, **Download and install** does the
rest:

1. The app downloads this computer's package and the release's
   `SHA256SUMS`. The package must match its line there. It is unpacked
   into a temporary folder and checked: the layout and bundle id, an
   executable for this CPU, the version it states, and on macOS
   `codesign --verify`.
2. **Restart to update** hands over to a small helper the app carries
   inside itself. It waits for the app to exit, puts the new version in
   place of the old one, keeps the old one as a backup, and starts the
   new one. If that does not report within 90 seconds that it started,
   the helper puts the old version back.

Only the version the last check found is installed, and only if it is
newer. When the app cannot replace itself — it is in a folder you cannot
write to (the disk image is one), macOS runs it from a temporary
"translocated" copy, or it is a development build — it says why and
offers the download page.

**What the check proves.** A checksum shows the download is intact, not
who made it. A release can also carry an Ed25519 signature of
`SHA256SUMS` that names the version, which apps built with the project's
public key require. No signing key is configured yet, so today an update
is trusted as far as GitHub and HTTPS are, like a manual download.

## Honest content

The course and the problems are proved, not just counted.

- `scripts/check-problems.mjs` proves every problem with the solver
  (`src/web/js/solver.js`): one to three correct first moves, a solution
  line that ends in a won position, and no two problems the same shape
  under rotation or reflection.
- Problems are proved under real-board rules: a captured point can be
  played again, and the key stones of a life or kill problem are sealed
  in, so they cannot live through a liberty outside the problem.
- A ko or an unsettled position counts as a failure for the attacker, so
  an answer is unconditional; the 19 ko problems say they are kos and are
  proved to be. Seki counts as life: the 23 seki problems are proved to
  have seki as their best result. Bent four in the corner is never life.
- The 34 endgame problems are proved by exact counting of a sealed
  region, with sente, gote and every follow-up read out.
- Every problem shown again in a review is turned, mirrored or
  colour-swapped, and proved in that form too
  (`scripts/check-transforms.mjs`).
- `scripts/check-course.mjs` checks every lesson in four languages and
  proves every lesson problem the same way.
- A problem's level (1–5) estimates what a person has to read, not how
  hard the solver worked. The levels are estimates: they have not been
  measured on people.

What the solver cannot judge — where to play in the opening, which side is
bigger — is checked against KataGo ([`docs/lesson-audit.md`](docs/lesson-audit.md)),
and that check has not been rerun for the newest lessons. No strong player
has reviewed the course yet. [`docs/problems-audit.md`](docs/problems-audit.md)
has the method and what was removed; [`docs/QA.md`](docs/QA.md) lists what
is verified and what is not.

## Engine

The packaged app ships KataGo 1.18.1 (the Eigen CPU build) with the b6c96
network, on every board size. Two platforms also ship a faster build and
start it when the machine can run it, falling back to the plain build if it
does not start: KataGo's AVX2 build on Windows (when the processor has
AVX2), and a Metal build (GPU and Neural Engine) on Apple Silicon Macs.
macOS 13 is the oldest supported release: Zig 0.16, which builds the
shell, and KataGo's Metal backend both need it. The opponent's strength comes from the
search budget, from choosing among KataGo's candidates within a loss
window and, for the weaker ranks, from a share of deliberate beginner's
moves. Settings → Engines says which build runs (Metal, AVX2 or the
standard CPU build), why the faster one was given up if it was, and
Measure speed times one short search per installed network in visits per
second.

The ranks are measured: `scripts/calibrate-strength.mjs` plays the
settings against each other and against KataGo's human-imitation model,
fits Bradley–Terry ratings and maps them to kyu and dan with the EGF
formula and a 10-kyu anchor. Labels are shown with "≈" because the anchor
is a model, not people. Method, results and limits:
[`docs/strength.md`](docs/strength.md).

Two optional networks can be added in Settings → Engines, each pinned by
address, size and SHA-256 and removable again: KataGo's human model
(99 MB; the opponent then plays in a human style) and a current strong
network, kata1-b18c384nbt (98 MB; used for analysis, hints, counting and
the strongest ranks; it is much larger than the built-in one, so analysis
is slower on older computers).

In the browser preview there is no KataGo: a small offline engine plays,
and the interface says so where it matters.

---

# For developers

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the full set-up and the rules for
content; this half is the short version.

## Run the web app

Node.js 24 or newer.

```bash
npm ci
npm run build
npm run sync
python3 -m http.server 4173 --directory frontend/dist
```

Open <http://127.0.0.1:4173>. The page is the asset bundle the desktop
shell serves; without the native host it uses browser storage and the
offline engine.

## Test

```bash
npm run lint           # ESLint, no warnings allowed
npm run typecheck      # TypeScript over the JS (jsconfig.json)
npm test               # unit and data tests, Node only
npm run release-check  # content counts, four languages, pins, one version
npm run build && npm run sync && npm run ui-test   # real Chromium
npm run test:native    # Zig tests on the SDK's null platform
npm run ui-update      # rewrite tests/visual baselines after an intended change
node scripts/export-strings.mjs   # refresh docs/l10n/strings.csv
```

Tests are organised by area (`scripts/tests/{core,data,model,play,learn,shell}-*.mjs`,
`scripts/ui-tests/*.mjs`). `node scripts/test.mjs play-,learn-` runs some
files; `UI_ONLY=<text> npm run ui-test` one browser check.
[`docs/QA.md`](docs/QA.md) says what each gate covers, with current
counts, and what no machine checks.

## Desktop shell

The shell is Zig on the Native SDK and the system WebView (WKWebView,
WebView2). It needs Zig 0.16.0. The SDK is a devDependency at an exact
version, so `npm ci` installs it with the hashes in `package-lock.json`;
do not install it globally.

```bash
npm ci
npm run build && npm run sync
node scripts/native-sdk.mjs toolchain
SDK="$(node scripts/native-sdk.mjs path)"
node scripts/patch-sdk.mjs "$SDK"
zig build -Dnative-sdk-path="$SDK" -Doptimize=ReleaseSafe
```

`scripts/package.sh` does this on macOS and then packages the app,
installs KataGo and signs ad hoc. KataGo is copied in after packaging
because the SDK's asset bundler caps one asset at 16 MiB. On Linux the
SDK's null platform compiles the shell and runs its tests without a
window (`npm run test:native`).

## Release

One dispatch of `release.yml` from `main` runs every gate, builds the
three packages on the CPUs they ship for, and only then creates the tag
and the GitHub release:

```bash
gh workflow run release.yml --ref main -f tag=v15.0.0
gh workflow run release.yml -f tag=v15.0.0 -f rehearse=true   # every gate and build, publishes nothing, any branch
```

The tag must be `v` + the version in `package.json`, its notes must exist
as `.github/release-notes/<tag>.md`, and it must not be published
already. Each build runs the packaged app's self-test in the real WebView
with KataGo, the updater tests on the real OS and a screenshot tour.

Signing `SHA256SUMS` happens in a job of its own in the protected
environment `release-signing`, which the repository owner creates once
(`main` only, a required reviewer, the secret `UPDATE_SIGNING_KEY`). The
job runs in every real release, never in a rehearsal, and waits for the
reviewer's approval once the environment has one; without the secret the
release carries unsigned sums and the run says so. Code signing depends on
repository secrets; without them the builds are ad-hoc signed (macOS) and
unsigned (Windows), and the notes say so. All of it:
[`docs/signing.md`](docs/signing.md).

## Architecture

```
src/web/                 the page: index.html, styles.css, assets
src/web/js/              the core, one module each: rules and scoring, SGF,
                         the solver, the board renderer, the engine interface
                         and scheduler, the KataGo client, the offline
                         engine, the opponent ladder, i18n, the host bridge
src/web/js/app/          the application: state, controllers, views, sheets,
                         shortcuts, feedback
src/web/js/play/         Play's home and Library, the review model, analysis, import
src/web/js/practice/     Practice: the path, today's session, the catalog,
                         placement, review transforms
src/web/js/data/         the file store, games, settings, backups, migrations
src/web/js/model/        the player model: rating, spaced review, focus, the path
src/web/js/content/      course, problems and their levels, classics, opening book
src/web/js/messages/     every interface string in four languages, by area

src/main.zig, shell.zig  the shell: start-up and its state
src/commands.zig         the bridge's command table; events.zig: platform events
src/bridge_*.zig         the commands: files, window and menus, KataGo, updates, networks
src/lifecycle.zig        one running copy, and the save before a quit
src/store.zig, files.zig, paths.zig      the data folder, file dialogs, paths
src/durable.zig          a written file survives a power cut
src/instance.zig         one running copy; a second launch hands over its file
src/engine.zig, engine_build.zig         the KataGo child process; which build starts
src/engine_request.zig, engine_worker.zig  what a search is; the thread that runs it
src/net.zig              one HTTPS client: redirects, resume
src/net_proxy.zig, net_tunnel.zig        which proxy; the session and the tunnel through it
src/update.zig, install.zig, updater/    update check, download and checks, the swap helpers
src/install_verify.zig, install_package.zig, install_apply.zig
                         signature and sums; the package; the helper and replies
src/models.zig           the optional network downloads
src/macos_open.m, win_close.zig          platform pieces

scripts/tests/, scripts/ui-tests/        the tests, by area
scripts/                 build, content checks, calibration, packaging, release
.github/workflows/       checks on pull requests, platform builds, the release
docs/                    design, storage, the plan, strength, signing, QA, audits
```

## Version history

Each version's notes are in [`.github/release-notes/`](.github/release-notes/).

## Licence

MIT. KataGo, Moka and @sabaki/go-board are MIT; the built-in KataGo network
(g170 b6c96) is CC0, and the optional networks (the human model and
kata1-b18c384nbt) are under the
[KataGo Neural Network License](https://katagotraining.org/network_license/)
(`engine/model/LICENSE-KataGo-networks.txt`); Inter is under the SIL Open
Font License 1.1. The licences ship inside the app.
