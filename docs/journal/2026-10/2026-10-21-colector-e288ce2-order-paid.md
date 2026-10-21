---
title: "Colector de analytics a e288ce2 (ADR-0038, order_paid) en staging y producción"
date: 2026-10-21
author: Miguel
tags: [analytics, order-paid, staging, prod, despliegue]
---

## Qué hice

Desplegar `vio-analytics` **`main` = `e288ce2`** (PR #27, `feat/order-paid`) en las **dos** VMs de
Oracle, por pedido de Angelo/Claude. ADR-0038 «el cobro lo dice Commerce».

- Quién: Miguel.
- Dónde: VM de staging `129.151.196.99` (`events-staging.vio.live`, base `vio_staging`) y VM de
  producción `82.70.54.151` (`events.vio.live`, base `vio_production`). ClickHouse en
  `analytics.vio.live`.
- Cuándo: 21/10/2026. Staging 10:01 UTC, producción 10:02 UTC.
- Contexto: el micro de orders ya emite `order_paid` en QA y el colector viejo lo **rechazaba por
  nombre**, sin reintento diferido: cada compra de prueba que se pagara antes del deploy perdía su
  registro de caja (la venta no, el `purchase` del navegador entra igual). Prod va antes que su
  emisor a propósito: el consumidor primero.

## Sonda, antes y después (no guarda nada)

`POST /v1/events` con un `order_paid` de `ts` 2001, con el token interno full de cada entorno:

- **Antes** (los dos): `rejected:1`, `name: Invalid enum value … received 'order_paid'`.
- **Después** (los dos): `rejected:1`, **`ts: outside accepted window`**. El nombre ya es válido y la
  fecha vieja impide que se guarde.
- **Comprobado en ClickHouse que no quedó rastro**: `countIf(name='order_paid')` = 0 y
  `countIf(order_id='probe-0')` = 0 en `vio_staging` (8.756 eventos) y en `vio_production` (0).

## Procedimiento (igual que el 132887e de esta mañana)

Las VMs no tienen `.git`: tarball por `git archive` del commit desde un clon limpio.

- `md5` del tarball idéntico en origen y en las dos VMs (`1f87c50a…`); dentro solo `.env.example`.
- Respaldos previos: staging `/home/ubuntu/vio-analytics-backup-20261021-100103.tgz`, prod
  `…-100201.tgz` (sin `node_modules`).
- `pnpm install --prod=false`, `pnpm build` (esbuild, bundle de 160,5 KB en las dos),
  `systemctl restart`.
- `md5sum` de `src/app.ts`, `src/rows.ts`, `src/stats.ts`, `src/contract/analytics-schema.ts` y el
  nuevo `src/stats-paid.ts` **idénticos al commit** en las dos máquinas. `.env` intacto.
- **Sin variables nuevas y sin migración**, como decía el encargo: el diff `132887e..e288ce2` no toca
  `src/sinks/clickhouse.ts`, y `order_paid` usa columnas que la tabla ya tenía.

## Verificación

| | staging | prod |
|---|---|---|
| `/health` | `ready:true`, `lastError:null`, `uptime_s` 8 | igual |
| `schema ready` | `vio_staging.events`, sin errores de ALTER | `vio_production.events`, sin errores |
| sonda `order_paid` | `ts: outside accepted window` | igual |
| backend de la misma máquina | `api-staging.vio.live/health` **200** | `api.vio.live/health` **200** |

- Los KPIs nuevos ya salen en el overview: `charged` y `charged_gross` (24 kpis).
- En staging, surface 3: `charged_gross` **179** y `charged` **0** — la caja bruta conserva el cobro y
  la neta descuenta la cancelación del 4582 de ayer. Es el comportamiento de ADR-0036/0038.
- `api-staging.vio.live/` y `api.vio.live/` dan **404 en la raíz**, igual que antes del deploy: esas
  máquinas no tienen ruta `/`. Lo que hay que mirar es `/health`, que da 200 en las dos. El 401 de
  `/v2/mobile/config` es auth y el 410 de `/v2/commerce/*` es el corte intencionado del 13/10.

## Un número que conviene no malinterpretar

El overview de surface 3 con `days=7` da **`purchases: 1`**, no los 147 que se citaron ayer al
verificar la cancelación. **No es una regresión del deploy**: en la tabla, surface 3 tiene 161
`purchase` históricos, pero por día solo hay **10 el 12/10 y 1 el 19/10**, así que una ventana de 7
días (14–21/10) contiene exactamente uno. El 147 de ayer venía de una ventana distinta.

## Pendiente

- La verificación funcional de punta a punta en QA la hace Angelo: una compra con envío debe dar
  `charged` = líneas + envío mientras `gmv` se queda en líneas, y al cancelarla baja `charged` pero
  no `charged_gross`.
- En prod, `orders` **todavía no emite** `order_paid` (el cambio está en `develop`); entra con el
  próximo release a `master`.
