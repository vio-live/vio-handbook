---
date: 2026-11-16
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 16/11

## Goal
Alan vuelve hoy. Angelo, 16/11: «ve con vev, cupón, que alan termine hoy con ello». La #480
[DiIsksLg](https://trello.com/c/DiIsksLg), códigos de descuento, se cierra hoy en Vev.

## Done
- **11:05 UTC, estado al volver:**
  - En Trello no hay ninguna acción de Alan desde el 13/11.
  - En QA, la última orden es del 12/11 a las 21:42.
  - El 13/11 hubo 4 carritos, todos antes de las 10:26 UTC.
  - QA está arriba.
  - Su página de Vev sigue caducada.
  - Su Woo (`woo-dev.vio.live`) da 530: el túnel está apagado.
  - La campaña 31 está sin código. Siguen `QAVIO15` (lo usa la 18) y `qa_vio10`.
- **11:17 UTC, la #480 reescrita para Vev**, con copia de seguridad de la descripción y las listas antes del cambio.
  - **Descripción nueva:** antes de empezar, cómo se prueba un código en Vev, el orden de hoy y los datos.
  - **Lista 2:** los tipos de cupón se prueban con `?vio_discount=CODE`, cada uno en una ventana privada. Cuando un código
    no entra, la página no dice nada (es así cuando nadie lo tecleó) y el motivo sale en Network, en `ApplyDiscount`.
  - **Lista 5:** marcada. Stripe sin código salió OK el 12/11. Klarna queda fuera porque la clave de plataforma de QA da
    401, y eso no tiene que ver con los códigos.
  - **Lista 10:** pasa de la campaña 18 y la página local a la campaña 31 y su página de Vev. Se quitó el caso de abrir
    la campaña 21, que en Vev no se puede.
- **#481:** las órdenes con la cuenta de Kustom de Boots están cerradas (Angelo: «no podemos seguir poniendo ninguna con
  esa cuenta»). «Boots test» se queda con nuestra cuenta y ya no se le devuelve la configuración de Boots
  (`payment_method` 22b909d1). Descripción y comentario actualizados.
- **11:40 UTC, plan para cerrar hoy en la #480** (Angelo: «él está usando a Claude para avanzar; con AI ayudando debería ir más rápido»).
  - **A, el Claude de Alan por API:** los cupones que no deben entrar, la lista 8 entera, el punto de Network y la comprobación de los pedidos en Woo.
  - **B, Alan a mano en Vev y en el dashboard:** unas 8 compras con Vipps que cubren varios puntos cada una. La lista 6 va en 3 compras (A: captura, reembolso solo del regalo y parcial; B: captura y reembolso total; C: cancelar).
- **11:35 UTC, repaso de las tarjetas** (Angelo: «lee bien las tarjetas y que estén actualizadas»):
  - **#480:**
    - La repetición de «borrar el cupón a mitad» se hace con un cupón de usar y tirar (`alantest2`), para no romper los de la lista.
    - La compra sin código de la lista 7 va antes de la lista 10, porque esa lista deja `QAVIO15` en la 31.
    - En la lista 2, los cupones que no entran se prueban por API, igual que en el plan.
    - Nombres de los productos y qué rebaja cada código: `QAVIO15` solo P1 y P3 (colección «Woo29Oct»); `qa_vio10` los 6.
    - La operación de Network se llama `ApplyCampaignDiscount`.
    - Los códigos de Shopify (petición del 12/11 a las 15:20) quedan aparte.
  - **#481:** título y descripción reescritos para Vev, con nuestra cuenta, el SDK 0.39.4 y las dos respuestas que faltan (artículo de Careless, surface 20). La descripción del 11/11 queda copiada en un comentario.
  - **#477:** estado añadido. Está en staging y en producción desde el 05/11 ([vio-analytics#42](https://github.com/vio-live/vio-analytics/pull/42)) y solo falta la prueba en vivo.
  - **#482 y #483:** estado añadido. Arreglados en QA y en Vev; falta comprobarlos en Vev y llevar shopcart#120 a producción.
- **11:39 UTC, decisiones de Angelo aplicadas:**
  - **Tarjeta nueva [#490](https://trello.com/c/XRMIf1WS)**, códigos de Shopify en Vev, en To do detrás de la #481. Comprobado en QA:
    - la tienda `alan-test-supplier` tiene los descuentos de prueba (creados el 13/11, `QA-PCT10`… `QA-FUT-COL`, más el automático del 5 %);
    - la campaña 26 (surface 16, canal 522, solo Vipps) tiene `QA-COL15`;
    - el bootstrap lleva su `discount.ref` y `discountMethods ["vipps"]`;
    - el permiso `read_discounts` está en la rama `custom/client-app` ([vio-shopify-sync#136](https://github.com/vio-live/vio-shopify-sync/pull/136)).
    Un código programado responde `COUPON_NOT_STARTED`, y el SDK no tiene texto para ese motivo; en Vev no se nota porque no hay campo «Rabattkode».
  - **#477 cerrada (Done).** Verificada en producción con los datos desde el 05/11.
- > [claude (sesión Woo Vio), 2026-11-16] **12:00–12:50 UTC, la #490 queda para hoy y llega el interruptor Activo a QA.**
  - Angelo: «déjasela a él lo de Shopify también para hoy». La #490 va justo después de la #480 y antes de la #481, con comentarios en las dos. La app de pruebas `vio-client-dev` que tenía corriendo en `alan-test-supplier` está parada para que Alan arranque la suya. Sin ella, QA no lee los códigos de su tienda (`DISCOUNT_UNAVAILABLE`).
  - **En QA, el código de campaña se puede apagar sin quitarlo y la fila del sponsor dice a cuántos productos aplica:**
    - columna `surface_campaign_discount_code.active` ([package-database#34](https://github.com/vio-live/package-database/pull/34), 1.0.293; migración aplicada en QA antes de los micros);
    - [vio-shopcart-microservice#122](https://github.com/vio-live/vio-shopcart-microservice/pull/122), [vio-campaigns-microservice#35](https://github.com/vio-live/vio-campaigns-microservice/pull/35) y [webapp-vio-commerce#111](https://github.com/vio-live/webapp-vio-commerce/pull/111);
    - el selector ya no repite el motivo de un código no soportado.
    Probado en la campaña 18 (QAVIO15) desde el dashboard y por API. Alan tiene 4 puntos nuevos al final de la lista 2 de la #490.
  - Reparto de la guardia propuesto a la otra sesión: la #490 y lo del selector, para la sesión Woo Vio; la #480 y la #481, para la sesión de esta mañana.
- **13:10–13:46 UTC, Alan empieza:**
  - **Su Woo responde:** `qa20` vuelve a ser un 20 % y `qa_gave` no está caducado. Republicó su página de Vev, que ya carga la SDK 0.39.4.
  - **Compras:** de 13:21 a 13:27, 7 órdenes con `qa_gave` (VIO-4734…4740, pedidos de Woo 63–69), cada una de 1 260 kr: P1 + G1 a 0 + 10 de envío.
  - **El total del checkout (2 635) es antes del regalo**, igual que en la VIO-4719 del 12/11; no es un fallo.
- **13:46, #480, lista 6:** canceló, completó y reembolsó en Woo, pero el dashboard seguía en «In progress».
  - **Causa:** `woo-dev.vio.live` está en las conexiones 469, 470 y 490 del vendedor 1289 y en la 512 de la marca 1331. `getEcomUserWooByShop` devolvía la de 1289, así que:
    - en las cancelaciones y los completados salía `toProcess: []`;
    - los reembolsos se leían con la clave de 1289, y Woo daba 401.
  - **Arreglo:** [vio-extensions-microservice#76](https://github.com/vio-live/vio-extensions-microservice/pull/76) (`473946e`), que elige la cuenta dueña de las líneas de la orden. Tiene 9 tests (4 fallan sin el arreglo) y las 249 pruebas de Woo pasan. En QA desde las 14:02.
  - **14:03, los 4 webhooks repetidos desde el pod:**
    - 4740 cancelada y la reserva de Vipps liberada;
    - 4737 completada y 1 260 cobrados;
    - 4738 con el regalo REFUNDED, sin mover dinero;
    - 4739 con P1 REFUNDED (se borró la marca de Redis `woo:refund:reported:4739:70:partial`, que se había puesto sin líneas). Vipps cobrará 1 250 menos al enviar.
  - **Alan avisado.** Marcados los 3 puntos comprobados de la lista 6; le quedan el envío del 68, el reembolso total, el parcial después de cobrar y los cuatro de comprobación.
- **Aviso a «Woo Vio»:** extensions repite cada ~0,6 s un 401 de la tienda Shopify de Alan (conexión 559 revocada, mensaje 23485149170771065). Es de la #490, así que no se toca aquí.

## Decisions
- **La #480 se termina en Vev.** Vev no tiene el campo «Rabattkode», así que los casos de código tecleado pasan a
  `?vio_discount=`.
- **Con la cuenta de Kustom de Boots no se hace ninguna compra más.** Cualquier prueba va con nuestra cuenta.
- **Shopify en su propia tarjeta (#490); la #477 se cierra sin la prueba en vivo** (Angelo, 16/11).
- **Reparto de la guardia con la sesión «Woo Vio»** (12:55 UTC, a propuesta suya). Angelo le pidió también quedarse con Alan.
  - «Woo Vio» lleva la #490 (Shopify).
  - Esta sesión lleva la #480 y la #481, y es la única que escribe en ellas.
  - Lo que Alan reporte en la #480 sobre el selector o el código de campaña se le pasa a «Woo Vio», que lo arregla y le contesta en un comentario propio.
- **Klarna fuera de la #480 por ahora** (Angelo, 16/11: «si klarna lo dejamos fuera por ahora»).

## Blockers
- Nada nuestro por ahora. Falta que Alan republique su página y encienda su Woo.

## Next session
- Guardia mientras Alan trabaje. Cuando su Woo responda, comprobar que `qa20` vuelve a ser un 20 % y que `qa_gave` no
  está caducado.
