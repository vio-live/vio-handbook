---
date: 2026-10-19
session: "Front de Commerce: analytics avanzado fase A (ADR-0035) — filtros en la URL, Recharts, home por surface/brand, detalle de campaña; revisión cruzada y pedidos de fase B"
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

### Revisión cruzada de #67 (misma rama, commit `32ebc43`) — merge con cambios, aplicados

- **B1 conversión**: `aov = gmv / purchases`, `conversion = purchases / impression_sessions` (sesiones
  CON impresión), como `withRatios` del colector. `shapeKpis` de #23 hoy DESCARTA `impression_sessions`
  (lo publicará): con una sola fuente vale la `conversion` del colector; al sumar surfaces sin la base
  queda `null` → "—". Fixtures con las formas reales en `test/fixtures/collector.js`.
- **B3 CSV**: `toCsv` y `ordersToCsv` anteponen `'` a las celdas que empiezan por `= + - @ TAB CR`.
- W2 "24h" = día natural de hoy en UTC → "Today" / "today (UTC)" (`rangeIn`/`rangeFor` para frases);
  W3 tiles "—" con todas las lecturas caídas; W4 un punto se pinta; W5 ids 1..4294967295; **W6 la query
  se escribe con `Router.replace(..., { shallow: true, scroll: false })`** (Back conserva los filtros;
  sin router montado cae a `replaceState`); W7 enlace solo con id numérico; W8 rótulos de alcance de la
  brand y nota de sobreconteo; W9 `limit` en products (8 / 20) y la miniatura solo cachea `null` con
  403/404. Nits: breakdown sin `units` y `"(unknown)"`, `product_id` string, aviso del 502 sin duplicar,
  picker de surfaces con todas las propias, fuera `useStatsCampaigns`/`useStatsTopProducts`/
  `fromBrandCampaignStats`, "vs 4 Oct 2026 – 10 Oct 2026" para el delta de un rango a medida, horas UTC.

### Fase B — la lista de pedidos real (misma rama, segundo encargo del coordinador)

- `src/lib/orders.js`: `buildOrdersKey` manda `surface_id`, `campaign_id`, `campaign_status=active|past`
  cuando están (ids 1..2^31−1, estados conocidos; lo demás no viaja: el micro responde 400);
  `attributionFilters`, `entryLabel` (`direct` → Direct), `campaignNameOf`, `orderArticleHref` (solo
  http(s)); `ordersToCsv` suma surface/campaña/artículo/origen y **nunca `buyerRef`**.
- `src/lib/filters.js`: `?campaign_status=active|past` y `rangeBounds` (el rango de la barra como
  dateFrom/dateTo UTC).
- `/orders`: `OrdersScopeFilters` (surface para el publisher, campaña filtrada por surface, Any|Active|Past
  con la ayuda "A paused or scheduled campaign is neither active nor past"), chips verdes de atribución,
  columnas Campaign / Article (enlazado solo con http(s)) / Came from. Reutiliza `useAnalyticsScope`.
- Detalle de campaña › **Orders** = `views/campaign-detail/orders.jsx` con `GET /users/me/orders?
  campaign_id=<id>&dateFrom&dateTo` y filtro adicional en cliente por `campaignId` (mientras el puente no
  reenvíe los params llega la ventana entera). Enlace a `/orders/:id` si la cuenta ve Orders. **Se retiró
  la lectura `orders` de analytics** (hook, normalizador, mock) que dependía del token interno.
- Tests nuevos: `test/orders/orders-attribution.test.js`, `test/orders/orders-scope-filters.test.jsx`,
  `test/campaigns/campaign-orders-card.test.jsx`; las suites que montan `CampaignDetail` mockean además
  `useOrdersWindow`.

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
- **Pedidos del detalle de campaña desde Commerce, no desde analytics** (fase B): la atribución vive en
  la orden; la pestaña filtra además en cliente por `campaignId` hasta que el puente reenvíe los params.
- `impression_sessions` ausente ⇒ conversión "—" al sumar surfaces: no se inventa `purchases / sessions`.

## Blockers

- **Condición de despliegue** (la anota el coordinador): colector #23 antes que webapp #67; orders #27 y el
  reenvío del puente antes de que los filtros de atribución de `/orders` tengan efecto (hasta entonces
  la lista llega sin filtrar; la pestaña del detalle sí filtra en cliente).

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
