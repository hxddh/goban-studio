# Code signing and notarization

The release workflows sign only when the signing secrets exist. Without
them, a build still runs every gate and ships, but macOS gets an ad-hoc
signature (not notarized) and Windows is unsigned. Each build posts a
`::notice` that says this, writes a `signing-status-*` artifact, and the
release job builds the "First launch" table of the release notes and the
README inside each download from that status
(`scripts/signing-notes.mjs`). A release never claims a signature it
does not have.

| Secret | Platform | What it is |
| --- | --- | --- |
| `MACOS_CERT_P12_BASE64` | macOS | Base64 of a `.p12` holding the **Developer ID Application** certificate and its private key |
| `MACOS_CERT_PASSWORD` | macOS | The password you set when exporting that `.p12` |
| `APPLE_ID` | macOS | E-mail of an Apple Account in the team, used by `notarytool` |
| `APPLE_TEAM_ID` | macOS | The team's 10-character Team ID |
| `APPLE_APP_PASSWORD` | macOS | An **app-specific password** for `APPLE_ID` (not the account password) |
| `WINDOWS_CERT_PFX_BASE64` | Windows | Base64 of a `.pfx` with an Authenticode code-signing certificate and private key |
| `WINDOWS_CERT_PASSWORD` | Windows | The `.pfx` password |

macOS signs only when **all five** macOS secrets exist; Windows only when
**both** Windows secrets exist. A partial set falls back and names what is
missing.

`release.yml` passes them to `build-macos.yml` and `build-windows.yml` with
`secrets: inherit`. Running a platform workflow on its own
(`workflow_dispatch`) reads the same repository secrets.

## What the workflows do

**macOS** (`build-macos.yml`, `scripts/macos-sign.sh`)

1. `import`: decode the `.p12` into a temporary keychain in `$RUNNER_TEMP`
   (random password, removed at the end of the job, even on failure) and
   pick its "Developer ID Application" identity.
2. `sign`: sign every other Mach-O in the bundle first — KataGo at
   `Contents/Resources/frontend/dist/engine/macos/katago` — then the app,
   all with `--options runtime --timestamp`. The app gets
   `packaging/entitlements.plist`, which is deliberately empty: WKWebView
   runs JavaScript and its JIT in Apple's WebContent processes, the app is
   not sandboxed (so it needs no network or file entitlements), and KataGo
   is an ordinary child process that loads only system libraries. KataGo
   is signed with no entitlements.
3. The packaged-app self-test and the screenshot tour run **on the signed
   app**, so a hardened-runtime problem fails the build instead of a
   player's first launch.
4. Notarize the app (`xcrun notarytool submit --wait` on a zip of it),
   staple the ticket to the app, verify with `codesign --verify --deep
   --strict`, `xcrun stapler validate` and `spctl -a -vv --type exec`.
5. Build the zip (from the stapled app) and the dmg, sign the dmg,
   notarize and staple it, and check it with
   `spctl -a -vv -t open --context context:primary-signature`.

A rejected notarization prints Apple's log (`notarytool log`) and fails
the job.

**Windows** (`build-windows.yml`)

`signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256`
on `bin\goban-studio.exe` and `…\engine\windows\katago.exe`, then
`signtool verify /pa /v` and `Get-AuthenticodeSignature` (status must be
`Valid`, with a timestamp). The `.pfx` is written to `$RUNNER_TEMP` and
deleted in a `finally` block. `WebView2Loader.dll` and the MSVC runtime
DLLs are already signed by Microsoft; `libcrypto-3-x64.dll` from the KataGo
release is left as shipped.

## macOS: what to obtain

1. **Apple Developer Program membership** (individual or organization,
   99 USD a year): <https://developer.apple.com/programs/>. Your **Team
   ID** is on <https://developer.apple.com/account> under Membership
   details → `APPLE_TEAM_ID`.
2. **A Developer ID Application certificate.** Only the team's *Account
   Holder* can create one.
   - On a Mac: Keychain Access → Certificate Assistant → *Request a
     Certificate From a Certificate Authority…* → your e-mail, "Saved to
     disk". This creates the private key in your login keychain.
   - <https://developer.apple.com/account/resources/certificates/add> →
     **Developer ID Application** (not "Apple Development", not
     "Developer ID Installer") → profile type *G2 Sub-CA* → upload the
     request → download the `.cer` and double-click it.
   - (Or: Xcode → Settings → Accounts → your team → Manage Certificates →
     + → Developer ID Application.)
3. **Export it as `.p12`.** Keychain Access → *login* → *My Certificates*
   → expand "Developer ID Application: <name> (<TEAMID>)" so the private
   key shows → select the certificate → File → Export Items… → `.p12` →
   set a password (→ `MACOS_CERT_PASSWORD`).
4. **An app-specific password** for the Apple Account that will notarize
   (it must be a member of the team; two-factor authentication is
   required): <https://account.apple.com> → Sign-In and Security →
   App-Specific Passwords → generate one named e.g. "goban-studio
   notarization" → `APPLE_APP_PASSWORD`. That account's e-mail →
   `APPLE_ID`.

Check the certificate before uploading it:

```bash
openssl pkcs12 -in DeveloperID.p12 -nokeys | openssl x509 -noout -subject -enddate
# (Homebrew OpenSSL 3 may need -legacy after -nokeys)
# subject=… CN=Developer ID Application: Your Name (TEAMID1234) …
xcrun notarytool history --apple-id you@example.com --team-id TEAMID1234 --password abcd-efgh-ijkl-mnop
# lists past submissions (empty is fine) — proves the three notarization values
```

## Windows: what to obtain

You need an Authenticode **code-signing** certificate from a public CA
(OV or EV) **as a `.pfx` file with its private key**.

> **Read this before buying.** Since 1 June 2023 the CA/Browser Forum
> code-signing requirements oblige CAs to keep the private key of every
> new OV and EV code-signing certificate on a hardware token or HSM
> (FIPS 140-2 level 2 or better). CAs no longer issue exportable `.pfx`
> files, and certificates issued before that date (at most 39 months'
> validity) have now expired. So the `.pfx` secrets above will in practice
> only work with a certificate you already hold in exportable form. A
> self-signed certificate is not a substitute: `signtool verify /pa`
> rejects it and the build fails, by design.
>
> The current routes for a CI-signed Windows build are cloud signing
> services that keep the key in an HSM: **Azure Trusted Signing** (Microsoft;
> `azure/trusted-signing-action`, monthly fee, identity validation for the
> organization or individual), or a CA's cloud HSM (DigiCert KeyLocker,
> SSL.com eSigner, Sectigo, …) used through their signtool plug-in or CLI.
> These need a different workflow step (credentials, not a `.pfx`) and are
> **not implemented** here; the sign step in `build-windows.yml` is the one
> place to change.

If you do have an exportable certificate:

```powershell
# Check it: subject, expiry, and that it is for code signing (1.3.6.1.5.5.7.3.3)
certutil -dump .\codesign.pfx
```

Even a correctly signed build can meet SmartScreen until the certificate
has built reputation; the notes say so.

## Creating the secrets

GitHub → the repository → **Settings → Secrets and variables → Actions →
New repository secret**, one per name above. With the GitHub CLI:

```bash
# macOS (on the Mac holding the .p12)
base64 -i DeveloperID.p12 | gh secret set MACOS_CERT_P12_BASE64
gh secret set MACOS_CERT_PASSWORD      # prompts; paste the .p12 password
gh secret set APPLE_ID --body "you@example.com"
gh secret set APPLE_TEAM_ID --body "TEAMID1234"
gh secret set APPLE_APP_PASSWORD       # prompts; paste the app-specific password
```

```powershell
# Windows
[Convert]::ToBase64String([IO.File]::ReadAllBytes("codesign.pfx")) | gh secret set WINDOWS_CERT_PFX_BASE64
gh secret set WINDOWS_CERT_PASSWORD
```

Base64 must be a single line without headers (`base64 -i` on macOS and
`[Convert]::ToBase64String` both produce that; `certutil -encode` adds
headers and does not).

## Verifying

**In CI.** Run `gh workflow run release.yml -f tag=vX.Y.Z -f rehearse=true`.
Each platform job's summary says "Developer ID signed, notarized and
stapled" / "Authenticode-signed and timestamped", or names the fallback.
The `signing-status-macos` / `signing-status-windows` artifacts hold the
JSON the release job used, and the publish job's summary (and the
`release-notes` artifact) shows the notes exactly as they would be
published.

**A downloaded macOS build.**

```bash
spctl -a -vv -t open --context context:primary-signature GobanStudio-macOS-arm64.dmg
# … accepted  source=Notarized Developer ID
xcrun stapler validate GobanStudio-macOS-arm64.dmg
hdiutil attach GobanStudio-macOS-arm64.dmg
spctl -a -vv "/Volumes/Goban Studio/Goban Studio.app"
# … accepted  source=Notarized Developer ID  origin=Developer ID Application: …
codesign -dv --verbose=4 "/Volumes/Goban Studio/Goban Studio.app" 2>&1 | grep -E 'Authority|flags|Timestamp'
# flags=0x10000(runtime) and a secure Timestamp
codesign -dv "/Volumes/Goban Studio/Goban Studio.app/Contents/Resources/frontend/dist/engine/macos/katago"
```

An ad-hoc build reports `Signature=adhoc` and `spctl` rejects it; that is
expected and is what its release notes describe.

**A downloaded Windows build.**

```powershell
Get-AuthenticodeSignature .\GobanStudio\bin\goban-studio.exe | Format-List Status, SignerCertificate, TimeStamperCertificate
Get-AuthenticodeSignature (Get-ChildItem -Recurse -Filter katago.exe .\GobanStudio).FullName | Format-List Status
# Status : Valid, with a TimeStamperCertificate
```

Or right-click the exe → Properties → Digital Signatures.

## CI: how the workflows handle secrets and update signing (v13)

This section is about the workflows; how to create the update signing key
itself is described in its own section.

**Where secrets reach.** No secret is set at workflow or job level. In
`build-macos.yml` the five macOS secrets are given only to the steps that
read them: *signing mode* (which checks that all five exist), *import
Developer ID certificate*, and the two notarization steps (the Apple ID
trio). Signing with the imported identity needs no secret. In
`build-windows.yml` the two Windows secrets reach only *signing mode* and
the Authenticode step. The build jobs run with a read-only `GITHUB_TOKEN`;
a manual run with `release_tag` uploads from a separate `upload` job that
has write access and no secrets. `release.yml` grants `contents: write` to
the publish job (and to the calls of the two build workflows, only so their
`upload` job may exist; the build jobs stay read-only).
`scripts/tests/shell-ci.mjs` fails if any of this changes.

**Update signing.**

| Name | Kind | What it is |
| --- | --- | --- |
| `UPDATE_SIGNING_KEY` | repository **secret** | The private key `scripts/sign-sums.mjs` signs `SHA256SUMS` with |
| `UPDATE_PUBKEY` | repository **variable** (Settings → Secrets and variables → Actions → Variables) | The matching public key; not secret |

- Both platform builds pass `-Dupdate-pubkey="$UPDATE_PUBKEY"` to
  `native test` and `native build` (an empty value when the variable is not
  set, which builds an app that does not require a signature).
- The publish job writes `SHA256SUMS`, then, if `UPDATE_SIGNING_KEY` is
  set, runs `node scripts/sign-sums.mjs` (the key is in that step's
  environment only), checks that `SHA256SUMS.sig` was written, and uploads
  it with the packages.
- If `UPDATE_PUBKEY` is set but `UPDATE_SIGNING_KEY` is not, the release
  fails — in the preflight, before any build, and again before publishing —
  because those apps would refuse every update from that release. The
  preflight sees only whether the secret exists
  (`secrets.UPDATE_SIGNING_KEY != ''`), never its value.
- Neither set: the release ships an unsigned `SHA256SUMS`, as before, with
  a notice in the run.

Roll-out order: add the secret first (releases start carrying
`SHA256SUMS.sig`), then the variable (later builds start requiring it).
Rotating the key means a release whose apps carry the new public key,
signed with the old private key, so the installed apps accept it.

**Release guards.** `release.yml` runs only when dispatched from `main`
(`rehearse=true` runs from any branch and publishes nothing), stops unless
the tag is `v` + `package.json`'s version (a warning in a rehearsal), and
creates the tag with `gh release create --target "$GITHUB_SHA"` — the commit
every package was built from. A tag that already exists at another commit
stops the release.
