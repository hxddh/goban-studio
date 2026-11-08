# Goban Studio design specification (v10)

This is the single source of truth for how Goban Studio looks and moves.
Every screen is checked against it before release (see the acceptance
checklist at the end). When the code and this document disagree, one of
them is a bug.

## 1. Principles

1. **The board is the product.** Nothing on screen competes with it:
   no texture, no saturated colour, no decoration near it.
2. **One primary action per screen.** A screen may have many actions, but
   only one is filled (ink). Everything else is a quiet button, a menu item
   or a text link.
3. **Calm by default, detail on demand.** Explanations, numbers and options
   appear when the user asks for them (disclosure, hover, menu), not as
   standing grey text.
4. **Native first.** It is a desktop app: system fonts, a sidebar, a
   toolbar with back/forward, a window that blends into its chrome.
5. **Honest.** Approximate numbers are marked ≈; the app never pretends.

## 2. Typography

System fonts only, so text renders like the rest of the OS:

| Platform | Latin | Chinese | Japanese | Korean |
| --- | --- | --- | --- | --- |
| macOS | SF Pro (`-apple-system`) | PingFang SC | Hiragino Sans | Apple SD Gothic Neo |
| Windows | Segoe UI Variable / Segoe UI | Microsoft YaHei UI | Yu Gothic UI | Malgun Gothic |

The stack is chosen per language with `:lang()` so a Japanese page never
falls back to a Chinese face.

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `--t-display` | 28 / 34 | 600 | the one page title on list pages |
| `--t-title` | 20 / 26 | 600 | panel titles, sheet titles, hero headline |
| `--t-head` | 15 / 22 | 600 | section headings, card titles |
| `--t-body` | 13 / 20 | 400 | everything by default |
| `--t-read` | 14 / 22 | 400 | lesson text and explanations (reading) |
| `--t-small` | 12 / 17 | 400 | secondary text, metadata |
| `--t-caption` | 11 / 14 | 500 | eyebrows, chart axes, badges |

Rules: weights are 400, 500 (labels, buttons) and 600 (headings) only.
Hierarchy comes from weight and colour (`--text`, `--text-2`, `--text-3`)
before size. Numbers that change (clocks, captures, scores, move counts) use
tabular figures. Nothing below 11 px.

## 3. Space and layout

An 8 px grid with a 4 px half-step: `--s-1` 4, `--s-2` 8, `--s-3` 12,
`--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48, `--s-8` 64.

The window has three columns:

| Region | Width | Notes |
| --- | --- | --- |
| Sidebar | 216 px (64 px below 1080 px window width) | labelled places, settings at the foot |
| Content | remaining | toolbar (52 px) on top, then the place |
| Panel (board places) | 320 px (352 px from 1600 px) | fixed slots, see §7 |

List pages (Play's home, Learn's path and catalog) centre a 880 px column. Radii:
`--r-1` 6 px (controls), `--r-2` 10 px (cards, rows), `--r-3` 14 px (sheets).

## 4. Colour

Neutral greys with a faint warmth, one accent, two signals.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #F7F6F3 | #191918 | content background |
| `--sidebar` | #EFEDE9 | #141413 | sidebar |
| `--surface` | #FFFFFF | #222220 | cards, panel, sheets |
| `--fill` | rgba(29,28,26,.05) | rgba(255,255,255,.06) | hover, selected rows, segmented track |
| `--line` | rgba(29,28,26,.09) | rgba(255,255,255,.08) | hairlines |
| `--text` | #1D1C1A | #EDEBE6 | primary text, **primary button** |
| `--text-2` | #5F5D58 | #A9A69F | secondary text |
| `--text-3` | #8F8C86 | #77746E | tertiary text, disabled |
| `--accent` | #34529A | #8EA6E0 | focus ring, selection, progress, board hints |
| `--good` | #2E7D4F | #6CC08F | correct, won |
| `--bad` | #B3402C | #E58A74 | wrong, lost, mistake markers |

**The primary action is ink, not colour**: a filled `--text` button with
`--surface` text. The accent marks attention (focus, the selected thing, a
hint on the board), never a call to action. At most one accent element
group per screen region.

## 5. The board

* **Surface.** One board (v9): a flat warm honey (#E5CB98 light) with a
  3 % centre-to-edge falloff. No grain, no alternative materials.
* **Lines.** Inner lines are whole device pixels (1 px at ≤ 30 px cells,
  2 px above on Retina), snapped to the pixel grid so they never blur. The
  outer frame is 1.6× the inner width. Line colour is 70 % ink, not black.
* **Star points.** Diameter 0.13 × cell.
* **Stones.** Diameter 0.95 × cell; a placement jitter of at most 1.5 % of a
  cell so neighbours never touch. Contact shadow: short (offset 0.08 r),
  soft, 25 % opacity — stones sit, they do not float.
* **Coordinates.** Outside the grid, 0.3 × cell (11–13 px), `--text-3`-like
  colour, tabular figures. On by default for 19×19 and 13×13.
* **Marks.** Last move: a small dot (0.2 × cell). Hints, cursor and the
  pending stone use the accent. Mistakes use `--bad`.

## 6. Components

* **Buttons** — heights 28 (sm), 32 (md), 40 (lg). Kinds: `primary` (ink),
  `secondary` (surface with hairline), `ghost` (text only, fill on hover),
  `danger` (text in `--bad`). Icon 16 px, gap 6 px, label weight 500.
* **Segmented control** — a `--fill` track; the selected segment is a raised
  surface chip. Used for 2–4 mutually exclusive options.
* **Rows** — lists are rows, not cards: 44 px minimum, hairline separators
  inside one rounded group (the macOS "inset grouped" list).
* **Cards** — only for things that are a unit of their own (the hero, a
  game). Surface, hairline, `--r-2`, no shadow at rest.
* **Sheets** — centred, `--r-3`, a soft shadow and a 30 % scrim; one primary
  action in the footer, right-aligned, Cancel to its left.
* **Menus** — surface, hairline, shadow, 4 px inset; items 30 px.
* **Icons** — one family (`src/web/js/app/icons.js`): 20 × 20 grid, 1.5 px
  stroke, round caps and joins, solid fills only for stones. 16 px in
  buttons, 18 px in the sidebar.

## 7. Screen compositions

* **Toolbar (every place).** Left: back / forward. Then breadcrumbs and the
  title. Right: the place's actions — at most one filled. On macOS the
  toolbar shares the row with the traffic lights and drags the window.
* **Play.** Board left, panel right. Panel slots from top: players (two
  rows: stone, name, level, captures, clock), status (one line), actions
  (Pass, Undo, More), the move list (fills the rest), never empty space.
  Game facts (size, komi, handicap, time) live in the toolbar subtitle.
* **Review (v9: also the post-game review).** When a game ends, its board
  turns into its review on the same page; a game opened from the history
  opens in the same view. Board left, panel right: the result line (the
  result, the game's facts, the change of the estimate), then the balance
  chart (the hero) and the analysis line; below them three tabs
  (segmented control): *Analysis* (up to three key moments, each
  expandable into its explained line, and variations; an offline estimate
  shows its turning points only, without a loss or a better move),
  *Summary* (the game in three phases — only when KataGo analysed the
  game) and *Notes* (comment, marks, variation tree). A key moment of a
  KataGo-analysed game of your own has *Try again*: the board goes to the
  position before it and the panel shows one card with KataGo's verdict
  (no primary in it). Tools (live analysis, territory, export image,
  Export SGF) are icon buttons in the toolbar; the one primary action is
  *New game* after a game you just played, *Play from here* otherwise. A
  record opens on its final position and moves to the first key moment
  when the analysis is there, unless the player has already moved. A
  classic opens on its famous move when it has one written for it; under
  its note, those moves are rows in the key-moment style (stone, title,
  move number and point on the right), the note shown only for the move on
  the board. v12: written moves only — the v11 rows made from KataGo's
  swings ("about 5 points lost") read as noise and were removed.
* **Today (v12, as before v9).** The app opens here. A date and a
  greeting; one hero — the game in progress or the suggested game — with
  the page's one primary button; one row for today's practice (what is
  next, done of total, *Start* / *Continue*; the placement quiz in its
  place before the first path); your level; this week in one line; the
  last three games. Nothing empty is shown as a card.
* **Play (v12).** The board. With no game on it: the suggested game (the
  one primary) and *New game* in the toolbar.
* **Practice (v9 Learn; v12 name).** One path chosen for you: a short ordered list of rows
  (5–8: the next lesson, reviews due, the week's focus, one stretch
  problem, the beginner bridges), each saying why it is there in a few
  words; the week's focus and its reason in one line above it. One primary
  (*Start* / *Continue*) plays the rows as one session; at the end a quiet
  "done for today". Below it, on the same page (v12; v9–v11 hid it one
  row away): the course as one group of unit rows, the problem topics as
  rows, the basic shapes as chips.
  A problem row shows its position as a small tile (v10), so rows that
  share a title look different. Before the first path, someone who knows
  the rules is offered the placement quiz in its place (v10): one card with
  the one primary (*Start*) and a quiet *Not now*; six problems, the toolbar
  saying which one; the grade it ends on sets where the course starts.
* **Library (v12; v9–v11 Play's home).** Toolbar holds Import. One
  column, no tabs, no primary: your games as compact rows with a
  thumbnail (filter and search only once the list is long; the first eight
  until *Show all*), the classics (four, then all 20), and one row that
  opens the opening explorer. A game or classic opens its review in the
  Library; Esc or the Library again comes back to the list. The player's games are analysed in the background by
  themselves; a row says so only while it is being analysed.
* **Settings.** A wide sheet with two panes: a source list on the left
  (General, Board, Playing, Data, About; the opponents' networks close the
  Playing pane; arrow keys
  move through it) and one pane on the right. Nothing scrolls past more
  than one pane's worth of rows.
* **Problems.** A problem window is widened towards the open side to at
  least eight lines, so stones keep a natural size and the corner keeps its
  surroundings.
* **New game.** The recommended game is pre-selected and *Start* is the
  only primary action; size cards (19×19 first and standard; 13×13 and 9×9
  as quicker games); opponent, strength and colour on one row each; time,
  handicap and komi under *More options*.

* **Unfinished games (v13).** Nothing replaces a game in progress
  silently. A game with at least one move of the player's and no result
  that New game, *Play from here* (a review, the explorer), onboarding or
  continuing another game would replace is first saved to the Library,
  where its row says *Unfinished*, and a toast says so. Opening it there
  continues it — the same record, opponent, colour, clock and rating
  setting — instead of opening its review; finishing it fills in that
  record. An unfinished game is not rated, does not count in the week, and
  is not analysed in the background until it is finished. This was chosen
  over a confirmation sheet ("Replace the game in progress?"): saving costs
  the player nothing and never interrupts, and a game saved by mistake is
  one Delete away. (Explicitly saved games without a result behave the
  same way.)
* **Safe state (v13).** When the app's own files cannot be read it shows
  one card in place of the app (no onboarding): what could not be read,
  *Retry* (the one primary, focused), *Continue read-only*, and *Start
  these files over* when the files were only damaged and a copy is kept;
  after *Continue read-only*, one quiet line above the page says changes
  are not saved, with *Retry*. The packaged app without its bridge shows
  the same card with *Retry*. See `docs/storage.md`.
* **Dangerous confirmations (v13).** A sheet that deletes or replaces
  something (delete a game, clear data, restore or undo a restore) opens
  with *Cancel* focused, so Enter alone never confirms it.

* **Less on screen (v8).** Every element has to serve playing or learning.
  The play panel says nothing before the first move but one quiet line;
  the review keeps its status (analysis, where the game left the book) on
  one line; there is no list of background work to manage. A new element in a release comes with one taken away.

## 8. Motion

| Token | Duration | Use |
| --- | --- | --- |
| `--dur-1` | 120 ms | hover, press |
| `--dur-2` | 200 ms | small enter/leave, menus |
| `--dur-3` | 320 ms | place change, sheets |

Easing `--ease-out` (cubic-bezier(.16,1,.3,1)) for entrances; nothing
bounces except a placed stone (140 ms settle). Captured stones lift off
and drift towards the capturer's lid in 260 ms. Everything respects `prefers-reduced-motion`.

## 9. Sound

Stone click on placement (≤ 40 ms attack), a softer click for captures,
nothing for UI. Volume is fixed relative to the stone (captures −6 dB,
result −3 dB). Sound can be turned off in Settings.

## 10. Visual acceptance checklist

Run for every screen at 1200 × 800, 1440 × 900 and 1920 × 1080, light and
dark, in all four languages, before every release:

- [ ] Exactly one filled (primary) button visible.
- [ ] Every edge aligns to the 8 px grid; no element is off by 1–3 px.
- [ ] Text uses only the type tokens; no bold (700) anywhere.
- [ ] The accent appears at most once per region and never on a button.
- [ ] No empty card, no dead space taller than 48 px inside a group (a panel footer anchored to the bottom is intended).
- [ ] No explanatory grey text visible that is not needed right now.
- [ ] Board lines are crisp at 1× and 2×; star points and stones to spec.
- [ ] Focus ring visible on every interactive element via keyboard.
- [ ] Contrast: body text ≥ 4.5:1, secondary ≥ 4.5:1, tertiary ≥ 3:1.
- [ ] Nothing truncates or wraps awkwardly in Korean, Japanese or Chinese.
- [ ] Reduced motion: nothing animates except opacity.

The automated part (`npm run ui-test`) checks contrast, primary-button
count, layout budgets and pixel baselines; the rest is a human pass.

Since v7 a cross check (`scripts/ui-tests/shell-cross.mjs`) visits every place
and page — Play's home, Learn and a problem, the explorer, a classic in
review (every tab), a finished game's post-game review (every tab), every
Settings pane — in four combinations of language, light/dark and larger text, and
runs the accessibility audit, the raw-key, clipping, sideways-scroll and
one-primary checks on each. A new page joins that list in the same change.
