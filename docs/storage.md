# Storage (v13)

How Goban Studio keeps your data, what format it is in, how older data is
brought forward, and what the app does when something cannot be read. The
code is `src/web/js/data/` (store, games, settings, backup, migrate, pack)
over the host's `studio.store*` commands (`src/store.zig`). This page
replaces the "Storage" and "Backups" parts of `docs/v9.md`.

## Where it is

`<app data>` is the app's own folder under the user's application data
(`src/paths.zig`; the Native SDK's data directory for the bundle id
`dev.hxddh.gobanstudio`):

| | `<app data>` |
| --- | --- |
| macOS | `~/Library/Application Support/dev.hxddh.gobanstudio` |
| Windows | `%LOCALAPPDATA%\dev.hxddh.gobanstudio\Data` (usually `C:\Users\<you>\AppData\Local\dev.hxddh.gobanstudio\Data`) |

Inside it, `data/` holds everything on this page and `models/` the
optional KataGo networks (`src/models.zig`). Nothing is kept inside the
installed app: replacing the app (an in-app update, or a newer download
unpacked over it) keeps the data, and deleting the app leaves it behind.
To remove it, delete `~/Library/Application Support/dev.hxddh.gobanstudio`
on macOS, or `%LOCALAPPDATA%\dev.hxddh.gobanstudio` on Windows (that
folder also holds the window's remembered size, under `State`).

On Windows the folder `bin\goban-studio.exe.WebView2` inside the app
folder is the WebView2 component's own profile (its cache). Since v9 it
holds none of the player's data; the update helper still carries it over
to the new version so the web view does not start cold.

`studio.revealDataDir` opens `<app data>/data` in Finder or Explorer
(`host.js revealDataDir()`); the page never names the path.

`GOBAN_DATA_DIR` and `GOBAN_MODELS_DIR` (absolute paths) replace the two
folders, for tests and development.

## One instance

The first process takes an exclusive lock on `<app data>/data/instance.lock`
and keeps it until it exits (`src/instance.zig`); the operating system
releases it however the process ends. A second launch does not open the
store. It writes a request — the `.sgf` files it was started with, one
absolute path per line, or nothing — into `<app data>/data/inbox/`, which
the running app looks at every 400 ms: it deletes the request, brings its
window forward and opens the file. The second process exits as soon as its
request is gone. If instead the lock comes free (the first process was
just quitting), the second one carries on as the only instance; if neither
happens within four seconds it exits. Neither name is a valid store key,
so the store never lists them.

A launch while the update helper is replacing the app exits at once
(`src/install.zig ownUpdateInProgress`).

## Files

Desktop: files under `<app data>/data`. Browser preview: `localStorage`
under the prefix `goban9:` (development only).

```
settings.json            { v, …settings }                       read at boot
profile.json             the player model (model/player.js)     read at boot
current.json             { v, sgf, size, rules, moves, savedAt, …meta }
games-index.json         { v, games: { <id>: entry } }           read at boot
games/<id>.json          { v, id, createdAt, updatedAt, finishedAt,
                           source, sgf, meta, analysis?, review? }  read when needed
session.json, batch.json, update state …                         read at boot
bad/<key>-<time>.json    byte-for-byte copies of damaged files   never read
backups/pre-restore-<time>/<key>   the restore snapshot           read on undo
```

Keys are relative paths of 1–4 `[a-z0-9_-]` segments separated by `/`,
ending in `.json` (the same rule on both sides: `store.js validKey`,
`store.zig validKey`). That is why a damaged file's copy is
`bad/settings-1731000000000.json`, not `settings.json.bad`. A file is at
most 8 MB and moves over the bridge in chunks of 384 KB; the host writes a
temporary file and renames it over the target, so a file is never half
written.

A game file's `source` is `"game"` (played here; with no result it is an
unfinished game, which its row continues), `"import"` (an SGF opened,
pasted or dropped) or `"board"` (a free board saved from the Library's
*Open board*). A finished game against the computer that could be rated
keeps `meta.rateBase`: `{ size, entry, history, opponent, handicap,
eligible }` — the strength estimate's state on that board size before the
game, and the opponent's measured strength — so that counting the game
again can replace its rating step instead of adding one
(`model/rerate.js`). Older games have none: a rated one among them cannot
be counted again.

## Boot reads only what the first screens need

`store.open({ lazy: ["games/", "backups/"] })` lists every key but reads
only the others, side by side (eight at a time), not one after another.
The game files are read when a view needs one: opening a game
(`Games.loadGame`), exporting it, a background analysis (the job reads its
game first), a backup.

The history, Today's last three games, the player's level and the
background analysis's choice of games read `games-index.json`: one entry
per game with the file's times, source and `meta` (size, moves, result,
names, thumbnail, opponent, rating …), the review's version and confidence
and its biggest swing (the move and the points of the costliest key moment,
for the game's row), and whether an analysis is stored. Every save, patch
and delete keeps it up to date. At boot `initIndex` checks it against the listed game files:
a file the index does not know (or a missing index, as after an upgrade
from v12) is read once and added; an entry without a file is dropped. With
300 games and an index, boot reads `settings.json`, `profile.json`,
`current.json`, the index and nothing under `games/`
(`scripts/tests/data-safety.mjs`).

`getGame(id)` answers at once: the whole record when its file is read,
else the index's (`sgf`, `analysis`, `report` null, `loaded: false`).
Saving or patching a game whose file is not read yet (renaming it in the
Library) changes the index now and the file as soon as it is read, so its
analysis and review are kept.

## A game's analysis

Each position of a whole-game analysis keeps its numbers (score, win rate,
candidates) and `firm`, the share of the board KataGo considers settled
(what the phases in the summary need). KataGo's ownership map — one number
per point, 361 on 19×19, about 0.5 MB a game when every position kept it —
is kept only for the two positions around each of the twelve biggest score
swings of at least a point, which is where the explained key moments of
both players are (`data/pack.js`). The review on screen has the full maps
while it is open; the territory overlay of a stored game falls back to the
board's influence elsewhere. Packing is idempotent; older files are packed
when they are read and written back.

## Versions and migrations

Every file the data layer owns carries its format version `v`:
`settings.json`, `current.json`, `games-index.json`, `games/<id>.json`.
This version writes **13**. v9 to v12 wrote the same format without a
version, so a file without `v` is a v9 file.

`data/migrate.js` has one step per version, `MIGRATIONS[n]` turning a
version-n file into n + 1:

| Step | Change |
| --- | --- |
| 9 → 10, 10 → 11, 11 → 12 | none (the stored format did not change) |
| 12 → 13 | a game's analysis is packed (ownership maps only around key moments, `firm` per position); `v: 13` is added |

Steps run when a file is read — at `store.open`, at `store.load`, and for
every file of a backup being restored — and a file that changed is written
back in the new format. A file of a newer version than this app knows is
refused: the store write-blocks it and the app enters its safe state if it
is a core file. `profile.json` belongs to the player model: its own `v`
(`PROFILE_V`) is migrated by `normalizeProfile`, and here it is only
refused when it is newer. Other keys (the learn session, the update state,
the analysis queue) are their modules' to check.

Adding a format change: bump `STORE_V`, add `MIGRATIONS[STORE_V - 1]`
(pure, returns the value itself when nothing changes), and add a fixture
of the old shape to `scripts/tests/data-safety.mjs`.

## Backups

*Export backup* writes one JSON document of every key (game files not read
yet are read first):

```
{ app: "goban-studio", v: 13, at, data: { key: value } }
```

The copies under `bad/`, the snapshots under `backups/` and the games index
(rebuilt from the games) are left out. v9 to v12 wrote `v: 9`.

*Restore from backup* checks the document first: what it is; its version
(older than 9 or newer than 13 is refused with a message); every key; every
file's size against the store's 8 MB limit; and every file through the
migrations (a newer file inside is refused too). Then:

1. **Snapshot.** Everything in the store is copied to
   `backups/pre-restore-<time>/<key>`, one file per key (so no copy can
   outgrow the per-file limit), and older snapshots are removed. If the
   snapshot cannot be written, nothing is restored.
2. **Replace.** Every key is replaced with the backup's.
3. **Reload.** Whatever happened, the store turns read-only and the page
   reloads, so what is in memory and what is on disk never mix. A note
   after the reload says whether it worked.

Settings → Data then offers *Undo the last restore*, which puts the
snapshot back the same way (and reloads). The snapshot stays until a newer
restore replaces it.

## Safe state

The app must never take you for a new player because a file could not be
read, and then write defaults over your data.

- **A file that cannot be read** (an I/O error, or a newer version) is
  write-blocked: whatever the app puts there stays in memory and is never
  written over it.
- **A file that is not JSON** is first copied, byte for byte, to
  `bad/<key>-<time>.json`. A side file (a game, the learn session) is then
  moved aside and starts over; a core file stays where it is, blocked.
- **The core files** are `settings.json`, `profile.json` and
  `current.json`. If one of them could not be read, or the list of files
  itself failed, the store becomes read-only before anything else runs,
  no onboarding is shown, and a screen says which files and offers:
  - **Retry** — reload and open the store again;
  - **Continue read-only** — use the app; a banner says changes are not
    saved, with Retry;
  - **Start these files over** — only when every such file was merely
    damaged and its copy is kept: the damaged files are removed (the
    copies stay) and the app reloads. Games or a player model without
    settings are not a new player, so no onboarding follows.
- **A side file** that cannot be read is one toast ("Some saved data
  couldn't be read"), as before.

Writes that fail are kept pending and tried again (v9); a burst of failures
is one toast.

## The packaged app without its bridge

The packaged app keeps its data in files through `window.zero`. If the page
starts without the bridge (served from `zero://` on macOS and Linux, from
`https://native-sdk-app.localhost` in WebView2 — `host.js isPackaged`),
it waits a moment for it and then shows an error screen with Retry. It
never falls back to the WebView's `localStorage`, where it would look like
a fresh install. The store refuses that fallback too.

## Exports

In the app, SGF, image and backup exports go through the native save
dialog and `studio.writeTextFile`. When the player types a name without
the extension, the host adds it; the dialog only asked about the name as
typed, so if a file of the completed name exists the export goes to the
next free name (`game (2).sgf`) instead of replacing it
(`src/files.zig freeSavePath`). If the write fails, or the host has no
save dialog, the app shows an error; it does not fall back to a download
link, which a WebView silently ignores. The download link is the browser
preview's only.

## Unfinished games

See `docs/design.md` ("Unfinished games"): a game in progress that is
replaced is saved to the Library without a result and continues when it is
opened there.
