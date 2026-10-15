---
date: 2026-10-15
session: "shopcart: la orden de Stripe lleva su PaymentIntent en channelId"
participants: [angelo, claude, svc-shopcart]
status: live
---

# shopcart: la orden de Stripe lleva su PaymentIntent en `channelId`

## Goal

La orden **4554** de QA (Stripe, `channel: 'Partner'`, `channel_user_id: 506`, 2026-10-14T19:34:05Z, pagada por
Alan desde Vev con el checkout de Vio) tiene `order.channel_id = ''`. Las de Vipps de la misma sesión (4555, 4556)
sí tienen su `VIO-…`. orders usa `order.channelId` como referencia del pago para cancelar/reembolsar en el procesador
(hoy mismo el agente de orders añadió los ganchos de Stripe y espera ahí el `pi_…`:
[2026-10-15-orders-stripe-cancel-refund-desde-la-tienda](2026-10-15-orders-stripe-cancel-refund-desde-la-tienda.md)).
Averiguar por qué quedó vacía y arreglarlo de raíz en shopcart, sin tocar el contrato de `orders/save` ni
package-database.

## Done

### Diagnóstico (log de QA del pod `orders-66fbdc8d6b-xp2bl`, vivo desde 2026-10-14T15:23Z)

- La 4554 se pagó por el **flujo embebido** (`POST /checkout/:id/payment-intent`, `PostCheckoutPaymentStripeEmbebed`):
  - 19:34:05.249Z `POST /save` **sin `channelId`** (la orden se creaba antes de que existiera el PaymentIntent);
  - 19:34:06.775Z `POST /4554/update` con `partialOrder.channelId = pi_3UQXwACtc7XMW6Ft0GYmPoVJ` (es
    `rememberStripeReference`, `checkout.service.ts`) → **500 `No entity column "customer" was found`**
    (TypeORM `UpdateQueryBuilder.createUpdateExpression`, dentro de orders). shopcart lo loguea y lo traga;
  - 19:34:25Z `processOrderPaidByCustomer` 200 (webhook `payment_intent.succeeded`), sin volver a intentar la referencia.
- **Es sistemático**: los tres `/update` que recibió ese pod en 16 h (4552 18:32Z, 4553 19:07Z, 4554) dieron 500.
  El journal del 28/09 ya registraba `rememberStripeReference … 500 ×3` y lo atribuyó a "caídas de orders".
  **Ninguna orden de Stripe ha llevado nunca su referencia** (el write-back existe desde `8e2e727`, 28/09; antes no había nada).
- El pod de shopcart en QA se reinició a las 23:01Z, así que su log de ese momento no está; el de orders basta.
- Caminos de Stripe y dónde se rellenaba `channelId` antes del arreglo:
  - embebido (Vev, web SDK, iOS PaymentSheet; Stripe Link y las wallets dentro del Payment Element van por aquí):
    nunca en el save; `/update` justo después de crear el intent (roto);
  - Payment Link (`plink_`): nunca en el save; `/update` al completarse la sesión (`rememberStripeLinkPayment`, roto);
  - Apple/Google Pay nativos: nunca en el save; `/update` nada más cobrar (roto);
  - Vipps (`createVippsOrder`, ~L5303): `channelId: reference` en el propio `orders/save`; por eso 4555/4556 lo tienen.
    Klarna, Kustom, Qliro, Walley, Nexi y Adyen hacen lo mismo. Stripe era el único PSP que no.

### Arreglo

Commit `85e00d4` en `vio-shopcart-microservice`, rama `fix/referencia-de-stripe-en-la-orden` sobre `origin/develop`
(`b59cd49`), worktree `~/vio-commerce/worktrees/shopcart-referencia-stripe`. **Sin push ni PR** (ADR-0001).

- **Embebido: la orden nace con la referencia.** El PaymentIntent se crea **antes** de `orders/save` y el save lleva
  `channelId: paymentIntent.id` y `channelOrderName: '#pi_…'` (mismo contrato que Vipps). El `vio_order_id` de la
  metadata se completa después con `paymentIntents.update` (best effort). Si orders rechaza la orden se cancela el
  intent y se lanza un error con el motivo (antes era un TypeError en `order.id`, mismo resultado para el comprador).
- **`rememberStripeReference(order, pi, resellerId)`** sigue por `POST orders/:id/update`, pero es idempotente: no
  llama si `order.channelId` ya es ese `pi_`, nunca pisa una referencia distinta, y devuelve si la orden la lleva.
- **`completeStripeCheckout`** (webhook, sweep, confirm-on-read) escribe la referencia que falte **antes** de
  `processOrderPaidByCustomer`, también en un reenvío para un checkout ya SUCCESS (es el reintento de una escritura
  fallida). La query carga `cart.user.id` (el query builder no carga eager) para mandar el reseller. El Payment Link
  le pasa el `pi_` de la sesión; `rememberStripeLinkPayment` escribe la foto una vez y la orden en cada entrega.
- Helpers puros en `stripe-webhook.ts`: `isPaymentIntentId`, `stripePaymentIntentIdOf` (foto o prefijo del client
  secret); `vioPaymentMetadata` admite no tener `orderId` todavía.
- Apple/Google Pay **no cambian de orden** (cobran con `confirm: true` después de la orden): siguen dependiendo del `/update`.
- Tests: `src/modules/checkout/tests/stripe-order-reference.unit.spec.ts` (22): embebido (save con `pi_`, intent
  antes del save, metadata después, rechazo cancela el intent), `rememberStripeReference` (idempotencia, no pisa, solo
  `pi_`, 500 no rompe), wallets (referencia nada más cobrar, también con 3DS pendiente), webhook/sweep/reenvío/checkout
  sin foto, Payment Link (orden antes de "pagado" y foto), helpers. El harness de `stripe-intent-methods` devolvía
  `{ data: { id } }` del save (forma incorrecta, `order.id` quedaba `undefined`); ahora `{ id }`, como los demás.
  **Suite unitaria 43 suites / 637 tests** (base 42 / 615); `tsc --noEmit -p tsconfig.json` limpio antes y después.

## Decisions

- **No escribir la tabla `order` desde shopcart.** La primera versión escribía `channel_id` con un UPDATE guardado
  por el `OrderRepository` que el service ya inyecta (solo para leer). Lo paré: es una frontera de servicio que decide
  Angelo, no un agente. Con el reorden del embebido el camino que importa no depende del `/update`; wallets y Payment
  Link sí, hasta que orders lo arregle.
- El reseller del `/update` es `cart.user` (publisher), no la brand (ADR-0028), como en el resto del flujo.

## Blockers / open questions

- **orders: `POST /:orderId/update` responde 500 a toda llamada** (`No entity column "customer"`). Lo tiene que
  arreglar el agente de orders (el dashboard usa el mismo endpoint para editar la orden). Hasta entonces, wallets y
  Payment Link siguen sin referencia; el embebido ya no.
- Órdenes de Stripe anteriores a este arreglo: todas sin referencia. Backfill posible desde
  `checkout.origin_payment_body.paymentIntentId` (la foto, desde el 22/09) o el prefijo de
  `checkout.origin_payment_id` (`pi_X_secret_Y`) hacia `order.channel_id`, para las que importe reembolsar. No hecho.
- No verificado contra Stripe real (solo unit): `paymentIntents.update` de metadata tras el save y el `cancel` cuando
  orders rechaza la orden.
- `node_modules` es symlink al worktree `shopcart-brand-publisher` (token npm local 401): kernel 1.0.269 frente al
  1.0.270 que pide develop.

## Next session

- OK de Angelo → push + PR de `fix/referencia-de-stripe-en-la-orden`; desplegar junto con el arreglo de orders.
- Probar en QA el flujo embebido desde Vev: la orden nueva tiene que nacer con `channel_id = pi_…`; después cancelar
  desde Woo y ver `money moved` en el log de orders.
