#!/bin/bash
# Genera tráfico variado para poblar los paneles de Grafana
# Uso: ./scripts/traffic.sh [url] [rondas]
URL=${1:-http://localhost:3000}
RONDAS=${2:-5}

echo "Generando tráfico en $URL ($RONDAS rondas)..."
echo "─────────────────────────────────────────────"

# Login y obtener token de admin
TOKEN=$(curl -s -X POST "$URL/api/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@test.com","password":"Admin1234!"}' \
    | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "No se pudo obtener token — ¿está corriendo el servidor?"
    exit 1
fi
echo "Token obtenido OK"

for i in $(seq 1 $RONDAS); do
    echo ""
    echo "── Ronda $i/$RONDAS ──"

    # Health check
    curl -s "$URL/api/health" > /dev/null
    echo "  GET /api/health           OK"

    # Métricas
    curl -s "$URL/metrics" > /dev/null
    echo "  GET /metrics              OK"

    # Login correcto
    curl -s -X POST "$URL/api/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"vendedor@test.com","password":"Vendedor1234!"}' > /dev/null
    echo "  POST /api/login (ok)      OK"

    # Login incorrecto (genera 401)
    curl -s -X POST "$URL/api/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"x@x.com","password":"wrong"}' > /dev/null
    echo "  POST /api/login (fail)    401"

    # Ruta que no existe (genera 404)
    curl -s "$URL/api/noexiste" > /dev/null
    echo "  GET /api/noexiste         404"

    # Productos autenticado
    curl -s "$URL/api/productos" \
        -H "Authorization: Bearer $TOKEN" > /dev/null
    echo "  GET /api/productos        OK"

    # Usuarios (admin)
    curl -s "$URL/api/usuarios" \
        -H "Authorization: Bearer $TOKEN" > /dev/null
    echo "  GET /api/usuarios         OK"

    sleep 1
done

echo ""
echo "Tráfico generado. Abre Grafana en http://localhost:3001"
echo "Dashboard: Node.js — Hardening Simple"
echo "Rango de tiempo: Last 5 minutes"
