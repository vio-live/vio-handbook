---
date: 2026-10-20
session: quick-fix
participants: [angelo, claude, svc-shopcart]
status: live
---

# Session — 2026-10-20 — shopcart: `refundId` para las compensaciones de analytics (ADR-0036)

## Goal

orders emite a analytics una compensación por cada reembolso del PSP y la cuenta una vez por `refundId`
([ADR-0036](../../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md)). shopcart, que
es quien le avisa (`POST orders/:id/payment-refunded`), tiene que mandar el id estable del reembolso en el
PSP y el total devuelto acumulado.

## Done

- Rama `feat/refund-id-para-compensaciones` desde `origin/develop` `48f9b65` (incluye #94 y kernel 1.0.279),
  worktree `~/vio-commerce/worktrees/shopcart-refund-id`. **PR vio-shopcart#95, commit `1166754`, sin merge.**
- **Solo Vipps llamaba a orders.** `tellOrdersPaymentRefunded` ya mandaba `refundedMinor` (acumulado de
  `aggregate.refundedAmount`); ahora lleva **`refundId`**: el `pspReference` de la modificación que devuelve el
  refund (nuestro reembolso: dashboard, Woo/Shopify vía `vippsOrderRefundedInShop`) o del evento `REFUNDED`
  del portal; respaldo determinista (`vio:ref:<ref>:<amount>:<refundedAntes>` / `idempotencyKey`).
- **Stripe no avisaba a orders**: `charge.refunded` solo se registraba en la foto del checkout. Ahora
  `stripeMoneyEvent` avisa como Vipps (`processor: 'STRIPE'`, `source: 'stripe'`), con el `re_…` de
  `charge.refunds.data[0]` (`charges.retrieve(id, { expand: ['refunds'] })`), el importe de **ese**
  reembolso (de la lista, o por delta frente al último registrado — `refundAmountOf` — nunca el acumulado),
  `refundedMinor` = `amount_refunded`, `capturedMinor`. Best effort, deduplicado por id de evento, nada sin
  orden, disputas solo se registran. Es comportamiento nuevo: está aislado en un bloque por si no se quiere.
- Tests: 3 Vipps (`vipps-payment.unit.spec.ts`), 5 Stripe (`stripe-money-events.unit.spec.ts`).
  **54 suites / 773 OK** (develop 54 / 765); `tsc --noEmit` 0 errores.

## Decisions

- Ningún proveedor manda el acumulado como importe del evento (regla del ADR tras la revisión del 20/10).
- Kustom (`kustomRefund`, webhook `refund.created`) tiene id (`refund_id`) pero no llama a orders: sin cambio.
  Klarna/Qliro/Walley/Nexi/Adyen reembolsan desde payment-processors: fuera de shopcart.

## Blockers / open questions

- orders: aceptar `processor: 'STRIPE'` y `source: 'stripe'` (→ `psp`) en `payment-refunded`.
- ¿Debe `releaseDuplicateStripe` (devolución íntegra de un pago duplicado) avisar a orders? Esa orden
  nunca se pagó; hoy no avisa.

## Next session

- OK de Angelo → merge de #95 detrás de orders.
