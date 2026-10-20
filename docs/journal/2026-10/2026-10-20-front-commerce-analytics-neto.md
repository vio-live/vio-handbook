---
date: 2026-10-20
session: "Front de Commerce: dinero neto en analytics (ADR-0036) — net revenue con bruto, devuelto y cancelados al lado; AOV y conversión sobre lo neto; PR #68"
participants: [angelo, claude]
status: live
---

# Dinero neto en analytics del webapp (ADR-0036)

## Goal

Implementar el lado webapp de [ADR-0036](../../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md)
sobre lo que entró en [#67](https://github.com/vio-live/webapp-vio-commerce/pull/67): el colector va a devolver el
dinero **neto** por defecto con el bruto al lado (`gmv` neto, `gmv_gross`, `refunded_value`, `cancelled_orders`,
`purchases` hechos y `purchases_net`; en products `revenue`, `revenue_gross`, `refunded_value`; en timeseries los
nuevos nombres como métricas válidas) y el dashboard tiene que mostrar «Net revenue» con «gross · refunded ·
cancelled», pedidos netos con «placed · cancelled», AOV y conversión «on net», sin inventar nada cuando el colector
anterior no manda esos campos.

## Done

- **Rama `feat/analytics-neto`** desde `origin/develop` (`8a1ab40`, el merge de #67), worktree
  `~/vio-commerce/worktrees/webapp-compensacion`, tres commits `8497623` + `a679b63` + `684b679`,
  **[PR #68](https://github.com/vio-live/webapp-vio-commerce/pull/68)** a `develop`, revisado (MERGE con mejoras
  dentro), sin mergear. 28 archivos, +1476/−400.
- **`src/lib/stats.js`**: `netOf(raw, gmv = 'gmv')` → `{ gmvGross, refundedValue, cancelledOrders, purchasesNet }`
  con el fallback «campos ausentes» (bruto = neto, 0 devuelto, 0 cancelados, neto de pedidos = hechos). Entra en
  `fromKpis` (`KPI_KEYS` crece a 20, los cuatro nuevos nunca son null), `fromCampaignSummary`, `fromChannelRow`,
  `fromBrandSurfaceRow`, `fromContentRow`, `fromSlotStats`, `fromEntry` (sources y landing), `fromBreakdown`; en
  `fromProductRow` `revenueGross` (`revenue_gross`|`gmv_gross`) y `refundedValue`. `SERIES_METRICS` pide además
  `purchases_net` y `gmv_gross` y `fromTimeseries` los normaliza. `addStats`/`sumStats` suman los cuatro; las
  derivadas (`aov`, `conversion`) salen de lo neto.
- **`src/lib/analytics.js`**: `withDerived` = `gmv / purchasesNet` y `purchasesNet / impressionSessions` (sin base →
  null → «—»); `sumKpis` y `mergeRows` pasan las filas por `withNetDefaults` (una fila sin los campos —forma vieja o
  armada a mano— cuenta como «nada compensado», no como 0 pedidos netos) y suman netos y brutos **aparte**;
  `revenueNote` («gross X · refunded Y · N cancelled», sin las partes a 0 y el bruto solo si difiere del neto),
  `ordersNote` («N placed · M cancelled», null si nada se canceló), `revenueTitle`, `hasCompensation`, `NET_HELP`;
  `HOME_KPIS` (Orders = `purchasesNet` con nota y «?», Net revenue con nota y «?», **AOV · on net** como tile nueva,
  Conversion · on net, 8 tiles = 2 filas) y `BRAND_KPIS` (4, sin AOV ni conversión); `transactionsOf` con los
  nuevos campos; columnas CSV comunes `ORDERS_CSV` (`orders`, `orders_net`), `NET_CSV` (`gmv`, `gmv_gross`,
  `refunded_value`, `cancelled_orders`), `PRODUCT_NET_CSV`.
- **UI**: `KpiCard` con `sub`, `note` y `help`; **`HelpTip`** en `src/ui/tooltip.jsx` («?» Phosphor `Question`
  con tooltip Radix y su propio `TooltipProvider`, así sirve dentro del shell y en una tarjeta suelta; abre con
  foco y hover). `NetMoney` / `NetOrders` en `views/shared/analytics-table.jsx` (neto; bruto debajo cuando difiere
  —marcado `data-net="gross"`— y detalle completo en `title`; la nota NO lleva `tnum` porque los tests cuentan
  celdas por esa clase). Aplicado a By surface / By campaign / By channel («AOV (net)»), Active campaigns, Top
  products («Ranked by net revenue», nota antes de los clics), Where visitors came in, Total transactions, y en el
  detalle Articles / Products / Components (totales «N orders (N placed · M cancelled) · kr X net revenue (gross …),
  attributed to slots»). Breakdown mide `purchasesNet` / net revenue / sesiones.
- **Serie** (home y detalle): la leyenda es el selector de métricas — `TimeSeriesChart` acepta `hidden` y `dashed`
  por serie; «Net revenue» encendida, «Gross revenue» (verde fuerte, discontinua) apagada hasta pulsarla; «Orders»
  = `purchasesNet`. `SERIES_CSV_COLUMNS` compartido (date, sessions, page_views, impressions, clicks, orders,
  orders_net, gmv, gmv_gross).
- **Mocks** de demo con compensaciones en la campaña 9 (`purchases_net 11/12`, `gmv 19690/21480`), el slot
  `carousel-a1` y el producto 101; la campaña 10 no las trae y ejercita el fallback. **Fixtures** `KPIS_NET`,
  `KPIS_NET_PREVIOUS`, `CAMPAIGN_ROW_NET`, `PRODUCT_ROW_NET`, `TIMESERIES_POINT_NET` en
  `test/fixtures/collector.js`, marcadas como «nombres del encargo».
- **Tests**: `test/lib/analytics.test.js` suma un `describe('neto y bruto (ADR-0036)')` (netOf y fallback en las
  nueve formas, sumas separadas, AOV/conversión netos, deltas netos, mezcla de surface nueva + vieja, notas, tiles,
  CSV); `kpi-grid` (campos ausentes sin línea secundaria, con compensación 72 netos / «76 placed · 4 cancelled» /
  «gross kr 123K · refunded kr 7.2K · 4 cancelled» / delta +20 % en vez de +27 %, devolución parcial, brand, el «?»
  abre con foco); `by-campaign-card` (surface nueva + vieja: «3» con title «4 placed · 1 cancelled», «kr 300 /
  gross kr 400»); `series-chart` (bruto apagado hasta pulsarlo); rótulos en `active-campaigns`, `components-card`;
  `active-campaigns-sin-vio` lee los mocks reales y ahora espera neto.
- **Segundo commit `a679b63` (pedido del coordinador): la serie pide las métricas netas solo si el overview
  dice que el colector compensa.** `useNetAware(surfaceIds, filters)` lee el overview (misma clave SWR que las
  KPIs del home; en el detalle, el de la surface) y `netAwareOf` devuelve true si alguno trae `gmv_gross`, false si
  ninguno o si la lectura falló, undefined mientras no se sabe. Con true la serie pide `SERIES_METRICS_NET`
  (`…,purchases_net,gmv_gross`) y ofrece «Gross revenue» apagada (`publisherSeriesFor`, `seriesCsvFor` con
  `orders_net`/`gmv_gross`); con false pide `SERIES_METRICS` (las de siempre) y dibuja «Net revenue» = gmv sin
  «Gross revenue» ni esas columnas; con undefined no pide nada (`useScopedRead … enabled: false`,
  `useCampaignTimeseries(sid, cid, filters, netAware)` con `campaignReadKey` null). El orden de despliegue
  colector/webapp deja de importar, también en prod. Tests: `test/lib/series-net-aware.test.js` (puros + hooks
  contra los mocks) y `test/dashboard/series-card.test.jsx` (las tres situaciones y el bucket por hora).
- **Comprobado que «N placed · M cancelled» no recalcula:** `ordersNote` toma `purchases` y `cancelled_orders`
  tal cual (`fromKpis({ purchases: 10, purchases_net: 7, cancelled_orders: 2 })` → «10 placed · 2 cancelled», no
  3); `purchasesNet` solo decide si hay algo que contar. Test añadido en `analytics.test.js`.
- **Tercer commit `684b679` — revisión de #68 (W1–W3 + nits):**
  - **W1 · capacidad recordada por surface.** `netAwareOfBody` juzga cualquier cuerpo del colector
    (`kpis.gmv_gross`, o una fila de dinero con `gmv_gross`/`revenue_gross` en campaigns / channels / surfaces /
    content / products / sources / landing / slots / rows; `points` no cuenta porque solo trae lo pedido; listas
    vacías no juzgan). `netAwareFor({ bodies | rows, error }, surfaceIds)`: lo que diga la lectura (y se recuerda
    por surface, `'brand'` para el comodín) > lo recordado > false si resolvió/falló sin nada que juzgar > undefined
    mientras carga sin memoria. Memoria de módulo (`rememberedNetAware`, `resetNetAwareMemory` para tests):
    cambiar filtros o de página ya no devuelve undefined ni hace esperar a la serie; solo la primera lectura de la
    sesión espera. **Detalle de campaña:** no hay overview ni KPIs propios en el webapp (lee funnel, timeseries,
    content, products, breakdown, slots y orders), así que `useCampaignNetAware` usa lo recordado para la surface o
    el `content` de la campaña que Articles ya pide (misma clave SWR, cero lecturas extra); content vacío → lo de
    siempre. **Home:** `useScopeNetAware` (overview de las surfaces con la misma clave que las KPIs; la brand desde
    by-campaign) → `scope.netAware`, y cada tarjeta cae a su propia lectura (`scope.netAware ?? netAwareFor(q, …)`;
    Active campaigns desde `rows` normalizadas por `netKnown`).
  - **W2 · rótulos sin "net" con el colector anterior.** `kpisFor(netAware)` (tiles planas: "Revenue", "AOV",
    "Conversion", sin `sub`/`help`/`note`), `revenueLabel`, `aovLabel`; aplicado a tiles, Total transactions, By
    surface/campaign/channel, Active campaigns, Top products, entrada, breakdown (`moneyName` de `BreakdownBars`),
    serie (`PUBLISHER_SERIES_PLAIN`: leyenda "Revenue", sin "Gross revenue") y Articles / Products / Components del
    detalle. Mientras no se sabe (`undefined`) tampoco se afirma "net".
  - **W3 · CSV sin copias.** Las filas llevan `netKnown` (= la fila trajo el bruto) desde `netOf`, `fromProductRow`,
    `fromTimeseries`; se propaga en `sumKpis`, `mergeRows`, `addStats`, `sumStats`, `transactionsOf`. `netCell(key)`
    deja VACÍAS `gmv_gross`, `refunded_value`, `cancelled_orders`, `orders_net` (products `revenue_gross`,
    `refunded_value`; serie `orders_net`, `gmv_gross`) cuando `netKnown` es false — ni ceros ni copias del neto.
    `seriesCsvFor` desaparece: `SERIES_CSV_COLUMNS` es constante con celdas vacías.
  - **Nits.** `sumKpis` ya no usa el `aov` del colector como fallback (sin pedidos netos → «—», no «kr 0»; la
    conversión del colector sí vale si falta `impression_sessions`); `NET_HELP` = «Net = placed − cancelled/refunded,
    as reported by Commerce. Refunds count in the period they were recorded.»; `revenueNote` ya no repite «N
    cancelled» (queda solo en Orders).
  - Tests: `series-net-aware` (detección por cuerpo, memoria, `useNetAware` de memoria con otros filtros,
    `useCampaignNetAware` contra los mocks, CSV de la serie), `kpi-grid` (W2 con el colector anterior, W1 sin
    parpadeo al cambiar filtros, `scope.netAware` manda), `by-campaign-card`, `active-campaigns`, `components-card`
    (mockea `useCampaignNetAware`), `series-card`, `analytics` (nits, `kpisFor`, CSV vacío). Mocks de content con
    el bruto para que el detalle de demo sea coherente.
- **Verificación (cierre)**: `npx jest` **79/81 suites · 788/790 tests** (las 2 rojas, `payments-lib` y
  `qliro-shipping-config`, fallan igual en `93de3e7`); `npm run lint` con los 3 preexistentes (combobox + `<a>`
  del shell, archivos sin tocar); `next build` verde (36 páginas, 20 exportadas).

## Decisions

- **El bruto solo se muestra cuando difiere del neto.** «Oculta las partes a 0» aplicado también al bruto: con el
  colector anterior `gmv_gross = gmv` y mostrar «gross X» igual al neto afirmaría una comparación que no existe.
  Sin nada compensado la tile no lleva línea secundaria y la tabla no lleva subfila.
- **Pedidos netos en todas las columnas «Orders»**, no solo en la tile: si el dinero es neto y el AOV es neto, un
  «Orders» bruto al lado desconcierta. Los hechos y cancelados van en el `title` y en el CSV (`orders`,
  `orders_net`, `cancelled_orders`).
- **La leyenda de la serie es el selector**: «Gross revenue» como serie oculta por defecto (y discontinua) en vez de
  un control aparte — permite comparar neto y bruto en el mismo eje y no añade UI.
- **Tile «AOV · on net» nueva** en el home del publisher (8 tiles, 2 filas de 4); la brand sigue con 4 (no tiene
  `previous` ni `impression_sessions`).
- **Filas sin los campos cuentan como «nada compensado»** al sumar (`withNetDefaults`): evita que una surface con
  el colector viejo reste pedidos que nadie canceló cuando se mezcla con una del nuevo.
- La serie **pide** `purchases_net` y `gmv_gross` solo cuando el colector manda el bruto (decisión del coordinador
  tras el primer reporte): la capacidad se detecta por lectura, no se asume por entorno, y se **recuerda por
  surface** (revisión W1): solo la primera lectura de la sesión espera; en el detalle, sin overview propio, la dice
  el `content` que ya se pide.
- **Con el colector anterior no se afirma «net»** (revisión W2): rótulos a secas, sin «?» ni líneas secundarias, y
  el CSV deja vacías las celdas netas (W3) en vez de copiar el neto — una hoja de cálculo sumaría las copias como
  datos.

## Blockers / open questions

- **El colector aún no publicó su fixture** (último PR [vio-analytics#24](https://github.com/vio-live/vio-analytics/pull/24),
  19/10): todo está codificado contra los nombres del encargo. Cuando salga, sustituir las fixtures de
  `test/fixtures/collector.js` y re-correr; ajustar `netOf` si el nombre o la semántica difieren (p. ej. si
  `cancelled_orders` cuenta solo cancelaciones totales y `refunded_value` incluye lo cancelado).
- ~~Riesgo en `timeseries` con el colector anterior~~ — resuelto en `a679b63` (ver Done): con el colector
  anterior se piden las métricas de siempre.
- **Sin verificar en navegador ni en staging** (el dashboard exige login; el harness de puppeteer con sesión
  inyectada no se corrió).
- **Volvió a pasar el gotcha del `node_modules` symlinkeado** (ya documentado el 2026-10-14 en
  [`architecture/webapp-vio-commerce.md` › Gotchas](../../architecture/webapp-vio-commerce.md#gotchas-vigentes)):
  `next build` cae en «Collecting page data» con `TypeError: c(...) is not a function` en `_app.js` (`geist/font`
  sin pasar por el loader de `next/font`). Costó tres builds porque el brief no lo llevaba; ya está en el brief.
  Salida: `npm ci` en el worktree (sin deps privadas, ~1 min). Y para el build sirven variables ficticias en el
  entorno (no hace falta copiar el `.env`).

## Next session

- Cuando el colector publique el shape: fixtures reales, re-correr, y verificar en staging el home del publisher
  (tiles, tablas, serie con «Gross revenue») y el detalle de una campaña con una orden cancelada de verdad (lo que
  prueba Alan en Vipps/Shopify/Woo): `purchases_net` y `gmv` bajan, `purchases` y `gmv_gross` no.
- `/orders` sigue siendo la vista de estados por pedido (ADR-0036): nada que cambiar ahí.
