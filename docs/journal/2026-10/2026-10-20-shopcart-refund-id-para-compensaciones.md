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

## Revisión independiente aplicada (commit `6646cd8`, mismo PR, pusheado)

Sustituye lo de arriba en tres puntos (el `pspReference` de Vipps y `charge.refunds.data[0]` de Stripe ya no se usan):

- **B1 (Stripe), "el último" no es "el del evento".** `refunds.data[0]` es el reembolso más reciente al LEER: con dos
  reembolsos ya hechos al procesar E1 y E2, ambos avisaban el segundo y el primero se perdía; un refund
  `failed`/`canceled` contaba; `expand: ['refunds']` depende de la versión de API de la cuenta del seller. Ahora
  `charges.retrieve` sin `expand` + `refunds.list({ charge, limit: 100 })` paginando `has_more`, solo `succeeded|pending`,
  un aviso por `re_…` no avisado **con su importe**, y el residuo (`amount_refunded − Σ avisado de esa carga`) una vez
  bajo `residual:<charge>:<amount_refunded>`. Lo avisado vive en `origin_payment_body.refundsTold`.
- **B2 (Stripe), el aviso corría dentro del lock y sin timeout, y `alreadyRecorded` se tragaba la compensación.** Ahora
  el aviso va fuera de `withCheckoutLock`, con un timeout de 5 s; se apunta solo tras el 2xx de orders. Si falla, la
  ronda se corta en el primero y el webhook responde 500 (`[stripe] orders-ms was not told about refund(s) …`). Stripe
  reentrega y se avisan los pendientes; orders deduplica por clave.
- **B4 (Vipps), el `pspReference` identifica el pago.** Es el mismo `psp-1` en CREATED y AUTHORIZED en los fixtures, y en
  cada REFUNDED. `refundId` = **Idempotency-Key de la modificación de refund** (`VippsService.refund` la manda y la
  devuelve), la misma que Vipps repite en su webhook REFUNDED: nuestro refund y su webhook dan una sola clave.
- Tests: **54 suites / 782 OK** (antes 773); `tsc --noEmit` 0. Cuerpo del PR reescrito (tabla, notas para orders,
  supuestos y lo que queda fuera).

## Decisions

- Ningún proveedor manda el acumulado como importe del evento (regla del ADR tras la revisión del 20/10).
- Kustom (`kustomRefund`, webhook `refund.created`) tiene id (`refund_id`) pero no llama a orders: sin cambio.
  Klarna/Qliro/Walley/Nexi/Adyen reembolsan desde payment-processors: fuera de shopcart.
- Stripe: cualquier fallo del aviso (también un 4xx de orders) hace fallar el webhook, como pidió la revisión. Vipps
  sigue best effort: su aviso no corre bajo una reentrega que lo repita.
- Primer aviso fallido → se corta la ronda: con orders caído, el webhook espera un timeout, no uno por reembolso.
- `releaseDuplicateStripe` no llama a orders directamente: su `charge.refunded` avisa por el webhook y la orden
  duplicada pasa a REFUNDED. El colector descarta compensaciones sin compra.

## Blockers / open questions

- **Orden de despliegue: orders #28 antes que shopcart #95.** Si orders rechaza `processor: 'STRIPE'`, todos los
  `charge.refunded` quedan en 500 y Stripe reintenta durante días.
- ¿Un 4xx permanente de orders (orden borrada, DTO rechazado) debe apuntarse como rechazado en vez de reintentarse?
  Hoy se reintenta.
- Supuesto no verificado en base-api: su relay del webhook de Stripe devuelve a Stripe el status de shopcart. Si
  responde 200 siempre, no hay reentrega. El controller ya lo asumía.
- Conocido: un residuo que la lista de Stripe explique después (por ejemplo `requires_action`) se cuenta doble. Un
  reembolso ya avisado que luego pasa a `failed` no se des-avisa.

## Next session

- OK de Angelo → merge de #95 detrás de orders #28; probar en QA un reembolso parcial y uno total desde el dashboard
  de Stripe y uno de Vipps desde el dashboard de Commerce (comprobar en el log `orders-ms told` con el `refundId`).
