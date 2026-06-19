#!/bin/bash
# =============================================================
# migrate.sh — Inicialización y migración de base de datos
# =============================================================
# Uso manual (fuera de Docker):
#   PGHOST=localhost PGPORT=5432 \
#   PGUSER=postgres PGPASSWORD=<superuser_pass> \
#   PGDATABASE=registro_usuarios \
#   DB_PASSWORD=<app_user_pass> \
#   SCHEMA_FILE=./database.sql \
#   bash scripts/migrate.sh
#
# En Docker: se monta en /docker-entrypoint-initdb.d/ y se
# ejecuta automáticamente la PRIMERA vez que arranca el
# contenedor (cuando el volumen postgres_data está vacío).
# =============================================================

set -euo pipefail

# ── Variables de conexión ────────────────────────────────────
PGHOST="${PGHOST:-}"  # vacío = Unix socket (Docker initdb.d); poner hostname para remoto
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-registro_usuarios}}"

# ── Usuario de aplicación ────────────────────────────────────
APP_USER="app_user"
APP_USER_PASSWORD="${DB_PASSWORD:-Cefit@App2024}"

# ── Ruta al esquema SQL ──────────────────────────────────────
# En Docker se monta como /tmp/schema.sql (ver docker-compose.yml)
SCHEMA_FILE="${SCHEMA_FILE:-/app/database.sql}"

# ── Colores para logs ────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[migrate]${NC} $1"; }
warn()  { echo -e "${YELLOW}[migrate]${NC} $1"; }
error() { echo -e "${RED}[migrate] ERROR:${NC} $1" >&2; }

# ── Esperar a que PostgreSQL esté listo ──────────────────────
log "Esperando PostgreSQL en ${PGHOST}:${PGPORT} / BD: ${PGDATABASE}..."
MAX_RETRIES=30
RETRIES=0
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    error "PostgreSQL no responde después de ${MAX_RETRIES} intentos. Abortando."
    exit 1
  fi
  warn "No disponible... reintento ${RETRIES}/${MAX_RETRIES}"
  sleep 2
done
log "PostgreSQL disponible."

# ── 1. Crear usuario de aplicación con mínimo privilegio ─────
log "Verificando usuario de aplicación '${APP_USER}'..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_USER}'
  ) THEN
    CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${APP_USER_PASSWORD}';
    RAISE NOTICE 'Usuario ${APP_USER} creado correctamente.';
  ELSE
    ALTER ROLE ${APP_USER} WITH PASSWORD '${APP_USER_PASSWORD}';
    RAISE NOTICE 'Usuario ${APP_USER} ya existe. Contraseña sincronizada.';
  END IF;
END
\$\$;
SQL

# GRANT CONNECT se hace aquí con nombre de BD dinámico
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  -c "GRANT CONNECT ON DATABASE \"${PGDATABASE}\" TO ${APP_USER};"

log "Usuario '${APP_USER}' listo con acceso a '${PGDATABASE}'."

# ── 2. Aplicar esquema SQL ────────────────────────────────────
if [ ! -f "$SCHEMA_FILE" ]; then
  error "Archivo de esquema no encontrado: ${SCHEMA_FILE}"
  exit 1
fi

log "Aplicando esquema desde: ${SCHEMA_FILE}"
psql -h "$PGHOST" \
     -p "$PGPORT" \
     -U "$PGUSER" \
     -d "$PGDATABASE" \
     -v ON_ERROR_STOP=1 \
     -f "$SCHEMA_FILE"

log "Esquema aplicado. Tablas, índices, datos iniciales y GRANTs listos."
log "Migración completada exitosamente."
