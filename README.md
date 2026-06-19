# CEFIT — Módulo Login

Sistema de autenticación con RBAC (Role-Based Access Control), recuperación de contraseña y hardening de seguridad.

---

## Requisitos previos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Node.js | 20.x | Ejecutar el servidor localmente |
| npm | 10.x | Gestión de dependencias |
| Docker Desktop | 24.x | Despliegue con contenedores |
| Docker Compose | v2.x | Orquestar servicios |
| PostgreSQL | 16.x | Solo si corres sin Docker |

---

## Instalación con Docker (recomendado)

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd module_login
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` y completar **todos** los valores:

```env
# Superusuario de PostgreSQL (solo para inicialización)
POSTGRES_PASSWORD=UnaClaveSeguraParaRoot

# Usuario de aplicación (app_user) — la app conecta con este
DB_USER=app_user
DB_NAME=registro_usuarios
DB_PASSWORD=UnaClaveSeguraParaApp

# JWT — generar con:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=tu_secreto_largo_y_aleatorio_aqui
JWT_EXPIRES_IN=2h

# Correo para enviar verificaciones y recuperación
MAIL_USER=tucorreo@gmail.com
MAIL_PASS=contraseña_de_aplicacion_gmail

# URLs (en desarrollo local)
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5500
ALLOWED_ORIGINS=http://localhost:5500
RECOVERY_TOKEN_MINUTES=60
```

> Para Gmail: ve a **Cuenta Google → Seguridad → Contraseñas de aplicación** y genera una clave de 16 caracteres.

### 3. Arrancar los servicios

```bash
docker compose up -d
```

Docker ejecuta automáticamente en el **primer arranque**:
1. `scripts/migrate.sh` — crea el rol `app_user` en PostgreSQL
2. `database.sql` — crea tablas, índices, datos de prueba y permisos

### 4. Verificar que todo está corriendo

```bash
docker compose ps
```

Salida esperada:

```
NAME         STATUS                   PORTS
cefit_db     Up (healthy)             127.0.0.1:5432->5432/tcp
cefit_app    Up (healthy)             127.0.0.1:3000->3000/tcp
```

### 5. Verificar el servidor

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"..."}
```

### 6. Abrir el frontend

Abre `client/index.html` con Live Server (VS Code) o cualquier servidor estático en el puerto 5500.

#### Usuarios de prueba incluidos

| Email | Contraseña | Rol |
|---|---|---|
| `admin@cefit.com` | `CefitAdmin2024!` | admin |
| `vendedor@cefit.com` | `CefitVend2024!` | vendedor |
| `usuario@cefit.com` | `CefitUser2024!` | usuario |

---

## Instalación local sin Docker

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con los valores correctos
# DB_HOST=localhost (o la IP de tu servidor PostgreSQL)
```

### 3. Preparar la base de datos

Conectarse a PostgreSQL como superusuario y ejecutar:

```bash
# Crear la base de datos si no existe
psql -U postgres -c "CREATE DATABASE registro_usuarios;"

# Ejecutar el script de migración
PGHOST=localhost PGPORT=5432 \
PGUSER=postgres PGPASSWORD=tu_clave_root \
PGDATABASE=registro_usuarios \
DB_PASSWORD=tu_clave_app \
SCHEMA_FILE=./database.sql \
bash scripts/migrate.sh
```

### 4. Iniciar el servidor

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start
```

El servidor arranca en `http://localhost:3000`.

---

## Comandos Docker útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Ver logs solo del servidor Node.js
docker compose logs -f app

# Ver logs de la inicialización de la BD
docker compose logs db | grep "\[migrate\]"

# Reiniciar solo la app (sin tocar la BD)
docker compose restart app

# Actualizar la imagen después de cambios en el código
docker compose build app && docker compose up -d app

# Re-ejecutar migración (actualizar esquema sin borrar datos)
docker compose exec db bash /docker-entrypoint-initdb.d/01_migrate.sh

# Conectarse a PostgreSQL
docker compose exec db psql -U postgres -d registro_usuarios

# Conectarse como app_user (permisos limitados)
docker compose exec db psql -U app_user -d registro_usuarios

# Reinicio completo — BORRA TODOS LOS DATOS
docker compose down -v && docker compose up -d
```

---

## Estructura del proyecto

```
module_login/
├── .well-known/
│   └── security.txt          # Política de divulgación (RFC 9116)
├── client/                   # Frontend estático
│   ├── assets/
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── constantes.js     # API_URL, helpers globales
│   │       ├── notifications.js  # Sistema de toast
│   │       ├── login.js
│   │       ├── registro.js
│   │       ├── dashboard.js
│   │       ├── olvide.js
│   │       └── nueva_password.js
│   ├── index.html            # Login
│   ├── registro.html
│   ├── dashboard.html
│   ├── olvide.html
│   └── nueva_password.html
├── scripts/
│   └── migrate.sh            # Inicialización de la BD
├── server/
│   ├── controllers/
│   │   ├── authController.js
│   │   └── recoveryController.js
│   ├── middleware/
│   │   ├── authMiddleware.js  # verifyToken, isAdmin
│   │   └── rateLimiter.js    # Rate limiting por ruta
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── recoveryRoutes.js
│   ├── db.js                 # Pool de conexión PostgreSQL
│   └── server.js             # Punto de entrada
├── database.sql              # Esquema completo de la BD
├── Dockerfile                # Multi-stage, usuario no-root
├── docker-compose.yml        # App + PostgreSQL con hardening
├── .env.example              # Plantilla de variables de entorno
├── HARDENING.md              # Documentación de seguridad
└── MONITORING.md             # Guía de observabilidad
```

---

## API Reference

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/register` | Público | Crear cuenta |
| `GET` | `/api/verify?id=` | Público | Verificar email |
| `POST` | `/api/login` | Público (5 req/15min) | Iniciar sesión |
| `POST` | `/api/recovery` | Público (3 req/hora) | Solicitar recuperación |
| `POST` | `/api/nueva-password` | Público | Establecer nueva contraseña |
| `GET` | `/api/users` | Admin + JWT | Listar usuarios |
| `PUT` | `/api/update-role` | Admin + JWT | Cambiar rol |
| `GET` | `/api/health` | Público | Health check |
| `GET` | `/.well-known/security.txt` | Público | Política de seguridad |

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
| `uuid` | ^14.0 | IDs no predecibles |
| `dotenv` | ^16.5 | Variables de entorno locales |

---

## Documentación adicional

- `HARDENING.md` — Registro completo de medidas de seguridad aplicadas y su justificación
- `MONITORING.md` — Health checks, logs, comandos de diagnóstico y alertas recomendadas
