#!/bin/bash
# Prueba login y consulta la API con el token obtenido
URL=${1:-http://localhost:3000}
EMAIL=${2:-admin@test.com}
PASS=${3:-Admin1234!}

echo "=== LOGIN ==="
echo "Usuario: $EMAIL"

RESP=$(curl -s -X POST "$URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "No se obtuvo token — revisa credenciales"
    exit 1
fi

echo ""
echo "=== GET /api/me ==="
curl -s "$URL/api/me" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== GET /api/productos ==="
curl -s "$URL/api/productos" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Solo si es admin
ROL=$(echo "$RESP" | grep -o '"rol":"[^"]*"' | cut -d'"' -f4)
if [ "$ROL" = "admin" ]; then
    echo ""
    echo "=== GET /api/usuarios (admin) ==="
    curl -s "$URL/api/usuarios" \
        -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
fi
