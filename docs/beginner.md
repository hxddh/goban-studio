# The beginner path (v8)

Learning the rules should lead straight into playing. Nothing here is a new
place or a setting: the path is a few choices made at the right moments.

## Where the games are offered

| After | The lesson-complete page offers (primary) | Until |
| --- | --- | --- |
| `stones-capture`, `stones-groups`, `stones-suicide` | Play a game of capture Go | the player has won two capture games |
| `life-two-eyes`, `life-space` (unit 5, 眼与活棋) | Play your first 9×9 game | the player has finished a game against the computer |

When a game is offered, *Next lesson* becomes the secondary button; the page
keeps one primary action. The rules live in `src/web/js/model/player.js`
(`bridgeAfter`), the page in `app/beginner.jsx` (`LessonDone`); in v9 the
bridges are also items of Learn's path (`learn/session.js`).

After onboarding everyone lands on Today. For *I know the rules* its one
button starts a 9×9 game against a gentle level; for someone who has
never played it starts lesson one. A beginner's suggested game is 9×9
until three games are finished there, then 13×13; someone who came up
through the small boards and is past the beginner ranks plays two games
on 13×13 before the full board (`app/first-run.js` `suggestedSize`).
Teaching mode is on for these players automatically (`teachingOn`, about
15 kyu and weaker).

## Capture Go (吃子棋)

9×9, Black (the player) first, the first capture wins. Ko and suicide follow
the normal rules; there is no pass. If the side to move has no legal move
left, it loses. The result is one line in the usual result card, with *Play
again* and *Next lesson* (the primary is *Next lesson* after a win, *Play
again* after a loss). The captured stones are ringed on the board.

Capture games live in Practice (`state.practice.capture`, `app/capture-ctl.js`),
never in `state.game`: they are not saved, rated, reported or analysed, and
never reach the Library, the strength estimate, the training plan or "this
week". The only thing kept is `settings.captureWins`.

The opponent (`src/web/js/capture-ai.js`) is pure and has two levels, chosen
automatically: level 1 until the player has won two capture games, then
level 2. In order, it

1. captures when it can;
2. saves a chain in atari, preferring an extension that cannot be laddered;
3. plays a capture it can force (double atari, ladder, and at level 2 nets);
4. otherwise plays shape near the action with some randomness, skipping
   moves the opponent could punish by force.

Level 1 reads one move ahead and plays with more noise; level 2 reads ladders
six moves deep and sees nets, and wins about two games in three against
level 1. Every read shares a 25 ms deadline, so a move never takes noticeably
long (typically well under a millisecond); the reply is shown after a short,
human pause.

## The first count

The first time a player reaches the scoring screen of a game against the
computer, the score card carries one quiet note: the game ends after two
passes, dead stones come off the board and a tap toggles a group, and the
score compares surrounded points with komi for White. It is marked seen
(`settings.firstCountSeen`) as soon as it shows and does not come back.
