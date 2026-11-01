Goban Studio for Windows
=======================

Run bin\goban-studio.exe. The app needs the Microsoft Edge WebView2
runtime, which is preinstalled on Windows 10 and 11. The bundled KataGo
engine starts only when a 19x19 game begins.

This build is not Authenticode-signed. Windows SmartScreen may show
"Windows protected your PC"; choose "More info" and then "Run anyway".
The SHA256SUMS file in the GitHub release lets you verify the download.

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
