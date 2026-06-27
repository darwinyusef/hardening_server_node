#!/bin/bash
URL=${1:-http://localhost:3000}

echo "══════════════════════════════════════════"
echo "  DIAGNÓSTICO GRAFANA / PROMETHEUS"
echo "══════════════════════════════════════════"

echo ""
echo "── 1. Contenedores corriendo ──────────────"
docker ps --format "  {{.Names}}  {{.Status}}  {{.Ports}}"

echo ""
echo "── 2. App responde /metrics ───────────────"
curl -s "$URL/metrics" | head -6 || echo "  ERROR: no responde"

echo ""
echo "── 3. Prometheus llega a app:3000/metrics ─"
docker exec hardening_prometheus \
    wget -qO- http://app:3000/metrics 2>&1 | head -6 \
    || echo "  ERROR: wget falló"

echo ""
echo "── 4. Targets en Prometheus ───────────────"
docker exec hardening_prometheus \
    wget -qO- 'http://localhost:9090/api/v1/targets' 2>/dev/null \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d['data']['activeTargets']:
    print('  health:', t['health'])
    print('  url:   ', t['scrapeUrl'])
    print('  error: ', t.get('lastError','(ninguno)'))
" || echo "  ERROR: Prometheus no responde"

echo ""
echo "── 5. ¿Hay datos en Prometheus? ───────────"
docker exec hardening_prometheus \
    wget -qO- 'http://localhost:9090/api/v1/query?query=nodejs_heap_size_used_bytes' 2>/dev/null \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d['data']['result']
print('  Resultados:', len(r))
if r: print('  Valor:', r[0]['value'])
else: print('  SIN DATOS — Prometheus no está scrapeando')
" || echo "  ERROR: Prometheus no responde"

echo ""
echo "── 6. Datasource en Grafana ───────────────"
docker exec hardening_grafana \
    wget -qO- 'http://admin:admin123@localhost:3000/api/datasources' 2>/dev/null \
    | python3 -c "
import sys, json
ds = json.load(sys.stdin)
for d in ds:
    print('  nombre:', d.get('name'))
    print('  uid:   ', d.get('uid'))
    print('  url:   ', d.get('url'))
" || echo "  ERROR: Grafana no responde"

echo ""
echo "══════════════════════════════════════════"
