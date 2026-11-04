# Goban Studio design specification (v4)

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

List pages (Today, Practice home, Library) centre a 880 px column. Radii:
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

* **Surface.** Three materials only:
  * *Plain* (default): a flat warm honey (#E5CB98 light) with a 3 %
    centre-to-edge falloff. No grain.
  * *Wood*: the kaya texture at 25 % strength over the plain colour — the
    grain is a whisper, never a stripe.
  * *Ink*: a deep charcoal board (#2C2D2B) with light lines, for dark rooms.
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
* **Review.** Board left, panel right: the balance chart (the hero), the
  analysis line, key mistakes (each expandable into its explained line),
  variations. Tools (live analysis, territory, guess, export) are icon
  buttons in the toolbar; *Play from here* is the one primary action.
* **Today.** One hero (continue the game, or the suggested game) with the
  only primary button; then a grouped list: today's five, next lesson,
  practise a weak spot; then your level with its sparkline. Empty states
  collapse to a single line instead of an empty card.
* **Practice.** Hero row for the next lesson with progress; today's five as
  a row; the course as grouped rows (title + check, no step counts); the
  problem topics as a grid of quiet tiles.
* **Library.** Toolbar holds Import. Segmented tabs; games as rows with a
  thumbnail; classics and openings as rows.
* **Report (v6).** A list-page column: the result as the page title with
  the facts (result, rules, komi, size) under it; the three phases as one
  table (only from KataGo — with the offline estimate a single plain
  sentence instead); three key moments as small boards; then one card whose
  button is the only primary action (*Practise this game*). *Export image*
  is a quiet button in the toolbar.
* **New game.** The recommended game is pre-selected and *Start* is the
  only primary action; size cards (19×19 first and standard; 13×13 and 9×9
  as quicker games); opponent, strength and colour on one row each; time,
  handicap and komi under *More options*.

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
