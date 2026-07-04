$ErrorActionPreference = "Stop"

$port = if ($env:PORT) { $env:PORT } else { "4174" }

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5 | ConvertTo-Json -Depth 4
} catch {
  Write-Host "Сервер не отвечает на http://127.0.0.1:$port/api/health" -ForegroundColor Red
  exit 1
}
