# Opponent strength: how the ladder is calibrated

The computer opponent has eight levels. Their IDs (`30k` … `2d`) are stable
identifiers that saved settings, games and ratings refer to; what the player
sees is the level's **label** (`rank` in `STRENGTHS`, `src/web/js/engine.js`),
always shown with "≈". Since v4 the labels are the result of a measurement,
described here, and not a guess. The measurement is
`scripts/calibrate-strength.mjs`; anyone with a KataGo binary can rerun it.

**Short version.** On 19×19 the eight levels now run from below 30 kyu to
about 4 dan, roughly five ranks apart. Their order and spacing are well
measured (527 games on 19×19, 620 on 9×9). The absolute ranks rest on one
anchor, KataGo's human-imitation model playing as a 10-kyu human, and on
the EGF rating formula for the spacing of ranks; that is the weak part of
the method. Read the labels as "within a few ranks", not "to the rank".

| ID | Label shown | visits | temp | maxLoss | slip | blunder | θ (nats, 95% CI) | EGF GoR (95% CI) | Measured rank (95% CI) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `30k` | ≈30 kyu | 8 | 2 | 40 | 0.3 | 1 | 0 (reference) | −1272 (−2154 to −933) | 34k (43k–30k) |
| `25k` | ≈29 kyu | 8 | 2 | 40 | 0.3 | 0.95 | 1.8 (1.0–3.3) | −809 (−1484 to −520) | 29k (36k–26k) |
| `20k` | ≈23 kyu | 8 | 2 | 40 | 0.3 | 0.75 | 4.6 (3.5–6.5) | −170 (−573 to 35) | 23k (27k–21k) |
| `15k` | ≈18 kyu | 8 | 2 | 40 | 0.3 | 0.6 | 6.9 (5.8–9.2) | 291 (−2 to 454) | 18k (21k–16k) |
| `10k` | ≈12 kyu | 8 | 2 | 40 | 0.3 | 0.25 | 10.2 (9.0–13.2) | 876 (729 to 999) | 12k (14k–11k) |
| `5k` | ≈7 kyu | 8 | 2 | 40 | 0.3 | 0.09 | 13.8 (12.6–17.3) | 1412 (1285 to 1587) | 7k (8k–5k) |
| `1k` | ≈2 kyu | 32 | 0.7 | 6 | 0.02 | 0 | 17.9 (16.6–21.6) | 1905 (1769 to 2112) | 2k (3k–1d) |
| `2d` | ≈4 dan | 160 | 0 | 0 | 0 | 0 | 23.3 (22.0–27.1) | 2429 (2310 to 2601) | 4d (3d–6d) |

The label is the measured 19×19 rank rounded to the nearest rank, with one
exception: the `30k` level measured at about 34 kyu, below the bottom of
the kyu scale the app (and `rating.js`) uses, so it is shown as 30 kyu.
The intervals are bootstrap intervals of the games and include the
anchor's own sampling error; they do **not** include the choice of anchor
or of the EGF spacing (see "Anchor sensitivity" and Limitations), which
matter more. Adjacent labels are 5–6 ranks apart (1 rank at the clamped
bottom). The ID no longer matches the label for most levels; the IDs are
kept because saved data refers to them.

### What changed from v3

| ID | v3 label | v3 settings | v3 measured (19×19) | v4 settings | v4 label |
| --- | --- | --- | --- | --- | --- |
| `30k` | ≈30 kyu | 8 visits, temp 2, window 40, slip 0.3 | ≈5 kyu | the same plus blunder 1.0 | ≈30 kyu (34k) |
| `25k` | ≈25 kyu | 10 visits, temp 1.6, window 28 | ≈5 kyu (few games) | 8 visits … blunder 0.95 | ≈29 kyu |
| `20k` | ≈20 kyu | 14 visits, temp 1.3, window 18 | ≈5 kyu (few games) | … blunder 0.75 | ≈23 kyu |
| `15k` | ≈15 kyu | 20 visits, temp 1.0, window 11 | ≈4 kyu (few games) | … blunder 0.6 | ≈18 kyu |
| `10k` | ≈10 kyu | 32 visits, temp 0.7, window 6 | ≈2 kyu | … blunder 0.25 | ≈12 kyu |
| `5k` | ≈5 kyu | 64 visits, temp 0.45, window 3.5 | ≈1 kyu (few games) | … blunder 0.09 | ≈7 kyu |
| `1k` | ≈1 kyu | 160 visits, temp 0.2, window 1.5 | ≈3 kyu (few games) | 32 visits, temp 0.7, window 6 (v3's `10k`) | ≈2 kyu |
| `2d` | ≈2 dan | 500 visits, best move | ≈2 kyu (few games) | 160 visits, best move | ≈4 dan |

The v3 measurements come from the exploration runs (95 games on 19×19
plus 133 on 9×9) and have wide intervals, but the picture is unambiguous:
every v3 level played at single-digit kyu or better on this scale. On 9×9,
the four lowest v3 levels were indistinguishable (θ within ±0.2 nats of
each other over about 10 games per pair) and v3's `10k` and `5k` were
equal. The v3 `30k` beat the 20-kyu human profile, and the v3 `20k` beat
the 10-kyu one, in every game played (one to four games per pairing).
v4 makes the bottom of the ladder weak with beginner moves and the top
cheaper: the `2d` level searches 160 visits instead of
500 and still measures stronger than v3's.

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
the human-imitation model's 20-kyu profile and played at roughly 5 kyu on
the scale below. A beginner's move is a legal point near the stones already
on the board, most often within two lines of the opponent's last move,
never filling the player's own eye, and on the third or fourth line in an
empty corner. It is never played when KataGo's own first choice is to pass,
so games still end. This is what the levels up to `5k` are made of: `30k`
plays nothing else, and each step up plays fewer of them (95%, 75%, 60%,
25%, 9%). `1k` and `2d` play only KataGo's candidates.

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
lands on 10 kyu (GoR 1100). Ten kyu is the middle of the human SL
profiles that were played and close to the middle of the ladder; even so,
the strongest label is 14 ranks and the weakest 24 ranks of extrapolation
away from the anchor, and those two carry the most uncertainty.
KataGo's documentation says that the human SL model playing one visit with
the human profile gives "the closest match to how players of the given
rank might play", and that "this should be true up to mid-high dan level"
(KataGo `docs/Analysis_Engine.md`, human SL guide); it publishes no measured
strength calibration. Other profiles were also played and serve as checks
(below).

## Results

All numbers below are from the games described; the raw JSON lines are
reproducible with the commands at the end.

### 19×19 (primary)

Players: the eight shipped levels (`L:`), the human SL anchor and check
profiles (`H:`), and exploration candidates (`C:`) that bridge the gaps
between levels: `C:bNN` is the 8-visit base level with blunder 0.NN
(`C:b0` = no blunders = v3's `30k`), `C:m16`/`C:m64` are 16/64-visit
levels, `C:v3-*` the v3 levels. Candidates whose settings are identical to
a shipped level are pooled under the level's name (`--alias`); human SL vs
human SL games are left out of the fit. 527 games in total: 351 ended by
adjudication, 144 by two passes, 32 at the move cap (all among the three
weakest levels, whose games are long).

Raw results, every pair that was played (A is the lower-rated player;
"B win %" is the stronger side's score with a Wilson 95% interval):

| Pair (A vs B, A rated lower) | Games | A–B | B win % (95% CI) | Avg plies | Adjudicated | Capped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L:30k vs C:b97 | 10 | 3–7 | 70 (40–89) | 369 | 5 | 4 |
| L:30k vs L:25k | 20 | 3–17 | 85 (64–95) | 349 | 12 | 7 |
| L:30k vs C:b90 | 6 | 0–6 | 100 (61–100) | 278 | 5 | 1 |
| C:b97 vs L:25k | 10 | 2–8 | 80 (49–94) | 379 | 3 | 6 |
| L:25k vs C:b85 | 10 | 2–8 | 80 (49–94) | 309 | 6 | 3 |
| L:25k vs C:b90 | 20 | 4–16 | 80 (58–92) | 348 | 10 | 7 |
| L:25k vs L:20k | 21 | 0–21 | 100 (85–100) | 222 | 20 | 0 |
| C:b85 vs L:20k | 10 | 2–8 | 80 (49–94) | 344 | 5 | 4 |
| C:b90 vs L:20k | 6 | 0–6 | 100 (61–100) | 263 | 5 | 0 |
| C:b90 vs L:15k | 20 | 0–20 | 100 (84–100) | 132 | 20 | 0 |
| C:b90 vs H:rank_20k | 6 | 2–4 | 67 (30–90) | 277 | 2 | 0 |
| L:20k vs L:15k | 24 | 0–24 | 100 (86–100) | 262 | 18 | 0 |
| L:20k vs H:rank_20k | 6 | 0–6 | 100 (61–100) | 212 | 6 | 0 |
| L:20k vs C:b40 | 13 | 0–13 | 100 (77–100) | 150 | 13 | 0 |
| L:15k vs H:rank_20k | 3 | 1–2 | 67 (21–94) | 274 | 0 | 0 |
| L:15k vs C:b40 | 13 | 0–13 | 100 (77–100) | 211 | 13 | 0 |
| L:15k vs L:10k | 20 | 0–20 | 100 (84–100) | 133 | 20 | 0 |
| H:rank_20k vs C:b40 | 3 | 1–2 | 67 (21–94) | 183 | 3 | 0 |
| H:rank_20k vs L:10k | 3 | 1–2 | 67 (21–94) | 278 | 0 | 0 |
| H:rank_20k vs C:b0 | 1 | 0–1 | 100 (21–100) | 154 | 1 | 0 |
| H:rank_20k vs C:v3-20k | 1 | 0–1 | 100 (21–100) | 92 | 1 | 0 |
| H:rank_20k vs L:1k | 1 | 0–1 | 100 (21–100) | 104 | 1 | 0 |
| C:b40 vs H:rank_15k | 3 | 1–2 | 67 (21–94) | 287 | 0 | 0 |
| C:b40 vs L:10k | 13 | 1–12 | 92 (67–99) | 264 | 9 | 0 |
| C:b40 vs H:rank_10k | 12 | 0–12 | 100 (76–100) | 260 | 9 | 0 |
| C:b40 vs C:b18 | 13 | 0–13 | 100 (77–100) | 171 | 13 | 0 |
| H:rank_15k vs L:10k | 3 | 1–2 | 67 (21–94) | 162 | 2 | 0 |
| H:rank_15k vs C:b12 | 3 | 0–3 | 100 (44–100) | 161 | 2 | 0 |
| L:10k vs H:rank_10k | 23 | 4–19 | 83 (63–93) | 267 | 5 | 0 |
| L:10k vs C:b18 | 10 | 2–8 | 80 (49–94) | 293 | 4 | 0 |
| L:10k vs C:b12 | 3 | 0–3 | 100 (44–100) | 311 | 2 | 0 |
| L:10k vs L:5k | 20 | 0–20 | 100 (84–100) | 252 | 9 | 0 |
| L:10k vs C:b0 | 20 | 0–20 | 100 (84–100) | 157 | 20 | 0 |
| H:rank_5k vs C:v3-1k | 2 | 0–2 | 100 (34–100) | 92 | 2 | 0 |
| H:rank_5k vs C:v3-5k | 2 | 0–2 | 100 (34–100) | 92 | 2 | 0 |
| H:rank_1k vs C:v3-1k | 2 | 0–2 | 100 (34–100) | 119 | 2 | 0 |
| H:rank_1k vs C:v3-2d | 1 | 0–1 | 100 (21–100) | 100 | 1 | 0 |
| H:rank_10k vs C:b18 | 12 | 4–8 | 67 (39–86) | 258 | 1 | 0 |
| H:rank_10k vs C:b12 | 3 | 1–2 | 67 (21–94) | 207 | 1 | 0 |
| H:rank_10k vs C:v3-20k | 1 | 0–1 | 100 (21–100) | 226 | 0 | 0 |
| H:rank_10k vs L:1k | 1 | 0–1 | 100 (21–100) | 110 | 1 | 0 |
| H:rank_10k vs C:v3-5k | 1 | 0–1 | 100 (21–100) | 92 | 1 | 0 |
| C:b18 vs L:5k | 10 | 1–9 | 90 (60–98) | 245 | 7 | 0 |
| C:b18 vs C:b0 | 13 | 0–13 | 100 (77–100) | 209 | 11 | 0 |
| C:b12 vs C:b0 | 3 | 0–3 | 100 (44–100) | 234 | 2 | 0 |
| L:5k vs C:b0 | 10 | 1–9 | 90 (60–98) | 255 | 6 | 0 |
| L:5k vs L:1k | 20 | 1–19 | 95 (76–99) | 196 | 16 | 0 |
| C:b0 vs C:v3-25k | 1 | 0–1 | 100 (21–100) | 325 | 0 | 0 |
| C:b0 vs C:m16 | 10 | 4–6 | 60 (31–83) | 284 | 0 | 0 |
| C:b0 vs L:1k | 23 | 0–23 | 100 (86–100) | 246 | 12 | 0 |
| C:v3-25k vs C:v3-20k | 1 | 0–1 | 100 (21–100) | 315 | 0 | 0 |
| C:m16 vs L:1k | 10 | 0–10 | 100 (72–100) | 215 | 5 | 0 |
| C:v3-20k vs C:v3-15k | 1 | 0–1 | 100 (21–100) | 304 | 0 | 0 |
| C:v3-15k vs L:1k | 1 | 0–1 | 100 (21–100) | 225 | 1 | 0 |
| C:v3-1k vs C:v3-2d | 1 | 0–1 | 100 (21–100) | 269 | 0 | 0 |
| C:v3-1k vs C:v3-5k | 4 | 1–3 | 75 (30–95) | 217 | 3 | 0 |
| L:1k vs C:v3-5k | 4 | 1–3 | 75 (30–95) | 201 | 2 | 0 |
| L:1k vs C:m64 | 10 | 1–9 | 90 (60–98) | 175 | 8 | 0 |
| L:1k vs L:2d | 20 | 0–20 | 100 (84–100) | 158 | 19 | 0 |
| C:m64 vs L:2d | 10 | 0–10 | 100 (72–100) | 244 | 4 | 0 |

Fitted ratings (θ relative to the weakest level; GoR and rank mapped from
the `rank_10k` anchor along the EGF curve):

| Player | BT θ (nats) | 95% CI | Elo (400·log10) | EGF GoR | GoR 95% CI | ≈ rank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L:30k | 0.00 | 0.00 … 0.00 | 0 | -1272 | -2154 … -933 | 34k |
| C:b97 | 0.73 | -0.32 … 2.08 | 127 | -1080 | -1871 … -708 | 32k |
| L:25k | 1.80 | 1.04 … 3.26 | 313 | -809 | -1484 … -520 | 29k |
| C:b85 | 3.27 | 1.85 … 5.48 | 568 | -462 | -1056 … -129 | 26k |
| C:b90 | 3.33 | 2.32 … 5.19 | 579 | -448 | -1063 … -116 | 25k |
| L:20k | 4.59 | 3.55 … 6.52 | 798 | -170 | -573 … 35 | 23k |
| L:15k | 6.88 | 5.78 … 9.23 | 1194 | 291 | -2 … 454 | 18k |
| H:rank_20k | 7.31 | 4.98 … 11.29 | 1271 | 373 | -194 … 779 | 17k |
| C:b40 | 8.56 | 7.32 … 11.29 | 1488 | 599 | 391 … 747 | 15k |
| H:rank_15k | 9.38 | 6.60 … 12.85 | 1629 | 738 | 159 … 1072 | 14k |
| L:10k | 10.21 | 8.97 … 13.22 | 1774 | 876 | 729 … 999 | 12k |
| H:rank_5k | 11.08 | 7.69 … 13.28 | 1925 | 1013 | 359 … 1151 | 11k |
| H:rank_1k | 11.10 | 7.72 … 13.08 | 1928 | 1016 | 349 … 1153 | 11k |
| H:rank_10k | 11.65 | 10.35 … 14.69 | 2024 | 1100 | 1100 … 1100 | 10k |
| C:b18 | 11.97 | 10.67 … 15.20 | 2079 | 1147 | 1009 … 1280 | 10k |
| C:b12 | 12.51 | 10.94 … 16.26 | 2173 | 1226 | 1006 … 1504 | 9k |
| L:5k | 13.85 | 12.62 … 17.33 | 2406 | 1412 | 1285 … 1587 | 7k |
| C:b0 | 14.98 | 13.85 … 18.33 | 2603 | 1561 | 1456 … 1733 | 5k |
| C:v3-25k | 14.99 | 8.59 … 19.60 | 2604 | 1561 | 504 … 1915 | 5k |
| C:m16 | 15.11 | 13.60 … 18.63 | 2625 | 1577 | 1370 … 1793 | 5k |
| C:v3-20k | 15.40 | 9.67 … 19.78 | 2676 | 1613 | 671 … 1987 | 5k |
| C:v3-15k | 16.24 | 10.35 … 19.97 | 2821 | 1715 | 839 … 2009 | 4k |
| C:v3-1k | 16.70 | 10.74 … 21.05 | 2901 | 1769 | 890 … 2126 | 3k |
| L:1k | 17.90 | 16.64 … 21.56 | 3110 | 1905 | 1769 … 2112 | 2k |
| C:v3-2d | 18.07 | 10.77 … 21.63 | 3138 | 1923 | 900 … 2200 | 2k |
| C:v3-5k | 18.35 | 13.98 … 22.72 | 3187 | 1953 | 1347 … 2257 | 1k |
| C:m64 | 19.66 | 18.22 … 23.63 | 3416 | 2090 | 1921 … 2320 | 1d |
| L:2d | 23.35 | 21.99 … 27.12 | 4056 | 2429 | 2310 … 2601 | 4d |

First-move term η = -0.12 nats (positive favours Black at this komi).

Adjacent shipped levels sweep or nearly sweep each other (most pairs
20–0), so their θ gaps would be unbounded from those games alone; the
bridging candidates, which score 60–90% against their neighbours, are what
pins the gaps down. Where a gap rests mostly on a sweep (`1k`→`2d`; the
`m64` bridge also lost 10–0 to `2d`), the estimate is closer to a lower
bound: the true gap is likely larger, not smaller.

### Anchor sensitivity

The same fit, anchored on each human SL profile alone:

| Player | ≈ rank if only H:rank_20k | ≈ rank if only H:rank_15k | ≈ rank if only H:rank_5k | ≈ rank if only H:rank_1k | ≈ rank if only H:rank_10k |
| --- | ---: | ---: | ---: | ---: | ---: |
| L:30k | 38k | 36k | 24k | 17k | 34k |
| C:b97 | 36k | 34k | 22k | 15k | 32k |
| L:25k | 33k | 31k | 20k | 13k | 29k |
| C:b85 | 29k | 28k | 17k | 11k | 26k |
| C:b90 | 29k | 27k | 17k | 11k | 25k |
| L:20k | 26k | 24k | 15k | 9k | 23k |
| L:15k | 21k | 20k | 11k | 6k | 18k |
| H:rank_20k | 20k | 19k | 10k | 5k | 17k |
| C:b40 | 18k | 16k | 8k | 4k | 15k |
| H:rank_15k | 16k | 15k | 7k | 3k | 14k |
| L:10k | 15k | 14k | 6k | 2k | 12k |
| H:rank_5k | 13k | 12k | 5k | 1k | 11k |
| H:rank_1k | 13k | 12k | 5k | 1k | 11k |
| H:rank_10k | 12k | 11k | 4k | 1d | 10k |
| C:b18 | 12k | 11k | 4k | 1d | 10k |
| C:b12 | 11k | 10k | 3k | 1d | 9k |
| L:5k | 9k | 8k | 2k | 3d | 7k |
| C:b0 | 7k | 6k | 1k | 4d | 5k |
| C:v3-25k | 7k | 6k | 1k | 4d | 5k |
| C:m16 | 7k | 6k | 1d | 4d | 5k |
| C:v3-20k | 7k | 6k | 1d | 4d | 5k |
| C:v3-15k | 6k | 5k | 2d | 5d | 4k |
| C:v3-1k | 5k | 4k | 2d | 5d | 3k |
| L:1k | 4k | 3k | 3d | 6d | 2k |
| C:v3-2d | 3k | 3k | 3d | 6d | 2k |
| C:v3-5k | 3k | 2k | 4d | 6d | 1k |
| C:m64 | 2k | 1k | 5d | 7d | 1d |
| L:2d | 3d | 4d | 7d | 10d | 4d |

In direct games the profiles are well ordered (`rank_10k` beat `rank_20k`
2–0, `rank_1k` beat `rank_10k` 2–0, every game by more than 100 points),
but against the ladder they bunch together: the fit puts `rank_20k` at
17 kyu and `rank_5k` and `rank_1k` at 11 kyu when `rank_10k` is the
anchor. The human SL model's raw policy seems to play more like its
nominal rank against human-like opponents than against these programs,
and its low profiles are probably stronger than real players of that rank
(averaging many players removes individual blunders). The middle profile
is the compromise; the table shows how far the labels could move.

### 9×9

| Pair (A vs B, A rated lower) | Games | A–B | B win % (95% CI) | Avg plies | Adjudicated | Capped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L:30k vs L:25k | 40 | 16–24 | 60 (45–74) | 101 | 0 | 0 |
| L:25k vs L:20k | 40 | 5–35 | 88 (74–95) | 91 | 0 | 0 |
| L:25k vs L:15k | 10 | 2–8 | 80 (49–94) | 95 | 0 | 0 |
| L:20k vs L:15k | 40 | 11–29 | 73 (57–84) | 94 | 0 | 0 |
| L:15k vs L:10k | 40 | 1–39 | 98 (87–100) | 82 | 0 | 0 |
| L:10k vs L:5k | 40 | 8–32 | 80 (65–90) | 67 | 0 | 0 |
| L:10k vs L:1k | 10 | 0–10 | 100 (72–100) | 71 | 0 | 0 |
| L:5k vs L:1k | 40 | 0–40 | 100 (91–100) | 64 | 0 | 0 |
| L:1k vs L:2d | 40 | 2–38 | 95 (83–99) | 60 | 3 | 0 |

| Player | BT θ (nats) | 95% CI | Elo (400·log10) | EGF GoR | GoR 95% CI | ≈ rank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L:30k | 0.00 | 0.00 … 0.00 | 0 | – | – | – |
| L:25k | 0.40 | -0.20 … 1.08 | 69 | – | – | – |
| L:20k | 2.06 | 1.20 … 3.30 | 358 | – | – | – |
| L:15k | 2.85 | 1.83 … 4.35 | 495 | – | – | – |
| L:10k | 6.13 | 4.75 … 8.33 | 1065 | – | – | – |
| L:5k | 7.47 | 5.86 … 9.85 | 1297 | – | – | – |
| L:1k | 12.08 | 10.57 … 14.35 | 2099 | – | – | – |
| L:2d | 14.93 | 13.27 … 18.21 | 2593 | – | – | – |

First-move term η = -0.26 nats (positive favours Black at this komi).

There is no anchor on 9×9 (the human SL model is a 19×19 model), so only
order and spacing are shown. The order is the same as on 19×19, but the
small board compresses the bottom: the three beginner-move levels
(`30k`, `25k`, `20k`) are within 2 nats of each other, and `15k` is close
to `20k`. A 9×9 game against `30k` and against `20k` feels much the same.

### v3 on 9×9 (before)

| Player | BT θ (nats) | 95% CI | Elo (400·log10) | EGF GoR | GoR 95% CI | ≈ rank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C:v3-20k | -0.15 | -1.24 … 0.90 | -27 | – | – | – |
| C:v3-25k | -0.12 | -1.27 … 0.90 | -22 | – | – | – |
| C:v3-30k | 0.00 | 0.00 … 0.00 | 0 | – | – | – |
| C:v3-15k | 0.17 | -1.08 … 1.48 | 30 | – | – | – |
| C:v3-10k | 3.32 | 1.71 … 5.65 | 577 | – | – | – |
| C:v3-5k | 3.36 | 1.70 … 5.82 | 584 | – | – | – |
| C:v3-1k | 4.87 | 3.09 … 8.03 | 845 | – | – | – |
| C:v3-2d | 6.51 | 4.50 … 10.57 | 1131 | – | – | – |

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
- **Sample sizes.** 20–24 games per adjacent pair on 19×19 and 40 on 9×9
  (the container's four shared CPU cores were the budget), plus 10-game
  bridge matches. Adjacent levels are about five ranks apart, so most
  pairs are sweeps; a 20–0 result says "a large gap" more precisely than
  "how large". The bridges and the bootstrap intervals carry the rest.
  The settings of `20k` and `5k` were chosen from candidates measured in
  the same pool (`C:b75`, `C:b9`) and then given their own adjacent
  matches; no settings were changed after the final fit.
- **The prior.** With sweeps, a weak prior (σ = 6 nats) keeps the fit
  finite; it pulls the extreme levels slightly towards the middle. The
  weakest and strongest labels are the most affected.
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
# the shipped ladder, adjacent pairs, plus the anchor against its neighbours
node scripts/calibrate-strength.mjs play --katago $KATAGO --human-model $HUMAN \
  --size 19 --games 20 --pairs "adjacent,H:rank_10k-L:10k,H:rank_10k-L:5k" --out ladder-19.jsonl
node scripts/calibrate-strength.mjs play --katago $KATAGO --size 9 --games 40 --pairs adjacent,gap2 --out ladder-9.jsonl
# bridges between levels (blunder rates between the neighbours' rates)
node scripts/calibrate-strength.mjs play --katago $KATAGO --candidates bridges.json \
  --size 19 --games 10 --pairs "C:b97-L:30k,C:b97-L:25k,C:b85-L:25k,C:b85-L:20k,..." --out ladder-19.jsonl
node scripts/calibrate-strength.mjs fit ladder-19.jsonl --anchor rank_10k --markdown
node scripts/calibrate-strength.mjs fit ladder-9.jsonl --markdown
```

The published numbers pool several runs made while the ladder was being
tuned (about 4 hours of four-core game play); games played under earlier
settings of a level are kept under a candidate name, never under the
level's ID, so `L:<id>` always means the shipped settings. A single
fresh run of the commands above reproduces the shape (order, spacing,
the anchor's place) but not the exact digits.

`--candidates FILE` adds experimental levels (`C:<name>`, a JSON object of
strength fields) to try settings before changing `STRENGTHS`; `--alias`
pools their games with a ladder level whose settings are identical. A run
can be interrupted and resumed: games already in `--out` are skipped.
