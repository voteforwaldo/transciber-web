# Copy API keys from ../transcriber/config/secrets.ini into .env.local (if present).
param(
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$TranscriberRoot = Join-Path (Split-Path $projectRoot -Parent) "transcriber"
$envPath = Join-Path $projectRoot ".env.local"
$iniPath = Join-Path $TranscriberRoot "config\secrets.ini"

if (-not (Test-Path $iniPath)) {
    Write-Host "No transcriber secrets.ini at: $iniPath"
    exit 0
}

function Get-IniValue([string]$section, [string]$key) {
    $inSection = $false
    foreach ($line in Get-Content $iniPath -Encoding UTF8) {
        $t = $line.Trim()
        if ($t -match "^\[$section\]") { $inSection = $true; continue }
        if ($inSection -and $t -match "^\[") { break }
        if ($inSection -and $t -match "^$key\s*=\s*(.*)$") {
            return $matches[1].Trim()
        }
    }
    return ""
}

$speech = Get-IniValue "speechmatics" "api_key"
$gemini = Get-IniValue "gemini" "api_key"

$lines = @()
if (Test-Path $envPath) {
    $lines = Get-Content $envPath -Encoding UTF8
} else {
    $example = Join-Path $projectRoot ".env.example"
    if (Test-Path $example) {
        $lines = Get-Content $example -Encoding UTF8
    }
}

function Set-EnvLine([ref]$arr, [string]$name, [string]$value) {
    if (-not $value) { return }
    $prefix = "$name="
    $found = $false
    for ($i = 0; $i -lt $arr.Value.Count; $i++) {
        if ($arr.Value[$i] -like "$prefix*") {
            $arr.Value[$i] = "$prefix$value"
            $found = $true
            break
        }
    }
    if (-not $found) {
        $arr.Value += "$prefix$value"
    }
}

$ref = [ref]$lines
Set-EnvLine $ref "SPEECHMATICS_API_KEY" $speech
Set-EnvLine $ref "GEMINI_API_KEY" $gemini

$cookieFile = Join-Path $projectRoot "config\youtube-cookies.txt"
if (Test-Path $cookieFile) {
    Set-EnvLine $ref "YTDLP_COOKIES_FILE" "config/youtube-cookies.txt"
}

$lines | Set-Content $envPath -Encoding UTF8
Write-Host "Updated .env.local from transcriber secrets.ini"
