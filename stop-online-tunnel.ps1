$ErrorActionPreference = "Stop"

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Публичный Cloudflare Tunnel остановлен." -ForegroundColor Green
Write-Host "Docker-контейнер не остановлен. Если нужно остановить сайт полностью: docker compose down"
