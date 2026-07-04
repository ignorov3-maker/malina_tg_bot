$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Write-Host "Файл .env не найден. Скопируйте .env.example в .env и укажите TELEGRAM_BOT_TOKEN." -ForegroundColor Yellow
  exit 1
}

$env:HOST = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
$env:PORT = if ($env:PORT) { $env:PORT } else { "4174" }

Write-Host "Запускаю проект: http://127.0.0.1:$env:PORT/" -ForegroundColor Green
node server.js
