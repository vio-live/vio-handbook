---
date: 2026-10-28
session: promesas de marca, envío y opciones de la ficha
participants: [angelo, claude]
status: live
---

## Goal

Llevar a QA lo iterado en la página local de la SDK para el artículo de Mote & Livsstil × Careless, con todo
configurable para Replit y Vev, y pasar al backend lo que era dato de la marca: sus promesas y el logo de cada
tarifa.

## Done

- **SDK** [vio-web-sdk#108](https://github.com/vio-live/vio-web-sdk/pull/108) en `main` (`68e02e5`), sin publicar.
  - Ficha: galería en carrusel con bolitas, orden único con tallas primero, «Beskrivelse» con vista previa,
    franja de promesas, «Frakt & retur» por transportista con plazo y logo o icono, y cierre deslizando desde
    cualquier punto (también en carrito y checkout).
  - Tarjetas: lista, descripción propia y barra «Kjøp» de Vev.
  - Todo es opción por atributo o por `applyVioTheme`; ver README → *Options … (0.32)* y CHANGELOG → Unreleased.
- **Vev** [vev#74](https://github.com/vio-live/vev/pull/74) mergeado: descripción en la tarjeta. Sin `vev deploy`.
- **Plazo de entrega:** ya existía en Commerce. `shipping.description` trae «Leveringstid 1-5 dager» en las dos
  tarifas de Careless en prod (Helthjem 59 y Bring 79). La SDK lo lee; no hizo falta backend.
- **Backend:**
  - Kernel [package-database#30](https://github.com/vio-live/package-database/pull/30), migración
    `BrandHighlightsShippingLogo1792800000000`: `brand_profile.highlights` json y `shipping.logo_url`.
  - Aplicada en QA desde el pod de users con
    [`m-promesas-envio-qa.js`](../../handoff/assets/2026-10-28-promesas-y-envio/m-promesas-envio-qa.js). Es
    idempotente (comprobado con una segunda pasada) y cargó las promesas de Careless 1338.
  - Release: push → 1.0.286 (el freno de migraciones paró el despacho) → `pkg=all` → **1.0.287**, con los bumps
    a los 12 micros en verde.
  - Servicios: campaigns [#29](https://github.com/vio-live/vio-campaigns-microservice/pull/29) (el bootstrap
    lleva `highlights`), products [#38](https://github.com/vio-live/vio-products-microservice/pull/38)
    (`logoUrl` en tarifas), api [#74](https://github.com/vio-live/vio-api-microservice/pull/74) y graphql
    [#34](https://github.com/vio-live/graphql/pull/34) (`ProductShipping.logo_url`).
  - Dashboard [webapp#85](https://github.com/vio-live/webapp-vio-commerce/pull/85): Settings → Brand →
    Promises y logo por tarifa en Settings → Shipping.
  - Todo mergeado en develop y desplegado en QA, con pods sanos y 0 `Unknown column`.
- **Verificado en QA:**
  - El bootstrap de 1338 trae las 3 promesas y la ficha las muestra sin que la página las pase.
  - El gateway acepta `logo_url`.
  - La consulta de tarifas sin `shipping_country`, que daba «Cannot return null for … ProductShipping.name», ya
    responde. Tenía dos causas:
    - en graphql, la clave de caché no incluía los campos pedidos;
    - en api, las filas de `product_shipping` solo se aplanaban si se pedían precios.
- **Replit:** texto con las opciones generales y el look aprobado en
  [handoff/2026-10-15](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md) (`991019b`).

## Decisions

- Las promesas son de la marca y las escribe ella en el dashboard. La página solo las sobrescribe si quiere.
- La descripción del producto viene del producto o del listing. Replit puede reescribirla por artículo
  (`descriptions`); no va a backend.
- El logo del transportista va como campo por tarifa (`shipping.logo_url`).
- La SDK pide `logo_url` con respaldo: un gateway sin el campo se consulta otra vez sin él, una vez por página.
  Así un SDK nuevo contra prod viejo no pierde las tarifas.

## Prod (28/10, noche)

- SDK **0.32.0 publicada en npm** por Angelo (lleva 0.30 y 0.31, que no se publicaron). Carrito por conexión en
  [vio-web-sdk#110](https://github.com/vio-live/vio-web-sdk/pull/110), en `main`, sin publicar (irá en 0.33).
- Migración en la base de prod con `m-promesas-envio-prod.js` (corregido a `/usr/src/app/.env`, que es el de prod).
  Idempotencia comprobada. La base ya tenía 1792600000000 y 1792700000000.
- Release a prod: ramas `release/promesas-y-envio-prod` desde la rama de prod con `cherry-pick -x` de los bumps
  1.0.285 y 1.0.287 y del cambio. Los archivos del cambio quedan idénticos a develop y los `yarn.lock` sin restos de
  1.0.282.
  - campaigns [#30](https://github.com/vio-live/vio-campaigns-microservice/pull/30)
  - products [#39](https://github.com/vio-live/vio-products-microservice/pull/39)
  - api [#75](https://github.com/vio-live/vio-api-microservice/pull/75)
  - graphql [#35](https://github.com/vio-live/graphql/pull/35)
  - webapp [#86](https://github.com/vio-live/webapp-vio-commerce/pull/86)
- Comprobado: deploys verdes, pods sanos, 0 `Unknown column` y Vercel verde. Por la API pública de prod, el gateway
  acepta `logo_url` y la consulta sin `shipping_country` ya responde. Careless (1327) todavía no tiene promesas:
  las pone desde el dashboard.
- Hallazgo: la campaña por defecto de la surface de M&L en prod es «Careless Aller (test)» (id 1, channel 480), que
  **termina el 29/10 a las 23:17 UTC**. La real es «Careless» (id 2, channel 482). En análisis.

## Blockers

- **Prod:** hecho (ver arriba). Orden obligatorio:
  1. migración en prod con
     [`m-promesas-envio-prod.js`](../../handoff/assets/2026-10-28-promesas-y-envio/m-promesas-envio-prod.js),
     que no carga promesas;
  2. después, los micros con el kernel 1.0.287, que si no fallan con `Unknown column`.
- **Logos oficiales de Bring y Helthjem:** no hay fuente oficial a mano. Los sube la marca en Settings → Shipping
  cuando los tenga.
- **Pendientes de otros:**
  - En `main` de la SDK fallan 2 tests de Klarna `buyer_ref`, sin relación con este cambio (tarea aparte).
  - graphql: `getFieldSelection` ignora fragments y `RemoveProductsCache` no borra nada (anotado en el PR #34).

## Next session

- Publicar la SDK (Angelo) y pasar el texto a Replit.
- Prod: migración + despliegue, con frase explícita.
- Que Careless ponga sus promesas en prod desde el dashboard.

## Noche: varias campañas (Villoid, QRK) y segunda tanda a prod

- **Campaña por defecto de M&L en prod:** la de test (1, canal 480) estaba activa y por defecto, contra lo que decía
  el checklist B9. Lectura de prod: el pedido 4129 cayó en el canal 482 con la campaña 2, y de los 41 carritos desde
  el 26/10, 38 son del 482 y 3 del 480. Escrito en prod (con OK de Angelo): la 1 pausada y sin default, la 2 por
  defecto. En el origen, campaigns devuelve 2/482 y solo la 2; el proxy de Replit lo tenía en caché.
- **Decisiones de Angelo:** un artículo = una campaña = un canal = un sponsor; no hay carrito multi-marca. Se trabaja
  solo con Vipps. Una campaña que termina deja de vender. Careless no tiene fecha de fin; las nuevas sí la tendrán.
  QRK lleva un 10 % de comisión. Las unidades de Vipps de Villoid y QRK las pide Angelo. Villoid ya instaló la app de
  Shopify y faltan sus productos.
- **SDK:**
  - [#111](https://github.com/vio-live/vio-web-sdk/pull/111): la key sale del canal de la campaña y el carrito
    recuerda su canal. La campaña del pedido es la del sponsor, el bootstrap se refresca a los 5 minutos al volver a
    la pestaña, y el plazo deja de mostrar textos de relleno.
  - Release **0.33.0** ([#112](https://github.com/vio-live/vio-web-sdk/pull/112)), con #110 y #111, sin publicar
    todavía (la publica Angelo).
  - En QA, el carrito de Careless 1338 quedó en el canal 513 y lo recuerda.
- **shopcart** [#113](https://github.com/vio-live/vio-shopcart-microservice/pull/113): la campaña del pedido solo
  puede ser de la marca que vende; si no, la de esa marca en su canal; si no hay, null.
- **Plazo de entrega:** el dashboard lo edita
  ([webapp#87](https://github.com/vio-live/webapp-vio-commerce/pull/87)) y en products un `""` lo vacía
  ([#40](https://github.com/vio-live/vio-products-microservice/pull/40)).
- **extensions** [#52](https://github.com/vio-live/vio-extensions-microservice/pull/52): ningún log imprime
  credenciales de tienda.
  - TypeORM tenía `logging: true` e imprimía cada SQL con sus parámetros: en QA salían unas 3.000 líneas en 2 horas
    con tokens de Shopify reales.
  - Tras el despliegue, QA y prod dan 0 tokens, 0 parámetros y 0 claves Woo en los pods nuevos.
  - El pod viejo de prod tenía 883 líneas con parámetros, pero ningún token en lo que aún guardaba.
  - **Decisión de Angelo (28/10):** no se rotan tokens ni se purga el histórico de logs.
- **Segunda tanda a prod** (ramas `release/canal-y-logs-prod`, con cherry-pick y deploy verde):
  - extensions [#53](https://github.com/vio-live/vio-extensions-microservice/pull/53)
  - shopcart [#114](https://github.com/vio-live/vio-shopcart-microservice/pull/114)
  - products [#41](https://github.com/vio-live/vio-products-microservice/pull/41)
  - webapp [#88](https://github.com/vio-live/webapp-vio-commerce/pull/88)
- **Reportes por campaña** (`~/vio-reportes/mote-livsstil/`):
  - Una configuración por campaña, plantilla para Villoid y QRK, y la key fuera del código.
  - **Limitación:** usuarios, clics, carrito y «til kassen» son de toda la surface, porque el colector, con la key
    pública, no da el embudo por campaña. Hace falta acceso interno antes de que Villoid y QRK estén en vivo.
- **Pendiente de Villoid y QRK:** su canal de Aller (solo su colección), su campaña con fechas (QRK al 10 %), su
  perfil de marca (logo, condiciones, devoluciones, promesas), sus tarifas con plazo, y la unidad de Vipps de cada
  una.
- **SDK 0.33.0 publicada en npm** (21:31 UTC, shasum `f47d742…`, la de `main`). El texto final para Replit está en el
  handoff de Replit.
- **Promesas de Careless en prod** (brand 1327, con OK de Angelo): las tres de careless.no (plane / heart / shirt),
  cargadas en `brand_profile.highlights` sin pisar nada (estaba vacío). El bootstrap de prod ya las sirve. La marca
  las edita en Settings → Brand → Promises.
- **Logos de transportista de Careless en prod** (OK de Angelo):
  - Los SVG oficiales salen de bring.no (el logo del menú, embebido en su CSS) y de helthjem.no
    (`/next-assets/images/hh_logo.svg`). Su SHA-256 coincide con el que sirve cada web.
  - Subidos a `containerproductionsc/reachu-uploads-production/carriers/{bring,helthjem}.svg` y servidos por
    `https://container.vio.live/reachu-uploads-production/carriers/…`. Cloudflare tuvo cacheado ~3 min el 404 de la
    comprobación previa. Copia en `handoff/assets/2026-10-28-promesas-y-envio/carriers/`.
  - Puestos como `shipping.logo_url` en las dos tarifas de Careless (1327), solo donde estaba vacío. La API de prod
    (`ProductShipping.logo_url`) ya los devuelve con «Leveringstid 1-5 dager». Otras marcas que usen Bring o Helthjem
    pueden reutilizar las mismas URLs.

## Madrugada 29/10: orden de la ficha, seguimiento por layout y Vipps del carrito

- **Origen:** pedido de Replit: un editor arrastrable del orden de la ficha y comparar resultados por layout.
  Angelo: «construyelo ya».
- **SDK:**
  - [#113](https://github.com/vio-live/vio-web-sdk/pull/113): `Vio.configureDetail({ layout })` y la propiedad
    `layout`, que reordena el DOM. Se puede leer lo aplicado con `appliedLayout`, `Vio.detailLayout()` y el evento
    `vio:detail-layout-applied`. El layout viaja en `context` del `view_item` y en cada línea de los eventos con items
    (`experiment_variant_id`, porque `variant_id` de línea es la variante del producto).
  - [#115](https://github.com/vio-live/vio-web-sdk/pull/115): el botón de Vipps paga con Express el carrito entero de
    la marca, en el carrito y en la ficha si ya hay líneas, con la nota «Betaler hele handlekurven · n varer · total».
    Con `vippsCartPayment: 'checkout'` se vuelve al comportamiento anterior.
  - **0.35.0 publicada en npm** por Angelo (shasum `31cfab8…`). Incluye la 0.34.0, que no se publicó suelta.
- **Colector:** [vio-analytics#37](https://github.com/vio-live/vio-analytics/pull/37) (`229db19`) con 8 columnas por
  `ensureSchema` y `layout-funnel` por surface y campaña. La compra confirmada se cruza por `checkout_id` y producto.
  **Falta que Miguel lo despliegue** (canal de coordinación, `fd41315`).
- **Dashboard:** base-api [#56](https://github.com/vio-live/vio-base-api/pull/56) y
  [#57](https://github.com/vio-live/vio-base-api/pull/57) (los filtros siguen la regla de tokens de la SDK) y
  webapp [#89](https://github.com/vio-live/webapp-vio-commerce/pull/89). En QA: Angelo pidió encender QA de
  madrugada y lo encendí (`az aks start`). Prod, cuando el colector esté desplegado.
- **Replit:** texto 0.35.0 entregado a Angelo en el chat (orden, seguimiento, experimentos, analítica y Vipps del
  carrito). Los experimentos los asigna Replit; la SDK solo los transporta.
- **Colector `229db19` en staging y prod** (Miguel, 00:15 UTC; ver su journal del 29/10). Con eso, **dashboard a
  prod**:
  - base-api [#58](https://github.com/vio-live/vio-base-api/pull/58): 393/393 en la rama de release, deploy verde y
    4 pods Running;
  - webapp [#90](https://github.com/vio-live/webapp-vio-commerce/pull/90): Vercel verde.
  - La tabla por layout ya está en prod; tendrá filas por layout cuando Replit use la 0.35.0.
- **El token de lectura** se lo pasó Miguel a Angelo por privado. Falta guardarlo en `~/.vio/analytics-prod.env` para
  los reportes por campaña.
- **`claude_ro`** necesita recrear `vio-clickhouse-1` en prod: lo decide Angelo, a pregunta de Miguel.

## 29/10: feedback de Aller, revisión de los bloques de Replit y SDK 0.36.0

- **Feedback de Aller:** «Produktbeskrivelse» cerrada bajo el precio, la talla en la tarjeta y un botón de checkout
  de la tarjeta que no se entendía.
  - Se resuelve con el orden de secciones y `description-mode: folded`, más la opción nueva `descriptionLabel`
    ([vio-web-sdk#117](https://github.com/vio-live/vio-web-sdk/pull/117)).
- **Promesas de la marca también en el carrito**
  ([#117](https://github.com/vio-live/vio-web-sdk/pull/117), módulo compartido `src/ui/highlights.ts`).
- **Envío en el carrito** ([#118](https://github.com/vio-live/vio-web-sdk/pull/118)): «fra» mientras no haya tarifa
  elegida entre varias, y el aviso «Frakt velger du i Vipps eller i neste steg.».
- **SDK 0.36.0 publicada** ([#119](https://github.com/vio-live/vio-web-sdk/pull/119)). Un primer `npm publish` dio
  404 por la sesión de npm; con `npm login` salió.
- **Revisión de la copia de Replit** (`mote-livsstil-hub-vio.replit.app`, conectada a **prod**, visitada con
  `?vio_internal=1` y sin carrito):
  - Ya usan la SDK nueva, con el desplegable en la tarjeta y las tallas en la tarjeta.
  - Las tallas de la tarjeta salen desordenadas (orden de variantes en vez de `product.options`).
  - La descripción de la tarjeta se abre entera, sin saltos de línea.
- **Seguimiento de botones (`cta_click`, `Vio.trackCta`):** SDK, colector y dashboard en curso, para la 0.37.0.
  Contrato: `cta`, `cta_location` (detail · cart · card · checkout · block · host), `cta_label`, `cta_variant` y
  `option_value`.
- **Texto para Replit:** entregado a Angelo en el chat, con la configuración de la ficha, las correcciones de los
  bloques y dónde va cada `trackBlockCta`, protegido hasta la 0.37.
- **SDK 0.37.0 publicada** (seguimiento de botones, [#122](https://github.com/vio-live/vio-web-sdk/pull/122)).
  Colector `89f2766` desplegado en staging y prod: `/v1/stats/surface/cta` da 401 sin token (antes 404).
  Dashboard de botones en prod: base-api [#60](https://github.com/vio-live/vio-base-api/pull/60) y webapp
  [#93](https://github.com/vio-live/webapp-vio-commerce/pull/93). Texto final para Replit (0.37.0) entregado a Angelo.
- **Aclarado con Miguel:** nada de esto toca vio-backend. El PR vio-backend#67 («tasas en porcentaje») no salió de
  esta sesión.

