---
date: 2026-11-06
session: night
participants: [angelo, claude]
status: live
---

# Session — 2026-11-06 — front-commerce: auditoría de analytics (rangos, unidades, lo que ve la brand)

> Escrito por el agente **front-commerce** (claude). Encargo de Angelo del 2026-11-05 por la noche: «el dashboard
> está raro: todo lo comparamos con el día anterior y lo que importa es el rango que se escoja contra el rango
> anterior; la data tiene que ser sólida; hay muchos lugares que no tienen sentido».

## Goal

Auditar las vistas de analítica de `webapp-vio-commerce` (home de las tres cuentas —`brand`, `publisher`,
`internal`—, detalle de campaña, piezas compartidas) contra el contrato real del colector `vio-analytics`
(`6b14e5c`, PR #43 mergeado: `stats-range.ts`, `stats-reads.ts`, `stats-definitions.ts`, `stats-funnel.ts`,
`stats-paid-orders.ts`, `commerce-stats.ts`, `docs/EVENTS_CONTRACT.md`) y arreglar lo que sea de la webapp.
Lo que vio Angelo en prod (`dashboard.ecom.vio.live/home`, cuenta brand Careless, 14 días): tres cifras de
pedidos distintas (2 · 1 paid · Ordered 1), placeholders («split model pending», «Settlement model pending»),
una campaña de prueba listada como activa con guiones, «Top products» ordenado por net revenue con todo a kr 0,
y unidades mezcladas en el embudo.

Worktree `~/vio-commerce/worktrees/webapp-analytics-rangos` desde `origin/develop` `1e09846`, rama
`fix/analytics-rangos-y-consistencia`, **PR [#103](https://github.com/vio-live/webapp-vio-commerce/pull/103) a
develop, sin mergear** (lo decide Angelo). `AUDITORIA.md` en la raíz del worktree (no se commitea).

## Done

### La auditoría (resumen; el detalle con archivo:línea está en `AUDITORIA.md` del worktree)

1. **Comparación — verificada sitio por sitio.** Toda variación de la webapp sale del `previous` del colector,
   que `stats-range.ts → previousRange()` calcula como **el mismo número de días justo antes de `from`**, en la
   zona del rango (`overviewQueries`, `tillQueries`, `sessionFunnelQueries`, `runProductFunnel`,
   `commerce-stats/overview`, `commerce-stats/top-products`). El rótulo es `previousRangeLabel` («vs previous
   14 days»; fechas para a medida y «Yesterday»). **No hay ningún sitio, ni en la webapp ni en el colector, que
   compare un rango de varios días con «el día anterior».** Lo que sí estaba mal: (a) **la brand no tenía
   comparación en ninguna KPI** (sus tiles sumaban `by-campaign`, que no trae `previous`); (b) con «Today» se
   comparaba el día a medias con ayer entero rotulado «vs yesterday».
2. **Tres cifras de pedidos (brand).** «ORDERS 2 · NET REVENUE» = `brandKpis(by-campaign)` → totales de las
   campañas donde es sponsor (`brandTotalsScope`, todos los sponsors). «CHARGED · yours · 1 paid» =
   `/v1/commerce-stats/overview` (sus `order_paid`). «Ordered 1» = sesiones con pedido de sus filas
   (`brandFunnelScope`). Correctas las tres; incompatibles en una misma fila.
3. **Placeholders.** `revenueSplit` llega del colector con channel cuts y fee a 0 y las notas «split model
   pending» / «Settlement model pending» (no hay modelo de liquidación desde 2026-08-26). «Counterparties»:
   filas por `host` de la SDK («vev», «replit»), spend 0, ROAS null, status «live» fijo, lentes
   publisher/supplier siempre `[]`, bandas «Review payouts»/«Resync» solo en el mock.
4. **«Careless Aller (test)» activa con guiones.** Es la campaña 1, **default de la surface de Mote &
   Livsstil** (journal 2026-10-28); Careless es su sponsor y está en ventana 23 Oct – 30 Nov. **No hay marca de
   campaña de prueba** ni en el micro (`fromCampaign`: `isDefault`, `paused`, fechas) ni en la SDK (ADR-0041 §5
   marca el tráfico, no campañas). Los guiones sí eran de la webapp: con la lectura resuelta y sin fila, la
   verdad es 0.
5. **Top products** ordenaba revenue → units → impressions bajo «Ranked by net revenue»: sin ventas el orden
   real era por impresiones (los clics ni se miraban).
6. **Unidades.** «Alongside the funnel» mezclaba visitas con pedidos (`orders_unlinked` son PEDIDOS, cabecera de
   `stats-funnel.ts`); «Vipps payments · 7 / Paid 1» son visitas (una por visita, la mejor de sus checkouts);
   las barras decían «Count»; el funnel por producto no distinguía columnas de visitas y de pedidos.
7. Fuera de la webapp: GMV de Faves 1.817 vs 2.946 (vio-analytics #43 pendiente de deploy); `by-campaign` /
   `by-surface` de la brand sin `previous`; el overview propio de la brand sin `units` ni `buyers`.

### Los arreglos (5 commits en la PR)

- `7f8e61d` **La brand ve SUS cifras, con delta.** `fromBrandOverview(body)` y `ratioDelta` en
  `src/lib/stats.js` normalizan `/stats/overview` → `{ kpis, deltas, known }` (impressions = `views`, clicks,
  purchases, purchasesNet, cancelledOrders, gmv, gmvGross, refundedValue, la caja, aov, clickRate; deltas por
  KPI del colector, click rate derivado). `KpiGrid` y `TransactionsCard` de la brand leen esa lectura (la misma
  que ya traía «Charged»), con `hint` «vs previous N days» igual que el publisher; nota de alcance «Your
  products only … Campaign totals (all sponsors included) are in By campaign and By surface below».
  `BRAND_CHARGED_KPI` («yours») desaparece. Retirados `revenue-split.jsx`, `counterparties.jsx`,
  `status-maps.js`, `useStatsOverview`, `useStatsCounterparties`, `withoutVioFee`, `MOCK_COUNTERPARTIES`;
  `MOCK_OVERVIEW` con la forma real.
- `5c01b0a` **Unidades.** `SESSION_FUNNEL_STEPS` y `SESSION_SIDE` llevan `unit` (`visits`; `ordersUnlinked` =
  `orders`); `paymentOutcomesOf().unit = 'visits'`; `SideStat` y «Vipps payments · N visits» lo pintan;
  `FunnelBars` acepta `unit` («visits» en el de sesiones, «events» en el de eventos del detalle);
  `AnalyticsTable` acepta `title` por columna (funnel por producto y por segmento); CSV con columna `unit`.
  También `productRankOf` / `byProductRank` en `lib/analytics.js`.
- `c6dd133` **Top products** dice la métrica que ordena de verdad («Ranked by clicks — no sales in this range»)
  y la barra la sigue.
- `6d06510` **Active campaigns**: `withZeroStats(rows, loaded)` / `ZERO_STATS` en `lib/campaign-analytics.js`:
  activa sin fila con la lectura resuelta y sin error → 0 (`noTraffic`); programada o lectura caída/parcial → «—».
- `f5b54bd` **«Today»**: `previousRangeLabel` → «all of yesterday (today so far)».

### Verificación

- `npx jest`: **100 suites / 1012 tests en verde** (base: 99 / 1002). Nuevo `test/dashboard/top-products.test.jsx`;
  ampliados `kpi-grid`, `session-funnel-card`, `active-campaigns`, `test/lib/{analytics, session-funnel,
  campaign-analytics, filters, oslo-days}`.
- `npm run lint`: los 3 problemas preexistentes (`src/ui/combobox.jsx`, `src/views/shell/index.jsx`), ninguno en
  lo tocado.
- `next build`: «Compiled successfully» y después el fallo conocido de «Collecting page data» (`c(...) is not a
  function` en `_app.js`) del worktree con `node_modules` por symlink (brief, 2026-10-20). Re-verificar en el
  preview de Vercel.
- **Sin verificar contra staging con datos reales.** El overview propio de la brand ya existía y ya se usaba para
  la caja; lo que cambia es qué tiles lo leen.

### Documentación

- `briefs/front-commerce.md`: delta «00. 2026-11-06» (el workspace `~/vio-commerce` tenía ya cambios sin
  commitear en ese archivo de otra sesión; no se commiteó).
- `docs/architecture/webapp-vio-commerce.md`: nota del 2026-11-06 en `/home`.

## Decisions

- **Producto, a confirmar por Angelo (en la PR):** las KPI tiles de la brand pasan de «totales de sus campañas»
  a «sus cifras». ADR-0035 §4 (Angelo, 2026-10-19: «ve el total de las campañas donde han ido sus productos,
  pero solo lo que tiene que ver con ellos») sigue valiendo: los totales están en «By campaign» y «By surface»;
  la fila de arriba cuenta lo mismo que la caja, el embudo y sus productos.
- Lo que no se mide no se pinta: fuera el split de ingresos y las contrapartes hasta que exista el modelo de
  liquidación (decisión abierta desde 2026-08-26).
- Una activa sin fila con la lectura resuelta es 0, no «—»; el «—» queda para «no se sabe» (lectura caída o
  parcial) y para «no aplica» (programada).

## Blockers / open questions

- **Campaña de prueba como activa**: no se puede distinguir desde la webapp. Opciones para Angelo: terminar o
  renombrar la campaña 1 en el micro, o un flag `isTest` en el micro de campañas (que el webapp filtraría del home).
- **GMV de Faves**: vio-analytics #43 pendiente de deploy.
- Si Angelo vio «vs yesterday» con 14 días seleccionados, no sale de este código: pedirle la URL exacta (el rango
  va en `?range=`).

## Next session

- Si Angelo da el OK: mergear #103, desplegar a staging, y comprobar en el navegador con la cuenta brand Careless
  que la fila de KPIs cuadra con «Charged» y con el embudo, y que «Top products» dice «Ranked by clicks — no
  sales» cuando toque.
- Si el micro añade una marca de prueba, filtrarla en `activeCampaignRows` y en las tablas.
- Pendiente de antes y no tocado: la toolbar de `/orders` sigue con `toISOString()` (UTC) para el rango.
