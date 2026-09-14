---
title: "La suscripción vive en dos lugares: Stripe y la fila de la base"
last-updated: 2026-09-14
owner: angelo
---

# La suscripción vive en dos lugares: Stripe y la fila de la base

El 2026-09-11 una cuenta nueva de Vio (la de Angelo, user 1309) quedó bloqueada dos veces
al cambiar de plan: 401 "Not authorized User without subscription" en todo el API. El
diagnóstico dejó a la vista cómo funcionan de verdad las suscripciones en
`vio-users-microservice`, y lo fácil que es romperlas.

## Cómo funciona

- **El middleware** (middleware-ms) deja pasar una cuenta solo si tiene al menos una
  **fila** de suscripción en estado `active`, `trialing` o `past_due`. Mira la base, no
  Stripe.
- **Las filas las crea el webhook de Stripe** (`customer.subscription.created`), no el
  código que crea la suscripción. El handler es idempotente por `customerId` + `originId`,
  pero termina en `createSubscription()`, que **no inserta nada si el usuario ya tiene
  alguna fila**.
- **`deleteSubscription` hacía soft-delete de la fila sin cancelar en Stripe** (arreglado el
  2026-09-11, users-ms `86bec0a`). Cada cambio de plan dejaba una suscripción huérfana viva
  en Stripe.
- **Stripe no permite mezclar monedas** en un customer con suscripciones vivas: "You cannot
  combine currencies on a single customer". El Free legacy es EUR y los planes del canal
  Shopify son USD, así que con una huérfana EUR viva, crear la USD falla.

## Qué se rompía

El cambio de plan hacía: borrar la fila vieja → crear en Stripe. Si el create fallaba (la
moneda), la cuenta quedaba con **cero filas**. El self-heal del middleware debería crear una
Free ante el 401, pero no funciona: la cuenta quedó bloqueada ~1 hora hasta que se hizo la
misma llamada a mano.

Y el orden inverso ingenuo (crear en Stripe → borrar la fila vieja, esperando que el webhook
cree la nueva) tampoco sirve: si el webhook llega antes de que se borre la fila vieja,
`createSubscription()` ve una fila, no inserta nada, y al borrar la vieja la cuenta queda en
cero para siempre.

## La regla para cambiar de plan

1. **Validar el plan destino** (existe, tiene price de Stripe) antes de tocar nada.
2. **Crear en Stripe.** Si falla por moneda, cancelar en Stripe las suscripciones vivas del
   customer y reintentar una vez.
3. **Guardar la fila nueva en el mismo paso**, sin esperar al webhook (que la reconoce por
   `customerId` + `originId` y no duplica).
4. **Recién entonces** retirar la anterior: cancelar en Stripe y soft-delete de la fila.

Implementado en `vio-users-microservice` PR #10 (pendiente de review de Alan al 2026-09-14).
Mientras tanto, rescate de una cuenta bloqueada: `POST api-ecom.vio.live/api/users/create/subscription`
con `{"userId": <id>, "codePlan": "1"}` (el endpoint todavía no pide auth, ver
[ADR-0017](../decisions/0017-cobro-canal-shopify-via-app-pricing.md)); correrlo **una sola
vez** y esperar el webhook: cada llamada repetida borra y recrea.

Relacionado: [recorrer-el-flujo-real-antes-de-dar-por-listo](recorrer-el-flujo-real-antes-de-dar-por-listo.md).
