---
date: 2026-10-19
session: evening
participants: [angelo, claude]
status: live
service: base-api
---

# Session — 2026-10-19 — base-api: ruta genérica de stats por surface y lecturas nuevas de la brand (ADR-0035 fase A)

## Goal
Implementar el lado base-api del [contrato de analytics avanzado](../../handoff/2026-10-19-analytics-avanzado-contrato.md)
§0 y §2 ([ADR-0035](../../decisions/0035-analytics-avanzado-para-publisher-y-brand.md), fase A):
sustituir las dos rutas por lectura del publisher (#41) por **una ruta genérica con allowlist**, cerrar la
query de las dos vistas a una lista blanca validada, y ampliar el comodín de la brand con las lecturas nuevas.

## Done
Rama `feat/stats-por-surface-generico` desde `origin/develop` `abe6dc4` (= #41 mergeado), worktree
`~/vio-commerce/worktrees/base-api-stats-fase-a`, **1 commit `b0c765e`, pusheado, PR
[vio-base-api#42](https://github.com/vio-live/vio-base-api/pull/42) a `develop`** (autorizado para esta rama).
7 archivos, +1066/−290.

- **`GET /api/stats/surfaces/:surfaceId/*`** (`src/router/statsRouter.js`): una sola ruta antes del comodín.
  El path se parsea con `statsService.parseSurfaceStatsPath` contra listas cerradas de segmentos exactos:
  `SURFACE_STATS_PATHS` = `overview|timeseries|by-campaign|by-channel|content|products|entry` →
  `/v1/stats/surface/<path>`; alias `campaigns` → `/v1/stats/campaigns/summary` (sigue igual);
  `campaigns/<id>/<CAMPAIGN_STATS_PATHS>` (`summary|slots|products|breakdown|timeseries|content|entry|orders|funnel`)
  → `/v1/stats/campaigns/<id>/<path>`. Siempre con `X-Internal-Token` y `client_app_id=<surfaceId>`.
- Cadena: sesión → `statsController.surfacePath` (400 `unknown stats path` **antes de tocar la base**) →
  `requireOwnSurface()` (400/404/403, sin admin) → `requireCampaignOfSurfaceRead()` (nuevo en
  `surfaceOwnership.ts`: lee el id del path parseado, salta en lecturas de toda la surface; comparte cuerpo con
  `requireCampaignOfSurface(param)`) → `statsController.surfaceStats` → `statsService.forwardSurface`.
- **Query cerrada** (`QUERY_RULES`, `pickQuery` en `statsService.ts`), común a las dos vistas:
  - Publisher `SURFACE_QUERY` = `days, from, to, metrics, bucket, by, campaign_id, sponsor_id, limit` (+ `range` →
    `days`; 14 días si no hay rango; `range`+`days` → 400). `client_app_id` y tokens del cliente se descartan.
  - Brand `BRAND_QUERY` = `range, lens, days, from, to, metrics, bucket, by, client_app_id, campaign_id, limit`.
    `sponsor_id`/`channel_id`/`commerce_key_hash` se descartan.
  - Validación: `days` 1–365, `from`/`to` `YYYY-MM-DD` reales, juntos y `from ≤ to`, `bucket` `day|hour`,
    `limit` 1–500, ids enteros positivos, `metrics`/`by`/`lens` tokens planos. Repetida o inválida → 400 sin
    llamar al colector; vacía = ausente.
- `COMMERCE_STATS_PATHS` + `by-surface, by-campaign, products, content, entry, breakdown` (11 paths).
- Tests reescritos sobre el router real (mocks solo de auth, `typeorm.getRepository` y `executeCall`):
  `test/unit/statsProxy.unit.ts` + `test/unit/surfaceStats.unit.ts` = **217 casos** (cada path → URL exacta,
  traversal/desconocidos → 400 sin lookup ni llamada, ownership 403/404, whitelist y validación de la query,
  las dos rutas viejas); `test/service/statsService.test.js` con `parseSurfaceStatsPath` y `forwardSurface`.

### Verificación (Node 22, `node_modules` enlazado al clon principal, sin `yarn install`)
- `yarn test:unit`: **19 suites / 469 tests verdes** (baseline develop 19 / 330).
- Suite por defecto: `statsService.test.js` + `surfaceOwnership.test.js` **12/12** (baseline 8/8). Las otras 24
  suites fallan **igual en develop** (comprobado corriendo `yarn test` en el worktree de #41: 24 fallidas / 2
  pasadas en ambos; jest 26 + `node:os` en `@azure/logger`, preexistente).
- `eslint` + `prettier --check` sobre los 7 archivos: limpios. `tsc -p tsconfig.build.json --noEmit`: 0 errores
  en `src/` (solo los 2 de `@azure/core-auth` en `node_modules`, de siempre).

## Decisions
- **`client_app_id` es filtro en la brand e identidad en el publisher** (y `sponsor_id` al revés). En
  `/v1/commerce-stats/*` el colector acota primero por `sponsor_id`, que pone el servidor, así que dejar pasar
  `client_app_id` no abre nada; en `/v1/stats/*` `client_app_id` ES la tenencia y solo lo pone el puente tras
  `requireOwnSurface`. Documentado en la cabecera de `statsService.ts`.
- **Cambios de comportamiento en la brand, a propósito**: `client_app_id` y `days` viajan (antes se
  descartaban); una clave permitida repetida es 400 (antes `range=a&range=b` viajaba como `a,b`); un `range`
  fuera de `24h|7d|14d|30d` es 400 (antes el colector lo degradaba en silencio a 14d). Los casos afectados
  de `statsProxy.unit.ts` se actualizaron en ese sentido; el resto sigue igual.
- El alias `campaigns` sigue apuntando a `/v1/stats/campaigns/summary` (no a `/v1/stats/surface/by-campaign`):
  misma forma según el contrato, y es lo que el colector desplegado tiene hoy. El webapp debería pasarse a
  `by-campaign` cuando el colector lo tenga.
- `range` se sigue aceptando en el publisher (traducido a `days`) para no romper el webapp de #41; el
  contrato nuevo es `days` / `from`+`to`.
- Sin narrowing por truthiness en `statsService.ts` (`picked.ok === false`): el `tsconfig` no tiene
  `strictNullChecks`, y `if (!picked.ok)` no estrecha la unión discriminada.
- La validación de la query va en el service (400 después de los checks de ownership, como el `range` de #41)
  y el path en un middleware del controller (400 antes de la base).

## Blockers / open questions
- El colector aún no tiene `/v1/stats/surface/*` ni las lecturas nuevas de campaña/brand (fase A de
  vio-analytics, otro agente): hasta que entre en `main` y Miguel lo despliegue, esas rutas devuelven 502
  `{ upstream_status: 404 }`. Las que ya existían funcionan.
- No se tocó el webapp: `src/lib/stats.js` sigue con `range=` y los cinco paths de la brand; todo compatible.

## Next session
- Merge de #42 cuando Angelo/el coordinador lo revisen; probar en QA con la surface 3 y la campaña 9 cuando el
  colector de fase A esté desplegado.
- Webapp: barra de filtros con `from/to` y las lecturas nuevas (handoff §4).
