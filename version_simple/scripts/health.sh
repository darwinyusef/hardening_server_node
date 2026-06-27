#!/bin/bash
# Monitorea el health del servidor cada 3 segundos
URL=${1:-http://localhost:3000}

echo "Monitoreando $URL/api/health  (Ctrl+C para salir)"
echo "─────────────────────────────────────────────────"

while true; do
    RESPONSE=$(curl -s -w "\n%{http_code}" "$URL/api/health" 2>/dev/null)
    BODY=$(echo "$RESPONSE" | head -1)
    CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$CODE" = "200" ]; then
        echo "[$(date '+%H:%M:%S')]  OK $CODE  — $BODY"
    else
        echo "[$(date '+%H:%M:%S')]  FALLO $CODE"
    fi
    sleep 3
done
