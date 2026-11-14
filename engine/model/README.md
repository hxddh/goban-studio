# KataGo sidecar

`katago` (or `katago.exe`) is built or downloaded into `engine/<platform>/`.
The engine is KataGo v1.18.1, MIT licensed by David J Wu and contributors:
<https://github.com/lightvector/KataGo>.

`model.txt.gz` is the public b6c96 network (KataGo model version 8), from
KataGo's g170 run. The g170 networks are under CC0 (effectively public
domain), not the MIT licence of the engine:
<https://katagotraining.org/network_license/>. The model is
the small CPU-friendly network, not a superhuman GPU network. The
opponent's eight levels and their approximate ranks are measured with this
network; see `docs/strength.md`.

Source and pin: the file is `g170-b6c96-s175395328-d26788732.txt.gz`,
byte for byte the copy in KataGo's repository at
`cpp/tests/models/g170-b6c96-s175395328-d26788732.txt.gz` (tag v1.18.1,
commit `92ee95c0a4b25fec214da00951ab69e97e207729`), renamed. Its SHA-256 is

    48d6754de3c4754f95bf6a5ca40957a49e5e915aaaeede133a17b9ccf8fa5fcb

and `scripts/release-check.mjs` fails a release whose model differs. To
check it yourself:

    curl -fsSL https://raw.githubusercontent.com/lightvector/KataGo/92ee95c0a4b25fec214da00951ab69e97e207729/cpp/tests/models/g170-b6c96-s175395328-d26788732.txt.gz | sha256sum

Replacing the model means changing that hash on purpose and measuring the
levels again (`docs/strength.md`).

`human.cfg` (v5) configures the optional human-style opponent: KataGo is
started with `-human-model` and the downloaded `b18c384nbt-humanv0` network
only when a human-style game needs a move, following KataGo's
`gtp_human5k_example.cfg`; the host sets the profile per request. The
optional networks themselves are never part of the package: they are
downloaded on request into the app's data folder (`src/models.zig`).

`gtp.cfg` is deliberately small. The native host passes `-override-config`
for a writable log directory and disables pondering and resignation. The app
sends `boardsize`, `komi`, `kata-set-rules`, `maxVisits`, `maxTime` and the
move history, then asks for one `genmove`.
