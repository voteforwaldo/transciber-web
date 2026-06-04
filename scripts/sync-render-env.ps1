# Copy .env.local secrets into Render via API (after you add RENDER_API_KEY to .env.local).
# Get key: https://dashboard.render.com/u/settings#api-keys

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Read-DotEnv($key) {
    $path = Join-Path $Root ".env.local"
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*$key\s*=\s*(.+)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) { $apiKey = Read-DotEnv "RENDER_API_KEY" }
if (-not $apiKey) {
    Write-Host "Add RENDER_API_KEY to .env.local (from Render dashboard API keys)"
    exit 1
}

$headers = @{
    Authorization = "Bearer $apiKey"
    Accept        = "application/json"
}

$services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=20" -Headers $headers
$svc = $services | ForEach-Object { $_.service } | Where-Object { $_.name -eq "transciber-web" } | Select-Object -First 1
if (-not $svc) {
    Write-Host "Service transciber-web not found. Deploy from:"
    Write-Host "https://render.com/deploy?repo=https://github.com/voteforwaldo/transciber-web"
    exit 1
}

$serviceId = $svc.id
Write-Host "Service:" $svc.name $svc.serviceDetails.url

$cookies = Get-Content (Join-Path $Root "config\youtube-cookies.txt") -Raw
$vars = @{
    SPEECHMATICS_API_KEY = Read-DotEnv "SPEECHMATICS_API_KEY"
    GEMINI_API_KEY       = Read-DotEnv "GEMINI_API_KEY"
    YTDLP_COOKIES        = $cookies
    NODE_ENV             = "production"
}

foreach ($entry in $vars.GetEnumerator()) {
    if (-not $entry.Value) { continue }
    Write-Host "Setting $($entry.Key)..."
    $body = @{ envVarKey = $entry.Key; value = $entry.Value } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars" `
        -Method POST -Headers $headers -Body $body -ContentType "application/json" | Out-Null
}

Write-Host "Triggering deploy..."
Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/deploys" `
    -Method POST -Headers $headers -Body "{}" -ContentType "application/json" | Out-Null

Write-Host "Done. URL:" $svc.serviceDetails.url
Write-Host "Then run: powershell -File scripts/finish-render-setup.ps1 -RenderUrl `"$($svc.serviceDetails.url)`""
