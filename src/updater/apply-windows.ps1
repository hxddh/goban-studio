# Goban Studio update helper (Windows), v5. Windows PowerShell 5.1 or later.
#
# The running app writes this file from its own embedded copy (it is never
# downloaded), starts it hidden and detached, and quits. This script then:
#
#   1. waits for the app process to exit, and for anything still running
#      from the install folder (KataGo) to end;
#   2. copies the verified, unpacked new package next to the install folder
#      (same volume, so the swap is two renames);
#   3. renames the install folder to a hidden backup and the copy into its
#      place, retrying while files are still locked (WebView2 and antivirus
#      release them a moment after the app exits);
#   4. moves the player's WebView2 profile (bin\goban-studio.exe.WebView2,
#      where the games, progress and settings live) into the new folder;
#   5. starts the new app with --goban-update-ack=<file> and waits for it to
#      write that file (it does once its page is up);
#   6. on success removes the backup; on any failure moves everything back
#      and starts the old app with --goban-update-failed.
#
# Exit codes: 0 updated; 1 rolled back (old version restored); 2 nothing was
# changed; 3 the rollback itself failed (the old version is left at the
# backup path, logged).

param(
  [Parameter(Mandatory = $true)][int]$AppPid,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$StagedDir,
  [Parameter(Mandatory = $true)][string]$AckFile,
  [Parameter(Mandatory = $true)][string]$LogFile,
  [int]$AckTimeout = 90,
  [int]$ExitTimeout = 300,
  [int]$LockRetries = 60,
  [string]$CleanupDir = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$exeRel = "bin\goban-studio.exe"
# Never keep a handle on the folder being renamed.
try {
  $here = [System.IO.Path]::GetTempPath()
  Set-Location -LiteralPath $here
  [System.Environment]::CurrentDirectory = $here
} catch { }

function Log([string]$Message) {
  $line = "{0} [{1}] {2}" -f (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"), $PID, $Message
  try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { }
}

# Run $Action until it succeeds, up to $LockRetries times, one second apart.
function Retry([scriptblock]$Action, [string]$What) {
  for ($i = 1; $i -le $LockRetries; $i++) {
    try {
      & $Action
      if ($i -gt 1) { Log "$What succeeded on attempt $i" }
      return $true
    } catch {
      if ($i -eq 1 -or $i -eq $LockRetries) { Log "$What failed (attempt $i): $($_.Exception.Message)" }
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Full([string]$Path) { return [System.IO.Path]::GetFullPath($Path).TrimEnd('\') }

function Stop-InstallProcesses([string]$Dir) {
  $prefix = $Dir + "\"
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and $_.Path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }
  } | ForEach-Object {
    Log "stopping $($_.Id) ($($_.Path))"
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { }
  }
}

function Wait-InstallProcesses([string]$Dir, [int]$Seconds) {
  $prefix = $Dir + "\"
  for ($i = 0; $i -lt $Seconds * 2; $i++) {
    $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try { $_.Path -and $_.Path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }
    })
    if ($left.Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  Stop-InstallProcesses $Dir
}

function Start-App([string]$Dir, [string]$Argument) {
  $exe = Join-Path $Dir $exeRel
  Start-Process -FilePath $exe -ArgumentList $Argument -WorkingDirectory (Split-Path $exe) | Out-Null
}

function Relaunch-Old {
  try { Start-App $InstallDir "--goban-update-failed" } catch { Log "could not start the previous version: $($_.Exception.Message)" }
}

# The player's WebView2 profile folders under bin\ (games, progress, settings).
function Move-Profiles([string]$From, [string]$To) {
  $bin = Join-Path $From "bin"
  if (-not (Test-Path -LiteralPath $bin)) { return $true }
  foreach ($profile in @(Get-ChildItem -LiteralPath $bin -Directory -Force -Filter "*.WebView2" -ErrorAction SilentlyContinue)) {
    $dest = Join-Path (Join-Path $To "bin") $profile.Name
    if (Test-Path -LiteralPath $dest) {
      # A fresh package carries no profile; anything here was created by a
      # failed start of the new app and is not the player's data.
      if (-not (Retry { Remove-Item -LiteralPath $dest -Recurse -Force } "remove $dest")) { return $false }
    }
    $src = $profile.FullName
    if (-not (Retry { Move-Item -LiteralPath $src -Destination $dest } "move profile $($profile.Name)")) { return $false }
    Log "moved profile $($profile.Name)"
  }
  return $true
}

try {
  $InstallDir = Full $InstallDir
  $StagedDir = Full $StagedDir
} catch {
  Log "bad path: $($_.Exception.Message)"
  exit 2
}
if (-not ([System.IO.Path]::GetFileName($AckFile) -like "goban-update-ack-*.txt")) { Log "bad ack path '$AckFile'"; exit 2 }
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir $exeRel))) { Log "installed app not found at $InstallDir"; exit 2 }
if (-not (Test-Path -LiteralPath (Join-Path $StagedDir $exeRel))) { Log "staged app not found at $StagedDir"; exit 2 }

$parent = Split-Path -Parent $InstallDir
$name = Split-Path -Leaf $InstallDir
$new = Join-Path $parent ".$name.goban-new-$PID"
$old = Join-Path $parent ".$name.goban-old-$PID"
$failed = Join-Path $parent ".$name.goban-failed-$PID"
Log "update: target=$InstallDir staged=$StagedDir pid=$AppPid"

# 1. Wait for the app to quit.
$proc = Get-Process -Id $AppPid -ErrorAction SilentlyContinue
if ($proc) {
  if (-not $proc.WaitForExit($ExitTimeout * 1000)) {
    Log "the app (pid $AppPid) did not exit within ${ExitTimeout}s; nothing changed"
    exit 2
  }
}
Log "app exited"
Wait-InstallProcesses $InstallDir 20

# 2. Copy next to the install folder.
try {
  if (Test-Path -LiteralPath $new) { Remove-Item -LiteralPath $new -Recurse -Force }
  Copy-Item -LiteralPath $StagedDir -Destination $new -Recurse -Force
} catch {
  Log "copy failed: $($_.Exception.Message); nothing changed"
  try { Remove-Item -LiteralPath $new -Recurse -Force -ErrorAction SilentlyContinue } catch { }
  Relaunch-Old
  exit 2
}

# 3. Swap, retrying while files are locked.
if (-not (Retry { Move-Item -LiteralPath $InstallDir -Destination $old } "move the install folder aside")) {
  Log "the install folder stayed locked; nothing changed"
  try { Remove-Item -LiteralPath $new -Recurse -Force -ErrorAction SilentlyContinue } catch { }
  Relaunch-Old
  exit 2
}
if (-not (Retry { Move-Item -LiteralPath $new -Destination $InstallDir } "move the new folder into place")) {
  Log "could not move the new folder into place; restoring"
  if (Retry { Move-Item -LiteralPath $old -Destination $InstallDir } "restore the install folder") {
    try { Remove-Item -LiteralPath $new -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    Relaunch-Old
    exit 1
  }
  Log "ROLLBACK FAILED: the previous version is at $old"
  exit 3
}
Log "swapped; backup at $old"

function Rollback([string]$Why) {
  Log "rolling back: $Why"
  Stop-InstallProcesses $InstallDir
  Start-Sleep -Seconds 1
  # The player's profile goes back with the old version.
  $null = Move-Profiles $InstallDir $old
  if ((Retry { Move-Item -LiteralPath $InstallDir -Destination $failed } "move the new version aside") -and
      (Retry { Move-Item -LiteralPath $old -Destination $InstallDir } "restore the previous version")) {
    try { Remove-Item -LiteralPath $failed -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    try { Remove-Item -LiteralPath $AckFile -Force -ErrorAction SilentlyContinue } catch { }
    Log "previous version restored"
    Relaunch-Old
    exit 1
  }
  Log "ROLLBACK FAILED: the previous version is at $old"
  exit 3
}

# 4. Carry the player's data across.
if (-not (Move-Profiles $old $InstallDir)) { Rollback "could not move the WebView2 profile" }

# 5. Start the new app and wait for its acknowledgement.
try { Remove-Item -LiteralPath $AckFile -Force -ErrorAction SilentlyContinue } catch { }
try {
  Start-App $InstallDir ('"--goban-update-ack=' + $AckFile + '"')
} catch {
  Rollback "the new app could not be started: $($_.Exception.Message)"
}
$deadline = (Get-Date).AddSeconds($AckTimeout)
while (-not (Test-Path -LiteralPath $AckFile)) {
  if ((Get-Date) -gt $deadline) { Rollback "the new app did not start within ${AckTimeout}s" }
  Start-Sleep -Milliseconds 500
}

# 6. Done.
Log "the new app started"
if (-not (Retry { Remove-Item -LiteralPath $old -Recurse -Force } "remove the backup")) { Log "the backup is left at $old" }
try { Remove-Item -LiteralPath $AckFile -Force -ErrorAction SilentlyContinue } catch { }
if ($CleanupDir -and ([System.IO.Path]::GetFileName($CleanupDir.TrimEnd('\')) -eq "GobanStudio-update")) {
  try { Remove-Item -LiteralPath $CleanupDir -Recurse -Force -ErrorAction SilentlyContinue } catch { }
}
Log "update complete"
exit 0
