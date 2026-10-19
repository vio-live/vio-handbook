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

## Seguimientos de la revisión de seguridad — PR [vio-base-api#43](https://github.com/vio-live/vio-base-api/pull/43)
#42 lo mergeó Angelo (`c5f52c8`). La revisión de seguridad lo aprobó con seguimientos; van en la rama
`fix/stats-proxy-topes` desde `origin/develop` (worktree `~/vio-commerce/worktrees/base-api-stats-topes`), 1 commit
`cd6a21f`, pusheado, **PR #43 a `develop`**. 5 archivos, +310/−88.
- **W1** `from`/`to`: máximo 365 días inclusivos (`to − from ≤ 364`) → si no, 400 `from/to must span at most 365 days`
  (antes `0001-01-01..9999-12-31` viajaba y el colector respondía 502).
- **W4** en `campaigns/:id/*`, un `campaign_id` en la query distinto del id del path → 400
  `campaign_id must match the campaign in the path`; el igual sobra y no viaja (la propiedad solo se verifica para el
  id del path). En lecturas de toda la surface `campaign_id` sigue siendo filtro.
- **N1** ids ≤ 4294967295 (UInt32 del colector): `client_app_id`/`campaign_id`/`sponsor_id` en la query y
  `surfaceId`/`campaignId` en la ruta (`surfaceOwnership.positiveInt`).
- **N2** `range`+`days` → 400 también en la brand; y `range`+`from/to` → 400 en las dos (`range` es alias de `days`).
  `days`+`from/to` sí viajan juntos (el colector da precedencia a `from/to`, handoff §0).
- **Preset `90d`**: `range=24h|7d|14d|30d|90d` en las dos rutas, siempre traducido a `days`. Publisher: `range` no
  viaja. Brand: viajan `range` **y** `days`, porque el colector legacy de `/v1/commerce-stats/*` (lo que hay en `main`)
  solo lee `range` y desconoce `90d` (cae a 14 días en silencio) hasta que se despliegue el de la fase A, que lee `days`.
- **N4** `metrics`: máximo 20 nombres y 256 caracteres. **N3/N5** `requireCampaignOfSurface` (sin callers desde #42)
  borrado; su cuerpo vive en `requireCampaignOfSurfaceRead`. Tests nuevos para todo lo anterior.
- Verificación: `yarn test:unit` **19 suites / 502 tests** (develop tras #42: 469); las dos suites de stats 250 casos
  (eran 217); suite por defecto `statsService.test.js` + `surfaceOwnership.test.js` **13/13** (24 suites ajenas fallan
  igual que en develop); eslint, prettier y `tsc` (src) limpios.

## Bloqueante de la revisión cruzada con el webapp — PR [vio-base-api#44](https://github.com/vio-live/vio-base-api/pull/44)
#43 mergeado (`d7a98e0`). La ruta de brand (`forward`) devolvía el status y el body crudos del colector: un 404 llegaba
al navegador como `404 { message: "Route GET:/v1/commerce-stats/by-campaign?sponsor_id=42&days=14 not found" }`
(URL interna + identidad) y un 500 con el mensaje de ClickHouse. Rama `fix/stats-brand-502` desde `origin/develop`
(worktree `~/vio-commerce/worktrees/base-api-stats-brand-502`), 1 commit `f7fa07c`, pusheado, **PR #44 a `develop`**.
3 archivos, +96/−30.
- `forward` y `forwardSurface` comparten ahora `relay(reply, upstream)` en `statsService.ts`: 2xx pasa sin tocar
  (200 con body, 204 con status); cualquier otro status → 502 `{ error: 'analytics collector error', upstream_status }`
  **sin el cuerpo del colector** (status y path interno al log del servidor); 503 sin config y 502 caído como antes.
- Tests (`statsProxy.unit.ts`): 404 → 502 `upstream_status: 404` sin `sponsor_id` ni `/v1/commerce-stats` en el body;
  500 → 502 sin `ClickHouse` ni el token; 400/401/403/429/503 → 502; 200 y 204 intactos. `statsService.test.js`:
  `forward` con 404 → 502. Sustituye el caso de #42 que fijaba el passthrough del 404 de la brand.
- Verificación: `yarn test:unit` **19 / 509** (develop tras #43: 502); las dos suites de stats 257; suite por defecto
  `statsService.test.js` + `surfaceOwnership.test.js` **14/14**; eslint, prettier y `tsc` (src) limpios.

## Blockers / open questions
- El colector aún no tiene `/v1/stats/surface/*` ni las lecturas nuevas de campaña/brand (fase A de
  vio-analytics, otro agente): hasta que entre en `main` y Miguel lo despliegue, esas rutas devuelven 502
  `{ upstream_status: 404 }`. Las que ya existían funcionan.
- No se tocó el webapp: `src/lib/stats.js` sigue con `range=` y los cinco paths de la brand; todo compatible.

## Next session
- Merge de #42 cuando Angelo/el coordinador lo revisen; probar en QA con la surface 3 y la campaña 9 cuando el
  colector de fase A esté desplegado.
- Webapp: barra de filtros con `from/to` y las lecturas nuevas (handoff §4).
