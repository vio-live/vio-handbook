---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
agent: svc-orders
status: live
---

# Session — 2026-10-15 — orders: el dinero de Stripe al cancelar o reembolsar desde la tienda

## Goal

Reporte de Alan (14/10, verificado en logs y base de QA): cancelar o reembolsar
desde WooCommerce una orden del checkout de Vio pagada con **Stripe** cambia el
estado en Vio pero **no mueve dinero en Stripe**. Vipps sí funciona. Arreglarlo
solo en `orders` (rama `feat/stripe-cancel-refund-desde-la-tienda`, worktree
`~/vio-commerce/worktrees/orders-stripe-woo`, kernel 1.0.267 via symlink).

## Done

Commit local (sin push, ADR-0001) sobre `origin/develop` (`136e6ca`), todo en
`src/modules/order/providers/order.service.ts` + un spec nuevo:

- **Causa 1 — el procesador se compara mal.** Shopcart graba
  `payment_processor` como lo dice el checkout (`'Stripe'`, `'VIPPS'`; la 4554
  de QA tiene `'Stripe'`), y el service comparaba estricto contra
  `StaticData.PaymentProcessor.Stripe` (`'STRIPE'`): ninguna rama de Stripe
  entraba nunca. Nuevo helper `processorOf(order)` (`String(...).toUpperCase()`)
  y se usa en **todas** las comparaciones: `cancelOrderInShop`,
  `cancelOrderBySupplier`, `deleteItemOrder`, `refundedInShop`,
  `saveTrackingNumber`, `processOrderCompleted`, `processOrderPartial`,
  `cancelOrderOnSalesChannel`. No queda ningún `order.paymentProcessor ===`.
- **Causa 2 — `refundedInShop` no tenía gancho de dinero para Stripe** (dejaba
  `money: { ignored: true, reason: 'no money hook for STRIPE' }` y marcaba
  REFUNDED igual). Nuevo `tellPaymentServiceAboutStripe(order, what, process,
  body)`, simétrico a `tellShopcartAboutVipps`:
  - total (`dto.full`) → `POST {PAYMENT_PROCESSORS}/stripe/cancelPayment/:pi`
    (ya existe: devuelve capturado − ya devuelto en la cuenta de la brand, o
    cancela el intent);
  - parcial → `POST {PAYMENT_PROCESSORS}/stripe/refund/:pi` con
    `{ data: { amountMinor, currency, orderId, reason: 'refunded in shop' } }`
    (endpoint **nuevo**, lo hace otro agente en payment-processors; responde
    `{ refunded, refundId, status }` o 4xx `{ message }`).
  - referencia = `order.channelId` (id del PaymentIntent). Vacía o sin `pi_` →
    no llama, `logger.warn` y `money: { ignored: true, reason: 'no payment
    reference' }`. Parcial sin importe → `ignored`, razón explícita.
  - try/catch siempre; el estado en Vio se sigue actualizando; `money` lleva el
    resultado; el warn lleva `error.response.data.message ?? error.message`
    (nunca `JSON.stringify(error)`), y todo log dice `money moved` / `money NOT
    moved`.
- **Causa 3 — `cancelPaymentItem` no sirve para pagos del checkout** (lee
  `metadata.products` del PaymentIntent, que shopcart no escribe →
  `{refunded: 0}`). Fuera de WORDPRESS ya **no** se llama ni en
  `deleteItemOrder` ni en `cancelOrderBySupplier`; el pago se liquida con
  `cancelPayment` cuando **todos** los ítems quedan CANCELED (`deleteItemOrder`)
  o al cancelar la orden entera (`cancelOrderInShop`, gancho nuevo junto al de
  Vipps). Mientras queden ítems abiertos, log explícito de que el dinero no se
  mueve. WORDPRESS conserva las llamadas legacy tal cual.
- **Tests** `src/modules/order/tests/order-stripe-money.unit.spec.ts` (sin
  base, `npm run test:unit`): 29 casos — `processorOf`; `refundedInShop` Stripe
  total/parcial/sin importe/sin moneda, Vipps igual que antes (`'VIPPS'` y
  `'Vipps'`), sin referencia (`''`, `null`, `'88'`, `'cart-1'`), Klarna
  ignorado, 4xx con mensaje real, red caída; `deleteItemOrder` con `'Stripe'`
  entra en la rama, no llama `cancelPaymentItem`, `cancelPayment` solo con
  todos cancelados, sin referencia no rompe, 4xx no deshace, Vipps igual,
  WORDPRESS legacy intacto; `cancelOrderInShop` Partner+Stripe, 4xx, sin
  referencia, WORDPRESS legacy. **Suite unitaria 46/46.**
- `npx tsc --noEmit`: solo el error preexistente de
  `order.service.spec.ts:3` (`mockRequest` de `@woocommerce/woocommerce-rest-api`,
  ya documentado en el brief §8b).

## Decisions

- **Body del `/stripe/refund` envuelto en `{ data: ... }`**, como todas las
  llamadas de orders a payment-processors y como lee ese servicio
  (`HttpRequest.RequestService<T>` → `requestService.data`, brief §4). Si el
  agente de payment-processors lo implementó leyendo el body crudo, hay que
  alinear uno de los dos: el fallo es visible (4xx → `money.notApplied`), no
  silencioso.
- **`refundedInShop` no discrimina WORDPRESS**: el endpoint
  `stripe/cancelPayment` es el mismo que ya usa la rama WORDPRESS de
  `cancelOrderInShop`, así que un `refunded-in-shop` de una orden WordPress hace
  lo correcto sin rama aparte.
- **Normalizar también Klarna**: era lo pedido ("todas las comparaciones").
  Efecto colateral a vigilar: una orden Partner con `'Klarna'` ahora sí entra en
  `klarna/cancelPaymentItem` / `cancelPayment` (antes, muerto por la
  mayúscula), y esas llamadas legacy **no** están en try/catch. Klarna está en
  401 en QA, así que no se puede probar hoy.

## Blockers / open questions

- **`refundedTotalMinor` es acumulado** ("Total refunded in the shop so far",
  `RefundedInShopDto`). Shopcart, para Vipps, lo trata idempotente
  (`min(total tienda, capturado) − ya devuelto`). Orders manda ese acumulado como
  `amountMinor` al `/stripe/refund` nuevo porque no guarda cuánto se devolvió
  antes. **Payment-processors debe restar `amount_refunded` del PaymentIntent**
  (devolver `min(amountMinor, captured) − refunded`), si no un segundo reembolso
  parcial en Woo devuelve dos veces. Pendiente confirmar con el agente de
  payment-processors.
- La orden 4554 tiene `channelId` vacío: aquí se trata como "sin referencia"
  (log + `ignored`); la corrección de que shopcart escriba el `pi_` va aparte.
- No se pudo probar e2e contra QA: ni el endpoint `/stripe/refund` existe aún
  ni hay orden Stripe con `pi_` en `channelId` para ejercitar `cancelPayment`.
- No corrí `yarn test` (suite con base): no corre en develop (brief §8b).

## Next session

- Cuando payment-processors tenga `/stripe/refund`: alinear envelope del body y
  la semántica de `amountMinor` (acumulado vs. delta), y probar en QA con una
  orden nueva de shopcart (ya con `pi_` en `channelId`): cancelar desde Woo →
  `cancelPayment`; reembolso parcial en Woo → `refund`; cancelar ítem a ítem
  desde el dashboard → `cancelPayment` solo con el último.
- PR a `develop` de `feat/stripe-cancel-refund-desde-la-tienda` cuando Angelo
  dé el OK.
