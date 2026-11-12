# SPDX-License-Identifier: AGPL-3.0-only
# Puts together the folder first-start.ps1 expects: Rapier.exe downloaded from where it is published (refused unless its
# SHA-256 is the one run.json names), and from ci-inputs/ (each checked against SHA256SUMS) BUILT.json, the owner-ACL
# checks and the Store MSIX; first-start.ps1 comes from this folder unchanged. BUILT.json must name both the exe and the
# MSIX.   pwsh -File fetch.ps1 -Out <folder>
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
$run = Get-Content (Join-Path $PSScriptRoot 'run.json') -Raw | ConvertFrom-Json
$inputs = Join-Path (Split-Path -Parent $PSScriptRoot) 'ci-inputs'
function Sha($file) { (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() }
$app = Join-Path $Out 'app'
New-Item -ItemType Directory -Force (Join-Path $app 'acl-checks') | Out-Null

$exe = Join-Path $app 'Rapier.exe'
if ($run.exe.url -notmatch '^https://') { throw 'run.json has no https URL for Rapier.exe' }
Invoke-WebRequest -Uri $run.exe.url -OutFile $exe -MaximumRetryCount 4 -RetryIntervalSec 10
if ((Sha $exe) -ne $run.exe.sha256) { throw "Rapier.exe is $(Sha $exe), not the $($run.exe.sha256) run.json names" }

foreach ($line in Get-Content (Join-Path $inputs 'SHA256SUMS')) {
  if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { continue }
  $sum = $Matches[1]; $name = $Matches[2]; $file = Join-Path $inputs $name
  if ((Sha $file) -ne $sum) { throw "ci-inputs/$name is $(Sha $file), not $sum" }
  Copy-Item $file (Join-Path $app $name) -Force
}
Copy-Item (Join-Path $PSScriptRoot 'first-start.ps1') $app -Force
$built = Get-Content (Join-Path $app 'BUILT.json') -Raw | ConvertFrom-Json
if ($built.sha256 -ne $run.exe.sha256) { throw 'BUILT.json names another Rapier.exe' }
$msix = Get-ChildItem $app -Filter '*.msix' | Select-Object -First 1
if (-not $msix -or (Sha $msix.FullName) -ne $built.msixSha256) { throw 'BUILT.json names another MSIX' }
foreach ($f in 'acl-checks\windows-sync-native.exe', 'acl-checks\attachment-open-test.exe') { if (-not (Test-Path (Join-Path $app $f))) { throw "no $f in ci-inputs" } }
Get-ChildItem $app -Recurse -File | ForEach-Object { "$(Sha $_.FullName)  $($_.FullName.Substring($app.Length + 1))" }
"app=$app" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
