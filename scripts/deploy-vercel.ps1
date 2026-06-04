# One-shot deploy: env vars + production deploy to Vercel.
# Requires: Node.js, logged-in Vercel CLI (run once: npx vercel login)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/deploy-vercel.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Read-DotEnv($path, $key) {
    if (-not (Test-Path $path)) { return $null }
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*#") { continue }
        if ($line -match "^\s*$key\s*=\s*(.+)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$envLocal = Join-Path $Root ".env.local"
$speechmatics = Read-DotEnv $envLocal "SPEECHMATICS_API_KEY"
$gemini = Read-DotEnv $envLocal "GEMINI_API_KEY"
$geminiModel = Read-DotEnv $envLocal "GEMINI_MODEL"
$vercelToken = $env:VERCEL_TOKEN
if (-not $vercelToken) { $vercelToken = Read-DotEnv $envLocal "VERCEL_TOKEN" }

$cookiesPath = Join-Path $Root "config\youtube-cookies.txt"
if (-not (Test-Path $cookiesPath)) {
    $cookiesPath = Join-Path $Root "..\transcriber\cookies.txt"
}
if (-not (Test-Path $cookiesPath)) {
    throw "YouTube cookies not found. Run install-cookies.bat or copy transcriber/cookies.txt to config/youtube-cookies.txt"
}
$cookies = Get-Content $cookiesPath -Raw

$VercelBin = "C:\Users\oprik\AppData\Local\npm-cache\_npx\69f9afb961c37556\node_modules\.bin\vercel.cmd"
if (-not (Test-Path $VercelBin)) {
    $VercelBin = "vercel"
}

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
$tokenArg = @()
if ($vercelToken) {
    $tokenArg = @("--token", $vercelToken)
    Write-Host "Using VERCEL_TOKEN from environment."
} else {
    Write-Host "Checking Vercel CLI login..."
    & $VercelBin @tokenArg whoami
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Not logged in. Either:"
        Write-Host "  1. Add VERCEL_TOKEN to .env.local (https://vercel.com/account/tokens), then re-run"
        Write-Host "  2. Run:  `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; & '$VercelBin' login"
        exit 1
    }
}

Write-Host "Linking project (if needed)..."
& $VercelBin @tokenArg link --yes 2>$null

function Set-VercelEnv($name, $value, $envName) {
    if (-not $value) { return }
    Write-Host "Setting $name ($envName)..."
    $value | & $VercelBin @tokenArg env add $name $envName --force 2>$null
    if ($LASTEXITCODE -ne 0) {
        $value | & $VercelBin @tokenArg env add $name $envName
    }
}

foreach ($target in @("production", "preview", "development")) {
    Set-VercelEnv "SPEECHMATICS_API_KEY" $speechmatics $target
    Set-VercelEnv "GEMINI_API_KEY" $gemini $target
    if ($geminiModel) { Set-VercelEnv "GEMINI_MODEL" $geminiModel $target }
    Set-VercelEnv "YTDLP_COOKIES" $cookies $target
}

Write-Host "Deploying to production..."
& $VercelBin @tokenArg deploy --prod --yes
Write-Host "Done."
