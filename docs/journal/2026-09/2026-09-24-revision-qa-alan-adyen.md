---
date: 2026-09-24
session: "Revisión del QA de Alan del 23/09: Stripe, Kustom y Adyen"
participants: [angelo, claude]
status: live
---

# QA de Alan del 23/09, revisado contra código, logs y Trello

## Goal

Angelo pidió revisar lo que avanzó Alan, solo en la parte de pagos.

## Done

**Stripe y los webhooks protegidos: verificado.**
- La regresión del relay se arregló con [base-api #15](https://github.com/vio-live/vio-base-api/pull/15),
  mergeada a las 18:05 del 23/09 y desplegada.
- Las evidencias de Alan lo respaldan: en los logs de staging se ve
  `event checkout.session.completed … signed:yes` y `shopcart answered 200`, con órdenes llegando a
  Vio. Él también corrigió `STRIPE_WEBHOOK_SECRET` en el entorno de staging, que estaba mal por no
  usarse.
- **Falta lo importante**: promover shopcart y base-api a producción. El agujero sigue abierto allí.

**Kustom: creíble, sin verificación propia.** Alan dice que todo funciona en web y móvil. Sus logs
de anoche ya no existen, porque QA se apaga de madrugada, así que no pude comprobar sus compras.
Sí está verificado el arreglo en sí, con las tres órdenes recuperadas del 23/09.

**Adyen: el fallo persiste y no es de las tarjetas.** Reproduje sus dos casos desde una página de
prueba propia, contra **la misma cuenta**, mismo importe de 1 500 Kr y una sesión con los mismos
campos que manda shopcart:

| Tarjeta | Resultado |
|---|---|
| `5454 5454 5454 5454`, con reto 3DS y contraseña `password` | Authorised, psp `JVGSVRSJ5R6M5375` |
| `5555 3412 4444 1115`, sin reto | Authorised, psp `KBSFC2XB5SH73PV5` |

O sea: tarjetas, importe, cuenta y reto están bien, y el problema está en el camino de QA. De paso
quedó comprobado que los avisos de Adyen llegan a QA y se verifican: los dos pagos de prueba
entraron firmados y se ignoraron por no ser checkouts nuestros.

**Por qué no se puede diagnosticar con lo que hay:** cuando Adyen rechaza, el SDK descarta el
resultado. `onFailed` no registra el código ni el motivo, y Adyen tampoco se lo cuenta al navegador.
El motivo **sí** llega al backend en el aviso, y shopcart ya lo registra:
`[adyenWebhook] payment refused for <ref>: <motivo>`. Los intentos de Alan fueron anoche y esos logs
se borraron. Se le pidió repetir una vez y dar la hora.

**Stripe: claves y interruptores, a pedido de Angelo.** Quiere el pago con tarjeta en web lo más
nativo posible, sin sacar al comprador de la página ([a0JpeBJd](https://trello.com/c/a0JpeBJd)), y
para poder avanzar pidió arreglar antes las claves y consolidar los interruptores. Tres PRs:

- [shopcart #40](https://github.com/vio-live/vio-shopcart-microservice/pull/40) y
  [api-ms #26](https://github.com/vio-live/vio-api-microservice/pull/26): **las dos claves de Stripe
  viajan juntas**. Cada mitad caía a la plataforma por su cuenta, así que un vendedor con solo la
  clave pública dejaba al navegador confirmando con una cuenta lo que se cobró con otra. Corrección
  a lo escrito el 23/09: el respaldo a la plataforma **sí existía**; lo que faltaba era la regla del
  par. Hoy no se nota porque el navegador aún no usa esa clave, pero el pago embebido la necesita.
- [api-ms #26](https://github.com/vio-live/vio-api-microservice/pull/26): **un solo Stripe con dos
  flujos**. `stripePaymentIntent` es pagar en nuestra página y `stripePaymentLink` es la página
  alojada. Solo se leía el primero, así que un canal con solo Payment Links no ofrecía Stripe. Ahora
  se ofrece con cualquiera de los dos y la configuración lleva `mode: native | link`.
- [webapp #36](https://github.com/vio-live/webapp-vio-commerce/pull/36): los interruptores pasan a
  llamarse **Stripe** y **Stripe · Payment Links**, y la nota de claves dice que hacen falta las dos.

Lo que ya existe para el pago embebido: el endpoint de shopcart por PaymentIntent, la mutación del
gateway que devuelve el `client_secret`, Stripe.js ya cargado en la página para Apple Pay, y la
orden naciendo del aviso `payment_intent.succeeded`, ya firmado. Falta solo la pieza de navegador.

## Decisions

- **Todo se queda en develop por ahora** (Angelo). La promoción a producción de shopcart y base-api,
  que es lo que cierra de verdad el webhook de Stripe, **se coordina con Alan cuando esté**.

## Blockers

- Producción sigue con el webhook de Stripe sin verificar, por decisión de esperar a coordinar la
  release con Alan.
- Un intento nuevo de Adyen, con hora, para leer el motivo del rechazo.

## Next session

1. Leer el motivo del rechazo en cuanto Alan repita, y seguir desde ahí.
2. Valorar que el SDK registre en consola el código de resultado de un pago fallido: hoy un rechazo
   no deja rastro en el navegador.
