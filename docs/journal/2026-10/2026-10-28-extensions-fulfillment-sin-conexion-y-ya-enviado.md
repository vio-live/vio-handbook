---
date: 2026-10-28
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-10-28 — extensions: setFulfillmentOrder con conexión null y 422

## Goal
Explicar y corregir dos errores de prod (28/10 03:18 UTC) del pedido 4129. El supplier es Careless (`dignitycollect.myshopify.com`) y el canal reseller (Aller/Replit) no tiene tienda Shopify. Careless lo envió desde su Shopify y la captura de Vipps disparó:
`Error calling setFulfillmentOrder: TypeError: Cannot destructure property 'accessToken' … as it is null` y `[setFulfillmentOrder] errorPostCall … 422`.

## Done
- **Causa del null:** orders `order-item:completed` llama a extensions `shopify/handleOrderItemCompleted/:itemId`. Con todas las líneas en COMPLETED, ese handler llamaba a `setFulfillmentOrder(seller.shopifyReseller, order.channelId, …)` sin mirar si el pedido venía del Shopify del reseller. En 4129, `shopifyReseller` es null. Además lo llamaba una vez por línea del supplier.
- **Causa del 422:** el webhook `orders/fulfilled` de Careless → `receiveOrderFulfilled` → orders `saveTrackingNumber` → orders `updateTrackingInSupplierOrder` → extensions `shopify/setFulfillmentOrder/:supplierShopifyOrderId`. Ese pedido ya estaba enviado. `setFulfillmentOrder` tomaba el primer fulfillment order sin mirar el status (`closed`) y posteaba un segundo fulfillment.
- **Fuga en logs:** ese log de error hacía `JSON.stringify` del error de axios completo, que incluye `config.headers` y con ellas `X-Shopify-Access-Token`. Los debug volcaban los fulfillment orders con la dirección, el email y el teléfono del comprador.
- Fix en la rama `fix/fulfillment-sin-conexion-y-ya-enviado`, commit `cb491db`, **PR vio-live/vio-extensions-microservice#50** a develop (sin mergear ni desplegar):
  - `handleOrderItemCompleted` solo crea el fulfillment si `channel === Shopify`, hay `channelId` y una conexión con url y token, y lo hace una sola vez;
  - `setFulfillmentOrder` sin conexión → `{}`; elige un fulfillment order `open`/`in_progress`; si solo quedan cerrados → `{ alreadyFulfilled: true }` sin POST;
  - los logs pasan por `describeShopifyError` (status + `errors`) y `logPayload`;
  - lógica pura en `src/modules/shopify/providers/shopify-fulfillment.ts`, con 14 tests en `src/modules/shopify/tests/shopify-fulfillment.unit.spec.ts`. Contra el código anterior fallan 6.

## Decisions
- "Ya enviado en Shopify" cuenta como éxito, no como error. La respuesta HTTP a orders sigue siendo 200, así que no hace falta cambiar orders.

## Blockers / open questions
- Hay un token de Shopify (Careless) que pudo quedar en los logs de prod en la línea `errorPostCall`, y en cualquier 4xx/5xx anterior de `setFulfillmentOrder`. Conviene revisar la retención de logs o rotar ese token: lo decide Angelo.
- Problemas en orders (no es mi lane): (1) refleja en el Shopify del supplier un tracking que vino de ese mismo Shopify (`trackingProcessor: Shopify`), lo que sobra; (2) lee `answer.data?.id`, pero Shopify responde `{ fulfillment: { id } }`, así que `supplierFulfillmentIds`/`resellerFulfillmentId` de Shopify nunca se guardan.
- En develop, `shopify-compensacion.spec.ts` ya falla (espera el body sin `lines: []`).

## Next session
- Revisar y mergear el #50; desplegar a QA y luego a prod cuando Angelo lo diga.

## Addendum — ronda de revisión (commit `8ed73f7`, mismo PR #50)
- "Ya enviado" solo si todos los fulfillment orders no cancelados están `closed` (con items, los que los contienen). `closed` + `on_hold`/`scheduled`/`incomplete` → nada que enviar, con warning.
- Con items: se agrupan por el fulfillment order abierto que tiene cada línea, un fulfillment por fulfillment order. Sin items: se envían todos los abiertos.
- Refresh del token dentro del `try`. 21 tests en `shopify-fulfillment.unit.spec.ts`, todos en verde.
- Pendiente aparte: otros métodos del servicio (`Logger.error` en ~1269, ~2154, ~2623, ~4049) siguen haciendo `JSON.stringify` de errores de axios, con el mismo riesgo de filtrar el token.
