---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
status: live
service: payment-processors
---

# Session — 2026-10-15 — payment-processors: refund parcial de Stripe para orders

## Goal
Que orders pueda mover dinero de Stripe para las órdenes del checkout de Vio (canal `Partner`)
cuando una tienda cancela o reembolsa: total con el `cancelPayment` existente, parcial con un
endpoint nuevo por monto. `cancelPaymentItem` no servía: reembolsa lo que diga `metadata.products`
sin mirar cuánto queda.

## Done
Rama `feat/stripe-refund-parcial` (desde `origin/develop`), commit local `f24ed31`, **sin push ni PR**
(ADR-0001; worktree `~/vio-commerce/worktrees/pp-stripe-refund`).

- **`POST /payment-processors/stripe/refund/:paymentId`** (`stripe.controller.ts`, `stripe.service.ts`
  → `refundPayment`). Body con el envelope del servicio `{ data: { amountMinor, currency, orderId?, reason? } }`
  (acepta también el body plano). 200 `{ refunded, refundId, status }`. Actúa con `clientFor(paymentId)`
  (cuenta Connect o keys de la brand que vendió, igual que `cancelPayment`).
  - 400 si `amountMinor` no es entero > 0, si falta `currency` o no coincide con la del intent, si el intent
    no está capturado (remite a `cancelPayment`) o si excede `Σ amount_captured − Σ amount_refunded` de los
    charges (mensaje con lo disponible). 404 si Stripe no conoce el intent en la cuenta resuelta.
  - Con `orderId`: idempotency key `vio-refund-<orderId>-<paymentId>-<amountMinor>` y la misma clave en
    `metadata.vio_refund_key` del refund. Un reintento encuentra ese refund en `charge.refunds.data` y lo
    devuelve (200) aunque ya no quepa en lo disponible o Stripe haya olvidado la clave (24 h). Los refunds
    `failed`/`canceled` no cuentan como hechos.
  - `reason`: si es uno de Stripe (`duplicate|fraudulent|requested_by_customer`) va como `reason`; si no,
    a `metadata.vio_reason`.
- **`cancelPayment`** devuelve `{ refunded, refundId, status }`; sin refund, `status` es nuestro
  (`already_refunded`, `not_captured`) para no confundirlo con uno de Stripe. Suma todos los charges (antes
  solo `charges.data[0]`). Errores `StripeInvalidRequestError` → 4xx con el mensaje de Stripe (antes 500).
- **`findPaymentCheckout`**: si ningún checkout tiene el `pi_` en `origin_payment_id` (Payment Link guarda
  `plink_…`), segunda query por `origin_payment_body LIKE '%"paymentIntentId":"pi_X"%'`.
- **`sellerOfMetadata`** lee también `vio_seller_id` (lo que shopcart escribe; el aviso de discrepancia
  nunca saltaba, ver `playbooks/e2e-campanas-commerce.md`).
- Tests unitarios sin BD: `stripe-refund.unit.spec.ts` (15) + 2 en `payment-seller.unit.spec.ts`.
  `npm run test:unit`: 5 suites / 53 tests en verde (antes 4 / 36). `npx tsc --noEmit` limpio.

## Decisions
- El tope se calcula con `Σ amount_captured` de los charges y no con `amount_received`: en Stripe son el
  mismo número y así el spec legacy con BD (`stripe.service.spec.ts`) sigue siendo válido.
- La búsqueda en el snapshot es una segunda query y no un `OR`: el `LIKE '%…%'` sobre `origin_payment_body`
  no usa índice y solo hace falta para Payment Link.
- `cancelPayment` no lleva idempotency key: sin `orderId` no hay clave estable y un reintento ya es inocuo
  (recalcula lo disponible y responde `already_refunded`).

## Blockers / open questions
- **No verificado contra código de shopcart** (regla: brief, no código): que el snapshot del Payment Link
  lleve la clave `paymentIntentId` exactamente así (`JSON.stringify`, sin espacios). El brief solo documenta
  `origin_payment_id = paymentLink.id` y `origin_payment_body.sellerId`.
- Dos refunds parciales **legítimos del mismo monto** para la misma orden colisionan en la clave
  (`orderId + paymentId + amountMinor`): el segundo devuelve el primero sin reembolsar. Si orders necesita
  eso, hay que meter un discriminador (ítem/línea) en la clave.
- `cancelPayment` sigue sin anular (`paymentIntents.cancel`) un intent en `requires_capture`: responde
  `not_captured` y no mueve nada. El 400 del refund parcial remite ahí tal como pidió orders; si hace falta
  anular autorizaciones de verdad, es un follow-up.
- ESLint reporta 4 errores de formato preexistentes en `stripe-connector-connect.unit.spec.ts` (no tocados).

## Seguimiento (misma sesión) — `refundedTotalMinor`
PR #13 mergeado en `develop` (`718ee79`). Orders detectó el choque: Woo reporta el **total acumulado**
reembolsado, no cada importe, y orders no guarda lo pedido antes. Decisión del orquestador: la operación
idempotente es "deja el total reembolsado de este pago en X". Rama `feat/stripe-refund-total` (desde
`origin/develop`), commit local, sin push:
- El body acepta `amountMinor` **o** `refundedTotalMinor` (ambos → 400, ninguno → 400).
- Con total: `toRefund = total − Σ amount_refunded`; `≤ 0` → 200 `already_refunded` sin llamar a Stripe;
  `total > Σ amount_captured` → 400 ("the store reports … more than the … captured"); sin capturar → el 400
  que remite a `cancelPayment`.
- Clave `vio-refund-total-<orderId>-<paymentId>-<total>` (+ `metadata.vio_refund_key`); el replay se
  comprueba antes que el `≤ 0`, así que un reintento con el mismo total devuelve el refund ya hecho y
  totales crecientes (250 → 350) reembolsan la diferencia con clave distinta.
- Tests: +7 (`npm run test:unit` 5 suites / 60). `tsc` limpio.

## Next session
- OK de Angelo → push de `feat/stripe-refund-total` y PR contra `develop` (lo sube el orquestador).
- orders: consumir `POST /stripe/refund/:paymentId` con el envelope `{ data }`, `refundedTotalMinor` para
  los refunds reportados por la tienda y `orderId` siempre.
