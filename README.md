# CEFIT — Módulo Login

Sistema de autenticación con RBAC (Role-Based Access Control), recuperación de contraseña, hardening de seguridad y observabilidad con Prometheus + Grafana.

---

## Acceso para pruebas

### Aplicación — `https://localhost`

| Email | Contraseña | Rol | Permisos |
|---|---|---|---|
| `admin@cefit.com` | `CefitAdmin2024!` | admin | Usuarios, roles, permisos, reportes, productos |
| `vendedor@cefit.com` | `CefitVend2024!` | vendedor | Ventas, catálogo, clientes, comisiones |
| `usuario@cefit.com` | `CefitUser2024!` | usuario | Ver y editar su propio perfil |

### Grafana — `https://localhost:3001`

| Usuario | Contraseña |
|---|---|
| `admin` | `admin` (cambiar en `.env` → `GRAFANA_PASSWORD`) |

### Prometheus — `http://localhost:9090`

Sin autenticación (solo acceso local).

> El certificado HTTPS es auto-firmado (Caddy CA local). El navegador mostrará advertencia la primera vez — hacer click en "Avanzado → Continuar".

---

## Stack de servicios

| Contenedor | Imagen | Puerto local | Función |
|---|---|---|---|
| `cefit_caddy` | `caddy:2-alpine` | `443`, `80`, `3001` | Reverse proxy + TLS |
| `cefit_app` | Node.js 20 | — (interno) | API REST |
| `cefit_db` | `postgres:16-alpine` | `5432` | Base de datos |
| `cefit_prometheus` | `prom/prometheus:v3` | `9090` | Métricas |
| `cefit_grafana` | `grafana/grafana:11` | `3001` (vía Caddy) | Dashboards |

---

## Requisitos previos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Docker + Compose | 24.x / v2.x | Levantar todo el stack |
| Node.js + npm | 20.x / 10.x | Solo si corres sin Docker |
| PostgreSQL | 16.x | Solo si corres sin Docker |

---

## Arranque rápido con Docker

### 1. Clonar y configurar

```bash
git clone <url-del-repositorio>
cd hardening_server_node
cp .env.example .env
```

Editar `.env` con valores reales (ver sección Variables de entorno).

### 2. Levantar el stack

```bash
docker compose up -d
```

En el **primer arranque** Docker ejecuta automáticamente:
1. `scripts/migrate.sh` — crea el rol `app_user` en PostgreSQL
2. `database.sql` — tablas, índices, datos de prueba y permisos

### 3. Verificar estado

```bash
docker compose ps
```

```
NAME               STATUS           PORTS
cefit_caddy        Up               0.0.0.0:80->80, 0.0.0.0:443->443, 0.0.0.0:3001->3001
cefit_app          Up (healthy)     3000/tcp (interno)
cefit_db           Up (healthy)     127.0.0.1:5432->5432
cefit_prometheus   Up               127.0.0.1:9090->9090
cefit_grafana      Up               3000/tcp (interno)
```

### 4. Abrir en el navegador

| URL | Servicio |
|---|---|
| `https://localhost` | Frontend + API |
| `https://localhost:3001` | Grafana |
| `http://localhost:9090` | Prometheus |

---

## Variables de entorno

```env
# PostgreSQL superusuario (solo inicialización)
POSTGRES_PASSWORD=clave_root_segura

# Conexión de la aplicación (usa app_user)
DB_USER=app_user
DB_NAME=registro_usuarios
DB_PASSWORD=clave_app_segura

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
ALLOWED_ORIGINS=https://iapixelcode.com,https://localhost

# Caddy — local usa Caddyfile.local, producción usa Caddyfile.prod
CADDYFILE=./Caddyfile.local

# Grafana
GRAFANA_PASSWORD=admin
RECOVERY_TOKEN_MINUTES=60
```

---

## Entornos: local vs producción

### Local (por defecto)

`Caddyfile.local` — TLS con CA propia de Caddy. No requiere dominio real.

```bash
docker compose up -d
# Acceso: https://localhost
```

### Producción

Apunta el DNS de `iapixelcode.com` y `grafana.iapixelcode.com` a la IP del servidor, luego:

```bash
# En el servidor, editar .env:
CADDYFILE=./Caddyfile.prod
GRAFANA_PASSWORD=clave_segura
ALLOWED_ORIGINS=https://iapixelcode.com

docker compose up -d
# Caddy obtiene certificado Let's Encrypt automáticamente
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
| `DELETE` | `/api/productos/:id` | Admin + JWT | Eliminar producto |

### Observabilidad

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | Público | Estado del servidor |
| `GET` | `/metrics` | Interno (Prometheus) | Métricas en formato Prometheus |

### Ejemplo de uso con curl

```bash
# 1. Login — obtener token
TOKEN=$(curl -sk -X POST https://localhost/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cefit.com","password":"CefitAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Listar productos
curl -sk https://localhost/api/productos \
  -H "Authorization: Bearer $TOKEN"

# 3. Crear producto
curl -sk -X POST https://localhost/api/productos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Nuevo Curso","precio":99000,"stock":10,"categoria":"Cursos"}'
```

---

## Comandos Docker útiles

```bash
# Ver estado de todos los servicios
docker compose ps

# Logs en tiempo real
docker compose logs -f

# Logs por servicio
docker compose logs -f app
docker compose logs -f caddy

# Reiniciar solo la app (sin tocar BD)
docker compose up -d --no-deps app

# Reconstruir imagen tras cambios en el código
docker compose up -d --build app

# Conectarse a PostgreSQL
docker compose exec db psql -U postgres -d registro_usuarios

# Reinicio completo — BORRA TODOS LOS DATOS
docker compose down -v && docker compose up -d
```

---

## Estructura del proyecto

```
hardening_server_node/
├── .well-known/
│   └── security.txt              # Política de divulgación (RFC 9116)
├── client/                       # Frontend estático (servido por Caddy)
│   ├── assets/
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── constantes.js     # API_URL dinámica, helpers
│   │       ├── notifications.js  # Sistema de toast
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
│   ├── prometheus/
│   │   └── prometheus.yml        # Scrape config
│   └── grafana/
│       └── provisioning/         # Datasource + dashboard auto-provisionados
├── scripts/
│   └── migrate.sh                # Inicialización de la BD
├── server/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── recoveryController.js
│   │   └── productController.js
│   ├── middleware/
│   │   ├── authMiddleware.js     # verifyToken, isAdmin
│   │   ├── rateLimiter.js        # Rate limiting por ruta
│   │   └── metrics.js            # prom-client — métricas HTTP
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── recoveryRoutes.js
│   │   ├── productRoutes.js
│   │   └── metricsRoute.js       # GET /metrics
│   ├── db.js
│   └── server.js
├── Caddyfile.local               # TLS interno (desarrollo)
├── Caddyfile.prod                # Let's Encrypt (producción)
├── database.sql                  # Esquema completo + seed
├── Dockerfile                    # Multi-stage, usuario no-root, read-only fs
├── docker-compose.yml
├── .env.example
├── HARDENING.md                  # Medidas de seguridad aplicadas
└── MONITORING.md                 # Observabilidad y diagnóstico
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

- `HARDENING.md` — Registro completo de medidas de seguridad y su justificación (OWASP)
- `MONITORING.md` — Health checks, métricas, Grafana y comandos de diagnóstico
