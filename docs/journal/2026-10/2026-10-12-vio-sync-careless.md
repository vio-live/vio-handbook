---
date: 2026-10-12
session: vio-sync-careless
participants: [angelo, claude]
status: live
---

# Session — 2026-10-12 — Careless, quinta app custom, y las apps revisadas en el cluster de Suecia

## Goal

Crear la app custom de Shopify para un cliente nuevo, **Careless** (careless.no), y antes
revisar que todo lo que habíamos dejado arriba siguiera funcionando, y de paso las otras
apps. En el medio: prod se había mudado a Suecia el 29/09, estuvo apagado del 05/10 hasta
hoy a las 16:15, y Miguel subió `develop` a prod a las 17:00
([su entry](2026-10-12.md)).

## Done

**Las cuatro apps de antes, verificadas en el cluster nuevo (`vio-commerce-prod-sc`)**
- Código: las cuatro corren `491a282` (#107 + #108), lo último de `custom/client-app`;
  `healthz` 200, `/internal/audit` 401 (rutas encendidas).
- `extensions` tiene el #9 y el #10 y **pide el token al app** (`tomado del app`), sin el
  refresh viejo. Gladkokken y Makeup Mekka recibiendo webhooks; la demo bien. **Villoid
  sigue en 0 installs** (Dev Dashboard).
- **Un problema de hoy**: desde que prendió prod, todos los push de tokens de las apps
  fallaban (`/internal/sync-tokens` 502). Trazado: `users-ms` registra el push pero corta a
  los 30 s esperando `getShopInfo` de `extensions`, que tardaba **~575 s** porque todas sus
  llamadas a Shopify pasan por un limitador de 2 por segundo por pod y estaba drenando la
  semana de webhooks acumulados. No se perdía nada (`extensions` igual pide el token al
  app), pero **cualquier connect nuevo habría fallado**. Miguel lo midió con
  `num_undelivered_messages` (79.184 → 50.259 en 43 min, sin reentregas) y confirmó la causa.
  A las 18:30 Oslo los push volvieron a responder 200 en menos de 2 s.

**Careless, de cero a lista para mandar el link**
- Tienda **`dignitycollect.myshopify.com`**, verificada dos veces (`meta.json` y
  `Shopify.shop`); NOK, Noruega.
- App "Vio Sync" en el Dev Dashboard: id **`434547228673`**, client id
  `dd30cfd709d3f09dbdec6c81674f350c`. Distribución custom y link generados por Angelo; el
  link **vence el 2026-10-19 17:12** (verificado decodificando la firma).
- Config `shopify.app.vio-client-careless.toml` (validada, `eb9f2f9` en `custom/client-app`)
  y versión **`vio-client-careless-1`** activa. **Gotcha**: el primer `shopify app deploy`,
  antes de la distribución custom, lo rechazó Shopify por los webhooks de órdenes (datos
  protegidos de clientes). Ya está en el playbook.
- Vercel `vio-sync-careless`, carpeta `~/vio-deploy-careless`: variables no secretas (Claude),
  `SHOPIFY_API_SECRET` y Redis compartido (Angelo), `CRON_SECRET` y `VIO_CUSTOM_APPS`
  (Miguel). `healthz` 200, API 2026-04, mismo comportamiento que Makeup Mekka.
- Cuenta de Vio **1327** (`careless@tipio.no`, creada por Angelo): suscripción `active` y
  API key. (Miguel la tuvo que rescatar de un 401 por una regresión suya; ver su entry.)
- `VIO_CUSTOM_APPS` con **5 tiendas**: comprobado desde dentro de un pod de `extensions`, sin
  imprimir secretos, llamando a `/internal/token` de cada app con el secreto que tiene el
  mapa: demo, Gladkokken y Makeup Mekka **200**; Villoid y Careless **409 `no_session`**
  (secreto correcto, no instalaron).

**El flujo caminado antes del link**: Angelo exportó un producto en la tienda demo
(19:44:01). Auditoría del app con la acción `sync` y `vio_200`; `shopify-sqs` 200 en 221 ms;
"The Videographer Snowboard" importado a la cuenta 1322 con `SUCCESS` a las 19:44:03. Uno y
medio segundos del clic al producto en Vio, cero 401.

**Mensaje para Careless** en noruego, con la key como hueco (la pega Angelo) y el paso de
"Export selected" reforzado (tildar no alcanza: lo que confundió a Makeup Mekka). Queda como
variante en el [playbook](../../playbooks/shopify-app-custom-por-cliente.md).

## Decisions

- No mandar el link hasta que drenara `extensions` y estuviera el paso de Miguel; después
  de la prueba en la demo, Angelo lo manda.
- Villoid: esperar antes de mandar link nuevo (sigue la decisión del 29/09).

## Blockers / open questions

- El connect y el push de tokens pasan por `getShopInfo` síncrono en `users-ms`, que
  comparte el limitador de Shopify con todo el backlog: cualquier otro apagado largo repite
  el atasco. Mejora posible (no urgente): no pedir `getShopInfo` en cada push, solo en el
  primer connect.

## Next session

- Cuando Careless instale: seguir instalación, connect y primer export en los logs
  (`vercel logs --project vio-sync-careless`, auditoría, `importShopifyProduct to user 1327`).
- El link vence el 19/10 17:12.
