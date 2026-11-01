#!/usr/bin/env bash
# macOS code signing and notarization for the release build (v4).
#
# Developer ID mode needs all five of these in the environment (GitHub
# secrets; see docs/signing.md):
#
#   MACOS_CERT_P12_BASE64  base64 of the "Developer ID Application" .p12
#   MACOS_CERT_PASSWORD    the .p12 export password
#   APPLE_ID               Apple Account e-mail used for notarization
#   APPLE_TEAM_ID          10-character team ID
#   APPLE_APP_PASSWORD     app-specific password for that Apple Account
#
# Without them every command falls back to ad-hoc signing ("-") and says so.
#
#   macos-sign.sh mode                 print developer-id | adhoc (and a notice)
#   macos-sign.sh import               temporary keychain + certificate → $GITHUB_ENV
#   macos-sign.sh sign <App.app>       sign KataGo and the app (hardened runtime)
#   macos-sign.sh notarize <file>      notarytool submit --wait (+ staple if possible)
#   macos-sign.sh verify-app <App.app> codesign/spctl/stapler checks
#   macos-sign.sh sign-dmg <file.dmg>  sign a disk image
#   macos-sign.sh cleanup              delete the temporary keychain
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
entitlements="$here/../packaging/entitlements.plist"
keychain="${RUNNER_TEMP:-/tmp}/goban-signing.keychain-db"

have_secrets() {
  [ -n "${MACOS_CERT_P12_BASE64:-}" ] && [ -n "${MACOS_CERT_PASSWORD:-}" ] &&
    [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_APP_PASSWORD:-}" ]
}

mode() {
  if have_secrets; then
    echo "developer-id"
  else
    local missing=()
    for v in MACOS_CERT_P12_BASE64 MACOS_CERT_PASSWORD APPLE_ID APPLE_TEAM_ID APPLE_APP_PASSWORD; do
      [ -n "${!v:-}" ] || missing+=("$v")
    done
    echo "::notice title=macOS signing::Developer ID secrets missing (${missing[*]}); building an ad-hoc signed, NOT notarized app. See docs/signing.md." >&2
    echo "adhoc"
  fi
}

identity() {
  if [ -n "${MACOS_SIGN_IDENTITY:-}" ]; then echo "$MACOS_SIGN_IDENTITY"; else echo "-"; fi
}

import_cert() {
  have_secrets || { echo "import: no Developer ID secrets" >&2; exit 1; }
  local p12="${RUNNER_TEMP:-/tmp}/goban-cert.p12"
  local kc_pass
  kc_pass="$(openssl rand -hex 24)"
  printf '%s' "$MACOS_CERT_P12_BASE64" | base64 --decode > "$p12"
  security create-keychain -p "$kc_pass" "$keychain"
  security set-keychain-settings -lut 21600 "$keychain"
  security unlock-keychain -p "$kc_pass" "$keychain"
  security import "$p12" -k "$keychain" -P "$MACOS_CERT_PASSWORD" -f pkcs12 \
    -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$kc_pass" "$keychain" > /dev/null
  # Put the temporary keychain first in the search list, keep the others.
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  rm -f "$p12"
  local line hash
  line="$(security find-identity -v -p codesigning "$keychain" | grep 'Developer ID Application' | head -n1 || true)"
  hash="$(printf '%s' "$line" | awk '{print $2}')"
  if [ -z "$hash" ]; then
    echo "import: no valid 'Developer ID Application' identity in the certificate" >&2
    security find-identity -v -p codesigning "$keychain" >&2 || true
    exit 1
  fi
  echo "import: signing as $(printf '%s' "$line" | sed -E 's/^[^"]*"(.*)"$/\1/')"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "MACOS_SIGN_IDENTITY=$hash" >> "$GITHUB_ENV"
    echo "MACOS_SIGN_KEYCHAIN=$keychain" >> "$GITHUB_ENV"
  fi
}

# Sign one Mach-O / bundle with the current identity.
sign_one() {
  local target="$1"; shift
  local id; id="$(identity)"
  if [ "$id" = "-" ]; then
    codesign --force --sign - "$@" "$target"
  else
    codesign --force --sign "$id" --options runtime --timestamp ${MACOS_SIGN_KEYCHAIN:+--keychain "$MACOS_SIGN_KEYCHAIN"} "$@" "$target"
  fi
}

sign_app() {
  local app="$1"
  local main_exe
  main_exe="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
  # Inside out: every other Mach-O in the bundle (KataGo, any dylib), then
  # the bundle itself. No --deep: it would re-sign nested code with the
  # app's entitlements.
  while IFS= read -r -d '' file; do
    [ "$file" = "$app/Contents/MacOS/$main_exe" ] && continue
    if file -b "$file" | grep -q 'Mach-O'; then
      echo "sign: ${file#"$app"/}"
      sign_one "$file"
    fi
  done < <(find "$app/Contents" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \) -print0)
  echo "sign: $(basename "$app") ($( [ "$(identity)" = "-" ] && echo ad-hoc || echo 'Developer ID, hardened runtime'))"
  sign_one "$app" --entitlements "$entitlements"
  codesign --verify --deep --strict --verbose=2 "$app"
}

notarize() {
  local file="$1"
  have_secrets || { echo "notarize: no Developer ID secrets" >&2; exit 1; }
  local out="${RUNNER_TEMP:-/tmp}/notary-$(basename "$file").json"
  echo "notarize: submitting $(basename "$file") (this waits for Apple)"
  set +e
  xcrun notarytool submit "$file" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" --wait --timeout 30m --output-format json > "$out"
  local rc=$?
  set -e
  cat "$out"; echo
  local status id
  status="$(/usr/bin/plutil -extract status raw -o - "$out" 2>/dev/null || true)"
  id="$(/usr/bin/plutil -extract id raw -o - "$out" 2>/dev/null || true)"
  if [ $rc -ne 0 ] || [ "$status" != "Accepted" ]; then
    echo "notarize: status '${status:-unknown}'" >&2
    if [ -n "$id" ]; then
      xcrun notarytool log "$id" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" >&2 || true
    fi
    exit 1
  fi
  case "$file" in
    *.zip) echo "notarize: accepted (a zip cannot be stapled; staple the app inside it)";;
    *) xcrun stapler staple "$file"; xcrun stapler validate "$file";;
  esac
}

verify_app() {
  local app="$1"
  codesign --verify --deep --strict --verbose=2 "$app"
  codesign -dv --verbose=4 "$app" 2>&1 | grep -E 'Authority|TeamIdentifier|flags|Timestamp' || true
  if [ "$(identity)" != "-" ]; then
    codesign -dv "$app" 2>&1 | grep -q 'flags=.*runtime' || { echo "verify: hardened runtime flag missing" >&2; exit 1; }
    xcrun stapler validate "$app"
    spctl -a -vv --type exec "$app"
  else
    echo "verify: ad-hoc build; Gatekeeper assessment skipped (it would reject an ad-hoc app)"
  fi
}

sign_dmg() {
  local dmg="$1"
  if [ "$(identity)" = "-" ]; then
    echo "sign-dmg: ad-hoc build; disk image left unsigned"
    return
  fi
  codesign --force --sign "$(identity)" --timestamp ${MACOS_SIGN_KEYCHAIN:+--keychain "$MACOS_SIGN_KEYCHAIN"} "$dmg"
  codesign --verify --verbose=2 "$dmg"
}

cleanup() {
  if [ -f "$keychain" ]; then security delete-keychain "$keychain" || true; fi
}

cmd="${1:-}"; shift || true
case "$cmd" in
  mode) mode ;;
  import) import_cert ;;
  sign) sign_app "$1" ;;
  notarize) notarize "$1" ;;
  verify-app) verify_app "$1" ;;
  sign-dmg) sign_dmg "$1" ;;
  cleanup) cleanup ;;
  *) echo "usage: macos-sign.sh mode|import|sign|notarize|verify-app|sign-dmg|cleanup" >&2; exit 2 ;;
esac
