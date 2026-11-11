# The training plan

The plan picks one or two things to work on ("this week's focus"), says why,
and orders Practice's path for today around them. It is part of the one
player model, `src/web/js/model/player.js` (`evidence`, `focus`,
`keepFocus`, `learnPath`; pure, tested in `scripts/tests/model-player.mjs`,
`model-progress.mjs` and `learn-path.mjs`). The app side is
`src/web/js/learn/session.js`. The thresholds are `RULES` in player.js.
The space is called Practice in the interface; the code and this page
still say Learn in names such as `learnPath`.

## What counts as evidence

**Your analysed games.** These are the per-game records in
`profile.games`. Each rated game against the computer gets one, and the
post-game analysis completes it. A record keeps the themes of up to ten
explained mistakes (`describeMistakes`: ladder, snapback, double atari, cut,
vital point, eye space, ko, races). It also keeps the points each
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

The grades (shown as Level 1–5) estimate how hard a problem is for a
person (theme, reading that branches, plausible wrong moves;
docs/problems-audit.md, "v13 grading"), not the solver's search effort.

**First sight counts.** A problem adds one result to the level: whether
its *first ever* attempt was a clean solve (`first: "clean" | "miss"` on
the problem record, with `seen`, the time of that attempt). A problem
missed and then solved on a review is still a first-sight miss, so
reviewing cannot raise the level. (The focus above is different: it reads
each problem's latest result, because it is about what is missed now.)
Results count for 60 days from the first sight. Records written before
`first` was kept get it only where it follows from the record — tried
once, or every try a clean solve; any other old record is left out of the
level, not counted as clean.

The level must be consistent (`solvingLevel`). It is the highest grade
(1–5) where

- at least **5** problems were met and the first-sight clean rate,
  smoothed towards the prior level, is at least **60 %**;
- every lower grade with results is at least **50 %**: a lucky run at
  grade 4 over misses at grade 2 is not level 4;
- every lower grade **has results at all, or is covered** by the grade the
  player was started at (the placement grade; without a placement, the
  grade of the rank they gave, `levelPrior`). Results at grade 5 alone
  say nothing about grades 3 and 4, so they cannot make a level 5.

The smoothing adds two pseudo-results at the rate the prior level predicts
(75 % at or below it, 35 % above): the prior is the placement grade when
there is one, so three clean solves of five at the placement's grade
confirm it, while the same at a grade above it do not yet. It is grade 1
when enough problems were tried but no grade qualifies.

Until a grade measures the level (`levelOnGrade`), the path works at the
start grade — the placement, or the rank's grade — and comes **down one
grade** for each grade from there that has 5 first-sight results and a
clean rate under 50 % (`startGrade`, `problems.start`), so a start that
was too high corrects itself. Without a start (a beginner) it is the
lowest grade with unseen problems.

A view that shows the level should ask for it the way the path does:
`evidence(profile, { problems, grades, now, cover: levelPrior(profile, settings, now) })`,
then `levelOnGrade ? level : start`.

## Learn's path

Learn's path for today (`learnPath`) is the next lesson, capture Go while
it applies (beginners), then the day's problem items, then the first 9×9
game while it applies.

**The day's size** is the player's choice: **3, 5 or 10** problem items
(`settings.dailySize`, `RULES.DAILY_SIZES`; 5 by default and for any other
value). `learnPath` takes it as `limit`.

The problem items come in this order:

1. **Due reviews, before anything new**: up to two mistake drills from
   your own games, then due problems, the most forgotten first (see
   "Review" below). How many places they take depends on the backlog (all
   drills and problems whose review date has come):
   - **up to 3 due** (`RULES.SMALL_BACKLOG`): all of them, and at least
     one place stays for a new problem (at most size − 1 reviews);
   - **more than 3 due**: reviews may take every place, until the backlog
     is small again;
   - never more than **12 reviews a day** (`MEMORY.REVIEW_CAP`), counting
     the reviews already done today (`reviewsToday`), so a second session
     on the same day stays within it and fills up with new problems.
2. Problems from the focus themes at the level or one above (with a
   focus). The two themes take turns. These come from the problems your
   lessons have opened. When that set has none for the theme (a
   beginner), the plan takes the easiest problems from the whole bank,
   never above the level.
3. One stretch problem, **exactly one grade above the level**
   (`RULES.STRETCH`), in a focus theme if one exists. None at grade 5, and
   none for a new player whose level is not known.
4. Anything left: new problems at the level (`dailySet`), never reviews
   beyond the share above.

So new problems only come as fast as their reviews are kept up. Simulated
with the real `learnPath` for 60 days (placed at grade 3, 85 % recall on
reviews, 70 % clean at first sight, every day played): the backlog never
passes 10 problems at size 5 (7 at size 3, 14 at size 10), nothing waits
more than three days, and 57, 98 and 206 new problems are met. After
twenty days away the backlog (36) is worked off most-forgotten first, up
to the day's size a day, and new problems return when it is small.

The path is played as today's session and kept for the day in the store
(`session.json`), so it stays the same all day and survives a restart.
With no focus (new players, too little evidence), the problem items are
due reviews, the stretch problem once the level is known, and new problems
at the level.

**For a view.** `reviewLoad(profile, now)` gives the numbers a screen can
show: `due` (reviews offered today, within the cap), `overdue` (the whole
backlog), `drills`, `reviewed` (done today), `mastered`, `learning` and
`newSeen` (met for the first time today). A problem is *mastered* once it
is retired or its stability has reached 21 days and its last result was
not a miss (`isMastered`). `masteryByTheme(profile, problems, grades)`
gives `{ total, mastered, learning, unseen, grades }` per theme.

## Placement

Someone who said at onboarding that they know the rules (or play) is
offered a placement quiz on Learn's home before the first path
(`placementNext`, `placementDone`, `placementGrade`; `learn/placement.js`).
"Not now" and the remembered skip are unchanged.

- **10–12 problems, or 4** (capturing, escaping, killing, living; no
  endgame or opening points), starting at grade 2. A solve moves the next problem one
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
- **Stops at the floor**: when the first **four** answers are all missed
  (grade 2, then grade 1 three times) the quiz ends there at grade 1
  (`placementFloored`). Six more problems would only be six more misses.
- The grade is the highest grade **passed**: solved at least **twice**
  there and missed no more often than solved; **from grade 3 up, solved
  more often than missed** (`PLACEMENT.STRICT_FROM`), so getting half of
  everything right does not place high. Grade 1 when no grade is passed.
  Simulated over 400 quizzes, someone who solves any problem with a 50 %
  chance was placed at grade 3 or 4 in 44 % of them before this rule and
  in 34 % with it (grade 4: 25 % → 17 %); players who solve everything up
  to a grade and nothing above it are placed exactly there, as before.
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

## Review

Spaced review follows a memory model after FSRS (the free spaced-repetition
scheduler, v4.5 formulas with its default weights rounded; `MEMORY` in
player.js), not a fixed ladder of days. Each problem and each
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
leaves review. Overdue items are taken **lowest retrievability first**.
Reviews come before new problems in the path ("Learn's path" above): with
more than three due they take the whole day's size, and at most 12 are
taken in one day across its sessions, so the backlog after time away comes
back over several days, the most forgotten first, and does not grow while
new problems keep arriving.

v9–v12 records (`tries`, `streak`, `due`, `last`) are read by
`migrateProblemRecord` (and drills the same way): the stability is the
ladder interval reached, the due date is kept, so nothing moves on
upgrade. `normalizeProfile` reads both shapes: the profile file is
version 13 (`PROFILE_V`), and a v9–v12 file (`v: 9`) is migrated, not
reset.

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

## Progress (for Today)

Pure functions of the profile, for the views that show progress:

- `ratingHistory(profile, size?)` → `[{ t, size, rating, sd, rank, pm }]`,
  one point after each rated game, oldest first, at most 200. `rating` is
  the estimate in GoR, `sd` its one-sigma half-width in GoR. Points stored
  before the GoR was kept read it from their rank.
- `practiceDays(profile, now, days = 28)` → counts for the last `days`
  local days, oldest first, today last. A day counts when a game was
  finished or a problem or drill was attempted (`profile.days`, a map of
  `yyyymmdd` → count kept by `recordGame`, `recordProblem` and
  `recordMistake`; about 400 days are kept). Days from before the map
  existed are read from the games and problem records the profile still
  has.
- `milestones(profile, content, now)` → the one-time milestones reached:
  the first game, the first 19×19 game, each course unit completed, each
  solving level reached (2–5) and 10, 25, 50, 100, 200, 400 problems
  mastered, with the time each was first reached where known.
  `keepMilestones` stamps the new ones in `profile.marks` and says which
  were new; a level or a count once reached stays reached.

**Games with help are not rated.** `recordGame` takes `undos` and `hints`
(how often the player took a move back or asked for a hint; teaching
mode's own warnings are not hints). A game with any of either is stored
with `assisted: true`: it stays in the list and its analysis still feeds
the focus, but it makes no rating step and no history point, and its
moves are not read as a prior either.

**A game counted again is rated again, not twice.** `model/rerate.js`:
`rateBase(profile, size)` is the estimate's state on a board size before a
game is recorded (the app keeps it with the game's file); `rerateGame(
profile, id, { won, result, opponent, base })` puts that state back, takes
the game's point out of the history and records the game again under its
new result, so a recount that turns a win into a loss leaves exactly what
a loss would have left. `canRerate` allows it only while no later game on
that board size has been rated (a step cannot be taken out of the middle
of the estimate); a game that was never rated can always be recorded
again.

None of this needed a new file version: `first`, `seen`, `days`, `marks`,
`assisted` and a history point's `r`/`sd` are optional additions to the
version-13 profile, and a file without them reads as before.

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
