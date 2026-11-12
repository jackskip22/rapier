# SPDX-License-Identifier: AGPL-3.0-only
# The five Store listing screenshots from the real Rapier window, after first-start.ps1 has run, and first the write
# journey (open a file, write, Undo; its rows go in listing.json).
#   pwsh -File listing.ps1 -App <folder with Rapier.exe> -Out <folder>
# For each scene it sets the Windows app theme (light or dark), starts Rapier.exe maximized, lets scenes.mjs set the scene,
# then photographs the window (window-*.png, the real frame at the screen's size). scenes.mjs also writes the page alone at
# the Store's 1366 x 768, twice the pixels (page-*.png). listing.json records the screen, each window's size and the theme.
param([Parameter(Mandatory)][string]$App, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $App 'Rapier.exe'
New-Item -ItemType Directory -Force $Out | Out-Null

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettings(string d, int mode, ref DEVMODE m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int ChangeDisplaySettings(ref DEVMODE m, int flags);
  // Asks for a screen at least the Store's 1366 x 768: the largest listed mode up to 1920 x 1080. 0 means changed.
  public static int Widen() {
    DEVMODE best = new DEVMODE(); best.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); bool found = false;
    DEVMODE m = new DEVMODE(); m.dmSize = best.dmSize;
    for (int i = 0; EnumDisplaySettings(null, i, ref m); i++)
      if (m.dmPelsWidth <= 1920 && m.dmPelsHeight <= 1080 && m.dmPelsWidth * m.dmPelsHeight > best.dmPelsWidth * best.dmPelsHeight) { best = m; found = true; }
    if (!found) return -100;
    best.dmFields = 0x80000 | 0x100000; return ChangeDisplaySettings(ref best, 0);
  }
}
'@

$screenBefore = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$widen = [Win]::Widen()
Start-Sleep -Seconds 2
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

function Theme($light) {
  $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  foreach ($name in 'AppsUseLightTheme', 'SystemUsesLightTheme') { Set-ItemProperty -Path $key -Name $name -Value ([int]$light) -Type DWord }
}

$garden = Join-Path $env:TEMP 'garden.md'
Copy-Item (Join-Path $here 'garden.md') $garden -Force
$scenes = @(
  @{ n = '00'; scene = 'journey'; light = $true; args = @("`"$garden`"") },
  @{ n = '01'; scene = 'write'; light = $true; args = @("`"$garden`"") },
  @{ n = '02'; scene = 'draw'; light = $false; args = @('--new') },
  @{ n = '03'; scene = 'notes'; light = $true; args = @('--new') },
  @{ n = '04'; scene = 'pages'; light = $true; args = @('--new') },
  @{ n = '05'; scene = 'source'; light = $false; args = @("`"$garden`"") }
)
$port = 9333
$env:RAPIER_TEST_DEVTOOLS_PORT = "$port"
$results = @()
foreach ($s in $scenes) {
  $name = "$($s.n)-$($s.scene)-$(if ($s.light) { 'light' } else { 'dark' })"
  Theme $s.light
  $proc = Start-Process -FilePath $exe -ArgumentList $s.args -PassThru
  $handle = [IntPtr]::Zero; $until = (Get-Date).AddSeconds(60)
  while ($handle -eq [IntPtr]::Zero -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500; $proc.Refresh(); $handle = $proc.MainWindowHandle }
  $row = [ordered]@{ name = $name; scene = $s.scene; theme = $(if ($s.light) { 'light' } else { 'dark' }) }
  try {
    if ($handle -eq [IntPtr]::Zero) { throw 'no window' }
    [void][Win]::ShowWindow($handle, 3)   # maximized
    [void][Win]::SetForegroundWindow($handle)
    $extra = if ($s.scene -eq 'journey') { $garden } else { Join-Path $here 'notes' }
    $said = & node (Join-Path $here 'scenes.mjs') $port $s.scene (Join-Path $Out "page-$name.png") $extra
    if ($LASTEXITCODE -ne 0) { throw "scenes.mjs exit $LASTEXITCODE" }
    $rows = $said | Where-Object { $_ -like '{*' } | Select-Object -First 1
    if ($rows) { $row.journey = ($rows | ConvertFrom-Json).journey }
    [void][Win]::SetForegroundWindow($handle); Start-Sleep -Seconds 1
    $r = New-Object Win+RECT
    if ([Win]::DwmGetWindowAttribute($handle, 9, [ref]$r, 16) -ne 0) { [void][Win]::GetWindowRect($handle, [ref]$r) }
    # A maximized window's frame reaches past the screen's edge: photograph only the part on the screen.
    $left = [Math]::Max($r.Left, $screen.Left); $top = [Math]::Max($r.Top, $screen.Top)
    $width = [Math]::Min($r.Right, $screen.Right) - $left; $height = [Math]::Min($r.Bottom, $screen.Bottom) - $top
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($left, $top, 0, 0, (New-Object System.Drawing.Size $width, $height))
    $bitmap.Save((Join-Path $Out "window-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose()
    $row.window = "$width x $height"; $row.storeSize = ($width -ge 1366 -and $height -ge 768); $row.ok = $true
  } catch { $row.ok = $false; $row.error = "$_" }
  if (-not $proc.HasExited) { [void]$proc.CloseMainWindow(); [void]$proc.WaitForExit(8000) }
  if (-not $proc.HasExited) { Stop-Process -InputObject $proc }
  Start-Sleep -Seconds 2
  $results += [pscustomobject]$row
}
Theme $true
[ordered]@{
  schema = 'rapier-windows-listing/1'
  screenBefore = "$($screenBefore.Width) x $($screenBefore.Height)"
  screenChange = $widen
  screen = "$($screen.Width) x $($screen.Height)"
  scenes = $results
} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Out 'listing.json') -Encoding UTF8
$results | Format-Table name, ok, window, storeSize | Out-String | Write-Output
