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

## Blockers

- **base-api tiene su propio camino heredado para Klarna.** Cuando `pre` dice que el pago no es de
  shopcart, `klarnaService.receiveWebhook` lee el pedido con las claves de plataforma y **crea la
  orden él mismo** (`orderService.save` + `processOrderPaidByCustomerByMicroServices`), sin
  comprobar el estado ni la idempotencia. Hoy falla con 401 porque no hay claves de plataforma en QA,
  pero el código sigue ahí: mismo agujero, otro servicio.
- Siguen abiertos los otros fallos graves del 10/09: Apple Pay y Google Pay marcan la orden como
  pagada sin comprobar que Stripe cobró; Walley manda el IVA multiplicado por 100; el webhook de
  Vipps se fía del cuerpo en vez del estado real.

## Next session

- Apple Pay y Google Pay (lo que puede enviar mercancía sin cobro).
- El IVA de Walley.
- Decidir qué se hace con el camino heredado de Klarna en base-api: quitarlo o protegerlo igual.
