---
title: "Handoff — Analytics avanzado (ADR-0035): contrato entre colector, puente, Commerce y webapp"
date: 2026-10-19
owner: claude (coordina) + agentes por repo
decides: angelo
status: live
---

# Analytics avanzado — contrato de la fase A y B

Base: [ADR-0035](../decisions/0035-analytics-avanzado-para-publisher-y-brand.md) (aceptado). Todos los
agentes implementan **estas formas**; si algo no encaja con el código real, se cambia aquí primero.

## 0. Reglas comunes

- **Rango**: `?days=N` (como hoy) **o** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (UTC, inclusivo, máx. 365 días;
  `from/to` gana sobre `days`). Toda lectura devuelve `range: { from, to }` (ISO fecha).
- **Filtros opcionales** en las lecturas por surface: `campaign_id`, `sponsor_id`; en las de brand:
  `client_app_id` (surface), `campaign_id`.
- **Tenencia**: por surface = key de surface o token interno + `client_app_id`; por brand = token interno +
  `sponsor_id` (el puente de base-api pone ambos; el cliente nunca).
- **Definiciones** (ADR-0035 §2.2): `page_views` = sesiones con algún evento en el `content_url` (sin
  query/hash); `impressions` = `component_impression`/`ad_impression`; `clicks` = `select_item`/`ad_click`;
  `interactions` = clics + `view_item` + `add_to_cart` + `begin_checkout`; `purchases` = pedidos únicos
  (`PURCHASES_SQL`); `gmv` = suma de `value` de purchase; `aov` = gmv / purchases; `conversion` =
  purchases / sesiones con impresión; `buyers` = `buyer_id` únicos; `repeat_buyers` = buyers con ≥ 2 pedidos.
- **Nunca** nombres de campaña/surface/producto como fuente de verdad en el colector: ids + snapshot
  (`content_title`, `items.name`). La webapp pone nombres e imágenes cruzando con el micro y el catálogo.

## 1. Colector (vio-analytics)

### 1.1 Por surface (publisher)

| Lectura | Respuesta |
|---|---|
| `GET /v1/stats/surface/overview` | `{ client_app_id, range, kpis: { sessions, page_views, impressions, clicks, interactions, product_views, add_to_carts, begin_checkouts, purchases, units, gmv, aov, conversion, buyers, repeat_buyers }, previous: { …mismas kpis del periodo anterior de igual longitud } }` |
| `GET /v1/stats/surface/timeseries?metrics=sessions,page_views,impressions,clicks,purchases,gmv&bucket=day\|hour` | `{ client_app_id, range, bucket, points: [{ t: "2026-10-19" \| "2026-10-19T14:00:00Z", sessions, … }] }` (todos los buckets del rango, con ceros) |
| `GET /v1/stats/surface/by-campaign` | `{ client_app_id, range, campaigns: [{ campaign_id, sessions, page_views, impressions, clicks, product_views, add_to_carts, purchases, units, gmv, aov, conversion, slots, pages, buyers }] }` (sustituye a `campaigns/summary`, que se mantiene como alias) |
| `GET /v1/stats/surface/by-channel` | `{ client_app_id, range, channels: [{ sponsor_id, campaigns: n, sessions, impressions, clicks, purchases, units, gmv, aov }] }` |
| `GET /v1/stats/surface/content` | `{ client_app_id, range, content: [{ content_url, content_title, content_id, page_views, impressions, clicks, purchases, gmv, campaigns: [ids] }] }` |
| `GET /v1/stats/surface/products` | `{ client_app_id, range, products: [{ product_id, name, impressions, clicks, product_views, add_to_carts, orders, units, revenue, campaigns: [ids] }] }` |
| `GET /v1/stats/surface/entry` | «por dónde entró el usuario»: `{ client_app_id, range, sources: [{ kind: "referrer"\|"utm"\|"direct", key (host del referrer, o `utm_source/utm_medium/utm_campaign` unidos con " / "), sessions, purchases, gmv }], landing: [{ content_url, content_title, sessions, purchases, gmv }] }` |

### 1.2 Por campaña (se mantienen `summary`, `slots`, `products`, `breakdown`, `funnel`; todas aceptan `from/to`)

| Lectura | Respuesta |
|---|---|
| `GET /v1/stats/campaigns/:id/timeseries?metrics=&bucket=` | como la de surface, filtrada por campaña |
| `GET /v1/stats/campaigns/:id/content` | como `surface/content`, filtrada por campaña |
| `GET /v1/stats/campaigns/:id/entry` | como `surface/entry`, filtrada por campaña |
| `GET /v1/stats/campaigns/:id/orders?limit=` | `{ campaign_id, range, orders: [{ order_id, ts, value, currency, payment_method, items: n, content_url, content_title, location_id, device_type, entry: key }] }` (solo con **token interno**; desde analytics hasta que Commerce tenga la atribución) |
| `breakdown?by=` | añade `referrer` (host), `landing` (`content_url` de entrada) y `component_kind` |

### 1.3 Por brand (`/v1/commerce-stats/*`, token interno + `sponsor_id`)

Todas aceptan `from/to`, `client_app_id`, `campaign_id`. Nuevas: `by-surface` (`[{ client_app_id, campaigns: n,
impressions, clicks, purchases, units, gmv }]`), `by-campaign` (igual que por surface pero limitada a las
campañas donde el sponsor aparece como primario o secundario), `products`, `content`, `entry`,
`breakdown?by=`. **Regla**: la brand ve totales de esas campañas, no desglosados por otras brands.

## 2. base-api (puente)

- `GET /api/stats/surfaces/:surfaceId/<path>` con allowlist: `overview`, `timeseries`, `by-campaign`,
  `by-channel`, `content`, `products`, `entry`, `campaigns/:campaignId/(summary|slots|products|breakdown|
  timeseries|content|entry|orders|funnel)`. Ownership como #41 (publisher dueño; admin no). Query
  permitida: `days, from, to, metrics, bucket, by, campaign_id, sponsor_id, limit`; nunca
  `client_app_id` ni tokens.
- Brand: el comodín actual por sponsor amplía su allowlist con `by-surface`, `by-campaign`, `products`,
  `content`, `entry`, `breakdown` y permite `from, to, client_app_id, campaign_id, by, metrics, bucket, limit`.
- Errores igual que hoy (400 / 403 / 404 / 502 / 503).

> [claude (svc-base-api), 2026-10-19] **Hecho en [vio-base-api#42](https://github.com/vio-live/vio-base-api/pull/42)**
> (`feat/stats-por-surface-generico`, pendiente de merge): una sola ruta `GET /api/stats/surfaces/:surfaceId/*`
> con las allowlists de arriba (`SURFACE_STATS_PATHS`, `CAMPAIGN_STATS_PATHS` en `src/service/statsService.ts`),
> query cerrada y validada en las dos vistas (`SURFACE_QUERY`, `BRAND_QUERY`; repetida o inválida → 400) y
> `COMMERCE_STATS_PATHS` ampliada. Dos matices: `range=24h|7d|14d|30d` se sigue aceptando (→ `days`, 14 por
> defecto) para no romper el webapp, y el alias `campaigns` sigue yendo a `/v1/stats/campaigns/summary` (misma
> forma que `by-campaign`). Hasta que el colector tenga `/v1/stats/surface/*`, esas rutas devuelven 502
> `{ upstream_status: 404 }`. Journal: [`2026-10-19-base-api-stats-fase-a`](../journal/2026-10/2026-10-19-base-api-stats-fase-a.md).

## 3. Commerce — atribución en la orden (fase B, OK de Angelo)

package-database (una migración):
- `order`: `surface_id INT NULL`, `campaign_id INT NULL`, `content_url VARCHAR(2048) NULL`,
  `content_title VARCHAR(255) NULL`, `entry_source VARCHAR(255) NULL` (host del referrer o utm), `buyer_ref VARCHAR(64) NULL`.
- `order_item`: `campaign_id INT NULL`, `location_id VARCHAR(100) NULL`, `component_kind VARCHAR(32) NULL`.
- `surface_campaign`: `publisher_commission_pct DECIMAL(5,2) NULL` (fase C; va en la misma migración).

shopcart: al crear la orden, rellena todo desde el carrito (`origins[]` de cada línea: campaña, slot,
artículo; página de entrada y referrer/utm si el checkout los lleva) y del contexto del checkout
(`surface_id` de la key de la SDK; `buyer_ref`). Si una línea no trae origen, hereda el de la orden.
Si el carrito no recibe hoy los `origins` desde la SDK, el agente lo documenta y propone el mínimo
cambio de API (la SDK ya los calcula: `cart line origins[]` desde 0.23).

orders: `GET /orders` acepta `surface_id`, `campaign_id`, `campaign_status=active|past` (resuelto con el
micro por ventana/pausa) y los devuelve en cada orden; el dashboard los enseña y filtra.

## 4. Webapp

- **Barra de filtros** compartida (`src/lib/filters.js` + componente): `range` (24h/7d/14d/30d/90d/custom
  → `from/to`), `surface`, `campaign`, `channel`; en la URL; todas las tarjetas la leen.
- **Recharts** (nueva dependencia): serie temporal (líneas/áreas, brush para zoom, clic en punto → filtra
  el día), barras y anillos para desgloses (clic → filtro), funnel horizontal. Tooltips exactos, exportar CSV.
- **Home publisher**: KPIs con variación vs periodo anterior; serie; Active campaigns; tablas por surface
  / campaña / channel; top productos **con miniatura** (imagen del catálogo por `product_id`, caché por
  sesión); transacciones totales; origen de entrada.
- **Detalle de campaña**: ajustes (publisher), embudo, serie, artículos, componentes, productos (miniatura),
  compradores y pago (método, dispositivo, SO, navegador, idioma, origen de entrada), pedidos.
- **Brand**: mismas tarjetas con su alcance (totales de sus campañas, en cualquier surface; nunca otras brands).
- Estados visibles; sin "K" en conteos; mocks para local.

## 5. Coordinación con Miguel

Ver [`2026-10-19-coordinacion-claude-miguel.md`](./2026-10-19-coordinacion-claude-miguel.md): cada parte
escribe ahí (y pushea) cuando termina algo que el otro necesita.
