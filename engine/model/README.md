# KataGo sidecar

`katago` (or `katago.exe`) is built or downloaded into `engine/<platform>/`.
The engine is KataGo v1.18.1, MIT licensed by David J Wu and contributors:
<https://github.com/lightvector/KataGo>.

`model.txt.gz` is the public b6c96 network (KataGo model version 8). It is
distributed with KataGo's releases under the same MIT licence. The model is
the small CPU-friendly network, not a superhuman GPU network. The
opponent's eight levels and their approximate ranks are measured with this
network; see `docs/strength.md`.

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
