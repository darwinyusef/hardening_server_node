#!/bin/bash
# =============================================================
# migrate.sh — Inicialización de la base de datos CEFIT
# =============================================================
# Conecta por TCP al contenedor cefit_db (o a cualquier host
# PostgreSQL) y aplica el esquema + datos iniciales.
#
# Uso dentro del stack docker-compose.db.yml (recomendado):
#   docker compose -f docker-compose.db.yml --profile init up --abort-on-container-exit db-init
#
# Uso manual desde la máquina host:
#   PGPASSWORD=<superuser_pass> DB_PASSWORD=<app_pass> bash scripts/migrate.sh
#
# Variables de entorno configurables:
#   PGHOST       host o IP (default: 127.0.0.1)
#   PGPORT       puerto    (default: 5432)
#   PGUSER       superusuario (default: postgres)
#   PGPASSWORD   contraseña del superusuario (obligatorio)
#   PGDATABASE   nombre de la BD (default: registro_usuarios)
#   DB_PASSWORD  contraseña del usuario app_user (obligatorio)
#   SCHEMA_FILE  ruta al SQL (default: ./database.sql)
# =============================================================

set -euo pipefail

# ── Conexión ─────────────────────────────────────────────────
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:?Variable PGPASSWORD requerida}"
PGDATABASE="${PGDATABASE:-registro_usuarios}"

# ── Usuario de aplicación ────────────────────────────────────
APP_USER="app_user"
APP_USER_PASSWORD="${DB_PASSWORD:?Variable DB_PASSWORD requerida}"

# ── Esquema SQL ──────────────────────────────────────────────
SCHEMA_FILE="${SCHEMA_FILE:-./database.sql}"

# ── Colores ──────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
log()   { echo -e "${GREEN}[migrate]${NC} $1"; }
warn()  { echo -e "${YELLOW}[migrate]${NC} $1"; }
error() { echo -e "${RED}[migrate] ERROR:${NC} $1" >&2; }

# ── Esperar PostgreSQL ────────────────────────────────────────
log "Conectando a ${PGHOST}:${PGPORT} / BD: ${PGDATABASE}..."
MAX_RETRIES=30
RETRIES=0
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    error "PostgreSQL no responde tras ${MAX_RETRIES} intentos."
    exit 1
  fi
  warn "No disponible aún... reintento ${RETRIES}/${MAX_RETRIES}"
  sleep 2
done
log "PostgreSQL disponible."

# ── 1. Crear / actualizar app_user ───────────────────────────
log "Configurando usuario '${APP_USER}'..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_USER}'
  ) THEN
    CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${APP_USER_PASSWORD}';
    RAISE NOTICE 'Usuario ${APP_USER} creado.';
  ELSE
    ALTER ROLE ${APP_USER} WITH PASSWORD '${APP_USER_PASSWORD}';
    RAISE NOTICE 'Usuario ${APP_USER} ya existe — contraseña sincronizada.';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE "${PGDATABASE}" TO ${APP_USER};
SQL

# ── 2. Aplicar esquema ────────────────────────────────────────
if [ ! -f "$SCHEMA_FILE" ]; then
  error "Esquema no encontrado: ${SCHEMA_FILE}"
  exit 1
fi

log "Aplicando esquema: ${SCHEMA_FILE}"
psql -h "$PGHOST" \
     -p "$PGPORT" \
     -U "$PGUSER" \
     -d "$PGDATABASE" \
     -v ON_ERROR_STOP=1 \
     -f "$SCHEMA_FILE"

log "Esquema aplicado. Migración completada."
