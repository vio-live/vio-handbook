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
