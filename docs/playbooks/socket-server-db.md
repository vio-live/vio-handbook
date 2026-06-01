# Socket Server — DB Playbook

## Entornos

| Entorno | Host | DB | Driver |
|---------|------|----|--------|
| local | `localhost:5432` (Docker) | `socket_server` | `pg` |
| development | `pg-socket-server-development` (VNet privada) | `socket_server` | `pg` |
| staging | `pg-socket-server-staging` (VNet privada) | `socket_server` | `pg` |
| production | `pg-socket-server-production` (VNet privada) | `socket_server` | `pg` |

Los PostgreSQL de desarrollo y staging **no tienen acceso público** — solo el Container App dentro de su VNet los alcanza. Para operaciones de mantenimiento se usa un Container App Job dentro de la misma VNet.

---

## Setup local

```bash
# 1. Arrancar PostgreSQL local
docker compose up -d

# 2. Copiar variables de entorno
cp .env.local.example .env
# Rellenar AZURE_STORAGE_CONNECTION_STRING (ver 1Password)

# 3. Instalar dependencias
yarn install

# 4. Aplicar schema
yarn db:push

# 5. Arrancar servidor
yarn dev   # localhost:5001
```

---

## Compartir data entre devs (snapshots)

Los snapshots se guardan en Azure Blob — `containerqa2/db-snapshots`.

```bash
# Subir tu estado local
yarn db:snapshot:push
# → sube {git-username}-{YYYY-MM-DD-HHmm}.sql

# Ver snapshots disponibles
yarn db:snapshot:list

# Descargar y restaurar el último snapshot
yarn db:snapshot:pull

# Descargar un snapshot específico
yarn db:snapshot:pull angelo-sepulveda-2026-06-01-0857.sql
```

---

## Migrar data Neon → producción

Cuando se necesita restaurar la data de Neon en producción:

```bash
az containerapp job start \
  --name db-restore-job \
  --resource-group rg-socket-server-production
```

El job `db-restore-job` tiene configuradas las variables `NEON_URL` y `PROD_URL`. Corre `pg_dump` desde Neon y `psql` directo a Azure PostgreSQL dentro de la VNet.

**Imagen requerida**: `postgres:17-alpine` (Neon corre PG17 — `pg_dump` v16 falla con version mismatch).

Ver logs de la ejecución:
```bash
EXEC=$(az containerapp job execution list --name db-restore-job --resource-group rg-socket-server-production --query "[-1].name" -o tsv)
az containerapp job logs show --name db-restore-job --resource-group rg-socket-server-production --execution $EXEC --container db-restore --tail 50
```

---

## Scheduler PostgreSQL staging/development

Los PostgreSQL de staging y development se apagan automáticamente **lunes a viernes a las 20:00 CET** (18:00 UTC) y se encienden a las **08:00 CET** (06:00 UTC).

Esto ahorra ~$30/mes. Los Container Apps escalan a cero cuando no hay tráfico — el único costo evitado es el PostgreSQL parado.

**Jobs responsables:**
- `pg-stop-staging` / `pg-stop-development` — cron `0 18 * * 1-5`
- `pg-start-staging` / `pg-start-development` — cron `0 6 * * 1-5`

Para encender manualmente fuera de horario:
```bash
az postgres flexible-server start \
  --resource-group rg-socket-server-staging \
  --name pg-socket-server-staging
```

---

## Schema migrations

Las migraciones Drizzle se ejecutan automáticamente al arrancar el contenedor:
```bash
npx drizzle-kit push && node dist/preserver.js
```

El CI no tiene acceso a los PostgreSQL privados — las migraciones corren dentro del contenedor en la VNet.

Para aplicar schema manualmente en local:
```bash
yarn db:push
```

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|---------------|-----|
| `ERR_INVALID_URL` en startup | Contraseña con chars especiales sin URL-encode | Verificar `DATABASE_URL` — la contraseña debe estar URL-encodeada (`urlencode()` en Terraform) |
| `ECONNREFUSED :443` | `neon-serverless` conectando a Azure PostgreSQL | `db.ts` debe usar driver `pg` para URLs que no contengan `neon.tech` |
| `F /app/drizzle.config.json file does not exist` | Dockerfile no copia `drizzle.config.ts` ni `shared/` | Verificar stage de producción en Dockerfile |
| Container App no responde tras encender PostgreSQL | PostgreSQL tarda ~2 min en arrancar | Esperar y reintentar — el Container App reintentará la conexión |
