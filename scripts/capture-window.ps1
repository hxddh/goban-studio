# Capture the main window of a process (or the primary screen when it has
# none) to a PNG with System.Drawing. Used by scripts/tour-app.mjs on Windows.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-window.ps1 -ProcessId 1234 -Out shot.png
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class GobanWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[GobanWin]::SetProcessDPIAware() | Out-Null

$x = 0; $y = 0; $w = 0; $h = 0; $how = "full screen"
$p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
if ($p) { $p.Refresh() }
if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
  $hwnd = $p.MainWindowHandle
  [GobanWin]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
  [GobanWin]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 400
  $r = New-Object GobanWin+RECT
  if ([GobanWin]::GetWindowRect($hwnd, [ref]$r)) {
    $x = $r.Left; $y = $r.Top; $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
    $how = "window $hwnd"
  }
}
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
# Clip to the screen; fall back to the whole screen for an unusable rect.
if ($w -gt 0 -and $h -gt 0) {
  $x2 = [Math]::Min($x + $w, $screen.Right); $y2 = [Math]::Min($y + $h, $screen.Bottom)
  $x = [Math]::Max($x, $screen.Left); $y = [Math]::Max($y, $screen.Top)
  $w = $x2 - $x; $h = $y2 - $y
}
if ($w -lt 64 -or $h -lt 64) {
  $x = $screen.Left; $y = $screen.Top; $w = $screen.Width; $h = $screen.Height; $how = "full screen"
}
$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
Write-Output "$how ${w}x${h}"
