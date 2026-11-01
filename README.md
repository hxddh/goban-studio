# Goban Studio

A calm, offline Go app for macOS and Windows. Learn the first stone, play a
friend or the built-in opponent, then review the game and keep the record.

**Languages:** 中文 · English · 한국어 · 日本語  
**Board:** standard 19×19 by default; 9×9 and 13×13 for teaching and quick games · Japanese rules · komi and handicap

Goban Studio is the Go application built alongside — not instead of — the
existing Gomoku app. It deliberately uses a different bundle ID
(`dev.hxddh.gobanstudio`), app name (`Goban Studio`) and repository
(`goban-studio`), so the two apps can be installed and updated independently.

## Download

| Platform | File | First launch |
| --- | --- | --- |
| macOS (Apple Silicon) | `GobanStudio-macOS-arm64.dmg` / `.zip` | Ad-hoc signed, not notarized. Right-click the app → Open once. If blocked: `xattr -dr com.apple.quarantine /Applications/Goban\ Studio.app` |
| Windows (x64) | `GobanStudio-Windows-x64.zip` | Not Authenticode-signed. If SmartScreen appears: More info → Run anyway. WebView2 is normally preinstalled. |

`SHA256SUMS` is attached to every GitHub release. The full v1.1.1 notes are in
[`.github/release-notes/v1.1.1.md`](.github/release-notes/v1.1.1.md).

## What is here

- **Play** — tap intersections on a canvas board. Captures, suicide, simple ko
  and positional superko are checked locally. Play 9/13/19 boards under
  Japanese rules, with komi, up to nine handicap stones, and a human or
  computer opponent at five levels. On 19×19 the packaged app starts the
  bundled KataGo sidecar; 9×9 uses the bundled Moka v2.1 INT8 network; 13×13
  keeps the local heuristic opponent. Both sidebars retract independently
  during play, and the layout choice is remembered.
- **Scoring** — two passes enter scoring. Tap dead stones, see territory and
  prisoners, confirm the result, or resume play. A one-colour region counts
  only when it is separated from at least one side of the board, so an open
  board or a gapped wall is dame, not territory.
- **Review** — a whole-game evaluation curve, key-move list and influence
  overlay. The evaluator is a local heuristic and the UI labels it as such;
  it is useful for finding turning points, not a dan-level analysis report.
- **Learn** — 60 distinct lessons (20 foundation lessons plus 40 distinct
  reading positions), 40 professional opening layouts with 40 unique
  titles and eight-move lines, 20 classic games and 300 tsumego drills, all
  in the four launch languages, with hints, retry, answer and spaced review.
- **Library** — SGF import/export, saved games, a 200-game cap, and automatic
  saving of the current game. Double-clicking an `.sgf` opens it on macOS and
  Windows, and a record that declares a non-Japanese ruleset is rejected with
  an explanation rather than silently re-scored.
- **Settings** — language, wood/night/paper board themes, coordinates, move
  numbers, sound and default difficulty.
- **Offline by design** — no account, no network request, no telemetry.

## Run the web app

Requires Node.js 24 or newer. The desktop build uses the latest Node 26 LTS
in CI.

```bash
npm ci
npm run build
npm run sync
python3 -m http.server 4173 --directory frontend/dist
```

Open <http://127.0.0.1:4173>. The page is the exact asset bundle the desktop
shell serves. The browser preview has no sidecar process, so it uses the local
19×19 fallback; KataGo is active in the packaged desktop app.

## Test

```bash
npm test
npm run release-check
```

The suite covers Japanese rules and scoring, ko and suicide, SGF round trips
and rules rejection, all four language tables, 60 distinct lesson positions,
40 unique opening titles and lines, every classic and puzzle line, the
opponent's legality, the KataGo bridge request, review analysis and library
persistence. It runs in Node without a browser or native SDK.

## Desktop shell

The macOS/Windows shell uses the Native SDK and the system WebView. It is
intentionally thin: `src/main.zig` wires the window, bridge, document-open
queue and the KataGo sidecar; `src/macos_open.m` receives the macOS Apple
Event that a double-clicked `.sgf` produces; `src/runner.zig` is the platform
runner; the app itself lives in `src/web`.

On a machine with Node.js 24+, Zig 0.16.0 and Native SDK 0.11.0:

```bash
npm run build
npm run sync
zig build -Doptimize=ReleaseFast
native package --target macos --signing adhoc --assets frontend/dist \
  --output dist/GobanStudio.app --binary zig-out/bin/goban-studio
node scripts/install-engine.mjs dist/GobanStudio.app macos
```

`scripts/package.sh` wraps the build, packaging, sidecar install, signing, zip
and `~/Applications/GobanStudio.app` install for macOS. The release workflows
also run `scripts/selftest-app.mjs` against the packaged executable: the real
WebView writes a report after the native bridge and KataGo answer a probe.

The KataGo binary is copied into the package after `native package` because
the SDK asset bundler caps a single asset at 16 MiB. `scripts/install-engine.mjs`
places it at `…/frontend/dist/engine/<platform>/`, next to the network and
config, where `src/engine.zig` resolves it.

## Release

The release flow follows the Chessboard model: one `release.yml` dispatch
builds both platforms, runs the content and native gates, and only then creates
the tag and GitHub Release. Release notes live in
`.github/release-notes/<tag>.md`.

```bash
gh workflow run release.yml -f tag=v1.1.1
```

Use `-f rehearse=true` to run every gate and both builds without tagging or
publishing. The macOS job builds KataGo from the v1.18.1 source with the Eigen
backend; the Windows job downloads the matching official Eigen build and ships
its DLLs. v1.18.1 is the latest KataGo release with official Eigen CPU
binaries; v1.18.2 only changes the CUDA Turing attention path. The Windows zip
is produced by `scripts/make-zip.py` (forward slashes
and Unix mode bits), and `SHA256SUMS` is uploaded with all three assets.

## Architecture

```
src/web/index.html       shell markup
src/web/styles.css       layout, themes, four-language font stacks
src/web/js/main.js       view orchestration and the single canvas
src/web/js/rules.js      Game tree, legality, Japanese scoring, SGF export
src/web/js/sgf.js        dependency-free FF[4] reader
src/web/js/board.js      canvas renderer and hit testing
src/web/js/ai.js         KataGo bridge, Moka 9×9 and the local fallback
src/web/js/katago.js     native bridge client for the 19×19 sidecar
src/web/js/review.js     evaluation curve and key moves
src/web/js/content/      lessons, openings, classics and tsumego in four languages
src/web/js/i18n.js       one key → four strings, with missing-key fallback
src/web/js/persist.js    guarded localStorage access
src/web/js/library.js    saved SGF records and current game
src/engine.zig           persistent KataGo GTP child process
src/main.zig             Native SDK entry, bridge, window, open-file queue
src/macos_open.m         macOS kAEOpenDocuments Apple Event handler
src/runner.zig           platform runner
engine/model/            KataGo network, config and licence
packaging/               first-launch notes shipped inside the archives
```

The rule layer is independent of the renderer and DOM. Content is data, so a
translation never changes the Go position. The generated
`src/web/js/bundle.js` and `frontend/dist/` are build outputs and are ignored
by Git; `npm run build` and `npm run sync` recreate them.

## Honest limits

- The 19×19 engine is the small b6c96 KataGo network on CPU (Eigen), not a
  GPU-scale analysis engine. It is a genuine KataGo MCTS opponent with five
  visit budgets, but it is not presented as a fixed dan rank.
- The 60-lesson course is 20 foundation lessons plus 40 distinct reading
  positions drawn from the drill bank; it is a complete v1 curriculum, not a
  claim to a sixty-hour professional course.
- The 300 drills are 25 hand-checked base shapes plus deterministic
  symmetry/translation practice variants.
- Review remains a local shape/influence estimate, separate from KataGo; the
  UI labels it as such instead of claiming KataGo win-rate analysis.
- Japanese scoring is a territory count after the player marks dead stones.
  It does not adjudicate disputed life-and-death or seki for the player;
  Japanese rules require the players to agree on those.
- SGF support covers ordinary FF[4] game records, setup stones, comments,
  passes, marks and variations. It does not attempt every SGF property.
- macOS is ad-hoc signed and Windows has no Authenticode signature: both need
  certificates. The archive READMEs give the exact first-launch steps and the
  release does not imply a trust level it cannot provide.
- macOS/Windows packaging, WebView rendering and code signing are exercised by
  the release workflows, not by the Linux orb.

## Licence

MIT. `@sabaki/go-board` is MIT; Moka is MIT and its notices are in
`src/web/moka/`; Inter is licensed under the SIL Open Font License (see
`src/web/fonts/Inter-OFL.txt`). KataGo is MIT; the sidecar licence and model
notice are in `engine/model/`. `npm run sync` copies the app licence and every
third-party notice into `frontend/dist/licenses/`, so each archive carries
them.
