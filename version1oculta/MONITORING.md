# Monitoreo — CEFIT Módulo Login

> Guía de observabilidad del sistema: health checks, logs, métricas y alertas.

---

## Índice

1. [Endpoint /api/health](#endpoint-apihealth)
2. [Health checks en Docker](#health-checks-en-docker)
3. [Logs con Docker](#logs-con-docker)
4. [Estado de los contenedores](#estado-de-los-contenedores)
5. [Monitoreo de la base de datos](#monitoreo-de-la-base-de-datos)
6. [Comandos útiles de diagnóstico](#comandos-útiles-de-diagnóstico)
7. [Alertas recomendadas](#alertas-recomendadas)

---

## Endpoint /api/health

El servidor expone un endpoint de salud en `GET /api/health`.

### Respuesta esperada

```http
GET http://localhost:3000/api/health
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "timestamp": "2026-06-19T15:30:00.000Z"
}
```

### Cuándo usarlo

| Contexto | Uso |
|---|---|
| Docker healthcheck | `wget -qO- http://localhost:3000/api/health` |
| Load balancer (nginx, Traefik) | Backend health probe |
| Uptime monitor externo | Ping cada 60s |
| CI/CD post-deploy | Verificar que el despliegue arrancó correctamente |

### Lo que verifica implícitamente

- El proceso Node.js está corriendo
- El servidor Express está aceptando conexiones
- El módulo de rutas cargó sin errores

> **Nota:** El health check NO verifica la conexión a la base de datos ni al servicio de correo. Si necesitas un check más profundo, añade una query simple (`SELECT 1`) al pool de PostgreSQL en este endpoint.

---

## Health checks en Docker

Ambos servicios tienen health checks configurados en `docker-compose.yml`.

### PostgreSQL (`cefit_db`)

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres -d registro_usuarios -q"]
  interval: 10s      # se ejecuta cada 10 segundos
  timeout: 5s        # falla si no responde en 5s
  retries: 5         # 5 fallos = contenedor unhealthy
  start_period: 20s  # no cuenta fallos en los primeros 20s
```

El servicio `app` tiene `depends_on: db: condition: service_healthy`, por lo que **nunca arranca si la BD no está sana**.

### Node.js (`cefit_app`)

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s
```

### Ver el estado de los health checks

```bash
docker compose ps
```

Salida esperada cuando todo está bien:

```
NAME         STATUS                   PORTS
cefit_db     Up 2 minutes (healthy)   127.0.0.1:5432->5432/tcp
cefit_app    Up 1 minute (healthy)    127.0.0.1:3000->3000/tcp
```

---

## Logs con Docker

### Ver logs en tiempo real

```bash
# Todos los servicios
docker compose logs -f

# Solo el servidor Node.js
docker compose logs -f app

# Solo la base de datos
docker compose logs -f db
```

### Ver logs de inicialización de la BD (migrate.sh)

```bash
docker compose logs db | grep "\[migrate\]"
```

Salida esperada en primer arranque:

```
[migrate] Esperando PostgreSQL en localhost:5432 / BD: registro_usuarios...
[migrate] PostgreSQL disponible.
[migrate] Verificando usuario de aplicación 'app_user'...
[migrate] Usuario 'app_user' listo con acceso a 'registro_usuarios'.
[migrate] Aplicando esquema desde: /tmp/schema.sql
[migrate] Esquema aplicado. Tablas, índices, datos iniciales y GRANTs listos.
[migrate] Migración completada exitosamente.
```

### Ver últimas N líneas de logs

```bash
docker compose logs --tail=100 app
```

### Exportar logs a archivo

```bash
docker compose logs --no-color app > app.log 2>&1
```

---

## Estado de los contenedores

### Inspección general

```bash
# Estado y uso de recursos
docker stats cefit_app cefit_db

# Información detallada de un contenedor
docker inspect cefit_app

# Procesos dentro del contenedor
docker compose top
```

### Verificar que el servidor responde

```bash
# Health check manual
curl -s http://localhost:3000/api/health | python -m json.tool

# O con wget
wget -qO- http://localhost:3000/api/health
```

### Verificar conectividad app → db

```bash
# Desde el contenedor de la app hacia la BD
docker compose exec app wget -qO- --spider http://db:5432 2>&1 || echo "TCP test"

# Mejor: probar con psql desde el contenedor db
docker compose exec db pg_isready -U app_user -d registro_usuarios
```

---

## Monitoreo de la base de datos

### Conectarse a PostgreSQL como superusuario

```bash
docker compose exec db psql -U postgres -d registro_usuarios
```

### Consultas útiles de diagnóstico

```sql
-- Verificar que app_user existe con los privilegios correctos
SELECT rolname, rolcanlogin, rolsuper
FROM pg_roles
WHERE rolname IN ('postgres', 'app_user');

-- Ver conexiones activas
SELECT pid, usename, application_name, state, query_start
FROM pg_stat_activity
WHERE datname = 'registro_usuarios';

-- Contar usuarios en la BD
SELECT COUNT(*) as total, active FROM users GROUP BY active;

-- Tokens de recuperación expirados (para limpieza)
SELECT id, expires_at,
       CASE WHEN expires_at < NOW() THEN 'EXPIRADO' ELSE 'ACTIVO' END as estado
FROM change_pass
ORDER BY expires_at DESC;

-- Limpiar tokens expirados (ejecutar periódicamente)
DELETE FROM change_pass WHERE expires_at < NOW();
RETURNING id, expires_at;
```

### Verificar tamaño de la BD

```sql
SELECT pg_size_pretty(pg_database_size('registro_usuarios')) as tamaño;
```

---

## Comandos útiles de diagnóstico

### Reinicio limpio (preserva datos)

```bash
docker compose restart
```

### Reinicio completo (borra datos y re-inicializa BD)

```bash
# ⚠️ DESTRUCTIVO — borra el volumen de datos
docker compose down -v
docker compose up -d
```

### Re-ejecutar migración manualmente (sin borrar datos)

```bash
# Útil después de actualizar database.sql
docker compose exec db bash /docker-entrypoint-initdb.d/01_migrate.sh
```

### Actualizar imagen sin perder datos

```bash
docker compose build app
docker compose up -d app
```

### Ver variables de entorno activas en el contenedor

```bash
docker compose exec app env | grep -v MAIL_PASS | grep -v JWT_SECRET | grep -v DB_PASSWORD
```

---

## Alertas recomendadas

Para un entorno de producción, configurar las siguientes alertas:

| Métrica | Umbral | Acción |
|---|---|---|
| `/api/health` sin respuesta 3 min | — | Reiniciar contenedor `app` |
| PostgreSQL `pg_isready` falla | 3 intentos | Alerta al equipo |
| Uso de RAM > 200 MB (límite 256 MB) | — | Revisar memory leaks |
| Disco del volumen `postgres_data` > 80% | — | Ampliar almacenamiento |
| Tokens expirados en `change_pass` > 1000 | — | Ejecutar limpieza SQL |

### Implementación mínima con cron en el host

```bash
# Verificar health cada minuto
* * * * * wget -qO- http://localhost:3000/api/health > /dev/null || docker compose restart app

# Limpiar tokens expirados a medianoche
0 0 * * * docker compose exec -T db psql -U postgres -d registro_usuarios -c "DELETE FROM change_pass WHERE expires_at < NOW();"
```

### Uptime monitoring externo

Herramientas gratuitas compatibles con `GET /api/health`:

- **UptimeRobot** — monitoreo cada 5 min (free tier)
- **Freshping** — monitoreo cada 1 min (free tier)
- **Better Uptime** — notificaciones por correo/Slack

---

## Variable MONITOR_TOKEN

El archivo `.env.example` incluye `MONITOR_TOKEN` reservada para proteger un futuro endpoint de métricas extendidas (`GET /monitor/stats`). Actualmente no está implementado.

Cuando se implemente, la protección será:

```http
GET /monitor/stats
x-monitor-token: <valor de MONITOR_TOKEN>
```

Si `MONITOR_TOKEN` está vacío, el endpoint será de acceso libre (solo aceptable si el puerto está en loopback `127.0.0.1`).

---

*Para hardening de seguridad ver `HARDENING.md`.*
