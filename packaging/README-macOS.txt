Goban Studio for macOS
======================

1. Install it. It needs macOS 13 (Ventura) or later. There are two
   downloads: GobanStudio-macOS-arm64 for Apple Silicon Macs (M1 and
   later) and GobanStudio-macOS-x64 for Intel Macs.
   From the .dmg: drag "Goban Studio" onto the Applications folder beside
   it, then open it from Applications (not from the disk image: a copy
   that runs from the image cannot update itself). From the .zip: unzip
   it and move GobanStudio.app to Applications. It is the same app under
   either name.
2. This build is ad-hoc signed, not notarized, so the first time you open
   it macOS says it cannot verify the app. Close that message, then:

     macOS 15 or later: open System Settings > Privacy & Security, scroll
     down to Security, and click "Open Anyway" next to Goban Studio.

     macOS 14 or earlier: right-click (or Control-click) the app, choose
     Open, then confirm Open.

   You only need to do this once. If macOS still blocks it, run the line
   for your copy in Terminal:

     xattr -dr com.apple.quarantine "/Applications/Goban Studio.app"
     xattr -dr com.apple.quarantine "/Applications/GobanStudio.app"

3. The app works offline and needs no account. It makes no network
   request unless you choose Check for updates, or turn on the weekly
   update check in Settings (off by default), or download an optional
   KataGo network; the first two ask GitHub for the latest version and
   send nothing about you or your games. The networks come from KataGo's
   GitHub releases (the human model) and from katagotraining.org, KataGo's
   own network site (the stronger network). These requests use the proxy in
   System Settings > Network (Web proxy, HTTPS) or the HTTPS_PROXY
   environment variable, if you have one.

4. When a newer version is found you can choose Download and install. The
   app downloads the new version and the release's checksums from GitHub,
   checks them, and on Restart to update replaces itself and restarts; the
   previous version is kept until the new one has started, and put back if
   it does not start. A download that is interrupted continues where it
   stopped. This needs a copy of Goban Studio you can write to (for
   example in /Applications on an administrator account, or in
   ~/Applications); otherwise the app offers the download page.

Your data
---------
Your games, progress and settings are files in

  ~/Library/Application Support/dev.hxddh.gobanstudio/data

and the optional KataGo networks you download are beside them, in
~/Library/Application Support/dev.hxddh.gobanstudio/models. In Finder,
choose Go > Go to Folder and paste the first line to open it.

None of this is inside the app, so updating or replacing the app keeps it.
To move your data to another Mac, use Export backup and Restore from
backup in Settings.

Uninstalling
------------
Move the app to the Trash. Your data and any downloaded networks stay
where they are (see "Your data"); to remove them as well, delete

  ~/Library/Application Support/dev.hxddh.gobanstudio

macOS may also keep the app's web cache and logs in
~/Library/Caches/dev.hxddh.gobanstudio,
~/Library/WebKit/dev.hxddh.gobanstudio and
~/Library/Logs/dev.hxddh.gobanstudio; they hold none of your games.

SGF files
---------
After the first launch, .sgf documents open from Finder with Goban Studio.
The app handles a double-click whether it is already running or not.

Licences
--------
Open the app's Contents/Resources/frontend/dist/licenses/ folder
(right-click the app > Show Package Contents). Goban Studio is MIT
licensed; KataGo, Moka and @sabaki/go-board are also MIT; the built-in
KataGo network is CC0, and the optional networks downloaded in Settings are
under the KataGo Neural Network License (KataGo-networks.txt); Inter is
under the SIL Open Font License 1.1.

The SHA256SUMS file in the GitHub release lets you verify the download.
