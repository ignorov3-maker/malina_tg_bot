$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$toolsDir = Join-Path $PSScriptRoot ".tools"
$logsDir = Join-Path $PSScriptRoot "logs"
$cloudflared = Join-Path $toolsDir "cloudflared.exe"
$logFile = Join-Path $logsDir "cloudflared.log"
$errorFile = Join-Path $logsDir "cloudflared-error.log"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if (-not (Test-Path $cloudflared)) {
  Write-Host "Скачиваю cloudflared..." -ForegroundColor Yellow
  Invoke-WebRequest `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $cloudflared
}

docker compose up -d --build | Out-Host

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

Remove-Item $logFile, $errorFile -Force -ErrorAction SilentlyContinue

Start-Process `
  -FilePath $cloudflared `
  -ArgumentList @("tunnel", "--url", "http://127.0.0.1:4174", "--no-autoupdate", "--protocol", "quic") `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errorFile `
  -WindowStyle Hidden

Write-Host "Жду публичную ссылку Cloudflare Tunnel..." -ForegroundColor Yellow

$url = ""
for ($i = 1; $i -le 40; $i++) {
  Start-Sleep -Seconds 1
  $text = ""
  if (Test-Path $logFile) { $text += Get-Content $logFile -Raw -ErrorAction SilentlyContinue }
  if (Test-Path $errorFile) { $text += Get-Content $errorFile -Raw -ErrorAction SilentlyContinue }

  $match = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($match.Success) {
    $url = $match.Value
    break
  }
}

if (-not $url) {
  Write-Host "Не удалось получить публичную ссылку. Проверьте logs/cloudflared-error.log" -ForegroundColor Red
  exit 1
}

Write-Host "Сайт онлайн:" -ForegroundColor Green
Write-Host $url
Write-Host "API health: $url/api/health"
