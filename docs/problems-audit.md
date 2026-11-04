# Problem audit (v4): real-board rules

Until v4 the solver proved life-and-death problems with a fixed region: once
a stone was captured, its point stayed out of play. On a real board that
point can be played again (retake, throw back in, fill the eye), and a
player could refute an answer that relied on it. Life and kill problems were
also allowed to have key stones that reach a `,` point, an empty point
outside the problem that nobody may play: such a group "lives" because a
liberty can never be filled, which is open board an opponent could take.

The audit made both rules part of every proof and fixed or removed every
problem that broke one of them.

## What changed in the solver

- `replay` (captured points are playable again) is the default for every
  problem. `scripts/check-problems.mjs` and `scripts/check-course.mjs`
  reject `replay: false`.
- `outsideReach()` spreads from the key stones over empty points, their own
  stones and (for life and kill problems) attacker chains that could be
  captured. If it reaches a `,` point, or a defending chain with a liberty
  there, the check fails. Capturing races spread over empty points and own
  stones only: a race's outside walls are taken as alive, and once the key
  stones capture the stones they race against, the race is over.
- A key chain with a liberty outside the region can never be captured, so
  the search stops there (`keysOutOfReach()`). Thanks to the rule above it
  only fires in races, after the key stones have captured their way into
  their own wall. Moves that make that connection are read first.
- Search results that depend on superko (a move skipped because it repeats a
  position earlier in the line) are no longer cached, so another line
  reaching the same position reads it again. This is the graph-history
  problem. Without the fix, two answer lines (`life-vital-02`, `life-ko-06`)
  wandered into a loss once captured points could be retaken.
- Benson's test runs on the diagram plus a two-line margin with reused
  buffers, and its result is cached per position. On 470,706 random
  positions it agreed with the old full-board version every time.

With replay on, the old solver needed 127 s for the problem check, and five
races took 4 to 32 s each. The check now takes about 16 s on a loaded
4-core machine. The slowest problem takes 0.85 s, against the 1.5 s
limit. No problem raises a node budget, and every race is proved with
replay. None needs an exception.

## How each problem was classified

Every problem was solved with replay on, at the normal budget and again at
a 30× budget and twice the depth limit. A failure that persisted at the
large budget was a wrong problem. The one that went away (`kill-placement-13`,
depth only) was a budget problem, and it was fixed with a sealing stone. In
the end every failure was a real rules failure: an answer that needed a
captured point to stay empty (the opponent retakes or throws in), a start
that was already decided, more than three correct first moves, or a group
that lived only through an outside liberty.

Fixes were searched for automatically: every one- and two-point edit, plus
sealing the reached `,` points with an attacker stone. A fix was accepted
only if it kept the original answer (or a subset of it) and the theme,
looked like a natural shape, and passed every check. Each one was then
reviewed by eye.

## Outcome

262 problems remain out of 299. All kept ids are unchanged. The grades were
remeasured: 53 / 55 / 58 / 49 / 47 (before: 57 / 61 / 63 / 63 / 55).

**Fixed (17)**, all with one or two stones changed:

| id | change |
| --- | --- |
| kill-false-eye-06 | white stone added inside: the old answer let White retake |
| kill-placement-05, kill-placement-07, kill-vital-04 | a black stone seals the `,` point White lived through; the answer moved to the real vital point |
| kill-placement-06, kill-placement-13 | white stone added; one of the two old answers was refuted by a retake |
| kill-placement-08 | stray white stone removed (start was decided under real rules) |
| kill-placement-17 | black stone added on the edge (the old answer lost to a recapture) |
| kill-vital-01, kill-vital-05 | white stone added (5 and 6 correct first moves under real rules) |
| life-vital-03, life-ko-07 | black stone added (dead from the start once captured points could be replayed) |
| life-capture-eye-14, life-capture-eye-15 | a white stone removed, so the captured stone's eye is real |
| race-05, race-14, race-15 | white fills the shared liberty: with it open, Black won even moving second |

`life-vital-02` and `life-ko-06` needed no content change, only the
superko fix above.

**Removed (37)**: no clean fix existed, or the only fixes changed the
problem's idea or made it trivial.

- `life-expand-01` … `life-expand-15` (15). Every one lived only through a
  `,` point at an open end of the eye space. Sealed, every one is dead (a
  real hane from that point kills), and no one- or two-point edit revives
  one with the same answer.
- `kill-hane-01`, `kill-reduce-01`, `kill-reduce-02`, `kill-reduce-04`,
  `kill-reduce-05`, `kill-reduce-06`. The defender lived only through an
  outside liberty. Sealed, the group is dead already or has 5 to 9 killing
  moves.
- `kill-false-eye-01`, `-02`, `-03`, `-05`. The atari that "made the false
  eye" is answered by a retake on the captured point, and the defender
  lives.
- `kill-ko-02`, `kill-ko-03`, `life-ko-01`, `life-ko-04`. Under real rules
  these are no longer kos (a win without ko, or no ko at all), or they
  relied on an outside liberty.
- `kill-rectangle-six-02` (dead before Black moves, and the repaired shape
  is `kill-rectangle-six-01`), `kill-placement-12`, `kill-placement-16`,
  `life-vital-06`, `life-vital-11`, `life-capture-eye-18`, `race-32`,
  `race-33` (Black won the race even moving second).

**Kept unchanged (245)**. Thirteen of these now list a different set of
correct first moves under real rules (an extra or a lost alternative, still
one to three), for example `kill-placement-01`, `kill-ko-01`, `life-ko-03`
and `kill-reduce-03`. Their stored grades were remeasured.

**Course.** Three race lessons (`race-read`) had four correct first moves
under replay. A white stone next to Black's corner stones fixes them. In
`life-side`, Black's block on the first line lived only through an outside
liberty; it is now a six-stone group that White's first-line stone wants to
crawl under. All 151 steps pass, and life steps are checked for outside
reach too.

## Saved progress

Removed ids simply stop appearing. Topic, theme and daily lists are built
from the current problem list. The spaced-review queue iterates current
problems. A daily set saved earlier today that names a removed problem
drops it and keeps the learner's place (`todaysDaily()` in
`practice-ctl.js`). No course lesson referenced a removed problem.

## Remaining limits

- `,` points are still never played. Races assume both outside walls are
  alive, and a capture problem's diagram bounds the chase, as before.
- The theme `eye-space` is down to 5 problems, and `false-eye` to 4. New
  sealed "widen the eye space" problems would need new shapes, because the
  old ones are dead on a real board.
- Ko is still decided by the ko-master model. Every ko counts against the
  learner unless the problem says `ko: "ok"`.

# v5: 509 problems

v5 adds 247 problems to the 262 that passed the v4 audit, for 509. Every
one is proved by the same check as before (`scripts/check-problems.mjs`):
real-board rules (`replay`), sealed life and death (`outsideReach()`), one
to three correct first moves, an answer line that wins, a measured grade, no
duplicate under the 8 symmetries or colour swap, and the per-problem time
limit. No existing problem changed: the 262 kept their ids, diagrams,
answers and scores.

## Themes

| theme | v4 | v5 | | theme | v4 | v5 |
| --- | --- | --- | --- | --- | --- | --- |
| vital-point | 65 | 93 | | net | 11 | 23 |
| placement | 28 | 54 | | escape | 9 | 21 |
| eye-space | 5 | 23 | | cut | 6 | 18 |
| seki | 13 | 23 | | connect-and-die | 6 | 18 |
| race | 10 | 22 | | atari | 7 | 17 |
| ladder | 19 | 22 | | connect | 6 | 16 |
| capture-eye | 16 | 21 | | capture-to-save | 5 | 15 |
| false-eye | 4 | 19 | | double-atari | 6 | 15 |
| ko | 10 | 19 | | throw-in | 6 | 15 |
| race-big-eye | 3 | 16 | | snapback | 6 | 14 |
| race-outside | 10 | 12 | | race-eye | 5 | 7 |
| shortage | 6 | 6 | | | | |

The thin themes are filled: eye-space 23, false-eye 19 (15 new, 2 of them
"keep the eye real" life problems), ko 19 (5 kill and 4 live with a ko;
`ko: "ok"` only on these, as the check enforces), seki 23 (10 new, 9 of
them in grades 1 to 3, so seki no longer starts at grade 4) and big eye
against small eye 16. Topics: kill 143, life 109, capture 76, race 57,
technique 53, escape 38, connect 33.

## Grades

The grade cuts (`GRADE_CUTS` in `problems.js`) are again the quintiles of the
set's measured scores: 6.1 / 7.6 / 9.1 / 10.8 (v4: 6.1 / 7.7 / 9.5 / 11.6).
Grades 1 to 5 hold 100 / 103 / 98 / 103 / 105 problems (the new problems:
47 / 52 / 47 / 61 / 40). With the lower cuts, 33 v4 problems moved up one
grade; none moved down. The largest theme share of any grade is 24%
(vital-point in grade 5), under the 40% limit.

## How the new problems were made

They were not written one by one. Small generators built candidate
positions in a canonical frame (the top-left corner or the top edge), the
solver proved them, and the survivors were filtered, placed on the board
and reviewed:

- **Life and death.** A random eye space along the edge or in the corner
  (three to eight points on the first two or three lines), a solid defender
  wall around it and an attacker wall outside that, so the region is sealed
  by construction. Variants open one first-line end, cut the wall at one
  point (the source of the false-eye problems), or place up to three stones
  of either colour inside the eye space; every placement was tried, not
  sampled. Themes come from the answer: a kill inside the eye space is
  `placement`, a move against the outer wall is `eye-space` (reduce or
  widen), a capture that makes an eye is `capture-eye`, a learner move that
  takes or protects the diagonal point of an eye whose stones are not
  connected is `false-eye`. A named shape tag is given only when the
  defender's whole eye space is exactly that shape and the answer is its
  vital point.
- **Seki and ko.** The same frames with attacker stones inside, under goal
  `seki`, or with the learner as ko master (`ko: "ok"`). The check then
  proves there is no independent life (seki) or no unconditional answer
  (ko).
- **Races.** Two blocks racing along the edge, with the walls of both
  colours outside, outside liberties grown from the closing row, shared
  liberty columns and eyes of 1 to 5 points (straight and bent three,
  square and pyramid four, bulky five). `race-eye` is only used when Black
  has the eye and White has none, since that is what its hint says; `race-
  outside` only when every correct move is an outside liberty.
- **Tesuji.** A white key chain of one to three stones near the edge with a
  few stones of each colour around it (or the mirror for escape problems),
  on an open diagram as in v2. The answer line is replayed to name the idea:
  a first stone that White captures and Black retakes on the same point
  (snapback), a sacrificed first stone (throw-in), two chains in atari at
  once, a first move that does not touch the key stones (net), a run of
  ataris (ladder), an atari that White extends into a bigger capture
  (connect and die), a move between two white chains (cut), and for escape
  problems a capture, a connection or an extension.

Filters before review: a unique answer (two at most for life and death;
three only in a few races), a solver score of at least 3 (no "the stones are
already in atari" positions), no attacker stones stranded on the first line
inside the group, no near-copies (two or fewer points different from an
earlier pick of the same kind), and a proof under 0.4 s when generated and
under 0.6 s on the board. Life, live-ko, seki and escape positions were
generated with White to play and were colour-swapped, so Black is always the
learner. Each problem was then placed in one of the four corners or on one
of the four sides; proof time depends on move order, which follows the
coordinates, so a slow orientation was swapped for a fast one. The slowest
new problem takes 0.31 s on a loaded 4-core machine (the slowest overall is
still a v4 ladder at about 0.55 s), and the whole check takes about 17 s.

Every pick was looked at as a diagram with its answer and line; 30 were
rejected by eye (odd stones inside the wall, three near-identical false-eye
shapes, trivial races) and replaced. One new id, `life-capture-eye-18`, had
been used by a problem removed in v4, so the new problem is
`life-capture-eye-23`; new ids otherwise continue after the highest v4
number of each family and never reuse a removed id.

## What was added beyond themes

- 8 more classic-shape problems (straight three, bent three, bulky five,
  rabbity six; 28 in all). The shapes are now defined point by point in the
  comment above `SHAPES`.
- `kill-two-one-01` … `-06`: corner kills whose answer is the 2-1 point,
  with their own title and hint (`problem.twoOne.*` in `messages.js`).

## Skipped, and why

- **Endgame (yose).** The solver answers a yes/no question (are the key
  stones captured?). A sound endgame problem needs a scoring search to the
  end of every line, a choice of counting (Japanese territory counting and
  area counting differ by a point in exactly the small sealed regions such a
  problem uses), and a different result in the app (a score, not
  "solved"/"lost"). That is a new solver mode and new practice screens, not
  content, so no endgame topic was added.
- **L-group, J-group, carpenter's square, comb shape.** I could not pin down
  their exact textbook diagrams with certainty, and the one reconstruction
  tried (the carpenter's square) was killed outright instead of giving its
  known ko, so naming any of them could mislabel a problem.
- **Bent four in the corner.** Still not accepted as life or as a kill: the
  solver resolves it as a ko, while Japanese rules call it dead.
- **Under the stones.** The solver handles it (captured points are back in
  play), but no problem is built on it. Replaying every answer line, the
  only ones where the learner plays on a point from which two or more of
  their own stones were just captured, and captures, are `race-55` (filling
  White's three-point eye, the usual way a big eye is filled) and the v4
  `life-ko-06`; neither is the tesuji. I did not hand-make one I could check
  move by move.
- **Ladder breakers.** A capture problem's chase is bounded by its diagram,
  so a ladder breaker has to sit inside it; only three new ladders were
  added, none built around a breaker. Grade 5 already holds most ladders.
- **Shortage of liberties, eye versus no eye, outside liberties.** These
  grew little or not at all (6, 7, 12): the generators found few clean
  cases, and the thin themes named above came first.

## Remaining limits

- The tesuji positions are small and open, like the v2 ones: a key chain and
  a handful of stones on an otherwise empty edge or corner.
- Themes of generated problems come from the rules above, not from a
  teacher; a few labels (for instance `eye-space` for a live problem whose
  answer blocks a hane rather than widening the space) are approximate.
- The review was done by a language model, not a strong human player.

# v6: Advanced course

v6 adds an advanced course for players around 5 kyu to 1 dan
(`src/web/js/content/course-advanced.js`, units with `level: "advanced"`,
after the intermediate units): 5 units, 15 lessons, 46 steps (21 problem,
11 place, 14 read). No earlier lesson changed; the course is now 18 units,
80 lessons and 288 steps.

## Standard of proof

- **Tactics are problem steps.** Every tactical claim is a solver problem,
  checked by `scripts/check-course.mjs` like every other lesson problem
  (real-board rules, sealed life and death, one to three correct first
  moves, a winning answer line, under two seconds). For the advanced units
  the check also runs the full `validate()` of the problem bank: the start
  is not already decided, a `ko: "ok"` step must be a ko (no unconditional
  answer exists, a ko does), and a `goal: "seki"` step must end in a
  position `sekiInfo()` calls seki, with no independent life from the
  start. The slowest advanced problem takes about 0.1 s.
- **Strategy is stated as a principle.** Place steps on a 19×19 board
  (which side is bigger, attacking toward your thickness, keeping away from
  the opponent's, where to invade, the shoulder hit, the extension that also
  attacks) say "usually", give the reason, and accept every point the
  principle points to (a block of points, not one move). The positions were
  built so that the principle is the deciding factor: every corner is
  already settled, and the other stones are far away. None of them claims
  what an engine would play.
- **Text that describes a problem matches its answer line.** Each problem's
  answer line (`node scripts/check-course.mjs --lines`) was replayed, and the
  text only names the techniques that line actually contains (a throw-in
  that White captures, a later snapback, a connection that dies, a play on
  the point where two black stones were captured).

## What was included

| unit | lessons | proved by the solver |
| --- | --- | --- |
| Whole-board judgement | which side is bigger; drive it toward your thickness; keep away from the opponent's thickness | a stone next to a wall is captured, for either colour |
| Invasion and reduction | where to invade; the 3-3 invasion; reducing with a shoulder hit | the invader's corner lives with one move |
| Advanced life and death | dead, ko or alive; life and death with a ko; seki in the corner | a five-point corner shape dies; one more point down the side makes it a ko; a second shape dies without ko and becomes a ko with one more point; a corner lives by ko; two corner sekis |
| Tesuji in combination | throw-in and snapback; throw-in and connect and die; under the stones; practice | two throw-in → snapback, two throw-in → connect and die, two under-the-stones, three mixed |
| Middle-game strategy | attack to gain; sacrifice to take sente | two captures that need a sacrifice on the way |

The corner shapes were found by enumerating second-line corner groups
(eye space along both edges, ends standing or blocked by a hane) and
proving each one dead, ko or alive with the attacker to play and no outside
liberties. The tesuji positions were found by exhaustive search over the
first two lines of a corner or a side (every first- and second-line point
empty, black or white, a black wall on the third line), keeping positions
with a single correct first move whose answer line contains the
combination; they were then mirrored into different corners.

## What was left out, and why

- **The L group (by name).** One of the corner families behaves exactly as
  the L group is said to (dead; ko with one more point; alive with two), and
  that progression is the first life-and-death lesson. I could not confirm
  that its diagram is the textbook L group, so the lesson does not use the
  name. The same holds for the J group and the comb shape.
- **Carpenter's square.** As in v5: I could not pin down its exact diagram,
  and its known result (ko, depending on outside liberties) is exactly the
  kind of claim a wrong reconstruction would get wrong.
- **Outside liberties changing a result.** Tried on the L-like shapes: one
  outside liberty left both the dead and the ko shape as they were, so there
  was no clean "with a liberty it lives" pair to show.
- **A sealed 3-3 invasion fight.** Corner regions large enough for a real
  3-3 sequence were either decided from the start or too slow to prove (over
  30 s), so the 3-3 lesson teaches the point and the decision in words and
  proves only the small corner life that follows an invasion.
- **Room for an invasion on the side.** A one-stone invader between two
  walls on the first two lines was dead at every width tried (3 to 7), so a
  "this much room lives, this much dies" pair could not be built that way.
- **Net, then ladder.** Searches from the bank's net and ladder problems
  found long ladders but no line where a net leads into a ladder; the course
  keeps the net and the ladder as the intermediate lessons have them.
- **Direction of approach** ("approach from the wider side", "pincer from
  the side of your enclosure"). The common principles point in different
  directions in ordinary positions, and choosing between them needs a strong
  engine, so no place step relies on them.
- **Whole-board counting and "which move is bigger" in points.** The
  judgement lessons compare sides by what a move does (extends and stops an
  extension), not by a number of points: no number could be backed without a
  strong engine.

## Next lesson

`nextLesson()` (`pickNextLesson()` in `src/web/js/app/course-path.js`) sends
a player whose estimated level (the rating from their games, or the level
they gave) is 5 kyu or stronger to the advanced course when they have
finished the intermediate course or never started it. A strong player part
way through the intermediate course finishes it first. Weaker players are
not moved past the basics. The daily five is unchanged: it looks only at
the beginner units.

## Remaining limits

- The tesuji positions are small edge positions, like the problem bank's:
  a key chain on the first two lines and a wall.
- The strategic steps are a model's reading of standard principles, not a
  strong player's review. Each one names the reason and accepts a range of
  points, but a strong player should still review the positions.

# v6: endgame problems and a counting solver

v5 skipped endgame problems because the solver could only answer a yes/no
question. v6 adds a counting mode to the solver (the counting section at the
end of `src/web/js/solver.js`) and 34 endgame problems proved by it, in a new
Practice topic, Endgame. No existing problem changed: the 509 kept their ids,
diagrams, answers and stored grades (`problem-grades.json` only gained the 34
new entries).

## The counting mode

An endgame problem (`goal: "endgame"`) is a sealed region and a question.
The solver proves the answer by exact minimax counting of the region under
Japanese counting: the score is territory plus prisoners, Black's minus
White's, and play goes on until both sides pass, so sente, gote, reverse
sente and the value of every follow-up are read out rather than estimated.

- **The region.** '.' points are played; ':' points (new in v6) are counted
  at the end but never played, except to capture: the inside of a
  territory, where a stone could only be dead. ',' points are outside. No
  '.' or ':' point may touch a ',' point, so every area is sealed, and the
  walls (chains with a liberty on a ',' point) can never be captured.
- **Moves.** Captures, no suicide, simple ko with no ko threats for either
  side. A point where a stone has been captured stays closed to that colour
  for the rest of the line, which keeps every line finite with no superko
  bookkeeping (and makes taking a ko final). A player does not fill an area
  their own stones alone enclose (unless a chain of theirs there has one or
  two liberties), and does not play into one the opponent alone encloses
  (unless the stone captures): in areas this small such a stone is dead,
  and under Japanese counting it only hands over a prisoner.
- **The end.** Two passes end the play. A chain that the other colour alone
  encloses, with no connection to its own wall, is dead; so is a chain in
  atari whose last liberty the other side may play (its owner chose not to
  save it). Dead stones are prisoners. Empty areas enclosed by one colour
  are its territory; areas touching both are neutral. Passing a second time
  is not allowed while the end would be unsettled (two chains of different
  colours in atari touching each other) and a move is left.
- **Exactness.** An unsettled end that cannot be avoided is scored twice,
  as a huge win and as a huge loss for Black. Minimax is monotone in the end
  scores, so when both give the same value, no unsettled end can change it.
  The check requires this for every count it uses.
- **Speed.** Separate sealed areas never interact, so each is read once as a
  graph of local positions with each colour's moves, and the search runs
  over tuples of local positions with null-window tests and a bounds table.
  The slowest endgame problem (a monkey jump) takes about 0.25 s.

Two questions are asked. `ask: "move"`: Black to play, the rest of the board
settled; the learner must play the biggest move and then keep playing until
nothing is left to gain. `answer` lists the correct first moves and `margin`
how many points the best move gains over the best other choice, passing
included; the check proves both. `ask: "value"`: how many points is Black's
best move here worth? `value` is the deiri count, Black's result with Black
first minus Black's result with White first, as the course counts values
(glossary: "the course does not use miai counting"); `choices` are the four
values offered.

The check (`scripts/check-problems.mjs`) also requires: topic, goal and an
endgame theme go together; `theme: "deiri"` exactly for value questions; one
to three correct first moves; the best move strictly better than passing;
and the solution line legal and keeping the best count. The duplicate check
keeps the stones' colours for endgame problems (Black always plays first).

## Textbook values the solver reproduces

Each area used in a problem was also proved with its ':' points turned into
'.' points (every point playable). The value, the best move and the margin
were the same every time:

| area | value (deiri) | line, Black first / White first |
| --- | --- | --- |
| first-line hane and connect (3 widths) | 2, gote | hane, block, connect / the mirror |
| sente first-line push (2 widths) | 1 | push, White blocks / White's move is gote |
| reverse sente block (4 shapes) | 1 | Black's block is gote / White's push is sente |
| atari on a first-line stone | 1 | atari, White connects / White's move is gote |
| sente capture of a stone in atari (2 shapes) | 3 | capture, White blocks / White connects |
| first-line descent | 1 | descent, White blocks |
| double sente | 2 | atari, connect / atari, connect |
| monkey jump (2 shapes) | 4 | the large knight's slide is the only best move |
| two second-line boundaries | 4 and 5 | value questions only |

The first three match the values the intermediate course already states
(the hane and connection is gote and worth 2; the push is sente and worth
1; double sente is worth 2). The monkey jump is worth 4 here because the
areas are small; in a wider area it can be worth more, and the problems
state only the solver's count. `scripts/test.mjs` checks the hane and connection,
the push, the block, double sente, the dead-stone rules, and that the ':'
points give the same proof as playing them out.

## The 34 problems

| theme | problems | kind |
| --- | --- | --- |
| hane-connect | 3 | find the hane |
| sente-gote | 7 | four one-area sente moves; three "sente before gote" sums |
| reverse-sente | 4 | block the opponent's sente push |
| double-sente | 4 | one area; three sums where double sente comes first |
| monkey-jump | 2 | the jump is the only best move |
| endgame-compare | 4 | sums of two or three areas: the biggest move |
| deiri | 10 | how many points (values 1 to 5) |

Grades 1 to 5: 6 / 12 / 3 / 8 / 5, by the counting difficulty score
(moves to find, tempting wrong moves, number of areas, how close the best
other choice is, the size of the proof; for a value question, the value and
the length of both lines), bucketed by the existing `GRADE_CUTS`. The cuts
were not moved, so no v5 grade changed.

How they were made: the areas above were drawn by hand and checked one by
one; then sums of two or three of them were built along the edges of the
board and kept only when the solver found a single best first move. The
"sente before gote", "double sente first" and "biggest move" problems are
those sums, and each theme was given only when the proved answer is that
idea (the sente move, the double sente point, the largest move). Every
problem was looked at as a diagram with its solution line.

## Skipped, and why

- **Reverse sente in a sum.** With these small areas a reverse sente of 1
  and a gote of 2 come out exactly equal (as the textbook rule that reverse
  sente is worth twice a gote move of the same count says), so no sum tried
  had the reverse sente as its single best move. Reverse sente is taught by
  four one-area problems instead.
- **Second-line hane and connect, and other wide boundaries.** With the
  inside of the territory counted but not played, several such shapes gave
  a different count than with every point playable, so they were dropped.
  Only the two second-line shapes whose counts agreed are used, as value
  questions.
- **The monkey jump in sums, and a third monkey jump.** Its area is large
  (up to 18,000 local positions), and sums with it took 10 to 40 s; a third
  shape took 1.2 s alone, too close to the per-problem limit.
- **A one-point gote move** to compare with reverse sente: none of the
  small shapes tried was cleanly gote for both sides.

## Course: leaning attack and sabaki

Two lessons were added to the fighting unit, after the three v5 lessons
(no lesson id changed): `fight-leaning` and `fight-sabaki`. The solver cannot
prove that the opponent must answer a leaning move (that is about stones
other than the key stones), so the leaning lesson proves what the leaning
gains: two capture problems where the stones Black gained by leaning on a
white stone at the upper right make the capture of the cutting stone work.
For each, the same position without those black stones was proved to fail.
The sabaki lesson proves a sacrifice (save the main stones; running with
the lone stone in atari does not save them, as the exact first-move search
shows) and a quick life on the edge (straight three: the middle point). All
four steps pass the course check; the course now has 67 lessons and 248
steps.

## Remaining limits

- The model has no ko threats: a ko is won by whoever takes it first. No
  line the app shows (the answer, Black first, White first) contains a ko;
  one sum whose line did was replaced.
- The counting is local: "the rest is settled" means no other move is
  worth anything. With a hotter rest of the board, the best order of some
  sums could change; the problems ask about the position as drawn.
- The ':' points rest on judgement (nobody would play there); the areas
  were checked against the fully playable version, the sums were not (too
  slow to read with every point playable).
- The review was done by a language model, not a strong human player.
