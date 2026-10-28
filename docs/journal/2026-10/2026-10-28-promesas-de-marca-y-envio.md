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
