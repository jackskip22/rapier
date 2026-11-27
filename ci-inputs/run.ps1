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
  # Copies outside the workspace, so the user's rights are only what is granted here.
  $in = 'C:\aq15\in-user'; New-Item -ItemType Directory -Force -Path $in | Out-Null
  Copy-Item -LiteralPath $Exe, $runner -Destination $in -Force
  $Exe = Join-Path $in (Split-Path $Exe -Leaf); $runner = Join-Path $in 'windows-self-test.ps1'
  icacls $in /grant "${name}:(OI)(CI)RX" | Out-Null
  icacls $Out /grant "${name}:(OI)(CI)F" | Out-Null
  $cred = New-Object System.Management.Automation.PSCredential($name, (ConvertTo-SecureString $pw -AsPlainText -Force))
  # Windows PowerShell 5.1 inherits pwsh 7's PSModulePath and then cannot find its own Get-FileHash: give it its own.
  $env:PSModulePath = "$env:ProgramFiles\WindowsPowerShell\Modules;$env:SystemRoot\system32\WindowsPowerShell\v1.0\Modules"
  try {
    $p = Start-Process -FilePath 'powershell.exe' -Credential $cred -LoadUserProfile -Wait -PassThru -WindowStyle Hidden `
      -WorkingDirectory $in -RedirectStandardOutput (Join-Path $Out 'user-stdout.txt') -RedirectStandardError (Join-Path $Out 'user-stderr.txt') `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner, '-Exe', $Exe, '-Out', $Out)
    $how = "standard user $name (unelevated), powershell exit $($p.ExitCode)"
  } catch { $how = "standard user route failed to start: $($_.Exception.Message)" }
  foreach ($f in 'user-stdout.txt', 'user-stderr.txt') {
    $t = Join-Path $Out $f
    if ((Test-Path $t) -and (Get-Item $t).Length -gt 0) { echo "::notice title=$Label $f::$(((Get-Content $t -Raw) -replace "`r", '' -replace "`n", ' | ').Substring(0, [Math]::Min(3000, (Get-Content $t -Raw).Length)))" }
  }
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
