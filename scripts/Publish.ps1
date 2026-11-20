$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd --prefix frontend ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd --prefix frontend run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$PSScriptRoot/Stage-Frontend.ps1"
dotnet publish src/Koral.Api -c Release -o artifacts/publish
exit $LASTEXITCODE
