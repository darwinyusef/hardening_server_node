# Genera tráfico variado para poblar los paneles de Grafana — Windows PowerShell
# Uso: .\scripts\traffic.ps1

$URL    = "http://localhost:3000"
$RONDAS = 5
$headers = @{ "Content-Type" = "application/json" }

Write-Host "Generando tráfico en $URL ($RONDAS rondas)..." -ForegroundColor Cyan

# Login admin y obtener token
$body  = '{"email":"admin@test.com","password":"Admin1234!"}'
$resp  = Invoke-WebRequest -Uri "$URL/api/login" -Method POST -Body $body -Headers $headers -UseBasicParsing
$token = ($resp.Content | ConvertFrom-Json).token

if (-not $token) {
    Write-Host "No se obtuvo token — ¿está corriendo el servidor?" -ForegroundColor Red
    exit 1
}
Write-Host "Token OK" -ForegroundColor Green

$authHeaders = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }

for ($i = 1; $i -le $RONDAS; $i++) {
    Write-Host "`n── Ronda $i/$RONDAS ──" -ForegroundColor Yellow

    # Health
    Invoke-WebRequest -Uri "$URL/api/health"    -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  GET /api/health          OK"

    # Métricas
    Invoke-WebRequest -Uri "$URL/metrics"       -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  GET /metrics             OK"

    # Login correcto
    Invoke-WebRequest -Uri "$URL/api/login" -Method POST -Body '{"email":"vendedor@test.com","password":"Vendedor1234!"}' -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  POST /api/login (ok)     OK"

    # Login incorrecto (401)
    Invoke-WebRequest -Uri "$URL/api/login" -Method POST -Body '{"email":"x@x.com","password":"wrong"}' -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  POST /api/login (fail)   401"

    # Ruta inexistente (404)
    Invoke-WebRequest -Uri "$URL/api/noexiste"  -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  GET /api/noexiste        404"

    # Productos
    Invoke-WebRequest -Uri "$URL/api/productos" -Headers $authHeaders -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  GET /api/productos       OK"

    # Usuarios
    Invoke-WebRequest -Uri "$URL/api/usuarios"  -Headers $authHeaders -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  GET /api/usuarios        OK"

    Start-Sleep -Seconds 1
}

Write-Host "`nTráfico generado. Abre Grafana en http://localhost:3001" -ForegroundColor Green
Write-Host "Dashboard: Node.js — Hardening Simple"
Write-Host "Rango de tiempo recomendado: Last 5 minutes"
