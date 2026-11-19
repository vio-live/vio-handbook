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

## Decisions

## Blockers
- Siguen los del 18/11: H auto a 0 px en el editor de Vev, frases de prod para la postback de Circlewise, compra de 39 kr y precios de Black Week de Kondomeriet.

## Next session
