# SPDX-License-Identifier: AGPL-3.0-only
# The first start of an open-built Rapier.exe on a real Windows machine: the proof Wine cannot give, since Wine runs no WebView2.
# Put this file beside Rapier.exe and its BUILT.json (from build.sh or record.sh), then run, in that folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File first-start.ps1
# It checks the exe is the one BUILT.json names, runs its self-test, starts it, waits for Rapier's page to load in its window
# (read over the DevTools port the app opens when RAPIER_TEST_DEVTOOLS_PORT is set), photographs the screen and closes it.
# Then two files open two windows, and the first file again opens no third (one window per file).
# It writes started-<version>-<sha>.json and .png beside the exe; both are committed to windows/open-build/started/,
# where record.sh looks for them. Nothing is installed and nothing leaves the machine.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $here 'Rapier.exe'
$built = Get-Content (Join-Path $here 'BUILT.json') -Raw | ConvertFrom-Json
$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -ne $built.sha256) { throw "Rapier.exe is not the build BUILT.json names ($sha)." }

# The self-test: lifecycle, file contracts, native contracts, resources and the WebView2 runtime (exit 3: none installed).
$self = Start-Process -FilePath $exe -ArgumentList '--self-test' -Wait -PassThru
$selfTest = $self.ExitCode

# The installed WebView2 runtime, as Edge's updater records it.
$webview2 = $null
foreach ($key in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') {
  $value = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
  if ($value -and $value -ne '0.0.0.0') { $webview2 = $value; break }
}

# The real start: the window, WebView2 through the open loader, and Rapier's page in it.
$port = 9333
$env:RAPIER_TEST_DEVTOOLS_PORT = "$port"
$app = Start-Process -FilePath $exe -ArgumentList '--new' -PassThru
$page = $null
$deadline = (Get-Date).AddSeconds(90)
while (-not $page -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  try {
    $page = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3 |
      Where-Object { $_.type -eq 'page' -and $_.url -like 'https://rapier.local/rapier.html*' -and $_.title } | Select-Object -First 1
  } catch {}
}
if ($page) { Start-Sleep -Seconds 3 }

$name = "started-$($built.version)-$($sha.Substring(0, 12))"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save((Join-Path $here "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
if (-not $app.HasExited) { [void]$app.CloseMainWindow(); [void]$app.WaitForExit(5000) }
if (-not $app.HasExited) { Stop-Process -InputObject $app }

# One window per file: two files open two windows; the first file again brings its window forward and opens none.
function Pages { try { @(Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3 |
  Where-Object { $_.type -eq 'page' -and $_.url -like 'https://rapier.local/rapier.html*' }) } catch { @() } }
function WaitPages($count) {
  $until = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $until) { $p = Pages; if ($p.Count -ge $count) { return $p }; Start-Sleep -Seconds 1 }
  return Pages
}
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$fileA = Join-Path $env:TEMP "rapier-first-start-a-$tag.md"; Set-Content $fileA "# A`n" -Encoding UTF8
$fileB = Join-Path $env:TEMP "rapier-first-start-b-$tag.md"; Set-Content $fileB "# B`n" -Encoding UTF8
$fileAProcess = Start-Process -FilePath $exe -ArgumentList "`"$fileA`"" -PassThru
$one = WaitPages 1
$fileBProcess = Start-Process -FilePath $exe -ArgumentList "`"$fileB`"" -PassThru
$two = WaitPages 2
$repeatProcess = Start-Process -FilePath $exe -ArgumentList "`"$fileA`"" -PassThru
Start-Sleep -Seconds 8
$again = Pages
$windowCells = [ordered]@{ firstFile = ($one.Count -eq 1); secondFileOwnWindow = ($two.Count -eq 2); sameFileNoNewWindow = ($again.Count -eq 2) }
# Close only process objects this script started; an unrelated Rapier session is never enumerated or stopped.
$ownedProcesses = @($fileAProcess, $fileBProcess, $repeatProcess)
foreach ($process in $ownedProcesses) { if (-not $process.HasExited) { [void]$process.CloseMainWindow() } }
Start-Sleep -Seconds 5
foreach ($process in $ownedProcesses) { if (-not $process.HasExited) { Stop-Process -InputObject $process } }
Remove-Item $fileA, $fileB -ErrorAction SilentlyContinue

# The owner-ACL checks Wine cannot run (build.sh compiled them into acl-checks\ beside this script).
$aclDir = Join-Path $here 'acl-checks'
$syncOut = & (Join-Path $aclDir 'windows-sync-native.exe') 2>&1 | Out-String
$attachOut = & (Join-Path $aclDir 'attachment-open-test.exe') 2>&1 | Out-String
$aclChecks = [ordered]@{
  syncNative = [bool]($syncOut -match '(?m)^PASS windows-sync-native [0-9]+ broker cells')
  attachmentOpen = [bool]($attachOut -match '(?m)^# fail 0\s*$' -and $attachOut -notmatch '(?m)^not ok')
}

$os = Get-CimInstance Win32_OperatingSystem
$pageInfo = $null
if ($page) { $pageInfo = [ordered]@{ url = $page.url; title = $page.title } }
$receipt = [ordered]@{
  schema = 'rapier-windows-start/1'
  version = $built.version
  sha256 = $sha
  source = $built.source
  build = $built.build
  loaderSha256 = $built.loaderSha256
  windows = "$($os.Caption) $($os.Version) $($os.OSArchitecture)"
  webview2 = $webview2
  selfTest = $selfTest
  pageLoaded = [bool]$page
  page = $pageInfo
  windowCells = $windowCells
  ownerAclChecks = $aclChecks
  at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}
($receipt | ConvertTo-Json -Depth 4) + "`n" | Set-Content (Join-Path $here "$name.json") -Encoding UTF8
$windowsPassed = $windowCells.firstFile -and $windowCells.secondFileOwnWindow -and $windowCells.sameFileNoNewWindow -and $aclChecks.syncNative -and $aclChecks.attachmentOpen
if ($selfTest -ne 0 -or -not $page -or -not $windowsPassed) {
  Write-Output "Rapier did not pass its first start (self-test $selfTest, page loaded: $([bool]$page), windows: $windowsPassed). Send $name.json and $name.png."
  exit 1
}
Write-Output "Rapier started and loaded its page. Send $name.json and $name.png."
