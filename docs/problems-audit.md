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
