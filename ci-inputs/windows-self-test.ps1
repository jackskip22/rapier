# AQ15: run the built Rapier host's own contracts on Windows and keep its exact failure.
# Run this once with Developer Mode on, and once with it off in an elevated shell.
#   powershell -NoProfile -File windows-self-test.ps1 -Exe C:\path\rapier-host.exe -Out C:\aq15-on
# The script never changes Developer Mode or elevates itself. No UI or Store install is needed.
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$Out,
  [ValidateRange(10, 300)][int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$exePath = (Resolve-Path -LiteralPath $Exe).Path
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$outPath = (Resolve-Path -LiteralPath $Out).Path
$logPath = Join-Path $env:TEMP 'rapier-self-test.log'
if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$developerMode = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense
$receipt = [ordered]@{
  startedUtc = [DateTime]::UtcNow.ToString('o')
  sha256 = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
  windows = [Environment]::OSVersion.Version.ToString()
  developerMode = $developerMode
  elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  command = '--self-test'
  result = 'NOT PROVEN'
  exitCode = $null
  timedOut = $false
  detail = ''
  nativeLog = ''
}
$process = $null
try {
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $exePath
  $start.Arguments = '--self-test'
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  if (-not $process.Start()) { throw 'Rapier --self-test did not start.' }
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $receipt.timedOut = $true
    $process.Kill()
    $process.WaitForExit()
    throw "Rapier --self-test exceeded $TimeoutSeconds seconds."
  }
  $receipt.exitCode = $process.ExitCode
  if ($process.ExitCode -ne 0) { throw "Rapier --self-test returned $($process.ExitCode)." }
  if ((Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.sha256) {
    throw 'The executable changed during the run.'
  }
  $receipt.result = 'PASS'
} catch {
  $receipt.result = 'FAIL'
  $receipt.detail = $_.Exception.Message
} finally {
  if (Test-Path -LiteralPath $logPath) {
    $receipt.nativeLog = Get-Content -LiteralPath $logPath -Raw
    Copy-Item -LiteralPath $logPath -Destination (Join-Path $outPath 'rapier-self-test.log') -Force
  }
  $receipt.finishedUtc = [DateTime]::UtcNow.ToString('o')
  $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outPath 'self-test.json') -Encoding UTF8
  if ($process) { $process.Dispose() }
  $identity.Dispose()
}
if ($receipt.result -ne 'PASS') {
  throw "$($receipt.detail) $($receipt.nativeLog) See $outPath\self-test.json."
}
$receipt | ConvertTo-Json -Depth 4
