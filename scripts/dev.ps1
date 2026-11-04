param(
  [ValidateSet('check', 'test', 'watch', 'demo', 'syntax', 'status')]
  [string]$Task = 'check'
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskExitCode = 0

function Find-NodeRuntime {
  $taskCandidates = @()
  $taskInstalled = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
  if ($taskInstalled) { $taskCandidates += $taskInstalled.Source }
  if ($env:USERPROFILE) {
    $taskCandidates += Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  }
  foreach ($taskCandidate in $taskCandidates) {
    if (Test-Path -LiteralPath $taskCandidate -PathType Leaf) {
      $taskVersion = & $taskCandidate --version
      if ($LASTEXITCODE -eq 0 -and $taskVersion -match '^v(\d+)\.') {
        if ([int]$Matches[1] -ge 20) { return $taskCandidate }
      }
    }
  }
  throw 'Node.js 20+ was not found. Install Node.js or run from the Codex environment.'
}

function Invoke-NodeTask {
  param([string[]]$NodeArguments)
  & $script:taskNode @NodeArguments
  if ($LASTEXITCODE -ne 0) { throw "Node task failed with exit code $LASTEXITCODE." }
}

function Test-SourceSyntax {
  $taskSources = Get-ChildItem -LiteralPath (Join-Path $taskRoot 'src'), (Join-Path $taskRoot 'tests'), (Join-Path $taskRoot 'examples') -Filter '*.mjs' -File -Recurse
  foreach ($taskSource in $taskSources) {
    Invoke-NodeTask -NodeArguments @('--check', $taskSource.FullName)
  }
  Write-Output "Syntax checks passed: $($taskSources.Count) files."
}

Push-Location -LiteralPath $taskRoot
try {
  $script:taskNode = Find-NodeRuntime
  Write-Output "Project: $taskRoot"
  Write-Output "Node: $script:taskNode"
  Invoke-NodeTask -NodeArguments @('--version')
  switch ($Task) {
    'status' { Write-Output 'Local development only. No API calls or deployment are performed.' }
    'syntax' { Test-SourceSyntax }
    'test' { Invoke-NodeTask -NodeArguments @('--test') }
    'watch' { Invoke-NodeTask -NodeArguments @('--test', '--watch') }
    'demo' { Invoke-NodeTask -NodeArguments @('examples/demo.mjs') }
    'check' {
      Test-SourceSyntax
      Invoke-NodeTask -NodeArguments @('--test')
      Invoke-NodeTask -NodeArguments @('examples/demo.mjs')
      Write-Output 'Development environment check completed.'
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  $taskExitCode = 1
} finally {
  Pop-Location
}
exit $taskExitCode
