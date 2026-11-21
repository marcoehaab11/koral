#Requires -Version 7.0
[CmdletBinding()]
param(
    [uri]$BaseUrl = 'http://localhost:5068',
    [Parameter(Mandatory)] [PSCredential]$Credential
)

$ErrorActionPreference = 'Stop'
if (!$BaseUrl.IsLoopback -and $BaseUrl.Scheme -ne 'https') { throw 'Use HTTPS for a hosted site.' }

$origin = $BaseUrl.GetLeftPart([UriPartial]::Authority)
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'content/youssef-el-seddik/photos'
$photos = Get-Content -LiteralPath (Join-Path $root 'sources.json') -Raw -Encoding utf8 | ConvertFrom-Json

function Read-Api($path) {
    Invoke-RestMethod -Uri "$origin/api/$path" -WebSession $session
}
function Get-Csrf {
    @{ 'X-CSRF-TOKEN' = (Read-Api 'auth/csrf').token }
}
function Write-Api($path, $method, $body) {
    Invoke-RestMethod -Uri "$origin/api/$path" -WebSession $session -Method $method -Headers (Get-Csrf) -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -InputObject $body -Depth 12 -Compress)
}
function Import-Asset($bucket, $name) {
    $file = Get-Item -LiteralPath (Join-Path $root $name)
    $result = Invoke-RestMethod -Uri "$origin/api/admin/media/$bucket" -WebSession $session -Method Post -Headers (Get-Csrf) -Form @{ file = $file }
    $result.url
}

$user = Write-Api 'auth/login' 'POST' @{ email = $Credential.UserName; password = $Credential.GetNetworkCredential().Password }
if ($user.mustChangePassword -or 'SuperAdmin' -notin $user.roles) { throw 'A ready Super Admin account is required.' }

$profile = Read-Api 'admin/choir'
if (!$profile.PSObject.Properties['coverMobile'] -or !$profile.PSObject.Properties['aboutImage']) {
    throw 'Publish the release supporting the new photo fields first.'
}
if (!$profile.coverMobile) {
    $banner = Import-Asset 'choir' $photos.cover.file
    $profile.cover = $banner
    $profile.coverMobile = if ($photos.cover.mobile -eq $photos.cover.file) { $profile.cover } else {
        Import-Asset 'choir' $photos.cover.mobile
    }
}
if (!$profile.aboutImage) {
    $profile.aboutImage = if ($banner -and $photos.about.file -eq $photos.cover.file) {
        $banner
    } else { Import-Asset 'choir' $photos.about.file }
    $profile.aboutImageAltEn = $photos.about.altEn
    $profile.aboutImageAltAr = $photos.about.altAr
}
$null = Write-Api 'admin/choir' 'PUT' $profile

$sort = 0
foreach ($photo in $photos.gallery) {
    $term = [uri]::EscapeDataString($photo.titleEn)
    $existing = (Read-Api "admin/gallery?q=$term&size=100").items | Where-Object titleEn -eq $photo.titleEn | Select-Object -First 1
    if (!$existing) {
        $null = Write-Api 'admin/gallery' 'POST' @{
            titleEn = $photo.titleEn; titleAr = $photo.titleAr
            captionEn = $photo.captionEn; captionAr = $photo.captionAr
            image = (Import-Asset 'gallery' $photo.file)
            published = $true; featured = $true; sort = $sort
        }
    }
    $sort++
}

$settings = Read-Api 'admin/settings'
if (!$settings.homeGallery) {
    $settings.homeGallery = $true
    $null = Write-Api 'admin/settings' 'PUT' $settings
}
'Choir banner, About image, and gallery are published.'
