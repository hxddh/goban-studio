Goban Studio for Windows
=======================

Unzip the download anywhere you can write to (for example your user
folder) and run bin\goban-studio.exe. There is no installer. The app
needs the Microsoft Edge WebView2 runtime, which is preinstalled on
Windows 10 and 11. The bundled KataGo engine starts the first time it is
needed.

This build is not Authenticode-signed. Windows SmartScreen may show
"Windows protected your PC"; choose "More info" and then "Run anyway".
The SHA256SUMS file in the GitHub release lets you verify the download.

The app works offline and needs no account. It makes no network request
unless you choose Check for updates, or turn on the weekly update check in
Settings (off by default), or download an optional KataGo network; the
first two ask GitHub for the latest version and send nothing about you or
your games. These requests use your Windows proxy setting (Settings >
Network & Internet > Proxy, manual setup) or the HTTPS_PROXY environment
variable, if you have one.

Only one copy runs at a time: opening the app again, or double-clicking an
.sgf file while it is open, brings up the window that is already there.

Your data
---------
Your games, progress and settings are files in

  %LOCALAPPDATA%\dev.hxddh.gobanstudio\Data\data

(usually C:\Users\<you>\AppData\Local\dev.hxddh.gobanstudio\Data\data).
The optional KataGo networks you download are beside them, in
...\dev.hxddh.gobanstudio\Data\models. Paste the first line into the
Explorer address bar to open the folder.

None of this is inside the app folder, so updating keeps it, whether the
app updates itself or you replace the app folder with a newer one by hand.
There is nothing to copy. To move your data to another computer, use
Export backup and Restore from backup in Settings.

The folder bin\goban-studio.exe.WebView2 that appears inside the app
folder belongs to the WebView2 browser component (its cache). It does not
hold your games or settings.

Updating
--------
When a newer version is found you can choose Download and install. The app
downloads the new package and the release's checksums from GitHub, checks
them, and on Restart to update replaces this folder and restarts; the
previous version is kept until the new one has started, and put back if it
does not start. A download that is interrupted continues where it stopped.
Keep the folder somewhere you can write to (for example under your user
folder, not C:\Program Files); otherwise the app offers the download page.

Uninstalling
------------
Delete the app folder. Your data and any downloaded networks stay where
they are (see "Your data"); to remove them as well, delete

  %LOCALAPPDATA%\dev.hxddh.gobanstudio

If you registered .sgf files (below), also remove the two registry keys
named there.

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
