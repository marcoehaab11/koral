#Requires -Version 7.0
[CmdletBinding()]
param(
    [uri]$BaseUrl = 'http://localhost:5068',
    [PSCredential]$Credential,
    [switch]$Development,
    [switch]$IncludePreview,
    [switch]$RefreshBrandAssets
)

$ErrorActionPreference = 'Stop'
if ($Development -and !$BaseUrl.IsLoopback) { throw 'The development account may only be used on loopback.' }
if (!$BaseUrl.IsLoopback -and $BaseUrl.Scheme -ne 'https') { throw 'Use HTTPS for a hosted site.' }
if (!$Credential) {
    if ($Development) {
        $Credential = [PSCredential]::new('ADMIN@ADMIN.COM',(ConvertTo-SecureString 'Admin@123456' -AsPlainText -Force))
    } else {
        $Credential = Get-Credential -Message 'Enter your Studio Super Admin credentials.'
    }
}
if (!$Credential) { throw 'A Super Admin credential is required.' }

$origin = $BaseUrl.AbsoluteUri.TrimEnd('/')
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'content/youssef-el-seddik'
$seed = Get-Content -LiteralPath (Join-Path $root 'catalog.json') -Raw | ConvertFrom-Json -AsHashtable
$assets = @{}
function Read-Api($path) {
    Invoke-RestMethod -Uri "$origin/api/$path" -WebSession $session
}
function Get-Csrf {
    @{ 'X-CSRF-TOKEN' = (Read-Api 'auth/csrf').token }
}
function Write-Api($path,$method,$body) {
    Invoke-RestMethod -Uri "$origin/api/$path" -WebSession $session -Method $method -Headers (Get-Csrf) -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -InputObject $body -Depth 12 -Compress)
}
function Import-Asset($bucket,$filename) {
    $key = "$bucket/$filename"
    if (!$assets.ContainsKey($key)) {
        $file = Get-Item -LiteralPath (Join-Path $root $filename)
        $result = Invoke-RestMethod -Uri "$origin/api/admin/media/$bucket" -WebSession $session -Method Post -Headers (Get-Csrf) -Form @{ file = $file }
        $assets[$key] = $result.url
    }
    $assets[$key]
}
function Set-LinkOrder($links) {
    $index = 0
    foreach ($link in $links) { $link['sort'] = $index; $index++ }
}
function Find-Entry($kind,$row) {
    $term = [uri]::EscapeDataString($row.titleAr)
    (Read-Api "admin/${kind}?q=$term&size=100").items | Where-Object slug -eq $row.slug | Select-Object -First 1
}

$user = Write-Api 'auth/login' 'POST' @{ email = $Credential.UserName; password = $Credential.GetNetworkCredential().Password }
if ($user.mustChangePassword -or 'SuperAdmin' -notin $user.roles) { throw 'Use a Super Admin who has already completed the required password change.' }

$profile = Read-Api 'admin/choir'
$settings = Read-Api 'admin/settings'
$firstImport = $profile.nameEn -ne $seed.profile.nameEn
if ($firstImport -or $RefreshBrandAssets -or !$profile.logo) { $profile.logo = Import-Asset 'choir' 'crest.webp' }
if ($firstImport -or $RefreshBrandAssets -or !$profile.cover) { $profile.cover = Import-Asset 'choir' 'hero.webp' }
if ($firstImport -or $RefreshBrandAssets -or !$settings.favicon) { $settings.favicon = $profile.logo }
Set-LinkOrder $seed.profile.social
foreach ($key in $seed.profile.Keys) { $profile.$key = $seed.profile[$key] }
foreach ($key in $seed.settings.Keys) { $settings.$key = $seed.settings[$key] }
$settings.arabic = $true
$null = Write-Api 'admin/choir' 'PUT' $profile
$null = Write-Api 'admin/settings' 'PUT' $settings

$albumIds = @{}
foreach ($row in $seed.albums) {
    if ($row.preview -and !$IncludePreview) { continue }
    $existing = Find-Entry 'albums' $row
    if (!$existing) {
        $existing = Write-Api 'admin/albums' 'POST' @{
            titleAr = $row.titleAr; titleEn = $row.titleEn; slug = $row.slug
            descriptionAr = $row.descriptionAr; descriptionEn = $row.descriptionEn
            image = (Import-Asset 'albums' $row.artwork); published = $true
            featured = [bool]($row.featured -or $row.preview); sort = $albumIds.Count
        }
        Write-Output "Added album: $($row.titleEn)"
    }
    $albumIds[$row.slug] = $existing.id
}
foreach ($row in $seed.songs) {
    if ($row.preview -and !$IncludePreview) { continue }
    if (Find-Entry 'songs' $row) { continue }
    $audio = if ($row.audio) { Import-Asset 'audio' $row.audio } else { '' }
    $links = if ($row.links) { Set-LinkOrder $row.links; ,@($row.links) } else { ,@() }
    $null = Write-Api 'admin/songs' 'POST' @{
        titleAr = $row.titleAr; titleEn = $row.titleEn; slug = $row.slug
        albumId = $albumIds[$row.album]; image = (Import-Asset 'songs' $row.artwork)
        audio = $audio; date = $row.date; duration = $row.duration
        descriptionAr = $row.descriptionAr; descriptionEn = $row.descriptionEn
        links = $links; sort = [int]$row.sort; published = $true
    }
    Write-Output "Added hymn: $($row.titleEn)"
}

Write-Output 'Choir identity, catalog and platform links are saved.'
