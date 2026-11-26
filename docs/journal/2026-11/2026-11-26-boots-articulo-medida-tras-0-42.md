---
date: 2026-11-26
session: Boots en moteoglivsstil.no — medida de carga tras la SDK 0.42.0 y qué pedir a Replit
participants: [angelo, claude]
status: live
---

# 26/11: el artículo de Boots tras la 0.42.0 — dónde se va el tiempo ahora

## Goal
Angelo preguntó qué se le puede pedir a Replit para que el artículo cargue muy rápido («consolidar la data de los
productos en la primera carga y después actualizarla»). Antes de proponer, se midió el artículo real con el perfil de
siempre. Era además la medida pendiente desde el 25/11 (Replit iba una versión por detrás).

## Done
- **Medida** (~15:15 UTC, `moteoglivsstil.no/skjonnhet/guider/arets-skjonnhetsgaver-pa-tilbud-no7-favorittene-du-kan-legge-under-treet`,
  SDK 0.42.0, `medir-articulo.mjs`, móvil 4G, mediana de 5; fichero `~/vio-reportes/perf/boots-2026-11-26-movil4g.json`):

  | Móvil 4G | 25/11 (SDK 0.37.7) | 26/11 (SDK 0.42.0) |
  |---|---|---|
  | Título, primera visita | 1,0 s | 0,36 s |
  | Primera tarjeta, primera visita | 10,2 s | **6,3 s** (6,2–8,3) |
  | Las 24 tarjetas, primera visita | 15,3 s | 6,3 s |
  | Primera tarjeta, visita repetida | 3,4 s | **0,63 s** |
  | LCP, primera visita | 3,7 s | 5,0 s (la foto de cabecera) |
  | Peso, primera visita | 106 pet., 3 128 kB | 57 pet., 2 941 kB (JS 939 kB, imágenes 1 862 kB) |

  Escritorio no se midió hoy.
- **Qué manda ya Replit en el HTML** (11 kB comprimido, 140 ms): el texto del artículo dibujado («SEO shell»), y en
  línea `__ARTICLE_PAYLOAD__`, `__VIO_PRODUCTS__` (los 17 productos, refrescados en su servidor hacía 41 s) y
  `__VIO_PRELOAD__`. Precarga dos fotos de producto.
- **Por qué la primera tarjeta tarda 6,3 s:** las tarjetas no van dibujadas en el HTML. Las pinta su JavaScript, y el
  trozo con el bloque de Vio llega a los 6,0 s: en la primera visita bajan 939 kB de JS (el principal, 243 kB gzip /
  795 kB sin comprimir) por una línea de 200 kB/s, compitiendo con 1,9 MB de imágenes.
- **Otros hallazgos:**
  - Fotos de producto en la variante `large` (1024 px, 21–245 kB). Existen `medium` (500 px, 71 kB la misma foto) y
    `thumbnail` (150 px, 6 kB). Solo JPEG.
  - `/assets/*` (nombres con hash) con `cache-control: max-age=60`; gzip, sin Brotli.
  - Llamadas propias repetidas: `/api/auth/me` ×3 (401), `/api/vio/settings` ×2, y `/api/cms/articles/by-slug/…`
    aunque el artículo ya va en línea.
  - La foto de cabecera (201 kB, 1063×677) es el LCP, no se precarga y Cloudflare no la guarda (`DYNAMIC`).
  - **35 peticiones a `graph-ql.vio.live`** en las visitas repetidas (a los 0,73 s, tras las tarjetas) y ninguna en
    las primeras. Encaja con una carrera: las tarifas de envío se piden antes de que llegue la foto del CDN y la SDK
    cae a GraphQL. Es nuestro, no de Replit. Sin confirmar qué operaciones son.

## Decisions
- Propuesta a Angelo, por orden de ganancia: (1) dibujar las tarjetas en el HTML del servidor con los datos que ya
  van en línea y refrescar después; (2) fotos `medium` con `srcset`; (3) menos JS antes de las tarjetas; (4) caché de
  un año e inmutable para `/assets/*` y Brotli; (5) quitar llamadas repetidas y precargar la cabecera.
  Prompt en inglés entregado en el chat. La ganancia de (1) es una estimación: las tarjetas saldrían con el primer
  pintado (1,1 s medido), no a los 6,3 s.

## Blockers / open questions
- Lado Vio: variantes WebP/AVIF de las fotos del CDN; la carrera de las 35 peticiones en la SDK.

## Next session
- Volver a medir con el mismo comando cuando Replit aplique algo. Para comparar, que conserven
  `data-testid="vio-products-block"` y las tarjetas como `[role="button"][aria-label]`.
