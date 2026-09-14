---
title: "ADR-0017: Los merchants del canal Shopify pagan vía Shopify App Pricing (doble riel de cobro)"
last-updated: 2026-09-14
owner: angelo
status: live
---

# ADR-0017: Los merchants del canal Shopify pagan vía Shopify App Pricing (doble riel de cobro)

## Context

Vio Sync (el app de Shopify, `vio-live/vio-shopify-sync`) es un Sales Channel que conecta la
tienda de un merchant con su cuenta de Vio. Hasta septiembre de 2026 el app era gratis y la
cuenta de Vio se cobraba, como a cualquier cliente, por **Stripe** desde el dashboard de Vio.

El 2026-09-08 Shopify pausó la tercera submission al App Store por el requisito **1.2.1**:
el reviewer siguió "Open Vio dashboard" desde el app y encontró Plan & billing con upgrades
por Stripe. Para el App Store, **todo cobro a un merchant de Shopify tiene que pasar por
Shopify** (Billing API o App Pricing). Además Vio tiene clientes que no vienen por Shopify y
tienen que seguir pagando por Stripe.

## Decision

1. **Riel Shopify**: el merchant que llega por el app paga una **suscripción mensual del app
   vía Shopify App Pricing**. Planes: Starter 99 USD (10 SKUs), Growth 499 USD (500 SKUs),
   Unlimited 999 USD (sin límite), **90 días de trial** en todos, **0% de comisión** sobre
   ventas (Angelo + Michael, 2026-09-08).
2. **Riel Stripe**: los clientes de Vio que no vienen por Shopify siguen como siempre.
3. **Espejo en el backend**: el plan elegido en Shopify se replica a la cuenta de Vio para
   que apliquen los límites. El app lee el plan (`?plan_handle=` al volver de la página de
   planes, guardado en metafields `plan_handle`/`plan_synced`) y llama a
   `POST /api/users/create/subscription` con `codePlan` 5/6/7 (env `VIO_CODEPLAN_*`). El
   backend crea una suscripción espejo en Stripe **sin método de pago**, que es lo que mira
   el middleware para dejar pasar la cuenta.
4. **El dashboard no muestra precios a estas cuentas**: Plan & billing dice "Managed through
   Shopify", sin Stripe, sin "Upgrade now" y sin el pocket "Vio fee". La cuenta se detecta
   por una conexión SHOPIFY en `/ecom-user`, por la credencial SHOPIFY pendiente del alta, o
   por una suscripción viva en plan 5/6/7.

## Alternativas consideradas

- **App gratis + cobro por Stripe** (lo que había). Rechazado por Shopify (1.2.1).
- **Manual pricing + Billing API**. "Manual pricing" es solo texto del listing: no hay página
  de planes ni cobro automático, y hay que programar los cargos con la Billing API. Se usó
  por error entre el 08 y el 11 de septiembre: nadie podía pagar (ver
  [journal 2026-09-11](../journal/2026-09/2026-09-11-vio-sync-app-pricing-e-incidente-suscripciones.md)).
- **Shopify App Pricing** (elegida). Shopify aloja la página de planes y cobra; el app solo
  redirige a `…/charges/{app}/pricing_plans` cuando no hay plan y lee el handle al volver.
  Desde abril de 2026 no manda webhooks de suscripción.
- **Sin espejo en Stripe para cuentas Shopify** (gate del middleware por otra señal). Es lo
  más limpio y queda como deuda: hoy el middleware solo sabe mirar suscripciones.

## Consequences

- **Precio de Stripe en otra moneda**: el Free legacy es EUR y los planes nuevos USD; Stripe
  no permite mezclar monedas en un customer con suscripciones vivas. Cambiar de plan exige
  cancelar la anterior en Stripe
  ([lección](../lessons/suscripcion-vive-en-stripe-y-en-la-fila.md)).
- **Día ~31 de cada merchant**: el espejo sin método de pago pasa a canceled al terminar el
  trial. Mientras el self-heal del middleware no funcione, esa cuenta queda bloqueada.
  Pendiente: trial real de 90 en el espejo (`vio-users-microservice` PR #10), self-heal, o
  eliminar el espejo para cuentas Shopify.
- **Endpoint público**: `POST /users/create/subscription` en base-api no tiene
  `authentication`. Al protegerlo debe seguir aceptando una API key válida **sin**
  suscripción (si no, el alta de cuentas Shopify queda en círculo).
- **Pendiente de negocio**: qué pasa con la cuenta de Vio al desinstalar el app (¿vuelve a
  Free?), y con clientes que pagaban por Stripe antes de instalar.
