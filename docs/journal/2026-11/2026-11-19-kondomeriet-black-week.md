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

### Hecho (Angelo: «dale, haz las mejoras 1 a 4»)

- **[vev#119](https://github.com/vio-live/vev/pull/119)**, mergeado y desplegado en los dos paquetes (`cq1lXld-TA9`, `c5CIrrzXoMb`):
  - foto del CDN primero; la copia de las props solo si la foto falla, está vieja o no llega en 700 ms;
  - GET de GraphQL con `cache: "no-cache"`;
  - las imágenes de las tarjetas no prioritarias se montan cuando han cargado las prioritarias, a 100 px del viewport o a los 2,5 s.
- **[graphql#47](https://github.com/vio-live/graphql/pull/47)**, mergeado a develop y desplegado en QA en verde:
  - la caché de productos del gateway caduca a los 120 s (antes 1 h, el valor por defecto de `RedisService`);
  - el gateway la llena desde api con `useCache=false`. La caché de api no caduca y también sirve antes de refrescar, así que devolvía el precio viejo; esa era la causa del fallo 1.
  - Comprobado en QA en los logs del gateway (canal 503):
    - las claves se guardan «with expiration of 120 seconds» y api se llama con `useCache=false`;
    - tras 130 s sin peticiones, la siguiente es un fallo de caché: sin «RETURN RESPONSE», con CALL SERVICE a api (115 ms) y la clave guardada de nuevo.
    - No se cambió ningún precio en QA para la prueba de punta a punta: escribir en la base de QA pide el OK de Angelo. La cota de ≤120 s sale de la caducidad comprobada más la lectura fresca de api.
  - Release a prod preparada en **[graphql#48](https://github.com/vio-live/graphql/pull/48)** (cherry-pick sobre master; 679 tests y tsc en verde). Está **sin mergear**: espera la frase de Angelo.

Antes/después en el mismo arnés (main `5d4870d` frente a vev#119; 3 corridas intercaladas; grid de 16 tarjetas; 4G y caché vacía):

| | antes | después |
|---|---|---|
| Copia de las props vieja (la situación real de hoy): precio viejo en pantalla | 1 105–1 326 ms | **0** |
| — imágenes de producto | 20 peticiones / 239 KB | **8 / 100 KB** |
| — las 4 imágenes de arriba completas (las definitivas) | 3 284–3 486 ms | **2 061–2 233 ms** |
| — tarjetas pintadas | 1 355–1 435 ms (precio e imagen viejos) | 1 669–1 686 ms (correctas) |
| — LCP | 1 772–1 908 (imagen vieja) | 1 852–2 056 (imagen definitiva) |
| Sin copia en las props: las 4 de arriba completas | 2 448–2 483 ms | **2 070–2 084 ms** |
| — LCP / tarjetas | 1 864–2 080 / 1 688–1 780 | 1 880–1 896 / 1 689–1 713 |
| Segunda visita: GET de GraphQL | caché del navegador | red |

Las tarjetas salen unos 300 ms más tarde que con la copia de las props (que pintaba al momento, pero mal): esperan a la foto completa (26 KB gzip). La foto recortada en campaigns (propuesta 3 de arriba, medida −210 ms) lo recuperaría; no entraba en este lote. Comprobado en el arnés: card, grid y carrusel con los precios nuevos en primera y segunda visita, todas las imágenes completas y sin errores de consola.
- **Guardia #491, 12:52–12:59 UTC.** Alan cerró editableCSS (las fuentes ya cambian, vev#117), la card suelta (Blowcast Pro 568, tachado 1419, −60 %) y la card con opciones (Premium 2 1359, tachado 1999). Verificado en sus capturas. Le he pedido que confirme la prueba de las dos Configs y que trabaje en la página con el paquete ligero.

- **Agotado que seguía comprable** (#491, llavero 410659 a stock 0): la causa es la caché del gateway de prod, no los bloques.
  - En el arnés con main `91d9d5d` (vev#120/#121) y el producto real, la primera carga de la tarjeta recibió del GET de GraphQL el llavero **con stock**: la clave de esa consulta seguía vieja en el gateway, que sirve antes de refrescar desde la caché de api, sin caducidad.
  - Las cargas siguientes recibieron `[]` y la tarjeta pasó a «UTSOLGT» con el botón deshabilitado. Hacia las 13:15 UTC la consulta exacta de las tarjetas, con los ids del editor, devolvía `[]` en 6 de 6, y el editor de test-kondomeriet ya mostraba «UTSOLGT».
  - Con una respuesta fresca, main hace lo correcto:
    - tarjeta suelta en «UTSOLGT»;
    - en grid y carrusel la tarjeta agotada desaparece;
    - en el Premium 2, bringebær y rød no salen entre las opciones de la ficha.
    El producto con stock (Snap) sigue comprable.
  - Arreglo de raíz: [graphql#47](https://github.com/vio-live/graphql/pull/47) (en QA) y su release [graphql#48](https://github.com/vio-live/graphql/pull/48), pendiente de la frase de Angelo. Hasta entonces, cualquier cambio de stock o precio puede llegar viejo a la primera o segunda consulta de cada combinación de ids, y quedarse 5 min en la caché local de ese lector.

- **Tarjetas mezcladas con el esqueleto** (#491, Alan 13:13 y 13:48 UTC, `a-alan-local.vev.site/woo-origin`): [vev#122](https://github.com/vio-live/vev/pull/122), mergeado y desplegado en los dos paquetes.
  - **Causa: hidratación.** La página publicada llega renderizada en el servidor con el esqueleto y React la hidrata. En una recarga, el primer render del cliente ya leía la caché local y pintaba la tarjeta, y el esqueleto usaba datos del navegador (identidad de la caché, detección de app, cuenta atrás). La hidratación reutiliza los nodos del servidor sin corregir sus atributos: quedaban `knd-skel-line` en el precio, `knd-skel-block` en «Se produktinfo» y `aria-busy`. No era vev#119 ni el botón oficial de Vipps.
  - Reproducido en su página con Puppeteer: bien con caché vacía; al recargar, las 4 tarjetas quedaban `aria-busy` con nodos de esqueleto. También en el arnés, con `renderToString` del bundle e hidratación legacy.
  - Arreglo: el primer render es igual al del servidor; la caché, la foto, la copia de las props y la identidad entran tras montar. Comprobado sin nodos de esqueleto ni errores de hidratación en card (con stock y agotada), grid y carrusel, con `hydrateRoot` y con `hydrate`. La carga no empeora.
  - La página de Alan sigue con el bundle viejo (`b08e85fa…`), porque las publicadas lo fijan: tiene que **republicar**.
- **Guardia #491, 13:13–14:19 UTC.**
  - Cerrados: estrellas, línea de confianza y fecha de fin de oferta; títulos largos y precios de 4 cifras; imagen que no carga; abrir la ficha (Se mer, Se produktinfo, foto); contenido de la ficha.
  - **Producto agotado:** Alan puso el llavero 410659 a stock 0 directamente en la base de datos de prod. La tarjeta seguía ofreciendo Vipps y llegaba al pago.
    - En los bloques: [vev#120](https://github.com/vio-live/vev/pull/120) (producto que el canal ya no devuelve → agotado) y [vev#121](https://github.com/vio-live/vev/pull/121) (respuesta vacía del canal = agotado; un fallo no cuenta como agotado).
    - Causa de fondo: la caché del gateway GraphQL en prod servía la respuesta vieja. El arreglo es [graphql#48](https://github.com/vio-live/graphql/pull/48), pendiente de la frase de Angelo.
    - El llavero sigue a 0; hay que restaurarlo con OK de Angelo.
  - **Tarjetas a medio cargar** (barra gris del esqueleto detrás del precio, bloque gris en lugar de «Se produktinfo») al recargar una página publicada. Era la hidratación de React: el primer render del cliente usaba la caché local y no coincidía con el HTML del servidor de Vev. Arreglado en [vev#122](https://github.com/vio-live/vev/pull/122), que alinea el primer render con el del servidor. Hay que republicar las páginas (Alan su woo-origin; Angelo test-kondomeriet).
  - Checklist «13. Verificar arreglos» añadido a la #491 (dos Configs y agotado).

## Decisions
- Angelo, 19/11: el precio de Black Week se calcula con el % de la hoja y se escribe en la base de datos. Sustituye a la regla del 18/11 «nunca se deduce un før-pris de un %».

## Blockers
- Siguen los del 18/11: H auto a 0 px en el editor de Vev, frases de prod para la postback de Circlewise, compra de 39 kr y precios de Black Week de Kondomeriet.

## Next session
