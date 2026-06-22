# CEFIT — Módulo Login

Sistema de autenticación con RBAC, recuperación de contraseña, hardening de seguridad y observabilidad con Prometheus + Grafana.

Dominio: `iapixelcode.com` · Stack: Caddy + Node.js + PostgreSQL + Prometheus + Grafana

---

## Acceso para pruebas

### Aplicación — `https://iapixelcode.com`

| Email | Contraseña | Rol | Permisos |
|---|---|---|---|
| `admin@cefit.com` | `CefitAdmin2024!` | admin | Usuarios, roles, permisos, reportes, productos |
| `vendedor@cefit.com` | `CefitVend2024!` | vendedor | Ventas, catálogo, clientes, comisiones |
| `usuario@cefit.com` | `CefitUser2024!` | usuario | Ver y editar su propio perfil |

### Grafana — `https://grafana.iapixelcode.com`

| Usuario | Contraseña |
|---|---|
| `admin` | valor de `GRAFANA_PASSWORD` en el env file |

### Prometheus — interno (no expuesto públicamente)

---

## Stack de servicios

| Servicio | Imagen / Tecnología | Puerto externo | Función |
|---|---|---|---|
| `cefit_caddy` | `caddy:2-alpine` | `80`, `443` | Reverse proxy + TLS Let's Encrypt |
| `cefit_app` | Node.js 20 (Docker) | — (interno) | API REST |
| PostgreSQL 16 | Instalado en el host | — (solo loopback) | Base de datos |
| `cefit_prometheus` | `prom/prometheus:v3` | `127.0.0.1:9090` | Métricas |
| `cefit_grafana` | `grafana/grafana:11` | — (vía Caddy) | Dashboards |

> PostgreSQL corre directamente en el host (no en Docker).
> El contenedor `cefit_app` lo alcanza vía `host.docker.internal`.
> Ver **`POSTGRESQL_SETUP.md`** para instalación y migración.

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Docker + Compose | 24.x / v2.x |
| PostgreSQL | 16.x (instalado en el host) |

---

## Entornos

El entorno se selecciona con `--env-file`. Un solo cambio controla URLs, Caddyfile y credenciales.

| Archivo | Entorno | Acceso |
|---|---|---|
| `.env.local` | Desarrollo local | `https://localhost` · Grafana `https://localhost:3001` |
| `.env.prod` | Producción | `https://iapixelcode.com` · Grafana `https://grafana.iapixelcode.com` |

> `.env.local` y `.env.prod` están en `.gitignore`. Créalos copiando `.env.example` como base.

---

## Arranque

### Paso previo — Base de datos

Instala PostgreSQL en el host y ejecuta la migración **una sola vez** antes de levantar Docker.
Sigue el paso a paso en **`POSTGRESQL_SETUP.md`**.

```bash
# Migración manual (PostgreSQL ya instalado y corriendo en el host)
PGPASSWORD=<clave_postgres> DB_PASSWORD=<clave_app_user> bash scripts/migrate.sh
```

### Local

```bash
cp .env.example .env.local
nano .env.local   # ajustar DB_PASSWORD, JWT_SECRET, etc.

docker compose --env-file .env.local up -d
```

Acceso: `https://localhost` · Grafana: `https://localhost:3001`
El certificado TLS es auto-firmado (Caddy CA local) — el navegador pedirá aceptar la excepción una vez.

### Producción

```bash
cp .env.example .env.prod
nano .env.prod   # completar todos los valores CAMBIAR_*

docker compose --env-file .env.prod up -d
# Caddy obtiene el certificado Let's Encrypt automáticamente
```

### Verificar estado

```bash
docker compose --env-file .env.local ps   # o .env.prod
```

```
NAME               STATUS           PORTS
cefit_caddy        Up               0.0.0.0:80->80, 0.0.0.0:443->443
cefit_app          Up (healthy)     3000/tcp
cefit_prometheus   Up               127.0.0.1:9090->9090
cefit_grafana      Up               3000/tcp
```

---

## Variables de entorno

```env
# Base de datos (PostgreSQL en el host)
DB_HOST=host.docker.internal
DB_USER=app_user
DB_NAME=registro_usuarios
DB_PASSWORD=clave_app_segura
DB_PORT=5432
DB_SSL=false

# JWT — generar con:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=secreto_largo_y_aleatorio
JWT_EXPIRES_IN=2h

# Correo (Gmail: Seguridad → Contraseñas de aplicación)
MAIL_USER=tucorreo@gmail.com
MAIL_PASS=contraseña_de_aplicacion

# URLs (local: https://localhost | prod: https://iapixelcode.com)
APP_URL=https://iapixelcode.com
FRONTEND_URL=https://iapixelcode.com
ALLOWED_ORIGINS=https://iapixelcode.com

# Caddy (local: ./Caddyfile.local | prod: ./Caddyfile.prod)
CADDYFILE=./Caddyfile.prod

# Grafana
GRAFANA_PASSWORD=clave_segura
GRAFANA_URL=https://grafana.iapixelcode.com

RECOVERY_TOKEN_MINUTES=60
```

---

## API Reference

### Autenticación

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/register` | Público | Crear cuenta |
| `GET` | `/api/verify?id=` | Público | Verificar email |
| `POST` | `/api/login` | Público (5 req/15 min) | Iniciar sesión → devuelve JWT |
| `POST` | `/api/recovery` | Público (3 req/hora) | Solicitar recuperación de contraseña |
| `POST` | `/api/nueva-password` | Público | Establecer nueva contraseña |
| `GET` | `/api/users` | Admin + JWT | Listar todos los usuarios |
| `PUT` | `/api/update-role` | Admin + JWT | Cambiar rol de un usuario |
| `GET` | `/api/health` | Público | Health check |

### Productos

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/productos` | JWT | Listar productos (con filtros) |
| `POST` | `/api/productos` | Admin / Vendedor + JWT | Crear producto |
| `PUT` | `/api/productos/:id` | Admin / Vendedor + JWT | Editar producto |
| `DELETE` | `/api/productos/:id` | Admin + JWT | Desactivar / activar producto |

### Observabilidad

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | Público | Estado del servidor |
| `GET` | `/metrics` | Interno (Prometheus) | Métricas en formato Prometheus |

### Ejemplo de uso con curl

```bash
TOKEN=$(curl -s -X POST https://iapixelcode.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cefit.com","password":"CefitAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s https://iapixelcode.com/api/productos \
  -H "Authorization: Bearer $TOKEN"
```

---

## Comandos útiles

```bash
# Ver estado
docker compose --env-file .env.prod ps

# Logs en tiempo real
docker compose --env-file .env.prod logs -f app
docker compose --env-file .env.prod logs -f caddy

# Reconstruir tras cambios en el código
docker compose --env-file .env.prod up -d --build app

# Backup de PostgreSQL (en el host)
sudo -u postgres pg_dump registro_usuarios > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## Estructura del proyecto

```
hardening_server_node/
├── client/                       # Frontend estático (servido por Caddy)
│   ├── assets/css/style.css
│   └── assets/js/
│       ├── constantes.js
│       ├── notifications.js
│       ├── login.js · registro.js · dashboard.js
│       ├── olvide.js · nueva_password.js
│       └── productos.js
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/provisioning/
├── scripts/
│   └── migrate.sh                # Migración manual contra PostgreSQL del host
├── server/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── db.js
│   └── server.js
├── .well-known/security.txt
├── Caddyfile.prod                # Let's Encrypt (producción)
├── Caddyfile.local               # TLS interno (desarrollo local)
├── database.sql                  # Esquema completo + seed
├── Dockerfile
├── docker-compose.yml            # App + Caddy + Prometheus + Grafana
├── .env.example
├── POSTGRESQL_SETUP.md           # Instalación y migración de PostgreSQL
├── HARDENING.md
├── MONITORING.md
└── README_PRODUCTION.md
```

---

## Dependencias principales

| Paquete | Versión | Uso |
|---|---|---|
| `express` | ^5.2 | Framework HTTP |
| `helmet` | ^8.2 | Cabeceras de seguridad HTTP |
| `cors` | ^2.8 | Control de orígenes |
| `express-rate-limit` | ^7.5 | Rate limiting |
| `bcrypt` | ^6.0 | Hash de contraseñas (costo 12) |
| `jsonwebtoken` | ^9.0 | Tokens JWT |
| `pg` | ^8.20 | Cliente PostgreSQL |
| `nodemailer` | ^9.0 | Envío de correos |
| `prom-client` | ^15.1 | Métricas Prometheus |
| `uuid` | ^14.0 | IDs únicos |
| `dotenv` | ^16.5 | Variables de entorno locales |

---

## Documentación adicional

- `POSTGRESQL_SETUP.md` — Instalación manual de PostgreSQL y migración del esquema
- `HARDENING.md` — Medidas de seguridad y justificación (OWASP)
- `MONITORING.md` — Health checks, métricas, Grafana y diagnóstico
- `README_PRODUCTION.md` — Guía completa de despliegue en producción
