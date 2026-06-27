#!/bin/bash
# Muestra logs del contenedor en tiempo real
# Uso: ./watch.sh [nombre_contenedor]
CONTAINER=${1:-hardening_simple}

echo "Siguiendo logs de '$CONTAINER'  (Ctrl+C para salir)"
echo "Para ver todos los contenedores: docker ps"
echo "─────────────────────────────────────────────────"

docker logs -f "$CONTAINER" 2>&1
