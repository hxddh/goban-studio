# Goban Studio

A calm, offline Go app for macOS and Windows. Learn the first stone, play a
friend or the built-in opponent, then review the game and keep the record.

**Languages:** 中文 · English · 한국어 · 日本語  
**Board:** 9×9, 13×13, 19×19 · Chinese and Japanese rules · komi and handicap

Goban Studio is the Go application built alongside — not instead of — the
existing Gomoku app. It deliberately uses a different bundle ID
(`dev.hxddh.gobanstudio`), app name (`Goban Studio`) and repository
(`goban-studio`), so the two apps can be installed and updated independently.

## What is here

- **Play** — tap intersections on a canvas board. Captures, suicide, simple ko
  and positional superko are checked locally. Choose Chinese or Japanese
  rules, 9/13/19 boards, komi, up to nine handicap stones, and a human or
  computer opponent at five levels.
- **Scoring** — two passes enter scoring. Tap dead stones, see the area or
  territory estimate, confirm the result, or resume play.
- **Review** — a whole-game evaluation curve, key-move list and influence
  overlay. The evaluator is a local heuristic; it is useful for finding
  turning points, not a dan-level engine.
- **Learn** — twelve short, playable lessons and twenty-five tsumego drills,
  each in all four languages, with hints, retry, answer and spaced review.
- **Library** — SGF import/export, saved games, a 200-game cap, and automatic
  saving of the current game.
- **Settings** — language, wood/night/paper board themes, coordinates, move
  numbers, sound and default difficulty.
- **Offline by design** — no account, no network request, no telemetry.

## Run the web app

Requires Node.js 20 or newer.

```bash
npm ci
npm run build
npm run sync
python3 -m http.server 4173 --directory frontend/dist
```

Open <http://127.0.0.1:4173>. The page is also the exact asset bundle the
desktop shell serves.

## Test

```bash
npm test
```

The suite covers rules and scoring, ko and suicide, SGF round trips and
variations, all four language tables, every lesson/puzzle line, the opponent's
legality, review analysis and library persistence. It runs in Node without a
browser or native SDK.

## Desktop shell

The macOS/Windows shell uses the Native SDK and the system WebView. It is
intentionally thin: `src/main.zig` wires the window, bridge and file
association; `src/runner.zig` is the platform runner; the app itself lives in
`src/web`.

On a machine with Zig 0.16 and the Native SDK:

```bash
npm run build
npm run sync
zig build -Doptimize=ReleaseFast
native package --target macos --signing adhoc \
  --output dist/GobanStudio.app --binary zig-out/bin/goban-studio
```

`scripts/package.sh` wraps the build, packaging, zip and
`~/Applications/GobanStudio.app` install for macOS. The Zig source and
manifest have been validated in the Linux orb with Zig 0.16 and Native SDK
0.11.0 (`native validate`, a null-backend `native build`, and three Zig tests).
The macOS/Windows WebView package, signing and notarization still require those
hosts: treat the packaged app as an explicit validation step, not as a result
claimed by this repository.

## Architecture

```
src/web/index.html       shell markup
src/web/styles.css       layout, themes, four-language font stacks
src/web/js/main.js       view orchestration and the single canvas
src/web/js/rules.js      Game tree, legality, scoring, SGF export
src/web/js/sgf.js        dependency-free FF[4] reader
src/web/js/board.js      canvas renderer and hit testing
src/web/js/ai.js         offline heuristic / flat Monte-Carlo opponent
src/web/js/review.js     evaluation curve and key moves
src/web/js/content/      lessons and tsumego, side by side in four languages
src/web/js/i18n.js       one key → four strings, with missing-key fallback
src/web/js/persist.js    guarded localStorage access
src/web/js/library.js    saved SGF records and current game
src/main.zig             Native SDK entry, bridge, window
src/runner.zig           platform runner
```

The rule layer is independent of the renderer and DOM. Content is data, so a
translation never changes the Go position. The generated
`src/web/js/bundle.js` and `frontend/dist/` are build outputs and are ignored
by Git; `npm run build` and `npm run sync` recreate them.

## Honest limits

This is a complete, runnable v1 foundation, not a claim that the full
sixty-hour curriculum from the feasibility study is already written.

- The built-in opponent is beginner/casual strength, not KataGo. A KataGo
  integration would be a separate engine project with its own model, licence,
  memory and packaging work.
- The shipped curriculum is 12 lessons and 25 puzzles. The feasibility report
  scopes a much larger, native-reviewed course; the data schema here is ready
  for it.
- The desktop shell, native file dialogs, code signing and auto-update have
  not been verified in this environment.
- SGF support covers ordinary FF[4] game records, setup stones, comments,
  passes, marks and variations. It does not attempt every SGF property.

## Licence

MIT. `@sabaki/go-board` is MIT; Inter is licensed under the SIL Open Font
License (see `src/web/fonts/Inter-OFL.txt`). KataGo is not bundled.
