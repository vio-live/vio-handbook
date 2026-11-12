---
date: 2026-11-12
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 12/11

## Goal
Lo pendiente de la #481 [zM6LN43p](https://trello.com/c/zM6LN43p), Boots × Kustom, ahora **en Vev** y no en el Replit
(Angelo, 12/11: «alan ahora probará en vev no en replit, pero las funcionalidades son las mismas»): el doble pago
con dos pestañas, la vuelta a la página correcta y la reapertura sin órdenes nuevas. Guardia desde las 13:46 UTC
(«Quédate interactuando con Alan»). En Doing también está la #480 [DiIsksLg](https://trello.com/c/DiIsksLg),
códigos de descuento con Vipps; Alan montó una tienda Woo local en Docker, publicada por el túnel `woo-dev-local`
(Angelo: es su tienda de prueba, no hace falta tocarla).

## Done
- **09:30 UTC:** [shopcart#119](https://github.com/vio-live/vio-shopcart-microservice/pull/119) (un carrito, un pago:
  lock del carrito y validación de Kustom) mergeado y desplegado en QA, con el OK de Angelo. Verificado en el pod.
  Le avisé a Alan en la #481 a las 09:37.
- **~11:00:** las mejoras de la #481 pasadas a tarjetas del Backlog, con las capturas de Alan:
  [#482](https://trello.com/c/wyxrEvRm), [#483](https://trello.com/c/k1esk1va),
  [#484](https://trello.com/c/RwXH8cCH), [#485](https://trello.com/c/5dnVGgZ1),
  [#486](https://trello.com/c/yTN1kfl5), [#487](https://trello.com/c/LtkTf0cW) (asignada a Angelo) y
  [#488](https://trello.com/c/aU43nmD5).
- **#482 y #483 arreglados:**
  - **Causa:** en shopcart, la orden de Kustom se creaba o sincronizaba sobre el checkout ACTIVE del carrito,
    no sobre el de la ruta. La pestaña vieja escribía su página en la orden de la otra (VIO-4707).
  - **[shopcart#120](https://github.com/vio-live/vio-shopcart-microservice/pull/120):** la orden es del checkout
    que la pide, y uno sustituido recibe `CHECKOUT_SUPERSEDED`. Mergeado y en QA a las 12:40.
  - **[web-sdk#150](https://github.com/vio-live/vio-web-sdk/pull/150):** al reabrir, el SDK retoma el checkout
    de la pestaña; con el checkout sustituido, quita Kustom y no lo vuelve a montar solo.
  - **Probado en vivo contra QA** con la página local `qa-boots`, sin pagar. Al reabrir y al recargar se mantiene
    una sola orden (`c6de7cd6`). Con dos pestañas, la vieja muestra «Handlekurven ble endret i en annen fane…» y
    el backend rechaza su sincronización.
- **~13:00:** release del SDK 0.39.1 ([web-sdk#151](https://github.com/vio-live/vio-web-sdk/pull/151), `7a96b52`)
  y Vev 0.347 ([vev#85](https://github.com/vio-live/vev/pull/85)), desplegado con el OK de Angelo. Es la primera
  vez que Vev recibe la 0.38 y la 0.39 (códigos de descuento). Rollback: `vev restore` a la 0.346.
- **#481 reescrita para Vev** y comentario a Alan: republicar su página, doble pago con dos pestañas, volver a la
  página correcta (con dos páginas) y reabrir.
- **Fallo encontrado en la verificación:** con Kustom abierto, añadir un producto actualizaba la orden antes de
  que el producto llegara a Commerce. Kustom se quedó con 2 líneas y la página mostraba 3. Viene de antes de hoy.
  Arreglo en [web-sdk#152](https://github.com/vio-live/vio-web-sdk/pull/152), probado en vivo (4 líneas y 768,69
  en Kustom, igual que la página). Sin mergear: espera el OK de Angelo.
- **13:57 #480, Alan:** «me preparas los datos nuevamente, tengo un nuevo Woo para el user brand 1331, la surface es
  21».
  - **Lo que había en QA:** Alan ya tenía la surface 21 «Vev Alan 12 NOV», la campaña 31 (por defecto, marca 1331),
    el canal 526 con Vipps y la colección «Woo 12 NOV» con 6 productos. Su Woo es la misma tienda en
    `woo-dev.vio.live`, con 4 productos nuevos, y la conexión 508 de Vio sigue funcionando.
  - **Lo que preparé (14:05):**
    - 12 cupones en su Woo (ids 33–44), con los productos que ya tenía en los papeles de la tarjeta: P1 = 411963,
      P2 = 416101, P3 = 412009, G1 = 416099, G2 = 416102. Como sus productos valen más de 500, `qa_min500` pasa a
      ser `qa_min2000`.
    - El código de Vio `qa_vio10` (discount 275, sobre `up91EztSJ`).
    - `QAVIO15` como código de la campaña 31.
  - **Verificado:**
    - el resolver de extensions da cada cupón como se espera (regalos con su variante; caducado y no soportados
      con su motivo);
    - el bootstrap de la surface 21 lleva `discount.ref` y `discountMethods ["vipps"]`, sin el código.
  - Le respondí en la tarjeta y la descripción ya lo refleja.
- **14:25 #480, Alan, en Vev** (`a-alan-local.vev.site/woo-origin`): «veo descuento pero no lo de producto gratis».
  - **Era lo esperado:** la campaña 31 da `QAVIO15`, un 15 % sin regalo, y P1 sale a 1 062,50. Product Simple 3
    estaba a precio completo porque lo había añadido él.
  - **Vev no expone el campo «Rabattkode»** (`discountField`); el código de página se pasa con `?vio_discount=`.
  - **Comprobado en su página** con `?vio_discount=qa_gave`: G1 «Gratis», total 1 260 y Stripe desactivado.
  - **Respondido (14:28):** qué checklists se hacen en Vev y cuáles en la página local. Un código que no se
    teclea no muestra mensajes cuando se rechaza; está así por diseño desde la 0.38.0.
- **14:32–14:35 #480:** Alan marca los 4 primeros casos del checklist 1 y reporta que la imagen del regalo no sale en
  el carrito.
  - **Órdenes verificadas en QA y en su Woo:**
    - **VIO-4718:** `QAVIO15`, 1 072,50; pedido Woo 45 con 858 sin IVA.
    - **VIO-4719:** `qa_gave`, G1 a 0, 1 260; pedido Woo 46 con 1 008 sin IVA, el cupón en el pedido y el uso en 1.
    - Las dos fueron con **Vipps Express**. Ninguna orden respalda el caso «checkout → Vipps estándar», así que se
      lo pedí.
  - **Imagen del regalo:** bug confirmado. `GetCart` manda `image` como lista (`[{id,url}]`) y el SDK solo leía un
    objeto. Las líneas que dibuja la página tienen la imagen local; el regalo no. Arreglo en
    [web-sdk#153](https://github.com/vio-live/vio-web-sdk/pull/153) con test (falla sin el arreglo). Espera el OK
    de Angelo, junto a #152.
- **14:44–15:01 #480:**
  - **VIO-4720** con Vipps estándar, verificada (pedido Woo 47; `qa_gave` en 2 usos).
  - **«Sin código»** OK: quitó el código de la campaña 31 y ya no hay `ApplyDiscount`.
  - **14:57:** volvió a poner `QAVIO15` en la 31 desde el selector del dashboard (comprobado en QA).
- **~15:20 SDK 0.39.2 en Vev (OK de Angelo):**
  - **Merges:** [web-sdk#152](https://github.com/vio-live/vio-web-sdk/pull/152) y
    [#153](https://github.com/vio-live/vio-web-sdk/pull/153). El conflicto en el CHANGELOG se resolvió con un merge
    de `main`, sin force-push.
  - **Release** [#154](https://github.com/vio-live/vio-web-sdk/pull/154) (`e4983c1`) y [vev#86](https://github.com/vio-live/vev/pull/86):
    Vev **0.348**. Rollback: `vev restore` a la 0.347.
  - **CLI de Vev:** su servidor ahora exige la 2.3.0 (`npm i -g @vev/cli@2.3.0`).
  - **Alan avisado** en la #480 y en la #481 para que republique su página.
- **15:04–15:48 #480, checklist 3:**
  - **15:04:** Alan pone `qa_gave` como código de la campaña 31 desde el selector (fuente `store`).
  - **Stepper del regalo bloqueado en 1:** OK.
  - **Varios `ApplyCampaignDiscount`:** no duplican el regalo. OK.
  - **Regalo con cantidad 3 por `AddItem`:** el carrito descuenta una sola unidad (−1 375) y el pago se rechaza con
    `GIFT_MAX_ONE_UNIT`. OK.
  - **La imagen sigue gris** porque su página publicada aún sirve la 0.39.1 (comprobado en el paquete de Vev que
    carga). Le pedí republicar.
- **15:20, otra sesión** (también como Angelo) le pidió en la #480 montar los códigos de Shopify (vio-shopify-sync#136).
  Esa parte la lleva esa sesión; no la toco.
- **~16:00:** Alan republicó su página y Vev ya sirve la 0.39.2 (comprobado en el paquete que carga).
- **16:13 #480, checklist 3:** la imagen del regalo ya sale.
  - **Quitar lo de pago, también borrándolo en la base de datos:** el carrito se vacía solo, y `CreateCheckout`
    responde `CART_EMPTY`. No hay forma de pagar solo el regalo.
  - **«Fjern» y cambiar cantidades:** totales correctos (5 125 − 1 375 + 10 = 3 760) y el regalo sigue en 1.
  - **Lo que marqué a petición suya:** 4 casos del checklist 3. Quedan los 2 de código tecleado, que van en la
    página local.
- **16:32 #480:** Alan probó por GraphQL los dos casos de código tecleado.
  - **Segundo código:** se rechaza con `COUPON_OTHER_APPLIED`. OK, marcado.
  - **`qa_gave` en un carrito vacío:** se acepta (`executed: true`), y es lo correcto. `COUPON_MIN_AMOUNT` solo sale si
    el cupón tiene importe mínimo, como fija el test de `storeCouponSpend` (`minimumAmount: null` con `[]` cumple).
    El caso del checklist se pensó para la TasteWP de faves, cuyo cupón sí tenía mínimo. Le pedí repetirlo con
    `qa_min2000`.
- **16:39 #480:** `qa_min2000` se rechaza en un carrito vacío (`COUPON_MIN_AMOUNT`) y se aplica con 2 × P1 (carrito
  `f869c603`). Con eso el checklist 3 queda completo.
- **16:46–16:51 #480, checklist 4, `qa20` cambiado en Woo con el cupón ya aplicado:**
  - En los logs de shopcart, a las 16:49:30, el primer intento de pago (carrito `0330c46b`) se rechaza con
    `COUPON_CHANGED`.
  - El segundo va a Vipps con el valor nuevo (760).
  - Falta que Alan confirme que vio «Handlekurven er oppdatert – prøv igjen.» en la página. No lo marqué.
- **16:59, Alan:** no vio el aviso en ningún sitio.
  - **Causa:** el SDK no tenía `COUPON_CHANGED` en `COUPON_REASONS`, así que `discountReasonOfError` no devolvía
    nada. El botón de Vipps del carrito no mostraba aviso y abría el checkout, donde el precio ya estaba actualizado.
  - **Arreglo:** [web-sdk#155](https://github.com/vio-live/vio-web-sdk/pull/155). El motivo ya está en la lista y no
    es final (el código se queda con sus condiciones nuevas). Tiene texto propio, «Rabatten er endret av
    butikken.», y el carrito no abre el checkout. Los 3 tests nuevos fallan sin el arreglo.
  - **Release y despliegue:** 0.39.3 ([#156](https://github.com/vio-live/vio-web-sdk/pull/156), `ad038a0`) y
    [vev#87](https://github.com/vio-live/vev/pull/87): Vev **0.349**. Desplegado con la indicación de Angelo de ir
    mergeando y desplegando para que Alan pueda seguir.
  - Alan, avisado para que republique y lo repita.
- **17:06 #480, caducar `qa_gave` en Woo con el carrito aplicado:**
  - **17:02:16:** el pago se rechaza con `COUPON_EXPIRED`; el código y el regalo salen del carrito. OK, marcado.
  - **Lo que lo bloqueaba después era Vipps:** su API de pruebas (`/epayment/v1/payments`) dio 429 a las 17:04 y 503
    en todos los intentos de 16:56 a 17:04 (19 × 503 y un solo 201 en una hora). Cada toque genera unas 4 peticiones.
  - Le pedí esperar y probar una sola vez, y volver a dejar `qa_gave` sin caducar o poner `QAVIO15` en la campaña 31.
- **17:47 #480, borrar el cupón en Woo a mitad:** el pago del carrito `abfd7e0c` se rechaza con `COUPON_NOT_FOUND`
  (cupón «alantest») y el código sale del carrito. OK.
  - Vipps vuelve a responder: a las 17:46:03, `POST /epayment/v1/payments` → 201.
- **17:50:** Alan no encuentra «Bruk» en Vev. Vev no expone `discountField`, y es la segunda vez hoy que eso le
  bloquea casos; la decisión sigue pendiente de Angelo. Le indiqué que en Vev haga solo el doble clic en pagar y que
  «Bruk» se pruebe en la página local.
- **17:54–18:03 #480, checklist 4:** doble clic en pagar, dos pestañas y cancelar en la app de Vipps, todo OK.
  - Órdenes: VIO-4721 (sin código, 1 260), VIO-4722 y VIO-4723 (`QAVIO15`, 1 072,50), con sus pedidos de Woo 49–51 y
    sin duplicados.
  - La cancelación queda como `ABORTED` → `payment_cancelled`, sin orden.
- **18:16 #480:** con la 0.39.3 republicada, el cupón cambiado seguía abriendo Vipps sin aviso.
  - **Causa:** el **gateway GraphQL reintenta todo**, incluidos los 4xx (`axios-retry`, «Reintenta todo»). El
    `COUPON_CHANGED`, que solo se rechaza una vez, se reintentaba 220 ms después y pasaba (carritos `babd7a20` y
    `0669756b`). Por la misma razón, cada 503 o 429 de Vipps se convertía en unas 4 llamadas.
  - **Arreglo:** [graphql#42](https://github.com/vio-live/graphql/pull/42), `retries: 0` en el inicio del pago de
    Vipps, como ya llevan las llamadas de descuento. 2 tests nuevos que fallan sin el arreglo; suite 644/644.
    Mergeado (`c715eb3`) y desplegado en QA hacia las 18:24; verificado en el pod.
  - **Pendiente:** los inicios de pago de los demás métodos siguen con el reintento por defecto.
- **18:29–18:44 #480, checklist 4 con graphql#42 en QA:**
  - **Cupón cambiado:** el rechazo `COUPON_CHANGED` (18:29:06) ya no se reintenta. El carrito muestra «Rabatten er
    endret av butikken. Handlekurven er oppdatert – prøv igjen.» con el total nuevo, y el segundo toque abre Vipps.
    OK, marcado.
  - **Compra tras compra:** el regalo vuelve en cada carrito. VIO-4726/4727/4728 con pedidos Woo 55–57 y `qa_gave`
    en `coupon_lines`. OK.
  - **Móvil:** salta a la app. **Escritorio:** la página de Vipps pide el número. OK.
  - Checklist 4: quedan caducar el pago de Vipps, los 25 códigos (página local) y revocar la clave REST.
- **19:07 #480, pago de Vipps caducado:** `EXPIRED` a las 18:53 (checkout `297f3da1`), sin orden. El nuevo intento
  pagó VIO-4730. OK.
- **20:24–20:27 #480, 25 códigos inventados por script:**
  - El primer intento devolvió 25 × `COUPON_OTHER_APPLIED`: el carrito llevaba el código de la campaña.
  - Con un carrito sin código (`b542a6ab`): 20 × `COUPON_NOT_FOUND` y 5 × `COUPON_UNAVAILABLE`. Es el tope de
    `COUPON_RATE_MAX_UNKNOWN` (20 por minuto y canal). OK.
  - Del checklist 4 solo queda revocar la clave REST, que va al final.
- **20:50 #480:** Alan desconecta y reconecta su Woo (conexión nueva 511) y sincroniza. Sus productos dejan de salir
  por GraphQL.
  - **Causa:** `channel_user_products` de los canales 516, 519 y 526 quedó vacío; los productos, las colecciones y
    `channel_group` estaban bien.
  - **Arreglo en QA (20:51):** `POST products/channel-process/collections/update` con `up91EztSJ` y `l43F97e5G`.
    Ahora 526 → 6 productos, y 516 y 519 → 2 cada uno.
  - **Bug abierto en el Backlog:** [#489](https://trello.com/c/FAQlozGG). Reconectar la tienda no rehace el catálogo
    de los canales.

## Decisions
- Lo que queda de la #481 se prueba en Vev, en la página propia de Alan; el Replit ya no.
- La tienda Woo local de Alan (`woo-dev-local`, admin por defecto) es cosa suya: no se le pide cambiarla.

## Blockers
- Publicar en npm la 0.39.3, que incluye la 0.39.1 y la 0.39.2: lo hace Angelo desde un checkout limpio en `ad038a0`.

## Next session
- Verificar en QA y en Kustom lo que reporte Alan en Vev. Después, devolver «Boots test» a la cuenta de Kustom de
  Boots (la configuración guardada está en `payment_method` 22b909d1).
