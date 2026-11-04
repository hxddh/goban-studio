# The training plan (v7)

The plan picks one or two things to work on ("this week's focus"), says why,
and fills today's five with them. The model is `src/web/js/app/plan.js`
(pure and tested in `scripts/tests/v7-plan.mjs`). The app side is
`plan-ctl.js`. The thresholds are `RULES` in plan.js.

## What counts as evidence

**Your analysed games.** These are the per-game records in
`progress.games`. Each rated game against the computer gets one, and the
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

**Problems and drills.** The plan reads the results in `progress.problems`
and your mistake drills (`progress.mistakes`) from the last 60 days. Each
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
kept for the rest of that week (`progress.planWeek`): a problem record only
keeps its latest attempt, so reviewing last week's misses would otherwise
erase the evidence the focus came from.

## Solving level

The level is the highest grade (1–5) where at least 3 problems were tried and
60 % of them are cleanly solved. It is grade 1 when enough problems were
tried but no grade qualifies. Without enough results it falls back to the
lowest grade with unseen problems, the same rule as before v7.

## Today's five

When there is a focus, the plan chooses the five, in this order:

1. Due reviews: up to two mistake drills from your own games, then due
   problems. These follow the same spaced-repetition ladder as before (1, 3, 7
   and 21 days) and take at most three places.
2. Problems from the focus themes at the level or one above. The two themes
   take turns. These come from the problems your lessons have opened. When
   that set has none for the theme (a beginner), the plan takes the easiest
   problems from the whole bank, never above the level.
3. One stretch problem, two grades above the level, in a focus theme if one
   exists.
4. Anything left is chosen as before (`persist.dailySet`).

The set is saved for the day, so it stays the same all day. With no focus
(new players, too little evidence), today's five works exactly as in v6.

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
  cannot tell a slip from not knowing.
