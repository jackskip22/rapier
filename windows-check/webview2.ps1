# SPDX-License-Identifier: AGPL-3.0-only
# Makes sure the WebView2 Runtime is installed and says which version, and whether the image had it or this job installed it.
# The installer is Microsoft's Evergreen Standalone x64 (its own link); it is run only when no runtime is found, and only
# when its Authenticode signature is valid and Microsoft's.   pwsh -File webview2.ps1 -Out <folder>
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
function Version {
  foreach ($key in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                   'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                   'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') {
    $value = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
    if ($value -and $value -ne '0.0.0.0') { return $value }
  }
  return $null
}
$before = Version
$record = [ordered]@{ image = (Get-CimInstance Win32_OperatingSystem).Caption; imageVersion = $env:ImageVersion; onImage = [bool]$before; before = $before }
if (-not $before) {
  $installer = Join-Path $env:RUNNER_TEMP 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
  Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/?linkid=2124701' -OutFile $installer -MaximumRetryCount 4 -RetryIntervalSec 10
  $signature = Get-AuthenticodeSignature $installer
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw "the WebView2 installer's signature is $($signature.Status): $($signature.SignerCertificate.Subject)" }
  $record.installerSha256 = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  $record.installerVersion = (Get-Item $installer).VersionInfo.FileVersion
  $p = Start-Process -FilePath $installer -ArgumentList '/silent', '/install' -Wait -PassThru
  $record.installerExit = $p.ExitCode
}
$record.version = Version
$record | ConvertTo-Json | Set-Content (Join-Path $Out 'webview2.json') -Encoding UTF8
$record | ConvertTo-Json | Write-Output
if (-not $record.version) { throw 'no WebView2 Runtime after the install' }
