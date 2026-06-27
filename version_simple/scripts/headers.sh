#!/bin/bash
# Inspecciona las cabeceras de seguridad HTTP que devuelve el servidor
# Muy útil para verificar helmet: CSP, HSTS, X-Frame-Options, etc.
URL=${1:-http://localhost:3000}

echo "=== Cabeceras de seguridad en $URL/login ==="
echo ""

curl -si "$URL/login" | grep -iE \
    "content-security-policy|x-frame-options|x-content-type|strict-transport|referrer-policy|permissions-policy|x-xss|cache-control"

echo ""
echo "=== Todas las cabeceras (raw) ==="
curl -si "$URL/login" | head -30
