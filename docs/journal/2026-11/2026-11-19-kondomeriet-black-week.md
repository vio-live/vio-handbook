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

## Medida de fotos (imágenes y foto de datos)

Medido el 19/11 hacia las 12:20–12:50 UTC con el arnés `knd-perf/vevhost` (host mínimo que carga el paquete como Vev). El bundle es el de `vev build` del paquete ligero en origin/main `5d4870d`. Perfil: móvil de gama media en 4G (150 ms, 1,6 Mbps, CPU 4×, DPR 2,625), bloque de 380 px, caché vacía salvo donde se indica. Datos reales de prod (canal 486). Tiempos en ms desde la navegación; 1–3 corridas.

### Números

| Medida | Valor |
|---|---|
| FCP / LCP (grid, foto del CDN, sin copia en props) | 220 / 1 860–1 920 |
| Tarjetas pintadas desde la copia de las props / desde la foto del CDN completa / desde una foto recortada | 1 377 / 1 585–1 715 / 1 375–1 391 |
| Foto del CDN (`snapshots/<hash>.js`) | 140 KB en crudo, 26 KB gzip; empieza a 1 130, termina a 1 420–2 460. Las descripciones son 75 KB del crudo; sin ellas y con 1 imagen por producto: 22 KB en crudo, 3 KB gzip |
| Precio viejo en pantalla con la copia de las props (grid) | 1 999 de 1 377 a 2 406 (~1 s); después 1 359 / ~~1 999~~ |
| Imágenes con la copia de las props | 21 peticiones y 247 KB: los nombres viejos de la copia y luego los nuevos del dato en vivo. La foto queda en blanco entre 160 y 240 ms al cambiar |
| Imágenes sin la copia | 11 peticiones y 125 KB |
| Imágenes de la 1.ª pantalla (4) | 7–25 KB `medium` JPEG; intrínseco 400×484 para 184 px × 2,625 = 483 px necesarios (el origen de Kondomeriet mide 400 px: ni `srcset` ni `large` darían más). `loading=eager`, `fetchpriority=high`, `decoding=async`, con width/height |
| Imágenes de debajo del pliegue | `loading=lazy`, pero Chrome las pide a la vez (margen perezoso de unos 1 250 px en 4G): 6 imágenes (~60 KB) compiten con las 4 de arriba, que tardan de 800 a 1 200 ms para 7–25 KB |
| Retenerlas 1,5 s (techo) | las 4 de arriba listas a 1 955–2 069 en vez de 2 346–2 377 (−400); LCP −100 (1 860 → 1 776) |
| WebP q80 sobre 5 `medium` reales | 72,5 KB → 44,9 KB (−38 %) |
| `medium` frente al original cuando el origen mide ≤500 px | `medium` pesa más (6 479 frente a 6 055 B): se recodifica en vez de copiar |
| Cabeceras de container.vio.live (imágenes) | `image/jpeg`, **sin `Cache-Control`**, ETag y Last-Modified. Cloudflare delante: HIT con `age` de 90 s; en la primera visita muchas salen REVALIDATED/MISS/EXPIRED (vuelta al blob de Azure). TTFB: HIT 0,24–0,28 s, REVALIDATED 0,35 s. Sin webp/avif ni Polish. El logo sí tiene `max-age=86400` |
| Ficha (Premium 2) | abre en 125 ms con la imagen grande ya pintada; las 13 imágenes listas a 1 007 ms. Las miniaturas usan `medium` (400 px) para 62 px de ancho |
| Segunda visita | todo desde la caché local; el GET de GraphQL lo sirve la caché HTTP del navegador (`stale-while-revalidate=300`) |

### Dos fallos de datos encontrados

1. **El gateway GraphQL sirve la primera respuesta vieja tras un cambio.** `ApiRestSdkChannelProductService.GetProductsByFilters`, con `useCache:true`, guarda una clave por combinación de ids, campos y tamaño (`…/all-items?…&select=`), sin caducidad. La devuelve y la refresca después en segundo plano (`setCacheResult`). Cada combinación sirve, por tanto, una o dos respuestas viejas después de un cambio.
   - Medido 50 min después de escribir los precios: Blowcast Pro solo devolvía 1 419 sin tachado en 2 de 12 GET.
   - En una corrida, una Product Card suelta (Snap) se quedó en 998 sin descuento toda la visita, y eso además se guarda 5 min en la caché local del lector.
   - Borrar `USER_CHANNEL_ID_486_KEYS` en el Redis de api no lo evita.
2. **La copia de las props (`group.snap`) gana a la foto del CDN** en el primer pintado (`kondomeriet-data.ts`: caché, después snap, después foto), aunque sea de antes de un cambio de precio o de nombres de imagen. Con la foto recortada no aporta velocidad: 1 377 frente a 1 375–1 391.

### Propuestas, por impacto en el lector

Solo nuestros bloques (vev):
1. **Foto del CDN primero; la copia de las props solo como respaldo** si la foto no llega en unos 600–800 ms o falla. Quita el precio viejo (~1 s), la doble descarga (247 → 125 KB) y el hueco de la imagen. Va unido a la propuesta 3, para no perder los ~210 ms. Archivos: `kondomeriet-data.ts` y `kondomeriet-photo.ts`. Riesgo bajo: si la foto falla, se pinta como hoy, con un poco de espera.
2. **Retrasar las imágenes de debajo del pliegue** hasta que estén las prioritarias, o con un IntersectionObserver de unos 200 px en vez del `loading=lazy` nativo. Las 4 imágenes de la primera pantalla −400 ms y el LCP −100. Archivos: `card-view.tsx` / `kondomeriet-card-view.tsx` (imagen de la tarjeta). Riesgo bajo.
3. *(campaigns, nuestro)* **Foto recortada:** sin `description` (guardando una línea `rating` para «★ 5/5 (792)») y con 1–2 imágenes por producto. 26 → 3 KB gzip; tarjetas −210 ms (1 585 → 1 375). Archivos: el generador de la foto en vio-campaigns-microservice y su lectura en `kondomeriet-photo.ts`. La ficha ya pide la descripción en vivo. Riesgo bajo.
4. **No servir GraphQL viejo de la caché del navegador:** `fetch(…, { cache: "no-cache" })` en el GET de los bloques, o en graphql `Cache-Control: no-cache` para el navegador y `CDN-Cache-Control: max-age=60, stale-while-revalidate=300` para el edge. Afecta a las vueltas antes de 5 min. Trivial.
5. **Miniaturas de la ficha con `thumbnail`** (150 px) en vez de `medium`: −60 % de bytes de la galería. Trivial.

Backend nuestro (graphql / products / api):
6. **Caducidad o invalidación de la caché del gateway** (fallo 1): una TTL corta en las claves de producto (por ejemplo `EX 120`), o invalidar las claves del canal cuando products cambia precio o stock (feed y escrituras a mano). Sin esto, el primer lector tras un cambio ve el precio viejo, y con Cloudflare delante (`s-maxage=60`) lo verían todos durante 1–6 min. Archivos: `ApiRestSdkChannelProductService.ts` y `RedisService.ts` (graphql). Riesgo bajo.
7. **`Cache-Control: public, max-age=31536000, immutable` en los blobs de imagen** al subirlos (los nombres no se reutilizan), más una pasada que lo ponga en los existentes (escritura en prod: necesita OK). Cloudflare y el navegador dejan de revalidar: −70–100 ms por imagen en edge frío y 0 peticiones en las vueltas. Archivos: la subida de variantes en products y base-api.
8. **Variantes WebP** al subir (sharp ya está) y `<picture>` en los bloques: −38 % de bytes de imagen. Más una pasada de relleno. Coste medio.
9. Si el origen mide ≤ el tamaño de la variante, **copiar los bytes en vez de recodificar** (−7 %). Menor.

Necesita a otros:
10. *(VG)* **Código en el `<head>`** de la página para pedir la foto y la primera imagen antes que el paquete. La foto empieza hoy a 1 130 ms, detrás del paquete; en el `<head>` empezaría en ~0 y la primera imagen podría estar antes de 1,2 s. Es la mayor ganancia que queda y está pendiente de la pregunta a VG.
11. *(Miguel, opcional)* Cloudflare Polish / Image Resizing como alternativa a la 8, según el plan.

No medido: el cambio de color en la ficha (solo la apertura), ni Safari/iOS.

## Decisions
- Angelo, 19/11: el precio de Black Week se calcula con el % de la hoja y se escribe en la base de datos. Sustituye a la regla del 18/11 «nunca se deduce un før-pris de un %».

## Blockers
- Siguen los del 18/11: H auto a 0 px en el editor de Vev, frases de prod para la postback de Circlewise, compra de 39 kr y precios de Black Week de Kondomeriet.

## Next session
