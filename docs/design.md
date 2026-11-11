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
| `--text-3` | #6C6964 | #8E8A82 | tertiary text, disabled (v13: ≥ 4.5:1 on every page background) |
| `--accent` | #34529A | #8EA6E0 | focus ring, selection, progress, board hints |
| `--good` | #2E7D4F | #6CC08F | correct, won |
| `--bad` | #B3402C | #E58A74 | wrong, lost, mistake markers |
| `--on-bad` | #FFFFFF | #1B1A17 | text on a `--bad` fill (an error toast, the solid danger button): 5.7:1 and 6.8:1 |
| `--inv-good`, `--inv-warn` | #6CC08F, #E3B04B | #2E7D4F, #8A5A00 | the success and warning marks on a toast, whose background is the inverse of the page (`--text`) |

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
* **Today (v12, as before v9).** The app opens here. A date and a
  greeting; one hero — the game in progress or the suggested game — with
  the page's one primary button; one row for today's practice (what is
  next, done of total, *Start* / *Continue*; the placement quiz in its
  place before the first path); your level; this week in one line; the
  last three games. Nothing empty is shown as a card.
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
  search field and the order (newest, oldest, by result). A row says the
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
v13 adds `scripts/ui-tests/shell-v13ui.mjs` (Play's home for a new player,
the confirm-move switches, *Undo restore*, the safe state, *Retry* and a
problem shown turned, in four languages), and the audit asks 4.5:1 of small text.
