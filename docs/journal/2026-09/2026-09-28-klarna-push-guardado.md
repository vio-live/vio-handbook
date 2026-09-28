---
date: 2026-09-28
session: "El aviso de pago de Klarna: comprobar el estado y no duplicar"
participants: [angelo, claude]
status: live
---

# El aviso de Klarna deja de crear órdenes por su cuenta

## Goal

Cerrar el último de los avisos de pago sin proteger que encontró
[la revisión del 10/09](../lessons/): Klarna. Kustom, que compartía manejador, ya quedó cubierto
con su reescritura del 22–24/09 (`paymentKustomOk`).

## Done

**Lo que pasaba.** `/klarna/webhooks` es público y lleva un id de pedido y nada más; ese id viaja
en la URL de confirmación que ve el propio comprador. `paymentKlarnaOk` creaba la orden de
Commerce solo con eso: **no leía el estado del pedido en Klarna** y **no comprobaba si ya la había
creado**. Un POST con un id conocido creaba una orden dada por pagada, y un reintento de Klarna
(reintenta lo que no recibe un 200) creaba una segunda.

**Lo que hace ahora** ([shopcart #42](https://github.com/vio-live/vio-shopcart-microservice/pull/42),
mergeado y desplegado en QA), con la forma que ya tenían Qliro, Nexi y Kustom:

- el checkout se toma bajo su candado (`withCheckoutLock`): dos avisos a la vez no crean dos órdenes;
- un checkout ya en SUCCESS responde `alreadyProcessed` sin tocar nada;
- la orden se crea **solo** si Klarna responde `checkout_complete` y su veredicto antifraude no es
  `REJECTED` ni `PENDING`;
- un id que no es nuestro se ignora en vez de reventar con un 500.

**Decisión:** si el veredicto antifraude no se puede leer, la orden se crea igual. La compra está
completa y **Klarna no entra en el barrido de conciliación**: negarse ahí dejaría sin orden a alguien
que ya pagó.

**Verificación:** `klarna-payment-ok.unit.spec.ts`, 8 tests, 6 de ellos fallan contra `develop`;
suite 348/348; `tsc` limpio. En QA, shopcart arrancó y el relay público con un id inventado no crea
nada.

**El mismo agujero en base-api, encontrado al probarlo y quitado el mismo día.** Cuando `pre` decía
que el pago no era de shopcart, `klarnaService.receiveWebhook` leía el pedido con las claves de
plataforma y **creaba la orden de Commerce él mismo** (canal WORDPRESS), sin estado ni idempotencia.
Era el flujo antiguo de WordPress, cuyos pagos nacían en `POST /klarna/checkout`.

Angelo: "bórralo y nos quedamos solo con lo nuevo". En
[base-api #18](https://github.com/vio-live/vio-base-api/pull/18) se quitaron esa rama, la ruta
`POST /klarna/checkout` y los mapeadores que solo ella usaba. El webhook ahora reenvía a shopcart e
**ignora** lo que shopcart no reconoce. Verificado en QA: un id inventado responde 200 y no crea
nada (`is not one of ours — ignored`), y `POST /klarna/checkout` responde 404. base-api 51/51.

Los pagos de Klarna los inicia solo el checkout. `GET /klarna/order/:id` y la captura/cancelación
siguen igual — sin ruta que los llame, quedan como código muerto a revisar.

## Blockers

- Siguen abiertos los otros fallos graves del 10/09: Apple Pay y Google Pay marcan la orden como
  pagada sin comprobar que Stripe cobró; Walley manda el IVA multiplicado por 100; el webhook de
  Vipps se fía del cuerpo en vez del estado real.

## Next session

- Apple Pay y Google Pay (lo que puede enviar mercancía sin cobro).
- El IVA de Walley.
- Repasar lo que quedó sin usar en `klarnaService` de base-api (captura y cancelación, sin ruta).
