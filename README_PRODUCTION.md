# Guía de despliegue en producción — CEFIT

Dominio: `iapixelcode.com` · Stack: Caddy + Node.js + PostgreSQL + Prometheus + Grafana

---

## Requisitos del servidor

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disco | 20 GB SSD | 40 GB SSD |
| SO | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Puertos abiertos | 22, 80, 443 | 22, 80, 443 |

> Proveedores compatibles: DigitalOcean, Hetzner, Linode, AWS EC2, cualquier VPS con IP pública.

---

## Paso 1 — Apuntar el DNS

En el panel de tu registrador de dominio, crea estos registros **A** apuntando a la IP pública del servidor:

| Registro | Tipo | Valor |
|---|---|---|
| `iapixelcode.com` | A | `<IP_DEL_SERVIDOR>` |
| `www.iapixelcode.com` | A | `<IP_DEL_SERVIDOR>` |
| `grafana.iapixelcode.com` | A | `<IP_DEL_SERVIDOR>` |

Verifica propagación (puede tardar hasta 10 min):

```bash
dig iapixelcode.com +short
dig grafana.iapixelcode.com +short
# Deben devolver la IP del servidor
```

> **Importante:** Caddy solo puede obtener el certificado Let's Encrypt si el DNS ya apunta al servidor antes del primer `docker compose up`.

---

## Paso 2 — Preparar el servidor

Conéctate por SSH y ejecuta:

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version
docker compose version
```

---

## Paso 3 — Clonar el repositorio

```bash
cd /opt
sudo git clone <url-del-repositorio> cefit
sudo chown -R $USER:$USER /opt/cefit
cd /opt/cefit
```

---

## Paso 4 — Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Valores que **debes cambiar** obligatoriamente:

```env
# ── PostgreSQL ────────────────────────────────────────────────
POSTGRES_PASSWORD=<contraseña_root_muy_segura>
DB_PASSWORD=<contraseña_app_user_muy_segura>

# ── JWT ───────────────────────────────────────────────────────
# Generar con:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<secreto_de_64_bytes_en_hex>
JWT_EXPIRES_IN=2h

# ── Correo ────────────────────────────────────────────────────
MAIL_USER=tucorreo@gmail.com
MAIL_PASS=<contraseña_de_aplicacion_gmail>

# ── URLs de producción ────────────────────────────────────────
APP_URL=https://iapixelcode.com
FRONTEND_URL=https://iapixelcode.com
ALLOWED_ORIGINS=https://iapixelcode.com

# ── Caddy — apuntar al Caddyfile de producción ───────────────
CADDYFILE=./Caddyfile.prod

# ── Grafana ───────────────────────────────────────────────────
GRAFANA_PASSWORD=<contraseña_grafana_segura>

# ── Recuperación de contraseña ────────────────────────────────
RECOVERY_TOKEN_MINUTES=60
```

Permisos del `.env` (solo el propietario puede leerlo):

```bash
chmod 600 .env
```

---

## Paso 5 — Configurar el firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Caddy redirect a HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

> Los puertos 3000, 5432, 9090 y 3001 **no deben abrirse** — son internos al stack Docker.

---

## Paso 6 — Levantar el stack

```bash
docker compose up -d
```

Caddy detecta automáticamente que no hay `local_certs` en `Caddyfile.prod` y solicita el certificado a Let's Encrypt vía ACME HTTP-01 challenge (requiere puerto 80 accesible).

Verificar que todos los servicios están corriendo:

```bash
docker compose ps
```

Salida esperada:

```
NAME               STATUS           PORTS
cefit_caddy        Up               0.0.0.0:80->80, 0.0.0.0:443->443, 0.0.0.0:3001->3001
cefit_app          Up (healthy)     3000/tcp
cefit_db           Up (healthy)     127.0.0.1:5432->5432
cefit_prometheus   Up               127.0.0.1:9090->9090
cefit_grafana      Up               3000/tcp
```

---

## Paso 7 — Verificar el despliegue

```bash
# Health check de la API
curl https://iapixelcode.com/api/health
# {"status":"ok","timestamp":"..."}

# Verificar certificado TLS
curl -vI https://iapixelcode.com 2>&1 | grep -E "subject|issuer|expire"

# Verificar redirección www → apex
curl -I http://www.iapixelcode.com
# HTTP/1.1 301 Moved Permanently
# Location: https://iapixelcode.com/
```

Abre en el navegador:

| URL | Servicio esperado |
|---|---|
| `https://iapixelcode.com` | Página de login |
| `https://grafana.iapixelcode.com` | Grafana (pide usuario/clave) |

---

## Paso 8 — Post-instalación

### Cambiar contraseña de Grafana

1. Entra a `https://grafana.iapixelcode.com`
2. Usuario: `admin` / Contraseña: la que pusiste en `GRAFANA_PASSWORD`
3. Ve a **Profile → Change password**

### Cambiar las contraseñas de los usuarios de prueba

Los usuarios seed (`admin@cefit.com`, `vendedor@cefit.com`, `usuario@cefit.com`) tienen contraseñas conocidas. **Cámbialas o elimínalas en producción:**

```bash
# Conectarse a la BD
docker compose exec db psql -U postgres -d registro_usuarios

-- Deshabilitar usuarios de prueba
UPDATE users SET active = false
WHERE email IN ('vendedor@cefit.com', 'usuario@cefit.com');

-- O eliminarlos
DELETE FROM users
WHERE email IN ('vendedor@cefit.com', 'usuario@cefit.com');

\q
```

### Crear el usuario administrador real

```bash
# Via API (el servidor debe estar corriendo)
curl -X POST https://iapixelcode.com/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tu Nombre",
    "lastname": "Tu Apellido",
    "email": "tu@email.com",
    "password": "ClaveSegura123!",
    "document": "123456789",
    "type_document": "CC"
  }'
```

Luego elevar a admin directamente en la BD:

```bash
docker compose exec db psql -U postgres -d registro_usuarios \
  -c "UPDATE users SET rol='admin', active=true WHERE email='tu@email.com';"
```

---

## Paso 9 — Configurar actualizaciones automáticas del SO

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
# Seleccionar "Sí" para activar actualizaciones de seguridad automáticas
```

---

## Mantenimiento

### Actualizar el código

```bash
cd /opt/cefit
git pull
docker compose up -d --build app
```

### Ver logs

```bash
# Todos los servicios
docker compose logs -f

# Solo app o caddy
docker compose logs -f app
docker compose logs -f caddy

# Últimos errores
docker compose logs --tail=50 app | grep -i error
```

### Renovación de certificados

Caddy renueva los certificados Let's Encrypt automáticamente. Para verificar:

```bash
docker compose logs caddy | grep -i "certificate\|tls\|acme"
```

### Backup de la base de datos

```bash
# Crear backup
docker compose exec db pg_dump -U postgres registro_usuarios \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar backup
docker compose exec -T db psql -U postgres registro_usuarios \
  < backup_20240101_120000.sql
```

### Reinicio completo (mantiene datos)

```bash
docker compose down
docker compose up -d
```

### Reinicio completo borrando datos

```bash
# ⚠️  BORRA TODOS LOS DATOS
docker compose down -v
docker compose up -d
```

---

## Solución de problemas

### Caddy no obtiene el certificado

```bash
docker compose logs caddy | grep -i "error\|acme\|challenge"
```

Causas comunes:
- DNS aún no propagado → esperar y reintentar
- Puerto 80 cerrado en el firewall → `sudo ufw allow 80`
- Rate limit de Let's Encrypt (5 intentos/hora) → esperar 1 hora

### La app no conecta con la BD

```bash
docker compose logs app | grep -i "error\|database\|connect"
docker compose logs db | grep -i "error"

# Verificar que la BD pasó el healthcheck
docker compose ps db
```

### Error 502 Bad Gateway en Caddy

La app no está respondiendo:

```bash
docker compose ps app
docker compose logs app --tail=20
# Si está caída:
docker compose up -d app
```

### Ver métricas de recursos

```bash
docker stats --no-stream
```

---

## Lista de verificación final

- [ ] DNS de `iapixelcode.com`, `www` y `grafana` apuntan al servidor
- [ ] Puertos 80 y 443 abiertos en el firewall
- [ ] `.env` con contraseñas seguras y `CADDYFILE=./Caddyfile.prod`
- [ ] `docker compose ps` muestra todos los servicios `Up (healthy)`
- [ ] `https://iapixelcode.com` carga sin advertencia de certificado
- [ ] `https://grafana.iapixelcode.com` accesible con la nueva contraseña
- [ ] Contraseña de Grafana cambiada desde el valor por defecto
- [ ] Usuarios de prueba desactivados o eliminados
- [ ] Usuario administrador real creado
- [ ] Backup automatizado configurado (cron o servicio externo)
