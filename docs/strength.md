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

v7 measured them again on GitHub's runners (708 games on 19×19, 824 on
9×9), retuned three human-style levels so that ladder has no gap (v6's
jumped from ≈12 kyu to ≈3 kyu) and moved the top two labels ("v7: the
human-style ladder without a gap" below).

v8 measured the whole ladder on 13×13 for the first time (960 games):
no label changes, but 13×13 games now count on their measured scale
("v8: the ladder on 13×13" below).

v9 drops the level IDs and the modes from the app: the player chooses a
rank, and the app plays the measured setting closest to it ("v9: one
opponent axis" below). The IDs below remain the names of calibrated
settings (`L:<id>`, `HL:<id>`, `LS:<id>` in the calibration); nothing
saved refers to them any more.

v15 replaces the optional stronger network (g170e-b15c192, 2020) with
kata1-b18c384nbt-s9996604416. The top opponent setting that uses it
(`LS:2d`) and the analysis budget (`STRONG_VISIT_SCALE`) were measured with
the old network and **have not been measured again yet** ("v15: a new
stronger network, not yet measured" below).

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

## v7: the human-style ladder without a gap

**Short version.** 1,532 new games (708 on 19×19, 824 on 9×9; 64
game-hours, about 17 runner-hours on GitHub-hosted Linux runners), pooled
with v6's 426 for the settings that did not change. Three human-style
levels have new settings, chosen from candidates and then measured:

| ID | v6 settings | v6 label | v7 settings | Measured 19×19 (95% CI) | v7 label |
| --- | --- | --- | --- | ---: | --- |
| `15k` | `rank_20k`, raw | ≈18 kyu (measured ≈15) | `rank_20k`, raw, 12% beginner's moves | 18k (20k–17k) | ≈18 kyu |
| `5k` | `rank_7k`, search, 24 visits | ≈3 kyu | the same plus 12% beginner's moves | 7k (8k–6k) | ≈7 kyu |
| `1k` | `rank_2k`, search, 64 visits | ≈1 dan | `rank_4k`, search, 32 visits | 1k (2k–1d) | ≈1 kyu |

and two labels moved on more evidence: human-style `2d` ≈4 dan →
**≈6 dan**, stronger-network `2d` ≈5 dan → **≈7 dan**. The human-style
ladder now reads 30, 29, 23, 18, 12, 7 kyu, 1 kyu, 6 dan: no step is
larger than six ranks, and from 25 kyu to 7 kyu it shows the same labels
as the standard ladder.

**Where it ran.** `.github/workflows/calibrate.yml` runs only on pushes to
a `calibrate/**` branch (never on `main` or a release branch). The branch
carries `docs/calibration/plan.json`: runs, each a board size, a list of
pairs and a number of games, split into shards. Every shard is one job on
a 4-core `ubuntu-latest` runner: it downloads KataGo's official 1.18.1
Linux release (`katago-v1.18.1-eigenavx2-linux-x64.zip`, Eigen AVX2 CPU
build, SHA-256 pinned in the workflow) and the two optional networks from
the URLs and SHA-256 pinned in `src/models.zig`, then plays its slice of
the schedule (`calibrate-strength.mjs play --shard I/N`, four games at a
time, one search thread per process) with the harness described under
Method. A last job merges the games into
`docs/calibration/results/<run>.jsonl` and commits them to the branch. All
the games are in that directory; v6's are there too (`v6-19.jsonl`,
`v6-9.jsonl`).

| Run | Board | Games | What | Runner-minutes |
| --- | --- | ---: | --- | ---: |
| `v7-screen9` | 9×9 | 540 | nine search-style candidates vs `L:10k`…`L:2d`, `HL:10k`…`HL:1k` | 56 |
| `v7-19a` | 19×19 | 300 | every v6 human-style level vs the standard levels around it; `HL:1k`, `HL:2d`, `LS:2d` vs a 400-visit bridge | 475 |
| `v7-19b`, `v7-9b` | both | 144 + 144 | `5k` candidates with 8, 15, 25% beginner's moves | 136 |
| `v7-19c`, `v7-9c` | both | 120 + 80 | the chosen `5k` (12%) | 141 |
| `v7-19d`, `v7-9d` | both | 80 + 60 | the chosen `15k` | 148 |
| `v7-19e` | 19×19 | 64 | the chosen `1k` | 70 |

Of the 708 19×19 games, 492 ended by two passes, 162 by adjudication and
54 at the move cap (all among the three weakest levels); every 9×9 game
ended by two passes. No game failed.

**How the settings were found.**

- *The gap.* On 9×9 every search-style candidate — profiles `rank_12k` to
  `rank_4k`, 8 to 32 visits — measured between θ 10.1 and 12.9, all far
  above `HL:10k` (6.8) and the standard `5k` (7.5): KataGo's veto of
  losing moves, not the profile or the budget, is what makes the search
  style strong, and it does so already at 8 visits. The raw style, for its
  part, does not reach single-digit kyu (v4). So the lever is the one the
  standard ladder uses, beginner's moves. On 19×19, `rank_7k` at 24 visits
  with 8% beginner's moves measured 6k (θ 14.8), with 15% 8k (13.0) and
  with 25% 11k (11.0); 12% interpolates to the standard `5k`'s 7 kyu and
  measured 7k (θ 13.7, 13.0–14.4) in its own 120 games.
- *`15k`.* Without beginner's moves `rank_20k`'s raw policy measured 15k
  on 19×19 (θ 8.4 in 42 games), eight ranks above `HL:20k` (24k). With
  12% it measured 18k (θ 6.8, 5.9–7.6), as the standard `15k`.
- *`1k`.* v6's `rank_2k` at 64 visits measured 1d (θ 19.8) and v6's `5k`
  settings 3k (16.8); `rank_4k` at 32 visits sits between them at 1k
  (θ 18.4), next to the standard `1k` (2k).
- *The top.* v6 had only sweeps of `L:2d` above 4 dan. v7 adds a bridge
  `C:v400` (the standard network, 400 visits, best move), which beat
  `L:2d` 10–2 (5d, 5d–6d). Human-style `2d` beat the bridge 11–1 and the
  stronger network 12–0: 7d (6d–8d) and 8d (7d–8d). The labels take the
  lower ends, ≈6 dan and ≈7 dan. On 9×9 the stronger network agrees (about
  7 dan) and human-style `2d` does not (even with `L:2d`, as in v6); the
  labels are 19×19 ranks and the 19×19 evidence is now 30 games with a
  bridge, so it decides. Above 4 dan this scale is the furthest
  extrapolation from the 10-kyu anchor: read both as "strong dan, at
  least this".

**Fitted strengths** (the standard ladder held at its v4 values,
`fit --fixed`; 19×19 and 9×9 fitted separately; intervals are 1000-game
bootstraps):

| Level | Settings | 19×19 games | θ 19×19 (95% CI) | 19×19 rank (95% CI) | θ 9×9 (95% CI) | Label |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `HL:30k` | `rank_20k` raw, 90% beginner | 42 | 0.42 (−0.39 to 1.22) | 33k (35k–31k) | 0.41 (−0.29 to 1.09) | ≈30 kyu |
| `HL:25k` | `rank_20k` raw, 70% | 42 | 1.39 (0.59 to 2.20) | 30k (32k–28k) | 1.15 (0.57 to 1.74) | ≈29 kyu |
| `HL:20k` | `rank_20k` raw, 35% | 58 | 3.90 (3.11 to 4.57) | 24k (26k–23k) | 2.10 (1.50 to 2.70) | ≈23 kyu |
| `HL:15k` | `rank_20k` raw, 12% (v7) | 80 | 6.77 (5.85 to 7.59) | 18k (20k–17k) | 4.64 (3.78 to 5.54) | ≈18 kyu |
| `HL:10k` | `rank_12k` raw | 82 | 10.19 (9.43 to 11.05) | 12k (14k–11k) | 6.79 (6.20 to 7.30) | ≈12 kyu |
| `HL:5k` | `rank_7k` search 24, 12% (v7) | 120 | 13.68 (12.99 to 14.39) | 7k (8k–6k) | 8.03 (7.33 to 8.93) | ≈7 kyu |
| `HL:1k` | `rank_4k` search 32 (v7) | 64 | 18.42 (17.55 to 19.42) | 1k (2k–1d) | 12.89 (12.27 to 13.53) | ≈1 kyu |
| `HL:2d` | `rank_4d` search 200 | 30 | 26.99 (25.97 to 28.62) | 7d (6d–8d) | 14.99 (14.21 to 15.91) | ≈6 dan |
| `LS:2d` | b15c192, 64 visits | 30 | 28.11 (27.42 to 29.02) | 8d (7d–8d) | 16.82 (15.81 to 19.08) | ≈7 dan |

The order holds on both boards. These θ are what the strength estimate
uses for games against the human-style levels and the stronger network
(`strength.js MEASURED`). Settings that did not change pool v6's games;
for the three that changed only games with the new settings count. The
labels of `HL:25k` (30k measured), `HL:20k` (24k) and `HL:10k` (12k)
stay: each interval contains the label.

19×19 games, all v6 and v7 pairs (A is the player the fit rates lower;
`CH:` names are the candidates and the old settings in
`docs/calibration/v7-candidates.json`: `CH:r20k`, `CH:s7k24` and
`CH:s2k64` are v6's `15k`, `5k` and `1k`):

| Pair (A vs B) | Games | A–B | B win % (95% CI) | Avg plies |
| --- | ---: | ---: | ---: | ---: |
| L:30k vs HL:30k | 18 | 7–11 | 61 (39–80) | 374 |
| L:30k vs HL:25k | 12 | 4–8 | 67 (39–86) | 406 |
| HL:30k vs L:25k | 12 | 2–10 | 83 (55–95) | 324 |
| HL:25k vs L:25k | 18 | 9–9 | 50 (29–71) | 373 |
| HL:25k vs L:20k | 12 | 0–12 | 100 (76–100) | 190 |
| L:25k vs HL:20k | 12 | 1–11 | 92 (65–99) | 304 |
| HL:20k vs L:20k | 18 | 7–11 | 61 (39–80) | 292 |
| HL:20k vs HL:15k | 16 | 0–16 | 100 (81–100) | 404 |
| HL:20k vs L:15k | 12 | 0–12 | 100 (76–100) | 210 |
| L:20k vs HL:15k | 16 | 5–11 | 69 (44–86) | 396 |
| L:20k vs CH:r20k | 12 | 3–9 | 75 (47–91) | 183 |
| HL:15k vs L:15k | 16 | 10–6 | 38 (18–61) | 370 |
| HL:15k vs HL:10k | 16 | 0–16 | 100 (81–100) | 317 |
| HL:15k vs L:10k | 16 | 1–15 | 94 (72–99) | 351 |
| L:15k vs CH:r20k | 18 | 2–16 | 89 (67–97) | 239 |
| L:15k vs HL:10k | 12 | 0–12 | 100 (76–100) | 233 |
| CH:r20k vs L:10k | 12 | 3–9 | 75 (47–91) | 213 |
| HL:10k vs L:10k | 18 | 7–11 | 61 (39–80) | 257 |
| HL:10k vs HL:5k | 24 | 1–23 | 96 (80–99) | 294 |
| HL:10k vs L:5k | 12 | 1–11 | 92 (65–99) | 208 |
| L:10k vs CH:s7k24b25 | 16 | 6–10 | 63 (39–82) | 312 |
| L:10k vs CH:s7k24b15 | 16 | 1–15 | 94 (72–99) | 339 |
| L:10k vs HL:5k | 24 | 0–24 | 100 (86–100) | 343 |
| L:10k vs CH:s7k24b8 | 16 | 0–16 | 100 (81–100) | 349 |
| CH:s7k24b25 vs L:5k | 16 | 2–14 | 88 (64–97) | 306 |
| CH:s7k24b25 vs L:1k | 16 | 0–16 | 100 (81–100) | 331 |
| CH:s7k24b15 vs L:5k | 16 | 5–11 | 69 (44–86) | 298 |
| CH:s7k24b15 vs L:1k | 16 | 0–16 | 100 (81–100) | 295 |
| HL:5k vs L:5k | 24 | 10–14 | 58 (39–76) | 305 |
| HL:5k vs CH:s7k24 | 24 | 1–23 | 96 (80–99) | 283 |
| HL:5k vs L:1k | 24 | 1–23 | 96 (80–99) | 274 |
| L:5k vs CH:s7k24b8 | 16 | 5–11 | 69 (44–86) | 312 |
| L:5k vs CH:s7k24 | 18 | 1–17 | 94 (74–99) | 244 |
| CH:s7k24b8 vs L:1k | 16 | 1–15 | 94 (72–99) | 276 |
| CH:s7k24 vs L:1k | 12 | 2–10 | 83 (55–95) | 240 |
| CH:s7k24 vs HL:1k | 16 | 4–12 | 75 (51–90) | 259 |
| CH:s7k24 vs L:2d | 12 | 0–12 | 100 (76–100) | 201 |
| L:1k vs HL:1k | 16 | 5–11 | 69 (44–86) | 272 |
| L:1k vs CH:s2k64 | 18 | 2–16 | 89 (67–97) | 226 |
| HL:1k vs CH:s2k64 | 16 | 3–13 | 81 (57–93) | 271 |
| HL:1k vs L:2d | 16 | 1–15 | 94 (72–99) | 247 |
| CH:s2k64 vs L:2d | 12 | 0–12 | 100 (76–100) | 207 |
| CH:s2k64 vs C:v400 | 12 | 0–12 | 100 (76–100) | 218 |
| L:2d vs C:v400 | 12 | 2–10 | 83 (55–95) | 245 |
| L:2d vs HL:2d | 18 | 0–18 | 100 (82–100) | 233 |
| L:2d vs LS:2d | 18 | 0–18 | 100 (82–100) | 233 |
| C:v400 vs HL:2d | 12 | 1–11 | 92 (65–99) | 268 |
| C:v400 vs LS:2d | 12 | 0–12 | 100 (76–100) | 247 |

Candidates on 19×19 (same fit): `CH:s7k24b25` 11k (θ 11.0), `CH:s7k24b15`
8k (13.0), `CH:s7k24b8` 6k (14.8), `CH:s7k24` (v6's `5k`) 3k (16.8, 4k–2k),
`CH:s2k64` (v6's `1k`) 1d (19.8, 1k–2d), `CH:r20k` (v6's `15k`) 15k (8.4,
18k–13k), `C:v400` 5d (24.6, 5d–6d). v6's two moved labels, ≈3 kyu and
≈1 dan, were close to these fuller measurements.

9×9 screen (θ in the 9×9 frame, 60 games each against `L:10k`, `L:5k`,
`L:1k`, `HL:10k`, `HL:5k` or, for the last two, `L:5k`…`L:2d`, `HL:5k`,
`HL:1k`): `rank_7k` 24 visits with 5% beginner's moves 9.9; `rank_10k`
8 visits 10.2; `rank_7k` 8 and 12 visits 11.0; `rank_10k` 16 visits 11.5;
`rank_12k` 24 visits 11.7; `rank_5k` 24 visits 11.8; `rank_10k` 24 visits
11.9; `rank_4k` 32 visits 12.9 (now `HL:1k`). For comparison `L:1k` is
12.1 and `L:2d` 14.9.

**What changed in the app.** `STRENGTHS[].human` of `15k`, `5k` and `1k`
(the settings above; `human.rank` 1 for `1k`, none for `5k`, which now
shows the standard ≈7 kyu), `human.rank` −5 (6 dan) for `2d` and
`strong.rank` −6 (7 dan). `strength.js MEASURED.human` and `.strong` hold
the θ above, so the strength estimate, the suggested opponent and the
handicap suggestion use them. Saved games against a human-style `5k`,
`15k` or `1k` keep their level ID; from v7 they are shown with the v7
label, as in v6.

**Limitations of this measurement.** Everything under Limitations below
still applies: the frame is the v4 ladder and the 10-kyu anchor, and the
intervals here include neither. 12–24 games per pair separate levels a
few ranks apart and leave ±1 rank on most labels. The top two labels rest
on one bridge player and on the anchor's furthest extrapolation. The
human-style beginner's moves are the ladder's (`beginnerMove`), not a
model of how real 7-kyu players err: the `5k` level now plays mostly
human-like strong moves with occasional random ones, which may feel less
human than its v6 version did. The settings were chosen on the same data
that measures them for `5k` and `15k` (a choice between bracketing
candidates, then 120 and 80 games of the chosen one); `1k` was measured
once. The runners used four games at a time with one thread per process;
the app uses more threads, which matters little at these visit budgets.

## v8: the ladder on 13×13

**Short version.** 13×13 had never been measured: the strength estimate
placed every level halfway between its 9×9 and 19×19 strengths. v8
played 960 games on 13×13 on GitHub's runners (14 game-hours, about
4 runner-hours of the 10 budgeted): the standard ladder, every
human-style level, the stronger network, a 400-visit bridge above the
top and three bridges inside the ladder's two sweeps. The halfway rule
turns out close for the standard levels up to `1k` (within the
intervals, at most 0.6 nats off) but too high at the top: the standard
`2d` measures 17.4 against 19.1 assumed, and the human-style `2d`, which
on 19×19 is far above the standard `2d` (θ 27.0 against 23.4), is level
with it on 13×13 (17.8 against 22.1 assumed — about four ranks), as on
9×9. **No label changes**: the labels are 19×19 ranks and nothing here
measures 19×19. **The strength estimate changes**: 13×13 games are now
compared on the measured 13×13 scale (`strength.js MEASURED[…][13]`),
like 9×9 games, so a 13×13 result against human-style `2d` (or `1k`,
`5k`) no longer flatters the player, and a 13×13 game now carries about
0.89 of the weight of a 19×19 game near 10 kyu (it carried the same
weight before).

**Where it ran.** As in v7 (`.github/workflows/calibrate.yml`, the plan
in `docs/calibration/plan.json`, four games at a time with one search
thread per process on 4-core `ubuntu-latest` runners, KataGo 1.18.1
Eigen AVX2 and the pinned networks), on the branches
`calibrate/v8-13a` and `calibrate/v8-13c`. 13×13 games took about 150
plies on average; 314 of 960 ended by adjudication, one at the move cap
(260), the rest by two passes; no game failed.

| Run | GitHub run | Games | What | Runner-minutes |
| --- | --- | ---: | --- | ---: |
| `v8-13a` | 41956831340 | 416 | the standard ladder: adjacent levels and two apart, 32 games each | ≈ 50 |
| `v8-13b` | 41956831340 | 400 | each human-style level vs the standard level of its ID and both neighbours; `HL:2d` and `LS:2d` vs `L:2d` and `C:v400`; 16 games each | ≈ 170 |
| `v8-13c` | 41960020906 | 144 | bridges `C:b40` (blunder 0.4, between `15k` and `10k`), `C:b03` (`5k` with 3% beginner's moves) and `C:k1b5` (`1k` with 5%), against both neighbours; 24 games each | ≈ 25 |

(Runner-minutes from the jobs' durations, including about a minute of
set-up per job.)

**Fit.** One Bradley–Terry fit of all 960 games with every player free
and `L:30k` = 0 (`fit … --size 13`; 1000-game bootstraps; there is no
anchor on 13×13 — the human SL model is a 19×19 model — so these are
order and spacing only, in the 13×13 frame):

| Level | θ 13×13 (95% CI) | halfway rule (v6–v7) | θ 9×9 | θ 19×19 | Label (19×19, unchanged) |
| --- | ---: | ---: | ---: | ---: | --- |
| `L:30k` | 0 (reference) | 0 | 0 | 0 | ≈30 kyu |
| `L:25k` | 0.84 (0.29 to 1.51) | 1.10 | 0.40 | 1.80 | ≈29 kyu |
| `L:20k` | 3.22 (2.48 to 4.33) | 3.33 | 2.06 | 4.59 | ≈23 kyu |
| `L:15k` | 4.99 (4.14 to 6.21) | 4.87 | 2.85 | 6.88 | ≈18 kyu |
| `L:10k` | 8.33 (7.50 to 9.91) | 8.17 | 6.13 | 10.21 | ≈12 kyu |
| `L:5k` | 10.10 (9.23 to 11.88) | 10.66 | 7.47 | 13.85 | ≈7 kyu |
| `L:1k` | 14.91 (13.90 to 16.89) | 14.99 | 12.08 | 17.90 | ≈2 kyu |
| `L:2d` | 17.45 (16.35 to 19.86) | 19.14 | 14.93 | 23.35 | ≈4 dan |
| `HL:30k` | 0.19 (−0.62 to 0.99) | 0.3 | 0.41 | 0.42 | ≈30 kyu |
| `HL:25k` | 1.04 (0.30 to 1.86) | 0.8 | 1.15 | 1.39 | ≈29 kyu |
| `HL:20k` | 3.66 (2.70 to 5.04) | 2.8 | 2.10 | 3.90 | ≈23 kyu |
| `HL:15k` | 5.45 (4.51 to 7.03) | 4.8 | 4.64 | 6.77 | ≈18 kyu |
| `HL:10k` | 8.81 (7.77 to 10.61) | 8.2 | 6.79 | 10.19 | ≈12 kyu |
| `HL:5k` | 10.13 (9.02 to 12.10) | 10.5 | 8.03 | 13.68 | ≈7 kyu |
| `HL:1k` | 14.47 (13.17 to 16.52) | 15.4 | 12.89 | 18.42 | ≈1 kyu |
| `HL:2d` | 17.82 (16.55 to 20.28) | 22.1 | 14.99 | 26.99 | ≈6 dan |
| `LS:2d` | 22.78 (21.64 to 25.29) | 23.0 | 16.82 | 28.11 | ≈7 dan |
| `C:v400` | 18.82 (17.55 to 21.53) | – | – | 24.6 | – |
| `C:b40` | 6.36 (5.35 to 8.00) | – | – | – | – |
| `C:b03` | 11.27 (10.20 to 13.26) | – | – | – | – |
| `C:k1b5` | 13.01 (11.72 to 15.03) | – | – | – | – |

"Halfway rule" is what v6–v7 used for a 13×13 game: the level's 19×19 θ
(of its mode) carried to 13×13 halfway between 19×19 and the 9×9 curve.
Intervals are relative to `L:30k` and widen up the ladder.

**What the games say.**

- *The standard ladder* keeps its order and roughly its 9×9-to-19×19
  proportions: it spans 17.4 nats on 13×13 against 14.9 on 9×9 and 23.4
  on 19×19. Adjacent levels are 2–5 nats apart; the two pairs that were
  32–0 in `v8-13a` (`15k`–`10k`, `5k`–`1k`) are now linked by bridges
  that won some games on each side: `C:b40` 18–6 against `L:15k` and
  4–20 against `L:10k`; `C:b03` 19–5 against `L:5k` and 0–24 against
  `L:1k`; `C:k1b5` 23–1 against `L:5k` and 3–21 against `L:1k`. The
  bridges moved `10k` and `5k` down by about one nat from the fit of
  `v8-13a` alone, inside its intervals.
- *The human-style levels* sit within about half a nat of the standard
  level of the same ID from `30k` to `5k` (each pair 6–10 to 9–7 in 16
  games), as on 19×19: their labels hold on 13×13 too. `HL:1k` is
  slightly below `L:1k` (6–10).
- *The top.* On 19×19 human-style `2d` and the stronger network are 3.6
  and 4.8 nats above `L:2d`. On 13×13 human-style `2d` is level with it
  (10–6 in 16 games, 0.4 nats) and below the bridge `C:v400` (4–12); the
  stronger network is far above everything (16–0 against both). On 9×9
  v6 and v7 found the same for human-style `2d`. The small boards favour
  the network's reading over the human model's judgement; the ≈6 dan
  label is a 19×19 rank and stays.

**What changed in the app.** `strength.js MEASURED` has a `13` entry for
every level in every mode (the fit above); `onBoard`/`fromBoard` carry
θ between 19×19 and 13×13 through the standard levels' (θ19, θ13) pairs,
as for 9×9 (beyond the ends, the overall slope 0.77); `levelTheta` on
13×13 uses the level's own 13×13 measurement. So the expected score of a
13×13 game, the update after it and the suggested 13×13 opponent are
measured, not assumed. The suggestion moves one level down for a
25-kyu and a 15-kyu player against the human-style ladder (its `20k`
and `15k` are a little stronger on 13×13 than assumed) and nowhere else.
Labels, the handicap rule (2.5 ranks a stone on 13×13) and
`suggestHandicap` are unchanged; handicap games were not measured.

**Limitations.** All of v7's apply: no human played, the spacing is
bot-versus-bot, the runners used one search thread per process. 13×13
has no anchor, so nothing here can move a 19×19 label. 16 games per
human-style pair give ±0.8 nats or so on each; the top of the 13×13
ladder rests on one bridge (`C:v400`). Games at komi 6.5, Japanese
rules, no handicap.

To refit:

```bash
node scripts/calibrate-strength.mjs fit docs/calibration/results/v8-13*.jsonl --size 13 --markdown
# the human-style levels against the standard ladder held at its 13×13 values
node scripts/calibrate-strength.mjs fit docs/calibration/results/v8-13*.jsonl --size 13 --fixed --markdown
```

13×13 games, all pairs (A is the player the fit rates lower):

| Pair (A vs B, A rated lower) | Games | A–B | B win % (95% CI) | Avg plies | Adjudicated | Capped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L:30k vs HL:30k | 16 | 6–10 | 63 (39–82) | 222 | 1 | 0 |
| L:30k vs L:25k | 32 | 12–20 | 63 (45–77) | 210 | 3 | 0 |
| L:30k vs HL:25k | 16 | 3–13 | 81 (57–93) | 206 | 3 | 0 |
| L:30k vs L:20k | 32 | 1–31 | 97 (84–99) | 162 | 18 | 0 |
| HL:30k vs L:25k | 16 | 4–12 | 75 (51–90) | 205 | 3 | 0 |
| L:25k vs HL:25k | 16 | 9–7 | 44 (23–67) | 212 | 2 | 0 |
| L:25k vs L:20k | 32 | 2–30 | 94 (80–98) | 183 | 15 | 1 |
| L:25k vs HL:20k | 16 | 1–15 | 94 (72–99) | 198 | 3 | 0 |
| L:25k vs L:15k | 32 | 0–32 | 100 (89–100) | 148 | 21 | 0 |
| HL:25k vs L:20k | 16 | 2–14 | 88 (64–97) | 172 | 7 | 0 |
| L:20k vs HL:20k | 16 | 6–10 | 63 (39–82) | 180 | 1 | 0 |
| L:20k vs L:15k | 32 | 4–28 | 88 (72–95) | 184 | 6 | 0 |
| L:20k vs HL:15k | 16 | 2–14 | 88 (64–97) | 169 | 4 | 0 |
| L:20k vs L:10k | 32 | 0–32 | 100 (89–100) | 113 | 30 | 0 |
| HL:20k vs L:15k | 16 | 3–13 | 81 (57–93) | 166 | 6 | 0 |
| L:15k vs HL:15k | 16 | 5–11 | 69 (44–86) | 150 | 5 | 0 |
| L:15k vs C:b40 | 24 | 6–18 | 75 (55–88) | 157 | 7 | 0 |
| L:15k vs L:10k | 32 | 0–32 | 100 (89–100) | 138 | 18 | 0 |
| L:15k vs HL:10k | 16 | 0–16 | 100 (81–100) | 150 | 5 | 0 |
| L:15k vs L:5k | 32 | 0–32 | 100 (89–100) | 107 | 29 | 0 |
| HL:15k vs L:10k | 16 | 0–16 | 100 (81–100) | 135 | 2 | 0 |
| C:b40 vs L:10k | 24 | 4–20 | 83 (64–93) | 160 | 3 | 0 |
| L:10k vs HL:10k | 16 | 6–10 | 63 (39–82) | 137 | 2 | 0 |
| L:10k vs L:5k | 32 | 3–29 | 91 (76–97) | 148 | 5 | 0 |
| L:10k vs HL:5k | 16 | 3–13 | 81 (57–93) | 140 | 4 | 0 |
| L:10k vs L:1k | 32 | 0–32 | 100 (89–100) | 130 | 19 | 0 |
| HL:10k vs L:5k | 16 | 3–13 | 81 (57–93) | 119 | 0 | 0 |
| L:5k vs HL:5k | 16 | 7–9 | 56 (33–77) | 141 | 0 | 0 |
| L:5k vs C:b03 | 24 | 5–19 | 79 (60–91) | 138 | 2 | 0 |
| L:5k vs C:k1b5 | 24 | 1–23 | 96 (80–99) | 142 | 2 | 0 |
| L:5k vs HL:1k | 16 | 0–16 | 100 (81–100) | 148 | 7 | 0 |
| L:5k vs L:1k | 32 | 0–32 | 100 (89–100) | 138 | 8 | 0 |
| L:5k vs L:2d | 32 | 0–32 | 100 (89–100) | 128 | 12 | 0 |
| HL:5k vs L:1k | 16 | 0–16 | 100 (81–100) | 119 | 3 | 0 |
| C:b03 vs L:1k | 24 | 0–24 | 100 (86–100) | 141 | 2 | 0 |
| C:k1b5 vs L:1k | 24 | 3–21 | 88 (69–96) | 122 | 7 | 0 |
| HL:1k vs L:1k | 16 | 6–10 | 63 (39–82) | 122 | 4 | 0 |
| HL:1k vs L:2d | 16 | 1–15 | 94 (72–99) | 117 | 2 | 0 |
| L:1k vs L:2d | 32 | 1–31 | 97 (84–99) | 123 | 7 | 0 |
| L:2d vs HL:2d | 16 | 6–10 | 63 (39–82) | 118 | 6 | 0 |
| L:2d vs C:v400 | 16 | 3–13 | 81 (57–93) | 122 | 4 | 0 |
| L:2d vs LS:2d | 16 | 0–16 | 100 (81–100) | 134 | 12 | 0 |
| HL:2d vs C:v400 | 16 | 4–12 | 75 (51–90) | 129 | 3 | 0 |
| C:v400 vs LS:2d | 16 | 0–16 | 100 (81–100) | 134 | 11 | 0 |

## v9: one opponent axis

**Short version.** No new games: v9 changes how levels are chosen and
labelled, not how they play. New game offers one slider of ranks; each
rank is played by the setting (an *implementation*) whose measured
19×19 strength is closest, among what the installed networks can play,
and the slider shows that setting's measured rank, not the rank asked
for. There is no mode, no human-style switch and no per-mode label.
`src/web/js/opponents.js` holds the tables; engine.js plays them; the
rating reads the same numbers.

**The ladder.** 30, 24, 18, 15, 12, 10, 7, 4 and 1 kyu, 4 dan, 7 dan:
six ranks apart in the double-digit kyu (where the bottom levels are
compressed and the measurements are coarse), then three. Each rank is
within one rank of what plays it, on every combination of networks.

| Rank | Nothing installed | Human-style network | Stronger network only |
| --- | --- | --- | --- |
| 30k | `L:25k` ≈29k | `HL:25k` ≈30k | `L:25k` ≈29k |
| 24k | `L:20k` ≈23k | `HL:20k` ≈24k | `L:20k` ≈23k |
| 18k | `L:15k` ≈18k | `HL:15k` ≈18k | `L:15k` ≈18k |
| 15k | `C:b40` ≈15k | `CH:r20k` ≈15k | `C:b40` ≈15k |
| 12k | `L:10k` ≈12k | `HL:10k` ≈12k | `L:10k` ≈12k |
| 10k | `C:b18` ≈10k | `C:b18` ≈10k | `C:b18` ≈10k |
| 7k | `L:5k` ≈7k | `HL:5k` ≈7k | `L:5k` ≈7k |
| 4k | `C:b0` ≈5k | `CH:s7k24` ≈3k | `C:b0` ≈5k |
| 1k | `L:1k` ≈2k | `HL:1k` ≈1k | `L:1k` ≈2k |
| 4d | `L:2d` ≈4d | `L:2d` ≈4d | `L:2d` ≈4d |
| 7d | — (the 4d entry) | `HL:2d` ≈7d | `LS:2d` ≈8d |

With both networks the column is the human-style one. Without the
optional networks 7 dan is out of reach and the ladder ends at 4 dan.

**How a rank maps** (`levelFor(rank, installed)`): among the
implementations the installed networks can play, the one whose measured
19×19 rank is closest; a human-style implementation wins when it
measured within one rank of the rank asked for and at most half a rank
farther than the closest standard one, because it plays more like a
person. That is why 10 kyu is standard even with the human network (its
nearest human-style setting, `CH:s7k24b25`, measured 11 kyu, a rank off)
and 4 dan is standard (human-style `2d` measured 7 dan). When a process
cannot answer during a game, the nearest standard implementation plays
the move and the player panel shows its rank.

**The implementations.** All are settings that were measured, under
their calibration names. Besides the shipped v4–v8 levels, v9 uses five
bridge settings from the same games: `C:b40`, `C:b18`, `C:b0` (v4: the
8-visit base level with 40%, 18% and no beginner's moves; `C:b40` was
also measured on 13×13 in v8) and `CH:r20k`, `CH:s7k24` (v6's human-style
`15k` and `5k`, which v7 measured again before replacing them; 19×19 and
9×9). Rank intervals are the published 95% bootstrap intervals: the v4
table for `L:` and `C:` (they include the anchor's sampling error), the
v7 fit with the ladder held fixed for `HL:`, `CH:` and `LS:` (they do
not include the ladder's own error).

| Implementation | Kind | Settings | θ 19×19 | Rank (95% CI) | θ 13×13 | θ 9×9 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `HL:25k` | human | `rank_20k` raw, 70% beginner's moves | 1.39 | 30k (32k–28k) | 1.04 | 1.15 |
| `L:25k` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.95 | 1.8 | 29k (36k–26k) | 0.84 | 0.40 |
| `HL:20k` | human | `rank_20k` raw, 35% beginner's moves | 3.9 | 24k (26k–23k) | 3.66 | 2.10 |
| `L:20k` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.75 | 4.59 | 23k (27k–21k) | 3.22 | 2.06 |
| `HL:15k` | human | `rank_20k` raw, 12% beginner's moves | 6.77 | 18k (20k–17k) | 5.45 | 4.64 |
| `L:15k` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.6 | 6.88 | 18k (21k–16k) | 4.99 | 2.85 |
| `CH:r20k` | human | `rank_20k` raw | 8.37 | 15k (18k–13k) | 7.02* | 5.30 |
| `C:b40` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.4 | 8.56 | 15k (17k–14k) | 6.36 | 4.50* |
| `HL:10k` | human | `rank_12k` raw | 10.19 | 12k (14k–11k) | 8.81 | 6.79 |
| `L:10k` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.25 | 10.21 | 12k (14k–11k) | 8.33 | 6.13 |
| `C:b18` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.18 | 11.97 | 10k (11k–8k) | 9.19* | 6.78* |
| `HL:5k` | human | `rank_7k` search 24, 12% beginner's moves | 13.68 | 7k (8k–6k) | 10.13 | 8.03 |
| `L:5k` | standard | 8 visits, temp 2, window 40, slip 0.3, blunder 0.09 | 13.85 | 7k (8k–5k) | 10.10 | 7.47 |
| `C:b0` | standard | 8 visits, temp 2, window 40, slip 0.3 | 14.98 | 5k (6k–4k) | 11.44* | 8.76* |
| `CH:s7k24` | human | `rank_7k` search 24 | 16.81 | 3k (4k–2k) | 13.00* | 11.97 |
| `L:1k` | standard | 32 visits, temp 0.7, window 6, slip 0.02 | 17.9 | 2k (3k–1d) | 14.91 | 12.08 |
| `HL:1k` | human | `rank_4k` search 32 | 18.42 | 1k (2k–1d) | 14.47 | 12.89 |
| `L:2d` | standard | 160 visits, best move | 23.35 | 4d (3d–6d) | 17.45 | 14.93 |
| `HL:2d` | human | `rank_4d` search 200 | 26.99 | 7d (6d–8d) | 17.82 | 14.99 |
| `LS:2d` | strong | stronger network, 64 visits | 28.11 | 8d (7d–8d) | 22.78 | 16.82 |

\* Not measured on that board: derived from the implementation's 19×19 θ
through the measured levels of the same kind (piecewise linear in their
(θ 19×19, θ board) pairs, as `onBoard` does for the estimate). On 9×9 the
ladder is compressed as before: `C:b18` and `HL:10k` are level there.

**What changed against v8.** The labels are the measured ranks
themselves: human-style `2d` shows 7 dan (v7 showed the lower end of its
interval, 6 dan) and the stronger network 8 dan. The standard `30k`
level (≈34 kyu, shown as 30 kyu since v4) and human-style `30k` are no
longer offered: 30 kyu is played by the settings that measured 29–30 kyu.
Human-style 1 kyu → 4 dan is no longer a seven-rank step; 4 dan sits
between them. Pacing, resignation and the count proposal (`app/feel.js`)
now read the measured rank played (from 15 kyu up the computer may
resign; weaker ranks play every game out).

**What a game stores.** Its `rank` (the measured rank shown) and `impl`
(the implementation), never a level ID; Settings store `opponentRank`, a
rank of the ladder. The rating (`app/strength.js rateGame`) uses the
implementation that actually played, on the board it was played on, so
`measured(rank, size, installed)` and the estimate agree.

**Limitations.** Everything above still applies. The bridges have
fewer games than the shipped levels (`C:b18` 58 on 19×19, `CH:r20k` 42,
`C:b40` 70 plus 48 on 13×13), and those without a small-board
measurement use a derived one; the 7-dan and 8-dan entries rest on one
bridge player and the anchor's furthest extrapolation.

## v11: 13×13 handicap stones and the anchor again

Two runs on GitHub-hosted runners (run 42333747888, branch
`calibrate/v11-handicap-anchor`, 16 jobs, about 90 minutes of wall time),
with `scripts/calibrate-strength.mjs`, which now plays handicap games: a
pair `A-B@hN` gives A N stones as Black on the app's handicap points
(`rules.js handicapPoints`) at the app's handicap komi (0.5, Japanese
rules), as the native host sends them.

**13×13 handicap (`v11-13h`, 864 games).** The weaker standard level
against the next level up and two up (20k/15k, 15k/10k, 10k/5k, 5k/1k,
1k/2d, 20k/10k, 15k/5k, 10k/1k, 5k/2d), with 1, 2, 3 and 4 stones, 24
games each. The levels are held at their v8 13×13 values (`--fixed`);
each stone count gets its own Black-advantage term γ:

| Stones | Games | Black wins | γ (nats) | 95% CI |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 216 | 7 | −0.40 | −1.48 … 0.20 |
| 2 | 216 | 16 | 0.54 | −0.14 … 1.04 |
| 3 | 216 | 35 | 1.60 | 1.15 … 2.01 |
| 4 | 216 | 38 | 1.74 | 1.25 … 2.17 |

As the app counts a stone (`ladder.js levelTheta`: each stone from two
makes the level weaker by `RANKS_PER_STONE[13]` ranks of 100 GoR), the
best single value is **0.90 ranks a stone (95% CI 0.76 … 1.02;** 0.89
with one-stone games included). The app uses 2.5.

**What changed in the app: nothing.** Between these players a 13×13
stone is worth less than a 19×19 rank, which contradicts the usual
experience of people (a stone on a smaller board is worth more, and the
app's 19×19 value of one rank a stone is itself the conventional value,
not a measured one). Bot-versus-bot games may not say how much a stone
helps a person: a weak level makes its mistakes at the same rate with or
without the stones. Until people are measured, `RANKS_PER_STONE[13]`,
`suggestHandicap` and `handicapFor` keep 2.5; the number above is the
measured bot value, recorded here.

**The 10-kyu anchor again (`v11-19anchor`, 192 games).** `H:rank_10k`
against `L:15k`, `C:b40`, `L:10k`, `C:b18`, `L:5k` and `C:b0` (32 games
each), every implementation of the current ladder held at its measured
θ (`--fixed impls`; the bridges are in
`docs/calibration/v11-candidates.json`). θ of `H:rank_10k` = **11.60
(95% CI 11.16 … 12.06)**, against 11.65 (10.35 … 14.69) in v4, with a
much narrower interval. `ANCHOR_K` (`opponents.js`) is unchanged; every
label stays where it was.

To refit:

```sh
node scripts/calibrate-strength.mjs fit docs/calibration/results/v11-13h.jsonl --size 13 --fixed --markdown
node scripts/calibrate-strength.mjs fit docs/calibration/results/v11-19anchor.jsonl --size 19 --fixed impls --markdown
```

## v6: your strength — the estimate

Until v5 the player's level was an Elo-style number that moved by a fixed
step after each game against the computer, judged against the level's
*label*. Since v6 it is an estimate with an uncertainty
(`src/web/js/app/strength.js`), shown as "≈ 12 kyu (±1)" (`app/estimate-label.js`; v9 removed the
chart of the estimate over time).

**Units.** The estimate lives on the scale the levels were measured on:
θ, Bradley–Terry strength in nats on 19×19, with the same EGF mapping and
anchor as the labels (GoR(θ) = 4100 − K·e^(−θ/20), K fixed by
`H:rank_10k` = 10 kyu at θ = 11.65). The player is N(μ, σ²) over θ.
Opponents are the levels' **measured** θ (the tables above), not their
rounded labels: on 19×19 `30k` is θ 0 (≈ 34 kyu), not "30 kyu".

**Games with help.** A game in which the player took a move back or asked
for a hint is not rated: it is stored with `assisted: true`, stays in the
list of games and its analysis still counts for the week's focus, but it
makes no rating step and adds no history point (`recordGame`, `undos` /
`hints`; teaching mode's own warnings are not hints).

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
19×19 win, and the band narrows more slowly. Until v7, 13×13 was not
measured and was taken halfway between the two; since v8 it is measured
and works the same way as 9×9, through the (θ19, θ13) pairs (overall
slope 0.77; "v8" above).

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
`history[].r` keep their meaning, so the trends view reads old and new
data alike. Rank labels round to the nearest rank
since v6 (v5 rounded a rating towards the weaker rank).

## v13: your moves, a second channel

Results against the measured levels remain the evidence for the estimate.
v13 adds a second, separate reading from the player's own moves
(`src/web/js/model/move-rank.js`), the approach KaTrain and AI Sensei use:
KataGo's human SL model gives, for a position and a rank profile, the
probability that a player of that rank plays each point. After a finished
game's analysis, for every move of the player from move 10 on, the app
asks for the probability of the move actually played under the profiles
`rank_20k`, `rank_15k`, `rank_10k`, `rank_5k`, `rank_1k`, `rank_1d` and
`rank_3d`. A uniform prior over the profiles and the summed log
probabilities give a posterior; each move counts as a quarter of an
independent observation (neighbouring moves are correlated, and the model
imitates style rather than strength), no probability counts below 0.001,
and a game needs 30 scored moves. The review summary then shows "Your moves
look like ≈ 12 kyu (8 kyu to 15 kyu)": the posterior mean and mean ± one
standard deviation, at least ± 2 ranks, never outside the 20 kyu – 3 dan
range of the profiles. It is stored with the game (`moveRank`) and in the
game's player-model record.

**Only a weak prior.** `applyMoveRank` uses a game's reading once, and only
while that board's estimate rests on fewer than 5 rated games, as a
Gaussian measurement of at least 4 nats (about six ranks around 15 kyu).
Against the prior's 2.5 nats it moves a fresh estimate about 28 % of the
way towards the reading and narrows the band from 2.5 to about 2.1 nats; it
is not a game, so it never counts towards the games that make the band
narrow. Results soon outweigh it, as they should: the profiles were
inconsistent with each other against the ladder (Limitations below:
`rank_20k` measured about 17 kyu, no raw profile stronger than about 10
kyu), so the reading's absolute ranks are the model's labels, not this
ladder's.

**What the host must offer.** The reading needs the human-style model and
a host call that returns the human policy of positions. The current
search requests cannot provide it: their report lists only the moves the
search visited, with the main network's prior, so the move played is often
missing. The JavaScript side (`katago.js humanMoveProbabilities`) asks only
a host whose `studio.katagoStatus` reports `humanPolicy: true`, through
`studio.katagoHumanPolicy` (position fields as `katagoAnalyzeAsync`, the
whole main line, the player's colour and the profiles), and expects
`{ ok, moves: [{ index, p: { profile: probability } }] }`. The native side
(`src/engine_worker.zig` `processPolicy`, `src/bridge_katago.zig` `katagoHumanPolicy`) is
one request kind on the human slot: it brings KataGo to each position
before a move of that colour (the incremental sync) and, for each profile
(checked by `validProfile`), sends `kata-set-param humanSLProfile
<profile>` and `kata-raw-human-nn <colour> 0` (KataGo 1.18.1), reading the
probability of the played point (or `policyPass`) from the policy grid; an
illegal point (`NAN`) counts as 0. `index` is the move's 0-based position
in the main line. The work is bounded (at most 8 profiles and 1600
evaluations, 200 positions; the reply then says `truncated`), each
evaluation extends the watchdog's deadline by 20 s, and an abort cancels
the request by its id. `humanPolicy` is reported only while the human
model is installed; until then nothing is shown and the estimate is
unchanged.

## v15: a new stronger network, not yet measured

The optional "stronger analysis" download is now
`kata1-b18c384nbt-s9996604416-d4316597426` (98 MB, from
`media.katagotraining.org`, `src/models.zig`) instead of
`g170e-b15c192-s1672170752-d466197061` (48 MB). It is used for:

- the top opponent setting, `LS:2d` (`opponents.js`): the `2d` level's
  search on the stronger network (64 visits) instead of 160 visits on
  b6c96;
- analysis, review, hints and counting, at `STRONG_VISIT_SCALE` (0.5) of
  the visits asked of b6c96.

Nothing here has been measured with the new network. `LS:2d`'s θ and label
in `MEASURED.strong` are b15c192's; with a much stronger network at the
same visits the label is, if anything, a lower bound, the same reading v5
gave the old network. The cost per visit is the open question: the new
network is about five times b15c192's size (18 blocks × 384 channels against
15 × 192), so on a CPU each visit costs several times more, and v5 rejected
b20c256 at 4.9 visits/s on the test VM as too slow for a laptop. It is
expected to be much faster with the Metal build on Apple Silicon and the
AVX2 build on Windows (v15), but that too is unmeasured.

To do before the labels or the budget are trusted again, with the
calibration workflow (`.github/workflows/calibrate.yml`, which downloads
the networks pinned in `src/models.zig` and now points
`KATAGO_STRONG_MODEL` at the new file):

1. `calibrate-strength.mjs` with `LS:2d` against `L:2d` and the anchor,
   19×19 and 9×9, to place `LS:2d` again (and consider fewer visits);
2. KataGo `benchmark` with the new network on the runner, to set
   `STRONG_VISIT_SCALE` so that a full-game review takes no longer than it
   did with b15c192.

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

v7 (on GitHub's runners). Write a plan (`docs/calibration/plan.json` holds
one that re-measures the shipped human-style ladder; candidates with a
`human` object play as `CH:<name>`), commit it on a branch named
`calibrate/<anything>` and push; the games come back as a commit on that
branch in `docs/calibration/results/`. Pushing the same plan with more
games plays only the new ones. To refit v7's numbers from the committed
games, naming the levels as shipped (v7's games are stored under the
names they were played under):

```bash
A="HL:5k=CH:s7k24,HL:15k=CH:r20k,HL:1k=CH:s2k64,CH:s7k24b12=HL:5k,CH:r20kb12=HL:15k,CH:s4k32=HL:1k"
node scripts/calibrate-strength.mjs fit docs/calibration/results/*-19*.jsonl --size 19 --fixed --alias "$A" --markdown
node scripts/calibrate-strength.mjs fit docs/calibration/results/*9*.jsonl --size 9 --fixed --alias "$A" --markdown
```

The same commands run locally: `play --shard I/N` plays one of N
disjoint slices of a schedule, `merge OUT IN…` joins result files.
