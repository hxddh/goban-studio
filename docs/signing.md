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
the Authenticode step. The build workflows run with a read-only
`GITHUB_TOKEN` and have no job that writes to a release: a package reaches
a release only through `release.yml`, which checksums and signs all of them
together. (Earlier versions had an `upload` job that could replace one
platform's file in a published release from any branch; `SHA256SUMS` was
not recomputed, so every installed app then refused that file. It is
gone.) In `release.yml` only the `publish` job has `contents: write`, and
only the `sign` job holds the update key. `scripts/tests/shell-ci.mjs`
fails if any of this changes.

**Update signing.**

| Name | Kind | What it is |
| --- | --- | --- |
| `UPDATE_SIGNING_KEY` | **environment secret** of the environment `release-signing` (Settings → Environments) | The private key `scripts/sign-sums.mjs` signs `SHA256SUMS` with |
| `UPDATE_PUBKEY` | repository **variable** (Settings → Secrets and variables → Actions → Variables) | The matching public key; not secret |

**The `release-signing` environment — one-time setup by the owner.** The
key is what protects users from someone who can push a branch and start a
workflow, so it must not be readable by every workflow run:

1. Settings → Environments → New environment → `release-signing`.
2. *Deployment branches and tags*: selected branches → `main` only.
3. *Required reviewers*: at least one person (yourself is fine; tick
   "Prevent self-review" only if someone else can approve).
4. Add `UPDATE_SIGNING_KEY` as a secret **of this environment**.
5. Delete the repository-level secret `UPDATE_SIGNING_KEY` (Settings →
   Secrets and variables → Actions). Until you do, any workflow on any
   branch can still read it, and the environment protects nothing.

`release.yml` signs in a job of its own, `sign`, which declares
`environment: release-signing`: the run waits for the reviewer's approval,
and only then does the secret exist for that one job. The job never runs
in a rehearsal (`rehearse=true`), checks out nothing but
`scripts/sign-sums.mjs`, has a read-only token, and signs exactly the
`SHA256SUMS` the `assemble` job produced. The environment is created
without any rule the first time the workflow runs if it does not exist
yet, so steps 2–5 are what make it a protection.

- Both platform builds pass `-Dupdate-pubkey="$UPDATE_PUBKEY"` to
  `native test` and `native build` (an empty value when the variable is not
  set, which builds an app that does not require a signature).
- The `assemble` job writes `SHA256SUMS` (the five packages, and one more
  line that names the release: see "The signature names the version"
  below). The `sign` job then, if `UPDATE_SIGNING_KEY` is set, runs
  `node scripts/sign-sums.mjs` (the key is in that step's environment
  only) and checks that `SHA256SUMS.sig` was written; the `publish` job
  checks every package against `SHA256SUMS` once more and uploads
  everything to a draft release, which it then publishes.
- If `UPDATE_PUBKEY` is set but `UPDATE_SIGNING_KEY` is not, the `sign` job
  fails and nothing is published, because those apps would refuse every
  update from that release. (The preflight cannot check this any more: an
  environment's secret is invisible outside the environment. Put the
  secret in place and re-run the failed job; the packages are kept as
  artifacts.)
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

## Signed updates (v13)

Code signing tells the operating system who built the app. The in-app
updater needs a second, independent answer: is this release's
`SHA256SUMS` the one the maintainer published? Without it the updater can
only check that the downloaded zip matches `SHA256SUMS` from the same
GitHub release — anyone who can publish a release (a leaked token, a
compromised workflow) can publish matching sums. So the updater can also
require an **Ed25519 signature over `SHA256SUMS`**, made with a key that
never lives in the release itself.

| Name | Kind | What it is |
| --- | --- | --- |
| `UPDATE_PUBKEY` | repository **variable** | Base64 of the 32-byte Ed25519 public key. The build passes it as `-Dupdate-pubkey=…`; it is compiled into the app. |
| `UPDATE_SIGNING_KEY` | repository **secret** | The private key (PKCS#8 PEM, or base64 of the 32-byte seed). Only `scripts/sign-sums.mjs` in the release job reads it. |

**Create the pair** on a trusted machine (nothing is written to disk):

```sh
node scripts/gen-update-key.mjs
# UPDATE_PUBKEY (repository variable; build option -Dupdate-pubkey):
# 6kps…0iw=
# UPDATE_SIGNING_KEY (repository secret; never commit it):
# -----BEGIN PRIVATE KEY----- …
```

Store the first value as the variable `UPDATE_PUBKEY` and the PEM as the
secret `UPDATE_SIGNING_KEY` (Settings → Secrets and variables → Actions),
then clear the terminal. Never commit either; no key is in this repository.

**What the workflows do with them.**

- `build-macos.yml` and `build-windows.yml` add
  `-Dupdate-pubkey="${{ vars.UPDATE_PUBKEY }}"` to the native build. Empty
  (the variable is not set) means an unsigned-updates build, exactly as
  before v13.
- `release.yml`, in its `sign` job (the `release-signing` environment,
  never in a rehearsal), runs `node scripts/sign-sums.mjs SHA256SUMS` with
  `UPDATE_SIGNING_KEY` (and `UPDATE_PUBKEY`, so a key that does not match
  the shipped public key fails the release instead of publishing updates
  nobody can install) in that step's environment only, and publishes
  `SHA256SUMS.sig` next to `SHA256SUMS`.

**The signature names the version.** A signature over five package hashes
says "these packages are ours", not "these packages are version X".
Whoever controls a release could attach an old release's packages, sums
and signature to a new tag, and every app would install the old version
as an update (a downgrade to a known bug), or be kept from ever seeing a
newer one. So `SHA256SUMS` has a sixth line:

```
<sha256 of "v14.0.0\n">  VERSION
```

`VERSION` is a small release file holding the tag and a newline, so
`sha256sum -c SHA256SUMS` still works for people who check by hand
(`--ignore-missing` if you did not download every file). The app does not
download it: it computes the hash of the tag it is installing and compares
(`src/install.zig` `sumsBinding`). A build with an update key refuses sums
without the line (`NoVersion`) or with another version's
(`VersionMismatch`). After unpacking, the package must also say itself
that it is that version — `build-info.json` in both packages and
`CFBundleShortVersionString` on macOS — so the right sums with an old
package fail too. Apps older than this check skip the unknown line, as
they skip the `.dmg` lines, and keep updating.

**What the app does** (`src/install.zig`). Built with a key, it downloads
`SHA256SUMS`, then `SHA256SUMS.sig` (one line: the base64 of the 64-byte
detached signature over the exact bytes of `SHA256SUMS`), and verifies it
with `std.crypto.sign.Ed25519` **before** it reads any checksum or starts
the large download. A missing signature is `NoSignature`, a wrong one
`BadSignature`; either way nothing is installed and the page offers the
download page instead. Built without a key, the updater checks checksums
only and does not look for a signature. A malformed `-Dupdate-pubkey`
fails the build.

**Rolling it out.** Installed apps verify with the key they were built
with. The first release built with `UPDATE_PUBKEY` set must itself carry
`SHA256SUMS.sig`, and every later release too — a signed app refuses an
unsigned update. Older (unsigned-updates) apps keep updating as before, and
the first signed release they install turns the check on.

**Rotating or losing the key.** A new key pair needs a release built with
the new public key; apps built with the old key will refuse it (its
signature is by the new key), so those users update once by hand from the
releases page. Keep an offline copy of `UPDATE_SIGNING_KEY`.

**Check a release by hand:**

```sh
node -e '
const fs = require("fs");
import("./scripts/sign-sums.mjs").then(({ publicKeyFrom, verifySums }) =>
  console.log(verifySums(fs.readFileSync("SHA256SUMS"), fs.readFileSync("SHA256SUMS.sig", "utf8"), publicKeyFrom(process.env.UPDATE_PUBKEY)) ? "signature OK" : "BAD signature"));'
```

### Other update safeguards (v13)

- **No downgrades, no unchecked tags.** The app remembers the tag its own
  last successful update check returned; `studio.updateDownload` and
  `studio.updateApply` accept only that tag, and only when it is
  semver-newer than the running version (`NotChecked`, `NotNewer`). The
  updater CI probe (`GOBAN_UPDATE_PROBE_TAG`) may download one named tag to
  verify and discard it, never to install it.
- **The app quits only for a helper that runs.** The embedded helper takes
  an exclusive lock for the installation (`.<name>.goban-lock` beside it; a
  second helper refuses) and then creates a "started" marker in the staging
  directory. The app waits up to 25 s for it (a cold Windows PowerShell
  under a virus scan is slow to run its first line; the page says
  "installing" meanwhile); otherwise it claims the marker itself (a late
  helper then gives up), stays open and reports `HelperNotStarted`.
- **A launch during the swap does nothing.** While a helper holds the
  installation's lock, starting the app again exits at once, so no second
  process opens files in the folder being replaced. A lock older than
  twenty minutes is taken for abandoned and ignored.

## The Native SDK is pinned

The shell is built with `@native-sdk/cli`, and what it produces is the
executable users run. It is a devDependency at one exact version, and
`package-lock.json` holds the SHA-512 of the package and of each
per-platform package that carries the `native` binary. The workflows
install it with `npm ci --ignore-scripts` like everything else; nothing is
installed with `npm install -g`, and no workflow takes an SDK version as
an input any more.

The SDK's install script (which `--ignore-scripts` skips) downloads the
SDK's own compiler toolchain. The platform builds run it explicitly
(`node scripts/native-sdk.mjs toolchain`). It checks every download
against a SHA-256 or SHA-512 in a manifest inside the package
(`packages/core/scripts/scriptc-toolchain.json`); that manifest is covered
by the lockfile, and its SHA-256 is pinned again in
`scripts/native-sdk.mjs`, so a changed toolchain cannot arrive unnoticed.

To move to a new SDK version: `npm install --save-dev --save-exact
--ignore-scripts @native-sdk/cli@<version>`, update the manifest hash in
`scripts/native-sdk.mjs` (the script prints the new one), check
`scripts/patch-sdk.mjs` still applies, and let the pull request's
`native-hosts` job compile it on macOS and Windows.

Still not pinned: Zig itself (the setup action verifies it against Zig's
signing key), the runner images, and the Homebrew packages (cmake, ninja,
eigen) KataGo for macOS is built with.
