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
| `admin` | valor de `GRAFANA_PASSWORD` en `.env` |

### Prometheus — interno (no expuesto públicamente)

---

## Stack de servicios

| Contenedor | Imagen | Puerto externo | Función |
|---|---|---|---|
| `cefit_caddy` | `caddy:2-alpine` | `80`, `443` | Reverse proxy + TLS Let's Encrypt |
| `cefit_app` | Node.js 20 | — (interno) | API REST |
| `cefit_db` | `postgres:16-alpine` | `127.0.0.1:5432` | Base de datos (stack separado) |
| `cefit_prometheus` | `prom/prometheus:v3` | `127.0.0.1:9090` | Métricas |
| `cefit_grafana` | `grafana/grafana:11` | — (vía Caddy) | Dashboards |

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Docker + Compose | 24.x / v2.x |

---

## Entornos

El entorno se selecciona con `--env-file`. Un solo cambio lo controla todo: URLs, Caddyfile, credenciales.

| Archivo | Entorno | Acceso |
|---|---|---|
| `.env.local` | Desarrollo local | `https://localhost` · Grafana `https://localhost:3001` |
| `.env.prod` | Producción | `https://iapixelcode.com` · Grafana `https://grafana.iapixelcode.com` |

> `.env.local` y `.env.prod` están en `.gitignore`. Crea los tuyos copiando `.env.example` como base.

---

## Arranque

La base de datos corre en un **stack independiente** (`docker-compose.db.yml`).
El stack principal (`docker-compose.yml`) se conecta a ella a través de la red externa `cefit_db_net`.

### Local

```bash
# 1. Completar credenciales
cp .env.example .env.local
nano .env.local

# 2. Base de datos
docker compose -f docker-compose.db.yml --env-file .env.local up -d db

# 3. Esquema (solo la primera vez)
docker compose -f docker-compose.db.yml --env-file .env.local --profile init up --abort-on-container-exit db-init

# 4. Stack principal
docker compose --env-file .env.local up -d
```

Acceso: `https://localhost` · Grafana: `https://localhost:3001`
El certificado TLS es auto-firmado (Caddy CA local) — el navegador pedirá aceptar la excepción una vez.

### Producción

```bash
# 1. Completar credenciales y apuntar el DNS al servidor
cp .env.example .env.prod
nano .env.prod   # cambiar todos los valores CAMBIAR_*

# 2. Base de datos
docker compose -f docker-compose.db.yml --env-file .env.prod up -d db

# 3. Esquema (solo la primera vez)
docker compose -f docker-compose.db.yml --env-file .env.prod --profile init up --abort-on-container-exit db-init

# 4. Stack principal
docker compose --env-file .env.prod up -d
# Caddy obtiene el certificado Let's Encrypt automáticamente
```

### Verificar estado

```bash
docker compose --env-file .env.local ps   # o .env.prod
docker compose -f docker-compose.db.yml --env-file .env.local ps
```

```
NAME               STATUS           PORTS
cefit_caddy        Up               0.0.0.0:80->80, 0.0.0.0:443->443
cefit_app          Up (healthy)     3000/tcp
cefit_prometheus   Up               127.0.0.1:9090->9090
cefit_grafana      Up               3000/tcp

cefit_db           Up (healthy)     127.0.0.1:5432->5432
```

---

## Variables de entorno

```env
# PostgreSQL superusuario (solo para migrate.sh)
POSTGRES_PASSWORD=clave_root_segura

# Conexión de la aplicación (usa app_user)
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

# URLs
APP_URL=https://iapixelcode.com
FRONTEND_URL=https://iapixelcode.com
ALLOWED_ORIGINS=https://iapixelcode.com

# Caddy
CADDYFILE=./Caddyfile.prod

# Grafana
GRAFANA_PASSWORD=clave_segura
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
# 1. Login — obtener token
TOKEN=$(curl -s -X POST https://iapixelcode.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cefit.com","password":"CefitAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Listar productos
curl -s https://iapixelcode.com/api/productos \
  -H "Authorization: Bearer $TOKEN"

# 3. Crear producto
curl -s -X POST https://iapixelcode.com/api/productos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Nuevo Curso","precio":99000,"stock":10,"categoria":"Cursos"}'
```

---

## Comandos útiles

Reemplaza `--env-file .env.local` por `--env-file .env.prod` según el entorno.

```bash
# ── Base de datos ──────────────────────────────────────────────
docker compose -f docker-compose.db.yml --env-file .env.local up -d db
docker compose -f docker-compose.db.yml --env-file .env.local --profile init up --abort-on-container-exit db-init
docker compose -f docker-compose.db.yml --env-file .env.local exec db psql -U postgres -d registro_usuarios

# Backup
docker compose -f docker-compose.db.yml --env-file .env.local exec db \
  pg_dump -U postgres registro_usuarios > backup_$(date +%Y%m%d_%H%M%S).sql

# ── Stack principal ────────────────────────────────────────────
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs -f
docker compose --env-file .env.local logs -f app
docker compose --env-file .env.local logs -f caddy

# Reconstruir tras cambios en el código
docker compose --env-file .env.local up -d --build app

# Reiniciar solo la app
docker compose --env-file .env.local up -d --no-deps app
```

---

## Estructura del proyecto

```
hardening_server_node/
├── client/                       # Frontend estático (servido por Caddy)
│   ├── assets/
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── constantes.js
│   │       ├── notifications.js
│   │       ├── login.js
│   │       ├── registro.js
│   │       ├── dashboard.js
│   │       ├── olvide.js
│   │       ├── nueva_password.js
│   │       └── productos.js
│   ├── index.html
│   ├── registro.html
│   ├── dashboard.html
│   ├── olvide.html
│   ├── nueva_password.html
│   └── productos.html
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/provisioning/
├── scripts/
│   └── migrate.sh                # Inicialización de BD (TCP, sin initdb.d)
├── server/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── recoveryController.js
│   │   └── productController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── rateLimiter.js
│   │   └── metrics.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── recoveryRoutes.js
│   │   ├── productRoutes.js
│   │   └── metricsRoute.js
│   ├── db.js
│   └── server.js
├── .well-known/security.txt
├── Caddyfile.prod                # Let's Encrypt (producción)
├── Caddyfile.local               # TLS interno (solo desarrollo local)
├── database.sql                  # Esquema + seed
├── Dockerfile
├── docker-compose.yml            # App + Caddy + Prometheus + Grafana
├── docker-compose.db.yml         # PostgreSQL (stack independiente)
├── .env.example
├── HARDENING.md
└── MONITORING.md
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

- `HARDENING.md` — Medidas de seguridad y justificación (OWASP)
- `MONITORING.md` — Health checks, métricas, Grafana y diagnóstico
- `README_PRODUCTION.md` — Guía completa de despliegue en producción
