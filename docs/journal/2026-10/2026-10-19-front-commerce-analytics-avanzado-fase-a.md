---
date: 2026-10-19
session: "Front de Commerce: analytics avanzado fase A (ADR-0035) — filtros en la URL, Recharts, home por surface/brand y detalle de campaña"
participants: [angelo, claude]
status: live
---

# Analytics avanzado fase A en el webapp (ADR-0035)

## Goal

Implementar el lado webapp de [ADR-0035](../../decisions/0035-analytics-avanzado-para-publisher-y-brand.md)
fase A contra el [contrato](../../handoff/2026-10-19-analytics-avanzado-contrato.md), en paralelo con el
puente de base-api (#42) y el colector: barra de filtros compartida en la URL, Recharts, home del
publisher/internal por surface y de la brand por sponsor, y detalle de campaña con embudo, serie,
artículos, componentes, productos, pago y pedidos. Mocks para que todo renderice en local sin env.

## Done

- **Rama `feat/analytics-avanzado-fase-a`** (worktree `~/vio-commerce/worktrees/webapp-analytics-avanzado`,
  3 commits sobre `61cb6f7`), **[PR #67](https://github.com/vio-live/webapp-vio-commerce/pull/67)** a
  `develop` (autorizado por el coordinador para esta rama). 41 archivos, +4267/−884.
- **`src/lib/filters.js`**: `?range|from|to|surface|campaign|channel` ↔ filtros (`parseFilters` /
  `filtersToSearch` / `withFilters`), presets 24h/7d/14d/30d/90d + rango a medida (≤ 365 días, se acota
  desde `to`; from > to se intercambian). `useAnalyticsFilters()` con `useSyncExternalStore` sobre
  `history.replaceState` (conserva el `history.state` de Next) + evento propio + `popstate`. Query hacia
  el backend: **`range=` o `from/to`, igual en todas las rutas, nunca `days`** (ajuste del puente #42 que
  llegó a mitad de la sesión; antes mandaba `days` por surface). `surfaceQuery` suma `campaign_id` +
  `sponsor_id`; `brandQuery`, `client_app_id` + `campaign_id`.
- **`src/lib/stats.js`**: `useSurfaceReads(ids, path, filters)` (fan-out en paralelo, 403 ignorado, fallo
  parcial en `failed`, clave `/stats/surfaces/<path>?ids=…`), `useCampaignRead`, `useCampaignTimeseries`,
  `useBrandRead`, `useBrandCampaignStats`; `useSurfaceCampaignStats` pasa a `by-campaign`. Normalizadores
  `fromOverview/fromKpis` (15 KPIs), `fromTimeseries`, `fromChannelRow`, `fromContentRow`, `fromProductRow`,
  `fromEntry`, `fromBreakdown`, `fromFunnel`, `fromOrder`, `fromBrandSurfaceRow`; `fromSlotStats` suma
  `kind`. **`isNotYetAvailable` / `statsErrorText`**: el 502 `{ upstream_status: 404 }` del puente (colector
  de la fase A sin desplegar) se muestra como "Analytics not available yet", nunca como vacío.
- **`src/lib/analytics.js`**: agregaciones puras — `overviewOf` (suma por surface, AOV/conversión derivadas
  sobre la suma, deltas vs `previous`), `timeseriesOf` (suma por bucket), `campaignRowsOf` /
  `channelRowsOf` / `surfaceRowsOf` / `contentRowsOf` / `productRowsOf` / `entryOf` (agrupan por clave
  cuando una entidad aparece en varias surfaces, `% of total`), `funnelWithRates`, `breakdownRows` (top
  N + "Other"), `toCsv` / `downloadCsv`.
- **`src/lib/product-images.js`**: `useProductThumb(id)` → `GET /products/:id` (clave de SWR compartida con
  el detalle de producto) + `thumbCache` por sesión; 403/404 = sin imagen.
- **`src/views/shared/`**: `charts.jsx` (Recharts 2.15.4: `TimeSeriesChart` con Brush, leyenda clicable
  y clic por día; `BreakdownBars`; `DonutChart`; `FunnelBars`; `QueryState`, `PartialNotice`,
  `ExportCsvButton`), `filters-bar.jsx`, `analytics-table.jsx` (roles de tabla), `product-thumb.jsx`,
  `breakdown-card.jsx` (8 dimensiones × 3 métricas).
- **Home** (`views/dashboard/`): `scope.js` (`useAnalyticsScope` + `useScopedRead`), `overview-cards.jsx`
  (KPIs con delta; Total transactions), `series.jsx` (reemplaza `chart.jsx`), `tables.jsx` (By surface /
  By campaign / By channel), `top-products.jsx` (miniaturas), `entry.jsx`; `campaigns.jsx` recibe `scope` y
  se alimenta de `by-campaign`. La brand conserva `RevenueSplit` y `CounterpartyPanel` (sin By channel).
- **Detalle de campaña**: `analytics.jsx` (Funnel, Over time, Articles, Products, Buyers & payment,
  Orders) + `components.jsx` (ex `performance.jsx`: tipo, interacciones, CSV, filtros de la URL);
  sección Analytics antes de los ajustes, cabecera con sponsor/channel y ancla `#campaign-settings`.
- **Tests**: 73 suites / 736 tests → 71 / 734 verdes (las 2 rojas son `payments-lib` y
  `qliro-shipping-config`, de antes). Nuevos: `test/lib/{filters,analytics,product-images}.test.js`,
  `test/dashboard/{filters-bar,by-campaign-card}.test.jsx`. Lint: 3 hallazgos preexistentes. `next build`
  verde (20 rutas; `/home` 240 kB first load).
- `docs/stats-service-contract.md` del repo apunta al contrato nuevo y resume rango, rutas y el 502.

## Decisions

- **Rango en la query**: `range=` para presets y `from/to` para a medida, en todas las rutas; nunca
  `days` (coordinador, por la revisión del puente #42).
- **Brand**: sin selector de channel (el comodín no tiene parámetro de channel de Commerce); KPIs de
  `by-campaign` sin delta (no hay `overview` para la brand); nombres de surface de sus campañas o
  "Surface #id" (no puede listar `/client-apps`).
- **Clic-para-filtrar** solo donde el contrato tiene parámetro: surface, campaña, channel (sponsor) y
  día. Pago / dispositivo / SO / navegador / idioma no filtran (porciones no clicables).
- **Formas sin escribir** (`funnel`, `breakdown`, `products` por campaña): normalizadores tolerantes en
  vez de inventar una forma; marcado en el PR para verificar contra staging.
- `Performance` se **funde** en `Components` (sin duplicar); el archivo y el test cambian de nombre.

## Blockers

- Nada verificado contra staging: el puente nuevo y el colector no están; en local todo va con mocks.
- Miniaturas para el publisher: si base-api responde 403 a `/products/:id` de un producto de la brand,
  queda el icono. Pendiente confirmar la lectura cruzada.
- Las suites que montan `CampaignDetail` tienen que mockear además `useCampaignRead` y
  `useCampaignTimeseries` (los mocks de pedidos usan `carousel-a1` y chocan con las fixtures de slots).

## Next

- Cuando el puente y el colector estén en QA: probar con la cuenta de Aller (`range=`, `from/to`, 403 de
  surface ajena, el 502 `upstream_status: 404` desapareciendo lectura a lectura) y ajustar
  `fromFunnel` / `fromBreakdown` / `fromProductRow` a la forma real.
- Fase B (atribución en la orden): pedidos del detalle desde Commerce y filtros de Orders por surface y
  campaña.
- Si el colector suma parámetros de pago/dispositivo, activar el clic-para-filtrar en los desgloses.
