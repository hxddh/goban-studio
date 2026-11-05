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

## Changes made

(filled in after the first run)

## Disagreements left as they are

(filled in after the first run)

## Latest run

<!-- generated:start -->
<!-- generated:end -->
