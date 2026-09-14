---
date: 2026-09-10
session: vio-sync-review-backend-alan
participants: [angelo, claude]
status: live
---

# Session — 2026-09-10 — review del backend de Alan y el modal de tope de plan

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Revisar el código del trabajo de Alan (no solo la tarjeta) y cerrar otra
superficie del dashboard que mostraba Stripe.

## Done

- **Code review** de users-ms (commits `7540c9c`, `e6d71b2`): lo bueno —
  validaciones, logs, idempotencia de mismo plan, el null-fix que cazó
  probando. Hallazgos:
  - `POST /users/create/subscription` está **público** en base-api
    (`userRouter.js`, sin `authentication`): cualquiera setea el plan de
    cualquier `userId`;
  - el trial del espejo en Stripe es de **30 días, no 90**: una línea legacy
    fija `trial_period_days = 30` y pisa el 90 del price. Los timestamps de
    la propia prueba de Alan (2.592.000 s) lo confirman;
  - cambiar de plan hace delete + create, con trial nuevo cada vez.
  Todo quedó en el checklist post-submit de la tarjeta.
- **PlanLimitModal** (el modal que aparece al chocar el tope de SKUs) ya no
  lista planes ni el botón de Stripe para cuentas Shopify —
  `webapp-vio-commerce` [#16](https://github.com/vio-live/webapp-vio-commerce/pull/16).
  El test con la cuenta demo quedó pedido a Alan y sigue sin hacerse.

## Decisions

- Verificar los claims de Alan contra código y datos, no contra Trello
  ([lección](../../lessons/verify-alan-claims-against-code.md)).

## Blockers / open questions

- Endpoint público (seguridad) y trial de 30 días — post-submit.

## Next session

- Angelo recorre el flujo como merchant →
  [2026-09-11](2026-09-11-vio-sync-app-pricing-e-incidente-suscripciones.md).
