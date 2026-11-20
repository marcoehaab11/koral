$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'frontend/dist'
$target = Join-Path $root 'src/Koral.Api/wwwroot'
if (!(Test-Path (Join-Path $source 'index.html'))) { throw 'Build the frontend first.' }
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
