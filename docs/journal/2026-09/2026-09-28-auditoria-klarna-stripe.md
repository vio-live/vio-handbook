---
date: 2026-09-28
session: "Auditoría de Klarna y Stripe en los caminos que usamos hoy"
participants: [angelo, claude]
status: live
---

# Auditoría de Klarna y Stripe: seis hallazgos, cinco arreglados

## Goal

Después de cerrar el aviso de Klarna ([entrada anterior de hoy](2026-09-28-klarna-push-guardado.md)),
auditar de punta a punta **los dos caminos vivos**: Klarna Payments (el widget en nuestra
página, `confirmPaymentKlarnaNative`) y Stripe nativo (Payment Element), incluidos Apple Pay,
Google Pay y los reembolsos. No el flujo viejo de KCO ni los Payment Links.

## Done

Seis hallazgos. Los cinco primeros van arreglados con test; el sexto es de permisos y también.

**1. Klarna se podía cobrar dos veces.** `confirmPaymentKlarnaNative` no miraba `status.SUCCESS`
ni tomaba `withCheckoutLock`. Un doble clic, un reintento tras una respuesta lenta o un comprador
que vuelve atrás gastaban un segundo `authorization_token`: segundo pedido en Klarna, segundo
cobro, segunda orden. La única defensa era un `sessionStorage` en el navegador.

**2. El antifraude de Klarna se ignoraba.** `fraud_status` sólo se copiaba a analítica; un pedido
`REJECTED` salía a preparar igual. Kustom sí lo comprobaba desde el rework del 22–24/09.

**3. Un cobro de Klarna sin orden no se recuperaba.** Klarna Payments no manda push —eso es sólo
KCO— y Klarna no estaba en `reconcileEmbeddedPayments`. El checkout guarda ahora de qué flujo
viene (`origin_payment_body`: `{provider:'Klarna', flow:'native'}`) y el barrido lee order
management y crea la orden que falta.

**4. Apple Pay y Google Pay daban por pagado lo que Stripe no cobró.** `confirm: true` no promete
cobro: `requires_action` (3-D Secure sin terminar) y `requires_payment_method` se escribían como
SUCCESS. Google Pay, además, no cerraba el checkout, así que el webhook repetía el aviso a orders.

**5. Los reembolsos de Stripe no llegaban a Stripe.** Dos fallos encadenados: la orden guardaba
`channelId` vacío —el campo que el dashboard manda a payment-processors— y payment-processors
usaba siempre la clave de la plataforma aunque el cobro fuera en la cuenta del vendedor (Stripe
responde "No such payment_intent" a la clave de otra cuenta). Ahora la orden guarda el id del
PaymentIntent y la clave se resuelve por pago, igual que ya hacía el conector de Klarna.

**6. Se podía leer el pedido de otro vendedor.** `GetKlarnaOrderNative` y `GetKustomOrder`
aceptaban un `user_id` del que llama (`userId: user_id ?? user.id`) y lo leían con las
credenciales de PSP de ese vendedor. Mismo patrón que el IDOR de `users` del 24/09; el argumento
se sigue aceptando pero se ignora.

### PRs

- [vio-shopcart-microservice#43](https://github.com/vio-live/vio-shopcart-microservice/pull/43) — 1, 2, 3, 4 y la mitad de 5.
- [vio-payment-processors-microservice#8](https://github.com/vio-live/vio-payment-processors-microservice/pull/8) — la otra mitad de 5.
- [graphql#14](https://github.com/vio-live/graphql/pull/14) — 6.

Tests nuevos en shopcart: `klarna-native-confirm.unit.spec.ts` (9) y
`wallet-charge-required.unit.spec.ts` (5). Los 14 fallan sin el arreglo; la suite unitaria
completa queda en 362 en verde.

## Decisions

- **El veredicto de antifraude decide, pero PENDING no pierde la compra.** REJECTED lanza error y
  no crea orden; PENDING devuelve `pending` sin orden y **el barrido la crea cuando Klarna
  decide**. Antes, negarse en PENDING habría dejado al comprador pagado y sin nada, porque Klarna
  no estaba en el barrido: por eso el 3 y el 2 tenían que ir juntos.
- **El marcador del flujo va en `origin_payment_body`**, no en una columna nueva: el barrido
  necesita distinguir native (order management) de KCO (checkout API), que se leen con llamadas
  distintas, y esa columna ya guarda la foto de Nexi y de Stripe.
- **Apple/Google Pay dejan la orden en PENDING**, no la borran: si el comprador termina el 3-D
  Secure, el webhook `payment_intent.succeeded` la completa.
- **payment-processors se basó en `develop`**, no en `feature/payment-secrets-hardening`: esa rama
  local estaba 15 commits por detrás y su contenido ya estaba mergeado (PR #3).

## Blockers

- `vio-payment-processors-microservice` **no se puede instalar con las credenciales de npm de esta
  máquina**: `@vio-/config@1.0.267` da 404 (los paquetes están bajo la otra cuenta de npm). El
  type-check de los dos ficheros tocados se hizo prestando los `node_modules` de shopcart; los
  tests de ese repo no se pudieron correr aquí.
- Siguen abiertos, a propósito, fuera de estos PR: captura automática de Klarna (tarjeta de
  auto-captura), órdenes PENDING de checkouts de Stripe abandonados, el respaldo con la cuenta de
  Vio sin liquidación ni IVA, y los vendedores sin `whsec_`.

## Next session

Alan revisa los tres PR y repite el E2E de Qliro **con todos los métodos**, con doble envío,
cierre del navegador después de pagar y reembolso comprobado en el panel del PSP:
[tarjeta WhAugJMF](https://trello.com/c/WhAugJMF).
