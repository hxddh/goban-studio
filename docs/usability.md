# Usability testing — not yet run

**No usability test with real people has been run, for any version.** The
plan calls for one before a release is called validated: five complete
beginners and five kyu players, each doing whole tasks from a cold start.
The development environment has no way to recruit or observe people, and
saying otherwise would be false.

This page holds the protocol, ready to run, and then says exactly what was
done in its place.

## Protocol (to run before calling a release "validated")

**Participants.** 5 people who have never played Go; 5 players between
about 20 kyu and 5 kyu. Mixed macOS/Windows, at least one each per group.
Each session 40 minutes, moderated, think-aloud, screen recorded.

**Tasks** (cold start; no help unless stuck for 2 minutes):

| # | Task | Success | Target |
|---|------|---------|--------|
| T1 | Install and open the app, choose your language and say whether you have played | Lands on Today, and from there starts lesson 1 (beginners) or the suggested game (players) with one click | 100% within 2 min |
| T2 | Beginners: finish the first two lessons | Both marked done | ≥ 4/5 within 10 min |
| T3 | Play the game Today suggests (9×9 for beginners, 19×19 for players) to the end and confirm the count | Result shown | ≥ 4/5 beginners, 5/5 players |
| T4 | Find your biggest mistake in that game and see the better move | A key moment opened with its better line shown | ≥ 4/5 per group within 3 min |
| T5 | Try your own variation in the review, keep it, and go back to the main line | Variation kept, main line on the board again | ≥ 4/5 players |
| T6 | Do today's practice | Today's path finished (at the default size, 5) | ≥ 4/5 within 10 min |
| T7 | Open an SGF from disk, rename it in the Library, export it | Record renamed and exported | ≥ 4/5 players |
| T8 | Change the board to High contrast (Settings → Board) and back, and turn coordinates off and on | Both visible on the board at once, without a reload | 10/10 within 1 min |

T1 is also the first-launch test for an unsigned build: note whether the
participant gets past the operating system's warning with the package
README alone.

**Measures.** Task success, time on task, errors (wrong place visited,
undo of an unintended action), SEQ (single ease question, 1–7) after each
task, SUS at the end. Release bar: every task at target, mean SEQ ≥ 5.5,
SUS ≥ 75. Any task below target blocks the release until fixed and
re-tested with 3 new people.

**Open questions for the real test.** Whether beginners notice the
teaching warning's "Keep it" option; whether Today is understood as the
starting point; whether a hidden problem name is missed or welcomed;
whether "Keep / Discard" for a trial line is understood; whether the
candidate numbers in review (win rate %) are understood with their
one-line legend.

## What was done instead (and its limits)

None of this is a usability test. It shows that the paths work, not that
people find them.

1. **Automated flows** (`npm run ui-test`, in CI). The tasks above are
   driven in Chromium against the built page: first run to Today and on
   to lesson one or a game (T1), a game played by keyboard to the count
   (T3), a variation tried, kept and discarded (T5), today's path and
   single problems with a wrong answer (T6), import, Rename and export in
   the Library (T7) and the high-contrast board (T8), in four
   languages, with budgets on first render, click-to-paint, opening a long
   review and switching places. T2 is covered as lessons opening and
   completing, not as two whole lessons read by a person. T4 needs KataGo,
   which the browser page does not have: the review's key moments are
   tested against recorded analysis, and against the real engine only in
   the packaged app's self-test.
2. **The developer looking at screenshots.** While each screen was
   reworked, it was captured in Chinese and English, light and dark, at
   1200×800 and 1440×900, and judged against `docs/design.md` by the
   developer. This is the person who built the screens reviewing their
   own work.

## An earlier scripted walkthrough (v4; still not real people)

For v4 an independent pass walked through the tasks as they were then,
as four simulated personas (a complete beginner in Chinese, a 15 kyu
player in English, a 5 kyu player in Japanese, and a Korean pass over
every screen), each from a cold start in
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
