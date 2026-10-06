# Sends a click and/or keystrokes to the rig's VS Code window, so a run can be
# driven the same way every time. Called by `node scripts/rig.mjs send`.
#   -ClickX, -ClickY   client-area coordinates, physical pixels
#   -Keys  str   SendKeys syntax: ^ ctrl, + shift, % alt, {ENTER}, {ESC}
#   -Text  str   literal text, typed as is
param(
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [int]$ClickX = -1, [int]$ClickY = -1, [string]$Keys, [string]$Text, [switch]$Enter
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RigIn {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
'@
[RigIn]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null

$needle = $UserDataDir.Replace('\', '/').TrimEnd('/').ToLower()
$ids = Get-CimInstance Win32_Process -Filter "Name = 'Code.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Replace('\', '/').ToLower().Contains($needle) } |
  ForEach-Object { $_.ProcessId }
$win = Get-Process -Id $ids -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $win) { Write-Error "no VS Code window found for $UserDataDir"; exit 1 }
$h = $win.MainWindowHandle

# Windows refuses SetForegroundWindow from a background process unless a key was
# just pressed. A bare Shift tap satisfies it; Alt would open the menu bar.
[RigIn]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero); [RigIn]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)
[RigIn]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 200
if ([RigIn]::GetForegroundWindow() -ne $h) { Write-Error 'could not bring the rig window to the front'; exit 1 }

if ($ClickX -ge 0) {
  $p = New-Object RigIn+POINT; $p.X = $ClickX; $p.Y = $ClickY
  [RigIn]::ClientToScreen($h, [ref]$p) | Out-Null
  [RigIn]::SetCursorPos($p.X, $p.Y) | Out-Null
  [RigIn]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero); [RigIn]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
}
# Focus can move mid-send (the user clicks another window), and SendKeys then types
# into that window. Check before every key and stop the moment the rig is not in front.
function Send-Guarded([string]$k) {
  if ([RigIn]::GetForegroundWindow() -ne $h) { Write-Error 'rig window lost focus mid-send; stopped'; exit 1 }
  [System.Windows.Forms.SendKeys]::SendWait($k)
}
if ($Keys) { Send-Guarded $Keys; Start-Sleep -Milliseconds 300 }
if ($Text) {
  foreach ($c in $Text.ToCharArray()) { Send-Guarded ([regex]::Replace([string]$c, '[+^%~(){}\[\]]', '{$0}')) }
  Start-Sleep -Milliseconds 200
}
if ($Enter) { Send-Guarded '{ENTER}' }
