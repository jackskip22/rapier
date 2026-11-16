param([Parameter(Mandatory)][ValidateSet('watercolor','converter')][string]$App)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path '.').Path
$runnerDir = Join-Path $env:RUNNER_TEMP ('sealed-' + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $runnerDir 'candidate.tar.gz'
$result = $false
$started = $false
try {
  New-Item -ItemType Directory -Path $runnerDir | Out-Null
  node (Join-Path $workspace 'windows-check/unseal.mjs') $App (Join-Path $workspace 'sealed') $archive
  if ($LASTEXITCODE -ne 0) { throw 'No authenticated archive.' }
  Remove-Item Env:WINDOWS_CANDIDATE_KEY -ErrorAction SilentlyContinue
  & tar.exe -xzf $archive -C $runnerDir *> (Join-Path $runnerDir 'tar.log')
  if ($LASTEXITCODE -ne 0) { throw 'Snapshot extraction failed.' }
  Remove-Item -LiteralPath $archive -Force
  $source = Join-Path $runnerDir 'source'
  $candidate = Join-Path $source 'handover/tools/checks/barry-windows-ci/candidate.ps1'
  if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Test script not found.' }
  Push-Location $source
  try {
    $parameters = @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', ('"' + $candidate + '"'), '-App', $App)
    $proc = Start-Process pwsh -ArgumentList $parameters -PassThru -Wait -RedirectStandardOutput (Join-Path $runnerDir 'stdout.log') -RedirectStandardError (Join-Path $runnerDir 'stderr.log')
    $started = $true
    $result = $proc.ExitCode -eq 0
    $receiptFile = Join-Path $source '.windows-candidate/receipt.json'
    $receipt = if (Test-Path -LiteralPath $receiptFile) { Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json } else { $null }
    $native = if ($receipt.nativeSelfTest -eq 'PASS') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $pack = if ($receipt.package -eq 'PASS unsigned test MSIX') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    $probe = if ($receipt.webviewStartup -eq 'PASS unpackaged WebView2') { 'PASS' } elseif ($result) { 'FAIL' } else { 'UNRUN or failed' }
    if ($native -ne 'PASS' -or $pack -ne 'PASS' -or $probe -ne 'PASS') { $result = $false }
    @(
      "### $App"
      "- Native executable self-test: $native"
      "- Unsigned test MSIX package: $pack"
      "- Unpackaged WebView2 startup: $probe"
      '- Signed install, native picker/Explorer round trip, HDR and physical GPU: UNRUN'
    ) | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
  } finally { Pop-Location }
} catch {
  Write-Host 'Private snapshot or test setup did not complete. Detailed output was not published.'
} finally {
  Remove-Item Env:WINDOWS_CANDIDATE_KEY -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $runnerDir) { Remove-Item -LiteralPath $runnerDir -Recurse -Force -ErrorAction SilentlyContinue }
}
if (!$started -or !$result) { exit 1 }
