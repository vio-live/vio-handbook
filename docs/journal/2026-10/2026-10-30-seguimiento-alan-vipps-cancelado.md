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
