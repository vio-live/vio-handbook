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

## Como cobra Careless HOY (medido en sus propias ordenes, 22/10 23:00)

Angelo pidio mirarlo en vez de suponerlo. Leido de su Shopify con el token vivo:

- **Su pasarela es Qliro** («pay now or later»), **no Vipps**: 40 de 40 ordenes de la muestra del
  17/10, mas un `gift_card`. Vipps no aparece en su web.
- **El patron es exactamente autorizar al pedir y capturar al despachar**, y lo hace Shopify solo:
  la captura entra **1-2 segundos despues** del fulfillment. Ejemplos reales:
  `#552241CL` fulfillment 19/10 13:04:14 → capture 13:04:16; `#552236CL` 13:18:49 → 13:18:51.
- **Despachan en lotes**, no al momento: orden del 17/10 22:40 → enviada y cobrada el 19/10 ~13:00.
  Unas 36-39 h, en franja de mediodia.

**O sea que la eleccion de Angelo (`shipment`) es literalmente el modelo con el que ellos operan.**
El problema no es el modo: es que a Vio le falta el aviso.

**Y hay un detalle que lo hace inevitable:** la orden que crea Vio nace en Shopify con
`financial_status: 'paid'` y una transaccion `kind: 'sale'` puesta por nosotros
(`shopify.service.js:2434`). Para Shopify ya esta cobrada, asi que **la automatizacion de Qliro no
tiene nada que capturar en las ordenes de Vio**. El dinero de verdad es la reserva de Vipps que
tiene Vio, y **solo Vio puede capturarla**.

### Por que no es un olvido con Careless
Lo mire en las cuatro conexiones vivas de prod, por GraphQL con el token de cada una:

- `vio-demo.myshopify.com` → 0 webhooks
- `wxuxre-tf.myshopify.com` (Gladkokken) → 0 webhooks
- `makeup-mekka.myshopify.com` → 0 webhooks
- `dignitycollect.myshopify.com` (Careless) → 0 webhooks, y **0 `fulfillment_services`**

Mas: **0 lineas de `receiveWebhook` / `receiveOrderFulfilled` en el log de `extensions` en 6 h**, de
ninguna tienda. Y prod no ha tenido nunca una orden de un proveedor Shopify (las 14 de `order` son
de 1295 y 1300, de prueba). Conclusion: **la cadena envio → captura no ha corrido nunca en
produccion para nadie**. El camino de apps custom nunca uso webhooks de Shopify.

El barrido de pagos (`shopcart-reconcile`) **si** cubre Vipps, pero para otra cosa: llama a
`paymentVippsOk` (rescatar una autorizacion que no llego a orden), no captura por envio.

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

Decide Angelo: el `shipment` lo eligio el, con criterio **y coincidiendo con como operan ellos**;
lo que no sabiamos es que le faltaba el primer eslabon.

**Recomendacion con lo medido:** para el lunes, `payment` es el unico modo que cobra sin plomeria
nueva. Se desvia de su costumbre (ellos cobran al enviar), pero Vio les gestiona devoluciones y
cancelaciones (`manageRefunds`/`manageCancellations` en `true`), asi que una cancelacion antes del
envio se resuelve como devolucion en vez de como reserva liberada. Si se prefiere no desviarse,
la alternativa realista a volumen de piloto es dejar `shipment` y **capturar a mano** por el
endpoint cuando Careless despache — con dos productos y pocas ordenes es sostenible una semana.

**Nota de seguridad, aparte:** `receiveWebhook` **no verifica HMAC** de Shopify (no hay
`x-shopify-hmac` ni validacion en el controller ni en el servicio). Si algun dia se registran
webhooks HTTPS hacia `api-ecom.vio.live`, eso es un camino de escritura sin firma abierto a
internet. No es de ahora y no toca antes del lunes, pero que quede escrito.

## Como volver a comprobar esto

- Surfaces/campanas: `select count(*) from surface` / `campaign` (hoy 0 y 0).
- Webhooks de Careless: el guion `docs/playbooks/scripts/verificar-orden-careless.sh` no los mira;
  se consultan con el token vivo de `shopify_connection` (conexion 541) por REST y GraphQL.
- Captura: en el log de shopcart, `[vippsOrderShipped]` dice el modo y si habia algo que capturar.

## «Si nuestras ordenes pasan al 3PL, no podemos hacer lo mismo?» (Angelo, 22/10 22:58)

Si, el mecanismo es el mismo —detectar el envio y capturar— pero **no por webhooks**, y ahora se
sabe exactamente por que.

**La causa raiz: la app custom no tiene el permiso.** Leidos los scopes de la instalacion en
Careless (`currentAppInstallation.accessScopes`, app **«Vio Sync»**, apiKey `dd30cfd7…`): 15 scopes
y **`write_webhooks` NO esta**. Por eso las cuatro tiendas tienen 0 webhooks: no es que nadie los
registrara, es que **con este token no se pueden registrar**. Anadir el scope obliga a cambiar la
app en Vercel y a que el comercio **vuelva a aprobar** la app: eso no entra antes del lunes.

**Lo que si tenemos:** `read_orders` y los siete scopes de fulfillment
(`read_fulfillments`, `read_*_fulfillment_orders`, `write_*_fulfillment_orders`). O sea: **podemos
leer el envio, solo no podemos pedir que nos avisen.** Entonces se pregunta en vez de esperar.

**Plan posible sin deploy ni cambio de codigo** (mismo patron que los dos CronJobs que ya corren
en prod, `orders-reconcile` y `shopcart-reconcile`):

1. Sacar de nuestra base los ids de Shopify de las ordenes de Vio para Careless
   (`order_item.supplier_shopify_order_id`, supplier 1327). No hay que adivinar nada.
2. Preguntar a Shopify si esas ordenes ya estan `fulfilled`.
3. Cuando lo esten, disparar la cadena que **ya existe**, por una de dos vias:
   - **(min)** `POST /checkout/payment/vipps/order/<orderId>/shipped` en `shopcart`. Es
     `vippsOrderShipped`: comprueba el modo, calcula lo que queda por capturar, descuenta lo que la
     tienda ya devolvio y usa clave de idempotencia. **Capturar dos veces no es posible.**
   - **(completa)** replicar el cuerpo de `orders/fulfilled` contra
     `extensions /shopify/receiveWebhook`. Ademas de capturar, **guarda el tracking en Vio**, con lo
     que el comprador lo ve y la orden pasa a completada. Es mas fiel y reutiliza mas camino.
     Viable porque `receiveWebhook` no verifica HMAC (ver la nota de seguridad de arriba).

Recomendacion: **la via completa**, y que el CronJob reuse una imagen que ya esta en el registry
(la de `users`, que trae node + mysql2 + el `.env` montado) para **no** instalar nada en runtime —
ese fue justo el fallo del CronJob de backup (ver
`docs/lessons/cronjob-de-backup-roto-instala-paquetes-en-runtime.md`).

Secuencia que propongo: construirlo y dejarlo en vacio (hoy no hay ninguna orden de Vio, asi que
no puede hacer dano), y que **la orden de prueba del viernes sea su primera prueba real**. Si
funciona, el lunes `shipment` se queda como esta y nadie captura a mano. Si no, se cambia el modo a
`payment` con un campo.

**Pendiente de decision de Angelo**: toca dinero en prod en ventana de congelacion, asi que no lo
monto sin su OK.
