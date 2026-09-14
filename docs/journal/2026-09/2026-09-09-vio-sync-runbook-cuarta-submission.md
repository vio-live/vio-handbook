---
date: 2026-09-09
session: vio-sync-runbook-cuarta-submission (hasta el submit del 2026-09-10 00:01)
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-09-09 — runbook de 13 pasos y cuarta submission

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Que Alan ejecute todo lo pendiente y termine él mismo mandando el submit,
con cada paso verificado contra la realidad.

## Done

- **Runbook** en Trello (`aqLoZ6OQ`, 13 pasos con comando, URL y "listo
  cuando"). Alan ejecutó y yo verifiqué cada claim:
  - deploys del webhook `app_subscriptions/update` a prod y staging;
  - tiers en el catálogo del backend: Starter=5, Growth=6, Unlimited=7
    (`infinity: true`);
  - endpoint `POST /api/users/create/subscription` arreglado en users-ms
    (validaciones, idempotencia, null-fix);
  - envs `VIO_CODEPLAN_*` en ambos entornos de Vercel;
  - test account (4.5.4): password = API key y la misma key loguea el
    dashboard (Alan recreó el usuario de Firebase); 2 cuentas en el listing;
  - gates del dashboard validados en staging y promovidos a prod.
- Plan-sync del lado del app: [#95](https://github.com/vio-live/vio-shopify-sync/pull/95),
  con `userId` vía `me()` — [#96](https://github.com/vio-live/vio-shopify-sync/pull/96);
  signup con `?source=shopify` desde el app —
  [#94](https://github.com/vio-live/vio-shopify-sync/pull/94).
- **Bug del gate pre-conexión**: `/ecom-user` viene vacío hasta que la tienda
  conecta, así que una cuenta nueva por Shopify veía "Upgrade now". Fix: la
  credencial SHOPIFY pendiente también enciende el gate —
  `webapp-vio-commerce` [#15](https://github.com/vio-live/webapp-vio-commerce/pull/15).
- Hallazgo en el camino: una edición del listing de Alan quedó sin guardar
  (verificado contra el formulario real); la rehízo.
- **Cuarta submission enviada por Alan** el 2026-09-10 a las 00:01.
  Verificada el 2026-09-11 contra el Partner Dashboard: "Submitted —
  assigning a reviewer".

## Decisions

- Una tarjeta con runbook cerrado ("sin excusas") en vez de tareas sueltas.

## Blockers / open questions

- Nadie había recorrido todavía el flujo como merchant real (ver 09-11).

## Next session

- Review de código del trabajo de Alan →
  [2026-09-10](2026-09-10-vio-sync-review-backend-alan.md).
