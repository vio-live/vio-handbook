---
title: "Release de atribución en prod: punto de restauración, 3 migraciones, variables y colector 132887e"
date: 2026-10-21
author: Miguel
tags: [prod, migraciones, analytics, compensaciones, secretos, release]
---

## Qué hice

Los pasos 1–4 del runbook de Claude
`docs/handoff/2026-10-21-release-prod-analytics-y-atribucion.md` (ADR-0034/0035/0036 a producción).

- Quién: Miguel. Reparto acordado con Claude en `docs/handoff/2026-10-19-coordinacion-claude-miguel.md`:
  yo pasos 1–4 + apps de Shopify + credenciales; él mergea y verifica el paso 5 (los 15 PRs).
- Dónde: base `vio-ecom-db-prod-sc` (RG `rg-vio-databases`), cluster `vio-commerce-prod-sc`,
  VM del colector de prod `82.70.54.151` (`events.vio.live`), ClickHouse `analytics.vio.live`
  (base `vio_production`).
- Cuándo: 21/10/2026, 07:55–08:12 UTC.
- Contexto: Angelo pidió subir a prod esta mañana. Lo que está en QA/staging desde el 19–20/10 pasa a
  prod para que la primera campaña real nazca atribuida y con analytics completo.

## 1. Punto de restauración (08:00:28 UTC)

`az mysql flexible-server backup create --backup-name pre-release-20261021` → `provisioningState:
Ready`, tipo FULL. El servidor ya tenía PITR con retención de 35 días (earliest 29/09) y
`geoRedundantBackup: Disabled` (Sweden Central no lo soporta, ya documentado). El CronJob
`mysql-prod-offsite-backup` sigue roto por diseño y diferido por Angelo: para este release la red de
seguridad es el backup de Azure.

## 2. Las tres migraciones (base `outshifter`)

Scripts idempotentes de `docs/handoff/assets/2026-10-19-staging/`, copiados al pod
`users-64c49f7bf6-b6qn9` y ejecutados **uno a uno**. Antes de copiar nada comprobé que el pod tiene
`/usr/src/app/.env` (no `.env.local`) y `mysql2` + `dotenv` en `node_modules`.

| Script | Resultado |
|---|---|
| `m-slot-kind-prod.js` | `surface_slot.kind` varchar(32) NULL + fila `SurfaceSlotKind1792200000000` |
| `m-order-attribution-prod.js` | **10 columnas**: `order` +6, `order_item` +3, `surface_campaign.publisher_commission_pct`; `IDX_order_surface_campaign` creado |
| `m-cart-attribution-prod.js` | `cart_item.origins` y `checkout.attribution` como `json`; los 5 textos a utf8mb4 por DROP+ADD (estaban vacíos) |

Última fila de `migrations`: **`CartAttributionUtf8mb41792400000000`** (prod venía de
`SurfaceCampaignSlotSource1792100000000`). Todas las columnas son nuevas y `NULL`: nada existente
cambió. La corrección de Claude al script 3 (leer `.env` y no `.env.local`) era necesaria.

## 3. Variables de prod

En los Secrets `env-sc-<svc>`, que es lo que leen los pods (el `.env` horneado queda tapado).

- `env-sc-orders`: `ANALYTICS_EVENTS_URL=https://events.vio.live` (**sin path**, el micro añade
  `/v1/events`) y `ANALYTICS_INTERNAL_TOKEN` = el `INTERNAL_EVENTS_TOKEN` **full**, que leí de la VM
  de prod en vez de de mis notas (coincide).
- `env-sc-shopcart`: `BUYER_REF_SECRET` nuevo (`openssl rand -hex 32`), **distinto al de QA** a
  propósito. Anotado en TOOLS.md en la misma pasada.
- `env-sc-base-api`: ya tenía `ANALYTICS_STATS_URL=https://events.vio.live` y
  `ANALYTICS_INTERNAL_TOKEN`; **comprobé por comparación de hash que es el de LECTURA**, no el full.
  Mínimo privilegio intacto.
- Respaldos de los dos Secrets modificados en
  `~/.openclaw/workspace-miguel/backups/prod-release-20261021/`.

**Detalle que importa:** el Secret se monta con `subPath: .env`, y con subPath **el volumen no se
refresca en caliente**. Las tres variables entran cuando los merges del paso 5 recreen los pods; el
pod de orders que corría durante este trabajo seguía sin ellas, y eso es lo esperado, no un fallo.

## 4. Colector de prod a `132887e`

La VM **no tiene `.git`**: mismo procedimiento que en staging el 20/10.

- Respaldo previo `/home/ubuntu/vio-analytics-backup-20261021-075942.tgz` (sin `node_modules`).
- Tarball por `git archive` del commit desde un clon limpio; **md5 idéntico** en origen y destino
  (`f35ee7ec…`); dentro solo `.env.example`, ningún `.env` (comprobado antes de subirlo).
- `pnpm install --prod=false`, `pnpm build` (esbuild, bundle único de 156 KB), `systemctl restart`.
- `md5sum` de `src/app.ts`, `src/stats-compensation.ts` y `src/sinks/clickhouse.ts` **idénticos** al
  commit en local. `.env` de la VM intacto.
- Tras el restart: `uptime_s: 8`, `[clickhouse] schema ready (vio_production.events)` **sin errores
  de ALTER**, y `/health` ya trae `compensation {resolved:0, unmatched:0, refused:0}`.
- `system.columns` confirma el ALTER: `checkout_id` detrás de `order_id`, más `items.campaign_id` e
  `items.location_id`.

## 5. Cableado verificado contra el entorno real

- `GET /v1/stats/surface/overview?days=7` con el token de **lectura** → **200** con `gmv_gross`,
  `purchases_net`, `refunded_value` y `cancelled_orders`. Sin token → **401**.
- Desde el **pod de orders de prod**: envelope válido sin `client_app_id` + token **full** → **400
  «internal batches must set client_app_id»** (pasó la auth interna y **no escribió nada**); el mismo
  envelope con un token falso → **401 «missing api key»**.
- **Trampa que evité:** `POST /v1/events` con `{}` da **400 con cualquier token**, porque el schema
  del envelope corre **antes** de la auth. Ese 400 no prueba el token; el que lo prueba es el del
  envelope válido. Ver `docs/lessons/el-codigo-de-error-depende-de-la-capa.md`.

## Lo que NO se puede verificar en prod hoy

Prod está vacío de lo que haría falta para la prueba funcional:

- `surface` **0 filas**, `surface_campaign` 0, `surface_slot` 0; `order` 14, todas viejas.
- ClickHouse `vio_production.events` a **0 eventos**.

El overview que devolvió 200 lo pedí con `client_app_id=1`, que **no existe**: prueba el camino y la
auth, no que haya datos. La prueba de ADR-0036 de punta a punta (compra real → cancelación →
`purchases_net` baja y `gmv_gross` no) **no hay con qué hacerla ahora mismo**; queda anotada para la
primera campaña real, sin darla por buena. En staging sí está verificada (orden 4582, 20/10).

## Pendiente

- **Paso 5 (los 15 PRs): Claude**, avisado en el doc de coordinación a las 08:10 UTC.
- Míos, después del paso 5: `cmp-envtest-vs-prod.py` y rotar **solo** lo que salga «COINCIDE CON
  PROD» (el pod de prod tiene un `.env.test` de 6316 bytes del 16/10), y los dos `shopify app deploy`
  (`vio-sync-staging` y `vio-sync`), que piden el login del CLI de Shopify y los lanza una persona.
- `google-merchant-feed#5` (nodejs22) a prod, con fecha límite **30/10**.
