# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$work='C:\ci\aq16';$out=Join-Path $work 'out';$inputs=Join-Path $work 'input'
$manifest=Get-Content (Join-Path $inputs 'handoff.json') -Raw | ConvertFrom-Json
$setup=Get-Content (Join-Path $out 'setup.json') -Raw | ConvertFrom-Json
$helper=Join-Path $inputs $manifest.helper
$result=[ordered]@{schema=1;source=$manifest.source;status='NOT PROVEN';error=$null;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;profile=$env:USERPROFILE;checks=@();installed=@();liveStore='NOT PROVEN'}
$package=$null;$process=$null;$policy=$null
$policyExisted=$false;$policyBackup=$null;$policyChanged=$false
function JsonFile($Value,[string]$Path){[IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 30)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))}
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Run([string]$Name,[string[]]$Arguments,[int]$Seconds=60){
  $log=Join-Path $out ($Name+'.jsonl');$errors=Join-Path $out ($Name+'.stderr.txt')
  $argLine=($Arguments | ForEach-Object {'"'+$_.Replace('"','\"')+'"'}) -join ' '
  $p=Start-Process -FilePath $helper -ArgumentList $argLine -PassThru -RedirectStandardOutput $log -RedirectStandardError $errors
  $complete=$p.WaitForExit($Seconds*1000)
  if(-not $complete){Stop-Process -Id $p.Id -Force;$p.WaitForExit()}
  $p.Refresh()
  $rows=@(Get-Content $log | Where-Object {$_} | ForEach-Object {$_ | ConvertFrom-Json})
  $pass=$complete -and $p.ExitCode -eq 0 -and $rows.Count -gt 0 -and @($rows | Where-Object {$_.pass -ne $true}).Count -eq 0
  $result.checks+=@{name=$Name;pass=$pass;complete=$complete;exit=$p.ExitCode;rows=$rows}
  if(-not $pass){throw ('Native case failed or timed out: '+$Name)}
  return ,$rows
}
function Fixture([string]$Path,[int]$Bytes=65536){
  $data=New-Object byte[] $Bytes
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($data)}finally{$rng.Dispose()}
  [IO.File]::WriteAllBytes($Path,$data)
}
try{
  $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Suite is elevated or administrator'}
  if($env:USERNAME -ne 'aq16test' -and $result.identity -notmatch '\\aq16test$'){throw 'Wrong account'}
  if($env:USERPROFILE -ne 'C:\Users\aq16test' -or $env:LOCALAPPDATA -ne 'C:\Users\aq16test\AppData\Local'){throw 'Inherited runneradmin profile'}
  $result.environment=@{USERPROFILE=$env:USERPROFILE;LOCALAPPDATA=$env:LOCALAPPDATA;APPDATA=$env:APPDATA;TEMP=$env:TEMP;TMP=$env:TMP}
  $native=Join-Path $work 'ntfs-fixtures'
  Run 'ntfs' @('--ntfs',$native) | Out-Null
  & cmd.exe /c "mklink /J `"$native\walk\aq16-junction`" `"$native\targets`"" *> (Join-Path $out 'junction-setup.log')
  if($LASTEXITCODE -ne 0){throw 'Real NTFS junction setup failed'}
  Run 'ntfs-links' @('--walk-links',$native) | Out-Null
  foreach($kind in @('ordinary','readonly','veto')){
    $path=Join-Path $work ('aq16-'+$kind+'.jpg');Fixture $path
    if($kind -eq 'readonly'){[IO.File]::SetAttributes($path,[IO.FileAttributes]::ReadOnly)}
    $want=if($kind -eq 'veto'){'veto'}elseif($kind -eq 'readonly'){'safe'}else{'recycled'}
    Run ('shell-'+$kind) @('--recycle',$path,$want) | Out-Null
    [IO.File]::SetAttributes($path,[IO.FileAttributes]::Normal)
  }
  if([IO.DriveInfo]::new('R:\').DriveFormat -ne 'NTFS'){throw 'Dedicated VHD is not NTFS'}
  $baseline='R:\aq16\aq16-bin-baseline.jpg';Fixture $baseline
  Run 'vhd-bin-baseline' @('--recycle',$baseline,'recycled') | Out-Null
  $volume=[string]$setup.scratchVolume
  if($volume -notmatch '^\\\\\?\\Volume\{[0-9a-fA-F-]+\}\\$'){throw 'Unexpected dedicated volume ID'}
  $volumeKey=$volume.Substring(4).TrimEnd('\')
  $policy='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\'+$volumeKey
  if(Test-Path $policy){$policyBackup=Get-ItemProperty $policy;$policyExisted=$true}else{$policyBackup=$null;$policyExisted=$false}
  New-Item $policy -Force | Out-Null
  $policyChanged=$true
  New-ItemProperty $policy -Name NukeOnDelete -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty $policy -Name MaxCapacity -Value 128 -PropertyType DWord -Force | Out-Null
  JsonFile (Get-ItemProperty $policy) (Join-Path $out 'no-bin-policy.json')
  $noBin='R:\aq16\aq16-no-bin.jpg';Fixture $noBin
  Run 'shell-no-bin' @('--recycle',$noBin,'kept') | Out-Null
  New-ItemProperty $policy -Name NukeOnDelete -Value 0 -PropertyType DWord -Force | Out-Null
  New-ItemProperty $policy -Name MaxCapacity -Value 1 -PropertyType DWord -Force | Out-Null
  JsonFile (Get-ItemProperty $policy) (Join-Path $out 'too-large-policy.json')
  $large='R:\aq16\aq16-too-large.jpg';Fixture $large (2MB)
  Run 'shell-too-large' @('--recycle',$large,'kept') | Out-Null
  # This package is unchanged apart from the throwaway signature. Verify its installed executable before launch.
  $msix=Join-Path $inputs $manifest.msix
  Add-AppxPackage -Path $msix -ErrorAction Stop
  $package=Get-AppxPackage -Name 'JackSkipworth.JPEGXLConverter'
  if(-not $package -or $package.Count -gt 1){throw 'Installed converter package missing or ambiguous'}
  $exe=Join-Path $package.InstallLocation 'rapier-host.exe'
  if((Hash $exe)-ne $manifest.executableSha256){throw 'Installed executable differs from handoff'}
  $result.package=@{fullName=$package.PackageFullName;family=$package.PackageFamilyName;installLocation=$package.InstallLocation;executableSha256=Hash $exe;signedMsixSha256=Hash $msix;unsignedMsixSha256=$setup.unsignedMsixSha256}
  $env:RAPIER_TEST_DEVTOOLS_PORT='9226'
  foreach($mode in @('keep','remove')){
    $caseOut=Join-Path $out ('installed-'+$mode);New-Item -ItemType Directory $caseOut | Out-Null
    $library=Join-Path $work ('library-'+$mode);New-Item -ItemType Directory $library | Out-Null
    $jpeg=Join-Path $library ('aq16-'+$mode+'.jpg');Copy-Item (Join-Path $inputs $manifest.jpeg) $jpeg
    $original=@{name=[IO.Path]::GetFileName($jpeg);path=$jpeg;sha256=Hash $jpeg;bytes=(Get-Item $jpeg).Length}
    JsonFile @($original) (Join-Path $caseOut 'originals.json')
    # Controlled prior-purchase cache, authorized for this test only. No new purchase or actual Store ownership is claimed.
    $config=@{root=$library;effort=3;remove=$false;watch=$false;resume=$false;owned=$true}
    $settings=@((Join-Path $env:LOCALAPPDATA 'RapierJxlConverter\archive.json'),(Join-Path $env:LOCALAPPDATA ('Packages\'+$package.PackageFamilyName+'\LocalCache\Local\RapierJxlConverter\archive.json')))
    foreach($path in $settings){New-Item -ItemType Directory (Split-Path $path) -Force | Out-Null;JsonFile $config $path}
    JsonFile @{meaning='controlled prior-purchase fixture, not real Store ownership';paths=$settings;value=$config} (Join-Path $caseOut 'cache-before.json')
    $process=Start-Process -FilePath $exe -ArgumentList '--app','converter' -PassThru
    Start-Sleep -Milliseconds 1000
    $identity=Run ('installed-'+$mode+'-identity') @('--process',[string]$process.Id)
    if($identity[0].packageFullName -ne $package.PackageFullName -or $identity[0].sha256 -ne $manifest.executableSha256){throw 'Launched process is not exact installed package'}
    $nodeArgs=@('C:\ci\aq16\installed-archive.mjs','9226',$library,$caseOut,$mode)
    $nodeLine=($nodeArgs | ForEach-Object {'"'+$_+'"'}) -join ' '
    $driver=Start-Process (Join-Path $work 'node.exe') -ArgumentList $nodeLine -PassThru -RedirectStandardOutput (Join-Path $caseOut 'driver.log') -RedirectStandardError (Join-Path $caseOut 'driver.stderr.txt')
    if(-not $driver.WaitForExit(360000)){Stop-Process -Id $driver.Id -Force;throw 'Installed Archive driver timeout'}
    if($driver.ExitCode -ne 0){throw 'Installed Archive driver failed'}
    $receipt=Get-Content (Join-Path $caseOut 'installed-archive.json') -Raw | ConvertFrom-Json
    if($receipt.status -ne 'PASS'){throw 'Installed Archive has no PASS receipt'}
    if($mode -eq 'remove'){
      if(Test-Path $jpeg){throw 'Original unexpectedly remains after affirmative native recycling'}
      Run ('installed-'+$mode+'-restore') @('--restore',$jpeg,$original.sha256) | Out-Null
    }
    if((Hash $jpeg)-ne $original.sha256){throw 'Installed run original or Bin-restored original differs'}
    $csv=Import-Csv (Join-Path $caseOut 'archive-receipt.csv')
    $rows=@($csv | Where-Object {$_.original -eq $jpeg})
    $states=@($rows | ForEach-Object {$_.result})
    if($states.Count -lt 2 -or $states[0] -ne 'written' -or $states[1] -ne 'saved'){throw 'Durable receipt order differs'}
    if(@($rows | Where-Object {$_.result -eq 'saved' -and $_.'original sha-256' -eq $original.sha256}).Count -ne 1){throw 'Saved receipt original hash differs'}
    if($mode -eq 'remove' -and -not @($rows | Where-Object {$_.result -eq 'original in the Recycle Bin'}).Count){throw 'Recycle outcome receipt absent'}
    $process.CloseMainWindow() | Out-Null
    if(-not $process.WaitForExit(15000)){Stop-Process -Id $process.Id -Force;throw 'Installed converter did not close cleanly'}
    $process=$null
    $after=@($settings | ForEach-Object {if(Test-Path $_){@{path=$_;value=(Get-Content $_ -Raw | ConvertFrom-Json);sha256=Hash $_}}})
    JsonFile $after (Join-Path $caseOut 'cache-after.json')
    if(@($after | Where-Object {$_.value.owned -ne $true -or $_.value.remove -ne $false}).Count){throw 'Uncertain Store read revoked cache or persisted removal authority'}
    $result.installed+=@{mode=$mode;status='PASS';originalSha256=$original.sha256;jxl=$receipt.files;receipt=$receipt.ended.receipt;controlledOwnership=$true}
  }
  $pluginOut=Join-Path $out 'installed-plugins';New-Item -ItemType Directory $pluginOut | Out-Null
  $pluginArgs=@('C:\ci\aq16\installed-plugins.mjs',(Join-Path $inputs $manifest.rapierMsix),(Join-Path $inputs $manifest.optionalMsix),$pluginOut,$manifest.rapierExecutableSha256,$manifest.source)
  $pluginLine=($pluginArgs | ForEach-Object {'"'+$_+'"'}) -join ' '
  $plugins=Start-Process (Join-Path $work 'node.exe') -ArgumentList $pluginLine -PassThru -RedirectStandardOutput (Join-Path $pluginOut 'driver.log') -RedirectStandardError (Join-Path $pluginOut 'driver.stderr.txt')
  if(-not $plugins.WaitForExit(600000)){Stop-Process -Id $plugins.Id -Force;throw 'Installed Rapier/optional package driver timeout'}
  if($plugins.ExitCode -ne 0){throw 'Installed Rapier/optional package driver failed'}
  $pluginResult=Get-Content (Join-Path $pluginOut 'installed-plugins.json') -Raw | ConvertFrom-Json
  if($pluginResult.status -ne 'PASS'){throw 'No passing installed Rapier/optional package receipt'}
  $result.plugins=$pluginResult
  $result.status='PASS'
}catch{
  $result.status='FAIL';$result.error=$_.Exception.ToString()
}finally{
  if($process -and -not $process.HasExited){$process.CloseMainWindow() | Out-Null;if(-not $process.WaitForExit(5000)){Stop-Process -Id $process.Id -Force}}
  if($package){try{Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop}catch{$result.cleanupError=$_.Exception.Message;$result.status='FAIL'}}
  if($policyChanged){
    try{
      if($policyExisted){
        foreach($name in @('NukeOnDelete','MaxCapacity')){
          if($policyBackup.PSObject.Properties.Name -contains $name){Set-ItemProperty $policy -Name $name -Value $policyBackup.$name}else{Remove-ItemProperty $policy -Name $name -ErrorAction SilentlyContinue}
        }
      }else{Remove-Item $policy -Recurse -Force -ErrorAction SilentlyContinue}
    }catch{$result.policyCleanupError=$_.Exception.Message;$result.status='FAIL'}
  }
  JsonFile $result (Join-Path $out 'standard-user.json')
}
if($result.status -ne 'PASS'){Write-Error $result.error;exit 1}
