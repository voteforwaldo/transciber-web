# Full online setup: GitHub push, Render env vars, Vercel TRANSCRIBE_SERVICE_URL
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-online.ps1
# Optional: $env:RENDER_API_KEY = "rnd_..." from https://dashboard.render.com/u/settings#api-keys

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Read-DotEnv($key) {
    $path = Join-Path $Root ".env.local"
    if (-not (Test-Path $path)) { return $null }
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*#") { continue }
        if ($line -match "^\s*$key\s*=\s*(.+)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$speechmatics = Read-DotEnv "SPEECHMATICS_API_KEY"
$gemini = Read-DotEnv "GEMINI_API_KEY"
$vercelToken = $env:VERCEL_TOKEN
if (-not $vercelToken) { $vercelToken = Read-DotEnv "VERCEL_TOKEN" }
$renderKey = $env:RENDER_API_KEY
if (-not $renderKey) { $renderKey = Read-DotEnv "RENDER_API_KEY" }

$cookiesPath = Join-Path $Root "config\youtube-cookies.txt"
if (-not (Test-Path $cookiesPath)) {
    $alt = Join-Path $Root "..\transcriber\cookies.txt"
    if (Test-Path $alt) { Copy-Item $alt $cookiesPath -Force }
}
$cookies = Get-Content $cookiesPath -Raw

Write-Host "=== 1. Git commit ===" -ForegroundColor Cyan
git add -A
git status --short
if (git status --porcelain) {
    git commit -m "Online setup: Invidious captions, Render Docker, Vercel proxy."
}

Write-Host "`n=== 2. GitHub push ===" -ForegroundColor Cyan
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    $remote = git remote get-url origin 2>$null
    if (-not $remote) {
        gh repo create transciber-web --public --source=. --remote=origin --push
    } else {
        git push -u origin master 2>&1
        if ($LASTEXITCODE -ne 0) { git push -u origin main 2>&1 }
    }
} else {
    Write-Host "Install GitHub CLI: winget install GitHub.cli"
    Write-Host "Then: gh auth login && gh repo create transciber-web --public --source=. --push"
}

if ($renderKey) {
    Write-Host "`n=== 3. Render (API) ===" -ForegroundColor Cyan
    Write-Host "Create Blueprint at Render dashboard linked to your GitHub repo, or use Render CLI."
} else {
    Write-Host "`n=== 3. Render (manual) ===" -ForegroundColor Cyan
    Write-Host "1. https://dashboard.render.com/select-repo?type=blueprint"
    Write-Host "2. Connect GitHub repo transciber-web"
    Write-Host "3. Set SPEECHMATICS_API_KEY, GEMINI_API_KEY, YTDLP_COOKIES when prompted"
    Write-Host "4. After deploy, copy URL (e.g. https://transciber-web.onrender.com)"
}

$renderUrl = Read-DotEnv "TRANSCRIBE_SERVICE_URL"
if (-not $renderUrl) {
    $renderUrl = Read-Host "Paste your Render app URL (or Enter to skip Vercel link)"
}

if ($renderUrl -and $vercelToken) {
    Write-Host "`n=== 4. Vercel TRANSCRIBE_SERVICE_URL ===" -ForegroundColor Cyan
    $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
    $vb = "C:\Users\oprik\AppData\Local\npm-cache\_npx\69f9afb961c37556\node_modules\.bin\vercel.cmd"
    if (-not (Test-Path $vb)) { $vb = "vercel" }
    $renderUrl.Trim().TrimEnd("/") | & $vb --token $vercelToken env add TRANSCRIBE_SERVICE_URL production --force --scope svilen-s-projects 2>&1
    & $vb --token $vercelToken deploy --prod --yes --scope svilen-s-projects 2>&1 | Select-Object -Last 5
    Write-Host "Vercel will forward YouTube links to: $renderUrl"
}

Write-Host "`nDone. Render URL = full YouTube. Vercel URL = UI + proxy when TRANSCRIBE_SERVICE_URL is set." -ForegroundColor Green
