# KataGo sidecar

`katago` (or `katago.exe`) is built or downloaded into `engine/<platform>/`.
The engine is KataGo v1.18.1, MIT licensed by David J Wu and contributors:
<https://github.com/lightvector/KataGo>.

`model.txt.gz` is the public b6c96 network (KataGo model version 8). It is
distributed with KataGo's releases under the same MIT licence. The model is
the small CPU-friendly network, not a superhuman GPU network. The
opponent's eight levels and their approximate ranks are measured with this
network; see `docs/strength.md`.

`gtp.cfg` is deliberately small. The native host passes `-override-config`
for a writable log directory and disables pondering and resignation. The app
sends `boardsize`, `komi`, `kata-set-rules`, `maxVisits`, `maxTime` and the
move history, then asks for one `genmove`.
