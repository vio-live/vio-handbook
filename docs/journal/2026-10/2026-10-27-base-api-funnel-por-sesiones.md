---
date: 2026-10-27
session: quick-fix
participants: [angelo, claude]
status: live
---

# base-api — puente de stats para el funnel por sesiones (ADR-0041)

## Goal

Implementar en base-api la parte del puente de stats del
[ADR-0041](../../decisions/0041-funnel-por-sesiones-dias-de-oslo-y-trafico-interno.md) («Contrato»): las rutas
nuevas en las listas cerradas y dejar pasar `tz` y `by`.

## Done

- PR [vio-base-api#54](https://github.com/vio-live/vio-base-api/pull/54) (`feat/funnel-por-sesiones` → `develop`,
  commit `b122a54`). Sin mergear ni desplegar.
- `session-funnel` y `session-funnel/products` en las tres listas: `SURFACE_STATS_PATHS`, `CAMPAIGN_STATS_PATHS` y
  `COMMERCE_STATS_PATHS` (`src/service/statsService.ts`). La cadena de auth es la misma que la de sus hermanas.
- `parseSurfaceStatsPath`: la vista de campaña pasa a ser todo lo que sigue al id (`segments.slice(2).join('/')`) y
  tiene que estar entera en la lista. Antes exigía exactamente 3 segmentos y `session-funnel/products` no entraba.
- `tz` en `BRAND_QUERY` y `SURFACE_QUERY`, con allowlist `Europe/Oslo|UTC`. Con otro valor, repetido o en array
  devuelve 400.
- `by` en el funnel por sesiones solo admite `device|source|content` (`SESSION_FUNNEL_RULES`, que `pickQuery` recibe
  como tercer parámetro).
- Tests: 75 casos nuevos en `test/unit/surfaceStats.unit.ts` y `test/unit/statsProxy.unit.ts`, más los casos de
  parse en `test/service/statsService.test.js`. `yarn test:unit`: 647/647 en verde.

## Decisions

- **`by` NO tiene allowlist global.** El pedido era `device|source|content` para todas las lecturas, pero el webapp ya
  manda `breakdown?by=payment_method|device_type|os|browser|language|referrer|landing|component_kind`
  (`webapp-vio-commerce/src/lib/stats.js:638`), y los tests existentes también usan `by=referrer|landing`. Con una
  allowlist global esas llamadas darían 400. Se restringe solo en `session-funnel*`; en el resto `by` sigue siendo un
  token plano.
- `bucket` no se ha tocado: ya validaba `day|hour` y viajaba en las dos vistas.

## Blockers / open questions

- Mientras el colector no sirva `session-funnel*`, base-api devuelve 502 `{ upstream_status: 404 }` en esas rutas.

## Next session

- Revisión y merge de #54 (OK de Angelo). Luego, el webapp.
