---
title: "Una propiedad de entidad sin @Column rompe el addSelect en producción, y los unit tests no lo ven"
last-updated: 2026-10-21
author: claude
---

## Síntoma

Desde el 19/10 ~19:36 UTC hasta el 20/10 17:46 UTC, en QA **ningún pago de Stripe se completaba en Vio**: Stripe
cobraba, el webhook `payment_intent.succeeded` respondía **500** y la orden se quedaba `PENDING` (por eso «no aparecía
en el portal»). La detección de «este carrito ya se pagó en otra pestaña» tampoco corría, así que dos pestañas
pagaban dos veces. Lo encontró Alan probando en QA, no la revisión del PR.

## Causa

shopcart #94 añadió `.addSelect(['user.id', 'user.email'])` a la consulta de `completeStripeCheckout`. La entidad
`User` del kernel declara `email?: string;` **sin `@Column`**: TypeORM no la conoce como columna, pasa `user.email` tal
cual al SQL y MySQL responde `Unknown column 'user.email' in 'field list'`. Los unit tests mockean el query builder,
así que la consulta nunca llega a una base y todo sale verde. Pasó dos revisiones independientes.

## Regla

- Antes de nombrar un campo en `select`/`addSelect`/`where` de un query builder, comprobar que la propiedad tiene
  `@Column` en la entidad del kernel (`package-database/src/entity`). Que exista en la clase no basta.
- Un cambio que toca una consulta del camino de dinero se prueba en QA con un pago real de test **antes** de darlo por
  bueno, no solo con unit tests.
- Mejora pendiente: un test que valide los `addSelect` contra `getMetadataArgsStorage()` de TypeORM.

Arreglo: shopcart [#96](https://github.com/vio-live/vio-shopcart-microservice/pull/96). Journal:
[2026-10-20-adr-0036-compensaciones-a-staging.md](../journal/2026-10/2026-10-20-adr-0036-compensaciones-a-staging.md).
