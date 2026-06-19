# Guía de Hardening — Módulo Login CEFIT

> Simulador de ciberseguridad · Registro de cambios de seguridad aplicados

---

## Índice

1. [Resumen de vulnerabilidades corregidas](#resumen)
2. [server.js](#serverjs)
3. [middleware/rateLimiter.js (nuevo)](#ratelimiterjs)
4. [middleware/authMiddleware.js](#authmiddlewarejs)
5. [controllers/authController.js](#authcontrollerjs)
6. [controllers/recoveryController.js](#recoverycontrollerjs)
7. [routes/authRoutes.js](#authroutesjs)
8. [routes/recoveryRoutes.js](#recoveryroutesjs)
9. [db.js](#dbjs)
10. [database.sql](#databasesql)
11. [.env.example](#envexample)
12. [package.json](#packagejson)
13. [Docker Hardening](#docker-hardening)
    - [Dockerfile](#dockerfile)
    - [docker-compose.yml](#docker-composeyml)
    - [scripts/migrate.sh (nuevo)](#scriptsmigratesh)
    - [.dockerignore](#dockerignore)

---

## Resumen

| Vulnerabilidad | Antes | Después | Categoría OWASP |
|---|---|---|---|
| CORS abierto a cualquier origen | `cors()` sin restricción | Whitelist por `ALLOWED_ORIGINS` | A05 - Misconfiguration |
| Sin cabeceras de seguridad HTTP | Sin Helmet | `helmet()` activo | A05 - Misconfiguration |
| Sin rate limiting | Sin límite de peticiones | Rate limit por ruta | A07 - Auth Failures |
| JWT secret hardcodeado | Fallback en código fuente | Solo desde `.env`, falla si falta | A02 - Cryptographic Failures |
| Enumeración de usuarios | Mensajes distintos para email/pass | Mensaje genérico unificado | A01 - Broken Access Control |
| Rutas de admin sin protección | `/users` y `/update-role` públicas | `verifyToken + isAdmin` obligatorio | A01 - Broken Access Control |
| Tokens de recuperación eternos | Sin expiración | `expires_at` con ventana de 60 min | A07 - Auth Failures |
| Tokens de recuperación reutilizables | No se eliminaban al usarse | Se eliminan inmediatamente | A07 - Auth Failures |
| Bcrypt costo 10 | `bcrypt.hash(pass, 10)` | `bcrypt.hash(pass, 12)` | A02 - Cryptographic Failures |
| Credenciales hardcodeadas en DB | Contraseña `123456` en código | Sin fallback, falla explícitamente | A02 - Cryptographic Failures |
| Grants excesivos en BD | `GRANT ALL TO PUBLIC` en todas las tablas | Mínimo privilegio por rol `app_user` | A01 - Broken Access Control |
| Payload sin límite de tamaño | Sin límite | `express.json({ limit: '10kb' })` | A06 - Vulnerable Components |
| Contraseñas sin validación mínima | Sin validar longitud | Mínimo 8 caracteres | A07 - Auth Failures |
| Credenciales reales en `.env.example` | Correo y contraseña reales expuestos | Solo placeholders | A02 - Cryptographic Failures |
| `active` verificado después de bcrypt | Flujo incorrecto en login | Se verifica activo después de validar contraseña (anti-timing) | A07 - Auth Failures |
| Timing attack en login | Retorno inmediato si usuario no existe | Siempre ejecuta `bcrypt.compare` | A07 - Auth Failures |

---

## server.js

### Cambio 1: Helmet (cabeceras de seguridad HTTP)

```js
// ANTES
app.use(cors());
app.use(express.json());

// DESPUÉS
app.use(helmet());
```

**Por qué:** Sin Helmet, el servidor no envía cabeceras como `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, ni `Strict-Transport-Security`. Esto expone la aplicación a ataques de clickjacking, MIME-sniffing y XSS reflejado. Helmet es un conjunto de 15 middlewares que activa estas cabeceras en una sola línea.

---

### Cambio 2: CORS con whitelist

```js
// ANTES
app.use(cors()); // acepta CUALQUIER origen

// DESPUÉS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

**Por qué:** Un CORS completamente abierto permite que cualquier sitio web haga peticiones autenticadas a la API usando las credenciales del usuario. Esto es la base de los ataques CSRF. La whitelist restringe los orígenes a los configurados en el `.env`.

---

### Cambio 3: Límite de tamaño del cuerpo

```js
// ANTES
app.use(express.json()); // sin límite

// DESPUÉS
app.use(express.json({ limit: '10kb' }));
```

**Por qué:** Sin límite, un atacante puede enviar un payload JSON de varios MB para agotar memoria del servidor (ataque DoS por payload). 10 KB es más que suficiente para cualquier formulario legítimo del sistema.

---

### Cambio 4: Verificación de JWT_SECRET al arrancar

```js
// DESPUÉS
if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET no está definido");
    process.exit(1);
}
```

**Por qué:** Si el servidor arranca sin `JWT_SECRET`, usaría la cadena hardcodeada del fallback. Esto fuerza a que el error sea evidente en el arranque, nunca silencioso.

---

## rateLimiter.js

> Archivo nuevo: `server/middleware/rateLimiter.js`

### Por qué se creó

Sin rate limiting, la API es vulnerable a:
- **Fuerza bruta en login:** probar miles de contraseñas sin bloqueo.
- **Spam en recuperación:** enviar miles de correos usando el endpoint `/recovery`.
- **Saturación general:** DoS básico mediante peticiones masivas.

### Limitadores configurados

| Limitador | Ruta | Máximo | Ventana |
|---|---|---|---|
| `globalLimiter` | Todas las rutas | 100 req | 15 min |
| `loginLimiter` | `POST /api/login` | 5 req | 15 min |
| `recoveryLimiter` | `POST /api/recovery` | 3 req | 1 hora |

---

## authMiddleware.js

### Cambio 1: Eliminación del fallback hardcodeado

```js
// ANTES
jwt.verify(token.split(" ")[1], process.env.JWT_SECRET || "CEFIT_SECRET_2024_CAMBIAR_EN_PRODUCCION", ...

// DESPUÉS
const secret = process.env.JWT_SECRET;
if (!secret) return res.status(500).json({ message: "Error de configuración del servidor" });
jwt.verify(token, secret, ...
```

**Por qué:** Un secreto hardcodeado en el código fuente es conocido por todo el equipo y queda en el historial de Git. Si un atacante lo conoce, puede forjar tokens JWT válidos con cualquier `id` o `rol` que desee. Al eliminar el fallback, el servidor falla de forma explícita y segura.

---

### Cambio 2: Validación del formato Bearer

```js
// ANTES
const token = req.headers['authorization'];
// No se verificaba que empezara con "Bearer "

// DESPUÉS
if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: "Token requerido" });
}
```

**Por qué:** Previene errores silenciosos si se envía el token en formato incorrecto, y hace la validación más robusta y estándar.

---

## authController.js

### Cambio 1: Anti-enumeración de usuarios en registro y login

```js
// ANTES — register
if (userExist.rows.length > 0) {
    return res.json({ message: "El correo ya está registrado" }); // revela existencia

// DESPUÉS — register
return res.json({ message: "Si el correo no está registrado, recibirás un correo de verificación" });
```

```js
// ANTES — login
if (userRes.rows.length === 0) {
    return res.json({ message: "Usuario no encontrado" }); // confirma que no existe
}
// ...
if (!validPassword) {
    return res.json({ message: "Contraseña incorrecta" }); // confirma que sí existe

// DESPUÉS — login
const MSG_INVALIDO = "Credenciales incorrectas"; // mismo mensaje siempre
```

**Por qué:** Mensajes distintos para "usuario no existe" vs "contraseña incorrecta" permiten a un atacante hacer enumeración de usuarios registrados. Con el mensaje unificado, no puede saber si el correo existe o no.

---

### Cambio 2: Anti-timing attack en login

```js
// DESPUÉS
if (userRes.rows.length === 0) {
    // Ejecutar bcrypt igualmente para que el tiempo de respuesta sea el mismo
    await bcrypt.compare(password, "$2b$12$invalidhashpadding000000000000000000000000000000000000");
    return res.status(401).json({ message: MSG_INVALIDO });
}
```

**Por qué:** Si el servidor responde en 2ms cuando el usuario no existe pero en 200ms cuando sí existe (bcrypt tarda en comparar), un atacante puede medir tiempos de respuesta para confirmar qué usuarios están registrados. Ejecutar bcrypt siempre iguala el tiempo de respuesta.

---

### Cambio 3: Verificación del `active` después de validar contraseña

```js
// ANTES
if (!user.active) { return "Debes verificar tu cuenta" } // antes de comparar contraseña

// DESPUÉS
const validPassword = await bcrypt.compare(password, user.password);
if (!validPassword) { return MSG_INVALIDO }
if (!user.active) { return "Debes verificar tu cuenta" }
```

**Por qué:** Verificar `active` antes de la contraseña también filtra por enumeración (responde diferente si el usuario existe pero está inactivo). El orden correcto es: verificar contraseña primero, luego verificar estado.

---

### Cambio 4: Costo de bcrypt elevado a 12

```js
// ANTES
const hashedPassword = await bcrypt.hash(password, 10);

// DESPUÉS
const hashedPassword = await bcrypt.hash(password, 12);
```

**Por qué:** El factor de costo determina cuánto tiempo tarda en calcular el hash. Con costo 10 (~100ms), un atacante con GPU puede probar ~10.000 contraseñas/segundo offline. Con costo 12 (~400ms), el ataque es 4 veces más lento. El estándar actual recomienda mínimo 12.

---

### Cambio 5: Rutas de admin protegidas (ver authRoutes.js)

```js
// ANTES — cualquier usuario podía acceder
router.get("/users", authController.getAllUsers);
router.put("/update-role", authController.updateRole);

// DESPUÉS
router.get("/users", verifyToken, isAdmin, authController.getAllUsers);
router.put("/update-role", verifyToken, isAdmin, authController.updateRole);
```

**Por qué:** Sin protección, cualquiera podía listar todos los usuarios del sistema o cambiar el rol de cualquier usuario a `admin` simplemente haciendo un PUT a `/api/update-role`. Esto era una escalada de privilegios trivial.

---

### Cambio 6: Validación del rol en `updateRole`

```js
// ANTES — cualquier valor de rol era aceptado
await pool.query("UPDATE users SET rol = $1 WHERE id = $2", [nuevoRol, id]);

// DESPUÉS
const rolesPermitidos = ['admin', 'vendedor', 'usuario'];
if (!rolesPermitidos.includes(nuevoRol)) {
    return res.status(400).json({ message: "Rol inválido" });
}
```

**Por qué:** Sin validación, un admin podría insertar un rol arbitrario como `superadmin` o `root` que luego no sea reconocido correctamente por el middleware, causando comportamientos inesperados.

---

### Cambio 7: Validación de email y contraseña mínima

```js
// DESPUÉS
if (!isValidEmail(email)) return res.status(400).json({ message: "Formato de correo inválido" });
if (password.length < 8) return res.status(400).json({ message: "Mínimo 8 caracteres" });
```

**Por qué:** Sin validación de entrada, el servidor intenta insertar en BD cualquier valor, incluyendo cadenas vacías o cadenas extremadamente largas que pueden causar errores inesperados o abusar del bcrypt con payloads gigantes.

---

## recoveryController.js

### Cambio 1: Expiración de tokens de recuperación

```js
// ANTES — token sin expiración, válido para siempre
await pool.query("INSERT INTO change_pass (id, password) VALUES ($1, $2)", [token, "pendiente"]);

// DESPUÉS — token con ventana de validez
const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MINUTES * 60 * 1000);
await pool.query("INSERT INTO change_pass (id, expires_at) VALUES ($1, $2)", [token, expiresAt]);
```

**Por qué:** Un token de recuperación que nunca expira puede ser usado días o semanas después de ser emitido, por ejemplo si el correo es comprometido tarde. La ventana de 60 minutos limita el tiempo de exposición.

---

### Cambio 2: Validación de expiración al usar el token

```js
// ANTES — no verificaba si el token había expirado
const resultado = await pool.query(
    "SELECT * FROM users WHERE change_pass_id = $1", [token]
);

// DESPUÉS — JOIN con change_pass y verificación de expires_at
const resultado = await pool.query(
    `SELECT u.id FROM users u
     JOIN change_pass cp ON cp.id = u.change_pass_id
     WHERE u.change_pass_id = $1 AND cp.expires_at > NOW()`,
    [token]
);
```

**Por qué:** Aunque el token se generara con fecha de expiración, si no se verifica al usarlo, la expiración no tiene efecto. Esta consulta rechaza tokens expirados directamente en BD.

---

### Cambio 3: Eliminación del token al usarse (uso único)

```js
// ANTES — el token quedaba en BD, podía reutilizarse
await pool.query("UPDATE users SET change_pass_id = NULL WHERE id = $1", [usuario.id]);
// El registro en change_pass nunca se borraba

// DESPUÉS — se elimina definitivamente
await pool.query("UPDATE users SET password = $1, change_pass_id = NULL WHERE id = $2", [...]);
await pool.query("DELETE FROM change_pass WHERE id = $1", [token]);
```

**Por qué:** Si el token no se elimina al usarse, un atacante que intercepce el enlace (por ejemplo en logs de proxy o historial del navegador) puede cambiar la contraseña nuevamente después de la víctima.

---

### Cambio 4: Limpiar tokens anteriores al crear uno nuevo

```js
// DESPUÉS — invalida el token anterior antes de crear uno nuevo
await pool.query("UPDATE users SET change_pass_id = NULL WHERE id = $1", [usuario.id]);
await pool.query("INSERT INTO change_pass (id, expires_at) VALUES ($1, $2)", [token, expiresAt]);
```

**Por qué:** Sin esto, un usuario podría acumular múltiples tokens de recuperación activos. Un atacante que logre el primero podría usarlo aunque el usuario haya solicitado uno nuevo.

---

## authRoutes.js

### Cambio: Protección de rutas de administración

```js
// ANTES — rutas admin completamente públicas
router.get("/users", authController.getAllUsers);
router.put("/update-role", authController.updateRole);

// DESPUÉS — requieren token válido y rol admin
router.get("/users", verifyToken, isAdmin, authController.getAllUsers);
router.put("/update-role", verifyToken, isAdmin, authController.updateRole);
```

**Por qué:** Estas rutas exponían datos de todos los usuarios y permitían cambiar roles sin ninguna autenticación. Cualquier persona que conociera la URL podía listar usuarios o convertirse en admin.

---

### Cambio: Rate limiter en login

```js
// DESPUÉS
router.post("/login", loginLimiter, authController.login);
```

**Por qué:** Sin este limitador, el login acepta peticiones ilimitadas, permitiendo ataques de diccionario o fuerza bruta automatizados contra cualquier cuenta.

---

## recoveryRoutes.js

### Cambio: Rate limiter en recuperación

```js
// DESPUÉS
router.post("/recovery", recoveryLimiter, recoveryController.enviarRecovery);
```

**Por qué:** Sin límite, un atacante puede usar el endpoint para enviar miles de correos desde el servidor CEFIT usando correos de víctimas (abuso de relay de correo y spam).

---

## db.js

### Cambio: Eliminación de contraseñas hardcodeadas

```js
// ANTES
const pool = new Pool({
    password: process.env.DB_PASSWORD || "123456",  // fallback inseguro
    ...
});

// DESPUÉS
if (!process.env.DB_PASSWORD) {
    console.error("FATAL: DB_PASSWORD no está definido");
    process.exit(1);
}
const pool = new Pool({ password: process.env.DB_PASSWORD, ... });
```

**Por qué:** Una contraseña por defecto en el código fuente es una credential exposure crítica. Si el `.env` no se carga correctamente, el sistema se conectaría con la contraseña `123456` sin que nadie lo note. Ahora falla de forma explícita.

### Cambio: Soporte SSL para BD

```js
ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false
```

**Por qué:** Permite activar cifrado TLS en la conexión a PostgreSQL en producción, protegiendo credenciales y datos en tránsito contra sniffing de red.

---

## database.sql

### Cambio 1: Expiración en tabla `change_pass`

```sql
-- ANTES
CREATE TABLE change_pass (
    id          VARCHAR(50) PRIMARY KEY,
    password    VARCHAR(255) NOT NULL,  -- siempre era "pendiente", sin sentido
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DESPUÉS
CREATE TABLE change_pass (
    id          VARCHAR(50) PRIMARY KEY,
    expires_at  TIMESTAMP NOT NULL,     -- expira en 60 minutos
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Por qué:** La columna `password` siempre almacenaba la cadena literal `"pendiente"` sin ningún propósito funcional. Se reemplaza por `expires_at` que sí tiene función de seguridad real.

---

### Cambio 2: Eliminación de GRANT excesivos (mínimo privilegio)

```sql
-- ANTES — cualquier usuario tiene acceso total a todo
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE users TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE change_pass TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE permissions TO PUBLIC;

-- DESPUÉS — usuario de aplicación con permisos mínimos necesarios
GRANT CONNECT ON DATABASE registro_usuarios TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE users       TO app_user;
GRANT SELECT, INSERT, DELETE ON TABLE change_pass TO app_user;
GRANT SELECT                 ON TABLE permissions  TO app_user;
```

**Por qué:** Conceder `ALL TO PUBLIC` significa que cualquier usuario de PostgreSQL (incluyendo uno comprometido por inyección SQL) puede leer, modificar y eliminar cualquier registro. Con `app_user`, si la aplicación es comprometida, el atacante solo puede hacer lo que la app necesita: no puede `DROP TABLE`, no puede `DELETE` usuarios, no puede leer otras bases de datos.

---

### Cambio 3: Índice sobre `expires_at`

```sql
CREATE INDEX IF NOT EXISTS idx_change_pass_exp ON change_pass(expires_at);
```

**Por qué:** Permite limpiar tokens expirados eficientemente con una tarea programada (`DELETE FROM change_pass WHERE expires_at < NOW()`), sin hacer un full table scan.

---

### Cambio 4: Bcrypt costo 12 en datos iniciales

```sql
-- ANTES
crypt('CefitAdmin2024!', gen_salt('bf', 10))

-- DESPUÉS
crypt('CefitAdmin2024!', gen_salt('bf', 12))
```

**Por qué:** Consistencia con el costo usado en el servidor Node.js (12). Tener diferentes costos en BD y aplicación genera confusión y posibles errores al verificar contraseñas de usuarios de prueba.

---

## .env.example

### Cambio: Eliminación de credenciales reales

```bash
# ANTES — credenciales reales expuestas
DB_PASSWORD=123456
MAIL_USER=jugando1404@gmail.com
MAIL_PASS=wnyq kwar vgmw glly  # App Password de Gmail real

# DESPUÉS — solo placeholders
DB_PASSWORD=CAMBIAR_POR_CONTRASEÑA_SEGURA
MAIL_USER=tucorreo@gmail.com
MAIL_PASS=CONTRASEÑA_DE_APLICACION_GMAIL
```

**Por qué:** Un `.env.example` con credenciales reales es una fuga de secretos. Si el repositorio es público o el historial de Git es accesible, la App Password de Gmail queda expuesta permanentemente (incluso si se cambia el `.env.example` después, sigue en el historial).

### Cambio: Nuevas variables agregadas

```bash
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5500
ALLOWED_ORIGINS=http://localhost:5500
JWT_EXPIRES_IN=2h
RECOVERY_TOKEN_MINUTES=60
DB_SSL=false
```

**Por qué:** Centralizar la configuración en el `.env` evita URLs y valores hardcodeados dispersos en el código, facilitando el despliegue en diferentes entornos (desarrollo, staging, producción).

---

## package.json

### Dependencias agregadas

```json
"express-rate-limit": "^7.5.0",
"helmet": "^8.0.0"
```

### Dependencia eliminada

```json
// ANTES
"body-parser": "^2.2.2"  // redundante desde Express 4.16+
```

**Por qué:** Express ya incluye `express.json()` y `express.urlencoded()` de forma nativa desde la versión 4.16. `body-parser` es redundante y añade una dependencia innecesaria.

---

---

## Docker Hardening

### Dockerfile

#### Cambio 1: Multi-stage build

```dockerfile
# ANTES — una sola etapa, incluye npm cache y herramientas de build
FROM node:20-alpine
RUN npm install --production

# DESPUÉS — etapa builder (instala) + etapa runtime (solo lo necesario)
FROM node:20-alpine AS builder
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
COPY --from=builder /app/node_modules ./node_modules
```

**Por qué:** La imagen final no contiene la cache de npm (~50-100 MB) ni herramientas que solo se necesitan durante la instalación. Menos superficie = menos vectores de ataque si el contenedor es comprometido.

---

#### Cambio 2: Usuario no-root

```dockerfile
# ANTES — proceso corre como root dentro del contenedor
# (sin USER declarado = root por defecto)

# DESPUÉS
USER node   # uid 1000, ya existe en node:alpine
```

**Por qué:** Si un atacante explota una vulnerabilidad en Node.js o en las dependencias, obtiene acceso como `node` (sin privilegios) en lugar de `root`. Con root, podría instalar paquetes, modificar el sistema de archivos o intentar escapar del contenedor.

---

#### Cambio 3: dumb-init para manejo correcto de señales

```dockerfile
RUN apk add --no-cache dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]
```

**Por qué:** Node.js como PID 1 no reenvía señales SIGTERM/SIGINT a los procesos hijos. `dumb-init` actúa como init mínimo que sí lo hace, permitiendo que `docker stop` cierre la aplicación limpiamente (graceful shutdown) en lugar de matarla con SIGKILL tras timeout.

---

#### Cambio 4: Copiar solo el servidor

```dockerfile
# ANTES
COPY . .   # copia todo: client/, scripts/, *.md, .env*, etc.

# DESPUÉS
COPY server/ ./server/
COPY package.json ./
```

**Por qué:** La imagen no debe contener el frontend, scripts de migración, archivos `.env`, ni documentación. Menos archivos = imagen más pequeña y sin información innecesaria expuesta dentro del contenedor.

---

### docker-compose.yml

#### Cambio 1: Servicio PostgreSQL integrado

```yaml
# ANTES — apuntaba a IP externa hardcodeada
DB_HOST: 178.156.191.90

# DESPUÉS — PostgreSQL corre en su propio contenedor
db:
  image: postgres:16-alpine
  container_name: cefit_db
```

**Por qué:** Con la BD en el mismo compose, la conexión va por red interna Docker (nunca sale a internet), se puede versionar la imagen, y se elimina la dependencia de infraestructura externa que podía no estar disponible o tener credenciales compartidas.

---

#### Cambio 2: Puertos solo en loopback (127.0.0.1)

```yaml
# ANTES
ports:
  - "3000:3000"   # escucha en todas las interfaces (0.0.0.0)

# DESPUÉS
ports:
  - "127.0.0.1:3000:3000"  # solo localhost
  - "127.0.0.1:5432:5432"  # BD también solo localhost
```

**Por qué:** Exponer en `0.0.0.0` hace que el servicio sea accesible desde cualquier interfaz de red del host, incluyendo redes externas. Con `127.0.0.1`, solo es alcanzable desde el mismo servidor (o a través de un reverse proxy como nginx controlado).

---

#### Cambio 3: Sin secretos hardcodeados en compose

```yaml
# ANTES
JWT_SECRET: ${JWT_SECRET:-CEFIT_SECRET_2024_CAMBIAR_EN_PRODUCCION}
DB_PASSWORD: ${DB_PASSWORD:-123456}

# DESPUÉS — sin fallback, falla si .env no está configurado
JWT_SECRET: ${JWT_SECRET}
DB_PASSWORD: ${DB_PASSWORD}
```

**Por qué:** El valor por defecto actúa como "contraseña de rescate" que puede ser usada deliberadamente si el operador no configura el `.env`. Al eliminar el fallback, el contenedor simplemente no arranca si los secretos no están definidos, forzando la configuración correcta.

---

#### Cambio 4: Health checks

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d registro_usuarios -q"]
    interval: 10s
    timeout: 5s
    retries: 5

app:
  depends_on:
    db:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
```

**Por qué:** Sin health checks, Docker marca los contenedores como `running` aunque la aplicación no haya terminado de inicializarse. El `depends_on: condition: service_healthy` garantiza que la app no arranque hasta que la BD esté lista, evitando errores de conexión en el inicio.

---

#### Cambio 5: No new privileges + filesystem de solo lectura

```yaml
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp:size=50m,mode=1777
```

**Por qué:**
- `no-new-privileges`: impide que cualquier proceso dentro del contenedor gane privilegios adicionales (ej. via `setuid` binaries).
- `read_only: true`: el contenedor no puede escribir en disco. Si hay RCE (Remote Code Execution), el atacante no puede depositar archivos maliciosos persistentes.
- `tmpfs /tmp`: Express necesita `/tmp` para ciertos headers/uploads; se da en RAM, no en disco.

---

#### Cambio 6: Límites de recursos

```yaml
deploy:
  resources:
    limits:
      memory: 256m
      cpus: '0.5'
```

**Por qué:** Sin límites, un ataque DoS (como flood de peticiones que pasen el rate limiter por IPs distribuidas) puede consumir toda la RAM/CPU del host, afectando otros servicios. Los límites contienen el daño.

---

#### Cambio 7: Red interna isolada

```yaml
networks:
  cefit_net:
    driver: bridge
```

**Por qué:** Por defecto, Docker pone todos los contenedores en la misma red `bridge` donde pueden comunicarse entre sí. Con una red nombrada, solo los contenedores explícitamente en `cefit_net` pueden comunicarse, aislando la BD de otros proyectos en el mismo host.

---

### scripts/migrate.sh

Script nuevo que realiza la migración de forma idempotente y segura.

#### Por qué se creó

| Necesidad | Solución |
|---|---|
| Crear `app_user` antes de aplicar GRANTs | El script crea el rol con `DO $$ IF NOT EXISTS` |
| Esperar a que PostgreSQL esté listo | Loop con `pg_isready` (hasta 30 reintentos) |
| Aplicar esquema en primer arranque | Se monta en `/docker-entrypoint-initdb.d/` |
| Re-ejecutable en actualizaciones | Idempotente: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` |
| Contraseña de `app_user` configurable | Viene de `DB_PASSWORD` en el `.env` |

#### Uso manual (actualización de esquema)

```bash
# Dentro del contenedor de base de datos
docker compose exec db bash /docker-entrypoint-initdb.d/01_migrate.sh

# O desde el host con psql instalado
PGHOST=localhost PGPORT=5432 \
PGUSER=postgres PGPASSWORD=<root_pass> \
PGDATABASE=registro_usuarios \
DB_PASSWORD=<app_user_pass> \
SCHEMA_FILE=./database.sql \
bash scripts/migrate.sh
```

---

### .dockerignore

```
# ANTES — solo excluía lo básico
node_modules
.git
.env
*.md

# DESPUÉS — excluye todo lo que no debe ir en la imagen
node_modules / .git / .env* / *.md / client/ / *.sql / scripts/ / docker-compose.yml
```

**Por qué:** La imagen Docker solo debe contener el servidor Node.js. El frontend (`client/`), los `.sql`, y los scripts de migración no son necesarios en runtime y aumentan la superficie de ataque si la imagen es comprometida o publicada accidentalmente.

---

## Checklist de despliegue seguro

### Sin Docker (desarrollo local)
- [ ] Copiar `.env.example` a `.env` y completar **todos** los valores
- [ ] Generar `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] Crear `app_user` en PostgreSQL y ejecutar `database.sql`
- [ ] Activar `DB_SSL=true` si la BD está en servidor remoto
- [ ] Configurar `ALLOWED_ORIGINS` con el dominio real del frontend
- [ ] Instalar dependencias: `npm install`

### Con Docker
- [ ] Copiar `.env.example` a `.env` y completar **todos** los valores
- [ ] Configurar `POSTGRES_PASSWORD` (superusuario postgres)
- [ ] Configurar `DB_PASSWORD` (contraseña de `app_user`, usada por la app)
- [ ] Generar `JWT_SECRET` con el comando de crypto de Node
- [ ] Primer arranque (inicializa BD y crea `app_user` automáticamente):
  ```bash
  docker compose up -d
  ```
- [ ] Verificar logs de migración:
  ```bash
  docker compose logs db
  ```
- [ ] Para migraciones posteriores (actualizaciones de esquema):
  ```bash
  docker compose exec db bash /docker-entrypoint-initdb.d/01_migrate.sh
  ```

### En ambos casos
- [ ] `.env` en `.gitignore` (ya configurado)
- [ ] Configurar tarea programada para limpiar tokens expirados:
  ```sql
  DELETE FROM change_pass WHERE expires_at < NOW();
  ```
- [ ] En producción: poner nginx como reverse proxy delante del puerto 3000

---

*Hardening aplicado siguiendo OWASP Top 10 2021 y NIST SP 800-63B.*
