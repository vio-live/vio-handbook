---
date: 2026-10-30
session: morning
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan: la vuelta de Vipps cancelada en Vev

Sigue el seguimiento del [29/10](./2026-10-29-tarjetas-qa-y-vev-sdk-037.md#noche-seguimiento-de-alan-reanudado-angelo-quédate-monitoreando-lo-de-alan).

## Done

- **Noche:** QA apagado de 23:00 a 06:30 UTC. Alan solo pasó #468 a Doing a las 23:30 UTC. A las 06:44 UTC el feed
  programado de su marca alan-sup-s2 (1299) actualizó 72 productos: era la corrida de las 23:01, pendiente desde que
  QA se apagó. No lo hizo él.
- **#468, «Henter betalingsmåter…» infinito al volver de un Vipps cancelado:** encontré la causa y la arreglé en
  [vio-web-sdk#124](https://github.com/vio-live/vio-web-sdk/pull/124), mergeado (`a4e2f05`).
  - **Causa:** Vev monta `<VioCheckout>` con la página y llama a `Vio.init()` después, desde su bloque de config.
    La vuelta se lee antes del init. Como cada conexión guarda sus carritos (0.33), el carrito todavía no está y
    `open()` lanza, en silencio. La kasse queda sin estado y nunca pide los métodos. La captura de Alan coincide:
    solo «Betaling», sin carrito ni formulario.
  - **Arreglo:** la vuelta de Vipps reabre sobre el sponsor del checkout cuando el init está (espera hasta 10 s) y
    aplica el resultado después. Una vuelta pagada vacía ahora el carrito de la conexión. Sin checkout, el paso de
    pago dice «Handlekurven er tom.» en vez del spinner.
  - **Verificación:** un test nuevo reproduce el orden de Vev y falla igual que la captura antes del arreglo.
    Después pasa. Suite con los mismos 16 fallos que main.
  - **Alan:** avisado en #468 (07:06 UTC). Todavía no lo ve en su página.

## Blockers

- **Llevarlo a la página de Alan** necesita el OK de Angelo para tres pasos: release 0.37.1 en npm (lleva también
  #123, el arreglo de la vuelta de Kustom de #467), rebundle de Vev y `vev deploy`.

## Next session

- Las vueltas de Kustom, Qliro, Walley, Adyen y Nexi reabren igual, de forma síncrona antes del init. En Vev su caso
  de fallo ahora dice «Handlekurven er tom.» en lugar del spinner. Reabrirlas tras el init necesita sus propios tests,
  por la guarda de `returningFrom`.
- Sin verificar: «Du handler hos» salió sin nombre ni logo en la captura de Alan.

> La mañana siguió con QK (productos de Woo en cola): [journal aparte](./2026-10-30-products-woo-qk-en-cola.md).

## Tarde: seguimiento de Alan otra vez (Angelo: «te dejo escuchando lo de alan… ve arreglando y desplegando»)

- Cron de sesión `67af17ad` cada 10 minutos. Del día quedaban sin leer cinco comentarios de Alan (13:17–14:50 UTC).
  Contestados todos a las 16:02.
- **SDK 0.37.1 y Vev 0.339** (Alan, #468: «no veo cambios en el repo vev»):
  - [vio-web-sdk#125](https://github.com/vio-live/vio-web-sdk/pull/125) (`eb3b717`) trae #123 (vuelta de Kustom) y
    #124 (vuelta de Vipps antes de `Vio.init()`).
  - [vev#76](https://github.com/vio-live/vev/pull/76) (`e4c553a`) hace el rebundle, y `vev deploy` dejó el paquete en
    **0.339**. Las páginas lo toman al republicar.
  - **`npm publish` pendiente:** el token de npm de esta máquina da 401. Hay que hacer `npm login` y después
    `npm publish --access public` desde main. Vev no lo necesita.
- **#468, el resto:**
  - A4 (Stripe) correcto.
  - A5 (0 kr) correcto. Que Vio no baje a 0 un precio puesto a 0 en Woo es a propósito: `newUpdate` ignora
    `amount` 0 porque el plugin viejo mandaba `''`.
  - «Du handler hos» vacío no es un fallo: la marca de Alan tiene como logo `vio-logo-white.svg`, blanco sobre
    blanco.
  - Falta la evidencia de A2.
- **#467, orden 4647 (Woo y Vipps, captura al enviar):** dos fallos nuestros.
  - La línea devuelta entera en Woo se quedó en PROCESSING, así que el pedido no se completó y Vipps no capturó.
    El webhook de Woo trae las devoluciones sin sus líneas, y a orders solo le llegaba el importe.
  - Los importes iban sin IVA. La tienda de Alan tiene «precios sin IVA» y ningún tipo de IVA, y Vio le manda las
    líneas sin IVA: 1.200 devueltos de una línea de 1.500. El 4631 también: liberó 1.201,00 de una línea de 1.501,25
    y capturó 1.810,25 en vez de 1.510,00. Ayer lo di por bueno; corregido en la tarjeta.
  - **Arreglo:** [extensions#56](https://github.com/vio-live/vio-extensions-microservice/pull/56) (`0020c97`). Para
    las devoluciones parciales lee `orders/{id}/refunds`, manda `lines` (orders-ms ya marca REFUNDED las líneas
    devueltas enteras) y escala los importes por el total de Vio sobre el de Woo.
  - **Verificado en QA** con datos reales del 4647: escala 1,25, 1.200 → 1.500, y la línea 411963 ×1.
  - **A prod** con el OK de Angelo: [extensions#57](https://github.com/vio-live/vio-extensions-microservice/pull/57)
    (`b683423`). El código está en los dos pods y sin errores. En prod la única tienda sin IVA es la de prueba
    (usuario 1300, 0 devoluciones): ningún cliente afectado.
  - El 4647 se queda como está, y Alan repite la prueba con un pedido nuevo (instrucciones en #467).
  - Sin explicar: por qué la completación del 4647 mandó a COMPLETED solo una de las dos líneas en PROCESSING. Los
    logs de extensions de esa hora rotaron. Con `lines`, la línea devuelta ya no está en PROCESSING al completar.
- **#469:** capturas revisadas y correctas; Alan puede pasarla a Done.
- **17:13, #468: tras cancelar en Vipps, «Betal … med Vipps» sale gris** con «Vennligst fyll ut leveringsadresse».
  - Causa: la página se recarga al volver y el formulario de envío llega vacío. Desde 0.37.1 la caja reabre, pero sin
    los datos.
  - Arreglo: [vio-web-sdk#126](https://github.com/vio-live/vio-web-sdk/pull/126). Si la vuelta no está pagada,
    rellena los campos vacíos desde `getCheckout` (el pago estándar de Vipps guarda ahí la dirección) con
    `onFieldChange`.
  - Release 0.37.2 ([#127](https://github.com/vio-live/vio-web-sdk/pull/127), `c1c21d2`).
    [vev#77](https://github.com/vio-live/vev/pull/77): Vev **0.340** desplegado. Alan avisado a las 17:19.
- **Pruebas de Alan con el arreglo de devoluciones:**
  - El 4649 devolvió en Woo una línea entera. orders-ms la marcó REFUNDED y anotó 150000 (1.500 con IVA, no los
    1.200 de Woo). Falta que complete el pedido para ver la captura.
  - El 4650 es A3 (pagó después de cancelar dos veces).
  - El 4648 es A2, correcto: «3 varer: 2 × …» y el envío una sola vez.
- **#469** a Done (Alan, 16:25).
- **#468 a Done** (17:57). A2 (4648), A4 + B8 (4651 con Stripe, `js.stripe.com` solo en marcas con Stripe) y A3, todo
  correcto. En A3, el formulario vacío solo pasa tras cancelar un Vipps Express (no tiene dirección que recuperar).
- **18:22, #467, orden 4653:** la devolución ya funciona (la línea queda REFUNDED y se anotan 1.500), pero **Vipps no
  capturó** al completar.
  - `completeOrderItem` solo daba el pedido por enviado si todas las líneas estaban COMPLETED, y la REFUNDED lo
    impedía.
  - Arreglo: [orders#49](https://github.com/vio-live/vio-orders-microservice/pull/49) (`0dc607e`). `everyLineShipped`
    trata las líneas anuladas como terminadas y pide al menos una enviada. Desplegado en QA.
  - Al 4653 se le pidió un tracking (`saveTrackingNumber` → Vipps `shipped`), o repetir la prueba. Esperado: 1.515
    capturado y 1.500 liberado.
  - **Prod: pendiente del OK de Angelo.** Sin el arreglo, una devolución parcial en Woo con captura al enviar no
    captura nunca.
  - De paso, otra vez: «Your cut» del publisher se calcula sobre el total original. Es decisión de Angelo.
- **19:16, #467, orden 4654: verificado de punta a punta en QA.** Devolución de una línea entera en Woo → REFUNDED y
  150000 anotado. Completado en Woo sin tracking → `processOrderCompleted` → Vipps capturó 151500 y liberó 150000.
  Alan avisado. orders#49 sigue solo en QA, a la espera del OK de Angelo para prod.
- **21:11, #467: «roto el pago por Kustom».** El pago funcionaba (4655 y 4656 creadas), pero la vuelta mostraba
  «Handlekurven er tom.» con «Vi kunne ikke bekrefte betalingen».
  - Causa: la misma que en Vipps. La vuelta de Kustom reabría y leía antes de `Vio.init()`. El carrito no se vació y
    la segunda compra cobró otra vez.
  - Arreglo: [vio-web-sdk#128](https://github.com/vio-live/vio-web-sdk/pull/128). Kustom, Qliro, Walley y Adyen usan
    `reopenOnceInitialized` antes de leer.
  - Release 0.37.3 ([#129](https://github.com/vio-live/vio-web-sdk/pull/129), `e8d47fc`).
    [vev#78](https://github.com/vio-live/vev/pull/78): Vev **0.341** desplegado. Alan avisado.
- **22:20, #467, Kustom con 0.341:** la caja ya reabría con el carrito, pero `GetKustomOrder` seguía dando 401 (orden
  4657 cobrada).
  - El log del gateway, comparando hashes de las keys: en la página recién vuelta, todas las llamadas del primer
    segundo salieron con otra key (`Config`, `GetLineItemsBySupplier`, `GetKustomOrder`). Vev arranca en pasos y la
    key del canal del checkout todavía no se conoce. A los 45 s ya iba la buena.
  - Arreglo: [vio-web-sdk#130](https://github.com/vio-live/vio-web-sdk/pull/130). `readOnReturn` reintenta la lectura
    de Kustom, Qliro, Walley y Adyen a 1,5, 3, 5 y 8 s, solo con key rechazada.
  - Release 0.37.4 ([#131](https://github.com/vio-live/vio-web-sdk/pull/131), `182a459`).
    [vev#79](https://github.com/vio-live/vev/pull/79): Vev **0.342**. Alan avisado.
  - De fondo: la key del canal tarda en resolverse tras una redirección en Vev. Es mitigado, no resuelto en origen.
- **22:42–22:43, Kustom con Vev 0.342 (órdenes 4658 y 4659):** en el gateway, la primera lectura `GetKustomOrder` sale con
  la key de la plataforma y da 401. El reintento, unos 2 s después, va con la key del canal y responde bien, en las dos
  órdenes. Falta el comentario de Alan con lo que vio en pantalla.
- **23:02, #467:** Kustom correcto (4658 y 4659, con el recibo de Kustom). Alan repasó Vipps: cancelar y volver funcionó.
  La compra posterior falló porque QA se apagó a las 23:00 UTC. Sigue el lunes; si sale bien, #467 a Done.

### Pendiente al cierre del 30/10

- **Prod:** [orders#49](https://github.com/vio-live/vio-orders-microservice/pull/49), para que una línea devuelta no
  impida la captura al enviar. Necesita el OK de Angelo.
- **npm:** publicar 0.37.4. El token da 401; hace falta `npm login`.
- **Producto:**
  - «Your cut» del publisher sobre lo devuelto.
  - Los 25 packs de QK.
  - Navegadores dentro de apps en Vipps.
