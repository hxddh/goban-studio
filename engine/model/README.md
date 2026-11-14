# KataGo sidecar

`katago` (or `katago.exe`) is built or downloaded into `engine/<platform>/`.
The engine is KataGo v1.18.1, MIT licensed by David J Wu and contributors:
<https://github.com/lightvector/KataGo>.

v15: a faster build may sit beside it, and the host starts it instead when
the machine can run it (`src/engine_build.zig`), falling back to the plain
build for the rest of the session if it does not answer its first command:

| Platform | Plain build (always) | Faster build | Used when |
| --- | --- | --- | --- |
| Windows x64 | `katago.exe` (official `eigen` zip) | `katago-avx2.exe` (official `eigenavx2` zip; same DLLs) | the CPU has AVX2 and FMA and the OS saves the AVX state |

`model.txt.gz` is the public b6c96 network (KataGo model version 8). It is
one of the networks of KataGo's "g170" run, which are under CC0 (effectively
public domain), not under KataGo's MIT licence and not under the KataGo
Neural Network License that covers the later "kata1" networks
(<https://katagotraining.org/network_license/>). The model is
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
downloaded on request into the app's data folder (`src/models.zig`), each
pinned by address, size and SHA-256:

| Kind | Network | From | Licence |
| --- | --- | --- | --- |
| human | `b18c384nbt-humanv0` (99,066,230 bytes) | KataGo's GitHub release v1.15.0 | KataGo Neural Network License |
| strong | `kata1-b18c384nbt-s9996604416-d4316597426` (97,898,094 bytes, SHA-256 `9d7a6afed8ff5b74894727e156f04f0cd36060a24824892008fbb6e0cba51f1d`) | `media.katagotraining.org` (KataGo's network server; not on GitHub) | KataGo Neural Network License |

Until v15 the strong network was `g170e-b15c192-s1672170752-d466197061`
(2020, 48 MB, CC0). The kata1 b18c384nbt network is far stronger per visit
but costs several times more per visit on a CPU; the levels and analysis
budgets that use it are to be measured again (`docs/strength.md`).

`LICENSE-KataGo-networks.txt` holds the KataGo Neural Network License with
its copyright notice, which the licence asks to keep with the networks, and
says which network is under which licence. It ships in the app's
`licenses/` folder as `KataGo-networks.txt`.

`gtp.cfg` is deliberately small. The native host passes `-override-config`
for a writable log directory and disables pondering and resignation. The app
sends `boardsize`, `komi`, `kata-set-rules`, `maxVisits`, `maxTime` and the
move history, then asks for one `genmove`.
