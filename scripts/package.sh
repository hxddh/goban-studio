#!/usr/bin/env bash
# Build frontend/dist, compile ReleaseSafe, package GobanStudio.app + zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.native/toolchains/zig-0.16.0:${PATH}"
# The Native SDK and its `native` CLI come from the lockfile (npm ci), not
# from a global install; this also runs the SDK's toolchain install.
node scripts/native-sdk.mjs toolchain
SDK_PATH="$(node scripts/native-sdk.mjs path)"
node scripts/patch-sdk.mjs "$SDK_PATH"
export PATH="${ROOT}/node_modules/.bin:${PATH}"

echo "==> build frontend bundle"
npm run build
node scripts/sync-dist.mjs

echo "==> unit tests"
node scripts/test.mjs

echo "==> zig build -Doptimize=ReleaseSafe"
zig build -Dnative-sdk-path="$SDK_PATH" -Doptimize=ReleaseSafe

echo "==> native package"
mkdir -p dist
rm -rf dist/GobanStudio.app
native package --target macos --signing adhoc --assets frontend/dist --output dist/GobanStudio.app --binary zig-out/bin/goban-studio

echo "==> install KataGo sidecar"
node scripts/install-engine.mjs dist/GobanStudio.app macos
# The SDK writes LSMinimumSystemVersion 11.0; the app needs macOS 13.
plutil -replace LSMinimumSystemVersion -string 13.0 dist/GobanStudio.app/Contents/Info.plist
codesign --force --sign - "dist/GobanStudio.app/Contents/Resources/frontend/dist/engine/macos/katago"
if [ -f "dist/GobanStudio.app/Contents/Resources/frontend/dist/engine/macos/katago-metal" ]; then
  codesign --force --sign - "dist/GobanStudio.app/Contents/Resources/frontend/dist/engine/macos/katago-metal"
fi
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
  # Drag the app onto this to install it.
  ln -s /Applications dmg/Applications
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
