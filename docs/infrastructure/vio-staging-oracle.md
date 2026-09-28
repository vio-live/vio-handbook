---
title: "Vio Backend staging en Oracle Cloud Always Free"
last-updated: 2026-09-28
owner: miguel
status: live
---

# Vio staging en Oracle Cloud Always Free

Segunda instancia Always Free, hermana de [vio-backend-oracle](./vio-backend-oracle.md).
Con esta se agotan las **2 `E2.1.Micro`** del tier gratuito: no queda margen para una tercera.

| | |
|---|---|
| Instancia | `vio-staging-amd`, `VM.Standard.E2.1.Micro`, `eu-stockholm-1` |
| IP pública | `129.151.196.99` |
| SSH | `ssh -i ~/.ssh/vio_oracle ubuntu@129.151.196.99` |
| SO / CPU / RAM | Ubuntu 24.04.5, AMD EPYC 7551, 2 vCPU burst, 954 MB + 2 GB swap |
| Dominios | `api-staging.vio.live` (backend), `events-staging.vio.live` (analytics) |

**Dos servicios en la misma caja**, algo que en Azure eran dos Container Apps:

- `vio-backend.service` -> `127.0.0.1:5000` (repo `tipiodevelopment/vio-backend`)
- `vio-analytics.service` -> `127.0.0.1:5100` (repo `vio-live/vio-analytics`, Fastify + pnpm)

Consumo real con todo corriendo: **405 MB de 954**. Entra con holgura.

## Base de datos

Postgres 16.15 local, base `socket_server`, rol `vio`. Mismo tuning que prod
(`shared_buffers=128MB` etc.). Restaurado del dump del 2026-09-28: **39 tablas**
(38 en `public` + `drizzle.__drizzle_migrations`), users 6, sponsors 7, campaigns 6.

### Cómo se sacó el dump: la Postgres de staging no es accesible desde afuera

`pg-api-vio-staging` tiene `publicNetworkAccess: Disabled` y vive en una subnet delegada
(`snet-pg-staging`). No se puede hacer `pg_dump` desde una máquina externa. La salida fue un
**Container App Job efímero** dentro del mismo environment (y por tanto de la VNet), con
imagen `postgres:16-alpine`, que sube el dump a un blob con una SAS de escritura.

Tres cosas que costaron:

1. **`az containerapp job create --args` no separa por comas.** Pasarle `"-c,<script>"` guarda
   **un solo** argumento y el contenedor muere con `/bin/sh: illegal option -,`. `--args` tampoco
   acepta varios valores (`unrecognized arguments`). La solución fue crear el job por la **API de
   ARM** (`az rest --method put`) con `"args": ["-c", "<script>"]` como lista de verdad.
2. **Azure Blob rechaza `Transfer-Encoding: chunked`.** `pg_dump | gzip | curl -T -` falla con
   `UnsupportedHeader`. Hay que escribir a archivo y subir con `curl -T /tmp/d.gz`, que manda
   `Content-Length`.
3. **`curl` sin `-f` devuelve 0 aunque el HTTP falle**, así que el job daba `Succeeded` sin haber
   subido nada. Con `-fsS` el fallo es visible.

El job se **borró al terminar**: tenía el `DATABASE_URL` y la SAS como secretos.

Respaldo del dump: blob `saapivio/db-snapshots/staging-migracion-oracle-2026-09-28.sql.gz` y
copia local en `~/vio-backups/staging-migracion-oracle-2026-09-28/`.

### Ownership, otra vez

Igual que en prod: restaurar con `sudo -u postgres psql` deja las tablas con dueño `postgres`
y `migrate.mjs` falla con `must be owner of table`. Hay que reasignar tablas, secuencias, tipos
enum y el schema al rol de la app. Ya está aplicado.

## Hallazgos de configuración

**`NODE_ENV=development` en staging no significa lo que parece.** La Container App lo tenía
así, pero `server/preserver.ts` hace `process.env.NODE_ENV = 'production'` al arrancar y el
`CMD` del Dockerfile corre `dist/preserver.js`. O sea que staging **siempre corrió en modo
producción** (estáticos servidos, no Vite dev server). Acá se puso `production` explícito.

**`FIREBASE_SERVICE_ACCOUNT_JSON_B64` no se lee en ningún lado.** Estaba configurada en la
Container App de staging, pero `grep` sobre todo el repo no la encuentra: el código sólo lee
`FIREBASE_SERVICE_ACCOUNT_PATH`, que es una ruta a archivo. **El Admin SDK de staging nunca
funcionó.** Acá se decodificó el b64 a `/opt/vio-backend/firebase-sa.json` (service account de
`reachu-qa`, verificada) y se apuntó `FIREBASE_SERVICE_ACCOUNT_PATH` ahí, así que en Oracle sí
funciona. Conviene arreglar la Container App o el código para que no vuelva a pasar.

**Dominios autorizados de Firebase:** `api-staging.vio.live` ya estaba en `reachu-qa`.
`events-staging.vio.live` no, pero sirve analytics, que no tiene login — no hace falta.

## Systemd

Ambos servicios con `Restart=always`. El backend replica el `CMD` del Dockerfile con
`ExecStartPre=/usr/bin/node scripts/migrate.mjs`, así que corre migraciones antes de arrancar.

**Efecto secundario:** tras un reinicio el backend tarda **~48 s** en escuchar (migrate + build
del arranque), y en esa ventana nginx devuelve **502**. Es aceptable para staging, pero si
molesta se puede sacar el `ExecStartPre` y correr migraciones sólo en el deploy.

## Verificado

- `api-staging.vio.live` y `events-staging.vio.live` -> 200 sobre HTTPS, certificado Let's Encrypt
- Analytics conecta a ClickHouse (`vio_staging.events @ vio-clickhouse.norwayeast.cloudapp.azure.com`,
  público con NSG 443 abierto) y tiene el sink de Mixpanel activo
- WebSocket `wss://api-staging.vio.live/ws/1` conecta y se sostiene 25 s
- Config de Firebase de `reachu-qa` incrustada en el bundle del cliente
- El fix del 404 por API key desconocida está desplegado
- **Reinicio completo probado**: los 4 servicios levantan solos, swap e iptables persisten

## Pendiente: dar de baja lo de Azure

Nada se borró todavía. Lo que sigue costando en `rg-api-vio-staging`:

| Recurso | NOK/mes | Se puede apagar sin borrar |
|---|---|---|
| `pg-api-vio-staging` | 146 | sí (`az postgres flexible-server stop`) |
| `capp-svc-lb` (LB del environment) | 127 | no, hay que borrar el environment |
| `capp-svc-lb-ip` | 25 | no, idem |
| `ca-api-vio-staging` | 42 | ya escala a 0 |
| `ca-analytics-vio-staging` | 34 | ya escala a 0 |
| Log Analytics + DNS privado | 8 | - |

Ojo: hay jobs `pg-start-api-vio-staging`, `pg-stop-api-vio-staging` y `db-restore-staging` en
ese RG. Revisar qué hacen antes de borrar nada.
