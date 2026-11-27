# The converter's own self-test code (Rapier's --self-test reports any converter failure as 14), as the runner account and
# as an unelevated standard user, Developer Mode on.
param([string]$Exe)
$key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
New-Item -Path $key -Force | Out-Null; Set-ItemProperty -Path $key -Name AllowDevelopmentWithoutDevLicense -Value 1 -Type DWord
$p = Start-Process -FilePath $Exe -ArgumentList '--app', 'converter', '--self-test' -Wait -PassThru -NoNewWindow
echo "::notice title=converter self-test, elevated::exit $($p.ExitCode)"
$name = 'aq15conv'; $pw = 'Aq15-' + [guid]::NewGuid().ToString('N').Substring(0, 16) + '!a'
net user $name $pw /add /y | Out-Null
$in = 'C:\aq15\in-conv'; New-Item -ItemType Directory -Force -Path $in | Out-Null; Copy-Item -LiteralPath $Exe -Destination $in -Force
icacls $in /grant "${name}:(OI)(CI)RX" | Out-Null
$cred = New-Object System.Management.Automation.PSCredential($name, (ConvertTo-SecureString $pw -AsPlainText -Force))
foreach ($where in 'read-only folder', 'writable folder') {
  if ($where -eq 'writable folder') { icacls $in /grant "${name}:(OI)(CI)M" | Out-Null }
  $q = Start-Process -FilePath (Join-Path $in (Split-Path $Exe -Leaf)) -ArgumentList '--app', 'converter', '--self-test' -Credential $cred -LoadUserProfile -Wait -PassThru -WorkingDirectory $in
  echo "::notice title=converter self-test, standard user, $where::exit $($q.ExitCode)"
  $r = Start-Process -FilePath (Join-Path $in (Split-Path $Exe -Leaf)) -ArgumentList '--self-test' -Credential $cred -LoadUserProfile -Wait -PassThru -WorkingDirectory $in
  echo "::notice title=Rapier self-test, standard user, $where::exit $($r.ExitCode)"
}
