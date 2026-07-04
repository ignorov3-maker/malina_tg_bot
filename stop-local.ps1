$ErrorActionPreference = "Stop"

$existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like '*server.js*' }

if (-not $existing) {
  Write-Host "Локальный сервер не запущен." -ForegroundColor Yellow
  exit 0
}

foreach ($process in $existing) {
  Stop-Process -Id $process.ProcessId -Force
}

Write-Host "Локальный сервер остановлен." -ForegroundColor Green
