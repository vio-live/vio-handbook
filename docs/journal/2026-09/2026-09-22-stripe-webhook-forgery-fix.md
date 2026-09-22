---
date: 2026-09-22
session: quick-fix
participants: [angelo, claude]
status: live
---
# Session — 2026-09-22 — Stripe webhook: confirmaciones de pago forjables

## Goal
Cerrar el agujero marcado en el estudio de entrega de órdenes: el webhook público de Stripe completaba órdenes creyéndole al body. Arreglarlo siguiendo las reglas del repo (rama + PR a develop; nada a main/master sin OK; nunca contra prod).

## Done
- **Confirmado en QA (solo QA, nunca prod).** Port-forward de `svc/base-api` en `kubernetesqa`, POST de un `payment_intent.succeeded` **forjado y sin firma** con un `order_id` **inexistente** (987654321 → no toca nada real). base-api respondió 200; shopcart entró en `CompleteOrderFlowStripeEmb` y llamó `POST http://orders/987654321/processOrderPaidByCustomer`; orders llegó a `processOrderPaidByCustomer`→`findById`, 500 sólo porque el id era falso. Con un id de orden real y pendiente habría marcado la orden pagada y disparado el fanout. El pod de QA estaba en el código pre-fix (`CompleteOrderFlowStripeEmb`, sin `stripeEventPointer`).
- **Fix shopcart** ([#34](https://github.com/vio-live/vio-shopcart-microservice/pull/34), rama `fix/stripe-webhook-verify`): el body pasa a ser un PUNTERO, nunca un hecho — la misma regla que ya siguen Kustom/Nexi/Qliro/Walley. Nuevo `providers/stripe-webhook.ts` (helpers puros: `stripeEventPointer`, `verifyStripeSignature` sobre el body crudo, metadata namespaced `vio_*` + lector legacy, `matchesStripeCheckout`). `WebhookPayment` ahora: busca NUESTRO checkout por el id del objeto → el checkout decide qué cuenta Stripe cobró (la del seller si tiene claves propias) → verifica la firma donde tenemos `whsec_` → **re-lee el objeto de Stripe** y sólo `succeeded`/`paid` + match (checkout/orden/moneda/monto) completa. Idempotente bajo `withCheckoutLock`. `main.ts` arranca con `bodyParser:false` + `json({verify})` para conservar `req.rawBody`.
- **Fix base-api** ([#13](https://github.com/vio-live/vio-base-api/pull/13), rama `fix/stripe-webhook-relay`): el relay reenvía `Stripe-Signature` + los bytes crudos tal cual y **espera** a shopcart, devolviendo su veredicto (401→401, 2xx→ack, resto→500). El JSON en el cable no cambia → se puede desplegar en cualquier orden.
- **Secundarios** cerrados en el mismo PR: metadata namespaced (`vio_order_id` — un `order_id` pelado en la cuenta del propio seller colisiona con el lookup del plugin Stripe de WooCommerce y puede marcar una orden ajena como fallida); se dejó de loguear la secret key descifrada (`getStripe` logueaba el objeto entero) y el PI con su client secret en Google Pay; el controller ahora `throw` en vez de `return` de la excepción (un objeto retornado es un 200 → Stripe lo toma por ack y no reintenta).
- **Auditoría de los demás relays de PSP** (posteada en #34): Stripe era el único abierto de par en par. Adyen/Nexi/Qliro/Kustom/Walley re-leen el pago y son idempotentes. **Vipps es el único follow-up (medio):** `receivedWebhook` SÍ hace `GET /epayment/v1/payments/{reference}` pero ignora el resultado — completa según `data.name == 'AUTHORIZED'` del body. Menos expuesto que Stripe (base-api tiene token por-orden en la URL, `verifyVippsCredential`), pero mismo anti-patrón.
- Tests: shopcart 314 unit verdes (+48 nuevos: `stripe-webhook.unit.spec.ts` 24, `stripe-payment.unit.spec.ts` 24, incluidos los casos de evento forjado / cuenta equivocada / monto / moneda / firma expirada / redelivery / cancelación). `tsc --noEmit` limpio. base-api: su lane de tests necesita DB viva, la lógica queda cubierta por los units de shopcart.

## Decisions
- El body de un webhook público no se cree nunca: sólo se toma un id para buscar y una firma para verificar; la verdad del dinero es la API del PSP. (Documentado en `architecture/payments.md`.)
- `STRIPE_WEBHOOK_SECRET` nuevo y **opcional** (sólo cuenta plataforma; sin él el re-fetch sigue siendo el control que decide).

## Blockers / open questions
- **Necesita release a prod tras review** (el código de pagos ya llegó a prod por el release no planificado de Alan). Sin `gh pr merge` — Angelo mergea.
- Vipps (gate en el estado re-leído) queda ofrecido como PR aparte, a la espera del OK de Angelo.
- El otro issue de prod del estudio — `PATCH /api/users/:id` sin owner check — sigue abierto.

## Next session
- Al mergear #34 + #13: `gh run list` verde, y verificar en QA con un evento forjado que ahora responde 401/ignored y NO llega a orders.
- Si Angelo lo aprueba: PR de Vipps con el mismo patrón (gatear en el estado que devuelve Vipps).
