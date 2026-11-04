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

v6 measured the optional human-style levels and the stronger network
(426 games, only 54 of them on 19×19) and moved three of their labels
("v6: the human-style levels…" below). It also replaced the player's
level with an estimate with an uncertainty ("v6: your strength").

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

## v5: the human-style opponent and the stronger network

Both are optional downloads (`src/models.zig`). Without them nothing
above changes. The v5 measurement below was a short check (54 games, 46
game-minutes on a shared 4-core Linux VM, KataGo 1.18.1 Eigen), enough to
see order and gross mismatches, not to set labels; v6 measured the new
modes properly (next section), and three of their labels moved.

**Human-style levels** (`HL:<id>`, `STRENGTHS[].human`). A second KataGo
process runs `-model` b6c96 `-human-model b18c384nbt-humanv0` with
`engine/model/human.cfg` (KataGo's `gtp_human5k_example.cfg` recipe); the
host sets the level's `humanSLProfile` and one of two move-choice styles:

| ID | Label | Profile | Style | Visits | Beginner moves |
| --- | --- | --- | --- | ---: | ---: |
| `30k` | ≈30 kyu | `rank_20k` | raw | 40 | 0.9 |
| `25k` | ≈29 kyu | `rank_20k` | raw | 40 | 0.7 |
| `20k` | ≈23 kyu | `rank_20k` | raw | 40 | 0.35 |
| `15k` | ≈18 kyu | `rank_20k` | raw | 40 | 0 |
| `10k` | ≈12 kyu | `rank_12k` | raw | 40 | 0 |
| `5k` | ≈7 kyu | `rank_7k` | search | 24 | 0 |
| `1k` | ≈2 kyu | `rank_2k` | search | 64 | 0 |
| `2d` | ≈4 dan | `rank_4d` | search | 200 | 0 |

"raw" plays the human policy of the profile (one network evaluation,
temperature 0.85 → 0.70 below 1% probability; the visits only decide when
to pass). "search" is KataGo's `gtp_human9d_search_example.cfg` recipe:
human-style candidates, but moves the search judges to lose are
suppressed (`humanSLChosenMovePiklLambda` 0.08). The profiles follow the
v4 anchor measurements above: against this ladder `rank_20k` measured
about 17 kyu and `rank_15k` about 14 kyu, and no raw profile measured
stronger than about 10 kyu, so the four strongest levels use the search
style and the three weakest add the ladder's beginner's moves (the model
has no profile below 20 kyu).

9×9, human-style levels against each other (4 games per pair):

| Pair (A vs B, A rated lower) | Games | A–B | B win % (95% CI) |
| --- | ---: | ---: | ---: |
| HL:30k vs HL:25k | 4 | 1–3 | 75 (30–95) |
| HL:25k vs HL:20k | 4 | 1–3 | 75 (30–95) |
| HL:20k vs HL:15k | 4 | 0–4 | 100 (51–100) |
| HL:15k vs HL:10k | 4 | 2–2 | 50 (15–85) |
| HL:10k vs HL:5k | 4 | 0–4 | 100 (51–100) |
| HL:5k vs HL:1k | 4 | 0–4 | 100 (51–100) |
| HL:1k vs HL:2d | 4 | 1–3 | 75 (30–95) |

Every adjacent pair is won by the higher level except `15k`/`10k`, which
split 2–2 on 9×9 (both are raw-policy levels, `rank_20k` and `rank_12k`;
the human SL model is trained on 19×19 games). So the order holds on 9×9
with one tie, from small samples.

Human-style level against the standard level of the same ID (2 games each,
HL wins–L wins):

| Level | 9×9 | 19×19 |
| --- | --- | --- |
| `30k` | 2–0 | – |
| `25k` | 1–1 | – |
| `20k` | 2–0 | 1–1 |
| `15k` | 2–0 | – |
| `10k` | 1–1 | 0–2 |
| `5k` | 2–0 | 2–0 |
| `1k` | 2–0 | – |
| `2d` | 2–0 | 1–1 |

On 9×9 the human-style opponent is at least as strong as the standard one
at every level (14–2 overall), most clearly at the bottom: the
beginner's-move levels lose less on the small board when the rest of
their moves are human rather than random candidates. On 19×19, in eight
games, the two modes are even (4–4): `10k` human-style lost both, `5k`
won both, `20k` and `2d` split. Read this as "the human-style levels are
roughly at their labels on 19×19 and somewhat stronger on 9×9"; their
labels are not separately calibrated, and a proper measurement (anchors,
a few hundred games) is future work. Reproduce with
`calibrate-strength.mjs play --human-model … --pairs "HL:10k-L:10k,…"`.

**Stronger network** (`LS:2d`, `STRENGTHS[].strong`). With
`g170e-b15c192-s1672170752-d466197061` installed the `2d` level searches
64 visits on it instead of 160 on b6c96; it beat the standard `2d` 2–0 on
9×9. Its label is then a lower bound. Analysis and review ask the larger
network for half the visits they ask of b6c96
(`STRONG_VISIT_SCALE`): on the test VM b15c192 ran 25 visits/s against
b6c96's 140 (KataGo `benchmark`, 4 threads); b20c256 (4.9 visits/s) was
rejected as too slow for a laptop CPU.

The human-style process uses about 550 MB of memory (b18 human model plus
b6c96), started only when a human-style game asks for its first move.

## v6: the human-style levels and the stronger network, measured

**Short version.** 426 games (372 on 9×9, 54 on 19×19; about 9.4
game-hours on a 4-core Linux container, KataGo 1.18.1 Eigen AVX2, one
search thread per process, four games at a time). Fewer 19×19 games were
played than planned: a further ~230 were dropped to finish v6 on time, so
the 19×19 sample is six games per level and can show direction, not
size. Three labels moved, where both boards agreed and the 19×19 interval
excluded the old label: human-style `5k` ≈7 kyu → **≈3 kyu**, human-style
`1k` ≈2 kyu → **≈1 dan**, stronger-network `2d` ≈4 dan → **≈5 dan**. The
other human-style levels keep their labels.

**Method.** Every game is a human-style level (`HL:<id>`, exactly as
shipped) or the stronger-network level (`LS:2d`) against a standard level
(`L:<id>`) or another human-style level, with the harness and game rules
described under Method above (komi 6.5, Japanese rules, colours
alternating, 200-visit final scoring on 19×19). Instead of re-measuring
the standard ladder, the fit holds it at its v4 values (`fit --fixed`:
θ of each `L:` level fixed at the tables above, per board) and places only
the new players in that frame, so all 426 games go to the new modes. On
19×19 the v4 anchor map then turns θ into GoR and a rank. The intervals
are 1000-game bootstraps of the v6 games only; they do **not** include
the v4 ladder's own error or the anchor's (Limitations).

- 9×9: twelve games for each of 31 pairs: every human-style level against
  the standard level of the same ID and its two neighbours, against the
  next human-style level, and `LS:2d` against `L:2d` and `HL:2d`.
- 19×19: six games for each human-style level against the standard level
  of the same ID, and six of `LS:2d` against `L:2d`. Of the 54 games, 33
  ended by adjudication, 16 by two passes and 5 at the move cap; of the
  372 9×9 games, 362 by two passes and 10 by adjudication. No game failed.

**19×19** (A is the player the fit rates lower):

| Pair (A vs B) | Games | A–B | B win % (95% CI) | Avg plies |
| --- | ---: | ---: | ---: | ---: |
| L:30k vs HL:30k | 6 | 3–3 | 50 (19–81) | 345 |
| HL:25k vs L:25k | 6 | 1–5 | 83 (44–97) | 354 |
| HL:20k vs L:20k | 6 | 1–5 | 83 (44–97) | 305 |
| L:15k vs HL:15k | 6 | 1–5 | 83 (44–97) | 242 |
| HL:10k vs L:10k | 6 | 3–3 | 50 (19–81) | 244 |
| L:5k vs HL:5k | 6 | 0–6 | 100 (61–100) | 238 |
| L:1k vs HL:1k | 6 | 0–6 | 100 (61–100) | 210 |
| L:2d vs HL:2d | 6 | 0–6 | 100 (61–100) | 225 |
| L:2d vs LS:2d | 6 | 0–6 | 100 (61–100) | 241 |

**9×9:**

| Pair (A vs B) | Games | A–B | B win % (95% CI) |
| --- | ---: | ---: | ---: |
| L:30k vs HL:30k | 12 | 3–9 | 75 (47–91) |
| L:30k vs HL:25k | 12 | 4–8 | 67 (39–86) |
| L:25k vs HL:30k | 12 | 6–6 | 50 (25–75) |
| L:25k vs HL:25k | 12 | 3–9 | 75 (47–91) |
| L:25k vs HL:20k | 12 | 2–10 | 83 (55–95) |
| HL:30k vs HL:25k | 12 | 2–10 | 83 (55–95) |
| HL:25k vs HL:20k | 12 | 2–10 | 83 (55–95) |
| HL:25k vs L:20k | 12 | 3–9 | 75 (47–91) |
| HL:20k vs L:20k | 12 | 5–7 | 58 (32–81) |
| HL:20k vs L:15k | 12 | 2–10 | 83 (55–95) |
| HL:20k vs HL:15k | 12 | 1–11 | 92 (65–99) |
| L:20k vs HL:15k | 12 | 2–10 | 83 (55–95) |
| L:15k vs HL:15k | 12 | 0–12 | 100 (76–100) |
| L:15k vs HL:10k | 12 | 1–11 | 92 (65–99) |
| HL:15k vs L:10k | 12 | 3–9 | 75 (47–91) |
| HL:15k vs HL:10k | 12 | 4–8 | 67 (39–86) |
| L:10k vs HL:10k | 12 | 4–8 | 67 (39–86) |
| L:10k vs HL:5k | 12 | 0–12 | 100 (76–100) |
| HL:10k vs L:5k | 12 | 5–7 | 58 (32–81) |
| HL:10k vs HL:5k | 12 | 0–12 | 100 (76–100) |
| L:5k vs HL:5k | 12 | 0–12 | 100 (76–100) |
| L:5k vs HL:1k | 12 | 0–12 | 100 (76–100) |
| L:1k vs HL:5k | 12 | 7–5 | 42 (19–68) |
| L:1k vs HL:1k | 12 | 1–11 | 92 (65–99) |
| L:1k vs HL:2d | 12 | 0–12 | 100 (76–100) |
| HL:5k vs HL:1k | 12 | 5–7 | 58 (32–81) |
| HL:1k vs L:2d | 12 | 2–10 | 83 (55–95) |
| HL:1k vs HL:2d | 12 | 1–11 | 92 (65–99) |
| L:2d vs HL:2d | 12 | 7–5 | 42 (19–68) |
| L:2d vs LS:2d | 12 | 1–11 | 92 (65–99) |
| HL:2d vs LS:2d | 12 | 2–10 | 83 (55–95) |

**Fitted strengths.** θ in each board's v4 frame (`L:30k` = 0); "9×9 as
19×19" carries the 9×9 θ over to 19×19 through the standard levels'
measured (θ19, θ9) pairs (as the strength estimate does). It is only a
cross-check: the human SL model is trained on 19×19 games and plays
relatively better on 9×9 than the ladder does.

| Level | Label before | θ 19×19 (95% CI) | 19×19 rank (95% CI) | θ 9×9 (95% CI) | 9×9 as 19×19 | Label now |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `HL:30k` | ≈30 kyu | 0.2 (−2.7 to 9.8) | 33k (41k–13k) | 0.40 (−0.32 to 1.06) | 29k | ≈30 kyu |
| `HL:25k` | ≈29 kyu | 0.4 (−1.6 to 2.3) | 33k (38k–28k) | 1.12 (0.50 to 1.71) | 26k | ≈29 kyu |
| `HL:20k` | ≈23 kyu | 3.1 (0.9 to 4.9) | 26k (31k–22k) | 1.98 (1.33 to 2.62) | 23k | ≈23 kyu |
| `HL:15k` | ≈18 kyu | 8.6 (6.8 to 12.0) | 15k (18k–9k) | 5.23 (4.35 to 6.07) | 14k | ≈18 kyu |
| `HL:10k` | ≈12 kyu | 10.2 (6.7 to 13.3) | 12k (18k–8k) | 6.57 (5.74 to 7.37) | 10k | ≈12 kyu |
| `HL:5k` | ≈7 kyu | 17.3 (16.2 to 18.2)* | 3k (4k–2k)* | 12.25 (11.22 to 13.32) | 2k | **≈3 kyu** |
| `HL:1k` | ≈2 kyu | 20.9 (19.4 to 21.8)* | 2d (1d–3d)* | 13.16 (12.41 to 13.95) | 1d | **≈1 dan** |
| `HL:2d` | ≈4 dan | 25.9 (24.7 to 26.8)* | 6d (5d–7d)* | 15.03 (14.23 to 16.02) | 4d | ≈4 dan |
| `LS:2d` | ≈4 dan | 25.9 (24.4 to 26.8)* | 6d (5d–7d)* | 16.85 (15.77 to 19.28) | 7d | **≈5 dan** |

\* From a 6–0 sweep against one opponent: the likelihood alone has no
upper end, so the point and the upper limit come from the fit's weak
prior. Read these rows as "at least the lower limit".

**How the labels were decided.** A label moved only where (1) the 19×19
interval excludes the old label and (2) 9×9 points the same way. It
moved to a rank both boards support, leaning to the lower (more cautious)
one:

- `HL:5k` (`rank_7k`, search style, 24 visits) beat `L:5k` 6–0 on 19×19
  and 12–0 on 9×9, where it played even with `L:1k` (5–7). At least
  4 kyu on 19×19, about 2 kyu by 9×9: **≈3 kyu**. The search style lets
  this profile play far above its nominal 7 kyu against these programs.
- `HL:1k` (`rank_2k`, 64 visits) beat `L:1k` 6–0 and 11–1 and sits between
  `L:1k` and `L:2d` on 9×9. At least 1 dan on 19×19, about 1 dan by 9×9:
  **≈1 dan**.
- `LS:2d` (the stronger network, 64 visits) beat `L:2d` 6–0 and 11–1. At
  least 5 dan on 19×19: **≈5 dan**. Above 4 dan the scale itself rests on
  the furthest extrapolation from the 10-kyu anchor; treat it as "strong
  amateur dan", a lower bound.
- `HL:2d` also swept `L:2d` on 19×19 (6–0) but was even with it on 9×9
  (5–7). The boards disagree, so the label stays ≈4 dan; it is probably
  low on 19×19.
- `HL:15k` measured about 15 kyu on 19×19 and 14 kyu by 9×9, stronger than
  its ≈18 kyu label on both, but the 19×19 interval (18k–9k) still includes
  the label. Unchanged; likely a few ranks stronger than shown.
- `HL:25k` and `HL:20k` lost 1–5 to their standard levels on 19×19 (about
  33 and 26 kyu) but were as strong or stronger on 9×9. The boards
  disagree and the 19×19 intervals include the labels. Unchanged.
- `HL:30k` and `HL:10k` measured at their labels on both boards.

The order of the human-style levels is preserved on both boards except
`HL:30k`/`HL:25k` on 19×19 (0.2 vs 0.4 nats, indistinguishable), so the
slider still goes weaker to stronger. With the new labels the human-style
ladder is no longer evenly spaced: from `10k` (≈12 kyu) it jumps to `5k`
(≈3 kyu). That is a fact about the shipped profiles. Fixing it means new
profile settings (for example `rank_10k` with the search style, or fewer
visits at `5k`) and a new measurement, which v6 did not do.

**What changed in the app.** `STRENGTHS[].human.rank` and
`STRENGTHS[].strong.rank` hold the moved labels; `engine.js labelRank` and
`rankParts` show the label of the mode the level plays in now (with the
human-style switch on, the slider and the player panel say ≈3 kyu for
`5k`), and `suggestHandicap` uses that label. The measured θ of every
human-style level and of `LS:2d` feed the strength estimate
(`strength.js MEASURED`), so a game against them is rated against what
they actually play like. A saved game shows the label of the mode in use
when it is displayed, not when it was played.

**Limitations of this measurement.** Six 19×19 games per level are few:
a 6–0 sweep says "clearly stronger", not how much, and a 3–3 split is
consistent with a gap of a few ranks either way. 19×19 games were only
played against the same-ID standard level, so a level that sweeps gets
no upper bound. The frame is the v4 ladder: any error in its θ (or in the
10-kyu anchor) passes to these numbers unchanged. 9×9 shows the human SL
model in a different light than 19×19 (relatively stronger at the
bottom, relatively weaker at the top), so it is a cross-check, not a
substitute. The obvious next step is 19×19 games of each moved level
against the next standard level up (`HL:5k`–`L:1k`, `HL:1k`–`L:2d`),
which this run planned and dropped.

## v6: your strength — the estimate

Until v5 the player's level was an Elo-style number that moved by a fixed
step after each game against the computer, judged against the level's
*label*. Since v6 it is an estimate with an uncertainty
(`src/web/js/app/strength.js`), shown as "≈ 12 kyu (±1)" with a chart of
the estimate and its band over time (`app/strength-chart.jsx`).

**Units.** The estimate lives on the scale the levels were measured on:
θ, Bradley–Terry strength in nats on 19×19, with the same EGF mapping and
anchor as the labels (GoR(θ) = 4100 − K·e^(−θ/20), K fixed by
`H:rank_10k` = 10 kyu at θ = 11.65). The player is N(μ, σ²) over θ.
Opponents are the levels' **measured** θ (the tables above), not their
rounded labels: on 19×19 `30k` is θ 0 (≈ 34 kyu), not "30 kyu".

**Update.** Each rated game (against the computer, at least 12 moves, not
a draw — unchanged from v5) is one Glicko step in natural units:

- before the game, σ² grows by 0.2² (a learner gets stronger; without this
  the estimate would freeze after a few dozen games), and by 0.1² per day
  since the last game; σ never exceeds the prior's 2.5;
- the expected score is E = 1 / (1 + e^(−g·(θ_board(μ) − θ_opp))), where
  g = 1/√(1 + 3·0.5²/π²) accounts for a level's own measurement error
  (0.5 nats, about one rank, relative to its neighbours);
- σ'² = 1 / (1/σ² + s²g²E(1−E)) and μ' = μ + σ'²·s·g·(score − E), with s
  the slope of θ_board at μ (1 on 19×19).

**Board size.** The levels' gaps are smaller on 9×9 (the whole ladder
spans 14.9 nats there against 23.4 on 19×19). A 9×9 game is compared on
the 9×9 scale: the player's 19×19 θ is carried over through the levels'
measured (θ19, θ9) pairs, joined piecewise linearly (beyond the ends, the
overall slope 0.62). So a 9×9 win says less about 19×19 strength than a
19×19 win, and the band narrows more slowly. 13×13 was never measured; it
is taken halfway between the two. That is an assumption, not a result.

**Opponent mode.** A game against a human-style level or the stronger
network uses that mode's measured θ (v6 measurement above) where it
exists, on the board it was measured on, otherwise the standard level's.
Games against the offline engine (no KataGo) count as the standard level,
as in v5; the offline engine is not calibrated.

**Handicap.** As in v5, two or more stones make the level weaker by one
rank per stone on 19×19 (2.5 ranks on 13×13 and 5 on 9×9, the ratios
`suggestHandicap` uses); a single stone and komi are ignored. This is the
conventional value of a stone, not something measured here.

**Prior.** The rank chosen at onboarding or in Settings, ± 2.5 nats (about
4 ranks around 15 kyu, 6 around 30 kyu). Changing the rank in Settings
restarts the estimate, as it restarted the v5 rating.

**What "±" means.** The label shows the rank nearest the GoR of μ and the
half-width of μ ± σ in ranks, rounded, at least 1: the estimate is in that
range about two times in three, *given the ladder's scale*. It does not
include the anchor's own error (see Limitations: every label could move by
a few ranks together), so it says how sure the app is about you relative
to its levels. With σ ≈ 0.65 nats after 15–20 games on 19×19, that is
"±1" at most kyu ranks; on 9×9 alone it stays at about ±2.

**Game performance is not used.** The per-game report measures points
lost per move and accuracy, and it is tempting to let them nudge the
estimate. They are left out because nothing here calibrates them: the
post-game analysis uses 32–48 visits of b6c96 and is noisy on single moves;
how many points a player loses depends strongly on the opponent (the
beginner's-move levels leave big mistakes unpunished and give big gifts)
and on the board size; and there is no measurement relating a human's
loss per move to rank on this scale. A nudge from an uncalibrated signal
would bias the estimate in a way results cannot correct. Results against
measured opponents are the only evidence the estimate uses.

**Recommended opponent.** Today's suggested game and the New game sheet
suggest the level the player is expected to score closest to 50% against,
in the mode that level would play in (human-style when that is on), on
19×19; the quick 9×9 game gets its own suggestion on the 9×9 scale.
Handicap suggestions are unchanged (`suggestHandicap`, from the rank of
the estimate).

**Old data.** A v2–v5 rating (`{ r, games, history }`) is migrated on
start: μ is the old rating, σ what that many fair games would leave from
the prior, and every old history point keeps its time and value and gets
the band of its game count. `progress.rating.r` (the GoR of μ) and
`history[].r` keep their meaning, so the week summary and the trends
view read old and new data alike. Rank labels round to the nearest rank
since v6 (v5 rounded a rating towards the weaker rank).

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

v6 (human-style levels and the stronger network; both optional networks
from the URLs pinned in `src/models.zig`, checked against their SHA-256):

```bash
STRONG=/path/to/g170e-b15c192-s1672170752-d466197061.txt.gz
# 9×9: each HL level vs L of the same ID and its neighbours, vs the next HL, and LS:2d
node scripts/calibrate-strength.mjs play --katago $KATAGO --human-model $HUMAN --strong-model $STRONG \
  --size 9 --games 12 --pairs "HL:30k-L:30k,HL:30k-L:25k,HL:30k-HL:25k,...,LS:2d-L:2d,LS:2d-HL:2d" --out v6-9.jsonl
# 19×19: each HL level vs L of the same ID, and LS:2d vs L:2d
node scripts/calibrate-strength.mjs play --katago $KATAGO --human-model $HUMAN --strong-model $STRONG \
  --size 19 --games 6 --score-visits 200 --pairs "HL:30k-L:30k,...,HL:2d-L:2d,LS:2d-L:2d" --out v6-19.jsonl
node scripts/calibrate-strength.mjs fit v6-9.jsonl --size 9 --fixed --markdown
node scripts/calibrate-strength.mjs fit v6-19.jsonl --size 19 --fixed --markdown
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
