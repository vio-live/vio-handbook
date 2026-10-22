---
title: Que dispara (y que NO) una orden espontanea en prod — medido el 22/10
last-updated: 2026-10-22
owner: miguel
---

Pregunta de Angelo (22/10 22:35): «las ordenes llegaran bien y dispararan lo que hay que disparar?».
Esto es la cadena medida en produccion, no leida de la documentacion. Todo lectura.

---

## CORRECCION (22/10 23:55) — lo de abajo sobre la captura ESTA MAL

Este doc concluia que «la Shopify de Careless tiene 0 webhooks, nadie le va a decir a Vio que la
orden se envio» y de ahi recomendaba cambiar a `payment` o montar un CronJob que pregunte. **Las dos
cosas sobran: la cadena de aviso de envio ya existe, esta viva en produccion y no necesita ningun
permiso nuevo.**

El error fue medir los webhooks con el sitio equivocado. `GET /admin/api/.../webhooks.json` y
`webhookSubscriptions` **solo listan los que se crean por la Admin API**. Esta familia de apps no
usa esos: los **declara el propio app** en `shopify.app.vio-sync.toml` y los entrega **por Pub/Sub**,
y eso no sale en esa consulta. Por eso `shopify.service.ts:2270` dice literalmente «app custom, lo
declara el app» — no era una carencia, era el diseno.

**Y `write_webhooks` no hace falta para nada**: un webhook declarado en la config del app lo registra
Shopify al desplegar la config, no se pide por API. Tampoco hay que volver a aprobar la app.

### La cadena, medida (22/10 23:30-23:50, todo lectura)

    Shopify (webhook declarado en el toml del app «Vio Sync»)
      -> Pub/Sub  topic tipio-staging-development:vio-sync
      -> extensions de PROD, suscripcion vio-sync-sub   [PubSubService.subscribeToSupplierTopic]
      -> MessageDistributorService -> shopifyService.receiveExportWebhook(shop, topic, body)
      -> topic 'orders/fulfilled'  -> receiveOrderFulfilled
      -> handleSaveTrackingNumber  -> orders POST /:id/saveTrackingNumber
      -> orders.tellShopcartAboutVipps(order,'shipped')
      -> shopcart.vippsOrderShipped -> captura en Vipps

Pruebas de que corre, no de que deberia correr:

1. **El toml de prod declara los topics que hacen falta.** `shopify.app.vio-sync.toml`, bloque
   `[[webhooks.subscriptions]]`: `orders/fulfilled`, `fulfillments/update`, `orders/cancelled`,
   `refunds/create`, `products/update`, `products/delete`, `app/uninstalled`, todos a
   `uri = "pubsub://tipio-staging-development:vio-sync"`.
2. **Prod consume esa suscripcion ahora mismo.** En el log de `extensions` de prod,
   `[PubSubService.subscribeToSupplierTopic] Received message ...` + `send to receiveExportWebhook`,
   **393 mensajes en 3 h**. El `.env` del pod: `SHOPIFY_GCP_PUBSUB_SUPPLIER_SUBSCRIPTION_TOPIC="vio-sync-sub"`.
3. **Careless es una de las tiendas que estan entregando.** De 4 ids de producto sacados al azar de
   esos mensajes, **2 son de `dignitycollect.myshopify.com`** (200 con su token; 404 en las otras
   tres tiendas). O sea: el app de Careless **si** tiene sus webhooks declarados registrados. Y
   `orders/fulfilled` esta en el **mismo** bloque de suscripcion que el `products/update` que llega,
   asi que esta registrado igual.
4. **No hay competencia con staging.** Staging usa otra suscripcion y otro topic
   (`vio-sync-staging-sub` / `vio-sync-staging`, mismo proyecto GCP). Si compartieran suscripcion,
   Pub/Sub repartiria los mensajes y la mitad de los envios se perderian en staging. No es el caso.
5. **El enlace de vuelta Shopify -> Vio existe en la orden que crea Vio.** `createOrder` hace un
   **PUT posterior al alta** que escribe el metafield `<SHOPIFY_NAMESPACE>.outshifter-order-id` con
   el id de la orden de Vio (`shopify.service.ts:3907`), y `findOrderById` pide los metafields junto
   a la orden, que es de donde los lee `getOrderIdFromShopifyOrder`. En prod
   `SHOPIFY_NAMESPACE="outshifter-qa"` (nombre raro, valor correcto: escribe y lee el mismo).

### Entonces, la decision

**`captureMode: shipment` se queda como esta.** Es el modo con el que opera Careless y es el que la
plomeria soporta. No se cambia a `payment`, no se pide `write_webhooks`, no se monta CronJob.

### Lo que SI sigue sin probar (y es lo unico que hay que mirar)

La cadena **nunca ha corrido en prod** porque nunca ha habido una orden de Vio. Dos eslabones son
los que pueden romperla en silencio, y los dos se ven en el guion:

- **El metafield del enlace.** Lo pone un PUT *despues* del alta. Si ese PUT falla, la orden existe,
  se despacha igual... y `orders/fulfilled` no encuentra la orden de Vio, asi que la reserva de
  Vipps **no se captura nunca** y nadie se entera. Ademas `getOrderIdFromShopifyOrder` exige que
  `note` no este vacio.
- **Que el aviso llegue a tiempo.** Careless despacha en lotes a mediodia, ~36-39 h despues de la
  compra; la reserva de Vipps tiene que seguir viva (en prod no hemos medido todavia su caducidad).

`verificar-orden-careless.sh` ya imprime las dos cosas:
`CAPTURA: note=... metafield_order_id=... enlace_shopify->vio=OK|ROTO` y `tracking_en_vio=...`
(cuando aparece tracking en Vio, ya corrio `saveTrackingNumber` y con el la captura).

**Plan B si el enlace sale ROTO** (manual, sin plomeria nueva, idempotente):
`POST /checkout/payment/vipps/order/<vioOrderId>/shipped` en `shopcart`. Calcula lo que queda por
capturar, descuenta lo que la tienda ya devolvio y usa clave de idempotencia — capturar dos veces
no es posible.

Lo que de este doc **sigue valido**: todo el apartado del 3PL, el de como cobra Careless hoy
(Qliro, captura 1-2 s despues del fulfillment, lotes de mediodia), y la nota de seguridad del HMAC.
Lo que **no**: «0 webhooks», «nadie va a avisar», y las tres opciones (a)/(b)/(c) de la captura.

---

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

## «Las ordenes llegaran para ser enviadas al 3PL?» (Angelo, 22/10 23:09)

**Si.** Medido en prod y en su Shopify, cuatro cosas, que son las cuatro que pueden hacer que una
orden llegue pero no se pueda despachar:

1. **Las lineas llevan variantes reales, no lineas sueltas.** Careless tiene 40 productos en Vio y
   **252 variantes, todas con su `origin_id` de Shopify** (`sum(origin_id is null) = 0`). Importa
   porque una linea sin `variant_id` entra en Shopify como item personalizado y **un 3PL no la puede
   despachar**. 36 de los 40 productos tienen tallas y resuelven la variante **por titulo** en el
   momento del alta (`variantRepository.findOneOrFail` por `product` + `title`,
   `shopify.service.js:2407`): si un titulo no casara, el alta **falla entera** y no queda una orden
   a medias — y `supplier_shopify_order_id` se queda en null, que es lo que reporta el guion.
2. **El reparto va al 3PL, y no por configuracion nuestra.** Careless tiene **13 ubicaciones**:
   «360 Logistics» (id `67699867900`, Drøbak), seis tiendas propias y varias muertas. Sus ordenes de
   web **no fijan `location_id`**: Shopify asigna el `fulfillment_order` por inventario. Verificado
   en sus tres ultimas ordenes → `assigned_location_id = 67699867900`, `status open`,
   `request_status unsubmitted`. Y el inventario no deja margen de duda: de 256 variantes, **200
   tienen stock y las 200 lo tienen en 360 Logistics**; **ninguna** tiene stock solo en una tienda.
   La orden de Vio tampoco fija `location_id` (la conexion 541 tiene `location_id`, `fulfillment_id`
   y `carrier_id` en null), asi que sigue las mismas reglas y acaba en el mismo sitio.
3. **La linea de envio ya esta validada** contra sus propias ordenes: `helthjem|2|#13435` y
   `bring|3584|#13452`, las dos con `source=Packrooster`.
4. **No se puede vender lo que no hay.** Los 40 productos tienen
   `allow_purchase_out_of_stock = 0`, asi que nadie puede comprar una talla que el 3PL no podria
   enviar. Los 5 productos de la coleccion del pilot tienen stock en **las siete tallas**
   (p. ej. «Active melert tights - Grå»: XS 35, S 24, M 99, L 112, XL 113, XXL 59, 3XL 62).

**Resumen:** la orden entra pagada y sin despachar, Shopify le abre el `fulfillment_order` en 360
Logistics y ellos la despachan **igual que las suyas**. Lo que **no** pasa solo es el cobro — eso es
el apartado de la captura, mas arriba.

**Lo unico que hay que mirar en la orden del viernes**, por orden de probabilidad: (a) que el alta
en Shopify no haya fallado por el titulo de la talla —se ve en `supplier_shopify_order_id`—; (b) que
el `fulfillment_order` salga asignado a `67699867900` y no a una tienda; (c) que Packrooster ponga
su metafield. Las tres las imprime el guion menos la (b), que es
`GET /orders/<id>/fulfillment_orders.json`.
