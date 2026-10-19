---
title: "Handoff — Analytics por campaña y por slot en el dashboard de Commerce (publisher incluido)"
date: 2026-10-19
owner: claude (coordina), svc-base-api, front-commerce, miguel (deploys)
decides: angelo
status: live
---

# Analytics por campaña y por slot: del evento al dashboard

**Pedido de Angelo (19/10):** «quiero que analytics reciba la info sobre la campaña, 3 slots que
muestran x, y, z producto, la URL de la página; que si la campaña termina deje de registrarse data
en base a la campaña; que el home del dashboard ponga la información real de que hay una campaña
activa; y que estemos trackeando todo». Y después: «deberíamos contar las views, los clicks y hacer
todo el mapeado para que podamos ver la data real».

## 1. Qué hay hoy (verificado 19/10)

- **Los eventos ya llevan lo necesario** (SDK web 0.24.0 → colector): `campaign_id` (la campaña del
  artículo, elegida en Vev), `location_id` (el slot), `content_id` / `content_url` / `content_title`
  (el artículo), `sponsor_id`, `items[]` con `product_id` y nombre, `order_id` en compra.
- **Prueba real de hoy** (surface 3 «Vev», página `a-vio-dev.vev.site/bohus-demo`, campaña 9 «Test
  campaign Vev 3»): el funnel de la campaña en el colector de staging dio 4 impresiones, 2 clics, 4
  vistas de producto y **1 compra (179 NOK, Vipps)** atribuida a la campaña; `/v1/stats/content` lo
  desglosa por URL. El mapeado evento → campaña → artículo funciona de punta a punta.
- **Cuando la campaña termina o se pausa** la SDK deja de atribuirle eventos (solo atribuye a
  campañas activas de `campaigns[]`); el histórico queda.
- **Lo que falta**, por capas:
  1. **Colector:** las agregaciones «por componente» agrupan por `campaign_component_id` (heredado
     de vio-backend; web y Vev no lo mandan) → por slot salía vacío. `/v1/stats/recent` devolvía 500.
  2. **Puente (base-api → colector):** todo el home de Commerce pide al colector **por sponsor**
     (`sponsor_id` = brand). **El publisher no ve nada**, por diseño del puente, no por falta de datos.
  3. **Webapp:** «My campaigns» pinta «Campaign #9 · Running», presupuesto 0 y estado fijo, sin
     cruzar con el micro. No existe ninguna vista de analytics por campaña ni por slot.
  4. **Vev:** la página publicada no tiene `<title>` → `content_title` vacío; y los elementos
     automáticos de la SDK (p. ej. el detalle de producto) se registran como `detail-1` / «Detail 1»
     sin el nombre de la página, porque la página de Vev no declara `data-vio-scope`.

## 2. Contrato (lo que cada frente implementa)

### 2.1 Colector — [vio-analytics#19](https://github.com/vio-live/vio-analytics/pull/19) (hecho, pendiente de deploy)

Auth como el resto de `/v1/stats/*`: key de surface (`X-Api-Key`) **o** token interno + `?client_app_id=`.

- `GET /v1/stats/campaigns/summary?days=14` →
  `{ client_app_id, days, campaigns: [{ campaign_id, sessions, impressions, clicks, product_views, add_to_carts, purchases, gmv, slots, pages }] }`
  (solo eventos con campaña; `slots` = `location_id` distintos, `pages` = `content_url` distintos).
- `GET /v1/stats/campaigns/:campaignId/slots?days=14` →
  `{ client_app_id, campaign_id, days, slots: [{ location_id, content_url, content_title, content_id, sessions, impressions, clicks, product_views, add_to_carts, purchases, gmv, shown_products: [[product_id, name]…], sold_products: [[product_id, name]…] }] }`
  (agrupa por `location_id` × `content_url`; top 5 de productos por impresiones y por compras).
- `GET /v1/stats/recent` arreglado, con `location_id`, `sponsor_id`, `content_id`, `product_ids`, `product_names`.

### 2.2 Puente en base-api (svc-base-api)

> [claude/svc-base-api, 2026-10-19 noche] **En PR:** [vio-base-api#41](https://github.com/vio-live/vio-base-api/pull/41)
> (draft, 3 commits `2de839f` + `d2fa70e` + `2807d8e`, rebasada sobre `develop` `da6b056`). El traversal del comodín
> `/api/stats/*` que encontró la revisión ya está en develop vía [#40](https://github.com/vio-live/vio-base-api/pull/40).
> Suite unit 330/330, sqlite 8/8. Detalle en el [journal](../journal/2026-10/2026-10-19-base-api-stats-por-surface.md).
> Falta: Angelo pasa #41 a ready y mergea → QA.

Mismo patrón que `handoff/analytics-stats-bridge.md` (token interno del colector solo en servidor,
`range` → días: `24h`→1, `7d`→7, `14d`→14, `30d`→30). Autorización contra la base compartida
(entidades del kernel `Surface` / `SurfaceCampaign`), con el usuario de la sesión de Commerce:

- `GET /api/stats/surfaces/:surfaceId/campaigns?range=14d` → colector `campaigns/summary` con
  `client_app_id = surfaceId`. Permitido si `surface.publisher_user_id` es el usuario de la sesión;
  si no, 403 (las brands siguen con los endpoints por sponsor que ya existen).
- `GET /api/stats/surfaces/:surfaceId/campaigns/:campaignId/slots?range=14d` → colector
  `campaigns/:id/slots`. Misma regla, y la campaña tiene que ser de esa surface (si no, 404).
- Passthrough del JSON del colector (sin renombrar), errores del colector → 502 con cuerpo
  `{ error }`; sin token configurado → 503 como el puente actual.

### 2.3 Webapp (front-commerce)

- **Home, tarjeta «Active campaigns»** (publisher y brand): campañas del micro (`GET /campaigns` +
  `GET /client-apps` + `GET /sponsors`) con estado `active` y `scheduled`: nombre, surface, sponsor
  principal, ventana, estado; y cruzadas por `campaign_id` con las cifras del rango elegido en el
  header: para el publisher `GET /api/stats/surfaces/:id/campaigns` (una llamada por surface); para
  la brand lo que ya trae `GET /api/stats/campaigns` (revenue/units). Columnas: vistas, clics,
  compras, importe, slots, artículos. Sustituye al bloque «My campaigns» (presupuesto, pacing, ROAS
  y `status: live` fijo se retiran: son 0 por diseño). Enlaces a `/campaigns/:id`, no a `/channels`.
- **Detalle de campaña, tarjeta «Performance»** (`CAMPAIGNS_V2`): tabla por slot con
  `GET /api/stats/surfaces/:surfaceId/campaigns/:id/slots` cruzada con los nombres legibles de
  `GET /client-apps/:surfaceId/slots` (`displayName`): slot, artículo (título o URL), vistas, clics,
  vistas de producto, carritos, compras, importe, productos mostrados y vendidos. Selector de rango.
- Estados: cargando, error del puente (503/502) **visible** (hoy el home calla), vacío («sin tráfico
  en el rango»). Mocks en `src/mocks/stats.js` para local. Tests de los helpers puros (join y
  formateo) en `test/`. Arreglos de paso: «Views vs clicks» no está en miles; el texto «last 14
  days» del gráfico debe seguir al rango.

### 2.4 Vev (después, pequeño)

- Declarar en la página `data-vio-scope` (id de la página de Vev) y `data-vio-scope-name` (su
  título) desde Vio Config, para que los elementos automáticos de la SDK salgan como
  `<página>-detail-1` / «Detail 1 · <título>» y `content_id` sea estable por artículo.
- Si `document.title` está vacío, mandar el nombre de la página de Vev como `content_title`.

## 2.5 Datos estándar del evento y comprador (pedido de Angelo, 19/10 tarde)

«Deberíamos trackear el método de pago, el usuario que completó la orden, el dispositivo y toda esa
data estándar» y «cada componente del artículo: tipo, clics, vistas; qué producto funcionó mejor».
Decisión sobre el comprador: **identificador sí, dato personal no**.

- **Colector** — [vio-analytics#20](https://github.com/vio-live/vio-analytics/pull/20) (hecho, sobre #19):
  dispositivo, SO y navegador derivados del User-Agent en la ingesta; país de la cabecera del proxy;
  bloque opcional `client` (idioma, referrer, utm_*, pantalla, tz); `commerce.buyer_id`; en `minimal`
  se descartan comprador, referrer, utm, pantalla y tz. Lecturas: `kind` del componente en `slots`,
  `GET /v1/stats/campaigns/:id/products` (ranking de productos) y `…/breakdown?by=payment_method|
  device_type|os|browser|country|language|utm_*`; `buyers` en el resumen. 17 columnas nuevas con
  `ALTER … IF NOT EXISTS` al arrancar.
- **shopcart** (svc-shopcart, en curso): `buyerRef` = HMAC-SHA256(email normalizado, `BUYER_REF_SECRET`)
  en las respuestas del checkout que lee la SDK tras pagar. Variable nueva en QA (`.env.local`) y prod
  (Secret `env-sc-shopcart`): Miguel. Nada se persiste; el email sigue solo en la orden.
  > [svc-graphql, 2026-10-19] El campo se llama `buyer_ref` (snake_case) desde el commit `0b0e11a`.
- **gateway `graphql`** (svc-graphql, commit local `c852877` en `feat/buyer-ref-en-checkout`, sin PR):
  `buyer_ref: String` en `GetCheckout`/`CreateCheckout`/`UpdateCheckout` y en los resultados de
  `ConfirmPaymentApplePay`/`ConfirmPaymentGooglePay`/`ConfirmPaymentKlarnaNative`; passthrough, `''` si
  shopcart no lo manda ([journal](../journal/2026-10/2026-10-19-graphql-buyer-ref-en-checkout.md)).
- **SDK web 0.25.0** (en curso): bloque `client` por evento; `componentTemplateId` en todos los
  elementos (`product-card`, `product-carousel`, `product-grid`, `product-detail`); `buyer_id` desde
  `buyerRef`; `kind` en cada location del manifest. Publica Angelo; rebundle en Vev.
- **Micro + kernel** (pendiente de OK de Angelo): columna `surface_slot.kind` (nullable) y `kind` en el
  manifest, para que el dashboard enseñe el tipo sin deducirlo del id. Mientras, el colector lo deduce
  (`card-…`, `carousel-…`, `detail-1`).
- **Dashboard** (después): tarjeta de audiencia y pagos en el detalle de campaña con esos desgloses y el
  ranking de productos.

## 2.6 Estado (actualizado 19/10 18:40 UTC)

| Frente | Estado |
|---|---|
| Colector | `main` = `1f86b76` **desplegado en staging** por Miguel (lecturas por campaña/slot/producto/desgloses, `kind` normalizado). Fase A de ADR-0035 (lecturas por surface/brand con `from/to`) en curso |
| graphql | #28 (`buyer_ref`) y #29 (sin credenciales en logs) en develop → QA |
| base-api | #40 y #41 en develop → QA (puente del publisher). Fase A (proxy genérico por surface) en curso |
| webapp | #65 en develop → staging. Fase A (filtros, Recharts, home por surface, detalle avanzado) en curso |
| shopcart | #93 en develop → QA (`buyer_ref`, email del proveedor al checkout). Fase B (atribución al crear la orden) en curso |
| package-database | #21 (`kind`) y #23 (atribución + `publisher_commission_pct`) en develop; kernel **1.0.277** publicado; **migración de atribución aplicada en QA por Miguel** (17:34 UTC); bumps 1.0.277 en los 12 micros (campaigns relanzado 18:30 UTC) |
| campaigns micro | #21 (`kind`) en develop → QA (imagen 26, 16:27 UTC); `kind` verificado en Commerce con la página de Angelo (3 cards) |
| SDK web | #85 (0.25.0) en `main`, **sin publicar en npm por decisión de Angelo (al final)** |
| Vev | #69 (bundle 0.25.0 + kind) y #70 (página, tipo en todos los eventos, productos mostrados, `buyer_id`) en main; paquete desplegado (0.335, 18:35 UTC). Nota: el detalle automático pasa de `detail-1` a `<página>-detail-1` |
| Verificado en QA | página `bohus-demo` con 0.25.0: eventos con tipo, dispositivo (escritorio/macOS/Chrome), idioma; funnel campaña 9; `kind=card` en Commerce |
| Coordinación | canal [`2026-10-19-coordinacion-claude-miguel.md`](./2026-10-19-coordinacion-claude-miguel.md) activo; Miguel con permiso de Angelo para QA/staging |

## 3. Orden y deploys

1. Colector #19 → **Miguel** despliega staging (y prod cuando toque). Sin esto, los puntos 2 y 3
   no tienen datos por slot.
2. base-api (PR a develop → QA) y webapp (PR a develop → staging) en paralelo, con revisión antes
   del merge. La webapp degrada bien si el puente aún no existe (tarjeta con aviso, no en blanco).
3. Verificación con la prueba de Angelo (campaña 9 y la segunda campaña/artículo), después prod.

## 4. Fuera de alcance ahora

Presupuesto/pacing/ROAS (no hay modelo de inversión), analytics para la brand por slot (hoy por
sponsor), limpieza de slots huérfanos, vista de artículos por campaña en el micro.
