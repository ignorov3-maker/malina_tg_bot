$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Write-Host "Файл .env не найден. Скопируйте .env.example в .env и укажите TELEGRAM_BOT_TOKEN." -ForegroundColor Yellow
  exit 1
}

node server.js
