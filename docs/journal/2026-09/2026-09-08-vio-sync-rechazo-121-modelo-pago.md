---
date: 2026-09-08
session: vio-sync-rechazo-121-modelo-pago
participants: [angelo, claude]
status: live
---

# Session — 2026-09-08 — tercera submission pausada (1.2.1) y el app pasa a ser pago vía Shopify

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Shopify pausó la tercera submission. Entender los findings y decidir el
modelo de cobro.

## Done

- **Findings**: **1.2.1** — el reviewer siguió "Open Vio dashboard" desde el
  app y encontró Plan & billing con upgrades por Stripe (Business 49 /
  Advanced 499) y "Manage in Stripe"; todo cobro a un merchant de Shopify
  tiene que pasar por Shopify. **4.5.4** — las credenciales del test account
  confundían.
- **Decisión de negocio** (Angelo + Michael): suscripción mensual vía
  Shopify, sin comisión sobre ventas, 90 días de trial en todos los planes:
  Starter 99 USD (10 SKUs), Growth 499 (500), Unlimited 999 (sin límite).
  Los clientes de Vio que no vienen por Shopify siguen en Stripe →
  [ADR-0017](../../decisions/0017-cobro-canal-shopify-via-app-pricing.md).
- **Dashboard de Vio**: cuentas con conexión Shopify ya no ven Stripe,
  upgrades ni el pocket "Vio fee" —
  `webapp-vio-commerce` [#13](https://github.com/vio-live/webapp-vio-commerce/pull/13);
  el signup `?source=shopify` fija Commerce —
  [#14](https://github.com/vio-live/webapp-vio-commerce/pull/14).
- Planes `starter`/`growth`/`unlimited` creados en el Partner Dashboard (en
  "Manual pricing" — ver el error en
  [2026-09-11](2026-09-11-vio-sync-app-pricing-e-incidente-suscripciones.md)).
  Borrado un plan viejo con handle `free` a $99: los handles son inmutables.
- Testing instructions: el paso 1 pide elegir plan, fuera todo "app is free" —
  documentado en [#93](https://github.com/vio-live/vio-shopify-sync/pull/93).

## Decisions

- Doble riel de cobro: Shopify para el canal Shopify, Stripe para el resto
  ([ADR-0017](../../decisions/0017-cobro-canal-shopify-via-app-pricing.md)).

## Blockers / open questions

- Los tiers nuevos no existían en el catálogo de planes del backend (Alan).

## Next session

- Runbook completo para Alan hasta el submit →
  [2026-09-09](2026-09-09-vio-sync-runbook-cuarta-submission.md).
