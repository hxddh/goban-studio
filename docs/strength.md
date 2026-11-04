# Opponent strength: how the ladder is calibrated

The computer opponent has eight levels. Their IDs (`30k` … `2d`) are stable
identifiers that saved settings, games and ratings refer to; what the player
sees is the level's **label** (`rank` in `STRENGTHS`, `src/web/js/engine.js`),
always shown with "≈". Since v4 the labels are the result of a measurement,
described here, and not a guess. The measurement is
`scripts/calibrate-strength.mjs`; anyone with a KataGo binary can rerun it.

**Short version.** The levels are evenly spaced about three ranks apart on
19×19, from ≈21 kyu to ≈1 dan. The spacing between levels is well measured.
The absolute ranks rest on one anchor, KataGo's human-imitation model
playing as a 10-kyu human. That anchor is the weakest part of the method:
expect the labels to be right to within a few ranks, not to one rank.

<!-- SUMMARY -->

## What a level is

Each move, the app asks KataGo (1.18.1, b6c96 network, Japanese rules) to
search the position with the level's visit budget, then picks a move from
KataGo's report:

| Field | Meaning |
| --- | --- |
| `visits` | KataGo's search budget for the move |
| `maxLoss` | choose only among searched candidates within this many points of the best |
| `temp` | how widely to sample within that window (weight ∝ visits^(1/temp); 0 = always the best) |
| `slip` | chance of taking a searched candidate *outside* the window |
| `blunder` | chance of playing a beginner's move instead (`beginnerMove`) |

`blunder` is new in v4. The v3 ladder used only the first four fields, and
the measurement showed why that cannot work below single-digit kyu: every
move in KataGo's report is a move a strong network found plausible, so even
choosing among them at random plays solid shape. The v3 "30 kyu" level beat
the human-imitation model's 20-kyu profile and played at roughly 6 kyu on
the scale below. A beginner's move is a legal point near the stones already
on the board, most often within two lines of the opponent's last move,
never filling the player's own eye, and on the third or fourth line in an
empty corner. It is never played when KataGo's own first choice is to pass,
so games still end. This is what the lowest levels are made of: `30k` plays
nothing else, and each step up plays fewer of them.

## Method

### Games

`scripts/calibrate-strength.mjs play` plays complete games between players
and appends one JSON line per game:

- **Ladder players** (`L:<id>`) move exactly as in the app. The harness
  keeps the position in KataGo with `play` commands (as the native host
  does, so the search tree is reused between moves), searches with
  `kata-search_analyze`, parses the report with `katago.js` `toAnalysis`,
  and picks with `engine.js` `moveFromAnalysis` — the function `decide()`
  uses, including the fallback to KataGo's own move when the pick is
  illegal under the app's superko rule. Each side has its own KataGo
  process.
- **Anchor players** (`H:<profile>`) are KataGo's human SL model
  (`b18c384nbt-humanv0`, KataGo 1.15 release) with the settings of KataGo's
  own `gtp_human5k_example.cfg`: the raw human-imitation policy chooses
  every move (1 visit worth of network, no reading); a short b6c96 search
  only decides when to pass. `rank_10k` imitates a 10-kyu player of the
  post-AlphaZero era.
- 19×19 and 9×9, komi 6.5, Japanese rules (the app's defaults), no
  handicap. Colours alternate game by game, so each pair plays as many
  games with Black as with White.
- A game ends on two passes; or by **adjudication** when six consecutive
  ladder searches agree one side has a ≥ 98.5% win rate and a lead of more
  than 20 + 2 × (the larger `maxLoss` in the game) points, i.e. a lead no
  level in that game could plausibly lose (100 points for the blunder
  levels); or at a move cap (420 plies on 19×19, 150 on 9×9). The result is
  KataGo's score lead (Japanese rules) after a 400-visit search of the final
  position.
- Moves are sampled from a per-game seeded generator; KataGo's own search
  is not seeded, so reruns differ in detail.

### Ratings

`scripts/calibrate-strength.mjs fit` fits a **Bradley–Terry** model by
maximum likelihood:

  logit P(Black wins) = θ_Black − θ_White + η

θ is a strength in natural-log units ("nats"; ×173.7 for Elo points) and η
a first-move term for the komi. A weak Gaussian prior (σ = 6 nats on θ,
2 on η) keeps the estimate finite when a pair is swept. 95% confidence
intervals come from 1000 bootstrap resamples of the games. The weakest
level is the reference (θ = 0); its interval is therefore zero by
construction, and every other interval is relative to it.

### From ratings to ranks

Relative spacing comes from the games; mapping it onto kyu and dan needs a
scale and an anchor.

**Scale: EGF.** In the European Go Federation's rating system (GoR;
1 dan = 2100, 100 points per rank, the same scale `src/web/js/app/rating.js`
uses), the stronger of two players with a rating gap D wins with
probability 1 / (1 + e^(−D/a)), with a = 200 − (GoR − 100) × 130/2600 ≈
205 − GoR/20. (The full formula subtracts ε/2 = 0.008 for upsets; it is
ignored here.) A one-rank gap is therefore about 0.5 nats at 20 kyu
(62% for the stronger player), 0.67 at 10 kyu (66%), 0.8 at 5 kyu (69%)
and 1.0 at 1 dan (73%). Integrating dGoR/dθ = a(GoR) gives the mapping

  GoR(θ) = 4100 − K · e^(−θ/20)

with one free constant K. EGF's formula is defined from 20 kyu (GoR 100)
up; below 20 kyu the same curve is extrapolated.

**Anchor: the human SL model at 10 kyu.** K is chosen so that `H:rank_10k`
lands on 10 kyu (GoR 1100). Ten kyu sits in the middle of the ladder, so no
label is more than about ten ranks of extrapolation away from the anchor.
KataGo's documentation says that the human SL model playing one visit with
the human profile gives "the closest match to how players of the given
rank might play", and that "this should be true up to mid-high dan level"
(KataGo `docs/Analysis_Engine.md`, human SL guide); it publishes no measured
strength calibration. Other profiles were also played and serve as checks
(below).

## Results

All numbers below are from the games described; the raw JSON lines are
reproducible with the commands at the end.

<!-- RESULTS -->

## Limitations

- **The anchor is a model, not people.** No human played these games. The
  labels inherit whatever error the human SL model's 10-kyu profile has as
  an imitation of a 10-kyu human's *strength* (KataGo claims a match of
  style; strength is our inference). The profiles were also inconsistent
  with each other in a way that matters: in direct games each profile beats
  the next lower one decisively (`rank_10k` beat `rank_20k` 2–0 and
  `rank_1k` beat `rank_10k` 2–0, all by more than 100 points), but against
  the ladder the profiles from 20 kyu to 1 kyu score far more alike than
  EGF would predict for 19 ranks. Anchoring on `rank_20k` or `rank_5k`
  instead of `rank_10k` would move every label by several ranks (see the
  "if only" table). We chose the middle profile and report the spread
  rather than pretending it away.
- **Bot-versus-bot spacing is not human spacing.** The EGF curve describes
  how often humans of different ranks beat each other. Programs that differ
  mainly in how often they blunder may separate faster or slower than
  humans with the same rank gap. The relative order and spacing of the
  levels are solid; the conversion of a nat into ranks is borrowed.
- **Below 20 kyu is extrapolation.** EGF ratings stop at 20 kyu and the
  human SL model's weakest profile is 20 kyu. The two lowest labels come
  from extending the curve.
- **Search threads and hardware.** The app runs KataGo with 4 search
  threads; the harness used 1 thread per process (to run four games at
  once). At these visit budgets the difference in playing strength is
  small but not zero. The app also caps each search by time (3–6 s); on a
  laptop the visit budget, not the clock, ends the search (160 visits of
  b6c96 take well under a second), and the harness used visits only.
- **Tree reuse.** In the app, hints, the teaching check and the evaluation
  bar share the KataGo process with the opponent and can clear or extend
  its search tree. The harness measured the opponent with nothing else
  running.
- **9×9 has no anchor.** The human SL model is trained on 19×19 games, so
  the 9×9 results show order and spacing only. The labels are 19×19 ranks.
- **Sample sizes.** 20 games per adjacent pair on 19×19 and 40 on 9×9 (the
  container's four shared CPU cores were the budget). Adjacent levels are
  about three ranks apart, so most pairs are lopsided; a 19–1 result says
  "a large gap" more precisely than "how large". The bootstrap intervals
  show this.
- **Handicap and komi.** All games were even games at komi 6.5. The app's
  handicap suggestion (one stone per rank of label difference) is not
  itself measured here.

## Reproduce

Download KataGo (any 1.18.x build; the measurements used
`katago-v1.18.1-eigenavx2-linux-x64.zip`) and, for the anchors, the human SL
model (`b18c384nbt-humanv0.bin.gz`, KataGo v1.15.0 release). Keep both out
of the repository.

```bash
KATAGO=/path/to/katago
HUMAN=/path/to/b18c384nbt-humanv0.bin.gz
node scripts/calibrate-strength.mjs play --katago $KATAGO --human-model $HUMAN \
  --size 19 --games 20 --pairs "adjacent,H:rank_10k-L:15k,H:rank_10k-L:10k" --out v4-19.jsonl
node scripts/calibrate-strength.mjs play --katago $KATAGO --size 9 --games 40 --pairs adjacent --out v4-9.jsonl
node scripts/calibrate-strength.mjs fit v4-19.jsonl --anchor rank_10k --markdown
node scripts/calibrate-strength.mjs fit v4-9.jsonl --markdown
```

`--candidates FILE` adds experimental levels (`C:<name>`, a JSON object of
strength fields) to try settings before changing `STRENGTHS`; `--alias`
pools their games with a ladder level whose settings are identical. A run
can be interrupted and resumed: games already in `--out` are skipped.
