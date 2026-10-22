---
title: Que dispara (y que NO) una orden espontanea en prod — medido el 22/10
last-updated: 2026-10-22
owner: miguel
---

Pregunta de Angelo (22/10 22:35): «las ordenes llegaran bien y dispararan lo que hay que disparar?».
Esto es la cadena medida en produccion, no leida de la documentacion. Todo lectura.

## Lo que SI dispara

1. **La orden llega a la Shopify de Careless con su linea de envio.**
   `shopcart` → `processOrderPaidByCustomer` en `orders` → evento `order:paid` →
   `extensions.handleOrderPaid` → `createOrder`. **No esta condicionado** a channel, surface ni
   campana: un carrito pagado crea la orden. El envio se mapea por nombre y ya quedo verificado
   (`helthjem|2|#13435`, `bring|3584|#13452`).
2. **La autorizacion de Vipps.** `payment_method` de 1327: `mode partner`, MSN **1179558**,
   `express true`, `manageRefunds/manageCancellations true`. Webhook de partner registrado.
3. **Las dos redes de seguridad existen y corren:** CronJobs `shopcart-reconcile` (cada 10 min,
   `/checkout/payments/reconcile`) y `orders-reconcile` (cada 15 min, `/analytics/reconcile`).

## Lo que NO dispara hoy

### 1. Analitica: cero. Ni un evento.
`reportPaid` **sale antes de hacer nada** si la orden no trae surface:
`order.service.js:2072` → `if (surfaceId === null) return;`. Y en prod hay **0 filas en `surface`
y 0 en `campaign`**. Consecuencia: sin `order_paid` no hay nada en ClickHouse ni en Mixpanel, y no
hay atribucion (campaign_id / surface_id / buyer_ref).
**La red de seguridad tampoco salva esto:** `reconcileAnalytics` filtra
`order.surfaceId IS NOT NULL` (`order.service.js:2104`), asi que no reenvia lo que nunca tuvo
surface. No es un retraso recuperable: es un agujero.
Se cierra con **B3** (el channel de Aller, que es lo que genera surface y api key). Encaja con lo
que ya decia la checklist, pero el enunciado correcto es «hoy una orden no dispara **ninguna**
analitica», no «falta configurar».

### 2. Captura de Vipps: no hay quien la dispare.
Careless quedo en `captureMode: shipment` (22/10 19:26). En ese modo la captura **solo** ocurre por
`vippsOrderShipped` (`checkout.service.js:4105`), y su cadena empieza en un webhook de Shopify:

    Shopify orders/fulfilled | fulfillments/update
      -> extensions.receiveWebhook -> handleSaveTrackingNumber
      -> orders.tellShopcartAboutVipps(order, 'shipped')
      -> shopcart.vippsOrderShipped -> capture

**La Shopify de Careless tiene 0 suscripciones de webhook.** Comprobado por los dos caminos:
`GET /admin/api/2024-04/webhooks.json` → 0, y GraphQL `webhookSubscriptions(first:50)` → 0. Y para
tiendas de app custom Vio **no los registra a proposito** (`shopify.service.js:2270`: «app custom,
lo declara el app»). O sea: nadie le va a decir a Vio que la orden se envio, y la reserva **no se
captura nunca**.
La captura automatica existe **solo** para `captureMode: 'payment'` (`afterVippsOrder`,
`checkout.service.js:3878`). Con `account`, `capture()` lanza excepcion salvo que sea manual.

## Opciones para la captura (ninguna necesita deploy)

- **(a) `account`** — Careless captura desde su propio portal de Vipps. Es como trabajan hoy, cero
  riesgo de dinero sin cobrar por olvido nuestro. Un campo en la base.
- **(b) `payment`** — Vio captura en el momento de la orden. El dinero queda cobrado y las
  devoluciones las sigue gestionando Vio. Cobrar antes de enviar es peor practica, pero para un
  piloto de dos productos es asumible y reversible. **Es lo que recomiendo para el lunes.**
- **(c) seguir en `shipment` y crear el disparador** — registrar los webhooks en su tienda o que la
  app custom reenvie `orders/fulfilled`. Es lo correcto a medio plazo, pero es plomeria nueva sin
  probar a tres dias de la congelacion. Mientras no exista, la captura se puede hacer **a mano**
  por el endpoint de captura, orden por orden.

Decide Angelo: el `shipment` lo eligio el, con criterio; lo que no sabiamos es que le faltaba el
primer eslabon.

## Como volver a comprobar esto

- Surfaces/campanas: `select count(*) from surface` / `campaign` (hoy 0 y 0).
- Webhooks de Careless: el guion `docs/playbooks/scripts/verificar-orden-careless.sh` no los mira;
  se consultan con el token vivo de `shopify_connection` (conexion 541) por REST y GraphQL.
- Captura: en el log de shopcart, `[vippsOrderShipped]` dice el modo y si habia algo que capturar.
