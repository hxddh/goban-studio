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
  (`content/book.json`, KataGo 1.18.1, 2000 visits) accepts only moves the
  book rates within `JOSEKI_LOSS` (1.5 points) of its best;
  `scripts/tests/core-course-v13.mjs` enforces this.
- **The Chinese opening has no evaluation yet.** The lesson
  (`adv-open-chinese`) and the book's table (`scripts/make-book.mjs`) used
  Q16–R4–R10 (high: Q10) until it was corrected to the real opening,
  Q16–Q3–R9 (high: Q9). The shipped book was built with the old line, so it
  has the position before the side stone but no evaluation of R9 or Q9
  (KataGo's own choices there are the enclosures Q5, R6 and Q6), and the
  two wrong labels were removed from it. Waiting for a book rebuild and a
  run: `adv-open-chinese#1` and `#2` (the side stone), the approach
  against it from the bottom (`adv-open-direction#2`: O3 or O4) and the
  3-3 block toward it (`adv-joseki-choose#2`). A strong player should
  look at these four steps.
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
Run: g170e-b15c192-s1672170752-d466197061, 1600 visits per root search, 600 per move, GitHub run 41963685718.

- Place steps checked: 107 (92 judged, 15 rule steps reported only)
- Steps with an accepted point that loses more than 2.5 points: 12
- Steps with a doubtful accepted point (1.5–2.5 points): 10
- Steps whose best move (in the step's view) is not accepted: 34
- Steps with an equally good point that is not accepted: 64
- Read steps with a board: 51; claims checked: 17; steps with a failed claim: 2; left for human review: 37

### Place steps that need a look

Values are the score lead for the side to move after the move; loss is against the best move of the step's view.

| step | view | accepted points (loss) | best (whole board) | best (local) | equal, not accepted |
| --- | --- | --- | --- | --- | --- |
| stones-board#1 | rule | E5 -0.1 | D5 -0.1 (not accepted) | D5 -0.1 (not accepted) | F5 0.0, D5 +0.1, E4 0.0, E6 +0.1, F6 +0.1 |
| stones-board#2 | rule | D5 -1.9 **doubtful**, F5 -0.5, E6 -1.7 **doubtful**, E4 -2.1 **doubtful** | C5 -0.2 (not accepted) | C5 -0.2 (not accepted) | G6 +0.3, G4 +0.2, C5 +0.5, F7 +0.1, F3 +0.2, C6 +0.4 |
| stones-board#3 | rule | E6 -8.1 **loses**, D5 -8.4 **loses** | F3 +10.5 (not accepted) | F3 +10.5 (not accepted) | G4 +7.9, F3 +8.1, G5 +6.5, E3 +7.1, G6 +7.0, D3 +6.7 |
| stones-liberties#1 | rule | D5 -2.3 **doubtful**, F5 -2.2 **doubtful**, E6 -2.3 **doubtful**, E4 -2.5 **doubtful** | G6 -11.9 (not accepted) | G6 -11.9 (not accepted) | G5 +2.2, C5 +2.1, E3 +2.1, E7 +2.2, G6 +2.2, G4 +2.1 |
| stones-liberties#2 | rule | F9 -6.9 **loses**, E8 -0.2 | F4 -0.1 (not accepted) | E7 -0.3 (not accepted) | D7 +0.2, E7 +0.2, D6 +0.1, F6 +0.2, E6 -0.1 |
| stones-ko#1 | rule | E3 -2.5 **doubtful** | D5 +6.9 (not accepted) | D5 +6.9 (not accepted) | D5 +2.5, E5 +2.1 |
| stones-ko#2 | rule | J6 -4.9 **loses**, H5 -1.3 | D5 +6.8 (not accepted) | F7 +3.6 (not accepted) | F7 +1.3 |
| stones-ko#3 | rule | E3 -4.8 **loses** | E5 +16.1 (not accepted) | E5 +16.1 (not accepted) | E5 +4.8, D5 +2.3, C5 -0.3 |
| stones-ko#4 | rule | D3 -1.8 **doubtful** | E5 +26.9 (not accepted) | E5 +26.9 (not accepted) | E5 +1.8, D5 +0.4 |
| connect-hanging#1 | local | D6 -5.2 **loses**, D4 -4.8 **loses** | G4 +11.4 (not accepted) | E3 +11.2 (not accepted) | F7 +4.5, E3 +4.8, F3 +4.5, E7 +4.1, E2 +4.1, F4 +4.0 |
| connect-cut#0 | local | E6 -0.3 | C5 -1.6 (not accepted) | C5 -1.6 (not accepted) | C5 +0.3 |
| life-eye#1 | rule | G7 -10.5 **loses** | C5 +6.1 (not accepted) | E5 +1.3 (not accepted) | E5 +10.5, E6 +9.4, E8 +8.5, E9 +5.3, J9 +1.2, F9 +3.2 |
| life-eye#2 | local | C8 -0.5 | F4 -18.6 (not accepted) | E7 -23.1 (not accepted) | E7 +0.5 |
| life-false-eye#1 | rule | J1 -0.1 | D7 -32.0 (not accepted) | G1 -55.5 (not accepted) | G1 +0.1 |
| game-score#1 | local | C3 -0.1 | H4 -5.4 (not accepted) | D1 -5.4 (not accepted) | C1 +0.1, B1 +0.1, D1 +0.1, B2 0.0, A2 -0.1 |
| game-order#1 | whole | C7 -1.6 **doubtful**, D7 -0.3, C6 -0.6, D6 -0.1, F7 -0.6, G7 -1.3, F6 -0.1, G6 -0.4, C4 -0.4, D4 0.0, C3 -1.5 **doubtful**, D3 -0.4, F4 -0.1, G4 -0.5, F3 -0.4, G3 -1.4 | D4 -0.1 | D4 -0.1 | E5 -0.2, F5 -0.1, D5 -0.2, E4 -0.2, E6 -0.1 |
| game-order#2 | whole | E7 -2.0 **doubtful**, E6 -1.1 | D4 -0.3 (not accepted) | D4 -0.3 (not accepted) | F4 +1.1, D4 +1.1, E4 +0.3, G5 -0.2, C5 +0.2, F5 +0.1 |
| game-order#3 | whole | E5 -2.3 **doubtful**, D5 -1.8 **doubtful**, F5 -2.0 **doubtful**, D4 -0.4, F4 0.0 | F4 -1.7 | F4 -1.7 | G4 -0.2 |
| game-opening#1 | whole | C4 -1.4, D4 0.0, C3 -1.8 **doubtful**, D3 -1.2 | D4 +11.4 | D4 +11.4 | – |
| game-opening#2 | whole | G6 -2.5 **doubtful** | G4 -10.1 (not accepted) | G4 -10.1 (not accepted) | G4 +2.5, E6 +2.3, C5 +1.8, E3 +1.4 |
| game-opening#3 | whole | D5 -3.4 **loses**, C5 -3.5 **loses**, D4 -3.6 **loses** | F6 +3.6 (not accepted) | F6 +3.6 (not accepted) | F6 +3.4, G6 +1.0, D7 +1.5, E7 +1.4, F5 +1.1, E3 +1.9, F4 +1.7 |
| opening-corner-points#1 | rule | Q4 0.0 | Q4 +39.8 | Q4 +39.8 | R4 -0.2, Q3 -0.1 |
| opening-corner-points#2 | rule | C16 0.0, D17 -0.1 | C16 +12.3 | C16 +12.3 | D16 -0.2, C17 -0.3 |
| opening-corner-points#3 | rule | R3 -0.2 | Q3 +12.5 (not accepted) | Q3 +12.5 (not accepted) | Q4 +0.1, Q3 +0.2, R4 +0.1 |
| opening-enclose-approach#1 | local | E17 -0.3, E16 -0.1, F17 0.0 | R16 +12.4 (not accepted) | F17 +11.6 | F16 -0.1 |
| opening-enclose-approach#2 | local | E17 -0.1 | Q16 +0.2 (not accepted) | D16 -0.3 (not accepted) | E16 0.0, D16 +0.1, D17 -0.2, D14 -0.2 |
| opening-enclose-approach#3 | local | F17 -0.2, C14 -0.2 | D4 +0.2 (not accepted) | C17 -0.5 (not accepted) | C17 +0.2, C16 -0.1, D17 -0.1 |
| opening-extension#1 | local | C6 0.0 | D3 -12.6 (not accepted) | C6 -13.9 | F3 -0.1, F4 -0.2, D6 -0.2 |
| opening-extension#2 | local | C6 -0.2 | D3 -3.3 (not accepted) | D6 -6.1 (not accepted) | D6 +0.2, F4 0.0, F3 -0.2 |
| opening-extension#3 | local | C6 0.0 | D4 +2.1 (not accepted) | D6 +0.3 (not accepted) | D6 0.0, F3 0.0, F4 -0.1 |
| opening-pincer#1 | local | H17 -0.4, H16 -0.4, J17 -0.4, J16 -0.3, K17 -0.3, K16 -0.3 | Q16 +0.8 (not accepted) | F16 +0.2 (not accepted) | F16 +0.3, E17 +0.2, C14 0.0, C13 0.0, G16 -0.1 |
| opening-pincer#2 | local | F15 0.0 | Q16 +0.3 (not accepted) | F15 -0.2 | C14 -0.1, D14 0.0, C17 -0.3, J16 -0.2 |
| opening-big-urgent#1 | whole | P5 -2.0 **doubtful**, Q5 -0.7, R5 -0.8, P4 -0.8, Q4 -0.2, R4 0.0, P3 -0.8, Q3 0.0, R3 -0.2 | R4 +12.5 | R4 +12.5 | – |
| opening-big-urgent#2 | whole | J16 -0.9 | L17 +13.8 (not accepted) | L17 +13.8 (not accepted) | L17 +0.9, Q4 +0.3, L15 -0.1, Q3 +0.4, R4 +0.5, K15 -0.3 |
| opening-big-urgent#3 | whole | C11 -2.3 **doubtful**, D11 -2.1 **doubtful**, C10 -2.2 **doubtful**, D10 -1.8 **doubtful**, C9 -2.1 **doubtful**, D9 -1.9 **doubtful** | Q14 +10.2 (not accepted) | D7 +9.4 (not accepted) | Q14 +1.8, R6 +1.2, R14 +1.6, O16 +1.7, D7 +1.0, D8 +0.1, B6 +0.4 |
| opening-review#1 | whole | O17 -0.2, R14 -0.2, O16 -0.4, Q14 -0.4, N17 -0.3, R13 -0.3 | F17 -0.2 (not accepted) | O17 -0.4 | R6 +0.2, C14 +0.1, O3 +0.2, F17 +0.2, R3 +0.2 |
| opening-review#2 | whole | F17 0.0, C14 0.0, G17 -0.4, C13 -0.5, F16 -0.9, D14 -1.1, O3 -0.1, R6 0.0, N3 -0.5, R7 -0.6, O4 -1.0, Q6 -0.9 | F17 +11.1 | F17 +11.1 | R3 -0.1, C17 -0.2, C6 -0.1, F3 -0.1 |
| joseki-33-invasion#1 | local | D17 0.0 | D17 +0.5 | D17 +0.5 | C16 0.0 |
| joseki-33-invasion#2 | local | C15 -0.8 | C14 +0.5 (not accepted) | C14 +0.5 (not accepted) | C14 +0.8, D15 +0.6 |
| joseki-33-invasion#3 | local | B14 -0.2 | R16 -0.2 (not accepted) | B16 -0.5 (not accepted) | B16 +0.2, C14 +0.1, D14 -0.1, C18 -0.2 |
| joseki-33-invasion#4 | local | C14 -0.2, D14 -0.6 | D15 +5.4 (not accepted) | D15 +5.4 (not accepted) | D15 +0.2 |
| joseki-33-white#0 | local | R3 0.0 | D4 +0.2 (not accepted) | R3 -0.5 | O3 -0.2, R6 -0.2 |
| joseki-33-white#3 | local | S4 -6.1 **loses** | R6 +0.7 (not accepted) | R6 +0.7 (not accepted) | R6 +6.1, Q2 +4.6, O2 +1.5, P3 +1.5 |
| joseki-approach#1 | local | F17 -0.2, C14 -0.2 | D4 +0.2 (not accepted) | C17 -0.5 (not accepted) | C17 +0.2, C16 -0.1, D17 -0.1, D14 -0.2 |
| joseki-approach#2 | local | C14 -0.3 | Q16 +0.8 (not accepted) | E17 +0.2 (not accepted) | E17 +0.3, F16 +0.2, H17 -0.1, G16 0.0, J16 0.0 |
| joseki-approach#3 | local | J17 -0.5 | Q4 +0.2 (not accepted) | D15 -0.6 (not accepted) | D15 +0.5, D17 +0.4, C17 0.0, K16 +0.1, C13 +0.3, D18 +0.1 |
| joseki-attach#1 | local | C16 -0.1 | Q16 +0.5 (not accepted) | E16 -0.2 (not accepted) | E16 +0.1, F16 +0.1, C12 0.0, C13 0.0, D12 0.0 |
| joseki-attach#2 | local | C17 -0.2 | E16 +0.3 (not accepted) | E16 +0.3 (not accepted) | E16 +0.2 |
| joseki-attach#3 | local | D15 0.0, E15 -1.6 **doubtful**, D14 -0.3 | D4 -0.1 (not accepted) | D15 -0.5 | – |
| shape-empty-triangle#1 | local | D5 -3.5 **loses** | F6 +3.7 (not accepted) | F6 +3.7 (not accepted) | F6 +3.5, D7 +1.7, E3 +1.8, E7 +1.5, F4 +2.4, F5 +0.7 |
| shape-empty-triangle#2 | local | E5 -3.1 **loses** | F3 +16.5 (not accepted) | F3 +16.5 (not accepted) | F3 +3.1, G4 +2.9, E3 +2.3, G5 +2.1, C5 +1.0, E7 +0.9 |
| shape-bamboo#1 | local | E6 -5.4 **loses** | G4 +4.0 (not accepted) | G4 +4.0 (not accepted) | G6 +3.6, G4 +5.4, G5 +2.3, E5 +2.9, G7 +2.4, F6 +2.6 |
| shape-bamboo#2 | local | D6 -9.3 **loses** | E3 +19.9 (not accepted) | E4 +18.2 (not accepted) | F4 +9.3, E4 +9.3, D4 +7.4, F5 +6.6, C4 +5.7, D5 +3.1 |
| shape-peep#1 | local | D5 -1.4 | G5 +1.7 (not accepted) | F4 +1.2 (not accepted) | F4 +1.4, C6 +0.6, F5 +0.9, C4 +1.3, F6 -0.1 |
| shape-peep#2 | local | D5 -0.8 | E4 +0.4 (not accepted) | E4 +0.4 (not accepted) | E4 +0.8, E7 +0.6, F3 +0.2, E3 +0.5, C4 +0.3 |
| shape-head-two#1 | local | D5 -1.3 | D6 -6.9 (not accepted) | D6 -6.9 (not accepted) | D6 +1.3, E5 +0.6 |
| shape-head-two#2 | local | E4 -2.3 **doubtful** | F4 +4.2 (not accepted) | F4 +4.2 (not accepted) | F4 +2.3, E5 +1.5, F6 +1.3 |
| shape-ponnuki#1 | local | D5 -3.4 **loses** | E3 +15.0 (not accepted) | E3 +15.0 (not accepted) | E3 +3.4, D3 +2.9, E4 +2.6, F4 +1.4, F3 +0.6, D4 +1.8 |
| shape-jump#1 | local | E10 -0.2 | Q4 -37.7 (not accepted) | D13 -38.3 (not accepted) | D13 +0.2, D7 +0.1, F10 0.0, D12 0.0, D8 0.0 |
| shape-jump#2 | local | G10 -0.6 | Q16 -37.7 (not accepted) | D7 -38.2 (not accepted) | D7 +0.6, G11 +0.3, E7 +0.3, D13 -0.2, F11 0.0, E12 -0.3 |
| endgame-sente-gote#1 | local | C1 -4.8 **loses** | H5 -21.9 (not accepted) | B2 -22.4 (not accepted) | B2 +4.8, C2 +4.6, B1 +2.9, B3 +2.9, C3 +1.3, A2 +1.5 |
| endgame-sente-gote#2 | local | E1 -8.0 **loses** | G2 -1.1 (not accepted) | G2 -1.1 (not accepted) | G2 +8.0 |
| endgame-sente-gote#3 | local | E1 -4.6 **loses** | H5 -1.4 (not accepted) | G2 -2.3 (not accepted) | G2 +4.6, F2 +2.8, G1 +0.1 |
| endgame-double-sente#2 | local | F5 0.0 | B4 +7.8 (not accepted) | F5 +7.6 | D3 0.0 |
| endgame-reverse-sente#2 | local | E1 -4.2 **loses** | G2 -6.6 (not accepted) | G2 -6.6 (not accepted) | G2 +4.2 |
| endgame-order#0 | whole | E4 -1.0 | E1 -8.3 (not accepted) | E4 -9.3 | E1 +1.0, E9 +0.9, D9 +0.9 |
| endgame-order#1 | whole | E1 -1.9 **doubtful** | D9 -6.6 (not accepted) | E1 -8.5 | E9 +1.8, D9 +1.9, C9 +0.4 |
| fight-attack-distance#2 | local | K14 -1.3 | O3 +13.4 (not accepted) | N17 +13.2 (not accepted) | N17 +1.3, G17 +1.2, M17 +1.0, G16 +0.8, H17 +1.0, N16 +0.8 |
| fight-split#1 | whole | J11 -1.4, K11 -1.4, L11 -1.3, J10 -1.4, K10 -1.5, L10 -1.3, J9 -1.3, K9 -1.4, L9 -1.4 | N17 +27.8 (not accepted) | F10 +26.8 (not accepted) | N17 +1.3, N3 +1.2, G17 +1.2, G3 +1.2, O17 +1.1, L14 +0.2, L6 +0.2, J14 +0.2, J6 +0.2, O10 +0.3, F10 +0.3 |
| fight-split#2 | whole | K10 -0.1 | M10 +41.7 (not accepted) | M10 +41.7 (not accepted) | M10 +0.1, K12 -0.1 |
| adv-judge-bigger#1 | whole | H17 -0.1, J17 -0.1, K17 -0.4, L17 -0.5, M17 -0.5, H16 -0.2, J16 -0.2, K16 -0.3, L16 -0.4, M16 -0.4, H4 -1.0, J4 -0.6, K4 -0.5, L4 -0.5, M4 -0.5, H3 -1.3, J3 -0.9, K3 -0.6, L3 -0.5, M3 -0.5 | O3 -0.3 (not accepted) | O3 -0.3 (not accepted) | O3 +0.1, R14 -0.1, G17 -0.1, N16 -0.1 |
| adv-judge-bigger#2 | whole | H4 -0.4, J4 -0.4, K4 -0.3, L4 -0.1, M4 -0.2, H3 -0.5, J3 -0.5, K3 -0.4, L3 -0.1, M3 0.0 | F17 +0.7 (not accepted) | M3 +0.6 | F17 0.0, C6 0.0, G4 -0.2, N3 -0.1 |
| adv-judge-toward-thickness#1 | whole | M17 -0.2, N17 0.0, O17 -0.2, M16 -0.7, N16 -0.4, O16 -0.6 | N17 +0.8 | N17 +0.8 | C12 -0.2 |
| adv-judge-away#1 | whole | Q12 -0.8, R12 -0.8, Q11 -0.7, R11 -0.8, Q10 -0.5, R10 -0.6, Q9 -0.6, R9 -0.6, Q8 -0.8, R8 -0.6 | C17 -0.5 (not accepted) | R14 -0.7 (not accepted) | C17 +0.5, F17 +0.5, O17 +0.5, C16 +0.5, C11 +0.5, R14 +0.3, R13 +0.2, R6 +0.2, Q14 +0.2, R7 -0.1 |
| adv-invade-where#1 | whole | R13 -1.1, R12 -0.8, R11 -0.6 | R6 +1.4 (not accepted) | O16 +1.1 (not accepted) | R6 +0.6, Q16 -0.1, R7 +0.4, F17 +0.3, F3 +0.3, O16 +0.3, S16 +0.1, Q10 0.0, R15 -0.2 |
| adv-invade-where#2 | whole | H3 -1.2, J3 -1.1, K3 -0.7 | O17 +13.4 (not accepted) | L4 +12.8 (not accepted) | C14 +0.6, C6 +0.4, R14 +0.7, F17 +0.5, O17 +0.7, L4 +0.1, G4 +0.1, L6 -0.2 |
| adv-invade-33#1 | local | R17 -0.3 | O17 +13.4 (not accepted) | O17 +13.4 (not accepted) | O17 +0.3, O16 +0.1, R16 -0.1, R14 0.0 |
| adv-reduce-shoulder#1 | local | J16 -0.4, L16 -0.4 | O4 +28.0 (not accepted) | K16 +27.6 (not accepted) | N17 +0.1, O17 +0.1, G17 +0.1, F17 0.0, K16 +0.4 |
| adv-reduce-shoulder#2 | local | J15 -0.5, L15 -1.0, K14 -1.2 | R6 -11.2 (not accepted) | F17 -11.6 (not accepted) | G17 +0.5, F17 +0.5, H17 +0.3, G16 +0.2, J16 +0.3, K15 0.0 |
| adv-middle-attack-gain#1 | whole | C12 -0.3, C8 -0.3, D12 -0.8, D8 -0.8 | R17 +24.5 (not accepted) | C13 +24.3 (not accepted) | R17 +0.3, O3 -0.2, R8 -0.1, N3 -0.1, O17 +0.1, C7 0.0, D10 +0.1, C13 +0.1, C9 0.0 |
| adv-middle-attack-gain#2 | whole | H17 -0.1, M17 -0.1, H16 -0.5, M16 -0.6 | G17 +24.5 (not accepted) | G17 +24.5 (not accepted) | G17 +0.1, N17 +0.1, J16 0.0, K16 +0.1 |

### Read-step claims

| step | claim | KataGo | result |
| --- | --- | --- | --- |
| life-two-eyes#0 | the black group with two eyes is alive | ownership 1 | agrees |
| kill-straight-three#0 | after Black's middle point White is dead | ownership 1 | agrees |
| game-territory#0 | the left side is Black's | ownership 1 | agrees |
| game-territory#0 | the right side is White's | ownership 1 | agrees |
| game-score#0 | White wins by 3.5 | lead -3.3 (Black to play), -3.5 (White to play) | agrees |
| game-dead#0 | the marked white stone is dead | ownership 1 | agrees |
| opening-big-urgent#0 | the urgent cutting point comes before the big empty corner | A +12.8, B +13.1 | agrees |
| endgame-sente-gote#0 | White must block Black's push on the first line | reply G2 | **disagrees** |
| endgame-double-sente#0 | after Black plays the marked point White must connect | reply F5 | agrees |
| endgame-double-sente#0 | after White plays the marked point Black must connect | reply D3 | agrees |
| endgame-reverse-sente#0 | White must answer Black's push on the first line | reply G2 | **disagrees** |
| adv-judge-bigger#0 | A is bigger than B | A -0.5, B -0.6 | agrees |
| adv-judge-toward-thickness#0 | White has lived low inside Black's wall | ownership 0.9 | agrees |
| adv-judge-toward-thickness#0 | the pincer A is better than the press B | A +0.6, B -0.7 | agrees |
| adv-judge-away#0 | extending up the right side (A) is better than along the bottom (B) | A -1.0, B -1.6 | agrees |
| adv-reduce-shoulder#0 | the two shoulder hits are about equal | A +27.2, B +27.2 | agrees |
| adv-middle-attack-gain#0 | A and B are about equal | A +24.2, B +24.2 | agrees |

### Read steps left for human review

- states a rule; the board only illustrates it: stones-board#0, stones-liberties#0, stones-capture#0, stones-suicide#0, stones-ko#0, connect-solid#0, connect-hanging#0, life-eye#0, life-false-eye#0, game-order#0
- a tactical idea that the lesson's problem steps prove with the solver: capture-direction#0, capture-ladder#0, capture-net#0, capture-snapback#0, escape-ladder#0, race-outside#0
- a general principle (opening, shape, joseki, strategy) that a single position cannot prove: opening-corner-points#0, opening-enclose-approach#0, opening-extension#0, opening-pincer#0, joseki-33-invasion#0, joseki-approach#0, joseki-attach#0, shape-empty-triangle#0, shape-bamboo#0, shape-peep#0, shape-head-two#0, shape-ponnuki#0, shape-jump#0, endgame-first-line#0, endgame-japanese-counting#0, fight-cutting-stones#0, fight-attack-distance#0, fight-split#0, fight-leaning#0, fight-sabaki#0, adv-invade-where#0
<!-- generated:end -->
