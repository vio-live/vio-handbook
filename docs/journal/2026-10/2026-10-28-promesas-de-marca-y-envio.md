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
  - **Decisión pendiente de Angelo:** rotar tokens y purgar el histórico de logs (Azure).
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

