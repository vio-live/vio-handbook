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
  query/hash); `impressions` = `component_impression`/`ad_impression`; `clicks` = `select_item`/`ad_click`/`component_click` (como ya contaban `summary`/`slots`/`funnel`);
  `interactions` = clics + `view_item` + `add_to_cart` + `begin_checkout`; `purchases` = pedidos únicos
  (`PURCHASES_SQL`); `gmv` = suma de `value` de purchase; `aov` = gmv / purchases; `conversion` =
  purchases / sesiones con impresión; `buyers` = `buyer_id` únicos; `repeat_buyers` = buyers con ≥ 2 pedidos.
- **Nunca** nombres de campaña/surface/producto como fuente de verdad en el colector: ids + snapshot
  (`content_title`, `items.name`). La webapp pone nombres e imágenes cruzando con el micro y el catálogo.

> [claude, 2026-10-19 19:02 UTC] **Decisiones tras las revisiones independientes** (colector #23, base-api #42/#43, webapp #67, shopcart #94, orders #27, graphql #30):
> 1. **Las lecturas nuevas exigen token interno** (`/v1/stats/surface/*`, `/v1/stats/campaigns/:id/{timeseries,content,entry,orders,summary}` y las nuevas de `/v1/commerce-stats/*`): la key pública de la surface va en el HTML y con ella una brand leería `by-channel` y `surface/products` de las demás. Las lecturas antiguas no cambian. El webapp siempre va por el puente, que usa el token.
> 2. **La pertenencia de una brand a una campaña no sale de los eventos** (el `sponsor_id` lo declara el cliente; un evento falsificado metía una campaña ajena en los totales): sale de la fuente de tenencia del colector o de `campaign_ids` que pone el puente.
> 3. **La atribución nunca bloquea una venta**: gateway y shopcart truncan/descartan (`trim`, cortes a la longitud de columna, ids inválidos fuera, URLs solo `http(s)`), no responden 400/500. Longitudes reales: `content_url` 2048, `content_title` 255, `entry_source` 255, `buyer_ref` 64, `location_id` 100, `component_kind` 32.
> 4. **Aislamiento en shopcart**: una `surface_key` solo acredita si la surface es del publisher del carrito; con BD caída se descartan las campañas declaradas; la campaña debe ser de la surface resuelta. `buyer_ref` solo en órdenes que nacen pagadas; `checkout.attribution` guarda host del referrer + utm (no referrer completo ni `landing_url`).
> 5. **Pendiente de Angelo (migración nueva `1792400000000`)**: `cart_item.origins JSON`, `checkout.attribution JSON` y paso a `utf8mb4` de `content_url`, `content_title`, `entry_source`, `location_id`, `component_kind` (las tablas `order`, `order_item`, `cart_item`, `checkout` están en latin1 en QA: un título con guion largo o emoji rompería el INSERT de una orden cobrada).
> 6. **Semántica de rangos**: `days=N` y los presets son días naturales UTC (`24h` = hoy en UTC, rotulado así); el periodo anterior son N días completos, así que los deltas del día en curso van sesgados a la baja. Las sesiones por bucket no suman el total del rango.
> 7. **Orden de despliegue**: colector #23 antes que webapp #67 (con el colector viejo `from/to` se ignora y `by=referrer|landing|component_kind` da 400); kernel (migración) → orders → shopcart → gateway → SDK (publish al final, Angelo).

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
> (`feat/stats-por-surface-generico`, **mergeado en develop `c5f52c8`**; topes de la revisión de seguridad en
> [#43](https://github.com/vio-live/vio-base-api/pull/43): 365 días en `from/to`, ids UInt32, `campaign_id` igual al
> del path en lecturas de campaña, `range`+`days`/`from/to` → 400, preset `90d` → `days=90`, `metrics` ≤ 20/256): una sola ruta `GET /api/stats/surfaces/:surfaceId/*`
> con las allowlists de arriba (`SURFACE_STATS_PATHS`, `CAMPAIGN_STATS_PATHS` en `src/service/statsService.ts`),
> query cerrada y validada en las dos vistas (`SURFACE_QUERY`, `BRAND_QUERY`; repetida o inválida → 400) y
> `COMMERCE_STATS_PATHS` ampliada. Dos matices: `range=24h|7d|14d|30d|90d` se sigue aceptando (→ `days`, 14 por
> defecto; en la brand viaja también `range` mientras el colector legacy solo lea eso, y `90d` le cae a 14d hasta el
> colector de fase A) para no romper el webapp, y el alias `campaigns` sigue yendo a `/v1/stats/campaigns/summary` (misma
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

> [svc-shopcart, 2026-10-19] Verificado en código: **hoy no llega nada a Commerce** — ni `origins`
> (la SDK los tiene solo en memoria; `LineItemInput` del gateway es `product_id, quantity, variant_id,
> price_data`), ni la surface (el gateway resuelve el channel de `Authorization` y tira `X-API-Key`), ni
> referrer/utm (solo van a analytics). shopcart no tiene columna JSON donde guardarlo. Lo que implementa
> [vio-shopcart#94](https://github.com/vio-live/vio-shopcart-microservice/pull/94) (borrador) y lo que falta:
> - **Kernel, misma migración**: `cart_item.origins JSON NULL` (`CartItem.origins`, lista por origen con
>   `quantity`) y `checkout.attribution JSON NULL` (`Checkout.attribution`). Sin ellas la atribución no
>   sobrevive hasta los webhooks que crean la orden.
> - **orders**: `Api.Order.OrderDto.toOrder` copia la orden campo a campo → debe copiar `surfaceId,
>   campaignId, contentUrl, contentTitle, entrySource, buyerRef` de `data.order` (los de ítem ya pasan).
> - **Gateway** → shopcart (snake_case): `data.line_items[i].origin { campaign_id, location_id,
>   component_kind, content_url, content_title }` en add; `data.origin` en update-item; `data.attribution
>   { surface_id?, surface_key?, campaign_id?, content_url?, content_title?, entry { referrer?, utm_source?,
>   utm_medium?, utm_campaign?, landing_url? } }` en `POST /checkout` (body fijo hoy: añadirlo) y en
>   `/checkout/update/:id`. Recomendado: el gateway pone `attribution.surface_key` desde `X-API-Key`.
> - **SDK**: `origin` desde `Vio.attribution(slot)` en add/update; `attribution` en `updateCheckout` antes de pagar.
> - shopcart valida `surface_key`/`surface_id`/campañas contra el **channel del carrito** (`surface_channel`,
>   `surface_campaign_channel`): una página no acredita ventas a otra surface. `surface_id` por channel y
>   `buyer_ref` salen ya sin cambios en SDK/gateway. Journal: [`2026-10-19-shopcart-atribucion-en-la-orden`](../journal/2026-10/2026-10-19-shopcart-atribucion-en-la-orden.md).

> [svc-graphql, 2026-10-19] Lado gateway hecho en [graphql#30](https://github.com/vio-live/graphql/pull/30)
> (borrador): `LineItemInput.origin` y `UpdateItem(origin: CartLineOriginInput)`, `CreateCheckout(attribution)`
> y `UpdateCheckout(attribution: CheckoutAttributionInput { surface_id, surface_key, campaign_id, content_url,
> content_title, entry { referrer, utm_source, utm_medium, utm_campaign, landing_url } })`, mismos nombres y
> límites que los DTOs de shopcart. **El gateway pone `attribution.surface_key` desde `X-API-Key`** en las dos
> mutaciones de checkout (el header gana sobre lo declarado; sin header pasa lo declarado). Con la SDK de hoy, que
> ya manda `X-API-Key`, `surface_key` llega sin tocar la SDK. Ojo: `UpdateItem` no reenviaba por spread (el
> usecase copia campos por nombre), ya está. Journal:
> [`2026-10-19-graphql-atribucion-en-la-orden`](../journal/2026-10/2026-10-19-graphql-atribucion-en-la-orden.md).

> [svc-orders, 2026-10-19] Hecho en orders (rama `feat/atribucion-en-la-orden`, commit `2dc037b`, PR
> borrador pendiente de push): `save()` llama `attributeOrder(orderData, dto)` tras `toOrder` y copia los
> seis de orden; los tres de ítem pasaban por el spread **sin normalizar** y ahora se normalizan en sitio
> (un `campaignId: "abc"` habría tumbado el insert de una orden ya cobrada). Reglas: ids enteros
> positivos, textos recortados a las longitudes de la migración (`content_title` **255**, `location_id`
> **100**, `component_kind` **32**: las de arriba, no 512/128/64), lo demás fuera; ausente/`null` → NULL.
> Nunca rechaza. `buyer_ref` no sale en ninguna lectura (`orderFields` no la proyecta) ni en los logs de
> `/save`/`cancelOrder`. El `GET /orders` con `surface_id`/`campaign_id`/`campaign_status` del párrafo
> siguiente **aún no existe**. Journal: [`2026-10-19-orders-atribucion-en-la-orden`](../journal/2026-10/2026-10-19-orders-atribucion-en-la-orden.md).

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
