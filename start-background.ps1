$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Write-Host "Файл .env не найден. Скопируйте .env.example в .env и укажите TELEGRAM_BOT_TOKEN." -ForegroundColor Yellow
  exit 1
}

$existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like '*server.js*' }

foreach ($process in $existing) {
  Stop-Process -Id $process.ProcessId -Force
}

$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:HOST = "127.0.0.1"
if (-not $env:PORT) { $env:PORT = "4174" }

Start-Process `
  -FilePath "node" `
  -ArgumentList @("server.js") `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput (Join-Path $logDir "server.log") `
  -RedirectStandardError (Join-Path $logDir "server-error.log") `
  -WindowStyle Hidden

Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$env:PORT/api/health" -TimeoutSec 5
  Write-Host "Сервер запущен: http://127.0.0.1:$env:PORT/" -ForegroundColor Green
  Write-Host "Статус: botConfigured=$($health.botConfigured), managers=$($health.managers), active=$($health.activeDialogs), queued=$($health.queuedDialogs)"
} catch {
  Write-Host "Сервер запущен, но /api/health пока не ответил. Проверьте logs/server-error.log" -ForegroundColor Yellow
}
