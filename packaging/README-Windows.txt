Goban Studio for Windows
=======================

Run bin\goban-studio.exe. The app needs the Microsoft Edge WebView2
runtime, which is preinstalled on Windows 10 and 11. The bundled KataGo
engine starts only when a 19x19 game begins.

This build is not Authenticode-signed. Windows SmartScreen may show
"Windows protected your PC"; choose "More info" and then "Run anyway".
The SHA256SUMS file in the GitHub release lets you verify the download.

The app works offline and needs no account. It makes no network request
unless you choose Check for updates, or turn on the weekly update check in
Settings (off by default); either asks GitHub for the latest version and
sends nothing about you or your games.

Updating
--------
When a newer version is found you can choose Download and install. The app
downloads the new package and the release's checksums from GitHub, checks
them, and on Restart to update replaces this folder and restarts; the
previous version is kept until the new one has started, and put back if it
does not start. Keep the folder somewhere you can write to (for example
under your user folder, not C:\Program Files); otherwise the app offers
the download page.

Your games, progress and settings are stored in
bin\goban-studio.exe.WebView2 inside this folder. The in-app update keeps
them. If you update by hand, copy that folder into the new bin\ folder.

Windows on ARM: this x64 build runs under Windows 11's x64 emulation,
KataGo included. There is no native ARM64 build (KataGo publishes no ARM64
Windows binary).

SGF files
---------
To open .sgf files by double-click, run this once from the app folder:

  powershell -ExecutionPolicy Bypass -File install\register-file-types.ps1

It registers the file type for the current user only (no administrator
prompt). To remove it, delete these current-user registry keys:

  HKCU\Software\Classes\.sgf
  HKCU\Software\Classes\dev.hxddh.gobanstudio.GogamerecordSGF

Licences
--------
See resources\frontend\dist\licenses\. Goban Studio is MIT licensed;
KataGo, Moka and @sabaki/go-board are also MIT; Inter is under the SIL Open
Font License 1.1.
