# Export YouTube cookies to config/youtube-cookies.txt for transciber-web.
# Chrome/Edge must be FULLY closed (check Task Manager for chrome.exe / msedge.exe).

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$configDir = Join-Path $projectRoot "config"
$cookieFile = Join-Path $configDir "youtube-cookies.txt"
$envPath = Join-Path $projectRoot ".env.local"

$browser = "chrome"
$kill = $false
foreach ($arg in $args) {
    if ($arg -eq "-KillBrowser" -or $arg -eq "/kill" -or $arg -eq "kill") {
        $kill = $true
        continue
    }
    if ($arg -notmatch "^-") { $browser = $arg }
}

$running = @("chrome", "msedge", "firefox") | Where-Object {
    Get-Process -Name $_ -ErrorAction SilentlyContinue
}
if ($running.Count -gt 0) {
    if ($kill) {
        Write-Host "Stopping browser processes..."
        $running | ForEach-Object { Stop-Process -Name $_ -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
    } else {
        Write-Host "ERROR: These browsers are still running:" -ForegroundColor Red
        $running | ForEach-Object { Write-Host "  - $_" }
        Write-Host ""
        Write-Host "Close them in Task Manager, or re-run with -KillBrowser:" -ForegroundColor Yellow
        Write-Host "  export-cookies.bat kill" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Or skip closing Chrome: use a cookies.txt file (see config/SETUP-COOKIES.txt)" -ForegroundColor Yellow
        exit 1
    }
}

if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: yt-dlp is not on PATH. Install it first." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $configDir | Out-Null
if (Test-Path $cookieFile) { Remove-Item $cookieFile -Force }

Write-Host "Exporting cookies from $browser to $cookieFile ..."
$testUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
$output = @()
try {
    $output = & yt-dlp --cookies-from-browser $browser --cookies $cookieFile --no-download --print title $testUrl 2>&1
    $output | ForEach-Object { Write-Host $_ }
} catch {
    $output = @($_.Exception.Message)
}

$combined = ($output | Out-String).ToLower()
if ($combined -match "dpapi|could not copy|decrypt") {
    Write-Host ""
    Write-Host "Windows blocked reading Chrome cookies (DPAPI). This is normal." -ForegroundColor Yellow
    Write-Host "Use the Chrome extension instead:" -ForegroundColor Green
    Write-Host "  1. Install: Get cookies.txt LOCALLY" -ForegroundColor Green
    Write-Host "  2. Open youtube.com (logged in), export cookies" -ForegroundColor Green
    Write-Host "  3. Save as: $cookieFile" -ForegroundColor Green
    Write-Host "  4. Run check-cookies.bat" -ForegroundColor Green
    Write-Host ""
    notepad (Join-Path $configDir "SETUP-COOKIES.txt")
    exit 1
}

if (-not (Test-Path $cookieFile) -or (Get-Item $cookieFile).Length -lt 50) {
    Write-Host "ERROR: Cookie export failed. Use Option A in config/SETUP-COOKIES.txt" -ForegroundColor Red
    exit 1
}

function Set-EnvLine([ref]$arr, [string]$name, [string]$value) {
    $prefix = "$name="
    $found = $false
    for ($i = 0; $i -lt $arr.Value.Count; $i++) {
        if ($arr.Value[$i] -like "$prefix*") {
            $arr.Value[$i] = "$prefix$value"
            $found = $true
            break
        }
    }
    if (-not $found) { $arr.Value += "$prefix$value" }
}

$lines = @()
if (Test-Path $envPath) { $lines = Get-Content $envPath -Encoding UTF8 }
elseif (Test-Path (Join-Path $projectRoot ".env.example")) {
    $lines = Get-Content (Join-Path $projectRoot ".env.example") -Encoding UTF8
}

$ref = [ref]$lines
Set-EnvLine $ref "YTDLP_COOKIES_FILE" "config/youtube-cookies.txt"
# Browser cookies are unreliable on Windows while Chrome is open — prefer the file.
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^YTDLP_COOKIES_BROWSER=") {
        $lines[$i] = "# $($lines[$i])  # use YTDLP_COOKIES_FILE instead"
    }
}
$lines | Set-Content $envPath -Encoding UTF8

Write-Host ""
Write-Host "Done. Cookies saved. Restart run-local.bat and transcribe again." -ForegroundColor Green
