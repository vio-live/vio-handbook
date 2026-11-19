---
date: 2026-11-19
session: Kondomeriet × VG Black Week, día 2
participants: [angelo, claude]
status: live
---

# Kondomeriet × VG Black Week — 19/11

Sigue de [2026-11-18-kondomeriet-black-week-prod](2026-11-18-kondomeriet-black-week-prod.md).

## Goal
Lo pendiente del 18/11 («Next session») y la guardia de Alan en la #491.

## Done
- 10:45 UTC: la foto del CDN se sigue regenerando (`last-modified` 10:44).
- Alan (#491, 22:10–22:15 UTC del 18/11) cerró «Vipps Hurtigkasse opens in». En editableCSS solo podía cambiar la fuente del nombre. Arreglado en [vev#117](https://github.com/vio-live/vev/pull/117), que añade `font-family`/`font-weight` a todas las entradas de texto de la tarjeta. Desplegado en los dos paquetes (`cq1lXld-TA9`, `c5CIrrzXoMb`) y comprobado en el editor: en Style → Text sale una fila de fuente por elemento. Contestado a Alan en la tarjeta.
- Hoja de productos de Michael (Kondomeriet añadió 4 el 18/11): Xtensity 15 %, Klitty 20 %, Alpha Surge 50 % y Womanizer Liberty 2 29 %. La fila «Generell landingsside» no es un producto. En verde, los más vendidos: Julekalender (nº 1), Womanizer Snap, Corrida, Xtensity y Klitty.
  - Los 4 existen en kondomeriet.no, pero **no están en el canal 486** (31 productos). Para que entren hay que buscarlos en el catálogo de Kondomeriet en Vio (feed), publicarlos y añadirlos a la colección `KHBq619Se` y a la compartida 611. Eso es lectura y escritura en prod, y espera las frases de Angelo.
  - [vev#118](https://github.com/vio-live/vev/pull/118), desplegado en los dos paquetes: añade el rabatt y el `ref1` de los 4 nuevos y el 27 % de Womanizer Duo 2, que faltaba en el mapa.
  - Los 31 productos del canal tienen `compare_at` 0. La web ya vende, por ejemplo, el Snap a 998 kr (−25 %), así que el precio anterior aún no llega a prod: products#67 y google-merchant-feed#7 solo están en develop.
- **Los 4 productos nuevos, en el canal de VG** (12:20 UTC, con las frases de Angelo de leer y escribir en prod). Son 7 productos: Xtensity 411330, Klitty 410906, Alpha Surge 410308 y los cuatro colores de Womanizer Liberty 2 (411292, 411295, 411297, 411300). Los packs regalo de Liberty y el Alpha Surge Stamina quedan fuera.
  - Estaban en borrador y sin clase de envío. `bulk-publish` falla con «Can't publish without shipping class».
  - Pasos, todos por los micros desde el pod de products:
    - `POST /shipping/join-product` con «Frakt» (`47d45020…`, la única de Kondomeriet, que llevan los 34 de la colección);
    - `PUT /bulk-publish`;
    - `POST collections/collectionItem/add/multiple` a `KHBq619Se`, que copia a VG como custom-product por la compartida 611;
    - `POST /channel-process/collections/update`.
  - Comprobado: el GraphQL del canal 486 da 38 productos (31 + 7), con los precios de la web, y las imágenes `medium` responden 200.
  - Orden correcto para la próxima vez: envío, publicar y después añadir. Aquí se añadió antes de publicar y hubo que volver a proyectar.

- **Precios de Black Week calculados con el % de la hoja** (11:40 UTC; decisión y OK de Angelo, en la base de datos).
  - Products#69 y google-merchant-feed#8 ya estaban en prod desde el 18/11 (~15:00 UTC). El feed de Kondomeriet no trae `sale_price` para ninguno de nuestros productos (solo para packs regalo de Liberty que no están en la campaña), y su web dice «Kampanjen "Black Week 2026" er for øyeblikket ikke aktiv»: los precios actuales son los normales.
  - Escritos 40 productos de la colección (todos salvo el llavero 410659), en una transacción con guarda sobre el precio anterior: `price_compare_at` = precio actual, `price_amount` = `public_price` = precio × (1 − %), redondeado a la corona. Ejemplos: Blowcast Pro 1419→568, Premium 2 1999→1359, Duo 2 2099→1532, Snap 998→749, Alpha Surge 1849→925, Liberty 2 1149→816.
  - Solo en `product`: la copia de VG (`custom_product`) solo sustituye título, descripción, sku y código de barras (`product.service.ts:1826`), así que el canal toma el precio del producto.
  - Después: proyección de `KHBq619Se`, 6 claves del canal 486 borradas en el Redis de api, y la foto del CDN regenerada (11:41:16) con los precios nuevos. GraphQL con y sin caché: 37 de 38 con tachado.
  - El editor pintó 1999 durante unos minutos: la respuesta GET lleva `stale-while-revalidate=300` y el navegador sirvió la copia vieja mientras revalidaba. Tras recargar: 1359 en rojo, 1999 tachado.
  - Se deshace solo: el feed vuelve a escribir precio y precio anterior de un producto cuando Kondomeriet lo cambia en su feed (incluido un cambio de stock). Cuando activen su Black Week, ganan sus precios reales.
  - Ojo: hasta entonces su Vipps Hurtigkasse cobra el precio normal. El artículo de VG no debe salir antes.
  - La copia de productos que guarda cada tarjeta en sus props (`group.snap`) sigue con el precio viejo hasta que alguien abra sus propiedades en el editor. En el primer pintado esa copia va antes que la foto del CDN, así que un lector sin caché puede ver un instante el precio viejo.

## Decisions
- Angelo, 19/11: el precio de Black Week se calcula con el % de la hoja y se escribe en la base de datos. Sustituye a la regla del 18/11 «nunca se deduce un før-pris de un %».

## Blockers
- Siguen los del 18/11: H auto a 0 px en el editor de Vev, frases de prod para la postback de Circlewise, compra de 39 kr y precios de Black Week de Kondomeriet.

## Next session
