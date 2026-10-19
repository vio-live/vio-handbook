---
title: "ADR-0035 — Analytics avanzado en el dashboard de Commerce: publisher (Aller) y brand"
date: 2026-10-19
status: propuesta
decides: angelo
---

# ADR-0035 — Analytics avanzado en el dashboard de Commerce

**Propuesta** (19/10 noche) a petición de Angelo tras la prueba real de slots: «en Aller, shoppable
views y product clicks están en 0; top selling con miniatura; en campañas una vista avanzada (vistas
de página, de componente, interacciones, productos, método de pago, de dónde compran, dispositivo…);
Aller por surface, por campaña, por channel y transacciones totales, luego su % de comisión; filtros
por surface y fechas; gráficos interactivos; y filtrar órdenes por surface y campaña activa o pasada».
Parte de lo ya hecho hoy ([ADR-0034 enm. 4](./0034-slots-en-web-y-vev-declaracion-por-pagina.md),
[handoff](../handoff/2026-10-19-analytics-por-campana-y-slot.md)).

## 1. Diagnóstico

- **Por qué Aller ve ceros.** Todo el home pide al colector **por sponsor** (`/api/stats/*` →
  `/v1/commerce-stats/*?sponsor_id=`). Un publisher no es sponsor de nada → 0. Hoy solo las dos rutas
  nuevas por surface (resumen por campaña y slots) le dan datos. Falta el resto: KPIs, serie temporal,
  top productos, contenido, canales.
- **Lo que el colector ya sabe por evento** (SDK web 0.25.0): surface, campaña, slot (`location_id`) y
  su tipo, artículo (`content_id`/`content_url`/`content_title`), sponsor, productos (`items`), pedido,
  método de pago, comprador (`buyer_id`, referencia), dispositivo / SO / navegador (del User-Agent),
  país (si el proxy lo manda), idioma, referrer y UTM de entrada, pantalla, zona horaria, sesión.
- **Lo que Commerce no sabe:** la **orden no lleva atribución**. `order` / `order_item` no guardan
  surface, campaña, slot ni artículo; solo analytics los une por `order_id`. Por eso hoy no se puede
  filtrar órdenes por surface o campaña dentro de Commerce ni calcular comisiones por campaña sin
  cruzar con ClickHouse.
- **La webapp no tiene librería de gráficos** (SVG a mano en `chart.jsx`) ni barra de filtros global.

## 2. Decisiones propuestas

### 2.1 Atribución en la orden (Commerce) — la pieza que falta

Al crear la orden, shopcart guarda la atribución que la SDK ya manda en el carrito (`origins[]` por
línea: campaña, slot, artículo) y lo que sabe del checkout:

- `order.surface_id`, `order.campaign_id` (la campaña del carrito; si hay varias, la de la primera
  línea pagada y el resto por línea), `order.content_url`, `order.content_title`, `order.payment_method`
  (ya existe `paymentProcessor`), `order.buyer_ref`.
- `order_item.campaign_id`, `order_item.location_id` (slot), `order_item.component_kind`.

Esto permite en Commerce, sin ClickHouse: filtrar órdenes por surface y campaña (activa o pasada),
transacciones totales por surface/campaña/channel, y **comisiones** (`campaign.publisher_commission_pct`
o por surface; se liquida sobre `order_item` atribuido). Cambios: package-database (migración; **OK de
Angelo**), shopcart (escribir en `createOrder`/`completeBaseOrder` desde `cart.origins`), orders (filtros
en `GET /orders` y en la lista del dashboard). Backfill de órdenes antiguas: desde analytics por
`order_id` (script único), donde exista.

### 2.2 Modelo de métricas (definiciones únicas, mismas en todas las vistas)

| Métrica | Definición |
|---|---|
| Vistas de página | sesiones con al menos un evento en el artículo (`content_url` sin query) |
| Vistas de componente | `component_impression` por slot (impresión visible) |
| Interacciones | `select_item` + `view_item` + `add_to_cart` + `begin_checkout` |
| CTR | clics / impresiones |
| Compras / pedidos | `purchase` por `order_id` único (los eventos partidos por campaña cuentan una vez) |
| Importe (GMV) | suma de `value` de `purchase`; AOV = GMV / pedidos |
| Conversión | pedidos / sesiones con impresión |
| Compradores | `buyer_id` únicos; recurrentes = con > 1 pedido en el rango |
| Desgloses | método de pago, dispositivo, SO, navegador, país, idioma, fuente (referrer / utm), artículo, slot, tipo de componente, producto |

«De dónde compran»: **país** necesita que el nginx de las VMs inyecte la cabecera de geolocalización
(o poner Cloudflare delante de `events*.vio.live`); mientras, se enseña «origen» = referrer/UTM y
artículo. Ciudad no se guarda (privacidad).

### 2.3 Vistas por rol

**Publisher (Aller)** — alcance: sus surfaces.
- **Home**: barra de filtros global (surface, campaña, channel, rango de fechas con presets y
  personalizado; en la URL). KPIs reales por surface (vistas de página, impresiones, clics, pedidos,
  GMV, conversión, compradores), serie temporal interactiva (vistas/clics/pedidos/GMV, hover, zoom
  por arrastre, clic en un punto filtra el día), **Active campaigns** con cifras, **por surface / por
  campaña / por channel** (tabla con pedidos, GMV, AOV, % del total; clic → detalle), **top productos
  con miniatura** (imagen del catálogo por `product_id`), **transacciones totales** del rango. Más
  tarde: columna «comisión» (% y €) cuando exista 2.1.
- **Detalle de campaña**: cabecera (estado, ventana, sponsor, channel, surface, **ajustes** editables
  por el publisher: ventana, pausa, sponsor/channel, slots del dashboard); funnel interactivo
  (impresiones → clics → vistas producto → carrito → checkout → pedido); serie temporal; **artículos**
  (URL/título: vistas de página, impresiones, pedidos, GMV); **componentes** (slot, tipo, artículo,
  impresiones, clics, interacciones, pedidos, GMV, productos mostrados/vendidos); **productos** (con
  miniatura: mostrado, clics, vistas, carritos, pedidos, unidades, importe); **compradores y pago**
  (método de pago, dispositivo, SO, navegador, idioma, país cuando haya, fuente de entrada; todos
  gráficos de barras/anillos con clic-para-filtrar); **pedidos de la campaña** (lista desde Commerce
  cuando 2.1 exista; hasta entonces, desde analytics: id, fecha, importe, método, artículo).
- **Órdenes**: filtros nuevos por **surface** y **campaña** (activa / pasada, con el estado del micro),
  además de los actuales. Requiere 2.1.

**Brand (sponsor)** — alcance: sus channels y las campañas que patrocina. Mismas tarjetas, filtradas
por channel/campaña; sin datos de otras brands de la misma surface; comisión no visible (ve su
ingreso neto cuando exista el modelo).

**Interno** — todo, con selector de cuenta.

### 2.4 Filtros

Una sola barra (componente compartido) que escribe en la URL (`?range=7d&from&to&surface=&campaign=&channel=`),
que todas las tarjetas leen. Fechas: presets 24h / 7d / 14d / 30d / 90d + rango personalizado
(máximo 365 días; el colector ya acota `days`). Surface y campaña solo para publisher/interno;
channel para todos. Los gráficos permiten **clic-para-filtrar** (un día, un método de pago, un
dispositivo) añadiendo el filtro a la barra.

### 2.5 Gráficos

Adoptar **Recharts** en la webapp (ya se usa en el dashboard antiguo de vio-backend; React, ligero,
accesible): líneas/áreas para series, barras apiladas para desgloses, anillo para proporciones,
funnel horizontal. Tooltips con las cifras exactas, leyendas clicables, exportar PNG/CSV por
tarjeta. Sustituye el SVG a mano de `chart.jsx`.

### 2.6 Lecturas nuevas del colector y del puente

Colector (todas por surface con key o token interno + `client_app_id`, y con `?campaign_id=`,
`?sponsor_id=`, `?from=&to=` además de `days`):
`/v1/stats/surface/overview`, `/v1/stats/surface/timeseries?metrics=`, `/v1/stats/surface/by-campaign`,
`/v1/stats/surface/by-channel` (sponsor), `/v1/stats/surface/content`, `/v1/stats/surface/products`,
`/v1/stats/campaigns/:id/timeseries`, `/v1/stats/campaigns/:id/content`, `/v1/stats/campaigns/:id/funnel`
(existe), `…/orders` (lista de pedidos atribuidos desde analytics). Los `breakdown`, `slots` y `products`
de hoy se mantienen y aceptan `from/to`.

base-api: un proxy único por surface con allowlist y ownership (`GET /api/stats/surfaces/:id/<path>`),
en vez de una ruta por lectura; brand: el puente por sponsor actual, con `from/to`.

Miniaturas: la webapp resuelve `product_id` → imagen con el catálogo (products micro / GraphQL,
caché en memoria por sesión); el colector no guarda imágenes.

### 2.7 Ajustes de campaña

Los controla el **publisher** (Aller): crear, ventana, pausa, sponsor principal y secundarios,
channel, slots del dashboard, % de comisión (cuando exista). La brand ve su campaña en lectura y
gestiona solo su channel/colecciones. Interno todo. Se refleja en la matriz de acceso de la webapp y
en el micro (ya separa publisher y brand).

## 3. Plan por fases (con agentes, revisión independiente antes de cada merge)

| Fase | Entregable | Repos | Días (estimación) |
|---|---|---|---|
| **A** (primero) | Aller sin ceros: KPIs, serie, top productos (con miniatura) y por campaña/channel **por surface**; barra de filtros (surface + fechas) en URL; Recharts; detalle de campaña avanzado (funnel, artículos, componentes, productos, pago/dispositivo/idioma/fuente); interactividad básica | colector, base-api, webapp | 2–3 |
| **B** | Atribución en la orden (2.1): migración, shopcart, orders; filtros de órdenes por surface/campaña; transacciones totales y por channel desde Commerce; pedidos en el detalle de campaña | package-database, shopcart, orders, webapp | 2–3 |
| **C** | Comisión del publisher: % por campaña/surface, liquidación sobre `order_item` atribuido, tarjeta «tu comisión» y export; permisos de ajustes de campaña | kernel, campaigns micro, orders, webapp | 2 |
| **D** | País (geo en nginx o Cloudflare), comparación con periodo anterior, exportes CSV, alertas simples; tiempo real (ADR-0033) | infra, colector, webapp | según prioridad |

Prod al final de cada fase, con sus migraciones delante.

## 4. Decisiones que necesita Angelo

1. **Atribución en la orden** (2.1): OK para añadir las columnas en package-database. Sin esto no hay
   filtros de órdenes ni comisiones por campaña dentro de Commerce.
2. **Comisión**: ¿% por campaña, por surface o por channel? ¿Se liquida sobre GMV bruto o neto de
   devoluciones? (Fase C; se puede decidir después de A.)
3. **País**: ¿Cloudflare delante de `events*.vio.live` (más simple, también protege) o GeoIP en el nginx
   de las VMs (Miguel)?
4. **Qué ve la brand** de una campaña compartida: solo lo suyo (propuesto) o también los totales de la
   campaña.
5. Orden de las fases: A → B → C (propuesto) o adelantar B si las órdenes por surface urgen más que
   los gráficos.
