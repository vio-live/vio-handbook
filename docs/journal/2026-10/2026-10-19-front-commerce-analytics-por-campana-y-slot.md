---
date: 2026-10-19
session: "front-commerce — analytics por campaña y por slot: Active campaigns en el home y Performance en el detalle"
participants: [angelo, claude]
status: local (5 commits, sin push ni PR; revisión independiente aplicada)
---

# Session — 2026-10-19 — front-commerce: analytics por campaña y por slot

## Goal
Lado webapp del handoff [`2026-10-19-analytics-por-campana-y-slot.md`](../../handoff/2026-10-19-analytics-por-campana-y-slot.md)
§2.3: que el home diga qué campañas corren de verdad y con qué cifras, y que el detalle de la campaña desglose por slot y
artículo, consumiendo el puente nuevo de base-api (§2.2, en paralelo) con los mismos hooks de `src/lib/stats.js`.

## Done
Rama **`feat/analytics-por-campana-y-slot`** desde `origin/develop` (`2916e2b`), worktree
`~/vio-commerce/worktrees/webapp-analytics-campanas`, **3 commits locales, sin push ni PR** (ADR-0001/0015):

- `a3a8c26` **feat(stats)** — `src/lib/stats.js` consume `GET /stats/surfaces/:id/campaigns?range=` y
  `…/campaigns/:id/slots?range=` (`useSurfaceCampaignStats(ids, range)`: una llamada por surface en paralelo, **el 403 de una
  surface ajena se ignora** —pasa con una cuenta `internal`—, cualquier otro error tumba el conjunto; `useCampaignSlotStats`).
  Los errores pasan de `Error('stats N')` a **`ApiError { status, body }`** normalizado con `withMessage` (el puente responde
  `{ error }`): la vista distingue 403 de 502/503. `useStatsCampaigns(range)` (antes sin rango; `null` apaga).
  `RANGE_OPTIONS`/`rangeLabel`. Normalizadores a **una sola forma de fila** para las dos fuentes (`fromCampaignSummary`,
  `fromBrandCampaignStats`, `fromSlotStats`, `statsByCampaign`, `sumStats`). Mocks por regex para las rutas nuevas
  (`src/mocks/stats.js`, escalan con el rango) y **serie de tiempo en unidades**. `useSurfaces(enabled)`.
  `src/lib/campaign-analytics.js` (nuevo): cruces puros `activeCampaignRows`, `slotRowsWithNames`/`slotNameOf`, `shortUrl`,
  `articleLabel`/`articleHref`, `productNamesLabel`. `docs/stats-service-contract.md` actualizado.
- `a0c9375` **feat(home)** — `ActiveCampaigns` (`src/views/dashboard/campaigns.jsx`) reemplaza a "My campaigns": campañas
  `active`/`scheduled` del micro (`useCampaigns` + `useSurfaces` + `useSponsors`) con surface, sponsor, ventana y estado,
  cruzadas por id con las cifras del rango del header. Columnas: Views · Clicks · Purchases (la brand ve "N units") · GMV ·
  Slots · Articles. Presupuesto/pacing/ROAS/"live" retirados. Estados: cargando campañas (spinner), cifras cargando ("…"),
  **error del puente visible** (aviso con Retry, filas sin cifras), vacío ("No active or scheduled campaigns right now."),
  sin stats en el rango ("No traffic in this range."). Fila y "New campaign" → `/campaigns/:id` y `/campaigns` solo si
  `canGo`. El publisher/internal pide por surface; la brand por sponsor (`/stats/campaigns?range=`). Gráfico "Views vs
  clicks": leyenda sin "(K)", ticks y tooltip con `fmtCompact`/`fmtNumber`, título y aria-label siguen al rango,
  `niceTicks(Math.max(1, …))` evita NaN sin tráfico.
- `93e4a62` **feat(campañas)** — `src/views/campaign-detail/performance.jsx`, tarjeta "Performance" bajo `CAMPAIGNS_V2`:
  selector 24h/7d/14d/30d, totales, tabla por slot × artículo (slot con `displayName` de `useSurfaceSlots`, si no el
  `location_id`; artículo = `content_title` o URL acortada, enlazado si es http(s); views, clicks, product views, carts,
  purchases, GMV, shown y sold products "A, B, C +n"). 403 → "Performance is available to the publisher of this surface.";
  otro error → "Analytics unavailable" + Retry; vacío → "No traffic in this range."; sin surface → se dice.

**Verificación.** `npx jest`: **63 suites / 667 tests verdes**; fallan 2 suites que **ya fallaban en `origin/develop` limpio**
(`test/payments/payments-lib.test.js` "Vipps manda sus cuatro credenciales" y `test/settings/qliro-shipping-config.test.js`),
ajenas a esto. Baseline antes de tocar: 60/2 suites, 640/2 tests → +3 suites, +27 tests. `npm run lint`: 0 problemas en lo
tocado; los 2 errores (`src/views/shell/index.jsx:280`, `no-html-link-for-pages`) y el warning (`src/ui/combobox.jsx`) existen en
`develop` sin mis cambios. No hay script de typecheck en `develop` (es JSX). **`next build` verde** (export estático completo) con
env ficticia (`FIREBASE_API_KEY=dummy-build-key FIREBASE_PROJECT_ID=dummy API_HOST=https://example.invalid`) y `node_modules`
clonado con `cp -cR` (con symlink falla en `next/font`, como dice el brief).
**Nada probado contra staging**: el puente de base-api y el colector #19 aún no están desplegados.

### Revisión independiente (misma tarde) — 1 blocker + 9 warnings, aplicados en `9e17b2c` + `67c6b4b`
- **B1 (blocker, y además regresión en prod):** sin backend de Vio (`VIO_ENABLED=false`; en prod `VIO_API_HOST` no está y
  solo se deriva para `reachu-qa`) `useCampaigns` tiene clave null y `campaigns` queda `undefined` para siempre → el home
  giraba sin fin. Ahora, sin Vio o con 401/403/404 del micro, la tarjeta cae a `/stats/campaigns` por sponsor tal cual
  (`statsOnlyRows`: nombres del colector, sin estado ni ventana) con nota explícita; en local con mocks se ven los datos
  demo. Test con el `useCampaigns` real (`test/dashboard/active-campaigns-sin-vio.test.jsx`).
- W1: `useSurfaceCampaignStats`/`useCampaignSlotStats` sin `keepPreviousData`; el texto de Performance pasa a "couldn’t
  refresh — last figures loaded for this range" (misma clave, revalidación fallida).
- W2: 401/403/404 de `/campaigns` = "sin micro para esta cuenta", sin aviso; `useCampaigns(enabled)`,
  `useSponsors(enabled)`, `useSurfaces(enabled)` condicionados por la matriz (`can('campaigns')`, `can('surfaces')`).
- W3: `shouldRetryOnError: retryable` (no 401/403/404) en todos los hooks de stats; `internal` solo pide sus surfaces
  (`ownSurfaceIds` por `surface.ownerId` = `account.id`).
- W4: `fetchSurfaceCampaignStats` → `{ rows, failed }` parcial; la alerta dice "for N of M surfaces".
- W5: columnas por fuente (`columnsFor`): la brand sin Surface/Sponsor/Purchases/Slots/Articles, con "Units sold"; nota en
  código de que sus clics son round(views × ctr).
- W6: **no se usó `cur.moneyK`**: con las cifras reales (179 NOK) daría "kr 0.2K" (el mismo problema que `compactParts`
  resolvió en los KPIs). Se agregó `fmtMoneyCompact` por magnitud ("kr 179" / "kr 21.5K" / "kr 1.2M") en `format.js` y
  `useCurrency().moneyCompact`; comentario de que el colector no manda moneda. Conteos con `fmtNumber`.
- W7: totales de Performance rotulados "attributed to slots" (y documentado en la cabecera de `stats.js`).
- W8: `test/lib/stats-real-fetch.test.js` (API_HOST antes del `require`, restaurado en `afterAll`; 403 ignorado vs 503 en
  `failed`, todas 403 → `[]`, red), `test/dashboard/chart.test.jsx` (sin "K", ticks compactos, todo en cero sin NaN),
  error de stats en la rama brand, 403 del micro para la brand, internal, parcial, sin feature.
- W9: productos bajo el artículo (8 columnas, `TableScroll` 820) y la tarjeta Performance en `max-w-[1000px]` fuera del
  wrapper de 780 → sin scroll en desktop.
- Nits: `role="alert"` en los avisos de error, `role="region"` en la tarjeta, `pluralize`, `slotNameOf` sin " · <página>".
- **Números tras la revisión:** `npx jest` **66 suites / 688 tests verdes**, 2 suites / 2 tests fallando = las mismas
  preexistentes (`payments-lib`, `qliro-shipping-config`). `npm run lint`: 3 problemas, los 3 preexistentes
  (`src/views/shell/index.jsx:280` ×2 errores, `src/ui/combobox.jsx:31` warning), 0 en lo tocado. `next build` verde de
  nuevo (36/36 páginas, export 20/20) con la env ficticia.

## Decisions
- **Sin micro no se espera**: la tarjeta siempre muestra algo (lo del puente por sponsor) y dice por qué le falta el estado.
- **Una sola forma de fila para las dos fuentes**, con `null` donde la fuente no trae el dato y "—" en la UI (nunca 0). La
  brand solo tiene `revenue`, `units` y `places[].views/ctr` del colector (`id: 'cmp-<id>'`, nombre y presupuesto
  placeholder): clics = Σ round(views × ctr) por lugar; compras/slots/artículos "—".
- Solo campañas `active`/`scheduled` del micro: una fila de stats de una campaña terminada o pausada no aparece en el home.
- Una llamada de stats **por surface con campañas activas**, no por todas las surfaces; el 403 por surface se tolera.
- GMV: el colector no manda código de moneda; se pinta con la de la cuenta (`useCurrency`), como el resto del dashboard.
- Las suites que montan `CampaignDetail` con V2 mockean `useCampaignSlotStats` (los mocks de stats usan `carousel-a1`/`card-b2`,
  los nombres de la demo de Vev, que chocan con los fixtures). `useCurrency` llama al `useMe` interno del módulo: mockear
  `useMe` no sirve; se mockea `useCurrency`.

## Blockers
- Contrato del puente **sin verificar contra staging** (depende de base-api PR hermano + colector #19 desplegado por Miguel).
- El worktree quedó con `node_modules` clonado (no symlink) para poder buildear; el clon APFS no cuesta disco.

## Next
- Revisión y PR a `develop` cuando Angelo dé el OK; desplegar **después** del puente de base-api (la webapp degrada bien si no
  existe: aviso "Analytics unavailable", no en blanco).
- Verificar en staging con la campaña 9 de Angelo (surface 3 "Vev", `bohus-demo`): home con la fila y Performance con los
  3 slots y el artículo.
- Fuera de alcance, pendiente: "Top selling products" sigue fijo en "last 14 days" y sin rango; analytics por slot para la
  brand (hoy por sponsor).
