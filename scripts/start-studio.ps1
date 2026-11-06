$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Please install Node.js 22.18 or later, then run this launcher again.'
}
if (-not (Test-Path 'node_modules')) {
  npm ci --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
node scripts/start-studio.mjs
exit $LASTEXITCODE
