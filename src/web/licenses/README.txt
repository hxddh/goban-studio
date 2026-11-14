Goban Studio — third-party licences
===================================

Goban Studio itself is MIT licensed. The full text is in
Goban-Studio-MIT.txt. The application also redistributes the following
components; their licence texts sit beside this file.

  @sabaki/go-board 1.4.3 — MIT — sabaki-go-board-MIT.txt
  Preact 10.29.8 — MIT — Preact-MIT.txt
  Moka v2.1 9×9 network and player — MIT — Moka-MIT.txt
  KataGo 1.18.1 (the engine) — MIT — KataGo-MIT.txt
  The built-in b6c96 network (KataGo's g170 run) — CC0 — KataGo-networks.txt

On Apple Silicon Macs the Metal build of KataGo (engine/macos/katago-metal)
also contains Protocol Buffers (BSD-3-Clause), Abseil (Apache-2.0) and
katagocoreml (BSD-3-Clause); their licence texts are in engine/macos/licenses/
inside the app's frontend/dist folder.

The optional networks the app can download on request are not part of the
package: KataGo's human model (b18c384nbt-humanv0) and the stronger network
(kata1-b18c384nbt) are under the KataGo Neural Network License, whose
copyright notice and text are in KataGo-networks.txt.

The SGF opening positions are from the public-domain Go game collection at
https://homepages.cwi.nl/~aeb/go/games/ and the historical records are
public-domain game records. The course and the practice problems are
original to Goban Studio.

The board surfaces (kaya, katsura, paper, slate), the stone sprites, the
sounds, the icons and the brand mark are original to Goban Studio and are
covered by its MIT licence. They contain no third-party media: every image
and sound is generated procedurally from fixed seeds by
scripts/make-assets.mjs (pixel shading and modal sound synthesis written for
this project).
