# Diagnóstico Grafana / Prometheus — Windows PowerShell
# Uso: .\scripts\diagnose.ps1

$URL = "http://localhost:3000"

Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DIAGNÓSTICO GRAFANA / PROMETHEUS"        -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n── 1. Contenedores corriendo ──────────────" -ForegroundColor Yellow
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

Write-Host "`n── 2. App responde /metrics ───────────────" -ForegroundColor Yellow
try {
    $metrics = Invoke-WebRequest -Uri "$URL/metrics" -UseBasicParsing -ErrorAction Stop
    ($metrics.Content -split "`n" | Select-Object -First 8) -join "`n"
} catch {
    Write-Host "  ERROR: $URL/metrics no responde — $_" -ForegroundColor Red
}

Write-Host "`n── 3. Prometheus llega a app:3000/metrics ─" -ForegroundColor Yellow
docker exec hardening_prometheus wget -qO- http://app:3000/metrics

Write-Host "`n── 4. Estado del target en Prometheus ─────" -ForegroundColor Yellow
docker exec hardening_prometheus wget -qO- "http://localhost:9090/api/v1/targets"

Write-Host "`n── 5. ¿Hay datos de heap en Prometheus? ───" -ForegroundColor Yellow
docker exec hardening_prometheus wget -qO- "http://localhost:9090/api/v1/query?query=nodejs_heap_size_used_bytes"

Write-Host "`n── 6. Datasource registrado en Grafana ────" -ForegroundColor Yellow
docker exec hardening_grafana wget -qO- "http://admin:admin123@localhost:3000/api/datasources"

Write-Host "`n── 7. Logs de Prometheus ──────────────────" -ForegroundColor Yellow
docker logs hardening_prometheus --tail 10

Write-Host "`n── 8. Logs de la App ──────────────────────" -ForegroundColor Yellow
docker logs hardening_simple --tail 8

Write-Host "`n══════════════════════════════════════════" -ForegroundColor Cyan
