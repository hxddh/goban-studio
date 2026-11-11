# Usability testing

The plan (since v3) calls for a usability test with real people before release:
five complete beginners and five kyu players, each doing whole tasks from a
cold start. **That test has not been run.** The development environment has
no way to recruit or observe people, and saying otherwise would be false.

What *was* done, and what remains, is below so the gap is explicit and the
protocol is ready to run.

## Protocol (to run before calling a release "validated")

**Participants.** 5 people who have never played Go; 5 players between
about 20 kyu and 5 kyu. Mixed macOS/Windows, at least one each per group.
Each session 40 minutes, moderated, think-aloud, screen recorded.

**Tasks** (cold start; no help unless stuck for 2 minutes):

| # | Task | Success | Target |
|---|------|---------|--------|
| T1 | Install and open the app, choose your language and level | Lands in lesson 1 (beginners) or a game (players) | 100% within 2 min |
| T2 | Beginners: finish the first two lessons | Both marked done | ≥ 4/5 within 10 min |
| T3 | Play a game (19×19 by default since v4, or 9×9 from New game) to the end and accept the count | Result card shown | ≥ 4/5 beginners, 5/5 players |
| T4 | Find your biggest mistake in that game and see the better move | Key mistake opened with "better line" shown | ≥ 4/5 per group within 3 min |
| T5 | Try your own variation in the review and go back to the game | Variation played, returned to main line | ≥ 4/5 players |
| T6 | Do today's five problems | Daily set completed | ≥ 4/5 within 10 min |
| T7 | Open an SGF from disk, rename it, export it | Record renamed and exported | ≥ 4/5 players |
| T8 | Change the board to High contrast (Settings → Board) and back, and turn coordinates off and on | Both visible on the board at once, without a reload | 10/10 within 1 min |

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

## v4: a scripted walkthrough (still not real people)

For v4 an independent pass walked through T1–T8 as four simulated personas
(a complete beginner in Chinese, a 15 kyu player in English, a 5 kyu player
in Japanese, and a Korean pass over every screen), each from a cold start in
the browser preview, judging what a person would see from screenshots. It is
a structured cognitive walkthrough, **not** a substitute for the protocol
above, and the browser preview has no KataGo, so T4 (key mistakes with the
better line) could not be reached and still needs a run on the desktop app.

Results: T1, T2, T5, T6, T7 (rename and export) and T8 succeeded; T3 only in
two-player mode, because the preview's simple 19×19 engine never passes and
there was no way to ask for the count. Fixed for v4.0.0 as a result:

- "Count" in the game's ⋯ menu, so a game against any engine can be counted.
- Review no longer says "Well played" when you lost or fell behind, nor on
  classic or imported games.
- A beginner's daily five only uses topics their finished lessons taught.
- A wrong answer in a problem says the position will reset (it does, by
  itself) instead of pointing at buttons that then disappear.
- The balance line says which move it describes; the score card puts each
  number on its own line; rename starts from the current name.
- Toolbars never end in a dangling breadcrumb; the daily set's last button
  says "Finish".
- Korean particle after 흑/백, Korean line breaking by word, "click" instead
  of "tap", no lazy "(s)" plural, untranslated classic results.
- Coordinates on small boards stay close to the grid; the black stone on the
  Ink board has a hairline rim; the filled chip no longer looks like a
  primary button; standing explanatory grey text removed from Review and
  Today.

Deliberately unchanged: the suggested game for new players stays 19×19 with
a handicap, with "Or a quick 9×9" right beside it, because v4's brief is the
standard board first. Panel footers (e.g. *Play from here*) stay anchored to
the bottom of the panel; the walkthrough counted the space above them as
dead space, and docs/design.md now says anchored footers are intended.
