Goban Studio for macOS
======================

1. Drag Goban Studio.app to /Applications.
2. This build is ad-hoc signed, not notarized. On first launch macOS may
   say it cannot verify the app. Right-click the app, choose Open, then
   confirm Open. You only need to do this once.
   If macOS still blocks it, run:

     xattr -dr com.apple.quarantine /Applications/Goban\ Studio.app

3. The app is offline; it needs no account and makes no network request.

SGF files
---------
After the first launch, .sgf documents open from Finder with Goban Studio.
The app handles a double-click whether it is already running or not.

Licences
--------
Open Goban Studio.app/Contents/Resources/frontend/dist/licenses/. Goban
Studio is MIT licensed; KataGo, Moka and @sabaki/go-board are also MIT;
Inter is under the SIL Open Font License 1.1.

The SHA256SUMS file in the GitHub release lets you verify the download.
