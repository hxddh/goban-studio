# Lesson audit (v8): the course checked with KataGo

The course's problem steps are proved by the solver (`node
scripts/check-course.mjs`). Its "place" steps (one click, a set of accepted
points) and its "read" steps (a short explanation over a board) state ideas
the solver cannot judge: where to play in the opening, which side is bigger,
which point is sente. This audit checks them with KataGo.

`scripts/check-lessons-katago.mjs` runs KataGo's analysis engine on every
step with a board. `.github/workflows/lesson-check.yml` runs it on GitHub
runners for pushes to `check/**` branches (official KataGo 1.18.1 Eigen AVX2
build, the stronger network pinned in `src/models.zig`, both SHA-256
checked) and commits the result back: `docs/lesson-audit.json` (every value)
and the generated section at the end of this file.

## Since the latest run

The generated section at the end of this file is the run of 2026-11-18
(v17), the first with the stronger network (kata1-b18c384nbt) and the
first since the v13 units were written: every unit of the course, 134
place steps and 73 read steps with a board, against the current step
numbers.

What it found, against the previous run (g170e-b15c192, 107 place
steps):

- **Seven steps with an accepted point that loses more than 2.5 points**
  (twelve before). Six are the cases already left below, now measured by
  the stronger network: the toy 9×9 shape and connection boards
  (connect-hanging#1, game-opening#2 and #3, shape-bamboo#1 and #2) and
  joseki-33-white#3. The seventh is new: adv-open-urgent (next entry).
- **adv-open-urgent: the position does not show its idea.** The lesson
  says the life of the small black group in the lower left (A, the 1-1
  point) comes before the empty lower right corner (B). KataGo disagrees
  in both its steps: the read step's claim (A -36.5, B -31.5 for Black)
  and the place step (A1 is 5.4 points behind Q3). Five stones in the
  corner are worth less here than the corner taken first. The idea is
  sound and the corner shape is proved by the solver; the board needs a
  bigger group (or a smaller big point) so that the urgent point is also
  the bigger one. Left for a redesign with a strong player, then a run.
- The rule steps (stones-*) are reported only, as before.

## Method

- **Place steps.** Every accepted point, KataGo's best move on the whole
  board and its best move in the step's local area are played, and the
  position after each is searched with the same number of visits. Each
  move's value is the score lead for the side that played it, so all
  moves are compared on the same footing.
- **The step's view.** On a toy board (a few stones on an empty 19×19) the
  engine's whole-board best is usually an empty corner the lesson is not
  about. Each lesson therefore has a view: *whole* (lessons about choosing
  between areas: big points, the opening review, whole-board judgement),
  *local* (one corner, a shape, an endgame or fight: the diagram's window,
  or a box around the accepted points, leaving out empty corners the step
  does not play in) or *rule* (placing stones, liberties, ko: reported, never
  judged).
- **Verdicts.** An accepted point within 1.5 points of the best move of the
  view is fine, 1.5 to 2.5 points is doubtful, and more than 2.5 points
  loses. A move of the view at least as good as the best accepted point
  (within 0.3) that is not accepted is listed as an equal alternative.
- **Read steps.** A factual claim (a score, a dead or alive group, one move
  bigger than another, a move that must be answered) is checked with the
  score lead, ownership, the two moves' values or the best reply. Every
  other read step is listed for human review with the reason.
- **Being conservative.** On 9×9 and in local positions the engine's best
  is noisy, and a lesson teaches the standard idea, not the engine's
  favourite. Content changes only where KataGo clearly disagrees; every
  other disagreement is listed below with the reason it was left.

## Runs

| run | what | runner time |
| --- | --- | --- |
| [41957657141](https://github.com/hxddh/goban-studio/actions/runs/41957657141) | the course as it was: 107 place steps, 51 read steps with a board (16 claims) | 12 shards, 286 job-minutes (longest shard 35 min) |
| 41963580886 | cancelled after a minute by the next push (one more content fix) | – |
| [41963685718](https://github.com/hxddh/goban-studio/actions/runs/41963685718) | the course after the changes below ("Latest run") | 12 shards, 281 job-minutes (longest shard 32 min) |

Run 41957657141 found accepted points that lose more than 2.5 points in
21 steps (12 after the changes, all listed below as left), doubtful
points in 7 (10 after: some former losses are now only doubtful), and 5
failed read claims (2 after, both toy endgame boards).

Values below are from run 41957657141 unless marked "local": a local
check of the changed steps with the same script (800 / 300 visits).

## Changes made

1. **The finished 9×9 game of unit 8** (`game-territory`, `game-score`,
   `game-dead`, `game-end`: 13 steps share the board). Both walls bent
   diagonally (E7–D6 and D4–E3 for Black, E4–F3 for White), so each side
   had a cutting point inside a "finished" game. KataGo: with White to
   play White led by 21.7, with Black to play by 4.0, not the 2.5 the text
   counts; the marked "dead" white stone was White's (ownership −0.6); and
   every "close the gap" step lost 4 to 8 points against defending the cut
   (game-territory#1 −7.1, game-score#2 −7.5, game-dead#1 −4.3, game-dead#2
   −8.2). The bends are now solid (black stones at D7 and D3, a white stone
   at F4). The new count is Black 31, White 28 + 6.5: White wins by 3.5,
   corrected in all four languages. Local check after the change: the
   count is −3.2 / −3.5 (claim agrees), the dead stone is Black's (+1.0),
   both sides' areas are settled, and every place step of these lessons
   is KataGo's best move (loss 0.0).
2. **game-order#2** ("extend along the side between your corners"): D7 and
   F7, right next to a corner stone, lost 4.0 and 3.9 points; they are no
   longer accepted. E7 (the middle, −2.2, the lesson's point) and E6
   (−0.8) stay.
3. **game-order#3** ("now the centre matters most"): E6, on Black's own
   side, lost 4.2 points and is no longer accepted. D4 and F4, central
   points facing White's line, were KataGo's best (1.8 and 2.0 points
   better than the best accepted point) and are now accepted. E5, D5 and F5 stay (2.0 to 2.6
   points behind: the centre the lesson teaches, within 9×9 noise).
4. **adv-judge-toward-thickness** (read and place): the text says "White
   has lived low inside" Black's wall, but KataGo's ownership of that
   group was unsettled (+0.3 for Black with Black to play) and its best
   move was to attack it (B13, 5.8 points better than the pincer the step
   asks for). White's group now has two more stones (C18 and B13): local
   check, ownership −0.94 (alive), and KataGo's best move becomes the
   pincer N17, which the step accepts.
5. **joseki-why#2**: E16, the cutting point between the hane and the
   block, is as good as the accepted points (+0.3) and is what KataGo
   plays in the mirrored corner too; it is now accepted, and the wrong
   answer text speaks of "a cutting point between your blocking stones"
   (four languages).
6. **The audit itself**: two "tap the eye" steps (life-eye#1,
   life-false-eye#1) are pointing exercises, not moves (filling your own
   eye is of course a loss), so they are reported as rule steps; the local
   view leaves out empty corners with a 5-line box, so a side extension
   is no longer compared with taking an empty corner (opening-extension#2
   and #3 now agree: loss 0.0).

## Disagreements left as they are

- **Rule steps** (stones-*, opening-corner-points-*: 13 steps). They teach
  where a stone goes (next to a stone, on a liberty, the ko rule); a
  move's value is not the point. Reported only.
- **Toy 9×9 shape and connection boards** (shape-empty-triangle#1/#2,
  shape-bamboo#1/#2, shape-ponnuki#1, connect-hanging#1, game-opening#3,
  shape-peep#1): three or four stones on an empty 9×9, so KataGo prefers
  a big point elsewhere on the board (3 to 9 points). The lesson teaches
  the local shape answer, which is right locally; the score gap measures
  the empty board, not the shape.
- **Toy endgame boards** (endgame-sente-gote#1/#2/#3,
  endgame-reverse-sente#2, endgame-order#1, and the claims of
  endgame-sente-gote#0 and endgame-reverse-sente#0). White's side of these
  boards is four columns of open space behind a bare wall, so KataGo's
  best move for either side is the invasion or its prevention (G2, 5 to 8
  points), and White does not answer the first-line push. The local
  sente/gote order the lessons teach is not what the score measures here;
  making the areas closed would be a redesign of the unit, left for a
  content pass. The double sente claim (endgame-double-sente#0) agrees.
- **joseki-33-white#3** ("connect"): KataGo prefers cutting at R6 to the
  standard connection S4 by about 6 points (5.8 at 600 visits, 6.1 local
  at 1500). Left: the connection is the joseki move taught in every
  book; on an otherwise empty 19×19 every fight and ladder favours the
  cutter, which inflates the cut. Flagged for a human reviewer.
- **opening-big-urgent#0** (claim "urgent before big"): the cutting point
  and the empty corner are within 0.6 points (corner ahead); the place
  step opening-big-urgent#2 (connect first) is within 1.1 of KataGo's
  best. Noise-level, left.
- **opening-big-urgent#3** (split the left side, 1.8 to 2.3 points behind
  an approach on the right) and **opening-big-urgent#1** (P5, the 5-5
  point, 2.0 behind the 3-3 / 4-4 points): doubtful, not clear losses on
  a toy board; left.
- **game-opening#1** (C3, the 3-3 point on 9×9, 1.8 behind) and
  **game-opening#2** (the cut, 1.9 behind): doubtful, left.
- **joseki-attach#3** (E15, 1.6 behind) and **shape-head-two#2** (1.5 to
  2 behind on a toy 9×9): doubtful, left.
- **game-order#1** (first move in a corner): on an empty 9×9 KataGo rates
  the centre points as good as the corners. The lesson teaches the
  corner-side-centre order; every accepted point is within 1.5 points.
- **Equal alternatives** in joseki, approach, invasion and opening steps
  (for example joseki-33-invasion#2 C14, adv-invade-33#1 O17,
  opening-pincer#1 F16): another move as good, but of a different kind
  than the step asks for (the text names the idea: block, hane, pincer).
  Adding it would make the text wrong; left.
- **Read steps for human review** (37, listed in the generated section):
  rules, tactics proved by the solver in the same lesson, and principles
  a single position cannot prove.

## v13 units waiting for a run

The v13 units `adv-opening` (view whole), `adv-joseki` (local;
`adv-joseki-choose` whole) and `adv-handicap` (whole;
`adv-handicap-simple` local) were written after the latest run, so the
generated section below does not list them yet. Before KataGo sees them:

- Every opening and joseki step whose position is in the opening book
  (`content/book.json`, KataGo 1.18.1; since v16 kata1-b18c384nbt at 1,000
  visits, before that g170e-b15c192 at 2,000) accepts only moves the
  book rates within `JOSEKI_LOSS` (1.5 points) of its best;
  `scripts/tests/core-course-advanced.mjs` enforces this.
- **The Chinese opening, evaluated (v16).** The lesson
  (`adv-open-chinese`) and the book's table (`scripts/make-book.mjs`) used
  Q16–R4–R10 (high: Q10) until it was corrected to the real opening,
  Q16–Q3–R9 (high: Q9). v16 rebuilt the book with kata1-b18c384nbt, and it
  now has both forms with their replies. What that changed:
  - `adv-open-chinese#1` and `#2` (the side stone, R9 or Q9) are evaluated
    and within `JOSEKI_LOSS`.
  - `adv-open-direction#2`, White's approach to the 3-4 stone, taught the
    approach from the bottom (O3 or O4) and said not to come in from the
    right side. The book's candidates there are O17 (0.0), Q5 (0.1), F17,
    C6, Q4, R17, F3 and C14; O3 and O4 are not among them. The step now
    asks for Q5, the one-space high approach from the right side, and says
    the old advice is not KataGo's choice.
  - `adv-joseki-knight#3` (the two-space extension M17 after the low
    approach and the knight's move answer) is in the book's position now,
    but its candidates there are all moves elsewhere (C3, F3, C6, R6, O3,
    F17), so the extension has no evaluation; the test lists it as
    unsearched until a book lists the move.
  A strong player should still look at `adv-open-direction#2`,
  `adv-joseki-knight#3` and the 3-3 block toward the opening
  (`adv-joseki-choose#2`).
- Not covered by the book, so the next run is their first check: the
  urgent-point lesson (`adv-open-urgent`, whose life-and-death part the
  solver proves), the small knight's enclosure (`adv-joseki-knight#1`),
  the 3-4
  approach F16 in `adv-open-direction#1`, the three-space pincers in
  `adv-joseki-choose#1` and `adv-handicap-stones#1`, and the nine-stone
  steps of `adv-handicap-simple` and `adv-handicap-white#1`.
- Two read-step claims were added for the run: `adv-open-direction#0`
  (the approach from the top is not worse than from the left) and
  `adv-open-urgent#0` (living in the corner comes before the empty corner).

## v13: content pass (not yet re-run with KataGo)

The v13 course changes below were made without an engine run (the next
`lesson-check.yml` run will fill in the generated section). Every new
interactive step is either proved by the solver (`check-course.mjs`) or a
place step on a closed 9×9 game.

The 12 place steps of the latest run with an accepted point more than 2.5
points behind:

| step | what v13 did |
| --- | --- |
| endgame-sente-gote#1, #2, #3 | Redesigned. The unit is rebuilt on sealed sides of the board (walls settled, only the boundary open); every interactive step is now an endgame problem (`goal: "endgame"`), counted exactly by the solver, so there are no place steps left for the engine to judge. |
| endgame-reverse-sente#2 | Redesigned, as above (now a three-area problem: own sente first, proved margin 1). |
| endgame-order#1 (and the doubtful #0) | Redesigned, as above: three problems, big → middle → small. The read claims `endgame-sente-gote#0` and `endgame-reverse-sente#0` (both "disagrees") were removed from `CLAIMS`; the endgame read steps are listed for review as "count". |
| game-opening#3 | Redesigned: White's peeping stone got a partner (F6), so it is no longer a weak stone to atari (KataGo's best was the atari at F6); defending the cutting point should now be the urgent move. Not re-run. |
| shape-empty-triangle#1 | Same board as game-opening#3, same change. Not re-run. |
| shape-empty-triangle#2 | Redesigned: Black's lone stone got a partner (G4), so KataGo's best (the atari at F3) is gone. Not re-run. |
| connect-hanging#1 | Left: three stones on an empty 9×9; a whole-board redesign of the beginner connection lessons is a follow-up. |
| shape-bamboo#1, #2, shape-ponnuki#1 | Left, for the same reason (toy shape boards; the local answer is right, the score gap measures the empty board). |
| joseki-33-white#3 | Left: the connection is the joseki move; the engine's cut gains on an otherwise empty board. Still flagged for a human reviewer. |

New in v13:

- **Ko fighting** (`ko-threat`, `ko-threat-answer`, `ko-count`,
  `ko-resolve`): place steps on one closed 9×9 game. `ko-threat#1` and
  `ko-threat-answer#1` are reported as rule steps: White has just taken
  the ko, a ban a diagram cannot carry, so the engine would simply retake.
  `ko-threat#0` carries an "answer" claim (White must answer the cut with
  G8). The ending-a-ko steps are solver problems on the whole 9×9.
- **Judging the position** (`judge-count`, `judge-ahead`, `judge-behind`):
  `judge-count#0` claims the lead (Black +0.5 with Black to play, White
  +1.5 with White to play; hand count 30 + 1 vs 24 + 6.5); its two place
  steps are the only open boundary. The other steps are solver problems.
- **Area scoring** (`game-area-scoring`): two neutral-point place steps on
  unit 8's game; under Japanese rules every neutral point is worth nothing,
  so any loss reported there is noise.

## Latest run

<!-- generated:start -->
Run: kata1-b18c384nbt-s9996604416-d4316597426, 1600 visits per root search, 600 per move, GitHub run 44296786200.

- Place steps checked: 134 (117 judged, 17 rule steps reported only)
- Steps with an accepted point that loses more than 2.5 points: 7
- Steps with a doubtful accepted point (1.5–2.5 points): 12
- Steps whose best move (in the step's view) is not accepted: 38
- Steps with an equally good point that is not accepted: 77
- Read steps with a board: 73; claims checked: 18; steps with a failed claim: 1; left for human review: 58

### Place steps that need a look

Values are the score lead for the side to move after the move; loss is against the best move of the step's view.

| step | view | accepted points (loss) | best (whole board) | best (local) | equal, not accepted |
| --- | --- | --- | --- | --- | --- |
| stones-board#1 | rule | E5 0.0 | E5 -0.5 | E5 -0.5 | F5 -0.2, D5 0.0, E4 -0.3, E6 -0.2, G5 -0.2 |
| stones-board#2 | rule | D5 -2.2 **doubtful**, F5 -0.6, E6 -2.5 **doubtful**, E4 -2.5 **doubtful** | F7 -0.3 (not accepted) | F7 -0.3 (not accepted) | C6 +0.5, C4 +0.6, C5 +0.3, G6 +0.4, G4 +0.1, F7 +0.6 |
| stones-board#3 | rule | E6 -6.9 **loses**, D5 -6.8 **loses** | F3 +10.1 (not accepted) | F3 +10.1 (not accepted) | G4 +6.8, F3 +6.8, G5 +6.0, E3 +6.0, F4 +6.1, G6 +5.8 |
| stones-liberties#1 | rule | D5 -2.7 **loses**, F5 -2.7 **loses**, E6 -2.7 **loses**, E4 -2.6 **loses** | C6 -12.7 (not accepted) | C6 -12.7 (not accepted) | G6 +2.5, G4 +2.5, C6 +2.6, C4 +2.5, D3 +2.4, F3 +2.4 |
| stones-liberties#2 | rule | F9 -6.7 **loses**, E8 -0.4 | D4 -0.3 (not accepted) | D7 -0.4 (not accepted) | D7 +0.4, F6 +0.2, E7 +0.2, D6 +0.2, E6 0.0 |
| stones-suicide#1 | rule | C8 0.0 | C7 +3.5 (not accepted) | C7 +3.5 (not accepted) | C7 0.0 |
| stones-ko#1 | rule | E3 -2.3 **doubtful** | E5 +6.9 (not accepted) | E5 +6.9 (not accepted) | E5 +2.3, D5 +1.8 |
| stones-ko#2 | rule | J6 -7.0 **loses**, H5 -1.6 **doubtful** | E5 +6.6 (not accepted) | F7 +4.9 (not accepted) | F7 +1.6 |
| stones-ko#3 | rule | E3 -4.9 **loses** | E5 +16.8 (not accepted) | E5 +16.8 (not accepted) | E5 +4.9, D5 +2.1 |
| stones-ko#4 | rule | D3 -1.3 | E5 +26.7 (not accepted) | E5 +26.7 (not accepted) | E5 +1.3, D5 0.0 |
| connect-hanging#1 | local | D6 -4.6 **loses**, D4 -4.4 **loses** | G4 +12.2 (not accepted) | F7 +11.5 (not accepted) | F7 +4.4, E3 +4.2, F4 +4.1, E7 +3.7, F3 +3.8, E2 +3.7 |
| connect-cut#0 | local | E6 -0.4 | C5 -2.2 (not accepted) | C5 -2.2 (not accepted) | C5 +0.4 |
| life-eye#1 | rule | G7 -9.4 **loses** | C5 +6.1 (not accepted) | E5 +2.1 (not accepted) | E5 +9.4, E6 +8.9, E8 +8.1, E9 +3.8, F9 +1.6, J5 +0.9 |
| life-eye#2 | local | C8 -0.7 | F3 -21.5 (not accepted) | E7 -24.4 (not accepted) | E7 +0.7 |
| game-score#1 | local | C3 0.0 | B3 -4.9 (not accepted) | B3 -4.9 (not accepted) | B3 0.0, D2 -0.1, A4 -0.1, A3 -0.1, A2 -0.2 |
| game-order#1 | whole | C7 -0.7, D7 -0.4, C6 -0.3, D6 -0.1, F7 -0.5, G7 -0.7, F6 -0.1, G6 -0.3, C4 -0.3, D4 -0.1, C3 -0.7, D3 -0.3, F4 0.0, G4 -0.3, F3 -0.4, G3 -0.6 | E5 -0.6 (not accepted) | E5 -0.6 (not accepted) | E5 0.0, F5 -0.3, D5 -0.2, E4 -0.1, E6 0.0, G5 -0.1 |
| game-order#2 | whole | E7 -2.4 **doubtful**, E6 -0.1 | D4 -0.8 (not accepted) | D4 -0.8 (not accepted) | F4 +0.1, D4 +0.1, F5 -0.2 |
| game-order#3 | whole | E5 -1.7 **doubtful**, D5 -2.3 **doubtful**, F5 -2.3 **doubtful**, D4 0.0, F4 0.0 | F4 -1.8 | F4 -1.8 | – |
| game-opening#1 | whole | C4 -1.7 **doubtful**, D4 -0.1, C3 -2.4 **doubtful**, D3 -1.8 **doubtful** | F6 +11.9 (not accepted) | F6 +11.9 (not accepted) | F6 +0.1 |
| game-opening#2 | whole | G6 -2.9 **loses** | G4 -11.3 (not accepted) | G4 -11.3 (not accepted) | G4 +2.9, E6 +2.9, C5 +1.7, F3 +1.7 |
| game-opening#3 | whole | D5 -1.7 **doubtful**, C5 -3.4 **loses**, D4 -5.6 **loses** | F5 -9.2 (not accepted) | F5 -9.2 (not accepted) | F5 +1.7, D7 +1.3 |
| opening-corner-points#1 | rule | Q4 0.0 | Q4 +39.4 | Q4 +39.4 | R4 -0.2 |
| opening-corner-points#2 | rule | C16 -0.1, D17 -0.2 | D16 +12.7 (not accepted) | D16 +12.7 (not accepted) | D16 +0.1 |
| opening-corner-points#3 | rule | R3 -0.4 | Q4 +13.0 (not accepted) | Q4 +13.0 (not accepted) | Q4 +0.4, Q3 0.0, R4 0.0, P4 -0.3 |
| opening-enclose-approach#1 | local | E17 -0.3, E16 0.0, F17 -0.1 | Q16 +12.9 (not accepted) | E16 +11.9 | F16 0.0 |
| opening-enclose-approach#2 | local | E17 0.0 | Q16 +0.3 (not accepted) | E17 -0.1 | E16 0.0, D16 0.0, F16 -0.1, D17 0.0, D14 -0.3 |
| opening-enclose-approach#3 | local | F17 -0.2, C14 -0.3 | Q4 +0.3 (not accepted) | C17 -0.1 (not accepted) | C17 +0.2 |
| opening-extension#1 | local | C6 -0.5 | D3 -13.3 (not accepted) | D6 -14.6 (not accepted) | F4 +0.4, D6 +0.5, F3 +0.2 |
| opening-extension#2 | local | C6 -0.5 | D3 -3.2 (not accepted) | F4 -6.0 (not accepted) | F4 +0.5, D6 +0.1, F3 -0.2 |
| opening-extension#3 | local | C6 -0.3 | D4 +3.8 (not accepted) | F4 +1.1 (not accepted) | F4 +0.3, F3 +0.2, D6 0.0 |
| opening-pincer#1 | local | H17 -0.3, H16 -0.4, J17 -0.2, J16 -0.3, K17 -0.2, K16 -0.2 | D4 +0.4 (not accepted) | F16 0.0 (not accepted) | F16 +0.2, E17 +0.1, D14 +0.1, C14 0.0 |
| opening-pincer#2 | local | F15 -0.2 | Q16 +0.3 (not accepted) | C14 +0.1 (not accepted) | C14 +0.2, C17 +0.2, D14 -0.1, J16 -0.2 |
| opening-big-urgent#1 | whole | P5 -2.3 **doubtful**, Q5 -0.7, R5 -0.8, P4 -0.8, Q4 0.0, R4 -0.1, P3 -0.8, Q3 -0.1, R3 -0.4 | Q4 +13.2 | Q4 +13.2 | – |
| opening-big-urgent#2 | whole | J16 -1.3 | L17 +14.7 (not accepted) | L17 +14.7 (not accepted) | L17 +1.3, Q4 0.0, L15 +0.1, Q3 -0.2, K15 -0.3 |
| opening-big-urgent#3 | whole | C11 -1.7 **doubtful**, D11 -1.4, C10 -1.5, D10 -1.2, C9 -1.5, D9 -1.3 | Q14 +11.0 (not accepted) | D7 +10.6 (not accepted) | Q14 +1.2, R14 +1.0, D7 +0.8, O16 +1.1, O17 +0.9, G9 +0.1, G11 0.0, G8 +0.1, F8 0.0 |
| opening-review#1 | whole | O17 -0.1, R14 -0.1, O16 -0.2, Q14 -0.2, N17 -0.2, R13 -0.2 | R3 -0.3 (not accepted) | O17 -0.4 | R6 +0.1, C14 +0.1, O3 +0.1, F17 +0.1, R3 +0.1 |
| opening-review#2 | whole | F17 0.0, C14 -0.1, G17 -0.5, C13 -0.5, F16 -0.9, D14 -1.0, O3 -0.2, R6 -0.1, N3 -0.6, R7 -0.6, O4 -0.9, Q6 -0.9 | F17 +11.6 | F17 +11.6 | C6 -0.1, G3 -0.2 |
| joseki-33-invasion#1 | local | D17 0.0 | C16 +0.1 (not accepted) | C16 +0.1 (not accepted) | C16 0.0 |
| joseki-33-invasion#2 | local | C15 -0.4 | C14 +0.1 (not accepted) | C14 +0.1 (not accepted) | D15 +0.3, C14 +0.4, D14 -0.2 |
| joseki-33-invasion#3 | local | B14 0.0 | D4 -0.2 (not accepted) | B14 -0.5 | C14 0.0, C18 -0.1, D14 -0.2 |
| joseki-33-invasion#4 | local | C14 -1.1, D14 -1.5 **doubtful** | D15 +6.2 (not accepted) | D15 +6.2 (not accepted) | D15 +1.1 |
| joseki-33-white#0 | local | R3 0.0 | D16 +0.3 (not accepted) | R3 -0.1 | O3 -0.3, R6 -0.3 |
| joseki-33-white#3 | local | S4 -6.4 **loses** | R6 +0.5 (not accepted) | R6 +0.5 (not accepted) | R6 +6.4, Q2 +5.4, P2 +3.6, O2 +1.2, P3 +1.2, O3 +0.3 |
| joseki-approach#1 | local | F17 -0.3, C14 -0.3 | Q4 +0.3 (not accepted) | C17 -0.1 (not accepted) | C17 +0.3 |
| joseki-approach#2 | local | C14 -0.1 | Q16 +0.4 (not accepted) | E17 -0.1 (not accepted) | F16 +0.1, E17 +0.1, D14 +0.1, K17 0.0, K16 0.0 |
| joseki-approach#3 | local | J17 -0.8 | D4 +0.2 (not accepted) | D17 -0.2 (not accepted) | D17 +0.8, D15 +0.7, D18 +0.6, D13 +0.3, E18 +0.4, F15 +0.4 |
| joseki-attach#1 | local | C16 -0.1 | Q16 +0.1 (not accepted) | C12 -0.3 (not accepted) | C12 +0.1, C13 0.0, E16 0.0, F16 0.0, D12 0.0 |
| joseki-attach#2 | local | C17 -0.2 | E16 +0.2 (not accepted) | E16 +0.2 (not accepted) | E16 +0.2, B17 -0.2 |
| joseki-attach#3 | local | D15 0.0, E15 -1.8 **doubtful**, D14 -0.2 | D4 0.0 (not accepted) | D15 -0.3 | – |
| joseki-why#2 | local | F17 -1.1, F16 -1.5 **doubtful**, E16 0.0 | E16 +6.2 | E16 +6.2 | – |
| shape-empty-triangle#1 | local | D5 -1.5 **doubtful** | F5 -9.2 (not accepted) | F5 -9.2 (not accepted) | F5 +1.5, D7 +0.9 |
| shape-empty-triangle#2 | local | E5 -0.4 | E3 +2.8 (not accepted) | E3 +2.8 (not accepted) | D5 -0.1, E3 +0.4, G5 +0.1 |
| shape-bamboo#1 | local | E6 -6.5 **loses** | G4 +5.0 (not accepted) | G4 +5.0 (not accepted) | G4 +6.5, G6 +5.7, G5 +4.9, E5 +4.2, G7 +3.7, F5 +3.3 |
| shape-bamboo#2 | local | D6 -9.1 **loses** | E3 +19.8 (not accepted) | E4 +18.5 (not accepted) | E4 +9.1, F4 +7.9, D4 +7.4, F5 +5.9, C4 +4.8, D5 +2.5 |
| shape-peep#1 | local | D5 -2.3 **doubtful** | G5 +3.2 (not accepted) | F5 +1.5 (not accepted) | F4 +2.2, F5 +2.3, F6 0.0, C6 +0.8, C4 +1.9 |
| shape-peep#2 | local | D5 -1.2 | E7 +0.2 (not accepted) | E7 +0.2 (not accepted) | E7 +1.2, E4 +1.0, E3 +0.2, F4 -0.1 |
| shape-head-two#1 | local | D5 -0.2 | D6 -8.1 (not accepted) | D6 -8.1 (not accepted) | D6 +0.2 |
| shape-head-two#2 | local | E4 -0.2 | E5 +4.8 (not accepted) | E5 +4.8 (not accepted) | E5 +0.2 |
| shape-ponnuki#1 | local | D5 -2.1 **doubtful** | D3 +14.7 (not accepted) | D3 +14.7 (not accepted) | E3 +1.9, D3 +2.1, E4 +1.7, F4 +1.1, D4 +0.6, F3 0.0 |
| shape-jump#1 | local | E10 -0.4 | Q17 -40.4 (not accepted) | D7 -40.5 (not accepted) | D13 +0.3, D7 +0.4, D12 -0.1, D8 -0.1, E11 -0.2, E9 -0.2 |
| shape-jump#2 | local | G10 -0.6 | Q5 -40.3 (not accepted) | E7 -40.7 (not accepted) | E7 +0.6, G11 +0.3, F7 +0.4, H10 0.0 |
| fight-attack-distance#2 | local | K14 -1.0 | F3 +13.9 (not accepted) | L16 +13.7 (not accepted) | N17 +1.0, M17 +0.8, G17 +0.8, J16 +1.0, L16 +1.0, H17 +0.7 |
| fight-split#1 | whole | J11 -1.1, K11 -1.0, L11 -1.1, J10 -1.0, K10 -1.0, L10 -1.1, J9 -1.0, K9 -1.0, L9 -1.0 | L16 +29.0 (not accepted) | K10 +28.0 | N17 +0.9, N3 +0.9, G17 +0.9, G3 +0.8, L16 +1.0, L12 0.0, L8 -0.1, J12 -0.1, J8 0.0 |
| ko-threat-answer#1 | rule | F7 -0.2 | F5 +3.0 (not accepted) | F5 +3.0 (not accepted) | F5 +0.2 |
| ko-threat-answer#2 | whole | G8 -0.2 | H8 -3.0 (not accepted) | H8 -3.0 (not accepted) | H8 +0.2, G9 -0.1 |
| ko-count#1 | whole | F5 -1.2 | F7 +3.4 (not accepted) | F7 +3.4 (not accepted) | F7 +1.2 |
| adv-open-chinese#1 | whole | R9 -0.2, Q9 -0.1 | O17 -0.3 (not accepted) | R6 -0.3 (not accepted) | C3 0.0, C17 0.0, O17 +0.1, R6 0.0, F3 0.0, R8 0.0, Q6 0.0, Q8 -0.1, R7 -0.1, Q7 -0.1 |
| adv-open-chinese#2 | whole | L3 -0.1, L4 -0.1 | C6 -0.3 (not accepted) | O3 -0.3 (not accepted) | R17 +0.1, C17 +0.1, C6 +0.1, R14 0.0, O3 +0.1, M3 0.0, O4 0.0, N3 -0.1, M4 -0.1 |
| adv-open-sanrensei#1 | whole | Q10 -0.2 | C17 -0.3 (not accepted) | R13 -0.4 (not accepted) | F17 +0.1, F3 +0.1, C17 +0.2, C3 +0.2, C14 +0.1, R13 0.0, R7 0.0, R12 -0.1, R8 -0.1, R10 -0.1 |
| adv-open-sanrensei#2 | whole | R3 0.0, R17 0.0 | O3 +0.5 (not accepted) | O3 +0.5 (not accepted) | O3 0.0, O17 0.0, F3 0.0 |
| adv-open-direction#1 | whole | F17 0.0, F16 -0.5 | C3 -0.3 (not accepted) | C17 -0.3 (not accepted) | F3 0.0, C17 0.0, C3 0.0, C14 0.0, G17 -0.2, D17 -0.2, G16 -0.2 |
| adv-open-direction#2 | whole | Q5 -0.1 | O17 +0.5 (not accepted) | Q5 +0.4 | O17 +0.1, Q4 -0.1, R17 0.0, F3 0.0, R5 0.0, Q8 -0.1 |
| adv-open-urgent#1 | whole | A1 -5.4 **loses** | Q3 -31.2 (not accepted) | A1 -36.7 | Q3 +5.4, Q4 +5.1, R3 +4.9, R4 +5.1, P3 +5.2 |
| adv-open-urgent#3 | whole | Q4 -0.1, R4 -0.4, Q3 0.0, R3 -0.3 | Q3 -33.8 | Q3 -33.8 | P3 -0.2 |
| adv-joseki-low-pincer#1 | local | R12 -0.3 | Q4 +0.4 (not accepted) | R15 0.0 (not accepted) | Q14 +0.2, R15 +0.3, O16 +0.2, R10 +0.1, Q10 +0.1, O17 +0.1 |
| adv-joseki-low-pincer#2 | local | R17 -0.3 | Q4 +0.4 (not accepted) | P14 0.0 (not accepted) | P14 +0.3, O16 +0.3, O17 +0.1, Q11 0.0, R10 -0.2 |
| adv-joseki-two-space#1 | local | R11 -0.2 | Q4 +0.4 (not accepted) | Q14 0.0 (not accepted) | Q14 +0.2, R15 +0.2, O16 +0.1, Q13 -0.1, O17 0.0, Q10 0.0 |
| adv-joseki-high-approach#4 | local | R14 -0.1, Q14 0.0 | D16 +0.2 (not accepted) | Q14 -0.2 | K16 -0.1, K17 -0.1, L17 -0.1, M17 -0.1 |
| adv-joseki-high-approach#5 | local | K17 -0.6, K16 -0.4 | D16 +0.3 (not accepted) | Q16 +0.1 (not accepted) | Q16 +0.4, Q15 +0.3, J16 -0.3 |
| adv-joseki-knight#1 | local | P17 -0.3 | D16 +13.0 (not accepted) | P16 +11.9 (not accepted) | P16 +0.3, O16 +0.3, O17 +0.2, Q12 -0.2 |
| adv-joseki-knight#2 | local | Q14 -0.1, Q15 -0.1 | Q4 +0.1 (not accepted) | M17 -0.2 (not accepted) | M17 +0.1, N17 0.0, Q17 0.0, N16 -0.1 |
| adv-joseki-knight#3 | local | M17 -0.3 | D16 +0.4 (not accepted) | R17 -0.1 (not accepted) | R17 +0.3, P14 +0.2, L16 +0.1, R12 0.0, M16 +0.1, P13 -0.1 |
| adv-joseki-choose#1 | whole | R12 -0.2, R11 -0.1, R10 -0.1, Q12 0.0, Q11 -0.1, Q10 -0.1 | Q12 -12.5 | Q12 -12.5 | R15 0.0, F3 -0.2, C3 0.0 |
| adv-judge-bigger#1 | whole | H17 -0.1, J17 -0.1, K17 -0.3, L17 -0.3, M17 -0.5, H16 -0.3, J16 -0.2, K16 -0.2, L16 -0.4, M16 -0.4, H4 -0.7, J4 -0.5, K4 -0.4, L4 -0.4, M4 -0.5, H3 -1.0, J3 -0.8, K3 -0.6, L3 -0.6, M3 -0.4 | O3 -0.3 (not accepted) | O3 -0.3 (not accepted) | O3 +0.1, R14 0.0, D9 0.0, N16 -0.1, G17 -0.1 |
| adv-judge-bigger#3 | whole | H4 -0.3, J4 -0.2, K4 -0.2, L4 -0.2, M4 -0.2, H3 -0.4, J3 -0.3, K3 -0.3, L3 -0.1, M3 -0.1 | C7 +0.6 (not accepted) | M3 +0.5 | F17 +0.1, E18 0.0, B5 0.0, C7 +0.1, H17 0.0, N3 0.0, G4 0.0 |
| adv-judge-toward-thickness#1 | whole | M17 -0.4, N17 -0.1, O17 -0.2, M16 -0.6, N16 -0.4, O16 -0.5 | C12 +0.4 (not accepted) | N17 +0.4 | C12 +0.1, C3 -0.2, L16 -0.3 |
| adv-judge-away#1 | whole | Q12 -0.7, R12 -0.7, Q11 -0.6, R11 -0.6, Q10 -0.4, R10 -0.5, Q9 -0.5, R9 -0.5, Q8 -0.7, R8 -0.6 | C17 -0.5 (not accepted) | R14 -0.8 (not accepted) | C17 +0.4, C16 +0.4, F17 +0.3, C11 +0.2, O17 +0.2, R14 +0.1, Q14 0.0, R13 0.0, R6 0.0 |
| adv-invade-where#1 | whole | R13 -0.8, R12 -0.6, R11 -0.4 | R6 +1.0 (not accepted) | O16 +0.9 (not accepted) | R6 +0.4, C6 +0.4, F3 +0.2, F17 +0.3, G3 +0.2, O16 +0.3, S16 +0.1, P15 0.0, R15 0.0, Q10 -0.1 |
| adv-invade-where#2 | whole | H3 -1.3, J3 -1.1, K3 -1.0 | R13 +13.7 (not accepted) | G4 +13.2 (not accepted) | C13 +0.8, R13 +1.0, C6 +0.6, C14 +0.8, R14 +0.9, G4 +0.5, L6 +0.2, L5 +0.1, K5 +0.1, M4 +0.3, G6 -0.1 |
| adv-invade-33#1 | local | R17 -0.1 | R7 +14.1 (not accepted) | O17 +13.7 (not accepted) | O17 +0.1, R14 0.0, R16 -0.2, O16 -0.1 |
| adv-reduce-shoulder#1 | local | J16 0.0, L16 0.0 | K4 +28.7 (not accepted) | L16 +28.5 | K16 0.0, N17 -0.1, G17 0.0, F17 -0.1 |
| adv-reduce-shoulder#2 | local | J15 -0.5, L15 -0.8, K14 -1.1 | O3 -12.3 (not accepted) | F17 -12.6 (not accepted) | F17 +0.5, G17 +0.4, H16 -0.1, F16 +0.2, N17 -0.1, G16 +0.1 |
| adv-middle-attack-gain#1 | whole | C12 -0.5, C8 -0.6, D12 -0.8, D8 -0.9 | N3 +26.0 (not accepted) | C12 +25.5 | N3 +0.5, O17 +0.3, R8 +0.5, R14 +0.1, O4 +0.3, D10 -0.1, D9 0.0, C13 -0.2, C7 -0.2 |
| adv-middle-attack-gain#2 | whole | H17 -0.3, M17 -0.3, H16 -0.6, M16 -0.6 | C7 +26.1 (not accepted) | M17 +25.8 | G3 -0.1, C7 +0.3, R6 0.0, N4 -0.1, G17 -0.3 |
| adv-handicap-simple#1 | local | R15 -0.1 | R14 +105.8 (not accepted) | R14 +105.8 (not accepted) | R14 +0.1, Q15 -0.3 |
| adv-handicap-white#1 | whole | R17 -2.4 **doubtful**, C17 -2.2 **doubtful**, R3 -2.3 **doubtful**, C3 -2.3 **doubtful** | H10 -103.6 (not accepted) | H10 -103.6 (not accepted) | G10 +2.1, N10 +2.0, K13 +1.9, K7 +1.9, F9 +2.1, H10 +2.2, M10 +2.1 |

### Read-step claims

| step | claim | KataGo | result |
| --- | --- | --- | --- |
| life-two-eyes#0 | the black group with two eyes is alive | ownership 1 | agrees |
| kill-straight-three#0 | after Black's middle point White is dead | ownership 1 | agrees |
| game-territory#0 | the left side is Black's | ownership 1 | agrees |
| game-territory#0 | the right side is White's | ownership 1 | agrees |
| game-score#0 | White wins by 3.5 | lead -3.6 (Black to play), -3.5 (White to play) | agrees |
| game-dead#0 | the marked white stone is dead | ownership 1 | agrees |
| opening-big-urgent#0 | the urgent cutting point comes before the big empty corner | A +13.5, B +13.5 | agrees |
| ko-threat#0 | White must answer Black's cut at the top | reply G8 | agrees |
| judge-count#0 | with Black to play Black wins by 0.5 | lead +0.5 (Black to play), -2.5 (White to play) | agrees |
| judge-count#0 | with White to play White wins by 1.5 | lead -2.5 (Black to play), +0.5 (White to play) | agrees |
| adv-open-direction#0 | the approach from the top (A) is not worse than from the left (B) | A -0.3, B -0.3 | agrees |
| adv-open-urgent#0 | living in the corner (A) comes before the empty corner (B) | A -36.5, B -31.5 | **disagrees** |
| adv-judge-bigger#0 | A is bigger than B | A -0.5, B -0.5 | agrees |
| adv-judge-toward-thickness#0 | White has lived low inside Black's wall | ownership 0.9 | agrees |
| adv-judge-toward-thickness#0 | the pincer A is better than the press B | A 0.0, B -0.6 | agrees |
| adv-judge-away#0 | extending up the right side (A) is better than along the bottom (B) | A -1.0, B -1.6 | agrees |
| adv-reduce-shoulder#0 | the two shoulder hits are about equal | A +28.6, B +28.5 | agrees |
| adv-middle-attack-gain#0 | A and B are about equal | A +25.6, B +25.5 | agrees |

### Read steps left for human review

- states a rule; the board only illustrates it: stones-board#0, stones-liberties#0, stones-capture#0, stones-suicide#0, stones-ko#0, connect-solid#0, connect-hanging#0, life-eye#0, life-false-eye#0, game-area-scoring#0, game-area-scoring#2, game-order#0
- a tactical idea that the lesson's problem steps prove with the solver: capture-direction#0, capture-ladder#0, capture-net#0, capture-snapback#0, escape-ladder#0, race-outside#0
- a general principle (opening, shape, joseki, strategy) that a single position cannot prove: opening-corner-points#0, opening-enclose-approach#0, opening-extension#0, opening-pincer#0, joseki-33-invasion#0, joseki-approach#0, joseki-attach#0, shape-empty-triangle#0, shape-bamboo#0, shape-peep#0, shape-head-two#0, shape-ponnuki#0, shape-jump#0, fight-cutting-stones#0, fight-attack-distance#0, fight-split#0, fight-leaning#0, fight-sabaki#0, ko-count#0, adv-open-chinese#0, adv-open-chinese#3, adv-open-sanrensei#0, adv-joseki-low-pincer#0, adv-joseki-two-space#0, adv-joseki-high-approach#0, adv-joseki-knight#0, adv-joseki-choose#0, adv-judge-bigger#2, adv-invade-where#0, adv-handicap-stones#0, adv-handicap-white#0
- an endgame idea on a sealed position whose counts the lesson's problem steps prove with the solver: endgame-sente-gote#0, endgame-first-line#0, endgame-reverse-sente#0, endgame-double-sente#0, endgame-counting#0, endgame-counting#2, endgame-big#0, endgame-big#2, endgame-japanese-counting#0
<!-- generated:end -->
