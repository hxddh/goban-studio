# The training plan

The plan picks one or two things to work on ("this week's focus"), says why,
and orders Learn's path around them. Since v9 it is part of the one player
model, `src/web/js/model/player.js` (`evidence`, `focus`, `keepFocus`,
`learnPath`; pure, tested in `scripts/tests/model-player.mjs` and
`learn-path.mjs`). The app side is `src/web/js/learn/session.js`. The
thresholds are `RULES` in player.js.

## What counts as evidence

**Your analysed games.** These are the per-game records in
`profile.games`. Each rated game against the computer gets one, and the
post-game analysis completes it. A record keeps the themes of up to ten
explained mistakes (`describeMistakes`: ladder, snapback, double atari, cut,
vital point, eye space, ko, races). From v7 it also keeps the points each
theme cost (`themeLoss`). The report and the review explain the same
mistakes, so they agree with the record. Only records with an analysis count.

- The window is the newest 10 analysed games from the last 90 days.
- Recent games weigh more: each game back counts `0.5^(n/5)`, so the game
  five games back counts half as much as the newest one.
- A theme can become a focus once there are **3 analysed games** and it came
  up in **at least 2 of them**. It must also have cost **≥ 6 points**
  (shown as "Lost ≈18 points here in your last 6 games"). Older records don't
  store points. For those the theme must have come up **≥ 3 times**, and the
  plan only says how often.
- *Endgame* comes from the endgame phase loss, and only in KataGo-analysed
  games (confidence "high"). The offline estimate is too rough for phases. It
  needs 3 such games, an average of ≥ 5 points lost per game in the endgame,
  and at least 40 % of all the points lost. Endgame points rank at half
  weight, because they are spread over many moves.
- Before 3 analysed games the plan says "not enough games yet" and does not
  guess.

**Problems and drills.** The plan reads the results in `profile.problems`
and your mistake drills (`profile.mistakes`) from the last 60 days. Each
result weighs `0.5^(days/21)`. A problem counts as *missed* when its last
result was not a clean solve: a wrong move, a hint, the answer, or a solve
after a miss. A theme needs **4 tried**, a weighted miss rate of **≥ 50 %**
and, once 10 or more problems have been tried, a rate **15 points above
your usual**. A generally hard week therefore does not single out one
theme. A missed problem ranks like a 3-point mistake.

**Ranking.** Only claimed evidence adds to a theme's score. The two
highest-scoring themes become the focus. `race-shared` counts as *race*, and
the endgame problem themes count as *endgame*.

**Stable for the week.** The focus is worked out from the evidence as it
stood on Monday 00:00. If there was no focus on Monday, it uses what there
is now. This week's games therefore change next week's focus, not today's. Once a focus has been shown in a week it is
kept for the rest of that week (`profile.week`): a problem record only
keeps its latest attempt, so reviewing last week's misses would otherwise
erase the evidence the focus came from.

## Solving level

Since v13 the grades estimate how hard a problem is for a person (theme,
reading that branches, plausible wrong moves; docs/problems-audit.md, "v13
grading"), no longer the solver's search effort.

The level must be consistent (v13, `solvingLevel`). It is the highest grade
(1–5) where at least **5** problems were tried and the clean-solve rate,
smoothed towards the prior level, is at least **60 %**, and every lower
grade with results is at least **50 %**: a lucky run at grade 4 over misses
at grade 2 is not level 4. The smoothing adds two pseudo-results at the
rate the prior level predicts (75 % at or below it, 35 % above): the prior
is the placement grade when there is one, so three clean solves of five at
the placement's grade confirm it, while the same at a grade above it do
not yet. It is grade 1 when enough problems were tried but no grade
qualifies. Without enough results it falls back to the lowest grade with
unseen problems, the same rule as before v7.

## Learn's path

Learn's path for today (`learnPath`) is the next lesson, capture Go while
it applies (beginners), then up to five problem items, then the first 9×9
game while it applies. With a focus, the problem items come in this order:

1. Due reviews: up to two mistake drills from your own games, then due
   problems, the most forgotten first (see "Review" below). They take at
   most three places.
2. Problems from the focus themes at the level or one above. The two themes
   take turns. These come from the problems your lessons have opened. When
   that set has none for the theme (a beginner), the plan takes the easiest
   problems from the whole bank, never above the level.
3. One stretch problem, two grades above the level, in a focus theme if one
   exists.
4. Anything left: new problems at the level (`dailySet`).

The path is played as today's session and kept for the day in the store
(`session.json`), so it stays the same all day and survives a restart.
With no focus (new players, too little evidence), the problem items are
due reviews and new problems at the level.

## Placement (v10, v13)

Someone who said at onboarding that they know the rules (or play) is
offered a placement quiz on Learn's home before the first path
(`placementNext`, `placementDone`, `placementGrade`; `learn/placement.js`).
"Not now" and the remembered skip are unchanged.

- **10–12 problems** (capturing, escaping, killing, living; no endgame or
  opening points), starting at grade 2. A solve moves the next problem one
  grade up, a miss one grade down, never above grade 4. The first answer
  to each counts; a hint or the answer counts as a miss.
- **Drawn per player**, not in the bank's order: among the problems at the
  target grade the quiz prefers a theme and then a topic not asked yet,
  and draws by a seed made when the quiz starts (tests pass their own, so
  a quiz is reproducible). At least **3** are life and death (kill or
  live): once the problems left before the tenth would not reach three
  otherwise, only those are drawn.
- **Stops early when stable**: after 10 problems, the quiz ends if the
  grade it gives has not changed over the last three answers; otherwise it
  goes on to 12.
- The grade is the highest grade **passed**: solved at least **twice**
  there and missed no more often than solved; grade 1 when no grade is
  passed.
- **Capped at about 10 kyu.** The grades are estimates, not measured on
  people, and a dozen problems cannot place higher: grade 4 is the
  highest placement and stands for 10 kyu (`PLACEMENT_RANK`: 1 → 30 kyu,
  2 → 18, 3 → 13, 4 → 10). A v10–v12 placement of grade 5 reads as 4.
  Before any problem, a rank gets the grade it should solve comfortably
  (`gradeForRank`: 19 kyu and weaker grade 1, 14–18 kyu 2, 11–13 kyu 3,
  7–10 kyu 4, stronger 5). Only the player's own results (the solving
  level, rated games) move them further.
- It is kept in the profile (`profile.placement`). Until the player's own
  results measure a solving level, it stands in for it, and it sets where
  the course starts (grade 3 and up start at the intermediate units; the
  placement alone never sends anyone to the advanced ones) and whether the
  beginner bridges apply (not from grade 2).
- The quiz's own answers are recorded like any problem, but they do not
  outrank it: until some grade has enough results to measure a level
  (`levelOnGrade`), the placement stands. The problems come from the whole
  bank from grade 2, not only from the topics of finished beginner lessons.
- Skipping is remembered; the path then starts from what onboarding said.

## Review (v13)

Spaced review follows a memory model after FSRS (the free spaced-repetition
scheduler, v4.5 formulas with its default weights rounded; `MEMORY` in
player.js) instead of the fixed 1-3-7-21 day ladder. Each problem and each
drill from your games keeps a **stability** (days until the chance of still
solving it falls to 90 %) and a **difficulty** (1–10). Each first answer of
a visit is graded:

- **again**: a miss, a hint or the answer;
- **hard**: solved in the same visit after a miss, without hint or answer
  (the miss is re-graded from the state before it, so a slip put right at
  once is not a full lapse);
- **good**: a clean solve;
- **easy**: a clean solve within 10 seconds.

The next review comes when the chance of solving has fallen to 90 %, about
`stability` days later. A first clean solve comes back in 4 days; clean
solves when due then wait about 4, 16, 53 and 158 days, so intervals grow
far past 21 days. A miss shrinks the stability instead of resetting it: a
problem known for seven weeks comes back in about five days, not tomorrow.
A problem whose stability passes **180 days** retires: it is known and
leaves review. Overdue items are taken **lowest retrievability first**, and
at most 12 problems a day count as due, so the backlog after time away
comes back over several days, the most forgotten first.

v9–v12 records (`tries`, `streak`, `due`, `last`) are read by
`migrateProblemRecord` (and drills the same way): the stability is the
ladder interval reached, the due date is kept, so nothing moves on
upgrade. `normalizeProfile` reads both shapes: the profile file is now version 13 (`PROFILE_V`), and a v9–v12 file (`v: 9`) is migrated, not reset.

**Shown differently.** A problem tried before comes back turned or
mirrored (one of the eight board symmetries) and, except endgame
problems, half the time in the other colour, so White plays and the
title and hint name the colours the other way round
(`learn/transform.js`, `reviewTransform`). The id stays, so the result
belongs to the same problem. The first showing and the placement quiz use
the problem as written. The transform is chosen from the id and the
number of tries, so a review looks the same after a restart and different
the next time. `scripts/check-transforms.mjs` proves every problem under
the transform (docs/problems-audit.md, "Review transforms").

**Misclicks.** With "Confirm moves in problems" (Settings → Playing) the
first click on a problem board only shows the stone; a second click on
the same point plays it, a click elsewhere moves it, Esc takes it away,
as the two-click stone in Play.

## What it cannot know

- It knows only games analysed in this app. Games against people, imports
  and unanalysed games add nothing. Mistakes in classics you review are not
  yours.
- The themes are pattern guesses read from KataGo's punishing line. A
  strategic mistake (a slow move, the wrong direction) has no theme, so
  "tempo" never becomes a focus. Only the endgame phase is measured as a
  phase.
- Points come from KataGo at review strength and can be off by a point or so
  per move. That is why the app always shows them with ≈.
- A problem missed once because of a misclick counts as a miss. The plan
  cannot tell a slip from not knowing; "Confirm moves in problems" prevents
  the slip instead.
- The grades and the memory model's weights are set by hand and from
  published defaults, not fitted to people using this app.
