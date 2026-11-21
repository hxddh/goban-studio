Goban Studio for Windows
=======================

There are two downloads with the same app inside:

  GobanStudio-Windows-x64.msi  the installer (recommended). It installs
      for your Windows user only, without an administrator prompt, into
      %LOCALAPPDATA%\Programs\Goban Studio, adds Goban Studio to the
      Start menu, opens .sgf files with it, and lists it in Settings >
      Apps (Apps & Features), where you can uninstall it.

  GobanStudio-Windows-x64.zip  the portable copy. Unzip it anywhere you
      can write to (for example your user folder) and run
      bin\goban-studio.exe. Nothing is registered with Windows.

The app needs the Microsoft Edge WebView2 runtime, which is preinstalled
on Windows 10 and 11. The bundled KataGo engine starts the first time it
is needed.

This build is not Authenticode-signed. Windows SmartScreen may show
"Windows protected your PC"; choose "More info" and then "Run anyway".
The SHA256SUMS file in the GitHub release lets you verify the download.

The app works offline and needs no account. It makes no network request
unless you choose Check for updates, or turn on the weekly update check in
Settings (off by default), or download an optional KataGo network; the
first two ask GitHub for the latest version and send nothing about you or
your games. The networks come from KataGo's GitHub releases (the human
model) and from katagotraining.org, KataGo's own network site (the
stronger network). These requests use your Windows proxy setting (Settings >
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
app updates itself, you run a newer installer, or you replace the app
folder with a newer one by hand. Uninstalling keeps it too. There is
nothing to copy. To move your data to another computer, use
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

This works the same way for the installed app: it replaces its folder in
%LOCALAPPDATA%\Programs\Goban Studio. Settings > Apps keeps showing the
version that was installed with the installer until you run a newer
installer, which you can do at any time: it replaces the installed copy,
whichever version it is now. Uninstalling removes it either way.

Uninstalling
------------
Installed with the installer: uninstall Goban Studio in Settings > Apps.
This removes the app folder, the Start menu entry and the .sgf
registration. The portable copy: delete the app folder.

Your data and any downloaded networks stay where they are (see "Your
data"); to remove them as well, delete

  %LOCALAPPDATA%\dev.hxddh.gobanstudio

If you registered .sgf files for the portable copy (below), also remove
the two registry keys named there.

Windows on ARM: this x64 build runs under Windows 11's x64 emulation,
KataGo included. There is no native ARM64 build (KataGo publishes no ARM64
Windows binary).

SGF files
---------
The installer registers .sgf files. If Windows asks which app to use, or
another app opens them, choose Goban Studio under "Open with" (Windows
keeps the choice you made there).

For the portable copy, to open .sgf files by double-click, run this once
from the app folder:

  powershell -ExecutionPolicy Bypass -File install\register-file-types.ps1

It registers the file type for the current user only (no administrator
prompt). To remove it, delete these current-user registry keys:

  HKCU\Software\Classes\.sgf
  HKCU\Software\Classes\dev.hxddh.gobanstudio.GogamerecordSGF

Licences
--------
See resources\frontend\dist\licenses\. Goban Studio is MIT licensed;
KataGo, Moka and @sabaki/go-board are also MIT; the built-in KataGo network
is CC0, and the optional networks downloaded in Settings are under the
KataGo Neural Network License (KataGo-networks.txt); Inter is under the SIL
Open Font License 1.1.
