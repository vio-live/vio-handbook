---
date: 2026-09-29
session: "Vipps: partnership directo, Express y la integración reconciliada con ePayment"
participants: [angelo, claude]
status: live
---

# Vipps: del mail de Fredrik a seis PRs

## Goal

Vipps ofreció un partnership (unidad de venta por anunciante, partner keys, Express). Angelo:
reconciliar la integración que tenemos con su documentación actual, que funcione de punta a
punta con todas las opciones, mapear Express como en Apple Pay, y mirar el camino de las
órdenes (Shopify con la app instalada; el feed).

## Done

- **Investigación contrastada** (doc oficial + nuestro código): lo que había y lo que faltaba
  está en [`architecture/vipps.md`](../../architecture/vipps.md). Lo peor: nadie capturaba,
  el webhook no verificaba firma ni tenía idempotencia, las cabeceras llevaban los valores de
  ejemplo de la doc, y capture/cancel usaban el id equivocado.
- **[ADR-0024](../../decisions/0024-vipps-por-partnership-directo.md)**: Vipps por
  partnership directo; Connect queda aparte.
- **Fase 1, shopcart** ([#45](https://github.com/vio-live/vio-shopcart-microservice/pull/45)):
  tres modos de credencial, Express siempre que se pueda, referencia del vendedor, recibo con
  nuestro número de orden, una sola ruta de completar bajo lock, los 8 eventos con firma,
  capture/refund/cancel, Vipps en el barrido. 435 tests.
- **Fase 2**: base-api relay firmado ([#21](https://github.com/vio-live/vio-base-api/pull/21)),
  api-ms sonda en modo partner + secretos ([#30](https://github.com/vio-live/vio-api-microservice/pull/30)),
  dashboard con modo/captura/devoluciones/Express y el botón «Connect» del webhook ([#40](https://github.com/vio-live/webapp-vio-commerce/pull/40)).
- **Fase 3**: gateway con `express` y email opcional ([#16](https://github.com/vio-live/graphql/pull/16));
  SDK con los botones de producto y carrito en Express, un clic en el checkout
  ([#69](https://github.com/vio-live/vio-web-sdk/pull/69)).
- **Órdenes**: verificado que no hace falta construir nada para crearlas — `order:paid` ya crea
  la orden en Shopify (extensions, `source_name: channel:<handle>`) y dispara `order.paid` para
  el feed.
- **El dinero sigue a la orden** (tarde): despachar captura (si el vendedor eligió «al
  despachar»), cancelar libera o devuelve — orders-ms → shopcart por id de orden; extensions ya
  relaya el `orders/fulfilled` de Shopify a `saveTrackingNumber`, así que el fulfillment del
  comercio captura solo. `note_attributes.vio_order_id` en la orden de Shopify
  ([extensions#12](https://github.com/vio-live/vio-extensions-microservice/pull/12)); MSN de
  una unidad del partnership asignable por endpoint interno (api-ms#30).

## Decisions

- Express solo con un supplier; con varios, checkout clásico (Vipps deja elegir un envío).
- `captureMode` por defecto = el portal del vendedor; referencia `VIO-{checkout}` (la orden no
  existe al crear el pago; el número va en el recibo); la orden de Shopify sigue saliendo
  `paid`.
- El MSN en modo partnership lo pone Vio; el dashboard no lo muestra editable.
- Sin secreto de webhook configurado, el aviso es una pista y el estado de Vipps decide.

## Blockers

- **Los seis PRs siguen abiertos** al cierre de la sesión (Angelo dijo dos veces «mergeados»;
  la API de GitHub dice `merged=false`). Nada está desplegado en QA todavía.

- **Programa de partners**: hay que solicitarlo (Vipps lo pidió); sin eso no hay entorno de
  test con claves de partner. En QA hacen falta las claves de una unidad de prueba y un usuario
  de prueba con la app MT.
- El worktree del dashboard no compila con `node_modules` enlazado por symlink (Next resuelve
  módulos duplicados); con una copia APFS sí.
- El `.git` de `vio-base-api` rechaza escribir objetos sueltos (fetch y commit); el PR salió
  de un clon fresco.

## Next session

- Merge de los seis PRs y E2E en QA (producto → app → orden → Shopify dev store →
  `order.paid`; capture/refund/cancel; firma en logs; barrido).
- Rebundle de Vev con el SDK.
- Captura al despachar desde el fulfillment de Shopify.
- Prod: partner keys, alta partner del webhook, checklist de ePayment.
