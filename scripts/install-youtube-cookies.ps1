# Copy exported cookies into config/youtube-cookies.txt
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $projectRoot "config\youtube-cookies.txt"
$configDir = Join-Path $projectRoot "config"
$downloads = Join-Path $env:USERPROFILE "Downloads"

New-Item -ItemType Directory -Force -Path $configDir | Out-Null

function Test-CookieFile([string]$path) {
    if (-not (Test-Path $path)) { return $false }
    $content = Get-Content $path -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content -or $content.Length -lt 100) { return $false }
    return ($content -match "# Netscape HTTP Cookie File" -or $content -match "\.youtube\.com")
}

function Install-FromPath([string]$src) {
    Copy-Item -Path $src -Destination $dest -Force
    Write-Host "Installed: $dest" -ForegroundColor Green
    Write-Host "Size: $((Get-Item $dest).Length) bytes"
}

# 1) Already in config?
if (Test-CookieFile $dest) {
    Write-Host "OK: youtube-cookies.txt already exists." -ForegroundColor Green
    exit 0
}

# 2) File path argument
if ($args.Count -gt 0 -and (Test-Path $args[0])) {
    if (Test-CookieFile $args[0]) { Install-FromPath $args[0]; exit 0 }
    Write-Host "That file does not look like a cookies export." -ForegroundColor Red
    exit 1
}

# 3) Search Downloads for recent cookie exports
$candidates = @()
if (Test-Path $downloads) {
    $candidates = Get-ChildItem $downloads -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.LastWriteTime -gt (Get-Date).AddDays(-14) -and (
                $_.Name -match "cookie|youtube" -or
                ($_.Extension -eq ".txt" -and $_.Length -gt 200)
            )
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 15
}

Write-Host ""
Write-Host "Export cookies first (Chrome extension: Get cookies.txt LOCALLY)"
Write-Host "  -> open youtube.com -> export -> file lands in Downloads"
Write-Host ""
Write-Host "Destination: $dest"
Write-Host ""

if ($candidates.Count -eq 0) {
    Write-Host "No cookie files found in Downloads." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Drag your exported file into this window, or enter full path:"
    $manual = Read-Host "Path"
    if ($manual -and (Test-Path $manual.Trim('"')))) {
        Install-FromPath ($manual.Trim('"'))
        exit 0
    }
    notepad (Join-Path $configDir "SETUP-COOKIES.txt")
    exit 1
}

Write-Host "Found in Downloads:"
for ($i = 0; $i -lt $candidates.Count; $i++) {
    $f = $candidates[$i]
    Write-Host ("  [{0}] {1}  ({2} bytes, {3})" -f ($i + 1), $f.Name, $f.Length, $f.LastWriteTime.ToString("g"))
}
Write-Host "  [0] Enter path manually"
Write-Host ""

$pick = Read-Host "Pick number (1 = newest)"
if ($pick -eq "0" -or $pick -eq "") {
    $manual = Read-Host "Full path to cookies file"
    if (-not $manual) { exit 1 }
    Install-FromPath ($manual.Trim('"'))
    exit 0
}

$idx = [int]$pick - 1
if ($idx -lt 0 -or $idx -ge $candidates.Count) {
    Write-Host "Invalid choice." -ForegroundColor Red
    exit 1
}

Install-FromPath $candidates[$idx].FullName
