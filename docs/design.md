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
| `--t-label` | 13 / 18 | 500 | the one strong line of a row or a name |

Rules: weights are 400, 500 (labels, buttons) and 600 (headings) only.
Hierarchy comes from weight and colour (`--text`, `--text-2`, `--text-3`)
before size. Numbers that change (clocks, captures, scores, move counts) use
tabular figures. Nothing below 11 px. With **Larger text** every token but
`--t-label` goes one step up (31/38, 22/28, 17/24, 15/22, 16/25, 14/20,
12/16).

## 3. Space and layout

An 8 px grid with a 4 px half-step. The three smallest steps are for the
inside of a control (an icon and its label, the track of a segmented
control), never for the distance between two things on a page.

| Token | Value | Use |
| --- | --- | --- |
| `--s-05` | 2 px | between segments, tools and stacked lines of one row |
| `--s-1` | 4 px | inside a control; a menu's inset |
| `--s-15` | 6 px | an icon and its label |
| `--s-2` | 8 px | between controls |
| `--s-25` | 10 px | a control's side padding |
| `--s-3` | 12 px | inside a row or a small card |
| `--s-4` | 16 px | a card's padding; the panel's rhythm |
| `--s-5` | 24 px | a page's side margin; between groups |
| `--s-6` | 32 px | between sections |
| `--s-7` | 48 px | an empty state's breathing room |
| `--s-8` | 64 px | the foot of a page |

The window has three columns:

| Region | Width | Notes |
| --- | --- | --- |
| Sidebar | 216 px (64 px below 1080 px window width) | labelled places, settings at the foot |
| Content | remaining | toolbar (52 px) on top, then the place |
| Panel (board places) | 320 px (352 px from 1600 px) | fixed slots, see §7 |

List pages (Play's home, Practice's path and catalog) centre a 880 px column
(`--page`); `--sb`, `--panel` and `--tb` are the sidebar, the panel and the
toolbar of the table above.

| Token | Value | Use |
| --- | --- | --- |
| `--r-0` | 4 px | the board, thumbnails, keys, cells of a list inside a panel |
| `--r-1` | 6 px | controls |
| `--r-2` | 10 px | cards, rows, menus |
| `--r-3` | 14 px | sheets |
| `--r-pill` | 999 px | bars and switches: fully round at any height |

What sits above the page is in one of seven layers:

| Token | Value | Use |
| --- | --- | --- |
| `--z-raised` | 1 | a sticky row of actions inside the panel |
| `--z-tip` | 5 | the chart's hover card |
| `--z-menu` | 40 | menus |
| `--z-tooltip` | 45 | a tool's name |
| `--z-sheet` | 50 | the scrim and its sheet |
| `--z-cover` | 60 | onboarding |
| `--z-toast` | 70 | toasts |

## 4. Colour

Neutral greys with a faint warmth, one accent, two signals.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #F7F6F3 | #191918 | content background |
| `--sidebar` | #EFEDE9 | #141413 | sidebar |
| `--surface` | #FFFFFF | #222220 | cards, panel, sheets |
| `--fill` | rgba(29,28,26,.05) | rgba(255,255,255,.06) | hover, selected rows, segmented track |
| `--fill-2` | rgba(29,28,26,.09) | rgba(255,255,255,.1) | the selected row, empty tracks |
| `--line` | rgba(29,28,26,.09) | rgba(255,255,255,.08) | hairlines |
| `--line-2` | rgba(29,28,26,.16) | rgba(255,255,255,.15) | the border of a control |
| `--text` | #1D1C1A | #EDEBE6 | primary text, **primary button** |
| `--text-2` | #5F5D58 | #A9A69F | secondary text |
| `--text-3` | #6C6964 | #9C988F | tertiary text, disabled (≥ 4.5:1 on every background it is used on) |
| `--on-primary` | #FFFFFF | #191918 | text on the primary button and on a toast |
| `--accent` | #34529A | #8EA6E0 | focus ring, selection, progress, board hints |
| `--accent-soft` | rgba(52,82,154,.1) | rgba(142,166,224,.14) | the ground of a selected tool or a line being tried |
| `--good` | #2E7D4F | #6CC08F | correct, won |
| `--good-soft` | rgba(46,125,79,.1) | rgba(108,192,143,.13) | a finished unit's number |
| `--bad` | #B3402C | #E58A74 | wrong, lost, mistake markers |
| `--bad-soft` | rgba(179,64,44,.09) | rgba(229,138,116,.13) | the ground of an error notice |
| `--on-bad` | #FFFFFF | #1B1A17 | text on a `--bad` fill (an error toast, the solid danger button): 5.7:1 and 6.8:1 |
| `--inv-good` | #6CC08F | #2E7D4F | the success mark on a toast, whose background is the inverse of the page (`--text`) |
| `--inv-warn` | #E3B04B | #8A5A00 | the warning mark on a toast |
| `--scrim` | rgba(20,19,17,.3) | rgba(0,0,0,.5) | behind a sheet |

**The primary action is ink, not colour**: a filled `--text` button with
`--surface` text. The accent marks attention (focus, the selected thing, a
hint on the board), never a call to action. At most one accent element
group per screen region.

Elevation is three shadows that lift and a few rings that mark; nothing
else casts a shadow.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--shadow-board` | 0 0 0 1px rgba(60,40,12,.1), 0 1px 2px rgba(60,40,12,.12), 0 12px 24px -14px rgba(60,40,12,.4) | 0 0 0 1px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.4), 0 12px 24px -14px rgba(0,0,0,.75) | the board on its stage: close to the table |
| `--shadow-pop` | 0 0 0 1px rgba(0,0,0,.06), 0 8px 24px -6px rgba(0,0,0,.18) | 0 0 0 1px rgba(255,255,255,.08), 0 8px 24px -6px rgba(0,0,0,.6) | menus, toasts, the bar floating over the board |
| `--shadow-sheet` | 0 0 0 1px rgba(0,0,0,.06), 0 24px 64px -16px rgba(0,0,0,.32) | 0 0 0 1px rgba(255,255,255,.08), 0 24px 64px -16px rgba(0,0,0,.7) | sheets |
| `--shadow-raised` | 0 0 0 .5px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.08) | none | the selected segment |
| `--shadow-knob` | 0 1px 2px rgba(0,0,0,.25) | 0 1px 2px rgba(0,0,0,.25) | a switch's knob |
| `--ring-selected` | 0 0 0 1px var(--text) | 0 0 0 1px var(--text) | the chosen card (its border, doubled) |
| `--ring-line` | 0 0 0 1px var(--line-2) | 0 0 0 1px var(--line-2) | the running clock |
| `--ring-track` | inset 0 0 0 1px var(--line) | 0 0 0 1px rgba(255,255,255,.14) | the win-rate bar |
| `--ring-inset` | inset 0 0 0 1.5px | inset 0 0 0 1.5px | an outlined letter in the explorer; a colour follows |

The board and what is drawn like it have their own colours. The script
(`theme.js`) sets the first six for the theme and the board style in
force; the table gives the light standard palette.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--board` | #E4CB9A | #E4CB9A | the board's wood (set by the script) |
| `--thumb-board` | #E4CB9A | #E4CB9A | thumbnails and tiles (set by the script) |
| `--thumb-line` | rgba(60,40,20,.42) | rgba(60,40,20,.42) | their lines (set by the script) |
| `--stone-black` | #1D1D1B | #1D1D1B | a black stone in an SVG mark (set by the script) |
| `--stone-white` | #F7F4EC | #F7F4EC | a white stone in an SVG mark (set by the script) |
| `--stone-rim` | rgba(40,27,12,.5) | rgba(40,27,12,.5) | its rim (set by the script) |
| `--stone-fill-black` | radial-gradient(circle at 35% 30%, #55534F, #121211 70%) | radial-gradient(circle at 35% 30%, #55534F, #121211 70%) | the inline stone beside a name |
| `--stone-fill-white` | radial-gradient(circle at 35% 30%, #FFF, #E9E6DE 75%) | radial-gradient(circle at 35% 30%, #FFF, #E9E6DE 75%) | the inline stone beside a name |
| `--stone-edge-black` | none | inset 0 0 0 .75px rgba(255,255,255,.28) | so a black stone shows on a dark ground |
| `--stone-edge-white` | inset 0 0 0 .75px rgba(0,0,0,.22) | inset 0 0 0 .75px rgba(0,0,0,.22) | so a white stone shows on a light ground |
| `--tile-black` | #1B1A17 | #1B1A17 | stones on a problem's tile |
| `--tile-white` | #FBF8F1 | #FBF8F1 | stones on a problem's tile |
| `--tile-rim` | rgba(27,26,23,.45) | rgba(27,26,23,.45) | a white tile stone's rim |
| `--eval-black` | #23221F | #4A4843 | Black's share of the win-rate bar |
| `--eval-white` | #E9E6DE | #E9E6DE | White's share |
| `--knob` | #FFF | #FFF | a switch's knob |

## 5. The board

* **Surface.** One board: a warm honey (#E4CB9A) in straight-grained
  wood (fine grain and broad bands within a few per cent of the base,
  drawn once per size by `src/web/js/board-surface.js`) with a faint
  centre-to-edge falloff. No alternative materials. In the dark theme it is
  the same wood under a lamp in a dark room: lower luminance but its warmth
  and saturation kept (#9E7E4E), the light falling off towards the edges,
  white stones toned down only about 6 %, black stones parting from the
  wood by contrast alone (no rim on the board; thumbnails keep one),
  signals on the board as light tints. Black stones stand at ≥ 3:1 and
  white at ≥ 2:1 against it. The grid, star points, last-move ring and
  hover preview take their sizes from the cell (`board-surface.js`).
  All board colours live in one place, `src/web/js/theme.js`; the board,
  thumbnails, the New game size cards, a hero's empty board and the app's
  mark in the sidebar read it, and follow the theme live (also when
  *System* switches while the app is open).
* **High contrast (Settings → Board).** One optional style for bright or
  dim rooms and low vision: a plain near-white (light) or near-black (dark)
  surface, full-strength lines 1.5× as heavy, flat stones with clear rims
  (the white stone's rim on white, the black stone's on black), no sprites
  and no shadows. Used by itself when the system forces colours (Windows
  high contrast).
* **Lines.** Inner lines are whole device pixels (1 px at ≤ 30 px cells,
  2 px above on Retina), snapped to the pixel grid so they never blur. The
  outer frame is 1.6× the inner width. Line colour is 70 % ink, not black.
* **Star points.** Diameter 0.13 × cell.
* **Stones.** Diameter 0.95 × cell; a placement jitter of at most 1.5 % of a
  cell so neighbours never touch. Contact shadow: short (offset 0.08 r),
  soft, 25 % opacity — stones sit, they do not float.
* **Coordinates.** Outside the grid, 0.3 × cell (11–13 px), `--text-3`-like
  colour, each centred on its line. On by default for 19×19 and 13×13.
* **Marks.** Last move: a thin ring on the stone, 0.4 × cell across, its
  line 5 % of a cell and never under 1.25 px, in the stone's opposite tone
  (light on black, dark on white) — it reads on both colours in every
  palette where a filled dot sat heavily on a white stone; a numbered stone
  carries no ring; Settings → Board can leave it out. Hints, cursor and the
  pending stone use the accent. Mistakes use `--bad`. A mark on a white
  stone uses the light theme's signal colours and on a black stone the dark
  theme's, whatever the board.
* **Thumbnails.** One renderer (`src/web/js/thumb.js`) for every small
  board (Library and Today rows 44 px, heroes 96 px, the chart's hover
  76 px, path tiles 32 px), drawn at device pixels in the board's colours
  and cached. What is drawn follows the cell size, not the board size:
  cells are whole device pixels; grid lines (one device pixel) appear from
  4 px a cell and star points from 8 px; stones are flat discs that fill
  their cell (crisp squares under 4 px), and a white stone always has a
  hairline rim drawn around it, so a 19×19 at 44 px still reads at 1× and
  2×.

## 6. Components

* **Buttons** — heights 28 (sm), 32 (md), 40 (lg). Kinds: `primary` (ink),
  `secondary` (surface with hairline), `ghost` (text only, fill on hover),
  `danger` (text in `--bad`). Icon 16 px, gap 6 px, label weight 500.
* **Danger, solid** — only inside a confirmation of something that cannot
  be undone (clear all data, restore a backup): a `--bad` fill with
  `--on-bad` text. What can be undone is not confirmed: it happens, and a
  toast offers **Undo**.
* **Toasts** — one line at the bottom centre, on the inverse of the page
  (`--text` with `--on-primary`). Four tones: info (no mark), success (a
  check in `--inv-good`), warning (a triangle in `--inv-warn`) and error
  (`--bad` fill, `--on-bad` text). Each has a close button; at most one
  action ("Undo"); at most three on screen. Info, success and warning go
  after a time that follows the length of the text (3 s at least, 8 s with
  an action) and wait while pointed at or focused; an error stays until it
  is closed. A plain message never blocks the board under it.
* **Loading and errors** — nothing for the first 300 ms; then one quiet
  line with a small spinner; on failure one sentence and **Retry**, where
  the click was. A view that cannot be shown is replaced by the error card
  (a sentence, **Try again**, **Go to Today**), never left half drawn.
* **Segmented control** — a `--fill` track; the selected segment is a raised
  surface chip (`--shadow-raised`; a `--fill-2` chip in the dark theme). Used for 2–4 mutually exclusive options.
* **Rows** — lists are rows, not cards: 44 px minimum, hairline separators
  inside one rounded group (the macOS "inset grouped" list).
* **Cards** — only for things that are a unit of their own (the hero, a
  game). Surface, hairline, `--r-2`, no shadow at rest.
* **Sheets** — centred, `--r-3`, `--shadow-sheet` and the `--scrim`; one primary
  action in the footer, right-aligned, Cancel to its left.
* **Menus** — surface, `--shadow-pop`, `--r-2`, a `--s-1` inset; items 30 px.
  A menu of choices (an order) opens from a quiet button that names the
  choice in force, and checks it in the list.
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
  *More* holds Redo, Hint, Review so far, Count, Save, Export SGF, Focus
  mode and Resign. ← and → do nothing during a game: looking back is
  *Review so far*, chosen from the menu, and that review's one primary is
  *Back to the game*.
* **Undo, redo and the unrated game.** Undo takes back the player's move
  with the computer's reply to it; Redo (the menu, ⇧⌘Z) plays the same
  moves again, the reply included, until a new move is played. An undo
  that is redone leaves no trace. The first undo or hint of a rated game
  says once, in an info toast, that the game will not be rated; the result
  card and the review's result line then say why in one phrase ("Not
  rated: you took back moves").
* **Passing.** No sheet. The first pass of a game is asked in the panel,
  where the actions were: one sentence, *Pass* (the primary, focused) and
  *Cancel*; Esc or a move on the board takes the question away, and the
  shortcut pressed again confirms it. Later passes are played at once: the
  status line says who passed ("You passed · …") and Undo takes it back.
  A pass that answers a pass ends the game, so it is asked the same way;
  the count is then one step away, and *Resume play* in the count undoes
  it. In focus mode (no panel) the question floats over the board.
* **The count.** The board shows the count itself: a small square of each
  side's colour on every point of its territory, dead stones faded; a
  click on a group marks it dead or alive. The card beside it has both
  totals with what they are made of, the result, one line saying what the
  board shows, *Confirm* (the primary) and *Resume play*. After a game
  that was counted, the review's result line has a small menu with *Count
  again*: the same card over the final position, with *Confirm the new
  count* and *Cancel*; the panel's own primary is hidden meanwhile. The
  new result replaces the stored one and the game's rating step (never a
  second step); a rated game can be counted again only until another game
  on that board size is rated.
* **Review (also the post-game review).** When a game ends, its board
  turns into its review on the same page; a game opened from the history
  opens in the same view. Board left, panel right: the result line (the
  result, the game's facts, the change of the estimate or why the game
  was not rated), then the balance chart (the hero) and the analysis line;
  below them three tabs (segmented control): *Analysis* (up to three key
  moments, each expandable into its explained line, and variations; an
  offline estimate shows its turning points only, without a loss or a
  better move), *Summary* (the game in three phases — only when KataGo
  analysed the game) and *Notes* (comment, marks, variation tree, and two
  small Undo / Redo buttons for the edits). A key moment of a
  KataGo-analysed game of your own has *Try again*: the board goes to the
  position before it and the panel shows one card with KataGo's verdict
  (no primary in it). The one primary action is *New game* after a game
  you just played, *Back to the game* in "Review so far", *Continue* for
  an unfinished game looked at from the Library, *Play from here*
  otherwise. A record opens on its final position and moves to the first
  key moment when the analysis is there, unless the player has already
  moved. A classic opens on its famous move when it has one written for
  it; under its note, those moves are rows in the key-moment style (stone,
  title, move number and point on the right), the note shown only for the
  move on the board.
* **Review: a line being tried.** A stone played on the review board is
  not an edit: it starts a line being tried, and one quiet bar in the
  panel says so — "Trying a variation · Keep · Discard" (accent-soft, the
  variation bar's look). ← and → stay inside the line, from the position
  it left to its last move; Esc, Discard or moving anywhere else returns
  to that position and drops it. Keep makes it a variation of the record,
  saved at once. A line that was not kept is never saved. Outside a line
  ← and → follow the main line (or the kept variation the board is in).
* **Review: edits can be undone.** Comments, marks, clearing marks,
  keeping, promoting and deleting a variation go through one edit history:
  ⌘Z / ⇧⌘Z while a review is on screen (in a game ⌘Z is still "undo
  move"), and the two buttons in *Notes*. Removing something is not
  confirmed: it happens, and a toast says "Variation deleted · Undo" or
  "Marks cleared · Undo". A comment is written when its box loses the
  focus and when the app quits, not only on a timer.
* **Review: the toolbar.** Icon-only tools, each with its own picture and
  its name shown under it on hover (after a third of a second) and on
  keyboard focus (at once), on the inverse of the page like a toast: live
  analysis (sparkle), territory (eye), export image (a picture), Export
  SGF (an arrow out of a box), close (×). Importing is a third picture (an
  arrow into a tray), used by the Library's Import.
* **The free board.** *Open board* in the Library's toolbar opens an
  empty board in the review's layout: Black and White alternate, a stone
  is the record itself (no line being tried), stepping back and playing
  elsewhere makes a variation, ⌘Z takes a stone back. The panel: what it
  is in one line, the size (9 / 13 / 19, while the board is empty), the
  position's estimate when live analysis is on, notes and the tree. One
  primary: *Save to Library* (then *Play from here*). A saved board is a
  row of the Library named "Free board"; it is not a game to continue.
* **Today.** The app opens here. A date and a greeting; one hero — the
  game in progress or the suggested game — with the page's one primary
  button; one row for today's practice (the next row of the path, done of
  total, *Start* / *Continue*; the placement quiz in its place before the
  first path). Then *Your progress*, one group of rows, each a line of
  words on the left and a small picture on the right, the pictures ending
  on one edge: the level (the estimate with its ±, and from three rated
  games its line over the newest forty with the change in words, "up
  about 2 ranks over 30 days" — honest ≈, no axis); what is mastered (a
  thin bar in three parts — mastered, learning, not started — and, on
  click, the same bar theme by theme); the last four weeks as 28 dots, a
  day practised or not (never a streak, never a count of days missed);
  and the newest milestones, three at most, as plain lines with their
  dates. A row with nothing to show is left out, and with no row the
  whole group is: a new player sees no empty chart. Then this week in one
  line — a part that is zero is not said — and the last three games. A
  milestone reached is said once, in one success toast.
  On the first day too: after onboarding every new player lands on Today,
  never straight on a board or in a lesson, and the hero is what the
  onboarding answer asked for, one click away: lesson one for someone who
  never played (*Start here*), the gentlest 9×9 game for someone who knows
  the rules, an even 19×19 game for a player. After three finished 9×9
  games a beginner's suggested game is 13×13, and two games there come
  before 19×19; the quieter second offer beside the hero is the next board
  up (a quick 9×9 beside the full board).
* **Onboarding.** Three short steps on a plain page: the language; *Have
  you played Go before?* (three answers); for a player, a level. One quiet
  line at the foot: offline on the first step, then which rules new games
  use (those of the language: Chinese rules in Chinese, Korean in Korean,
  Japanese otherwise) and that Settings changes it.
* **Narrow windows (720–860 px).** A board place keeps the board on top
  and turns its panel into a compact bar under it, so nothing needed is
  below the fold and nothing scrolls: in a game the two players side by
  side with their clocks, then the status with *Pass*, *Undo* and *More*
  on one row, and the move list behind a disclosure (*Moves*); in a lesson
  or a problem the text or goal with its buttons, the buttons staying in
  view when a long text scrolls. The panel's own title is dropped (the
  toolbar names the place). The bar is at most 46 % of the height.
* **Play (v12).** The board. With no game on it: the suggested game (the
  one primary) and *New game* in the toolbar. v13: "no game on it" is
  literal — with nothing saved, Play opens on that home (the suggested
  game with its handicap), not on a blank board against the last chosen
  rank; a game restored at launch with no move of the player's yet (only
  the computer moved) also leaves Play on its home, while a game started
  in this session stays on the board. Today's hero and Play's *Continue*
  use the same rule as unfinished games below.
* **The computer's move (v13).** When the engine cannot give one, the
  offline engine plays it; when that fails too, the panel says so and
  offers *Retry* (the one primary). The game is never left waiting on the
  computer with nothing to press.
* **Practice.** One path chosen for you: a short ordered list of rows
  (the next lesson, reviews due, the week's focus, one stretch problem,
  new problems, the beginner bridges). Problems that follow one another
  with the same theme and reason are one row, named after the theme with
  its count ("Ladders · 4 problems") and showing up to four positions as
  small tiles on the right; a row part done says "1 / 4". Each row says
  why it is there in the model's own terms: *Due for review*, what your
  games showed ("Came up 3 times in your last 4 games"), *A step up*,
  *New at your level*, then how hard it is. Above the rows: the week's
  focus in one line (its evidence there only when no row says it), and
  one quiet line with the review load on the left ("4 to review today ·
  37 mastered", zero parts left out) and the day's size on the right — a
  small segmented control, 3 / 5 / 10. One primary (*Start* / *Continue*)
  plays the rows as one session; at the end a quiet "done for today".
  Below it, on the same page: the course as one group of unit rows, the
  problem topics as rows, the basic shapes as chips. Before the first
  path, someone who knows the rules is offered the placement quiz in its
  place: one card with the one primary (*Start*) and a quiet *Not now*;
  10–12 problems, the toolbar saying which one; its result is a
  difficulty and the ranks it is meant for ("You start at Level 2
  (≈ 18–14 kyu)").
* **Library.** The toolbar holds *Open board* (quiet), *Import SGF* and a
  small menu beside it (Choose files…, Paste SGF). One column, no tabs, no
  primary, three sections:
  *My games* — first the games left unfinished, a group of their own under
  a small heading (three rows, then *Show all*; each row says *Continue*
  in the accent colour, and its menu has *Look at it*, Export SGF and
  Delete; with more than three, a quiet *Clear unfinished games…* at the
  heading's right, which asks first); then the finished games and records
  as compact rows with a thumbnail (the first eight until *Show all*).
  From six games on, one line above the list has the filter chips, the
  search field and the order: a quiet button that names the order in
  force and opens a menu (newest, oldest, by result), never a native
  select. A row says the
  title (the opponent, or the record's name), then on one line when
  ("Today", "Yesterday", "3 days ago" within the week, then the date), the
  board, the moves, who played when the title does not say, and — quietly,
  for a game KataGo analysed — its biggest swing; the result on the right.
  *Openings and joseki* — its own titled section with one line saying
  what it is, and two rows: the whole board, the corner.
  *Classics* — four, then all 20.
  A game or classic opens its review in the Library; Esc or the Library
  again comes back to the list. The player's games are analysed in the
  background by themselves; a row says so only while it is being analysed.
* **Importing.** One record opens in the review. Several files (picked,
  or dropped on the window) are all imported and the Library stays on
  screen: one toast, "Imported 5 games", with *Undo*. A file with several
  games opens a sheet that lists them (players or "Problem 12", date,
  board, moves, result), fifty to a page, each row opening its game, with
  *Import all* as the primary (asked first above fifty). ⌘V on the list,
  or *Paste SGF*, imports a record from the clipboard. Whatever the import
  has to say is all shown: one warning in the toast itself; more, or files
  that could not be read, behind the toast's *Details* — a sheet listing
  each with its file's name, with *Undo import*.
* **The opening explorer.** Board left, panel right; the book's
  continuations carry letters on the board and head the rows of the
  panel. A row says what kind of move it is, and what it loses only when
  that is half a point or more; the win rate only for a move that loses
  something or a live candidate; the search count only while a live
  search runs, never "0". A balance within half a point reads "about
  even".
* **The sidebar's status line.** Above Settings, only when there is
  something to say: an update ready to install, an update or a network
  being downloaded ("Downloading 42%"), or an update to download. One
  quiet row with a small accent icon; a click opens the Settings pane that
  handles it.
* **A topic.** A grid of positions, grouped by difficulty (the first
  group with something unsolved is open; its header says done of total).
  A tile is the problem's corner of the board, drawn sharp at any size:
  board edges where the position touches them, the stones the goal is
  about with a small dot. Under it: who plays, its number, its name once
  solved, and one quiet mark of its state — nothing (not tried), a ring
  (tried), a check (solved), a turning arrow (due for review), a filled
  check (mastered); the same in words for a screen reader. Arrow keys
  move through the grid, which is one tab stop; Enter opens. Tiles draw
  as they come near the screen.
* **Difficulty.** Five levels, called *Level 1* … *Level 5* (难度 1–5)
  with the five-dot meter, never a word that reads as a rank or a class
  of player; where it helps, the ranks a level is meant for, marked ≈
  (1: 30–19 kyu, 2: 18–14, 3: 13–11, 4: 10–7, 5: 6 kyu and stronger).
* **A problem's name.** The name of a shape or technique is most of the
  answer, so it is not shown before the problem is solved or its answer
  shown: the panel's heading is the goal ("Black to play: kill"), the
  toolbar says *Problem*, lists and tiles show the name only of a problem
  the player has solved, and the placement quiz and every review follow
  the same rule. Once solved, the name is the result line ("This problem:
  Straight three") and the toolbar's title, and its theme joins the
  facts. A hint may name the technique: asking for one is a choice. After
  a miss the panel says when the problem comes back ("It comes back
  tomorrow").
* **Going on.** Nothing in a lesson or a session goes on by itself: a
  solved step keeps its feedback until *Continue* or Enter, and Enter is
  the primary button of a finished problem or drill too (also with the
  board focused). A lesson step with its own goal says it in the goal
  line.
* **Settings.** A wide sheet with two panes: a source list on the left
  (arrow keys move through it) and one pane on the right. No pane is
  taller than the sheet — at 1200 × 800, in four languages, with larger
  text (`scripts/ui-tests/shell-settings.mjs`); a pane that would grow past
  it is split. Choices are segmented controls, switches and buttons, never
  a native select. The panes:
  *General* — language; theme and larger text; sound (Off / Quiet / Normal
  / Loud; a change plays one stone at the new level).
  *Board* — Standard or High contrast, coordinates, move numbers, the
  last-move mark; confirming moves in games and in problems (one pair,
  phrased alike).
  *Playing* — teaching mode, the balance while playing, live analysis in
  review, matching the opponent to your level; the rules for new games,
  with what they mean in one line.
  *You* — one row for your level: the estimate with its ±, and *Change…*,
  which asks the level question again in a sheet of its own (Save and
  Cancel both come back here); one line says where the estimate comes from
  and what ± means. Then the daily practice size (3 / 5 / 10).
  *Engines* — what plays now, and the optional KataGo networks with their
  progress.
  *Data* — backup and restore; *Undo the last restore* for 30 days or until
  a backup is exported (the undo can itself be undone); the data folder
  (*Show data folder*, the packaged app only, with what uninstalling
  leaves); erase all data.
  *About* — version, the offline line, licences; updates; shortcuts.
* **Problems.** A problem window is widened towards the open side to at
  least eight lines, so stones keep a natural size and the corner keeps its
  surroundings.
* **New game.** The recommended game is pre-selected and *Start* is the
  only primary action; size cards labelled by what they are (19×19, the
  standard board, about an hour; 13×13, about 25 minutes; 9×9, quick, about
  10 minutes); opponent, strength, colour and the clock on one row each;
  handicap, komi and rules under *More options*, whose closed row sums
  them up.

* **Unfinished games.** Nothing replaces a game in progress silently. A
  game without a result that New game, *Play from here* (a review, the
  explorer), onboarding or continuing another game would replace is first
  saved to the Library, in its group of unfinished games, and a toast says
  so. It takes two moves of the player's to be kept: a single stray click
  does not make a row. Opening its row continues it — the same record,
  opponent, colour, clock and rating setting; *Look at it* in the row's
  menu opens it in the review instead, without touching the game on the
  board. Finishing it fills in that record. An unfinished game is not
  rated, does not count in the week, and is not analysed in the background
  until it is finished. This was chosen over a confirmation sheet
  ("Replace the game in progress?"): saving costs the player nothing and
  never interrupts, and a game saved by mistake is one Delete away.
  (Explicitly saved games without a result behave the same way.)
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
| `--ease-out` | cubic-bezier(.16,1,.3,1) | every entrance (`--ease` is the same curve) |

Nothing
bounces except a placed stone (140 ms settle). Captured stones lift off
and drift towards the capturer's lid in 260 ms. Everything respects `prefers-reduced-motion`.

## 9. Sound

Stone click on placement (≤ 40 ms attack), a softer click for captures,
nothing for UI. Levels are fixed relative to the stone (captures −6 dB,
result −3 dB). The volume is a setting (Settings → General): Off, Quiet
(about −10 dB), Normal and Loud; changing it plays one stone at the new
level.

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
- [ ] Contrast: body, secondary and tertiary text ≥ 4.5:1 (large text ≥ 3:1; v13, was 3:1 for tertiary).
- [ ] Windows high contrast (forced colours): focus, buttons and the selected choice stay visible (v13 `@media (forced-colors: active)`).
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
`scripts/ui-tests/shell-audit.mjs` adds the audit of (Play's home for a new player,
the confirm-move switches, *Undo restore*, the safe state, *Retry* and a
problem shown turned, in four languages), and the audit asks 4.5:1 of small text.
