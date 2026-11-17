# SPDX-License-Identifier: AGPL-3.0-only
# Run only INSIDE the existing guarded Windows installer, before its package and test-certificate cleanup.
param(
  [Parameter(Mandatory)] $Package,
  [Parameter(Mandatory)] [string] $AppId,
  [Parameter(Mandatory)] [string] $ExpectedExeSha256,
  [Parameter(Mandatory)] [int] $Port,
  [Parameter(Mandatory)] [string] $Out
)
$ErrorActionPreference = 'Stop'
$rows = [ordered]@{ identity='UNRUN'; openPicker='UNRUN'; edit='UNRUN'; savePicker='UNRUN'; disk='UNRUN';
  normalQuit='UNRUN'; relaunch='UNRUN'; reopenPicker='UNRUN'; reopenedText='UNRUN'; finalQuit='UNRUN' }
$step = 'identity'
$failure = 'none'
$work = $null

function Probe([string]$Mode, [string]$Prior='') {
  $argsForNode = @((Join-Path $PSScriptRoot 'installed-editor.mjs'), "$Port", $Mode)
  if ($Prior) { $argsForNode += $Prior }
  $json = & node @argsForNode
  $code = $LASTEXITCODE
  if (-not $json) { throw 'EDITOR_PROBE_FAILED' }
  $data = $json | ConvertFrom-Json
  if ($code -ne 0 -or $data.error) {
    if ($data.error -cin @('SETTINGS_CONTROL_NOT_VISIBLE','SETTINGS_DID_NOT_OPEN','OPEN_CONTROL_NOT_VISIBLE','SAVE_AS_CONTROL_NOT_VISIBLE','EDITOR_TARGET_NOT_UNIQUE_OR_TEXT_DIFFERS','COLD_START_ALREADY_HAS_SAVED_TEXT','MULTIPLE_MATCHING_PAGES','EDIT_TEXT_DIFFERS','CDP_COMMAND_TIMEOUT','CDP_COMMAND_REFUSED','CDP_EVAL_FAILED')) { throw $data.error }
    throw 'EDITOR_PROBE_FAILED'
  }
  return $data
}

function PackageProcesses {
  # Fail closed on a process named Rapier whose path cannot be read. A portable executable must never share this job.
  $items = @(Get-Process -Name Rapier -ErrorAction SilentlyContinue)
  foreach ($item in $items) {
    if (-not $item.Path -or -not [string]::Equals($item.Path,$script:installedExe,[StringComparison]::OrdinalIgnoreCase)) { throw 'UNEXPECTED_RAPIER_PROCESS' }
    if ([Pkg]::Of($item.Handle) -ne $Package.PackageFullName) { throw 'NATIVE_PACKAGE_ID_MISMATCH' }
    $item
  }
}
function MatchPicker([string]$Title) {
  $until = (Get-Date).AddSeconds(18)
  do {
    $group = @(PackageProcesses)
    $hits = @()
    foreach ($p in $group) {
      foreach ($hwnd in [PickerOwner]::OwnedDialogs([uint32]$p.Id, $Title)) {
        $hits += [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
      }
    }
    if ($hits.Count -gt 1) { throw 'MULTIPLE_OWNED_PICKERS' }
    if ($hits.Count -eq 1) { return $hits[0] }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $until)
  throw 'NATIVE_PICKER_NOT_FOUND'
}
function TypedControl($Picker,[string]$Id,$Type) {
  $auto = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$Id)
  $kind = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,$Type)
  $when = [System.Windows.Automation.AndCondition]::new([System.Windows.Automation.Condition[]]@($auto,$kind))
  $hits = $Picker.FindAll([System.Windows.Automation.TreeScope]::Descendants,$when)
  if ($hits.Count -gt 1) { throw 'NATIVE_CONTROL_AMBIGUOUS' }
  if ($hits.Count -eq 1) { return $hits.Item(0) }
}
function FileEdit($Picker) {
  $edit = TypedControl $Picker '1148' ([System.Windows.Automation.ControlType]::Edit)
  if ($edit) { return $edit }
  $auto = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'FileNameControlHost')
  $hosts = $Picker.FindAll([System.Windows.Automation.TreeScope]::Descendants,$auto)
  if ($hosts.Count -ne 1) { throw 'PICKER_FILENAME_HOST_NOT_UNIQUE' }
  $kind = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
  $edits = $hosts.Item(0).FindAll([System.Windows.Automation.TreeScope]::Descendants,$kind)
  if ($edits.Count -ne 1) { throw 'PICKER_FILENAME_EDIT_NOT_UNIQUE' }
  return $edits.Item(0)
}
function AcceptPicker([string]$Title,[string]$Path) {
  $dialog = MatchPicker $Title
  $edit = FileEdit $dialog
  $action = TypedControl $dialog '1' ([System.Windows.Automation.ControlType]::Button)
  if (-not $action -or -not $action.Current.IsEnabled) { throw 'PICKER_ACCEPT_CONTROL_MISSING' }
  $value = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $value.SetValue($Path)
  if ($value.Current.Value -cne $Path) { throw 'PICKER_FILENAME_INPUT_DIFFERS' }
  $action.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function NormalQuit {
  $group = @(PackageProcesses)
  if (-not $group.Count) { throw 'NO_INSTALLED_WINDOW_TO_CLOSE' }
  foreach ($p in $group) {
    if (-not $p.HasExited -and (-not $p.CloseMainWindow())) { throw 'NORMAL_CLOSE_NOT_SENT' }
  }
  foreach ($p in $group) {
    if (-not $p.WaitForExit(18000) -or $p.ExitCode -ne 0) { throw 'NORMAL_CLOSE_DID_NOT_FINISH' }
  }
  $until = (Get-Date).AddSeconds(6)
  do {
    if (@(PackageProcesses).Count -eq 0 -and (Probe 'count').pages -eq 0) { return }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $until)
  throw 'OLD_PROCESS_OR_TARGET_STILL_ALIVE'
}
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PickerOwner {
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc visit, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint command);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int size);
  public static IntPtr[] OwnedDialogs(uint expectedPid, string expectedTitle) {
    var found = new List<IntPtr>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
      uint pid, ownerPid;
      if (!IsWindowVisible(hwnd) || GetWindowThreadProcessId(hwnd,out pid)==0 || pid!=expectedPid) return true;
      var owner=GetWindow(hwnd,4);
      if(owner==IntPtr.Zero || GetWindowThreadProcessId(owner,out ownerPid)==0 || ownerPid!=expectedPid) return true;
      var cls=new StringBuilder(64); var label=new StringBuilder(128);
      GetClassName(hwnd,cls,cls.Capacity); GetWindowText(hwnd,label,label.Capacity);
      if(cls.ToString()=="#32770" && label.ToString()==expectedTitle) found.Add(hwnd);
      return true;
    },IntPtr.Zero);
    return found.ToArray();
  }
}
'@
  if ($ExpectedExeSha256 -notmatch '^[a-fA-F0-9]{64}$' -or $AppId -notmatch '^[a-zA-Z0-9.]+$') { throw 'INVALID_PACKAGE_INPUT' }
  $script:installedExe = Join-Path $Package.InstallLocation 'Rapier.exe'
  if ((Get-FileHash -LiteralPath $script:installedExe -Algorithm SHA256).Hash -ine $ExpectedExeSha256) { throw 'INSTALLED_EXE_HASH_DIFFERS' }
  $starting = @(PackageProcesses)
  if ($starting.Count -ne 1) { throw 'INITIAL_PACKAGE_PROCESS_NOT_UNIQUE' }
  $rows.identity = 'PASS'

  $work = Join-Path $env:RUNNER_TEMP ('rapier-journey-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $work | Out-Null
  $original = Join-Path $work 'native-original.md'
  $saved = Join-Path $work 'native-saved.md'
  [IO.File]::WriteAllText($original, "# Installed Markdown`n`nThe file is a native test fixture.`n", [Text.UTF8Encoding]::new($false))

  $step='openPicker'
  $initial = Probe 'open'
  AcceptPicker 'Open in Rapier' $original
  $rows.openPicker='PASS'

  $step='edit'
  $edited = Probe 'edit'
  $rows.edit='PASS'

  $step='savePicker'
  if (Test-Path -LiteralPath $saved) { throw 'SAVE_TARGET_NOT_EMPTY' }
  $activated = Probe 'save'
  if ($activated.target -ne $edited.target) { throw 'EDITOR_TARGET_CHANGED_BEFORE_SAVE' }
  AcceptPicker 'Save with Rapier' $saved
  $rows.savePicker='PASS'

  $step='disk'
  $deadline=(Get-Date).AddSeconds(20)
  do {
    if (Test-Path -LiteralPath $saved -PathType Leaf) {
      $null = & node (Join-Path $PSScriptRoot 'installed-editor.mjs') verify-bytes $original $saved 2>$null
      if ($LASTEXITCODE -eq 0) { $rows.disk='PASS'; break }
    }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $deadline)
  if ($rows.disk -ne 'PASS') { throw 'DISK_WITNESS_FAILED' }

  $step='normalQuit'
  $oldPidIds=@(PackageProcesses | ForEach-Object Id)
  NormalQuit
  $rows.normalQuit='PASS'

  $step='relaunch'
  Start-Process "shell:AppsFolder\$($Package.PackageFamilyName)!$AppId"
  $until=(Get-Date).AddSeconds(35)
  $second=@()
  do {
    $second=@(PackageProcesses)
    if ($second.Count -eq 1 -and $oldPidIds -notcontains $second[0].Id) { break }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $until)
  if ($second.Count -ne 1 -or $oldPidIds -contains $second[0].Id) { throw 'COLD_PACKAGE_PROCESS_NOT_UNIQUE' }
  $rows.relaunch='PASS'

  $step='reopenPicker'
  $reopen=Probe 'reopen' $edited.target
  AcceptPicker 'Open in Rapier' $saved
  $rows.reopenPicker='PASS'

  $step='reopenedText'
  $observed=Probe 'verify' $edited.target
  $rows.reopenedText='PASS'

  $step='finalQuit'
  NormalQuit
  $rows.finalQuit='PASS'
} catch {
  $rows[$step]='FAIL'
  $detail = $_.Exception.Message
  $fixed = @('SETTINGS_CONTROL_NOT_VISIBLE','SETTINGS_DID_NOT_OPEN','OPEN_CONTROL_NOT_VISIBLE','SAVE_AS_CONTROL_NOT_VISIBLE',
    'EDITOR_TARGET_NOT_UNIQUE_OR_TEXT_DIFFERS','COLD_START_ALREADY_HAS_SAVED_TEXT','MULTIPLE_MATCHING_PAGES','EDIT_TEXT_DIFFERS',
    'CDP_COMMAND_TIMEOUT','CDP_COMMAND_REFUSED','CDP_EVAL_FAILED','EDITOR_PROBE_FAILED','NATIVE_PICKER_NOT_FOUND',
    'MULTIPLE_OWNED_PICKERS','NATIVE_CONTROL_AMBIGUOUS','PICKER_FILENAME_HOST_NOT_UNIQUE','PICKER_FILENAME_EDIT_NOT_UNIQUE',
    'PICKER_ACCEPT_CONTROL_MISSING','PICKER_FILENAME_INPUT_DIFFERS','DISK_WITNESS_FAILED','NORMAL_CLOSE_DID_NOT_FINISH')
  $failure = if ($fixed -ccontains $detail) { $detail } else { 'UNCLASSIFIED' }
  Write-Host "Installed journey diagnostic: $step/$failure"
  throw "INSTALLED_RAPIER_JOURNEY_FAILED: $step"
} finally {
  [ordered]@{ schema='rapier-installed-journey/1'; stages=$rows; diagnostic=$failure } | ConvertTo-Json -Depth 3 |
    Set-Content (Join-Path $Out 'installed-journey.json') -Encoding UTF8
  if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
