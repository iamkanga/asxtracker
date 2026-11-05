# ============================================================
# ASX Tracker - Automated Version Bumper
# Increments semantic patch version (+0.0.1) before deployment
# Updates AppConstants.js (sidebar display) and index.html (cache busters)
# ============================================================
param (
    [string]$SetVersion = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$constantsPath = Join-Path $root "modules\utils\AppConstants.js"
$htmlPath = Join-Path $root "index.html"

if (-not (Test-Path $constantsPath)) {
    Write-Error "Could not find AppConstants.js at $constantsPath"
}
if (-not (Test-Path $htmlPath)) {
    Write-Error "Could not find index.html at $htmlPath"
}

# 1. Read current version from AppConstants.js
$constantsContent = [System.IO.File]::ReadAllText($constantsPath)
$oldVersion = $null
if ($constantsContent -match "export\s+const\s+APP_VERSION\s*=\s*['""]([^'""]+)['""]") {
    $oldVersion = $matches[1]
} else {
    Write-Error "Could not parse APP_VERSION from AppConstants.js"
}

# 2. Calculate new version
if ($SetVersion -ne "") {
    $newVersion = $SetVersion
} else {
    $parts = $oldVersion.Split('.')
    if ($parts.Length -eq 3) {
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2] + 1
        $newVersion = "$major.$minor.$patch"
    } elseif ($parts.Length -eq 2) {
        $major = [int]$parts[0]
        $minor = [int]$parts[1] + 1
        $newVersion = "$major.$minor"
    } else {
        $newVersion = "$oldVersion.1"
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# 3. Update AppConstants.js
$updatedConstants = [regex]::Replace($constantsContent, "(export\s+const\s+APP_VERSION\s*=\s*['""])[^'""]+(['""])", "`${1}$newVersion`$2")
[System.IO.File]::WriteAllText($constantsPath, $updatedConstants, $utf8NoBom)

# 4. Update index.html asset cache-busters (?v=...)
$htmlContent = [System.IO.File]::ReadAllText($htmlPath)
$updatedHtml = [regex]::Replace($htmlContent, "(\b(?:href|src)=[""'][^""']+\.(?:css|js|json)\?v=)[^""']*([""'])", "`${1}$newVersion`$2")
[System.IO.File]::WriteAllText($htmlPath, $updatedHtml, $utf8NoBom)

# 5. Output confirmation
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       ASX Tracker Version Bumper         " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Old Version : $oldVersion" -ForegroundColor Yellow
Write-Host "  New Version : $newVersion" -ForegroundColor Green
Write-Host ""
Write-Host "  Updated target files:" -ForegroundColor Gray
Write-Host "    [OK] AppConstants.js (APP_VERSION = '$newVersion' -> Sidebar display)" -ForegroundColor Gray
Write-Host "    [OK] index.html (Asset cache-busters ?v=$newVersion)" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
