---
title: Colector 132887e en staging, la compensación ya casa, y el log de cancelOrder
date: 2026-10-20
author: Miguel
tags: [analytics, compensaciones, staging, seguridad, orders]
---

## Qué hice

Los tres puntos que me pidió Claude en
`docs/handoff/2026-10-19-coordinacion-claude-miguel.md` (entradas de 12:19 y 12:50 UTC).

- Quién: Miguel, coordinado con Claude (él hizo orders #29 y vio-analytics #26).
- Dónde: VM de staging del colector `129.151.196.99`, cluster `kubernetesqa-sc` (QA),
  repo `vio-live/vio-orders-microservice`.
- Cuándo: 20/10/2026, 13:04–13:20 UTC.
- Contexto: ayer y esta mañana toda compensación salía `unmatched` porque la compra lleva el
  UUID del checkout y la compensación el número de Vio. Claude cerró las dos puntas; a mí me
  tocaba desplegar y comprobar que el camino bueno existe de verdad.

## 1. Colector al 132887e (staging)

- Procedimiento de siempre (la VM **no tiene `.git`**): tarball con `git archive` del commit,
  respaldo previo en `/home/ubuntu/vio-analytics-backup-20261020-130426.tgz`, extraer,
  `pnpm install --prod=false`, `pnpm build`, `systemctl restart`.
- El tarball no llevaba ningún `.env` (solo el `.env.example` versionado): comprobado antes de subirlo.
- `md5` de `src/app.ts`, `src/stats-compensation.ts` y `src/sinks/clickhouse.ts` **idénticos** a los
  del commit en local. `uptime_s` 8 s tras el restart (prueba de que el proceso es el nuevo).
- **El ALTER corrió:** `DESCRIBE vio_staging.events` da `checkout_id String DEFAULT ''`
  justo detrás de `order_id`. Cero errores en el journal, `clickhouse.lastError: null`.

## 2. La cancelación de prueba que SÍ casa (13:08:01 UTC)

Elegí la orden **4582** porque es la única de los últimos 3 días con compra en ClickHouse
(`8cea273b-08c4-41fd-9747-ab037ab123b1`, 179 NOK, surface 3, campaña 9). Estado previo:
1 item `PROCESSING`, `payment_processor` VIPPS de test, `channel` Partner, reseller 1312.

- `POST /4582/cancel` al micro (port-forward al pod `orders-66fbdc8d6b-wqdxd`, que ya corre #29) → **200**.
- orders: `[orderService.compensate] order 4582 order_cancelled f902c03e-…: 179 NOK from 1 line(s),
  full=true, source=dashboard, **checkout_id=yes**` y `accepted by the collector (attempt 1)`.
- Colector: `compensation: {resolved:1, unmatched:0, refused:0}`.
- `recent?name=order_cancelled&client_app_id=3` → 1 evento con `order_id: "4582"` **y**
  `checkout_id: "8cea273b-…"`, campaña 9, sponsor 1289.
- `surface/overview` de la surface 3, antes → después:
  `purchases` 147 → **147** (no se toca, correcto), `purchases_net` 147 → **146**,
  `gmv` 127411 → **127232** (-179), `gmv_gross` 127411 → **127411** (no se toca),
  `refunded_value` 0 → **179**, `cancelled_orders` 0 → **1**.
- Vipps de test devolvió el dinero: `vipps cancelled for order 4582: {"cancelled":true}`.

Con esto el camino bueno queda **verificado de punta a punta**, no deducido.

## 3. PR del log de cancelOrder

`vio-orders-microservice` **[#30](https://github.com/vio-live/vio-orders-microservice/pull/30)**
(a `develop`, sin mergear: lo revisa Claude).

- La línea `order N found` imprimía `JSON.stringify(order, omitBuyerRef)`: con las relaciones
  eager eso vuelca el reseller entero (`apiKey`, `apiToken`, `squarespaceApiToken`,
  `facebookAccessToken`, `orderWebhookSecret`) y el customer (nombre, email, teléfono, dirección).
  **Medido: 3.197 bytes** en el log de QA de esta cancelación.
- Ahora la arma `orderLogSummary`: `id=4582 channel=Partner processor=VIPPS currency=NOK reseller=1312`.
- Test nuevo `order-cancel-log.unit.spec.ts` (14 casos). **Mutado a propósito**: revertí el cambio
  del servicio y el caso de `cancelOrder` cae; con el cambio, 18 suites / 520 tests en verde.

## Pendiente / hallazgos

- `POST /:orderId/cancel` sin `data.user` responde **500** (`Cannot read properties of undefined`)
  en vez de 400. Me pasó en el primer intento. El dashboard siempre manda el user, así que no
  bloquea nada; es robustez del endpoint.
- Quedan dos `logger.debug` de `[orderService.save]` (`orderData` y `savedOrder`) con la misma
  forma que el de cancelOrder. **En QA el nivel debug sí se emite.** No los metí en #30 para no
  mezclar; anotado en el PR.
- El CronJob `shopcart-reconcile` tiene un pod en `Error` de las 06:44 UTC (anterior a todo esto);
  los siguientes salieron `Completed`.
- Prod: **nada tocado**. Ni colector, ni variables, ni cancelaciones.

## Añadido 15:00 UTC — la otra mitad del log

- #30 lo mergeó Claude a las 13:20 UTC (CI verde, pod de QA nuevo desde ~13:25: el fix de
  `cancelOrder` ya corre en staging).
- Angelo pidió que subiera también los dos `logger.debug` de `orderService.save`:
  **[orders #31](https://github.com/vio-live/vio-orders-microservice/pull/31)** a `develop`, sin mergear.
  - `omitPrivate` sustituye a `omitBuyerRef` en `save` (orderData y savedOrder) y en `create` (dto):
    mantiene el volcado (la atribución se lee de ahí y hay tests que dependen) y saca las
    credenciales por nombre de clave a cualquier profundidad como `[redacted]`, reduce
    `reseller`/`supplier`/`channelUser`/`user` a su id y quita el `customer` entero.
  - Test `order-save-log.unit.spec.ts`, 25 casos, **uno contra el servicio** (no solo sobre el
    replacer) y uno que compara con `omitBuyerRef`. **Mutado**: cae si se devuelve `omitBuyerRef`
    al servicio. 19 suites / 545 tests en verde, sin avisos nuevos de eslint.
- Flaky visto una vez: el caso de los 2000 ms de `order-compensation-on-transitions.unit.spec.ts`
  (el timeout del lookup de `checkout_id`, de #29) cayó en una corrida completa y pasó aislado y en
  las siguientes. Sensible a tiempos con las 19 suites juntas. Anotado en el PR, no tocado.
