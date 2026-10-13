---
date: 2026-10-13
session: "shopcart: una sola fuente de vendedor (F2.4, ADR-0028 punto 1)"
participants: [angelo, claude]
status: live
---

# shopcart: una sola fuente de vendedor

## Goal

Parte de F2.4 del [plan de ejecución](../../handoff/campanas-en-commerce-plan-de-ejecucion.md),
según [ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md) punto 1. La cuenta
que cobra deja de salir del cliente: shopcart la pide a una sola función.

## Done

- Rama local **`feature/brand-publisher`** en vio-shopcart-microservice, commit `48788bf`, en un
  worktree (`~/vio-commerce/worktrees/shopcart-brand-publisher`). **Sin push y sin PR** (ADR-0001).
- **`sellerOfCart(cart)`** (`src/modules/checkout/providers/seller-of-cart.ts`):
  - hoy devuelve `cart.user.id`;
  - si el carrito no tiene vendedor, lanza; nunca cae a la cuenta de Vio;
  - el futuro campo `seller` del carrito se lee ahí, con `cart.user` como fallback.
- **Caminos que tomaban el vendedor de otra fuente:**
  - Stripe link e intent: usaban el `dto.userId`;
  - Apple Pay y Google Pay, init y confirm: usaban el `dto.userId`;
  - GET `payment-intent/:id/:userId`, GET `payment-klarna/:id/user/:userId` y GET
    `payment-klarna-native/:orderId/user/:userId`: usaban el `userId` del path. Ahora leen con el
    vendedor del checkout dueño del id, y un id ajeno no se lee;
  - init de Vipps: usaba el `ChannelUser.user` del path. Ahora usa el carrito; si el
    `channelUserId` del path no es el `cart.channelUser`, devuelve **403
    `VIPPS_CHANNEL_MISMATCH`** sin crear el pago;
  - Klarna `merchant_data.sellerId`: ya no decide el reseller de la orden.
- **Caminos que ya usaban `cart.user.id`:** ahora pasan por `sellerOfCart`. Son los de Kustom,
  Qliro, Walley, Nexi, Adyen, Vipps y Klarna, en init, ok-handlers, capture, refund, cancel y
  webhooks.
- **El reseller de `orders/save`** sigue siendo `cart.user` (el publisher).
  `rememberStripeReference` recibe al reseller, porque orders-ms solo deja editar la orden a él.
- **Compatibilidad:** los DTOs y las rutas siguen aceptando `userId` y `channelUserId`. En los
  DTOs `userId` pasa a opcional y se ignora, como ya hacía Kustom.
- **Tests:** 39 suites y 557 tests pasan (antes 38 y 539). `tsc` pasa con `tsconfig.json` y con
  `tsconfig.build.json`. Los tests nuevos están en `seller-of-cart.unit.spec.ts` y suman 4 casos de
  Vipps en `vipps-payment.unit.spec.ts`.

## Decisions

- **Stripe, después del init:** manda el vendedor grabado en la foto del checkout
  (`origin_payment_body.sellerId`), porque la plata de un pago existente está en esa cuenta. Si no
  hay foto, decide `sellerOfCart`. Si la foto y el carrito no coinciden, se loguea. Los pagos
  nuevos graban lo mismo que dice `sellerOfCart`. Solo puede haber diferencia en pagos viejos que
  se iniciaron con un `userId` distinto.
- **Carrito de Vipps sin `channelUser`:** no hay con qué comparar el path, así que se ignora y
  cobra el vendedor del carrito.

## Blockers / open questions

- **Paso 4 (el `userId` legítimo es igual a `cart.user.id`) está verificado solo del lado de
  shopcart y por los briefs:**
  - la regla del workspace prohíbe leer el código de otros servicios;
  - graphql saca `userId` y `channelUserId` del token, y el middleware resuelve la key a
    user + channel;
  - no está confirmado en el código de graphql ni de base-api.
- **Vipps init cambia de `ChannelUser.user` a `cart.user`:**
  - si en algún flujo son distintos, cambia la cuenta que cobra;
  - capture y webhooks ya usaban `cart.user`, así que hoy un desajuste ya rompía el pago.
- **Pendiente del kernel:** el campo `seller` del carrito. `sellerName` (Kustom y Adyen) sigue
  saliendo de `cart.user`.

## Next session

- Que el agente de graphql y el de base-api confirmen qué `userId` mandan en `cart/create`,
  `payment-intent`, `payment`, apple-pay/google-pay y `payment-vipps`.
- Probar en QA el flujo SDK → graphql → shopcart antes de abrir el PR.
