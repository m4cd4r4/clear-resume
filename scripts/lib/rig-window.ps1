# Finds the VS Code window started with a given --user-data-dir, sizes its client
# area to Width x Height physical pixels with the top-left at (X, Y), and prints
# the client area's screen rectangle as JSON. Called by scripts/rig.mjs.
#
# Physical pixels, not logical: the process opts into per-monitor DPI awareness,
# so on a 125% display a 1920x1080 client area is 1920x1080 on the screen and in
# the recording, with nothing resampled.
param(
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [int]$X = 0, [int]$Y = 0, [int]$Width = 1920, [int]$Height = 1080,
  [switch]$Measure, [switch]$Topmost, [switch]$Unpin
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RigWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
}
'@
# -4 = DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
[RigWin]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null

$needle = $UserDataDir.Replace('\', '/').TrimEnd('/').ToLower()
$ids = Get-CimInstance Win32_Process -Filter "Name = 'Code.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Replace('\', '/').ToLower().Contains($needle) } |
  ForEach-Object { $_.ProcessId }
$win = Get-Process -Id $ids -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $win) { Write-Error "no VS Code window found for $UserDataDir"; exit 1 }
$h = $win.MainWindowHandle

function Get-ClientRect($h) {
  $c = New-Object RigWin+RECT; [RigWin]::GetClientRect($h, [ref]$c) | Out-Null
  $p = New-Object RigWin+POINT; [RigWin]::ClientToScreen($h, [ref]$p) | Out-Null
  [pscustomobject]@{ x = $p.X; y = $p.Y; w = $c.R - $c.L; h = $c.B - $c.T }
}

if ($Unpin) {
  # -2 HWND_NOTOPMOST; 0x13 = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
  [RigWin]::SetWindowPos($h, [IntPtr]::new(-2), 0, 0, 0, 0, 0x13) | Out-Null
} elseif (-not $Measure) {
  if ([RigWin]::IsZoomed($h)) { [RigWin]::ShowWindow($h, 9) | Out-Null }  # SW_RESTORE
  # Two passes: the frame's size is only known once the window is restored, and
  # Electron can round the first resize.
  for ($i = 0; $i -lt 3; $i++) {
    $w = New-Object RigWin+RECT; [RigWin]::GetWindowRect($h, [ref]$w) | Out-Null
    $c = Get-ClientRect $h
    $left = $c.x - $w.L; $top = $c.y - $w.T
    $extraW = ($w.R - $w.L) - $c.w; $extraH = ($w.B - $w.T) - $c.h
    # 0x0004 SWP_NOZORDER | 0x0010 SWP_NOACTIVATE
    [RigWin]::SetWindowPos($h, [IntPtr]::Zero, $X - $left, $Y - $top, $Width + $extraW, $Height + $extraH, 0x14) | Out-Null
    Start-Sleep -Milliseconds 300
    $c = Get-ClientRect $h
    if ($c.x -eq $X -and $c.y -eq $Y -and $c.w -eq $Width -and $c.h -eq $Height) { break }
  }
  # On top only during a take, so no other window can cover the recorded area.
  # -1 HWND_TOPMOST; 0x0001 SWP_NOSIZE | 0x0002 SWP_NOMOVE | 0x0010 SWP_NOACTIVATE
  if ($Topmost) { [RigWin]::SetWindowPos($h, [IntPtr]::new(-1), 0, 0, 0, 0, 0x13) | Out-Null }
  [RigWin]::SetForegroundWindow($h) | Out-Null
}

$r = Get-ClientRect $h
[pscustomobject]@{ pid = $win.Id; x = $r.x; y = $r.y; w = $r.w; h = $r.h } | ConvertTo-Json -Compress
