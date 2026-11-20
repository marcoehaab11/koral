$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path 'frontend/dist/index.html')) { throw 'Build the frontend before testing.' }
$testId = [Guid]::NewGuid().ToString('N')
$testRoot = Join-Path (Get-Location) "artifacts/test/$testId"
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Koral = "Server=localhost;Database=KoralTest_$testId;Integrated Security=true;TrustServerCertificate=true"
$env:Media__Root = Join-Path $testRoot 'media'
$env:Security__KeyPath = Join-Path $testRoot 'keys'
& "$PSScriptRoot/Stage-Frontend.ps1"
dotnet run --project src/Koral.Api --no-launch-profile --urls http://localhost:5066
exit $LASTEXITCODE
