---
title: Checklist de go-live Careless x Aller (lunes 26/10)
last-updated: 2026-10-23
owner: Miguel
status: en curso
---

# Checklist de go-live — lunes 26/10

Lista viva. El plan razonado y las mediciones estan en
[`2026-10-22-plan-go-live-careless-aller.md`](./2026-10-22-plan-go-live-careless-aller.md).
Aqui solo se marca. Cada linea tiene **dueno** y **criterio de hecho** (como se comprueba, no como
se siente).

Convencion: `[x]` hecho y verificado · `[~]` hecho pero sin verificar de punta a punta · `[ ]` abierto.

---

## Delta del 22/10 al cierre (lo que cambio hoy y afecta a lo que estes haciendo)

Si volves a este doc despues del 22/10, esto es lo que **ya no es como estaba escrito**:

1. **El dashboard de prod no preguntaba los permisos a nadie.** Faltaba `VIO_API_HOST` en el
   proyecto de Vercel: el bundle salia con el host vacio y la llamada a `/auth/me` **no se hacia
   nunca**, asi que la nav se renderizaba sin Surfaces ni Campaigns para **todas** las cuentas.
   Arreglado (B8). **Esto deja sin efecto el diagnostico del 19/10** de que "nadie puede crear
   campanas en prod por permisos": no era `user_role`, era el front.
2. **Aller es el `user` 1330, no el 1329.** La 1329 se borro y se recreo por el camino de publisher.
   Channel, `collection_shared` y el interruptor `vipps` van **contra 1330** (B1).
3. **Un "no veo la seccion X" en el dashboard no prueba nada sobre la cuenta.** Con el usuario sin
   cargar, la nav se ve igual que una cuenta brand. Antes de tocar una cuenta: pedir un ID token real
   y llamar al endpoint. Leccion: `../lessons/sesion-caida-se-ve-igual-que-cuenta-brand.md`.
4. **Careless NO tiene que exportar productos.** Su Shopify tiene 1.729 y los 5 del articulo ya
   estan alli, activos y con stock. Lo que falta de ellos es **la lista** de la collection, y el
   import lo hacemos nosotros (B2).
5. **Kernel 1.0.282** en QA con las columnas de policy urls. En **prod**: la migracion va **antes**
   del kernel (B7b), o cualquier lectura de `brand_profile` revienta.
6. **Envio de Careless pasado a NOK** (era EUR por el defecto del alta). Siguen faltando sus
   **tarifas reales**: hoy cobra 10 NOK, que es un placeholder (E1, E1b).
7. **Colector de analytics en c2fc1614** en staging y prod, con `MIXPANEL_IDENTITY` en `off`.
   Las VMs **no tienen clon de git**: se despliega por tarball, no con `git pull`.
8. **La cuenta de Aller es la 1330** (Angelo, 22/10 por la noche). La 1329 esta borrada y la
   **1331 sigue viva como duplicado**. El pilot ya esta contra la 1330: share `collection_shared`
   605 **y** conexion aceptada `1327 <-> 1330` (fila 539) — sin la conexion, la share no se ve.
   Esto deja desactualizado el punto 2 de este delta (donde dice "Aller es el 1330" por otro motivo).
   Ver **B1b**.
10. **La captura al enviar NO necesita ningun permiso nuevo y ya esta montada.** Un diagnostico
   mio de esa misma noche decia lo contrario («0 webhooks en su tienda, nadie avisara del envio») y
   pedia `write_webhooks` o un CronJob: **falso**. Los webhooks los **declara el app** en
   `shopify.app.vio-sync.toml` y se entregan por **Pub/Sub** (`vio-sync` -> suscripcion `vio-sync-sub`
   de prod), que es lo que no sale en `webhookSubscriptions`. Medido: 393 mensajes en 3 h y 2 de 4
   ids muestreados son de `dignitycollect`. `captureMode: shipment` se queda. Ver la CORRECCION al
   principio de `2026-10-22-que-dispara-una-orden-en-prod.md` y la leccion
   `../lessons/webhooks-declarados-por-el-app-no-salen-en-webhooksubscriptions.md`.

9. **Hay un guion que verifica todo esto de una pasada**: `../playbooks/scripts/verificacion-golive-lunes.sh`
   (solo lectura, probado contra prod el 22/10). Correr **eso** el lunes, no comandos a mano.

---

## A. Cadena critica del pago (en este orden, no se puede saltar)

- [x] **A1. Admin de equipo Vio en prod** — *Miguel*
  Hecho 22/10 15:1x. `user_role` id 707: `user_id=1328` (`vio`, Angelo), `role_id_role=1` (Admin),
  `active_user_role=1`. Era la **unica** fila de la tabla.
  Verificado en el codigo del pod: `resolveAccountType` pone `internal` primero, asi que el Admin
  **gana** sobre `is_business=1`; y `getAccountType` lee la base en cada peticion
  (`roleService.getActiveRoleIds`), **no** el claim de Firebase y **no** hay cache.
  Criterio: 1328 ve *Vio team* con `channels:manage`, `surfaces:manage`, `campaigns:manage`.
  Pendiente menor: **una segunda cuenta Admin** para no depender de una sola persona el lunes.

- [x] **A2. Careless en modo partnership + MSN 1179558** — *Miguel, 22/10 15:23*
  Hecho por los endpoints internos del micro `api` (los mismos que usa la pagina *Vio team > Vipps
  partner* a traves de base-api), no a mano en la base:
  `PUT /paymentmethod/vipps-partnership/accounts/1327` con `organizationNumber 928540650`,
  `express true`, `shippingMode fixed`, `captureMode account`; despues
  `POST /paymentmethod/vipps-partnership/accounts/1327/sales-unit` con `1179558`.
  Verificado:
  - `payment_method` tiene **1 fila** (antes 0): `cb45e3e9-f81b-4d22-8899-f2955af84f3e`,
    `user_id 1327`, `active 1`, `options.mode = "partner"`, `merchantSerialNumber 1179558`,
    `salesUnitName "Careless AS"`, `salesUnitOrgNumber 928540650`.
  - La respuesta del assign trae `verified: true`: el micro pregunto a la **Management API de
    produccion** y comprobo que la unidad existe bajo el partnership de Vio y que su numero de
    organizacion coincide con el de la marca (`salesUnitBelongs`). No es un dato tecleado.
  - `state: "live"`, `switchOn: true` (el assign enciende el switch de Vipps de la marca) y
    `useVioAccount: false` (ya **no** cae a la unidad de Vio).
  - `organization_number` de Careless, que estaba **null**, quedo en `928540650`.
  **Captura: `shipment` (al enviar) — CAMBIADO el 22/10 a las 19:26.** Lo deje en `account` a las
  13:23 porque la cadena de captura al enviar no esta probada con la tienda de Careless (captura
  cuando llega tracking: `orders` -> `saveTrackingNumber` -> `tellShopcartAboutVipps(..., 'shipped')`,
  y si no llega, el dinero se queda reservado). **Angelo decidio `shipment` a las 13:50** y tiene
  mejor motivo: con `account`, si Careless captura el total desde su portal, una devolucion parcial
  hecha en Shopify **antes** de capturar no se descuenta — `captureLessWhatTheShopRefunded` solo
  corre en las capturas que dispara Vio.
  Aplicado con `PUT .../accounts/1327` `{"data":{"captureMode":"shipment"}}` y verificado **en la
  base**: `captureMode "shipment"`, MSN y unidad intactas, `manageRefunds`/`manageCancellations`
  en true; por el endpoint, `state live`, `switchOn true`, `verified true`.
  **Dato util para quien repita esto:** el PUT **solo cambia lo que le mandas** —
  `PaymentMethodService.update` -> `withVippsServerFields` reinyecta MSN y unidad desde la fila
  guardada. No hace falta re-asignar la unidad despues (yo lo hice y fue redundante).
  Lo cierra el ensayo del viernes: pago -> fulfill en el Shopify de Careless -> `CAPTURED` en 1179558.
  Lo que esto **no** prueba: que un comprador real pague. Eso es A3.

- [ ] **A3. Pago real de prueba en prod, importe minimo** — *Angelo, tras A2*
  Criterio: el cobro aparece en el portal de Vipps en la unidad **1179558** (NO en la de Vio), y el
  log de shopcart **no** dice `[vippsEvent] ... refused: signature mismatch`.
  Es el unico paso que no se puede fingir. Webhook de prod ya registrado (`e1de7656`).
  > [claude, 2026-10-23 22:25 UTC] **Hecho en los logs de prod; falta solo mirarlo en el portal.**
  > Orden **4126** (22:07 UTC), desde el Replit de Aller en prod: Vipps Express, 599 + 59 NOK. Se pidio
  > en modo partner sobre **1179558** (`initPayment ... partner 1179558`). El webhook `AUTHORIZED`
  > llego firmado (`signed: true`) y se acepto: 0 lineas `signature mismatch` o `refused`. La orden la
  > creo el webhook, y despues el recibo se mando a Vipps (2 lineas). No se capturo nada: la captura va
  > con el envio (D2). Shopify `18953017884924` / `#554749CL`: `source_name vio`, envio Helthjem
  > `helthjem|2|#13435` (Packrooster), campana 2, componente `detail`.
  > Hubo un segundo intento (`VIO-21fceb47`, 699 NOK, 22:08): se quedo en `CREATED` y no hay orden.
  > Abandonado.
  > [claude, 2026-10-23 22:50 UTC] **Tres ordenes de prueba, las tres correctas en Vipps.** La 4126, la
  > 4127 (22:21) y la 4128 (22:40): en las tres, `AUTHORIZED` firmado y aceptado, orden creada por el
  > webhook y 0 `signature mismatch`. La 4128 (1 linea, 599 + 59) **se deja sin cancelar** para ver la
  > captura cuando 360 Logistics marque el envio. Falta solo el vistazo al portal de 1179558.
  > ⚠️ **Fallo en la 4127 (2 lineas), que no sale en el journal de Miguel:** el pedido llego a Shopify
  > **sin** el codigo de Packrooster. extensions mando
  > `shipping_lines: [{price: "59.00", title: "Helthjem - til postkasse/dørmatte-Helthjem - til postkasse/dørmatte"}]`
  > y no hay linea `orden 4127 ... → Packrooster`; la 4126 y la 4128 si la tienen. Causa: en el pago
  > Vipps, shopcart junta el nombre del envio **una vez por producto** (`checkout.service.ts`,
  > `createVippsOrder`), y con el titulo repetido extensions no encuentra el metodo en
  > `SHOPIFY_SHIPPING_LINES`. El lunes le pasa a toda orden de 2 o mas productos de Careless.
  > Arreglo: [shopcart#104](https://github.com/vio-live/vio-shopcart-microservice/pull/104), cada
  > metodo una sola vez, 42/42 tests. **Abierto: falta el OK de Angelo para mergear y llevarlo a
  > prod.** Es independiente de la linea fantasma del carrito: aunque la 4127 debiera haber tenido un
  > solo producto, una compra real de dos productos falla igual.

- [ ] **A4. Devolucion de ese mismo pago** — *Angelo, tras A3*
  Criterio: la devolucion se ve en Vipps y llega `order_refunded` al colector.
  > [claude, 2026-10-23 22:25 UTC] **La anulacion funciona. La devolucion de un pago capturado sigue
  > sin probar.** La 4126 se cancelo desde el dashboard con la cuenta de Careless a las 22:17 UTC. El
  > recorrido completo:
  > 1. orders cancelo el item;
  > 2. salio `order_cancelled`, 599 NOK, `full=true`;
  > 3. shopcart pidio `POST .../cancel` a Vipps, que respondio 200: la reserva se libero y no se cobro;
  > 4. extensions cancelo el pedido en Shopify;
  > 5. el `orders/cancelled` que devolvio Shopify no hizo nada (`nothing left in this transition`).
  >
  > Como el pago nunca se capturo, esto es una anulacion y no una devolucion: al colector llega
  > `order_cancelled`, no `order_refunded`. La devolucion de verdad se prueba cuando una orden ya
  > enviada (capturada) se devuelve.
  > Detalle visto: en Shopify el pedido cancelado sigue con `financial_status: paid`, porque Shopify no
  > se entera de la anulacion en Vipps. Solo es cosmetico.

---

## B. Cadena del contenido y la atribucion

- [x] **B1. Cuenta de Aller Media en prod** — *Angelo la creo 22/10 14:53Z; el rol lo puso Miguel 17:00*
  **OJO, el id cambio: Aller es ahora `user` 1330 `aller`.** La 1329 la borro Angelo (`DELETE /me/1329`,
  22/10 18:46Z) para que no heredara nada del alta por el flujo de marca, y la creo de nuevo por el
  camino de publisher: nacio con `is_business = 0`, claims `{"brand_name":"Aller","channel":true}` y
  su propia fila `user_role` 709 (Publisher) — esta vez sin tocar nada a mano. `GET /1330` da
  `accountType publisher`. Borrada la 708, huerfana. Lo unico que heredo es el customer de Stripe
  `cus_VUM4CdnWJfQuZW` (se reutiliza por email); le corregi la `metadata` al id nuevo.
  **Todo lo que queda del go-live va contra 1330**: el channel, el `collection_shared` y el
  interruptor `vipps`.
  (Historico) `user` **1329** `allermedia`, brand_name «Aller media», NO, activa. **Suscripcion ya resuelta**:
  `subscription` 631 `active` plan 1 — nacio con ella, no hace falta el rescate de
  `POST /api/users/create/subscription`.
  Le faltaba el **rol Publisher**: con `is_business = 1` y sin fila de rol resolvia a `brand`, **sin
  `channels:manage`**, o sea no podia crear su channel. Insertada `user_role` **708** (role 3).
  Verificado reproduciendo la consulta exacta del servicio: 1329 -> accountType **publisher**
  (`channels:manage`, `surfaces:manage`, `campaigns:manage`). Sin re-login: se lee de la base en
  cada peticion. Detalle en
  [`../journal/2026-10/2026-10-22-aller-1329-publisher.md`](../journal/2026-10/2026-10-22-aller-1329-publisher.md).

- [x] **B1b. La cuenta de Aller es la 1330 y el pilot ya esta contra ella** — *Angelo decidio, Miguel ejecuto 22/10 19:37*
  Angelo: «uso la cuenta 1330». Hecho por los endpoints internos, no a mano en la base:
  - `POST /collectionShared/join` `{collection_id:"eOy5cc5g4", user_id:1330}` -> `collection_shared`
    **605**. Copio ademas los 5 productos de la collection al publisher (`addCustomProduct`).
  - **Y la conexion, que era el paso que faltaba:** `GET /collectionShared/joined/1330` devolvia `[]`
    porque ese endpoint cruza las shares con las **conexiones**, y la aceptada era `1327 <-> 1329`.
    Creada `1327 <-> 1330` con `POST /connection/` `{state:"Accepted",userId1:1327,userId2:1330}`
    -> fila **539**. Reversible con `DELETE /connection/`.
  - Criterio cumplido: `GET /collectionShared/joined/1330` devuelve
    «Careless - mote-livsstil (pilot)» con sus 5 items.
  Residuos de la 1329 (`collection_shared` 604, `connection` 538): **no se pueden borrar por los
  endpoints** (los lookups excluyen usuarios con `deleted_at`) y la app no los ve. El guion de C3
  los marca como residuo, no como fallo.
  **Abierto:** la cuenta **1331** (`allermedia`, Publisher) sigue viva y es un duplicado de la 1330.
  Decide Angelo si se desactiva.

- [x] **B2. Los 9 productos del articulo, importados en prod** — *Miguel, 22/10 23:4x (OK de Angelo: «lo que haya que hacer lo hacemos ahora»)*
  Importados por `POST /shopify/import` del micro `products`, ids de Vio **421318-421326**, los 5 estilos
  del articulo con sus colores publicados y con stock. Excluidos los de stock 0 y `Vilde bukse`.
  **El import solo engancha el envio POR DEFECTO**: nacieron con 1 `product_shipping` en vez de 2;
  anadidas las 9 que faltaban (Bring), total de 1327 = 98 = 49x2. Repetir esto en cada import.
  Anadidos a la collection compartida `NnRsYSAaJ` sin borrar los 5 «Active» de Careless (14 items).
  Detalle: [`../journal/2026-10/2026-10-22-noche-go-live-b2-b3-b7b.md`](../journal/2026-10/2026-10-22-noche-go-live-b2-b3-b7b.md).

<!-- texto original de B2, conservado -->
- [x] ~~B2 (version original)~~ — *Careless, desde su Shopify*
  «10 nyheter vi onsker oss na»: Cassia jakke, Hennie cardigan, Vilde genser, Sofie genser,
  Active pile fleece half-zip. Hoy solo esta la linea «Active».
  **CORREGIDO 22/10 16:55 (Angelo aviso de que la app de Shopify esta instalada): NO es un
  bloqueante de terceros.** La conexion esta viva (`shopify_connection` 541,
  `dignitycollect.myshopify.com`, NOK, token refrescado hoy) y su Shopify tiene **1.729 productos**.
  Los 5 del articulo **ya estan alli**, `ACTIVE`, publicados y con stock. En Vio solo hay **40**,
  todos importados el 16/10 y todos de la linea «Active»: la primera pagina alfabetica. Lo que falta
  es **importarlos de nuestro lado** (`POST /product/shopify/import` del micro `products`), no
  pedirle nada a Careless.
  **Espera OK de Angelo**: escribe en la base de prod. Recomendado importar solo los del articulo y
  sus colores con stock, no los 1.729. Excluir `Sofie genser - Lilla` y los dos Hennie sin publicar
  (stock 0). Detalle en
  [`../journal/2026-10/2026-10-22-careless-productos-no-es-bloqueante-de-terceros.md`](../journal/2026-10/2026-10-22-careless-productos-no-es-bloqueante-de-terceros.md).
  **Precision de Angelo (16:54): lo que falta de Careless es LA LISTA** de productos que van en la
  collection que se comparte con Aller, no un export. Es una decision suya, de cinco minutos.
  **Trampa de orden:** si Careless va a elegir los productos en SU dashboard de Vio, el import tiene
  que ir **antes**, o solo vera la linea «Active» (los 40 importados el 16/10) y creera que el resto
  no existe.
  Mecanismo medido en prod: `collection` (del brand) + `collection_item` (product_id) +
  `collection_shared` (collection_id -> user_id del publisher). Careless (1327) **no tiene ninguna
  collection**; las 3 que hay son de cuentas de prueba (1295, 1300).
  Cadena completa: lista de Careless -> import de esos productos a Vio -> collection + compartir con
  Aller (1329) -> Aller los publica en su channel `Sdk` (B4).
  Criterio: los 5 con `active=1` en prod.
  **MEDIDO 22/10 19:40, y confirma la trampa de orden:** la collection del pilot `eOy5cc5g4`
  («Careless - mote-livsstil (pilot)», creada por Careless a las 18:35) ya tiene **5 items**, pero
  **no son los del articulo**: son «Active melert tights - Grå / - Lilla», «Active melert half-zip
  dame - Grå», «Active melert shorts - Grå» y «Active Man Running Shorts - Black». O sea, se eligio
  de los **40** productos que Careless tiene en Vio (todos de la linea «Active», importados el
  16/10), que es lo unico que se veia. Para que el pilot lleve los del articulo: **importar primero**
  (espera OK de Angelo) y **despues rehacer los items** de la collection. La share a Aller (1330) ya
  esta puesta, asi que lo que se cambie en la collection le llega sin volver a compartir.

- [x] **B3. Channel de Aller creado** — *Angelo desde el dashboard, 22/10 ~23:56*
  `channel_user` **480**, user 1330, `channel_id 10` (Sdk), activo, api key
  **`DWWWP0S-8KA4WGZ-M9ABEGN-XZE3G4Y`** (~~es la que va en el Replit, B6~~ **NO: al Replit va la key
  de la SURFACE; esta la entrega el bootstrap dentro de `primarySponsor.commerce.apiKey`** — ver la
  nota de miguel en B6), con `channel_group` 1076
  -> share 606 -> collection `NnRsYSAaJ` (14 items).
  Hubo dos channels mas en el camino: el 479 (borrado 21:55 UTC, su grupo apuntaba a la share muerta
  605) y el 481 (duplicado mio, borrado por mi al ver que el 480 ya servia). **Solo el 480 esta vivo.**

<!-- texto original de B3, conservado -->
- [x] ~~B3 (version original)~~ — *Angelo / equipo Vio, tras B1*
  Hoy en prod solo hay **3 `channel_user`**, todos de cuentas de prueba (1295 y 1300) y todos de
  tipo `GraphQl`. El de Aller hay que crearlo. Careless **no** tiene channel y es correcto: el
  channel es del publisher, no de la marca.
  **CORREGIDO 17:10 (Angelo lo cuestiono, con razon): `Sdk` (10) y `GraphQl` (12) son
  equivalentes.** Lo que escribi antes — «tiene que ser Sdk, no GraphQl» — era una inferencia de los
  datos de QA, no un requisito del codigo. En `graph-ql`, `getAuthChannel` /`channelIdByAuthInfo`
  tratan **9 (Api), 10 (Sdk) y 12 (GraphQl) exactamente igual**: son los tres exentos del filtrado
  por canal y toman channel + channel_user directo del login de la api key. Cualquier otro tipo
  (Shopify, Woo, Vev...) cae por la otra rama. Hay incluso un comentario en el codigo sobre el bug
  que lanzaba *"The user does not have an assigned channel"* para todo lo que no fuera 9/10/12.
  Aguas abajo, `channelService.getAllItems` hace `AND channel.id = :channel_id` con el tipo que
  viene de la key: es autoconsistente, asi que 10 y 12 dan el mismo resultado.
  **El transporte siempre es GraphQL** — el SDK llama al servicio `graph-ql`. `channel_id` no es el
  transporte, es *el tipo de channel* del publisher.
  Lo que SI importa: que sea uno de **9/10/12** y que **`channel_user_settings.vipps = 1`** (B3b).
  En QA los 10 channels con los que se probo el flujo son `Sdk` con `vipps = 1`; conviene usar el
  mismo tipo solo para que prod y el entorno ya probado sean identicos, no porque el otro falle.
  Crearlo **desde el dashboard**, no a mano: el alta genera la api key (`user_channel_api_key`) y la
  fila de `channel_user_settings` que hace falta para B3b.

- [x] **B3b. Vipps se ofrece en el channel de Aller — VERIFICADO** — *Miguel, 23/10 00:2x*
  `GET /channel/available-payment-methods/480` -> **`200 ["Vipps"]`**. `vipps = 1` y
  `markets ["NO","GB","NL"]` (cubre NO; GB/NL no tienen envio de Careless, no estorban).
  **CORRECCION IMPORTANTE de como estaba escrito este punto: el interruptor NO basta.** El brand del
  channel se resuelve por los DUENOS DE LOS PRODUCTOS publicados (`CHANNEL_PRODUCT_OWNERS_SQL` sobre
  `channel_group` / `channel_user_products`). Con el channel vacio el brand cae en el propio owner
  (Aller, que no tiene `payment_method`) y el endpoint devuelve `[]` **aunque `vipps=1`** — medido en
  vivo contra el channel 479. Lo que abre el boton es **enganchar la collection compartida (B4)**.

<!-- texto original de B3b, conservado -->
- [x] ~~B3b (version original)~~ — *equipo Vio, al crear B3*
  **Esto no estaba escrito en ningun sitio y se pasa por alto.** El checkout ofrece un metodo solo
  si coinciden **dos** cosas (`getAvailablePaymentMethods` -> `offeredPaymentMethods`): el switch de
  la **marca** (ya en `true`, A2) **y** la visibilidad del **channel**
  (`channel_user_settings.vipps = 1`). Hoy **ningun channel de prod** tiene `vipps = 1`, y la
  comprobacion de madurez del propio micro lo avisa: *"No channel offers Vipps yet. Turn it on in
  the channel's payment settings, or these keys stay unused."*
  Mirar tambien `channel_user_settings.markets`: tiene que cubrir Noruega (si esta vacio, no
  restringe).
  Criterio: `GET /channel/available-payment-methods/<channelUserId>` del channel de Aller devuelve
  Vipps en la lista. Si no sale, el boton no aparece y no hay compra, aunque el pago este perfecto.

- [x] **B4. Catalogo del channel de Aller: 14 productos, VERIFICADO por el camino del SDK** — *Miguel, 23/10 00:4x*
  **CORRIJO lo que escribi hace una hora**, que estaba mal y era bloqueante: dije que
  «`channel_user_products` sigue a 0 y da igual». **Es falso.** El catalogo del SDK sale **solo** de
  `channel_user_products`; `channel_group`/`collection_shared` sirve para resolver la **marca**
  (pagos, campanas, dashboard). Por eso Vipps aparecia y el catalogo estaba **vacio**. El B4
  original tenia razon y yo lo contradije.
  **Causa:** el hook que materializa el catalogo solo lo llama `POST /channel/multi-group/v2`;
  `POST /channel/group` (el camino por el que se monto el 480) **no lo llama**, y no deja ni un
  error en el log.
  **Arreglado** con `POST /channel-process/collections/update {"collectionsId":["NnRsYSAaJ"]}` en el
  micro `products` (idempotente): el 480 paso de **0 a 14** filas.
  **Cadena verificada de punta a punta con la api key del channel**, en `graph-ql.vio.live`:
  catalogo **14 productos** (los 9 del articulo + 5 «Active»), todos con **7 tallas** y **los dos
  metodos de envio**; carrito con una Cassia -> `subtotal 1499 NOK`, `available_shipping_countries
  ["NO"]`; checkout **ACTIVE** con `available_payment_methods ["Vipps"]` y
  `totals {total 1499, taxes 299.8}`. Carrito y checkout de prueba **borrados** despues.
  Lecciones: [`../lessons/el-catalogo-del-sdk-sale-de-channel-user-products.md`](../lessons/el-catalogo-del-sdk-sale-de-channel-user-products.md)
  y [`../lessons/el-precio-del-sdk-viene-sin-iva.md`](../lessons/el-precio-del-sdk-viene-sin-iva.md).

<!-- version anterior de B4 (con el error corregido arriba) -->
- [x] ~~B4 (22/10 23:56)~~ — *verificado por Miguel*
  Via `channel_group` 1076 -> `collection_shared` 606 -> collection `NnRsYSAaJ` con **14 items**
  (los 9 del articulo + 5 «Active»). `channel_user_products` sigue a 0 y **da igual**: la SQL de
  dueños tambien cuenta la rama de `collection_shared`, que es la que resuelve el brand a Careless
  (1327) y es lo que hace aparecer Vipps.
  **Gotcha del payload:** en `POST /channel/group`, el campo `collection_shared_id` espera el **id de
  la COLLECTION** (`NnRsYSAaJ`), no el de la fila de share (606). Con el 606 da
  `404 COLLECTION_NOT_SHARED_WITH_SELLER`, que parece un problema de permisos y no lo es.

<!-- texto original de B4, conservado -->
- [x] ~~B4 (version original)~~ — *equipo Vio, tras B2 y B3*
  `channel_user_products` de Careless esta a **0**: aunque el pago funcione, el lunes **no aparece
  nada en catalogo**. Hacen falta las filas + `product.active=1` (ya) + envio que cubra el pais (ya)
  + `channel_group` para que campanas y dashboard vean la marca.
  Criterio: los 5 productos salen en el catalogo del channel.

- [x] **B5. Surface de Mote & Livsstil + campana con Careless de sponsor — VERIFICADO** — *tras B4*
  > [claude, 2026-10-23 09:20 UTC] Lo marco hecho. Ademas de lo de anoche en la base, el bootstrap de
  > prod del articulo de Aller sale con la campana 1, Careless (1327), el channel 480 y 4 slots, y desde
  > las 08:21 trae los enlaces de condiciones y devoluciones de Careless.
  `surface`, `campaign` y `brand_profile` estan a **0** en prod. Comision por defecto 15 %.
  > [claude, 2026-10-22 22:20 UTC] Desbloqueado. El 400 `SPONSOR_NOT_ON_SURFACE` tenia dos causas:
  > el channel 479 apuntaba a la share 605, borrada a las 21:44 (Angelo creo el **480** con «Carelles
  > Test»), y faltaba `VIO_CAMPAIGNS_V2` en Vercel Production (Miguel, 22:12). Al crear la campana
  > como Aller: sponsor Careless, channel **480**. La surface se asigna sola en la misma transaccion.
  > Criterio: nace `surface_channel (1, 480)` y la campana.
  > [claude, 2026-10-22 22:36 UTC] **Verificado en la base de prod, solo lectura:** la campana **1**
  > «Careless Aller (test)» se creo a las 22:17 UTC y `surface_channel (1, 480)` existe. Falta que
  > Miguel la marque `[x]` si da por bueno el criterio.

- [ ] **B6. Replit de Aller en prod, con el SDK** — *Angelo*
  El `www.moteoglivsstil.no` publicado hoy **no tiene ni una referencia al SDK de Vio**.
  **Fijar la version**: npm esta en `@vio-live/web-sdk@0.27.0`, el prompt del 21/10 decia 0.26.1.
  La misma en Replit y en Vev, y una ya probada en QA — no estrenar version el lunes.
  Criterio: `Vio.analytics.start` con consentimiento y el colector dejando de estar a 0.

  > [miguel, 2026-10-23 11:3x UTC] **Luz verde de Angelo para migrar el Replit a prod.** Lo nuestro
  > esta listo y verificado; lo que falta es el deploy de Replit. Prompt de produccion completo en
  > [el handoff de Replit](./2026-10-15-replit-y-demo-web-a-commerce.md#produccion-2310--prompt-para-el-agente-de-replit-con-luz-verde-de-angelo).
  > **Dos correcciones a lo que dice este checklist mas arriba:**
  > 1. **La key que va en el Replit NO es la del channel 480.** B3 dice que `DWWWP0S-…` «es la que
  >    va en el Replit (B6)»: con ella el bootstrap da **401 `Invalid API key`**. `api.vio.live` es
  >    el micro de campanas entero y su guarda es `SurfaceKeyGuard` (`surface.api_key`,
  >    `status active`). Va la key de la **surface 1 «Mote Livsstil Hub»** (publisher 1330), que
  >    empieza por `mote_livsstil_hub_api_key_…` y esta en el TOOLS.md de Miguel. La del channel
  >    **viaja dentro de la respuesta** (`primarySponsor.commerce.apiKey`): no hay que pasarla.
  >    Leccion: [`../lessons/la-key-del-replit-es-la-de-la-surface.md`](../lessons/la-key-del-replit-es-la-de-la-surface.md).
  > 2. **La version es `0.28.0`, no 0.27.0.** 0.27.0 fue `latest` 20 horas. Fijarla **exacta**
  >    (`--save-exact`), no `^`. El bump no es estetico: en 0.26.1 el `order_id` de `purchase` es el
  >    uuid del checkout en todo pago por redireccion, y con eso las devoluciones no netean nunca.
  > **Medido en prod hoy, solo lectura:** los 4 endpoints del bootstrap responden 200 con la key de
  > la surface (`mobile/config`, `mobile/surface`, `web/brands`,
  > `commerce/sponsors/1327/catalog` -> 14 productos), mas `mobile/campaigns/1/components` con los 4
  > slots; `environment: 'production'` resuelve a `api.vio.live` / `graph-ql.vio.live` /
  > `events.vio.live` (leido del paquete publicado) y los tres aceptan CORS desde
  > `www.moteoglivsstil.no`. Guion de C3 completo: **9 OK · 2 OJO · 0 MAL**.


- [ ] **B6b. El Replit de Aller se queda bloqueado al volver de Vipps** — *Angelo (agente de Replit)*
  > [claude, 2026-10-22] Lo encontro Alan en el Replit de staging, en Safari movil y ventana normal.
  > Despues de pagar con Vipps, la vuelta mostraba «Handlekurven tilhorer en annen Vio-surface.
  > Fullfor eller tom handlekurven forst», tambien al recargar. El pago entra: ordenes 4621–4624 en
  > `SUCCESS`. El mensaje es de una **guarda de surfaces del propio Replit**, no del SDK. Al cargar,
  > si la cesta guardada es de otra surface, no deja arrancar `Vio.init`. La cesta pagada solo se
  > vacia cuando el SDK procesa la vuelta, asi que queda en bucle. Arreglo: con `vio_payment` en la
  > URL, saltarse la guarda e iniciar con la surface de la cesta. El prompt para el agente de Replit
  > ya lo tiene Angelo.
  > Criterio: compra con Vipps en Safari movil, ventana normal, y la confirmacion aparece al volver.
  > Mientras no este, un comprador del lunes que vuelva de Vipps ve un error en vez de la confirmacion.
  > [claude, 2026-10-23 22:50 UTC] **No se vio en las 3 ordenes de prueba de prod, pero eso no lo
  > cierra.** En la 4126, la 4127 y la 4128 la pagina proceso la vuelta: llamo a
  > `payment-vipps/status` 1–2 s despues del `AUTHORIZED`. En prod hay **una sola surface**, asi que una
  > cesta «de otra surface» casi no puede darse, y por eso la guarda no salto. Las compras se hicieron en
  > `mote-livsstil-hub-vio.replit.app`, y `www.moteoglivsstil.no` sigue con el build viejo, sin Vio
  > (B6). Que el arreglo este en el bundle publicado no esta verificado.

- [ ] **B9. Pedido de Angelo a Michael (23/10)** — *Michael; lo sigue Angelo*
  Angelo se lo pidio el 23/10 por la manana. Estado de cada punto en prod, medido el 23/10 a las
  09:5x UTC, solo leyendo:
  1. **«Installering av Vio i Replit (prod)».** `www.moteoglivsstil.no` todavia no carga Vio: su
     bundle no tiene ninguna referencia. El Replit de staging si carga Vio, contra prod. Es B6.
  2. **«2/3 order i prod (test orders)».** En prod hay **0 ordenes** desde el 22/10 a las 12:00 UTC.
     Son A3 y A4.
  3. **«Produktliste».** El channel **480** de Aller vende hoy **14 productos**, todos de Careless
     (1327):
     - Active Man Running Shorts - Black (411,75)
     - Active melert shorts - Grå (299)
     - Active melert half-zip dame - Grå (299)
     - Active melert tights - Lilla (299)
     - Active melert tights - Grå (299)
     - Cassia jakke - Brun (1.499)
     - Cassia jakke - Svart (1.499)
     - Hennie cardigan - Svart (599)
     - Hennie cardigan - Beige (599)
     - Vilde genser - Burgunder (599)
     - Vilde genser - Brun (599)
     - Sofie genser - Brun (699)
     - Active pile fleece half-zip - Brun (699)
     - Active pile fleece half-zip - Beige (699)

     El articulo de prueba ensena 5 de ellos. Si la lista de Michael es otra, hay que cambiar la
     coleccion compartida de Careless, **no borrarla**: desde el 23/10, borrar una coleccion en uso
     se rechaza con `COLLECTION_IN_USE`.
  4. **«Kampanjens varighet».** La campana **1** «Careless Aller (test)» va del **22/10 22:17** al
     **29/10 23:17 UTC**, con `is_default = 1`, 15 % de comision y sin pausar. Con la duracion real
     hay que cambiar las fechas o crear la campana definitiva.
     > [claude, 2026-10-23 21:4x UTC] Hecho en prod, segun la base: campana **2 «Careless»** desde el 23/10 20:54 UTC,
     > sin fecha de fin, 15 %, channel **482 «Careless»** (14 productos de Careless) en `surface_channel (1, 482)`.
     > La campana 1 (test) esta pausada. Nuevo slot `article-131-block-5` (card). El Replit de staging ya arranca
     > contra prod con la campana 2. Falta el arreglo de la vuelta de Vipps (B6b) en el build del Replit.
  5. **«Artikkelen».** Hoy es el articulo de prueba «10 nyheter vi onsker oss na» (`article-146`),
     con 4 slots de la campana: `block-2`, `block-3` y `block-4` (card) y `block-5` (carousel). Con el
     articulo real cambian los slots (`article-<id>-block-<n>`).

- [x] **B7. Migracion `BrandProfilePolicyUrls1792500000000` en QA** — *Miguel, 22/10 15:40*
  Dos columnas nuevas en `brand_profile` (`terms_url`, `refund_policy_url`), aditivas y NULL, para
  que la ficha del producto enlace condiciones y devoluciones de la marca. `ALTER` byte a byte igual
  al de package-database #25, fila de `migrations` insertada, y los enlaces de Careless (**1338** en
  QA, `@careless`, org 928540650) cargados con `COALESCE` (no pisa lo que ponga la marca).
  Verificado: columnas 9 y 10 justo detras de `secondary_color`, `varchar(2048)` nullable
  `utf8mb4_unicode_ci`; 2a pasada no repite nada; las otras 3 filas de `brand_profile` sin tocar.
  **Prod: NO corrida (decision de Angelo, va despues del go-live).** Salida completa y detalle en
  [`../journal/2026-10/2026-10-22-migracion-brand-policy-urls-qa.md`](../journal/2026-10/2026-10-22-migracion-brand-policy-urls-qa.md).

- [x] **B7c. Kernel #25 mergeado y desplegado en QA** — *Miguel, 22/10 16:35 (Angelo levanto ADR-0001)*
  Kernel **1.0.282** con los 7 paquetes alineados, 12/12 `kernel-bump` verdes, 12/12 `deploy.yml`
  verdes y 12/12 pods de QA corriendo `@vio-/database@1.0.282` **verificado dentro del contenedor**.
  El camino de lectura que B7b senala como riesgo esta ejercitado en QA:
  `GET /paymentmethod/vipps-partnership/accounts` da **200** con datos de `brand_profile`, y una
  sonda TypeORM con la misma `SnakeNamingStrategy` del kernel emite `terms_url` /
  `refund_policy_url` y devuelve los enlaces de Careless (1338). `Unknown column` = 0 en los 12 pods.
  **Produccion sin tocar** (sigue en `master`, columnas 0/2). Detalle en
  [`../journal/2026-10/2026-10-22-kernel-1-0-282-brand-policy-urls.md`](../journal/2026-10/2026-10-22-kernel-1-0-282-brand-policy-urls.md).

- [x] **B7b. Migracion corrida en prod: el riesgo de orden YA NO EXISTE** — *Miguel, 22/10 23:4x*
  `BrandProfilePolicyUrls1792500000000` aplicada en prod (columnas 9 y 10, identicas a QA; fila de
  `migrations` insertada; 2a pasada no repite). El kernel 1.0.282 **ya se puede desplegar en
  cualquier orden**. El codigo viejo no se entera: `Unknown column` = 0, `api-ecom` 200, 14/14.

<!-- texto original de B7b, conservado -->
- [x] ~~B7b (version original)~~ — *quien suba el release*
  **Esto puede tumbar la pagina de Vipps de prod.** La entidad lleva las dos columnas como
  `@Column` normal (sin `select: false`), asi que en cuanto un servicio de prod suba al kernel con
  #25, **cualquier lectura de `brand_profile` pide las columnas nuevas**. Si la base de prod no esta
  migrada: `Unknown column 'bp.terms_url'`. Lo leen tres servicios, y uno es el de A2:
  `api` (`vipps-partnership.service.ts`, `brandLooksOf` -> `getMany()` sin lista de campos, o sea
  todas las columnas), `campaigns` (`typeorm-brand-profile-repo`, bloque de sponsor del bootstrap) y
  `collection` (`brand-of-collection`).
  Mergear #25 y desplegar **QA** no tiene riesgo: QA ya esta migrada.
  Criterio: en prod se corre `m-brand-policy-urls-prod.js` **antes** de que `api`, `campaigns` o
  `collection` arranquen con el kernel nuevo. Con la congelacion del viernes esto no se cruza con el
  lunes, pero el orden hay que respetarlo cuando se levante.

---

- [x] **B8. El dashboard de prod no preguntaba los permisos: faltaba `VIO_API_HOST`** — *Miguel, 22/10 20:59*
  **Bloqueante oculto, afectaba a TODAS las cuentas de prod, no solo a Aller.** `src/lib/vio.js` del
  webapp deriva el host del API de Vio del proyecto de Firebase, y el mapa solo tiene `reachu-qa`;
  produccion esta fuera **a proposito** (comentario del propio archivo: habia que enlazar sponsors
  antes). Sin host, el bundle de prod salia con `let l=""`, la clave de SWR quedaba `null`, la llamada
  a `/auth/me` **no se hacia nunca**, el usuario quedaba `undefined` y la nav caia en la rama que deja
  fuera **Surfaces y Campaigns**. Se ve identico a una cuenta brand — y por eso borrar y recrear la
  cuenta de Aller no arreglo nada.
  La precaucion del comentario **ya no aplica**: las nueve tablas de surfaces/sponsors estan a 0 en
  prod, no hay nada que duplicar. Puesta `VIO_API_HOST=https://api.vio.live` (production) y
  redespliegue del **mismo commit 35bfae92**: ni una linea de codigo nueva, no choca con la
  congelacion. Bundle servido verificado (`let l="https://api.vio.live"...`) y el endpoint
  pre-verificado con un ID token real (200, `accountType publisher`). Detalle en
  [`../journal/2026-10/2026-10-22-prod-sin-surfaces-vio-api-host.md`](../journal/2026-10/2026-10-22-prod-sin-surfaces-vio-api-host.md).

---

## C. Red de seguridad (mio, no depende de nadie)

- [x] **C1. Dump a mano de la base de prod — HECHO 23/10 00:0x, con adelanto** — *Miguel*
  `prod-dump-golive-20261023.sql.gz` en `containerproductionsc/db-backups/`, 14.782.944 bytes,
  `gzip -t` OK, **128/128 tablas**, MD5 del blob == local (`hPeSGjoe8RS3rmSwAu9ctw==`). Incluye la
  migracion y el import de esta noche. Se puede repetir el viernes al cerrar si hay mas cambios.

<!-- texto original de C1, conservado -->
- [x] ~~C1 (version original)~~ — *Miguel*
  Con el estado bueno ya configurado. El CronJob `mysql-prod-offsite-backup` sigue roto por diseno
  (instala paquetes en runtime y el sidecar de Istio le corta la salida), asi que **esto es la unica
  red** si hay que volver atras.
  Criterio: dump con MD5 verificado y conteo de tablas, subido al blob.

- [x] **C1b. El backup automatico offsite vuelve a correr** — *Miguel, 23/10 09:16 UTC*
  Lo detecto claude: el CronJob no corria desde el 13/10 (un job colgado lo bloqueaba con `Forbid`) y
  en realidad **nunca** corrio solo. Arreglado y verificado: `sidecar.istio.io/inject: "false"` +
  `activeDeadlineSeconds: 3600` + `backoffLimit: 2`, corrida real de 13.910.185 bytes con
  `upload HTTP 201` y blob confirmado desde fuera en `viodbbackupwe/mysql-prod` (West Europe).
  `lastSuccessfulTime` 23/10 09:16:11Z. **La semana del lanzamiento ya va con backup automatico**,
  a las 02:15 UTC, ademas del dump a mano de C1. Detalle: `../infrastructure/backup-db-prod.md`.

- [ ] **C2. Congelacion de prod desde el viernes por la tarde** — *todos*
  > [claude, 2026-10-23 08:27 UTC] Todo develop esta en prod (12 de 12 servicios verificados; detalle
  > en el doc de coordinacion). No queda nada de develop fuera de prod: desde aqui, solo arreglos con
  > OK de Angelo.
  > [claude, 2026-10-23 10:38 UTC] Excepcion con OK de Angelo: [shopcart#103](https://github.com/vio-live/vio-shopcart-microservice/pull/103)
  > (las tarjetas de envio de Vipps Express dicen el servicio, «Pakke i postkasse»). Verificado en prod.
  Nada a `develop` ni `master` de los repos de Commerce. Un deploy corta **~62 s de 503** aunque
  haya 4 replicas (medido). Si hay que tocar algo: `rollout restart`, no el pipeline.
  Ya confirmado por la sesion de `vio`: sin trabajo en curso que toque prod.

- [x] **C3. Guion de verificacion del lunes, escrito y probado** — *Miguel, 22/10 19:30*
  [`../playbooks/scripts/verificacion-golive-lunes.sh`](../playbooks/scripts/verificacion-golive-lunes.sh).
  **Solo lectura.** Cubre D1-D4 y el estado de la cadena del pago en una pasada:

  ```bash
  ANALYTICS_READ_TOKEN=<token de solo lectura del colector de prod, en TOOLS.md de Miguel> \
    ~/vio-handbook/docs/playbooks/scripts/verificacion-golive-lunes.sh --con-db
  ```

  Sale `OK` / `OJO` / `MAL` por linea y devuelve codigo 1 si hay algun `MAL`. Sin `--con-db` no
  toca la base (solo cluster + HTTP). Corrido contra prod el 22/10: **4 OK, 4 OJO, 0 MAL**, y los
  cuatro `OJO` son los esperados sin trafico (sin eventos de Vipps, `inserted=0`, el placeholder
  de envio, un reinicio viejo de `users`). En su primer uso encontro **B1b** solo.
  Lo que aprendio y no hay que redescubrir: `api-ecom.vio.live` **no tiene `/health`** (se mira
  `/` a 200 y `/api/users` a **401**), y las rutas del colector son anidadas
  (`/v1/commerce-stats/overview?sponsor_id=`).
  **Ampliado el 23/10 (Miguel): ahora cuenta el catalogo del SDK.** El 22/10 por la noche este
  guion dio **0 MAL con el channel 480 a 0 productos** — declaraba el go-live sano mientras no
  habia nada que comprar (ver B4). Anadido un bloque que cuenta las filas vivas de
  `channel_user_products` del channel del publisher y, si da 0, imprime el arreglo idempotente.
  Re-corrido contra prod: `channel 480 (Aller): 14 producto(s)`, **4 OK / 4 OJO / 0 MAL**.
  Detalle: [`../journal/2026-10/2026-10-23-guion-golive-cubre-el-catalogo.md`](../journal/2026-10/2026-10-23-guion-golive-cubre-el-catalogo.md).

- [x] **C4. Avisar a Careless de que una devolucion en su Shopify mueve dinero en Vipps — AVISADO 23/10** — *Angelo*
  > [claude, 2026-10-23 09:40 UTC] Angelo: la captura queda a la espera de la orden de test (A3), y con
  > Miguel hay un workaround para que se dispare tambien cuando el envio lo marca el 3PL.
  Pendiente desde el 16/10. El lunes ya es dinero real.
  > [claude, 2026-10-22] Con `captureMode shipment` (A2), el aviso tiene que incluir dos cosas mas: a
  > Careless se le cobra **cuando marca la orden como enviada en Shopify** (fulfill), y **no debe
  > capturar a mano desde el portal de Vipps** las ordenes de Vio.

- [x] **C5. Avisar a Careless de que en Vio el envio NO es gratis sobre ~1.500 NOK — AVISADO 23/10** — *Angelo*
  Sale de la decision de E1c del 22/10 22:04. En su web Helthjem es gratis desde ~1.500 NOK; en las
  ordenes que vienen de Vio se cobran **59/79 NOK siempre**, tambien en una orden de 2.000 NOK. Sin
  este aviso, el lunes lo van a leer como un fallo del checkout y vamos a perder la manana
  buscando un bug que no existe. Lo saco del sub-punto de E1c a item propio justamente por eso.
  **No es que falte configurarlo: no se puede modelar.** Verificado en el esquema de prod
  (miguel, 22/10 22:40): la tabla `shipping` tiene `amount`, `custom_price_enabled`, `currency_code`
  y `default`, y **ninguna** columna de umbral; una busqueda por `%threshold%`, `%free_ship%`,
  `%min_order%`, `%min_amount%` y `%free_from%` en **toda** la base devuelve `[]`. Si Careless lo
  quiere, es trabajo de producto (columna + logica de carrito), no un ajuste del lunes.
  **Medido en su tienda (miguel, 22/10 22:55):** dos ordenes reales de hoy, `#554329CL` por
  2.059,50 NOK y `#554327CL` por 3.903,00 NOK, las dos con linea de envio a **0,00**. O sea que su
  umbral esta activo y la diferencia se va a ver en cuanto entre una orden grande por Vio.

---

## D. Vigilancia del lunes, primera hora

Los cuatro se miran con el guion de C3 (menos D3, que es el portal de Vipps y solo lo ve Angelo).

- [ ] **D1.** Log de shopcart sin `[vippsEvent] ... refused: signature mismatch`
- [ ] **D2.** El `inserted` del colector dejando de ser 0
- [ ] **D3.** El cobro visible en la unidad **1179558** del portal de Vipps
- [ ] **D4.** Infra: 14/14 deployments y `api-ecom.vio.live` a 200

---

## E. Riesgos con accion, no solo anotados

- [x] **E1. Envio de Careless en EUR con los productos en NOK — PASADO A NOK 22/10 19:20** (Angelo:
  "conviertelos en nok por ahora"). **No era una conversion: era el defecto del alta.** El unico
  envio de Careless (`shipping` `60af8d5a-...`, «Default Shipping», `default = 1`, creado el 16/10 al
  conectar) tenia `amount 10.00` y `currency_code EUR`, y su `shipping_country` (NO) lo mismo. Los 40
  productos cuelgan de el y **los 40 estan en NOK**. Todos los demas comercios tienen exactamente
  «Default Shipping 10.00 NOK»: los 10.00 EUR nunca fueron un precio pensado, solo el defecto del
  defecto (1298, 1304 y 1327 nacieron en EUR; el resto en NOK).
  Cambiado `currency_code` a `NOK` en las **2 filas** (`shipping` y `shipping_country`), **sin tocar
  el importe**: 1 fila afectada en cada una, 0 filas en EUR de 1327 despues. El catalogo y el
  checkout leen justo esas dos (`shipping.currencyCode` y `shippingCountry.currencyCode` en
  `channelService`, tambien por el camino `productCollectionSharedShipping`): no hay una tercera
  copia que corregir.
  **Pendiente de Careless, y es suyo:** 10 NOK es ~1 EUR, un placeholder. Tienen que decidir su
  tarifa real (49/79 NOK, o gratis sobre X). Preguntalo en la misma conversacion que la lista de
  productos.
- [x] **E1b. Tarifas de envio reales de Careless — CERRADO 22/10 21:58 por Miguel (ver E1c)** — *decide Careless, lo carga Miguel/Angelo*
  Hoy tienen **un** envio, «Default Shipping» **10,00 NOK** (`default = 1`), que es el que crea el
  alta. 10 NOK es ~1 EUR: **es un placeholder, no una tarifa**. Los 40 productos cuelgan de el.
  **Ojo con el nombre: las tablas `flat_rate` y `flat_rate_country` estan VACIAS en prod y en QA**, y
  ningun servicio las usa (solo quedan la entidad, el repositorio, el schema inicial y un campo del
  DTO de alta de usuario). Lo que el checkout lee de verdad es **`shipping` + `shipping_country`**
  (18 filas en prod): importe + moneda por metodo, y una fila por pais, con `custom_price_enabled` y
  bandera `default`. Si alguien va a buscar "flat rates" en la base, no va a encontrar nada: hay que
  tocar `shipping`.
  Lo que hace falta de Careless: **el importe por pais** (p. ej. 49 o 79 NOK a NO, y si hay envio
  gratis sobre cierto importe), y si quieren mas de un metodo (estandar / express).
  Criterio: `shipping_country` de Careless con la tarifa acordada en NOK y el metodo correcto con
  `default = 1`. Mientras no este, **el checkout cobra 10 NOK de envio**.

- [ ] **E1c. Ordenes de Careless con el metodo de envio que reconoce su almacen** — *configuracion
  CERRADA 22/10; ya NO es bloqueante de config. Solo queda la orden de prueba de punta a punta, que
  es de Angelo (ultimo sub-punto).*
  > [claude, 2026-10-22] Careless no usa tarifas de Shopify: el envio lo calcula **Packrooster** y
  > despacha **360 Logistics**. Sus ordenes llevan una linea de envio con `source=Packrooster` y
  > `code` tipo `helthjem|2|#13435`; la orden que crea Vio llevaba solo `title` + `price` (custom),
  > que Packrooster no reconoce: **la orden quedaria sin transportista y sin despachar.** Angelo
  > (22/10) eligio los dos metodos simples, «Leveringstid 1-5 dager»:
  > «Helthjem - til postkasse/dørmatte» **59 NOK** y «Bring - Pakke i postkasse» **79 NOK** (precios
  > de su web; alli Helthjem es gratis desde ~1.500 NOK — umbral **descartado para este go-live**
  > por Angelo el 22/10, el modelo de Vio no lo soporta).
  - [x] [extensions#33](https://github.com/vio-live/vio-extensions-microservice/pull/33) mergeado en
    `develop` (`118f2ca`, 22/10 19:23 UTC); QA desplegada, pod 2/2 con el codigo nuevo y 0 errores.
    Mete `code`/`source` en la linea y el telefono en la direccion de envio.
  - [x] **Hotfix [extensions#34](https://github.com/vio-live/vio-extensions-microservice/pull/34) en prod**:
    solo ese commit sobre `master`, **sin el kernel 1.0.282** (B7b) ni #32. Merge Angelo 19:34 UTC
    (`84f1873`), deploy verde. Verificado (claude, 19:41): pods nuevos 2/2 desde las 19:40, kernel
    **1.0.280**, codigo nuevo dentro del contenedor, 0 errores, y al arrancar
    `líneas de envío configuradas: dignitycollect.myshopify.com (2)` (tomo la variable de Miguel).
    El mapa leido en el pod da `helthjem|2|#13435` y `bring|3584|#13452` (`Packrooster`);
    «Default Shipping» → nada. Los 4 pushes de token de las 19:40:03-09 dieron 417: el corte del
    deploy (R5).
  - [x] `SHOPIFY_SHIPPING_LINES` en el Secret `env-sc-extensions` **y en el blob** —
    *Miguel, 22/10 19:35*. Los dos lados byte a byte iguales (249 lineas, antes 248), generado
    desde el Secret vivo. Respaldos: `backup-secret-env-sc-extensions-20261022.yaml` y el blob
    `extensions/.env.snapshot-pre-shippinglines-20261022`.
    ~~**Pods sin reciclar a proposito:** #33 esta en `develop`, no en `master`, asi que en prod ese
    codigo no existe y la variable es inerte; entra sola con el release, que recrea los pods.~~
    **CORRECCION (miguel, 22/10 22:30):** eso lo escribi antes del hotfix #34 y ya no es cierto —
    quedo contradicho por el punto de arriba. Medido ahora en los dos pods
    (`extensions-66f78585b4-5b9zw` y `-nhlrk`, arrancados 19:40): la var esta en
    `/usr/src/app/.env`, el `dist` que corre llama a `parseShippingLines` en
    `modules/shopify/providers/shopify.service.js:332`, y **los dos loguearon al arrancar**
    `líneas de envío configuradas: dignitycollect.myshopify.com (2)`. El criterio de abajo ya esta
    cumplido: **no hace falta release ni reciclar pods.** Es
    opcional en el codigo, no puede tumbar el arranque. Valor (no es secreto):
    `{"dignitycollect.myshopify.com":{"Helthjem - til postkasse/dørmatte":{"code":"helthjem|2|#13435","source":"Packrooster"},"Bring - Pakke i postkasse":{"code":"bring|3584|#13452","source":"Packrooster"}}}`.
    Criterio: al arrancar, `extensions` loguea `líneas de envío configuradas: dignitycollect.myshopify.com (2)`.
  - [x] **Los metodos de Careless en Vio — HECHO 22/10 21:58 (Miguel, por base). Cierra E1b.** La
    equivalencia se busca por nombre: copiar los nombres tal cual (la «ø» es U+00F8).
    > [claude, 2026-10-22 ~20:00] **No se puede desde el dashboard:** la cuenta 1327 tiene
    > `settings.currency` **EUR** y el dashboard guarda las clases en la moneda de la cuenta (avisa
    > «saving switches it to EUR»); quedarian en EUR y desharia E1. Cambiar la cuenta a NOK no es
    > inocuo (`products` la usa al convertir precios, tambien `api` y `orders`): no antes del lunes.
    > El canal no necesita nada mas: `channelService` lee el envio por `product_shipping` → `shipping`.
    > [miguel, 2026-10-22 21:58] **Aplicado en prod y verificado.** Una transaccion con
    > precondiciones (1 metodo vivo, los 40 `product_shipping`) y aserciones de relectura antes del
    > commit; ensayado primero con rollback. Resultado:
    > - `60af8d5a-...` pasa a «Helthjem - til postkasse/dørmatte» / «Leveringstid 1-5 dager»,
    >   **59,00 NOK**, `default = 1`, `custom_price_enabled = 0`; su `shipping_country` NO a 59,00 NOK.
    > - nuevo `f831b031-d557-471b-a401-32376a8fcc73` «Bring - Pakke i postkasse», **79,00 NOK**,
    >   `default = 0`; `shipping_country` NO a 79,00 NOK.
    > - `product_shipping`: **40 filas nuevas**, una por producto, al metodo nuevo. Quedan 40 y 40,
    >   que es lo que `sharedShippingClasses` necesita (interseca por producto; leido en
    >   `shopcart/dist/modules/cart/providers/shared-shipping.js`, el flag `default` no interviene).
    > - **Los nombres no se transcribieron a mano**: se sacaron del propio `SHOPIFY_SHIPPING_LINES`
    >   del Secret vivo. La columna es `latin1` y la conexion `utf8mb4`: la «ø» vuelve de la base
    >   como `c3b8`, byte a byte igual que la clave del mapa.
    > - Verificado con la **funcion real** de `extensions` dentro del pod de prod
    >   (`parseShippingLines`/`shippingLineFor` sobre los nombres **leidos de la base**):
    >   Helthjem → `helthjem|2|#13435`, Bring → `bring|3584|#13452`, las dos `source Packrooster`.
    >   Control negativo: «Default Shipping» → `null` (la prueba no pasa sola).
    > - **Sin caches que invalidar**: ni `api` ni `shopcart` cachean respuestas en ese camino
    >   (`CACHE_ENABLED=true` es para otras cosas); la siguiente lectura del carrito va a la base.
    > - Respaldo de las 42 filas previas: `prod-backup/backup-shipping-1327-20261022.json` en el
    >   workspace de Miguel (no va al repo). Para deshacer: restaurar esas filas y borrar
    >   `f831b031-...` (su `shipping_country` y sus 40 `product_shipping` caen por `ON DELETE CASCADE`).
    > - **Envio gratis sobre ~1.500 NOK: DESCARTADO para este go-live** (Angelo, 22/10 22:04:
    >   «envio gratis sobre 1500, eso no lo soportamos esta vez»). El modelo de Vio no tiene
    >   umbrales por importe. Careless cobra 59/79 NOK siempre en las ordenes que vienen de Vio,
    >   tambien por encima de 1.500. **No es un pendiente de configuracion ni se reabre el lunes**:
    >   si lo quieren, es trabajo de producto posterior. Avisar a Careless de la diferencia con su
    >   web, para que no lo lean como un fallo del checkout.
    - `shipping` `60af8d5a-...` (1327, `default = 1`): `name` = `Helthjem - til postkasse/dørmatte`,
      `description` = `Leveringstid 1-5 dager`, `amount` = **59.00** NOK; su `shipping_country` (NO) = 59.00 NOK.
    - `shipping` nuevo de 1327: `name` = `Bring - Pakke i postkasse`, `description` =
      `Leveringstid 1-5 dager`, `amount` = **79.00**, `currency_code` = NOK, `default = 0`,
      `custom_price_enabled` igual que la otra; `shipping_country` NO = 79.00 NOK.
    - `product_shipping`: a cada uno de los 40 productos que cuelgan de `60af8d5a` sumarle una fila
      al nuevo. El checkout solo ofrece las clases que tienen **todos** los productos del carrito
      (`sharedShippingClasses`), asi que sin esto Bring no aparece.
    - Verifica claude despues: el dashboard las muestra en kr y los dos nombres, leidos tal como
      quedaron, dan su `code` con la funcion de `extensions` dentro del pod de prod.
  - [ ] **Orden de prueba de punta a punta en prod, coordinada con Careless** — *Angelo, viernes 23/10
    (antes de la congelacion). Confirmado por Angelo el 22/10 22:04: «la orden la probamos manana».* Criterio:
    en su Shopify la orden trae la linea con `source=Packrooster`, el metafield
    `packrooster.shipping-service` y las etiquetas del transportista, y 360 Logistics la despacha.
    Sin confirmar todavia: que Shopify acepte `source`/`code` al crear por REST y que Packrooster
    actue sobre una orden creada por API. **Red de seguridad:** Packrooster deja cambiar el metodo a
    mano en cada orden; avisarle a Careless que revise las de Vio hasta tener la prueba.
    > [miguel, 2026-10-22 22:55] **Preparada la verificacion, y medido el lado de Careless en vivo.**
    > Guion de solo lectura: `docs/playbooks/scripts/verificar-orden-careless.sh` (sin argumento,
    > las 3 ultimas ordenes; o `'#554326CL'` / el id de Shopify). Saca el `access_token` vivo de
    > `shopify_connection` (conexion **541**, `dignitycollect`, 1327, NOK, token rotado hoy 20:10)
    > desde el pod de `users` y consulta la Admin API **2024-04**. No escribe nada, ni en la base ni
    > en Shopify, y borra su temporal del pod al salir. Imprime `source_name`, etiquetas,
    > `shipping_lines` (title/code/source/price), metafields, fulfillments, si la orden la creo Vio
    > (`source_name channel:*` o `vio_order_id` en `note_attributes`) y un veredicto por criterio.
    > Lo que se midio con el, contra ordenes **reales** de su tienda de hoy:
    > - **Los dos `code` que cargue son exactamente los que Packrooster pone en sus ordenes nativas.**
    >   `#554326CL` (22:09) trae `bring|3584|#13452` y `#554329CL` (22:12) trae `helthjem|2|#13435`,
    >   las dos `source=Packrooster`. Esto ya no depende de mi funcion de mapeo: coincide con lo que
    >   su almacen recibe a diario.
    > - **Packrooster tarda ~8-20 s** en escribir `packrooster.shipping-service` (orden 22:09:42 →
    >   metafield 22:09:50). Manana, no juzgar la orden en el primer segundo.
    > - **Linea base de una orden recien puesta:** `financial_status = authorized` (no `paid`) y
    >   `fulfillment_status` vacio, con `fulfillments: []`. El despacho de 360 Logistics es posterior,
    >   asi que `despachada=NO` al minuto **no es un fallo**; es el unico criterio que hay que volver
    >   a mirar mas tarde.
    > - **Variante que Vio no puede expresar:** Packrooster usa tambien puntos de recogida
    >   (`helthjem|86|<idPunto>|#13940`, p. ej. «Helthjem AS, Joker Vats»). Vio solo tiene las dos
    >   clases fijas, asi que **las ordenes de Vio van siempre a entrega a domicilio/buzon**. No es un
    >   problema para el lunes, pero si alguien pregunta por que no hay pickup, es esto.
    > - **El umbral de C5, medido en su web:** `#554329CL` 2.059,50 NOK y `#554327CL` 3.903,00 NOK,
    >   las dos con envio **0,00**. Confirma con numeros que la diferencia se va a ver.
    > [miguel, 2026-10-22 23:05] **Angelo cierra el alcance: solo entrega a casa, y las ordenes van
    > a ser espontaneas.** Dos consecuencias medidas, y el guion reescrito por la segunda.
    > - **Solo-casa coincide con lo que de verdad compran.** De las **250** ultimas ordenes de su web,
    >   **189 (76%)** usan exactamente los dos metodos que cargue: 141 «Helthjem - til
    >   postkasse/dørmatte» y 48 «Bring - Pakke i postkasse». Los puntos de recogida son una cola
    >   larga de 1-2 ordenes cada uno (~60 variantes distintas). Renunciar al pickup no deja fuera un
    >   caso mayoritario; deja fuera una cola de casos raros.
    > - **El modo «ultimas N ordenes de la tienda» NO sirve para una orden espontanea.** Medido:
    >   Careless hace **~58 ordenes/hora** en su web (250 en 4h19m, **todas** `source_name=web`).
    >   Una orden de Vio queda sepultada en minutos, y con ordenes espontaneas no sabemos el numero
    >   de antemano.
    > **Guion reescrito** (mismo path, sigue siendo solo lectura). El modo por defecto ya no mira la
    > tienda: ancla en la base de Vio, que es determinista —
    > `order_item.supplier_shopify_order_id` guarda el id que devolvio el alta y **solo se escribe si
    > el alta funciono** (`shopify.service.js:2322`). Sin argumento lista las ordenes de Vio para el
    > supplier **1327** con el envio que mando Vio, el estado de cada item y la verificacion en
    > Shopify de cada una. `'#554326CL'` / id siguen funcionando, y el viejo comportamiento queda en
    > `--web [N]`, etiquetado como ruido. Probados los tres modos contra prod.
    > - **Si Shopify rechaza el alta, se ve desde Vio**: `supplier_shopify_order_id` en null. El guion
    >   lo dice con esas palabras y da el `grep` del log de `extensions`. Importa porque
    >   `applyCreateShopifyOrder` corre en un `Promise.all` **sin try/catch propio**
    >   (`shopify.service.js:2317`): el fallo queda en el log, no en la base.
    > - **Si la base de Vio esta vacia, el problema esta antes de Shopify** (checkout o pago), no en
    >   el envio. El guion lo dice explicitamente para no mandar a nadie a mirar Packrooster en vano.
    > - **`source_name` de una orden de Vio sera `outshifter`**, no `channel:<handle>`:
    >   `shopify_connection.channel_handle` de Careless es **NULL** (`shopify.service.js:2400`).
    >   Como sus 250 ordenes son `web`, eso lo distingue a simple vista.
    > - **Anadido un control de precio de envio.** Si la orden de Vio y la tienda estan en la misma
    >   moneda, compara `shipping_price` con lo que llego a Shopify y avisa si no cuadra. Si no
    >   coinciden, `createOrder` **convierte** el importe (`shopify.service.js:2446`) y el guion pide
    >   revisarlo a mano: la tienda es **NOK** y una orden en otra moneda pasaria por ese cambio.
    > **Hallazgo aparte, diferido por la congelacion:** `createOrder` loguea el cuerpo entero con
    > `logger.info('Creating order ' + JSON.stringify(body))` (`shopify.service.js:2464`), o sea
    > email, telefono y direccion del comprador en claro en el log de prod. Mismo patron que los
    > tokens de Shopify en logs. Es cambio de codigo: **no se toca antes del lunes**, queda anotado.
    > [miguel, 2026-10-22 23:20] **Cobertura de envio verificada para carritos chicos.** Angelo acota
    > «no mas de dos productos». Medido en prod: Careless tiene **40** productos (39 activos) y
    > **los dos metodos cuelgan de los 40**, sin un solo hueco. O sea que **cualquier** carrito —de 1,
    > de 2 o de 40 productos— ofrece Helthjem y Bring. La interseccion de `sharedShippingClasses` no
    > puede morder aqui. Y si un carrito mezclara Careless con otra marca, no es un problema de
    > envio: `handleOrderPaid` agrupa por `itemsBySupplier` y crea **una orden de Shopify por
    > proveedor**, cada una con el envio de su marca.
    > Dato colateral: **1 de los 40 productos esta `active = 0`** — no se puede comprar. Irrelevante
    > si el piloto lleva dos productos elegidos, pero conviene saberlo antes de publicar catalogo.
  - Despues (no para el lunes): tarifas dinamicas por direccion desde Shopify
    (`draftOrderAvailableDeliveryOptions`) en el callback de Vipps Express —
    [product/shopify-tarifas-de-envio-dinamicas](../product/shopify-tarifas-de-envio-dinamicas.md).

- [x] **E2. Deriva de version del SDK — ALINEADO en 0.28.0 (23/10 10:4x)** (0.27.0 vs 0.26.1). Lo cierra B6. Que **nadie** lo toque en
  paralelo o acabamos con dos versiones en produccion el dia del lanzamiento.
  > [claude, 2026-10-23 09:1x UTC] **Vev ya va con 0.28.0:** Angelo desplegó el paquete compartido
  > `cq1lXld-TA9` desde `main` `b9307e1` («Successfully deployed package», bundle con
  > `SDK_VERSION = "0.28.0"`, igual que `latest` en npm). Las páginas de Vev la toman al republicarse.
  > Falta fijar 0.28.0 en el Replit (B6).
  > [claude, 2026-10-23 10:4x UTC] Medido: el Replit de staging empaqueta **0.28.0** (en su chunk del
  > SDK), igual que Vev y `latest` en npm. `vio-web-sdk` `main` no tiene nada despues de la 0.28.0. Lo
  > unico que queda: que la instalacion del Replit en prod (B6) siga en 0.28.0.
- [ ] **C6. El comprador recibe el correo estandar de la tienda (Shopify)** — *Alan, hoy en QA; en prod con la orden de test*
  > [claude, 2026-10-23 09:40 UTC] Angelo: hay que asegurar que Shopify dispara el correo estandar de
  > Careless. Vio no manda correos (`EMAIL_DELIVERY` off en prod), y la orden la crea extensions por la
  > API REST (`orders.json`) **sin `send_receipt`**, que por defecto en Shopify es `false`. En los tests
  > de Angelo si llega un correo de Shopify: falta saber cual (confirmacion de pedido o de envio) y
  > cuando. Va como 2.7b en la tarjeta de prod de Alan (`djzHxncE`), para hoy en QA. En prod se ve con
  > la orden de test (A3). Si la confirmacion de pedido no llega, el arreglo es pedir `send_receipt`
  > en extensions, y necesita OK de Angelo por la congelacion.
  > [claude, 2026-10-23 22:25 UTC] **Con la 4126 no llego ningun correo** (pedido creado sin
  > `send_receipt`). El arreglo, extensions #43 (`send_receipt` y `send_fulfillment_receipt`), lleva en
  > prod desde las **22:17 UTC**. El deploy salio verde, el rollout termino y los pods nuevos lo traen
  > en `dist`. Lo cierra la proxima orden de test, si llega la confirmacion de Careless. La 4126 se
  > hizo antes del arreglo: para ella sirve «Reenviar confirmacion» en el admin de Shopify.
  > [claude, 2026-10-23 22:50 UTC] **La 4127 y la 4128 ya se crearon con `send_receipt: true` y
  > `send_fulfillment_receipt: true`**: visto en el cuerpo que extensions mando a Shopify. Lo que falta
  > para marcarlo es que Angelo confirme que el correo de Careless llego al buzon.
- [ ] **E3. QA apagado todo el fin de semana.** Lo que haya que probar en staging va el **viernes**.
- [ ] **E4. Prod sin apagar el fin de semana.** Ahorrar ~46 USD no compensa un arranque malo el lunes.
  > [claude, 2026-10-23 09:20 UTC] Comprobado en las 4 suscripciones: los unicos jobs que encienden o apagan
  > son los de QA (`job-qa-sc-aks-*` y `job-qa-sc-mysql-*`, en `rg-vio-qa-sc`). Para prod no hay nada
  > programado, y el cluster esta `Running`. Basta con que nadie lo pare a mano.
- [x] **E5. Bucle sin fin de reintentos de Woo — EN PROD 23/10 07:08** — *Angelo decidio llevarlo (22/10 22:30)*
  > [claude, 2026-10-23] Subio con todo develop: [products#30](https://github.com/vio-live/vio-products-microservice/pull/30), pods con `woo-retry`, 0 errores.
  > [claude, 2026-10-22] [products#29](https://github.com/vio-live/vio-products-microservice/pull/29)
  > solo esta en QA. En prod, si la API de una tienda Woo falla, el consumidor de productos la
  > reintenta sin fin y sin pausa (en QA fueron ~20k lineas/min). Careless no usa Woo; afecta a las
  > tiendas Woo reales (`qkoreancosmetics.no`). Opciones: llevarlo antes de la congelacion
  > (1 servicio, products) o dejarlo para despues del lunes.
- [x] **E6. «Courier —» en el detalle de las ordenes enviadas desde Shopify — EN PROD 23/10 07:16**
  > [claude, 2026-10-23] Subio con todo develop: [extensions#36](https://github.com/vio-live/vio-extensions-microservice/pull/36), con kernel 1.0.282; al arrancar lee las 2 lineas de envio de Careless.
  > [claude, 2026-10-22] [extensions#32](https://github.com/vio-live/vio-extensions-microservice/pull/32)
  > solo esta en QA (el hotfix #34 de prod no lo lleva). En prod, el envio de Careless se guarda con
  > numero y link pero sin transportista. No afecta a la captura ni al dinero.

---

## F. Plan B, decidido de antemano

Si el **viernes por la tarde no hay un pago cobrado** en la unidad de Careless: salir el lunes
**sin compra** — contenido y analitica, que no mueven dinero — y activar el pago cuando este
probado. Un dia de ventas se recupera; un primer pago que falla delante de Aller y Careless, no.
