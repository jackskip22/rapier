# SPDX-License-Identifier: AGPL-3.0-only
# Installs the Store MSIX from the app folder and starts it as a packaged app, the way the Store will.
#   powershell -File install.ps1 -App <folder with BUILT.json and the .msix> -Out <folder>
# The MSIX is checked against BUILT.json, then a copy is signed with a certificate made in this job for the manifest's
# own publisher (the Store signs with Microsoft's; nothing is kept), the certificate is trusted on this machine only, and
# the copy is installed. Rapier then starts from Start's app list; packaged.json records the install, the package
# identity of the running process and whether the page loaded. Everything is removed at the end.
param([Parameter(Mandatory)][string]$App, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem, System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class Pkg {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern int GetPackageFullName(IntPtr process, ref uint length, StringBuilder name);
  public static string Of(IntPtr process) { uint n = 0; GetPackageFullName(process, ref n, null); if (n == 0) return null;
    var b = new StringBuilder((int)n); return GetPackageFullName(process, ref n, b) == 0 ? b.ToString() : null; }
}
'@

$built = Get-Content (Join-Path $App 'BUILT.json') -Raw | ConvertFrom-Json
$msix = Get-ChildItem $App -Filter '*.msix' | Select-Object -First 1
$sha = (Get-FileHash $msix.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -ne $built.msixSha256) { throw "the MSIX is $sha, not the $($built.msixSha256) BUILT.json names" }
$zip = [System.IO.Compression.ZipFile]::OpenRead($msix.FullName)
$manifest = [xml](New-Object System.IO.StreamReader(($zip.Entries | Where-Object FullName -eq 'AppxManifest.xml').Open())).ReadToEnd()
$zip.Dispose()
$publisher = $manifest.Package.Identity.Publisher
$record = [ordered]@{ schema = 'rapier-windows-package/1'; msixSha256 = $sha; name = $manifest.Package.Identity.Name;
  version = $manifest.Package.Identity.Version; publisher = $publisher }

$port = 9335
$cert = $null; $package = $null
try {
  $cert = New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature -FriendlyName 'Rapier check, this job only' `
    -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(1) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  $password = ConvertTo-SecureString ([guid]::NewGuid().ToString('N')) -AsPlainText -Force
  $pfx = Join-Path $env:RUNNER_TEMP 'check.pfx'; $cer = Join-Path $env:RUNNER_TEMP 'check.cer'
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $password | Out-Null
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
  $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe |
    Where-Object FullName -match '\\x64\\' | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $signtool) { throw 'no signtool.exe on this image' }
  $signed = Join-Path $env:RUNNER_TEMP $msix.Name
  Copy-Item $msix.FullName $signed -Force
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
  $signOut = & $signtool.FullName sign /fd SHA256 /f $pfx /p $plain $signed 2>&1 | Out-String
  $record.signed = ($LASTEXITCODE -eq 0); $record.signtool = $signOut.Trim()
  # A package signtool or Windows refuses is a result for the record, not a broken check.
  $record.installed = $false
  if ($record.signed) { try { Add-AppxPackage -Path $signed; $record.installed = $true } catch { $record.installError = "$_" } }
  $package = Get-AppxPackage -Name $record.name
  if ($record.installed -and $package) {
    $record.packageFullName = $package.PackageFullName
    $record.installLocation = $package.InstallLocation
    # A packaged app is started by Windows, not by this script: the DevTools port reaches it through the user's environment.
    [Environment]::SetEnvironmentVariable('RAPIER_TEST_DEVTOOLS_PORT', "$port", 'User')
    Start-Process "shell:AppsFolder\$($package.PackageFamilyName)!$($manifest.Package.Applications.Application.Id)"
    $page = $null; $until = (Get-Date).AddSeconds(90)
    while (-not $page -and (Get-Date) -lt $until) {
      Start-Sleep -Seconds 1
      try { $page = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3 |
        Where-Object { $_.type -eq 'page' -and $_.url -like 'https://rapier.local/rapier.html*' -and $_.title } | Select-Object -First 1 } catch {}
    }
    Start-Sleep -Seconds 3
    $process = Get-Process -Name Rapier -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$($package.InstallLocation)*" } | Select-Object -First 1
    $record.started = [bool]$process
    if ($process) { $record.processPackage = [Pkg]::Of($process.Handle); $record.packageIdentity = ($record.processPackage -eq $package.PackageFullName) }
    $record.pageLoaded = [bool]$page
    if ($page) { $record.page = [ordered]@{ url = $page.url; title = $page.title } }
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save((Join-Path $Out 'packaged.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose()
    if ($process -and -not $process.HasExited) { [void]$process.CloseMainWindow(); [void]$process.WaitForExit(8000) }
    if ($process -and -not $process.HasExited) { Stop-Process -InputObject $process }
  }
} finally {
  [Environment]::SetEnvironmentVariable('RAPIER_TEST_DEVTOOLS_PORT', $null, 'User')
  if ($package) { Remove-AppxPackage -Package $package.PackageFullName -ErrorAction SilentlyContinue }
  if ($cert) {
    Get-ChildItem 'Cert:\LocalMachine\TrustedPeople' | Where-Object Thumbprint -eq $cert.Thumbprint | Remove-Item -ErrorAction SilentlyContinue
    Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
  }
  $record.at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $record | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Out 'packaged.json') -Encoding UTF8
  $record | ConvertTo-Json -Depth 4 | Write-Output
}
