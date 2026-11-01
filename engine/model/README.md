# KataGo sidecar

`katago` (or `katago.exe`) is built or downloaded into `engine/<platform>/`.
The engine is KataGo v1.16.0, MIT licensed by David J Wu and contributors:
<https://github.com/lightvector/KataGo>.

`model.txt.gz` is the public b6c96 network (KataGo model version 8). It is
distributed with KataGo's releases under the same MIT licence. The model is
the small CPU-friendly network, not a superhuman GPU network; the app labels
it "KataGo 19×19" and exposes five visit budgets rather than claiming a
fixed rank.

`gtp.cfg` is deliberately small. The native host passes `-override-config`
for a writable log directory and disables pondering and resignation. The app
sends `boardsize`, `komi`, `kata-set-rules`, `maxVisits`, `maxTime` and the
move history, then asks for one `genmove`.
