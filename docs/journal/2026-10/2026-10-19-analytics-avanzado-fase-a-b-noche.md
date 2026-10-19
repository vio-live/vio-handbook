---
date: 2026-10-19
session: "ADR-0035 fases A y B de punta a punta: colector, puente, webapp, atribución de la orden (kernel, orders, shopcart, gateway, SDK, Vev)"
participants: [angelo, claude, miguel]
status: live
---

# Analytics avanzado (ADR-0035) — la noche del 19/10: todo a staging

## Goal

Dejar corriendo en staging/QA las fases A (lecturas por surface, campaña y brand con rangos) y B (la orden nace
atribuida a surface, campaña, página y entrada; `buyer_ref` para cruzar con analytics) de
[ADR-0035](../../decisions/0035-analytics-avanzado-para-publisher-y-brand.md), con el bundle de Vev hecho, mientras
Angelo no estaba («ve con todo el plan»). Contrato: [handoff](../../handoff/2026-10-19-analytics-avanzado-contrato.md);
estado por repo: [tabla](../../handoff/2026-10-19-analytics-por-campana-y-slot.md); canal con Miguel:
[coordinación](../../handoff/2026-10-19-coordinacion-claude-miguel.md).

## Done

Un agente implementador por repo y un revisor independiente antes de cada merge (dos rondas donde hizo falta). Cada
PR tiene el detalle en su propio journal (`2026-10-19-*-atribucion-en-la-orden.md`, `-base-api-stats-*`,
`-front-commerce-analytics-avanzado-fase-a.md`).

| Repo | PR | Qué | Estado |
|---|---|---|---|
| vio-analytics | [#23](https://github.com/vio-live/vio-analytics/pull/23), [#24](https://github.com/vio-live/vio-analytics/pull/24) | lecturas surface/campaña/brand, `days`/`from/to`, token interno en lo nuevo, `campaign_ids`, límites y 503 | `main` `d7d64a3`; Miguel despliega en la VM |
| vio-base-api | [#42](https://github.com/vio-live/vio-base-api/pull/42)…[#46](https://github.com/vio-live/vio-base-api/pull/46) | proxy genérico por surface, topes, 502 uniforme, filtros de pedidos, `campaign_ids` de la brand | QA |
| webapp | [#67](https://github.com/vio-live/webapp-vio-commerce/pull/67) | filtros en URL, Recharts, home por surface/brand, detalle de campaña, pedidos con atribución | Vercel staging |
| package-database | [#24](https://github.com/vio-live/package-database/pull/24) | `cart_item.origins`, `checkout.attribution`, utf8mb4 en los textos | kernel **1.0.279**; migración aplicada en QA |
| orders | [#27](https://github.com/vio-live/vio-orders-microservice/pull/27) | copia la atribución, filtros del listado, `buyerRef` al cobrar, red ante latin1, solo shopcart atribuye | QA |
| shopcart | [#94](https://github.com/vio-live/vio-shopcart-microservice/pull/94) | atribución en los 8 finalizadores, aislamiento por publisher, `buyer_ref` solo pagadas | QA |
| graphql | [#30](https://github.com/vio-live/graphql/pull/30) | `origin`/`attribution` en las mutaciones, trunca sin rechazar, `surface_key` desde `X-API-Key` | QA |
| vio-web-sdk | [#86](https://github.com/vio-live/vio-web-sdk/pull/86) | `origin` por línea, `attribution` antes de pagar, privacidad precargada | `main`, **sin publicar** |
| vev | [#71](https://github.com/vio-live/vev/pull/71) | rebundle | paquete desplegado 19:56 UTC |

Cerrados también: vio-analytics #15 (superado) y base-api #43/#44/#45.

## Decisions

- Lecturas nuevas del colector solo con token interno; la pertenencia brand↔campaña sale de Commerce (`campaign_ids`
  que pone el puente), nunca del `sponsor_id` del evento. La atribución nunca bloquea ni retrasa una venta (truncar,
  descartar, precargar). `buyer_ref` solo en órdenes pagadas (y en la transición a pagada de Stripe/wallets).
  `minimal` no manda contenido ni slot a Commerce. Todo en el byline del contrato §0.
- Angelo: OK a la migración `1792400000000` (JSON + utf8mb4) y a que la hiciera yo de punta a punta.

## Blockers / lecciones

- **Freno de migraciones del kernel:** cancelar el run de push llegó tarde (publicó `database@1.0.278` y su tag con la
  migración), y el `pkg=all` (1.0.279) no vio migración nueva y disparó los bumps solo. Sin daño porque la migración
  ya estaba en QA. Regla en el [playbook](../../playbooks/vio-commerce-cambio-con-migracion.md).
- Dos merges seguidos al mismo micro → carrera de helm (Miguel). Dejar ~2 min.
- Un test del colector tenía una bomba de tiempo (fecha fija + 72 h) que estalló hoy a las 18:00 UTC.
- Las tablas `order`, `order_item`, `cart_item`, `checkout` están en latin1 (también `customer_phone`, etc.): solo se
  pasaron a utf8mb4 las columnas de atribución.

## Next session

- Angelo: republicar las páginas de Vev; decidir el publish de la SDK (0.26.0) y el rollout a prod (migración
  `1792400000000` con `m-cart-attribution-prod.js` antes de los micros).
- Probar en staging el flujo completo: compra desde la página de Vev → `order.surface_id/campaign_id/buyer_ref` → cruce
  en el dashboard (pedidos por campaña, `buyer_id` en analytics).
- Seguimientos: `privacyMode` en `/v2/mobile/config` (ahorrar un GET por página); `BAD_USER_INPUT` del gateway sale
  como 500; cronjob `shopcart-reconcile` con pods en `Error` en QA (preexistente); shopcart #73 en conflicto.
