#!/bin/bash
# Prueba el rate limiter enviando múltiples peticiones de login
# El límite es 10 intentos por 15 minutos (loginLimiter)
URL=${1:-http://localhost:3000}
N=${2:-15}

echo "Enviando $N peticiones a POST /api/login"
echo "Rate limit: 10 req / 15 min → a partir de la 11 debe responder 429"
echo "─────────────────────────────────────────────────────────────────────"

for i in $(seq 1 $N); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$URL/api/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"nadie@test.com","password":"wrong"}')

    if [ "$CODE" = "429" ]; then
        echo "  Petición $i → HTTP $CODE  ← RATE LIMIT ACTIVADO"
    else
        echo "  Petición $i → HTTP $CODE"
    fi
done

echo ""
echo "=== Cabeceras de rate limit ==="
curl -si -X POST "$URL/api/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}' \
    | grep -i "ratelimit\|retry-after\|x-ratelimit"
