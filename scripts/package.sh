#!/usr/bin/env bash
# Build frontend/dist, compile ReleaseFast, package GobanStudio.app + zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.native/toolchains/zig-0.16.0:${PATH}"

echo "==> build frontend bundle"
npm run build
node scripts/sync-dist.mjs

echo "==> unit tests"
node scripts/test.mjs

echo "==> zig build -Doptimize=ReleaseFast"
zig build -Doptimize=ReleaseFast

echo "==> native package"
mkdir -p dist
rm -rf dist/GobanStudio.app
native package --target macos --signing adhoc --assets frontend/dist --output dist/GobanStudio.app --binary zig-out/bin/goban-studio

echo "==> install KataGo sidecar"
node scripts/install-engine.mjs dist/GobanStudio.app macos
codesign --force --sign - "dist/GobanStudio.app/Contents/Resources/frontend/dist/engine/macos/katago"
codesign --force --deep --sign - dist/GobanStudio.app
test -f "dist/GobanStudio.app/Contents/Resources/frontend/dist/licenses/Goban-Studio-MIT.txt"

echo "==> zip"
(
  cd dist
  rm -f GobanStudio-macOS-arm64.zip
  cp ../packaging/README-macOS.txt README-macOS.txt
  ditto -c -k --sequesterRsrc --keepParent GobanStudio.app GobanStudio-macOS-arm64.zip
  zip -g -j GobanStudio-macOS-arm64.zip README-macOS.txt
  rm -rf dmg
  mkdir -p dmg
  ditto GobanStudio.app "dmg/Goban Studio.app"
  cp README-macOS.txt dmg/README-macOS.txt
  rm -f GobanStudio-macOS-arm64.dmg
  hdiutil create -volname "Goban Studio" -srcfolder dmg -ov -format UDZO GobanStudio-macOS-arm64.dmg
  rm -rf GobanStudio.app dmg
  ls -lh GobanStudio-macOS-arm64.zip GobanStudio-macOS-arm64.dmg
)

echo "==> install ~/Applications/GobanStudio.app"
rm -rf "${HOME}/Applications/GobanStudio.app"
rm -rf dist/GobanStudio.app dist/__MACOSX
unzip -q -o dist/GobanStudio-macOS-arm64.zip -d dist -x '__MACOSX/*' '*/__MACOSX/*' || {
  unzip -q -o dist/GobanStudio-macOS-arm64.zip -d dist
  rm -rf dist/__MACOSX
}
ditto dist/GobanStudio.app "${HOME}/Applications/GobanStudio.app"
rm -rf dist/GobanStudio.app dist/__MACOSX

echo "OK: ${HOME}/Applications/GobanStudio.app"
echo "    dist/GobanStudio-macOS-arm64.zip"
