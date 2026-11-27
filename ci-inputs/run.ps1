# Runs AQ15's windows-self-test.ps1 (unchanged) once, then writes its receipt as annotations (ten a step at most).
param([string]$Exe, [string]$Out, [int]$DeveloperMode, [switch]$StandardUser, [string]$Label)
$key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name AllowDevelopmentWithoutDevLicense -Value $DeveloperMode -Type DWord
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$runner = Join-Path $PSScriptRoot 'windows-self-test.ps1'
$how = 'elevated administrator (the runner account)'
if ($StandardUser) {
  # An unelevated standard user, so the unprivileged symbolic-link route is the one exercised.
  $name = 'aq15user'; $pw = 'Aq15-' + [guid]::NewGuid().ToString('N').Substring(0, 16) + '!a'
  net user $name $pw /add /y | Out-Null
  icacls $Out /grant "${name}:(OI)(CI)F" | Out-Null
  icacls (Split-Path $Exe) /grant "${name}:(OI)(CI)RX" | Out-Null
  icacls $PSScriptRoot /grant "${name}:(OI)(CI)RX" | Out-Null
  $cred = New-Object System.Management.Automation.PSCredential($name, (ConvertTo-SecureString $pw -AsPlainText -Force))
  try {
    $p = Start-Process -FilePath 'powershell.exe' -Credential $cred -LoadUserProfile -Wait -PassThru -WindowStyle Hidden `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner, '-Exe', $Exe, '-Out', $Out)
    $how = "standard user $name (unelevated), powershell exit $($p.ExitCode)"
  } catch { $how = "standard user route failed to start: $($_.Exception.Message)" }
} else {
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -Exe $Exe -Out $Out *> (Join-Path $Out 'runner.txt') } catch {}
}
$file = Join-Path $Out 'self-test.json'
if (-not (Test-Path $file)) { echo "::error title=$Label::no self-test.json ($how)"; exit 0 }
$r = Get-Content $file -Raw | ConvertFrom-Json
echo "::notice title=$Label::$($r.result) exit $($r.exitCode), Developer Mode $($r.developerMode), elevated $($r.elevated), $how, Windows $($r.windows), sha256 $($r.sha256), timedOut $($r.timedOut). $($r.detail)"
$log = [string]$r.nativeLog
if (-not $log) { echo "::notice title=$Label native log::(no native log)"; exit 0 }
$log = $log -replace "`r", '' -replace "`n", ' | '
$size = 3000; $parts = [Math]::Min(8, [Math]::Ceiling($log.Length / $size))
for ($i = 0; $i -lt $parts; $i++) { echo "::notice title=$Label native log $($i + 1)/$parts::$($log.Substring($i * $size, [Math]::Min($size, $log.Length - $i * $size)))" }
