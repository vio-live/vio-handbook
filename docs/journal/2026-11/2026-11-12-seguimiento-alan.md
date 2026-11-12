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

## Decisions
- Lo que queda de la #481 se prueba en Vev, en la página propia de Alan; el Replit ya no.
- La tienda Woo local de Alan (`woo-dev-local`, admin por defecto) es cosa suya: no se le pide cambiarla.

## Blockers
- Publicar en npm la 0.39.2, que incluye la 0.39.1: lo hace Angelo desde un checkout limpio en `e4983c1`.

## Next session
- Verificar en QA y en Kustom lo que reporte Alan en Vev. Después, devolver «Boots test» a la cuenta de Kustom de
  Boots (la configuración guardada está en `payment_method` 22b909d1).
