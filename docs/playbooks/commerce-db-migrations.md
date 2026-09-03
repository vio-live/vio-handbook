---
title: "Migraciones de DB — Vio Commerce (package-database)"
last-updated: 2026-09-03
owner: miguel
status: live
---

# Migraciones de DB — Vio Commerce (package-database)

Guía operacional para correr migraciones TypeORM contra las DBs de Vio Commerce (`outshifter`, MySQL en Azure). Escrita después de sincronizar staging el 2026-09-03 (ver [journal](../journal/2026-09/2026-09-03-migraciones-staging-outshifter.md)), tras migrar los paquetes npm de `@reachu` a `@vio-`.

## Quién puede correr esto

Angelo (dueño del token npm de la cuenta `vio`) o Miguel (agente de infra, con el token guardado y `.npmrc` configurado localmente). Ya no depende de Alan.

## Repo y prerequisitos

- Repo: [`vio-live/package-database`](https://github.com/vio-live/package-database) (`@vio-/database`)
- Acceso GitHub a la org `vio-live`
- Token npm con acceso a paquetes privados del scope `@vio-` (pedir a Angelo o ver memoria de Miguel — no se documenta el valor acá)
- Password de `dbadmin` para el entorno target (staging/prod) — ídem, no se documenta el valor acá

## Setup

```bash
git clone https://github.com/vio-live/package-database.git
cd package-database
yarn install   # necesita el token npm en ~/.npmrc o en .npmrc local del repo:
               # @vio-:registry=https://registry.npmjs.org/
               # //registry.npmjs.org/:_authToken=<token>
cp .env.migrations.example .env
```

Editar `.env`:
```
TYPEORM_HOST=<host del entorno target>
TYPEORM_PASSWORD=<password real>
TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}
```

⚠️ El `.env.migrations.example` del repo traía `TYPEORM_SSL=...`, que **no existe** en el env-reader de typeorm 0.2.41 (solo lee `TYPEORM_DRIVER_EXTRA`). Sin `TYPEORM_DRIVER_EXTRA`, la conexión sale sin SSL y Azure MySQL la rechaza. Fix ya mergeado en el repo (ver PR #5) — si tu clon es viejo, aplicá el cambio a mano.

## Cómo correr una migración

**Siempre una por vez**, nunca el wildcard completo:
```bash
DB_MIGRATION_FILE=<archivo>.ts yarn migration:execute
```

No usar `yarn migration:execute` sin `DB_MIGRATION_FILE` — `src/migrations/index.ts` es un archivo obsoleto que reexporta solo 10 migraciones de 2021-2022; typeorm las cuenta duplicadas y falla. (Este archivo es parte de la API pública del paquete — `src/index.ts` y `src/utils/index.ts` lo usan — así que no se puede simplemente borrar; queda como deuda técnica conocida.)

## Antes de correr cualquier migración

1. **Confirmar backup reciente**: `az mysql flexible-server backup list --resource-group rg-vio-databases --name <server-name>`
2. **No asumir que "pendiente" = "hay que correrla"**. El historial de migraciones tiene entradas obsoletas (superadas por migraciones posteriores que renombran/eliminan las mismas columnas) y entradas donde el schema ya está aplicado pero el tracking quedó atrasado (pasó en staging: 149/194 trackeadas pero el schema real ya tenía casi todo). Antes de correr, verificar:
   - ¿La tabla/columna que crea ya existe? (`information_schema.columns`/`tables`)
   - ¿El campo que agrega sigue existiendo en la entidad actual (`src/entity/*.ts`)? Si no, está obsoleta.
   - ¿Alguna migración posterior la renombra o elimina? (`grep` del nombre de columna en todo `src/migrations/`)
3. Si una migración está "pendiente" pero el schema ya la refleja (o quedó superada), **no se corre** — se inserta el registro directo en la tabla `migrations` (mismo `timestamp` + `name` que el archivo) sin tocar el schema.
4. Nunca borrar archivos de migración viejos aunque estén superados — otros entornos (o una reconstrucción desde cero) dependen de correr la cadena completa en orden; una migración posterior puede hacer `DROP`/`CHANGE` sobre algo que solo la migración vieja crea.

## Verificación post-corrida

```bash
# Confirmar que no quedan pendientes
node -e "..." # ver script de verificación en el journal del 2026-09-03
```
O simplemente: comparar `SELECT name FROM migrations` contra los archivos de `src/migrations/*.ts` (excluyendo `index.ts`).

## Fixes de logging (PR #5, en `develop`, pendiente de merge)

`connect.ts` no imprimía nada a consola aunque la migración corriera bien (typeorm necesita `logging: true` explícito) y el catch tragaba errores sin marcar el proceso como fallido. Fix: `logging: ['migration','error']` + `process.exit(1)` en el catch + cierre de conexión en `migrations/execute/index.ts` (no en `connect.ts`, porque `src/examples/app01.ts` reusa `connect()` como conexión de app de larga duración).

## Prod

Mismo flujo, distinto host/password. Antes de tocar prod: repetir el chequeo de "pendiente real vs ya aplicado" — el estado de prod es independiente del de staging, no asumir que la misma lista de pendientes/obsoletas aplica.
