# Usability testing

v3's plan calls for a usability test with real people before release:
five complete beginners and five kyu players, each doing whole tasks from a
cold start. **That test has not been run.** The development environment has
no way to recruit or observe people, and saying otherwise would be false.

What *was* done, and what remains, is below so the gap is explicit and the
protocol is ready to run.

## Protocol (to run before calling v3 "validated")

**Participants.** 5 people who have never played Go; 5 players between
about 20 kyu and 5 kyu. Mixed macOS/Windows, at least one each per group.
Each session 40 minutes, moderated, think-aloud, screen recorded.

**Tasks** (cold start; no help unless stuck for 2 minutes):

| # | Task | Success | Target |
|---|------|---------|--------|
| T1 | Install and open the app, choose your language and level | Lands in lesson 1 (beginners) or a game (players) | 100% within 2 min |
| T2 | Beginners: finish the first two lessons | Both marked done | ≥ 4/5 within 10 min |
| T3 | Play a 9×9 game to the end and accept the count | Result card shown | ≥ 4/5 beginners, 5/5 players |
| T4 | Find your biggest mistake in that game and see the better move | Key mistake opened with "better line" shown | ≥ 4/5 per group within 3 min |
| T5 | Try your own variation in the review and go back to the game | Variation played, returned to main line | ≥ 4/5 players |
| T6 | Do today's five problems | Daily set completed | ≥ 4/5 within 10 min |
| T7 | Open an SGF from disk, rename it, export it | Record renamed and exported | ≥ 4/5 players |
| T8 | Change the board to slate and turn coordinates on | Both visible | 10/10 within 1 min |

**Measures.** Task success, time on task, errors (wrong place visited,
undo of an unintended action), SEQ (single ease question, 1–7) after each
task, SUS at the end. Release bar: every task at target, mean SEQ ≥ 5.5,
SUS ≥ 75. Any task below target blocks the release until fixed and
re-tested with 3 new people.

## What was done instead (and its limits)

1. **Scripted task runs** (`scripts/ui-test.mjs`, in CI). Each of T1, T3,
   T5, T6 (single problem, wrong answer → automatic retry) and the
   back/forward history is driven end to end in Chromium, keyboard-only
   where a person could be, in all four languages, with budgets on first
   render (< 1.5 s), click-to-paint (< 60 ms), opening a 300-move review
   (< 0.6 s) and switching places (< 0.25 s). This proves the paths work
   and are fast; it says nothing about whether people *find* them.
2. **Heuristic review** against Nielsen's ten heuristics, done by the
   developer on every screen at 1200×900, 1440×900 and 1920×1080. Findings
   fixed in v3: no stray focus ring on sheet close buttons; reduced-motion
   now also stops board animations; problem windows fitted tightly to the
   problem; result and status text no longer repeated; Esc consistently
   closes the topmost layer (menu → sheet → two-click stone → shown line →
   review → focus mode).
3. **Known open questions for the real test**: whether beginners notice the
   teaching warning's "Keep it" option; whether "Today" is understood as the
   starting point on first launch after onboarding; whether the candidate
   numbers in review (win rate %) are understood with the one-line legend added under the balance bar.
