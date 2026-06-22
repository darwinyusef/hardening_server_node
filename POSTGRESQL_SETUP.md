# Instalación y migración de PostgreSQL — CEFIT

PostgreSQL se instala directamente en el host (no en Docker).
El contenedor `cefit_app` se conecta a él vía `host.docker.internal`.

---

## Requisitos

- Ubuntu 22.04 LTS o 24.04 LTS
- Acceso root o sudo
- Proyecto clonado en `/opt/cefit`

---

## Paso 1 — Instalar PostgreSQL 16

```bash
# Agregar repositorio oficial de PostgreSQL
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc

sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list'

sudo apt update
sudo apt install -y postgresql-16

# Verificar
psql --version
sudo systemctl status postgresql
```

---

## Paso 2 — Configurar PostgreSQL para aceptar conexiones desde Docker

Los contenedores Docker se conectan al host a través del bridge de Docker
(habitualmente `172.17.0.1`). PostgreSQL debe escuchar en esa interfaz.

### 2a. Habilitar escucha en todas las interfaces

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Busca y cambia:

```
listen_addresses = 'localhost'
```

→

```
listen_addresses = '*'
```

### 2b. Permitir acceso desde la red Docker en pg_hba.conf

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Agrega esta línea **al final** (antes de cualquier línea `local`):

```
# Docker bridge — acceso desde contenedores al host
host    registro_usuarios    app_user    172.17.0.0/16    scram-sha-256
```

> Si Docker usa un bridge distinto a `172.17.0.0/16`, verifícalo con:
> `docker network inspect bridge | grep Subnet`

### 2c. Reiniciar PostgreSQL

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql
```

---

## Paso 3 — Crear la base de datos

```bash
# Entrar como superusuario postgres
sudo -u postgres psql
```

```sql
-- Establecer contraseña del superusuario (se usa en migrate.sh)
ALTER USER postgres WITH PASSWORD 'CAMBIAR_clave_superusuario';

-- Crear la base de datos
CREATE DATABASE registro_usuarios;

-- Verificar
\l
\q
```

---

## Paso 4 — Ejecutar la migración

El script `migrate.sh` crea el rol `app_user` con mínimo privilegio
y aplica el esquema completo (`database.sql`).

```bash
cd /opt/cefit

PGPASSWORD=CAMBIAR_clave_superusuario \
DB_PASSWORD=CAMBIAR_clave_app_user \
bash scripts/migrate.sh
```

Salida esperada:

```
[migrate] Conectando a 127.0.0.1:5432 / BD: registro_usuarios...
[migrate] PostgreSQL disponible.
[migrate] Configurando usuario 'app_user'...
NOTICE:  Usuario app_user creado.
[migrate] Aplicando esquema: ./database.sql
CREATE TABLE
CREATE TABLE
CREATE TABLE
INSERT 0 13
...
[migrate] Esquema aplicado. Migración completada.
```

> Para re-ejecutar la migración (resetea todos los datos):
> ```bash
> PGPASSWORD=... DB_PASSWORD=... bash scripts/migrate.sh
> ```
> `database.sql` hace `DROP TABLE IF EXISTS CASCADE` al inicio, así que es seguro re-ejecutar.

---

## Paso 5 — Bloquear el puerto 5432 en el firewall

PostgreSQL no debe ser accesible desde Internet. Solo el host y la red Docker pueden conectarse.

```bash
# Si usas UFW
sudo ufw deny 5432/tcp
sudo ufw status

# Verificar que el puerto NO responde desde fuera
# (desde otra máquina o usando nmap)
nmap -p 5432 <IP_DEL_SERVIDOR>
# Debe aparecer: 5432/tcp  filtered
```

---

## Paso 6 — Verificar la conexión desde Docker

Una vez levantado el stack (`docker compose --env-file .env.prod up -d`):

```bash
# Desde el contenedor app, intentar conectar
docker exec cefit_app wget -qO- http://localhost:3000/api/health

# Ver logs de la app por errores de BD
docker compose --env-file .env.prod logs app | grep -i "error\|database\|connect"
```

Si hay error de conexión `ECONNREFUSED` o `password authentication failed`:
1. Confirmar que `pg_hba.conf` tiene la entrada para `172.17.0.0/16`
2. Confirmar que `listen_addresses = '*'` en `postgresql.conf`
3. Confirmar que `DB_PASSWORD` en `.env.prod` coincide con la clave de `app_user`
4. `sudo systemctl restart postgresql` y volver a intentar

---

## Paso 7 — Backup y restauración

```bash
# Backup completo
sudo -u postgres pg_dump registro_usuarios > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar (borra y recrea todo)
sudo -u postgres psql registro_usuarios < backup_20260601_120000.sql
```

---

## Resumen de variables de conexión

| Variable | Valor en contenedor | Descripción |
|---|---|---|
| `DB_HOST` | `host.docker.internal` | Host del contenedor al servidor |
| `DB_PORT` | `5432` | Puerto PostgreSQL |
| `DB_USER` | `app_user` | Usuario con mínimo privilegio |
| `DB_NAME` | `registro_usuarios` | Nombre de la base de datos |
| `DB_PASSWORD` | (en `.env.prod`) | Contraseña de `app_user` |

Docker resuelve `host.docker.internal` al IP del gateway del bridge
(`172.17.0.1` por defecto) gracias a `extra_hosts: host.docker.internal:host-gateway`
definido en `docker-compose.yml`.
