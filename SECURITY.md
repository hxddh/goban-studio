# Security

Goban Studio is an offline desktop app: a Zig shell around the system
WebView (WKWebView on macOS, WebView2 on Windows), a Preact page and a
KataGo child process. This page says what it trusts, what it defends
against, what it does not, and how to report a problem.

## Reporting a vulnerability

Please report privately through GitHub's **Report a vulnerability** button
on the repository's Security tab (a private security advisory). Do not
open a public issue for something exploitable. Include the version
(Settings → About), the platform, and steps or a file that reproduces it.
You should get an answer within a week; a fix ships as a patch release, and
the advisory is published once the fix is out.

Only the latest release is supported. There are no older branches.

## What the app talks to

- **Nothing, by default.** Games, lessons, problems, analysis and the
  opponent all run on your computer. There is no account, telemetry or
  analytics.
- **GitHub releases, when you ask.** *Check for updates*, *Download and
  install*, and the optional KataGo networks fetch files from
  `github.com` release downloads only. The addresses are fixed in the native
  code (`src/install.zig`, `src/models.zig`): the page passes a release tag
  or a network kind, never a URL, and redirects are followed only to
  GitHub's own download hosts over HTTPS. If your system (or the
  `HTTPS_PROXY` environment variable) names an HTTP proxy, these requests
  go through it as a CONNECT tunnel: the proxy learns the host name, and
  TLS is still verified end to end with GitHub (`src/net.zig`). Only
  plain HTTP proxies are used; SOCKS proxies and auto-config (PAC) scripts
  are not, and when no tunnel can be set up the request goes out directly.
- **Files you choose.** SGF files and backups are read and written where
  you point the file dialog, or opened from the OS ("Open with", drag and
  drop).

## Trust boundaries

1. **The page is not fully trusted by the shell.** It renders SGF files
   and comments from anywhere, so the native bridge (`src/main.zig`) accepts
   a fixed list of commands with typed payloads, the store's file names are
   checked against an allow-list on both sides, and KataGo receives only a
   narrow GTP vocabulary. A cross-site-scripting bug in the page should not
   become arbitrary file access or code execution; if you find a path where
   it does, that is a vulnerability.
2. **KataGo output is parsed as untrusted.** The shell reads its replies
   with bounds checks. Release builds are compiled **ReleaseSafe**, so an
   out-of-range index or a bad integer cast stops the app instead of
   silently corrupting memory.
3. **Downloads are verified before use.** The optional networks are pinned
   by size and SHA-256 in `src/models.zig` and renamed into place only after
   the hash matches. An update package must match its line in the release's
   `SHA256SUMS`; it is unpacked into a temporary folder and checked (layout,
   bundle id, CPU, the version it states, and `codesign --verify` on
   macOS) before the helper swaps it in, keeping the old version to roll
   back to.
4. **One process owns the data.** The first instance holds a lock on the
   data folder; a second launch hands its `.sgf` arguments over through a
   small inbox folder there and exits (`src/instance.zig`). The inbox
   accepts only absolute `.sgf` paths, with the same rules as a file opened
   from the OS, so it gives another local program nothing it could not do
   by starting the app with that file.

## The update trust root

`SHA256SUMS` and the packages come from the same GitHub release, so a
checksum alone only proves the download is intact: whoever controls the
repository's release (for example with a stolen GitHub token) controls what
the updater installs.

The release pipeline can close that gap with a separate signing key:

- With the secret `UPDATE_SIGNING_KEY` (a secret of the protected
  environment `release-signing`, not of the repository), `release.yml`
  signs `SHA256SUMS` and publishes `SHA256SUMS.sig` beside it
  (`scripts/sign-sums.mjs`). The signed bytes name the release they are
  for (a `VERSION` line), and the app refuses sums, or a package, of any
  other version: a signed old release cannot be served as a new one.
- With the repository variable `UPDATE_PUBKEY`, the macOS and Windows
  builds embed that public key (`-Dupdate-pubkey`), and the app then refuses
  an update whose `SHA256SUMS` is not signed by it. A release whose apps
  enforce signatures cannot be published without the signing key: the
  signing job fails and nothing is published.
- The private key never enters the build jobs; it reaches only the one step
  that signs, in a job that needs the environment's reviewers' approval,
  runs only for `main`, and never runs in a rehearsal. Keep an offline
  copy: losing it means users must update manually once to a build with a
  new key.

Without both, updates rely on GitHub and HTTPS, exactly like a manual
download from the releases page. **Neither is configured yet**: no key
pair has been made, and the `release-signing` environment has to be
created by the repository's owner. `docs/signing.md` describes the setup.

## Code signing status

Code signing is conditional on repository secrets (`docs/signing.md`).
Until they exist, macOS builds are **ad-hoc signed and not notarized**, and
Windows builds are **not Authenticode-signed**; macOS Gatekeeper and
Windows SmartScreen warn on first launch. Every release says which
applies, in its notes and in the README inside each download, generated
from what the build actually did — a release never claims a signature it
does not have.

## Build pipeline

- Releases are cut only from `main`, the tag is created at the commit that
  was built, and it must match `package.json`'s version.
- Every GitHub Action is pinned by commit SHA; Dependabot proposes updates.
- Workflow tokens are read-only except in the job that publishes a release
  and the jobs that commit generated results back to their own branch.
  Release files are uploaded once, into a draft, by that one job; no
  workflow can replace a file of a published release.
- Signing secrets are passed only to the steps that sign or notarize.
- Third-party binaries are pinned: KataGo for Windows and Linux by
  SHA-256, KataGo for macOS built from a pinned commit, the committed
  network by SHA-256 (`engine/model/README.md`), npm packages by
  `package-lock.json` installed with `npm ci --ignore-scripts` — including
  the Native SDK the shell is built with and its `native` binary; the
  toolchain its install script downloads is checked against hashes inside
  that package (`scripts/native-sdk.mjs`, `docs/signing.md`).
- Pull requests that touch the shell compile and unit-test it on macOS and
  Windows as well as Linux.

`docs/QA.md` lists every gate and what is not verified.

## Out of scope

- An attacker who already runs code as you on your computer.
- Bugs in the operating system, the system WebView, or KataGo itself
  (report those upstream; tell us too if Goban Studio makes them reachable).
- Denial of service by a huge or deeply nested SGF file you open yourself,
  unless it corrupts saved data.
