---
date: 2026-11-18
session: Kondomeriet Black Week — productos en prod para el test de Vev con Vipps Hurtigkasse
participants: [angelo, claude]
status: live
---

# Kondomeriet Black Week: 418 productos publicados en prod (18/11)

## Goal
Angelo: cargar en la cuenta de prod de Kondomeriet (usuario 1305) los productos de la hoja «URL-er Kondomeriet Black
Week» (19 URLs: 12 productos sueltos y 7 páginas de listado), teniendo en cuenta los enlaces de Circlewise. El paso 2 es
un test rápido en Vev: el botón de compra manda a la **Vipps Hurtigkasse** de Kondomeriet, no a nuestro checkout.

## Done
- **Feed en vez de scraping:** el feed de Google Merchant de Kondomeriet (`product_feed` 1, cada 5 min) ya estaba sano en
  prod: 2 447 productos, sin fallos. Todo el catálogo seguía en **borrador**.
- **Selección, 420 productos:**
  - los 12 sueltos por URL;
  - Womanizer Snap (1), Premium 2 (6 colores), Duo 2 (5) y Tenga Spinner (6);
  - Easyglide (30);
  - todo `/kondomer/` (80) y todo `/sexy-undertoy/` (280): «si son las que ellos tienen, sí».
- **Envío:** la cuenta no tenía ninguno y sin clase de envío no se publica. Se creó «Frakt», 59 NOK, NO, «Leveres innen 1-3
  virkedager» (lo que anuncia su web), y se colgó de los 420. Transacción con ensayo y COMMIT.
- **Publicados 418** con `PUT products/bulk-publish`. Los otros 2 (409114 y 411096) no tienen descripción en el feed.
  332 quedan visibles; los 86 sin stock aparecerán solos cuando lo tengan (trigger `product_BEFORE_UPDATE`). El feed no toca
  `status` (`applyFeedUpdate`), así que no los devuelve a borrador.
- **Colección «Black Week»** (`KHBq619Se`) con los 418, creada por el micro `collections`.
- **Vipps Hurtigkasse** (misma plataforma EQOM que Nytelse, visto el 9/11): `POST https://www.kondomeriet.no/k/<slug>/kjop/`
  con `qty-<slug>=1&cbtn=vps`. `<slug>` es el segundo segmento de la URL del producto (`origin_url`); comprobado en tres
  fichas. No hace falta guardarlo aparte.
- **Entregable:** `vio-commerce/entregables/Kondomeriet-Black-Week.csv`, una fila por producto con grupo y rabatt de la
  hoja, precio, stock, id de Vio, URL, Hurtigkasse y `ref1` de Circlewise.

- **Colección reducida a los 33 productos del archivo** (Angelo: «solo los productos del archivo»): los 12 sueltos más
  todos los colores, modelos o tamaños de Womanizer Snap, Premium 2 y Duo 2, Tenga Spinner y Easyglide vannbasert
  (150/500/1000 ml). Fuera las dos categorías enteras (condones y ropa interior) y el resto de Easyglide.
- **VG como publisher** (cuenta **1333** `vg-schibsted`, ya creada como Publisher, suscripción 635), por llamadas internas
  desde el pod de users:
  - solicitud 1459 aceptada por Kondomeriet, que crea la conexión 544;
  - colección compartida (`collection_shared` 611), 33 copias;
  - canal Sdk **486** «VG - Kondomeriet Black Week» (api key 273, settings 84, `channel_group` 1084);
  - **surface 3** «VG» (Vev, NO) y **campaña 7** «Kondomeriet Black Week», con sponsor 1305, canal 486, del 18/11 al 30/11
    23:59 Oslo y comisión del publisher 10 % (el `referralFee` de los 33 productos ya estaba en 10).
  - Surface y campaña se escribieron por SQL, con ensayo antes, replicando lo que hace el micro: el micro solo acepta el token
    de Firebase de la cuenta y no tiene ruta interna.
  - Comprobado: `/v2/mobile/config` con la key de la surface devuelve la campaña 7 con Kondomeriet y el canal 486. El GraphQL
    con la key del canal da 31 productos; los otros 2 están agotados.
- **Bloque de Vev de Kondomeriet:** [vev#90](https://github.com/vio-live/vev/pull/90), desplegado en el paquete de pruebas
  de Angelo (no en el compartido). Agrupa colores y modelos con un selector, abre la ficha con «Se produktinfo», paga con
  «Kjøp med Vipps» en la Hurtigkasse y lleva una etiqueta de descuento con fechas.
- **Precio anterior desde el feed:** products [#67](https://github.com/vio-live/vio-products-microservice/pull/67) y
  google-merchant-feed [#7](https://github.com/vio-live/google-merchant-feed/pull/7), en QA. A prod, con el OK de Angelo:
  la siguiente lectura de cada feed vuelve a publicar todo su catálogo una vez.
- **Prueba de Alan:** tarjeta [#491](https://trello.com/c/1vZPbtOG).

- **Tarde del 18/11:**
  - **Bloques de Vev de Kondomeriet en el paquete compartido** ([vev#90](https://github.com/vio-live/vev/pull/90)–[#93](https://github.com/vio-live/vev/pull/93)):
    - el diseño del SDK estándar;
    - descuento en la tarjeta y en la ficha;
    - etiqueta editable «Kjøp direkte fra artikkelen»;
    - ficha completa con secciones;
    - las ventajas o promesas de marca;
    - adaptación a móvil;
    - imagen elegida por el redactor y las mismas opciones de la tarjeta estándar;
    - sin el enlace a kondomeriet.no.
    Página de prueba publicada: `a-vio-dev.vev.site/test-kondomeriet`.
  - **Descripciones limpias:** sacadas de las 34 fichas de kondomeriet.no (frase destacada, Produktinformasjon,
    Spesifikasjoner, Inkludert i esken y valoración) y escritas en `product.description` con el marcador
    `<!-- vio:keep-description -->`. Así el feed no las pisa ([products#68](https://github.com/vio-live/vio-products-microservice/pull/68)).
    El feed de Kondomeriet manda las descripciones sin `< >`.
  - **Prod:** products [#69](https://github.com/vio-live/vio-products-microservice/pull/69) (precio anterior + descripciones fijadas) y
    google-merchant-feed [#8](https://github.com/vio-live/google-merchant-feed/pull/8). Al re-publicar los catálogos, el pod de products se quedó
    en ~495 MB, sin reinicios.
  - **Llavero «Ring For Sex» (410659, 39 kr)** en la colección, para probar pedidos baratos.
  - **Promesas de marca de Kondomeriet** (`brand_profile.highlights` 1305, con ensayo antes):
    - Lynrask levering · Tusenvis av varer på lager;
    - Anonymitet;
    - Eksklusive priser.
    Logo de la marca: pendiente.

- **Tarde (17:00 UTC aprox.; se completa al cierre):**
  - **Vev:** [vev#95](https://github.com/vio-live/vev/pull/95), [vev#96](https://github.com/vio-live/vev/pull/96) y [vev#97](https://github.com/vio-live/vev/pull/97) (compra en tarjeta, conversión y carga, enlace Circlewise por tarjeta). [vev#98](https://github.com/vio-live/vev/pull/98) activa Circlewise por defecto: ref1 sale del archivo, ref2 es la sesión del SDK y ref3 la campaña. Todo desplegado en `cq1lXld-TA9`.
    El salto por Circlewise cuesta ~0,6 s en un navegador real. El preconnect no lo acorta.
  - **Caché en el borde:** el origen ya está en prod, con campaigns [#39](https://github.com/vio-live/vio-campaigns-microservice/pull/39) y graphql [#46](https://github.com/vio-live/graphql/pull/46), comprobado con curl.
    Falta que Miguel ponga Cloudflare delante: [handoff](../../handoff/2026-11-18-cdn-edge-cache-sdk.md).
  - **Postback de Circlewise:** campaigns [#40](https://github.com/vio-live/vio-campaigns-microservice/pull/40) está en QA. [#41](https://github.com/vio-live/vio-campaigns-microservice/pull/41) a prod espera el OK de Angelo.
    El texto para VG, que tiene la cuenta, está en el [handoff](../../handoff/2026-11-18-circlewise-postback-vg.md) y se les pide al final.
  - **Imágenes sin redirecciones, en prod:**
    - En prod: base-api #74, products #71 y api #81.
    - Relleno: 30.143 originales y 90.429 variantes, sin fallos.
    - En el canal de VG: de 2 redirecciones y 1,66 s por imagen a 0 redirecciones y 0,24–0,47 s.
    - Cómo funciona: `docs/architecture/vio-commerce.md` §8.
    - 17:27 UTC, Alan vio 404 en la galería de la ficha: `directImage` de Vev construía `<n>large.jpg` antes de que existiera la variante. Se arregló al terminar el relleno; le avisamos para que vuelva a probar.
  - **Guardia #491, 16:54 UTC.** Alan marcó 9 productos distintos en el «Products» de una tarjeta del Carousel y salió una sola tarjeta con 9 opciones.
    Arreglado en [vev#99](https://github.com/vio-live/vev/pull/99) y desplegado:
    - «+ Add products» crea una tarjeta por familia. Una familia es la misma fila del archivo, o la misma marca con las dos primeras palabras del título iguales.
    - Una tarjeta que mezcla familias se divide sola, y la tarjeta suelta avisa.
    - ref1 sigue a la opción comprada.
    - Con los 9 de Alan salen 7 tarjetas. Ya le pedimos que vuelva a probarlo.
  - **Imagen mediana (500 px)** en las tarjetas y en las miniaturas de la galería ([vev#100](https://github.com/vio-live/vev/pull/100)). `directImage` entiende ya la URL directa de api #81.
  - **Ojo con lo publicado en Vev:** una página publicada se queda con la versión de los bloques del momento de publicar. La de prueba seguía con el bundle anterior tras `vev deploy`, así que cada arreglo exige volver a publicar. Avisado a Alan. VG debe publicar su artículo después de nuestro último despliegue.
  - **Caché de productos del canal 486 en el Redis de prod, borrada con OK de Angelo** (~18:10 UTC):
    - Por qué: la ficha de Vev pide con `useCache:true`, y api guardaba la respuesta por URL, sin caducidad, con los nombres de imagen de ayer en la forma `?size=`. El feed volvió a subir hoy todas las imágenes con nombres nuevos, y el relleno no generó tamaños para los nombres viejos. Cada miniatura de la galería daba 404 y caía al redimensionador.
    - Cómo: ensayo y borrado de las 151 claves de `USER_CHANNEL_ID_486_KEYS`, como hace `deleteCacheChannelUser`. De esas, 79 tenían respuesta y 66 llevaban URLs viejas; no quedó ninguna.
    - Comprobado: la API devuelve las URLs directas nuevas, y en `test-kondomeriet` las 11 imágenes de la galería del Womanizer cargan directas.
    - Pendiente:
      - Las cachés de los demás canales siguen con URLs `?size=`. Funcionan, con dos redirecciones.
      - El feed de Kondomeriet vuelve a subir todas las imágenes en cada importación. Hay que mirarlo aparte.
  - **Guardia #491, 18:00–18:16 UTC.** Alan probó key mala o vacía (error claro, las tarjetas no rompen), el catálogo del selector, la búsqueda por nombre, marca e id, y la agrupación de los colores del Womanizer con sus Details. Todo correcto.
    Solo falló el texto blanco sobre blanco en el buscador del selector, arreglado en [vev#101](https://github.com/vio-live/vev/pull/101) y desplegado.
  - **Guardia #491, 18:24–18:29 UTC.** Carousel y Grid funcionan: añadir, reordenar, borrar y el mismo producto en dos tarjetas.
    Alan encontró un problema real con dos Kondomeriet Config: la segunda arrancaba en Staging y, como ganaba la que se pintaba la última, podía pisar el fast start, Circlewise y el entorno.
    Arreglado en [vev#102](https://github.com/vio-live/vev/pull/102) y desplegado. La primera Config montada es la dueña; las demás muestran un aviso en el editor; una Config nueva empieza en Production, y si no lo está sale un aviso ámbar.
    Bloque 1 (montaje) de la checklist, completo.
    18:57 UTC: al borrar la dueña, la otra seguía con el aviso. [vev#104](https://github.com/vio-live/vev/pull/104) cambia el sistema: la dueña pasa a ser la primera de la lista de Configs montadas. Ya no depende del orden de los eventos y descarta los ids de renders que nunca llegaron a montarse.

## Decisions
- Feed, no scraping: ya escucha los cambios de precio y stock.
- El precio de Black Week llega por el feed cuando Kondomeriet lo ponga (hoy ningún producto trae precio anterior).

## Blockers
- **Circlewise:** con la compra por su Hurtigkasse, la venta no pasa por Vio y no hay forma de activar el tracking.
  Pendiente de cómo lo quiere usar Angelo.
  → Receptor de la postback hecho (QA en vivo, prod preparado): [handoff](../../handoff/2026-11-18-circlewise-postback.md).
- El pago por Hurtigkasse no se ha probado en vivo, porque crea un pago real en su Vipps.

## Next session
- Paso 2 (test en Vev): el bloque con la colección `KHBq619Se` y el botón «Kjøp med Vipps» → Hurtigkasse.
