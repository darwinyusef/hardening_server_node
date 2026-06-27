#!/bin/bash
URL=${1:-http://localhost:3000}

echo "══════════════════════════════════════════"
echo "  DIAGNÓSTICO GRAFANA / PROMETHEUS"
echo "══════════════════════════════════════════"

echo ""
echo "── 1. Contenedores corriendo ──────────────"
docker ps --format "  {{.Names}}  |  {{.Status}}  |  {{.Ports}}"

echo ""
echo "── 2. App responde /metrics (primeras 8 líneas) ─"
curl -s "$URL/metrics" 2>/dev/null | grep -m 8 "^#\|^nodejs\|^http\|^process" \
    || echo "  ERROR: $URL/metrics no responde"

echo ""
echo "── 3. Prometheus llega a app:3000/metrics ────────"
docker exec hardening_prometheus \
    wget -qO- http://app:3000/metrics 2>&1 | grep -m 6 "^#\|^nodejs\|^process\|^http\|Error\|failed" \
    || echo "  ERROR: no se pudo conectar"

echo ""
echo "── 4. Estado del target en Prometheus ────────────"
docker exec hardening_prometheus \
    wget -qO- "http://localhost:9090/api/v1/targets" 2>/dev/null \
    | grep -o '"health":"[^"]*"\|"lastError":"[^"]*"\|"scrapeUrl":"[^"]*"' \
    | tr ',' '\n' \
    || echo "  ERROR: Prometheus no responde en 9090"

echo ""
echo "── 5. ¿Hay datos de heap en Prometheus? ──────────"
docker exec hardening_prometheus \
    wget -qO- "http://localhost:9090/api/v1/query?query=nodejs_heap_size_used_bytes" 2>/dev/null \
    | grep -o '"result":\[\]' && echo "  SIN DATOS — Prometheus no scrapeó aún" \
    || docker exec hardening_prometheus \
        wget -qO- "http://localhost:9090/api/v1/query?query=nodejs_heap_size_used_bytes" 2>/dev/null \
        | grep -o '"value":\[[^]]*\]'

echo ""
echo "── 6. Datasource registrado en Grafana ───────────"
docker exec hardening_grafana \
    wget -qO- "http://admin:admin123@localhost:3000/api/datasources" 2>/dev/null \
    | grep -o '"name":"[^"]*"\|"uid":"[^"]*"\|"url":"[^"]*"' \
    || echo "  ERROR: Grafana no responde"

echo ""
echo "── 7. Logs recientes de Prometheus ───────────────"
docker logs hardening_prometheus 2>&1 | grep -i "error\|warn\|scrape\|target" | tail -8

echo ""
echo "── 8. Logs recientes de App ──────────────────────"
docker logs hardening_simple 2>&1 | tail -6

echo ""
echo "══════════════════════════════════════════"
