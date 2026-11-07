param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$portalNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($portalNode) {
    $portalMajor = [int]((& $portalNode -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
} else { $portalMajor = 0 }
if ($portalMajor -lt 24) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $portalNode = $bundledNode }
    else { throw 'Install Node.js 24.13 or newer, then run this script again.' }
}
$env:PORT = [string]$Port
Write-Host "Open http://127.0.0.1:$Port in your browser. Keep this terminal open."
& $portalNode server.cjs
