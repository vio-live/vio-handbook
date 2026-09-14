---
date: 2026-09-11
session: vio-sync-app-pricing-e-incidente-suscripciones
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-09-11 — el selector de planes no existía, migración a App Pricing, y la cuenta varada

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Angelo quiso recorrer él mismo el flujo como merchant (instalar, elegir plan,
crear cuenta, conectar) para entenderlo. Ese recorrido destapó dos problemas
grandes que ningún test ni la submission habían detectado.

## Done

**Mañana — no había cómo cobrar**

- En el recorrido (10:03) **no apareció ningún selector de planes**. Causa: los
  planes estaban en "Manual pricing", que en Shopify es solo texto del listing:
  no hay página de elección ni cobro automático. Nadie podía pagar. Además mi
  instrucción usaba una URL de instalación directa que se salta el listing.
- **Migración a Shopify App Pricing** en el Partner Dashboard (el asistente
  importó los 3 planes; Shopify creó solo un plan privado "shopify-test" a $0
  para los reviewers) y el código del app:
  [#97](https://github.com/vio-live/vio-shopify-sync/pull/97). Según la doc
  oficial, **es el app el que redirige** a la página alojada
  (`admin.shopify.com/store/{tienda}/charges/{app}/pricing_plans`) cuando no hay
  plan, y desde abril de 2026 App Pricing **no manda webhooks**: el plan vuelve
  como `?plan_handle=` y se guarda en un metafield.
- La pregunta de Angelo "¿y la cuenta de Vio se entera del plan?" destapó otro
  hueco: en el orden real (plan primero, cuenta después) nadie le mandaba el plan
  guardado a Vio al conectar —
  [#98](https://github.com/vio-live/vio-shopify-sync/pull/98).

**Mediodía — incidente: la cuenta de Angelo quedó bloqueada (user 1309)**

- Al conectar, el plan-sync llamó al backend, que devolvió 400, y la cuenta
  quedó **sin ninguna suscripción**: 401 "Not authorized User without
  subscription" en todo el API, dashboard incluido.
- Cadena confirmada con el mensaje textual de Stripe: toda cuenta nace con la
  suscripción Free en **EUR** viva en Stripe; los prices nuevos están en
  **USD**; el cambio de plan borraba la fila **sin cancelar en Stripe**; Stripe
  rechaza mezclar monedas ("You cannot combine currencies on a single
  customer"); y como el borrado iba primero, la cuenta quedaba en cero.
- El "self-heal" de middleware-ms (crear Free ante un 401) **no funciona**:
  ~1 hora bloqueado, contra 1 minuto con la misma llamada hecha a mano a
  base-api. Rescate manual con `codePlan: "1"`.
- Del lado del app: reintento del plan-sync en cada carga hasta lograrlo
  (metafield `plan_synced`), logs con el body real de los errores y el banner
  de feeds en dos tonos — [#99](https://github.com/vio-live/vio-shopify-sync/pull/99);
  webhook de suscripciones siempre 200 (vimos un 500 en prod) —
  [#100](https://github.com/vio-live/vio-shopify-sync/pull/100).
- Tarjeta URGENTE para Alan con toda la evidencia: Trello `WJ7SPrQJ`.

**Tarde y noche — el trabajo de Alan**

- users-ms `86bec0a`: `deleteSubscription` ahora **cancela en Stripe** antes de
  borrar la fila. Es lo que destranca el choque de moneda.
- vio-sync, 7 commits **directo a master** sin PR: su arreglo de la
  reinstalación intermitente es correcto de raíz (`getVioPlanState` usa las
  `activeSubscriptions` de Shopify como fuente de verdad, limpia metafields
  residuales, limpieza al desinstalar), pero dejó el gate roto (typecheck,
  coverage y lint). Lo restauré sin tocar el comportamiento —
  [#101](https://github.com/vio-live/vio-shopify-sync/pull/101).
- Su "mejora sugerida" (volver a Free vía el endpoint público al desinstalar) no
  se aplicó: institucionaliza el endpoint sin auth y es decisión de negocio.

## Decisions

- Cobro con Shopify App Pricing, no Manual pricing ni Billing API
  ([ADR-0017](../../decisions/0017-cobro-canal-shopify-via-app-pricing.md)).
- Ningún flujo de billing u onboarding se da por listo sin recorrerlo como el
  merchant real ([lección](../../lessons/recorrer-el-flujo-real-antes-de-dar-por-listo.md)).

## Blockers / open questions

- En users-ms: same-plan check roto (resetea el trial), borrar-antes-de-crear,
  trial 30 en vez de 90, self-heal muerto, endpoint público, suscripciones
  huérfanas en Stripe → [lección](../../lessons/suscripcion-vive-en-stripe-y-en-la-fila.md).

## Next session

- Revisión final antes de la review →
  [2026-09-14](2026-09-14-vio-sync-revision-final-submission.md).
