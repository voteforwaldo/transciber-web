# After Render deploy: set Vercel TRANSCRIBE_SERVICE_URL and sync env to Render.
# Usage: powershell -File scripts/finish-render-setup.ps1 -RenderUrl "https://transciber-web.onrender.com"

param(
    [Parameter(Mandatory = $true)]
    [string]$RenderUrl
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Read-DotEnv($key) {
    $path = Join-Path $Root ".env.local"
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*$key\s*=\s*(.+)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$RenderUrl = $RenderUrl.Trim().TrimEnd("/")
$vercelToken = $env:VERCEL_TOKEN
if (-not $vercelToken) { $vercelToken = Read-DotEnv "VERCEL_TOKEN" }

# Save for future deploys
$envPath = Join-Path $Root ".env.local"
$lines = Get-Content $envPath -ErrorAction SilentlyContinue
$filtered = $lines | Where-Object { $_ -notmatch "^\s*TRANSCRIBE_SERVICE_URL\s*=" }
$filtered += "TRANSCRIBE_SERVICE_URL=$RenderUrl"
Set-Content $envPath ($filtered -join "`n") -Encoding utf8

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
$vb = "C:\Users\oprik\AppData\Local\npm-cache\_npx\69f9afb961c37556\node_modules\.bin\vercel.cmd"
if (-not (Test-Path $vb)) { $vb = "vercel" }

Write-Host "Setting TRANSCRIBE_SERVICE_URL on Vercel..."
$RenderUrl | & $vb --token $vercelToken env add TRANSCRIBE_SERVICE_URL production --force --scope svilen-s-projects 2>&1
$RenderUrl | & $vb --token $vercelToken env add TRANSCRIBE_SERVICE_URL preview --force --scope svilen-s-projects 2>&1

Write-Host "Redeploying Vercel..."
& $vb --token $vercelToken deploy --prod --yes --scope svilen-s-projects 2>&1 | Select-Object -Last 6

Write-Host ""
Write-Host "Online setup complete:" -ForegroundColor Green
Write-Host "  Full YouTube: $RenderUrl"
Write-Host "  Vercel UI:    https://transciber-web.vercel.app (forwards YouTube to Render)"
