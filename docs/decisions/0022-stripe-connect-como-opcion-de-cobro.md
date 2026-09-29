---
title: "0022 — Stripe Connect como opción de cobro para sellers sin contratos"
date: 2026-09-29
status: proposed
owner: angelo
deciders: [angelo]
---

# 0022 — Stripe Connect como opción de cobro para sellers sin contratos

## Context

Hoy cada seller cobra con **sus propias credenciales** de cada proveedor (fila
`payment_method`, ver [`architecture/payments.md`](../architecture/payments.md)), y si
no las tiene, Stripe, Klarna, Qliro, Vipps y Adyen caen a la **cuenta de Vio**.

Dos problemas:

- **Hay clientes sin contrato directo con Vipps, Klarna o Stripe.** Pedirles que se den
  de alta en cada proveedor y peguen claves es la barrera.
- **Si Vio toca el dinero, es un tema legal.** Bajo PSD2 (aplica a Noruega vía EEE), una
  plataforma que actúa para comprador y vendedor sólo queda fuera de la regulación de
  servicios de pago si **nunca posee ni controla los fondos**
  ([EBA Q&A 2020_5354](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5354),
  [guía de Stripe](https://stripe.com/guides/how-psd2-impacts-marketplaces-and-platforms)).
  El respaldo con la cuenta de Vio es exactamente eso.

Modelo comercial confirmado por Angelo (2026-09-29): los sellers **venden productos
propios y de otros suppliers**. El checkout lo cobra siempre la cuenta del **seller del
canal** (`getStripe(dto.userId)`, `getConfig(sellerId)`), aunque el carrito traiga
productos de varios suppliers; el seller le paga al supplier por fuera de Vio.

## Decision

Ofrecer **dos modos de cobro por seller**, a su elección:

| Modo | Para quién | Quién cobra y vende |
|---|---|---|
| **Credenciales propias** (el de hoy) | tiene contratos con los proveedores | el seller |
| **Stripe Connect** | no tiene contratos | el seller, con una cuenta Stripe creada desde el alta de Vio |

Reglas del modo Connect:

- Cuentas **Standard** y **cobros directos** (direct charges): el dinero va al saldo del
  seller, Stripe le paga, disputas y pérdidas son suyas. Vio nunca tiene los fondos.
- **Sin comisión de plataforma** (sin `application_fee_amount`); Vio monetiza por otro lado.
- **Sin reparto automático a suppliers.** En Connect una cuenta conectada no puede
  transferir a otra; repartir obliga a pasar el dinero por el saldo de Vio (separate
  charges and transfers), que es lo que se quiere evitar.
- Métodos por Stripe: tarjeta, Apple Pay, Google Pay y **Klarna** (disponible en Noruega
  en NOK, soporta Connect con todos los tipos de cobro; en Standard el seller lo activa
  en su dashboard). **Vipps** también existe en Stripe con Connect, pero en *private
  preview* (hay que pedir acceso).

**El respaldo con la cuenta de Vio se mantiene por ahora** (Angelo, 2026-09-29). Retirarlo
queda como decisión abierta; ver abajo.

## Plan

**Fase 0 — gestiones, sin código (Angelo, en paralelo):**
activar Connect en la cuenta Stripe de Vio (perfil de plataforma, Noruega, Standard);
pedir el preview de Vipps; preguntar a Klarna (partner.support@klarna.com) si tiene un
modelo de alta por plataforma; consulta a abogado noruego sobre el modelo sin fondos y
la relación seller–supplier.

**Fase 1 — backend (QA):**
1. `payment_method.options` de `STRIPE` admite `{ mode: 'connect', accountId }` además de
   `{ publishKey, secretKey }`. Sin cambios en `package-database`.
2. api-ms (`paymentMethod`): crear cuenta Standard + Account Link, y leer estado
   (`charges_enabled`, `payouts_enabled`, `requirements`, `klarna_payments`); proxy en base-api.
3. shopcart: `getStripe(sellerId)` (`checkout.service.ts` ~L228, único punto de
   resolución) devuelve `{ client, requestOptions, publishKey, accountId }` y todas las
   llamadas pasan `stripeAccount`: payment link, intent embebido, Apple Pay, Google Pay,
   expiración de intents.
4. Webhook de Connect con **verificación de firma** y **dedupe por `event.id`**; el
   webhook actual tampoco verifica firma (no hay `constructEvent`) y se arregla igual.
   `account.updated` alimenta el estado en el dashboard.
5. payment-processors: reembolsos con `stripeAccount` (sobre payment-processors#8).
6. Apple Pay: registrar el dominio de pago en cada cuenta conectada al darla de alta.
7. Gateway + SDK: el SDK recibe `accountId` e inicia Stripe.js con `stripeAccount`.

**Fase 2 — dashboard (webapp, Settings → Payments):** selector de modo, botón
"Conectar con Stripe", páginas de retorno/refresh del onboarding, estado de la cuenta.

**Fase 3 — Klarna y Vipps por Stripe:** hoy el intent embebido usa
`allow_redirects: 'never'` (`checkout.service.ts` ~L1771), lo que **excluye** Klarna y
Vipps. Hay que permitir redirecciones y manejar `return_url` en el SDK/Vev. Métodos:
respetar el toggle `stripePaymentIntent` del canal y dejar que Stripe decida los de adentro.

**Fase 5 — opcional:** Vio como partner de Vipps MobilePay (el comercio firma su contrato
y liquida a su cuenta; el partner no toca dinero), si Stripe no da el preview. Reporte
de ventas por supplier para que el seller liquide.

**Prueba:** Connect en test mode en QA (tarjeta, Apple Pay, Klarna en NOK, reembolso
parcial y total, evento de webhook repetido) y E2E desde el navegador, no sólo por API.

## Decisiones abiertas

- **Retiro del respaldo con la cuenta de Vio** (antes "Fase 4"). Mantenido por ahora.
  Mientras exista, un seller sin credenciales cobra en la cuenta de Vio y el punto legal
  sigue abierto para ese caso. Si se retira: primero listar qué sellers de prod dependen
  del respaldo en cada proveedor, avisarles y migrarlos; después cortarlo en
  `getAvailablePaymentMethods` (api-ms) y en los conectores de shopcart.
- **Quién implementa** las fases 1–3.

## Alternatives considered

- **Destination charges / separate charges and transfers.** Permitirían comisión y
  reparto a suppliers, pero ponen el dinero en el saldo de Vio. Descartado.
- **Express o Custom.** Stripe le cobra a la plataforma por cuenta activa y por payout,
  y la plataforma asume más responsabilidad sobre pérdidas. Sin comisión no se justifica.
- **Cobro separado por supplier en el checkout.** Rompe la UX y el modelo de que el
  seller es quien vende.

## No cubre

Qliro, Walley, Nexi y Kustom no pasan por Stripe: el seller que los quiera necesita su
propio contrato.
