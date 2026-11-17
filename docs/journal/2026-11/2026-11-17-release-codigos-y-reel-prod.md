---
date: 2026-11-17
session: release a prod — códigos de descuento, Vio reel y arreglos de la guardia
participants: [angelo, claude]
status: live
---

# Release a prod: códigos de descuento + Vio reel (17/11, 21:00–23:05 UTC)

## Goal
Angelo: «sube todo a prod, todo lo que esté en develop». Va todo: la función de códigos de descuento (cupones
de Woo y Shopify, códigos de Vio, código de campaña con su interruptor «Active»), el reel (backend de
experiencias y analítica ADR-0043) y los arreglos de la guardia de Alan del 16 y el 17/11.

## Done
- **Migraciones en prod**, antes del primer merge, aplicadas con scripts idempotentes desde el pod de users:
  1792900 (`surface_experience` y `surface.management_api_key`), 1793000 (`surface_campaign_discount_code`),
  1793100 (columnas de códigos de plataforma, `discount_collection` y `discount_cart.campaign_id`) y 1793200
  (`surface_campaign_discount_code.active`). Prod estaba en 1792800.
- **13 releases por cherry-pick** (`release/codigos-y-reel-prod`), mergeadas una a una con el deploy terminado
  y los pods sanos antes de pasar a la siguiente:
  api [#79](https://github.com/vio-live/vio-api-microservice/pull/79) ·
  extensions [#79](https://github.com/vio-live/vio-extensions-microservice/pull/79) ·
  shopcart [#124](https://github.com/vio-live/vio-shopcart-microservice/pull/124) ·
  base-api [#71](https://github.com/vio-live/vio-base-api/pull/71) ·
  graphql [#44](https://github.com/vio-live/graphql/pull/44) ·
  campaigns [#36](https://github.com/vio-live/vio-campaigns-microservice/pull/36) ·
  webapp [#116](https://github.com/vio-live/webapp-vio-commerce/pull/116) ·
  products [#66](https://github.com/vio-live/vio-products-microservice/pull/66) ·
  orders [#54](https://github.com/vio-live/vio-orders-microservice/pull/54) ·
  users [#33](https://github.com/vio-live/vio-users-microservice/pull/33) ·
  payment-processors [#22](https://github.com/vio-live/vio-payment-processors-microservice/pull/22) ·
  middleware [#17](https://github.com/vio-live/vio-middleware-microservice/pull/17) ·
  collection [#22](https://github.com/vio-live/vio-collection-microservice/pull/22).
  Todos los servicios quedan en el kernel 1.0.292.
- **Arreglos de hoy incluidos**, antes mergeados y desplegados en QA:
  - «Total» con envío en la lista y los CSV de órdenes ([webapp#115](https://github.com/vio-live/webapp-vio-commerce/pull/115));
  - Vipps: si la tienda reembolsa todas las líneas antes del envío, se cobra lo no reembolsado y se libera el resto
    (caso 4741; [orders#53](https://github.com/vio-live/vio-orders-microservice/pull/53),
    [shopcart#123](https://github.com/vio-live/vio-shopcart-microservice/pull/123)). La revisión independiente
    encontró dos fallos que podían cobrar de más; se corrigieron antes del merge.
- **Comprobado en prod** (sesión «Woo Vio»):
  - con la key pública de un canal, la administración de descuentos da FORBIDDEN/403;
  - el prerrequisito de los tipos de descuento está aplicado y GetDiscountType lista los dos;
  - smoke con carritos de prueba en los 5 canales de Mote & Livsstil (crear, añadir, leer, borrar; código inexistente
    rechazado), sin pagos ni órdenes, y los carritos borrados.

## Decisions
- Angelo, 17/11: `QA-LIMIT1`, se acepta el margen de ~4 min que tarda Shopify en contar el uso; cobrar lo no reembolsado;
  «Total» = lo cobrado, con el envío aparte en el CSV; todo lo de develop a prod.
- extensions: la release mantiene el consumidor Pub/Sub de master (#14–#16: backoff y tope de reintentos), que develop
  no tenía; el resto de #77 sí entra.

## Blockers
- Lo de Faves de «Woo Vio» (regalo en el canal y aviso diario; migración 1793300) entró en develop después del corte:
  NO está en prod.
- `store-coupon-cart.unit.spec.ts` de shopcart falla también en develop: falta decidir si el test está desfasado.

## Next session
- **Angelo:** desplegar las apps custom de Shopify con `read_discounts` (vio-shopify-sync#136) y que cada marca lo
  acepte. Sin eso, los cupones de Shopify dan `missing_scope`.
- **Replit:** subir la SDK a la 0.40.1.
- Portar a develop el consumidor Pub/Sub de master (#14–#16) junto con #77, para que la próxima release salga sin diff.
- Alan: volver a probar en QA el caso 4741 y el «Total» con envío.
