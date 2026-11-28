# SPDX-License-Identifier: AGPL-3.0-only
# Elevated setup only. All file custody, Shell, installation, and app runs happen under the new standard account.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Bundle,[Parameter(Mandatory)][string]$BundleSha256,[Parameter(Mandatory)][string]$Source)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows'){throw 'Disposable Windows GitHub runner required'}
if($Source -notmatch '^[0-9a-f]{40}$' -or $BundleSha256 -notmatch '^[0-9a-f]{64}$'){throw 'Exact source and bundle hashes required'}
$work='C:\ci\aq16'
if(Test-Path $work){throw 'Fresh C:\ci\aq16 required'}
New-Item -ItemType Directory $work,(Join-Path $work 'out'),(Join-Path $work 'input') | Out-Null
$out=Join-Path $work 'out'
$testUser='aq16test'
$certificate=$null
$certificateCreationAttempted=$false
$vhd=Join-Path $work 'aq16-scratch.vhd'
$mounted=$false
$vhdCreationAttempted=$false
$userCreationAttempted=$false
$createdUserSid=$null
$devKey='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
$devName='AllowDevelopmentWithoutDevLicense'
$devBefore=$null
$changedDev=$false
$result=[ordered]@{schema=1;source=$Source;status='NOT PROVEN';workflowCommit=$env:GITHUB_SHA;bundleSha256=$BundleSha256;os=[Environment]::OSVersion.VersionString;standardUser=$testUser;cleanupScope='Elevated setup resources only; standard-user cleanup is in standard-user.json';cleanupComplete=$false;cleanup=@()}
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function DeveloperModeState {
  $state=[ordered]@{keyExists=(Test-Path -LiteralPath $devKey -ErrorAction Stop);valueExists=$false;kind=$null;value=$null}
  if($state.keyExists){
    $key=Get-Item -LiteralPath $devKey -ErrorAction Stop
    try{
      if($key.GetValueNames() -contains $devName){$state.valueExists=$true;$state.kind=$key.GetValueKind($devName).ToString();$state.value=$key.GetValue($devName)}
    }finally{$key.Close()}
  }
  return $state
}
function CleanupStep([string]$Name,[bool]$Required,[scriptblock]$Action){
  $entry=[ordered]@{step=$Name;required=$Required;pass=$false}
  try{if($Required){& $Action $entry | Out-Null};$entry.pass=$true}
  catch{$entry.error=$_.Exception.ToString();$result.status='FAIL';if(-not $result.Contains('error')){$result.error='Cleanup failed; see cleanup entries'}}
  finally{$result.cleanup+=@($entry)}
}
try {
  foreach($script in @('run-windows.ps1','standard-user.ps1')){
    $tokens=$null;$parseErrors=$null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $script),[ref]$tokens,[ref]$parseErrors) | Out-Null
    if($parseErrors.Count){$parseErrors | Out-String | Set-Content (Join-Path $out ($script+'.parse.txt'));throw ('PowerShell parse failure: '+$script)}
  }
  if((Hash $Bundle)-ne $BundleSha256){throw 'Bundle hash mismatch'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead((Resolve-Path $Bundle))
  try{
    foreach($entry in $zip.Entries){
      if($entry.FullName -notmatch '^[A-Za-z0-9_.-]+$' -or $entry.Length -gt 150MB){throw 'Unexpected bundle path or size'}
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $work ('input\'+$entry.FullName)),$false)
    }
  }finally{$zip.Dispose()}
  $inputRoot=Join-Path $work 'input'
  $manifest=Get-Content (Join-Path $inputRoot 'handoff.json') -Raw | ConvertFrom-Json
  if($manifest.schema -ne 1 -or $manifest.source -ne $Source){throw 'Wrong handoff source'}
  if(-not $manifest.sourcePaths -or @($manifest.sourcePaths | Where-Object {$_ -notmatch '^repo/' -or $_ -match '^apps/|(^|/)\.\.(/|$)'}).Count){throw 'Bundle source includes private app paths or lacks its inventory'}
  $names=@('handoff.json')
  foreach($file in $manifest.files){
    if($file.path -notmatch '^[A-Za-z0-9_.-]+$' -or $names -contains $file.path){throw 'Invalid or duplicate handoff entry'}
    $path=Join-Path $inputRoot $file.path
    if((Get-Item -LiteralPath $path).Length -ne $file.bytes -or (Hash $path)-ne $file.sha256){throw ('Handoff member mismatch: '+$file.path)}
    $names+=$file.path
  }
  if(@(Get-ChildItem $inputRoot -File).Count -ne $names.Count){throw 'Unlisted bundle members'}
  foreach($name in @($manifest.msix,$manifest.helper,$manifest.jpeg,$manifest.converterRecord,$manifest.rapierMsix,$manifest.optionalMsix,'RAPIER-BUILT.json','windows-native-build.json')){
    if(-not ($names -contains $name)){throw 'Missing required handoff role'}
  }
  $converterBuild=Get-Content (Join-Path $inputRoot $manifest.converterRecord) -Raw | ConvertFrom-Json
  $rapierBuild=Get-Content (Join-Path $inputRoot 'RAPIER-BUILT.json') -Raw | ConvertFrom-Json
  $nativeBuild=Get-Content (Join-Path $inputRoot 'windows-native-build.json') -Raw | ConvertFrom-Json
  if($converterBuild.source -ne $Source -or $rapierBuild.source -ne $Source -or $nativeBuild.source -ne $Source){throw 'A build receipt names a different source'}
  if($converterBuild.appSet -ne 'converter' -or $rapierBuild.appSet -ne 'rapier'){throw 'A build receipt names a different app set'}
  if($converterBuild.sha256 -ne $manifest.executableSha256 -or $rapierBuild.sha256 -ne $manifest.rapierExecutableSha256){throw 'Executable and build receipt disagree'}
  $nativePath=Join-Path $inputRoot $manifest.helper
  if($nativeBuild.status -ne 'PASS' -or $nativeBuild.executable.sha256 -ne (Hash $nativePath) -or $nativeBuild.executable.bytes -ne (Get-Item $nativePath).Length){throw 'Native helper and build receipt disagree'}
  Copy-Item (Join-Path $inputRoot 'handoff.json') $out
  $msix=Join-Path $inputRoot $manifest.msix
  $package=[IO.Compression.ZipFile]::OpenRead($msix)
  try{
    $entry=$package.GetEntry('AppxManifest.xml');if(-not $entry){throw 'Package manifest missing'}
    $reader=[IO.StreamReader]::new($entry.Open());try{[xml]$appx=$reader.ReadToEnd()}finally{$reader.Dispose()}
    if($appx.Package.Identity.Name -ne 'JackSkipworth.JPEGXLConverter'){throw 'Only JPEG XL Converter package allowed'}
    $hostEntry=$package.GetEntry('rapier-host.exe');if(-not $hostEntry){throw 'Packaged converter executable missing'}
    $stream=$hostEntry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{$hostHash=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
    if($hostHash -ne $manifest.executableSha256){throw 'Packaged executable differs from receipt'}
    $result.packageName=[string]$appx.Package.Identity.Name
    $result.packageVersion=[string]$appx.Package.Identity.Version
    $result.publisher=[string]$appx.Package.Identity.Publisher
    $result.unsignedMsixSha256=Hash $msix
    $result.executableSha256=$hostHash
  }finally{$package.Dispose()}
  # No real signing credential is used or exported. The private key remains in this disposable runner's certificate store.
  $certificateCreationAttempted=$true
  $certificate=New-SelfSignedCertificate -Type Custom -Subject $result.publisher -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
  $certPath=Join-Path $work 'aq16-public.cer'
  Export-Certificate -Cert $certificate -FilePath $certPath | Out-Null
  Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
  $signTool=Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' | Sort-Object FullName -Descending | Select-Object -First 1
  if(-not $signTool){throw 'Windows SDK SignTool unavailable'}
  & $signTool.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $msix *> (Join-Path $out 'sign.log')
  if($LASTEXITCODE -ne 0){throw 'Throwaway signing failed'}
  & $signTool.FullName verify /pa /v $msix *> (Join-Path $out 'signature.log')
  if($LASTEXITCODE -ne 0){throw 'Test signature verification failed'}
  $result.signedMsixSha256=Hash $msix
  $result.testCertificateThumbprint=$certificate.Thumbprint
  $result.rapierPackages=@()
  $rapierVersion=$null
  foreach($role in @('rapierMsix','optionalMsix')){
    $path=Join-Path $inputRoot $manifest.$role
    $extra=[IO.Compression.ZipFile]::OpenRead($path)
    try{
      $entry=$extra.GetEntry('AppxManifest.xml');if(-not $entry){throw 'Rapier package manifest missing'}
      $reader=[IO.StreamReader]::new($entry.Open());try{[xml]$xml=$reader.ReadToEnd()}finally{$reader.Dispose()}
      if([string]$xml.Package.Identity.Publisher -ne $result.publisher){throw 'Rapier package publisher differs'}
      if($role -eq 'rapierMsix'){
        if([string]$xml.Package.Identity.Name -ne 'JackSkipworth.rapier'){throw 'Wrong Rapier main package'}
        $rapierVersion=[string]$xml.Package.Identity.Version
        $entry=$extra.GetEntry('rapier-host.exe');if(-not $entry){throw 'Rapier executable missing'}
        $stream=$entry.Open();$digest=[Security.Cryptography.SHA256]::Create();try{$sha=([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$digest.Dispose()}
        if($sha -ne $manifest.rapierExecutableSha256){throw 'Rapier executable hash mismatch'}
      }else{
        if([string]$xml.Package.Identity.Name -ne 'JackSkipworth.rapierplugins'){throw 'Wrong Rapier optional package'}
        if(-not $rapierVersion -or [string]$xml.Package.Identity.Version -ne $rapierVersion){throw 'Rapier main and optional versions differ'}
        if(-not @($xml.Package.Dependencies.ChildNodes | Where-Object {$_.LocalName -eq 'MainPackageDependency' -and $_.GetAttribute('Name') -eq 'JackSkipworth.rapier'}).Count){throw 'Optional package does not name Rapier main'}
        if(@($extra.Entries | Where-Object {$_.FullName -match '(?i)\.(exe|dll)$'}).Count){throw 'Optional content package contains executable code'}
      }
      $record=@{role=$role;name=[string]$xml.Package.Identity.Name;version=[string]$xml.Package.Identity.Version;unsignedSha256=Hash $path}
    }finally{$extra.Dispose()}
    & $signTool.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $path *> (Join-Path $out ($role+'-sign.log'))
    if($LASTEXITCODE -ne 0){throw ('Throwaway signing failed: '+$role)}
    & $signTool.FullName verify /pa /v $path *> (Join-Path $out ($role+'-signature.log'))
    if($LASTEXITCODE -ne 0){throw ('Test signature verification failed: '+$role)}
    $record.signedSha256=Hash $path;$result.rapierPackages+=$record
  }
  $password='Aa1!'+[Guid]::NewGuid().ToString('N')
  Write-Output ('::add-mask::'+$password)
  if(@(Get-LocalUser -ErrorAction Stop | Where-Object {$_.Name -eq $testUser}).Count){throw 'Test account already exists'}
  $userCreationAttempted=$true
  & net.exe user $testUser $password /add /y | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Standard account creation failed'}
  $createdUserSid=(Get-LocalUser -Name $testUser -ErrorAction Stop).SID.Value
  $result.standardUserSid=$createdUserSid
  $cred=[Management.Automation.PSCredential]::new($testUser,(ConvertTo-SecureString $password -AsPlainText -Force))
  & icacls.exe $work /grant "${testUser}:(OI)(CI)M" | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Fixture access grant failed'}
  # Only this disposable VHD is formatted or used for Bin-capacity policy cases.
  if(Get-Volume -DriveLetter R -ErrorAction SilentlyContinue){throw 'Scratch drive R already exists'}
  $diskpart=Join-Path $work 'mount.txt'
  @("create vdisk file=`"$vhd`" maximum=1024 type=expandable", "select vdisk file=`"$vhd`"",'attach vdisk','create partition primary','format fs=ntfs label=AQ16 quick','assign letter=R') | Set-Content -Encoding ascii $diskpart
  $vhdCreationAttempted=$true
  & diskpart.exe /s $diskpart *> (Join-Path $out 'vhd-setup.log')
  $result.vhdSetupExit=$LASTEXITCODE
  if($result.vhdSetupExit -ne 0){throw 'Dedicated VHD setup command failed'}
  $volume=Get-Volume -DriveLetter R
  if($volume.FileSystem -ne 'NTFS' -or $volume.FileSystemLabel -ne 'AQ16'){throw 'Dedicated NTFS VHD not established'}
  $diskImage=Get-DiskImage -ImagePath $vhd -ErrorAction Stop
  if($diskImage.ImagePath -ne $vhd -or -not $diskImage.Attached){throw 'Owned VHD attachment not established'}
  $ownedVolumes=@($diskImage | Get-Disk -ErrorAction Stop | Get-Partition -ErrorAction Stop | Get-Volume -ErrorAction Stop | Where-Object {$_.DriveLetter -eq 'R'})
  if($ownedVolumes.Count -ne 1 -or $ownedVolumes[0].UniqueId -ne $volume.UniqueId){throw 'Scratch drive does not belong to the owned VHD'}
  $result.scratchImage=$vhd
  $mounted=$true
  New-Item -ItemType Directory 'R:\aq16' | Out-Null
  & icacls.exe 'R:\aq16' /grant "${testUser}:(OI)(CI)M" | Out-Null
  if($LASTEXITCODE -ne 0){throw 'VHD fixture access grant failed'}
  $result.scratchVolume=$volume.UniqueId
  $devBefore=DeveloperModeState
  if($devBefore.valueExists -and $devBefore.kind -ne 'DWord'){throw 'Unexpected Developer Mode registry type; value left unchanged'}
  $result.developerModeBefore=$devBefore
  # Capture the baseline before marking a mutation attempt, including a partially failed write.
  $changedDev=$true
  if(-not $devBefore.keyExists){New-Item $devKey -Force | Out-Null}
  New-ItemProperty $devKey -Name $devName -Value 1 -PropertyType DWord -Force | Out-Null
  Copy-Item (Join-Path $PSScriptRoot 'standard-user.ps1'),(Join-Path $PSScriptRoot 'installed-archive.mjs'),(Join-Path $PSScriptRoot 'installed-plugins.mjs') $work
  $node=(Get-Command node.exe).Source
  Copy-Item $node (Join-Path $work 'node.exe')
  $profile='C:\Users\'+$testUser
  $command=@('@echo off',"set `"USERPROFILE=$profile`"","set `"LOCALAPPDATA=$profile\AppData\Local`"","set `"APPDATA=$profile\AppData\Roaming`"","set `"HOMEPATH=$($profile.Substring(2))`"",'set "HOMEDRIVE=C:"',"set `"TEMP=$profile\AppData\Local\Temp`"","set `"TMP=$profile\AppData\Local\Temp`"",'set "TMPDIR="','if not exist "%TEMP%" mkdir "%TEMP%"','whoami /all > C:\ci\aq16\out\whoami.txt','whoami /priv > C:\ci\aq16\out\privileges.txt','powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ci\aq16\standard-user.ps1','> C:\ci\aq16\out\standard-exit.txt echo %ERRORLEVEL%')
  $command | Set-Content -Encoding ascii (Join-Path $work 'run.cmd')
  $result | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $out 'setup.json')
  $process=Start-Process cmd.exe -ArgumentList '/c','C:\ci\aq16\run.cmd' -Credential $cred -LoadUserProfile -WorkingDirectory $work -PassThru
  if(-not $process.WaitForExit(1200000)){Stop-Process -Id $process.Id -Force;throw 'Standard-user runner exceeded 20 minutes'}
  $exitPath=Join-Path $out 'standard-exit.txt'
  if(-not (Test-Path $exitPath) -or (Get-Content $exitPath -Raw).Trim() -ne '0'){throw 'Standard-user suite failed or has no exit receipt'}
  $standard=Get-Content (Join-Path $out 'standard-user.json') -Raw | ConvertFrom-Json
  if($standard.status -ne 'PASS'){throw 'Standard-user receipt is not PASS'}
  if($standard.sid -ne $createdUserSid){throw 'Standard-user receipt differs from the account created by this run'}
  $result.status='PASS'
}catch{
  $result.status='FAIL';$result.error=$_.Exception.ToString()
  Write-Output ('::error title=AQ16 Windows::'+$_.Exception.Message)
}finally{
  # Artifacts contain only receipts/pictures and disposable fixture bytes, never certificates, keys, passwords or packages.
  # Each owned resource is independent: one failure cannot prevent the other attempts or the final receipt.
  CleanupStep 'detach-owned-vhd' $vhdCreationAttempted {
    param($entry)
    $entry.image=$vhd;$entry.commandExit=$null;$entry.fileExists=Test-Path -LiteralPath $vhd -ErrorAction Stop
    if(-not $entry.fileExists){$entry.attachedAfter=$null;throw 'VHD file absent after creation attempt; detached state not verified'}
    $disk=Get-DiskImage -ImagePath $vhd -ErrorAction Stop
    if($disk.ImagePath -ne $vhd){throw 'Disk-image query returned a different path'}
    $entry.attachedBefore=[bool]$disk.Attached
    if($disk.Attached){
      @("select vdisk file=`"$vhd`"",'detach vdisk') | Set-Content -Encoding ascii (Join-Path $work 'unmount.txt')
      & diskpart.exe /s (Join-Path $work 'unmount.txt') *> (Join-Path $out 'vhd-cleanup.log')
      $entry.commandExit=$LASTEXITCODE
    }
    $disk=Get-DiskImage -ImagePath $vhd -ErrorAction Stop
    $entry.attachedAfter=[bool]$disk.Attached
    if($disk.ImagePath -ne $vhd -or $entry.attachedAfter -or ($null -ne $entry.commandExit -and $entry.commandExit -ne 0)){throw 'Owned VHD detach did not complete and verify'}
  }
  CleanupStep 'restore-developer-mode' $changedDev {
    param($entry)
    $entry.before=$devBefore;$now=DeveloperModeState;$entry.observed=$now
    $alreadyRestored=$now.valueExists -eq $devBefore.valueExists -and (-not $now.valueExists -or ($now.kind -eq $devBefore.kind -and $now.value -eq $devBefore.value))
    if(-not $alreadyRestored){
      if(-not $now.valueExists -or $now.kind -ne 'DWord' -or $now.value -ne 1){throw 'Developer Mode changed after setup; conflicting state preserved'}
      if($devBefore.valueExists){Set-ItemProperty -LiteralPath $devKey -Name $devName -Value $devBefore.value -ErrorAction Stop}
      else{Remove-ItemProperty -LiteralPath $devKey -Name $devName -ErrorAction Stop}
    }
    # Restore only the owned value; retain the container and any unrelated values/subkeys.
    $entry.after=DeveloperModeState
    if($entry.after.valueExists -ne $devBefore.valueExists -or ($devBefore.valueExists -and ($entry.after.kind -ne $devBefore.kind -or $entry.after.value -ne $devBefore.value))){throw 'Developer Mode value was not restored exactly'}
  }
  CleanupStep 'remove-trusted-certificate' $certificateCreationAttempted {
    param($entry)
    if(-not $certificate -or -not $certificate.Thumbprint){throw 'Certificate creation was attempted without an exact thumbprint; cleanup not proved'}
    $entry.path='Cert:\LocalMachine\TrustedPeople\'+$certificate.Thumbprint
    if(Test-Path -Path $entry.path -ErrorAction Stop){Remove-Item -Path $entry.path -Confirm:$false -ErrorAction Stop}
    $entry.absent= -not (Test-Path -Path $entry.path -ErrorAction Stop)
    if(-not $entry.absent){throw 'Owned trusted certificate remains'}
  }
  CleanupStep 'remove-signing-certificate-and-key' $certificateCreationAttempted {
    param($entry)
    if(-not $certificate -or -not $certificate.Thumbprint){throw 'Certificate creation was attempted without an exact thumbprint; key cleanup not proved'}
    $entry.path='Cert:\CurrentUser\My\'+$certificate.Thumbprint;$entry.privateKeyDeletion='NOT PROVEN'
    if(-not (Test-Path -Path $entry.path -ErrorAction Stop)){throw 'Signing certificate already absent; private-key removal cannot be established'}
    $entry.hadPrivateKey=[bool](Get-Item -Path $entry.path -ErrorAction Stop).HasPrivateKey
    Remove-Item -Path $entry.path -DeleteKey -Confirm:$false -ErrorAction Stop
    $entry.absent= -not (Test-Path -Path $entry.path -ErrorAction Stop)
    if(-not $entry.absent -or -not $entry.hadPrivateKey){throw 'Owned signing certificate/private-key removal not established'}
    $entry.privateKeyDeletion='Certificate provider -DeleteKey completed; key store not independently reopened'
  }
  CleanupStep 'remove-owned-account' $userCreationAttempted {
    param($entry)
    $entry.name=$testUser;$entry.sid=$createdUserSid
    if(-not $createdUserSid){throw 'Created account SID unavailable; no account deleted by name'}
    if(@(Get-LocalUser -ErrorAction Stop | Where-Object {$_.SID.Value -eq $createdUserSid}).Count){Remove-LocalUser -SID $createdUserSid -Confirm:$false -ErrorAction Stop}
    $users=@(Get-LocalUser -ErrorAction Stop)
    $entry.ownedSidAbsent=@($users | Where-Object {$_.SID.Value -eq $createdUserSid}).Count -eq 0
    $entry.sameNameSidsAfter=@($users | Where-Object {$_.Name -eq $testUser} | ForEach-Object {$_.SID.Value})
    if(-not $entry.ownedSidAbsent){throw 'Created account SID remains'}
  }
  $result.cleanupComplete=$result.cleanup.Count -eq 5 -and @($result.cleanup | Where-Object {$_.pass -ne $true}).Count -eq 0
  if(-not $result.cleanupComplete){$result.status='FAIL'}
  $result | ConvertTo-Json -Depth 15 | Set-Content -Encoding utf8 (Join-Path $out 'windows-result.json')
  Write-Output ('::notice title=AQ16 Windows::'+$result.status+' source '+$Source+' bundle '+$BundleSha256)
}
if($result.status -ne 'PASS'){exit 1}
