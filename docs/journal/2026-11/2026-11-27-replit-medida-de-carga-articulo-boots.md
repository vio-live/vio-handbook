---
date: 2026-11-27
session: Replit / Mote & Livsstil — medida de carga del artículo de Boots
participants: [angelo, claude]
status: live
---

# Carga del artículo de Boots en Replit: dónde se va el tiempo ahora

## Goal
Angelo: «tenemos que mejorar el tiempo de carga con Replit»; su idea, guardar la respuesta del backend al publicar y
dejar remoto solo lo que se abre (ficha, carrito, checkout). Medir y proponer.

## Done
Medido en el Chrome de Angelo (escritorio, buena red, `?vio_internal=1`) y con curl, artículo No7 de
`moteoglivsstil.no`. Replit está en la SDK **0.42.0**.

- **Replit ya mete los productos en el HTML** (`window.__VIO_PRODUCTS__`, junto a `__VIO_PRELOAD__` y
  `__ARTICLE_PAYLOAD__`), pero **solo si la caché de su servidor está caliente** (y el cliente la descarta con más de
  5 min). En frío el HTML llega sin productos (29 KB en vez de 47 KB).
- **Con todo caliente:** HTML a 0,45–0,5 s, tarjetas a ~1,0–1,1 s (iframe del mismo origen, DOM observado). El camino
  es HTML → `index-*.js` (238 KB gz / 797 KB) → chunk `VioProductsBlock` → tarjetas. Las tarjetas las pinta React en
  el cliente; no vienen en el HTML.
- **En frío** (primera carga de nivel superior): 18 `/api/vio/article-products` (una por bloque, `cache-control:
  private`, 1,6–2,5 s cada una en el navegador; 0,5–1,0 s con curl) y 18 consultas a `graph-ql.vio.live` (0,4–1,6 s):
  la SDK pidió `getByIds` antes de que llegara la foto del CDN (941 → 1546 ms), así que no la usó. Las tarjetas
  dependen de la primera respuesta de cada bloque: entre ~1,8 y ~3 s (deducido de los tiempos de respuesta; el DOM de
  esa carga no se pudo observar porque la pestaña estaba oculta).
- **HTML:** `cache-control: max-age=60, s-maxage=30`; TTFB 0,08–0,16 s en caché y **1,0–2,4 s sin ella**. Cualquier
  query nueva (`fbclid`, `utm_*`) es otra entrada de caché: quien llega desde redes cae siempre en frío.
- **JS de Replit:** los ficheros con hash se sirven con `max-age=60` y `cf-cache-status: BYPASS`.
- **Foto del CDN:** 51 KB br (382 KB), 97 productos de toda la surface; `max-age=30, s-maxage=60, swr=300`, HIT.
  Conexión nueva a `container.vio.live`: 0,3–0,6 s.

- **Corrección (leído el código de la SDK):** `getByIds` ya corría la foto contra GraphQL, así que las 18 consultas
  de la carga en frío no retrasaban las tarjetas: se tiraban. En frío las tarjetas salen cuando llega la foto
  (~1,55 s en esa carga); lo que las retrasa es que la foto empieza tarde (941 ms, tras el JS de Replit) y el HTML
  sin productos.
- **SDK** [web-sdk#176](https://github.com/vio-live/vio-web-sdk/pull/176) (mergeado, `584b9a9`): `getByIds` espera
  350 ms a la foto en vuelo antes de preguntar también a GraphQL; las llamadas del mismo turno salen como una sola
  petición (máx. 50 ids); `snapshotUrl()` en `./preload` para que un host con servidor escriba la etiqueta de la foto
  en su HTML. 11 tests nuevos (1599 en verde; los 16 rojos son los de Node 26, iguales en `main`).
- **Texto para Replit** en el [handoff](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md) (sección del 27/11):
  `__VIO_PRODUCTS__` siempre en el HTML, la foto en el `<head>`, caché del HTML sin parámetros de seguimiento y con
  stale-while-revalidate, una llamada en vez de 18, assets inmutables.

- **Release 0.43.0** ([web-sdk#177](https://github.com/vio-live/vio-web-sdk/pull/177), `1c9790e`): solo el bump y el
  changelog. Copia limpia de `main`, compilada, en `~/vio-commerce/worktrees/sdk-publish-0430`; la publica Angelo.
- **Lo nuestro en prod, comprobado (15:46 UTC):** la foto de la surface 1 (`.web.json` y `.web.js`) responde 200, con
  37 s de antigüedad, 98 productos con envío y los 18 de la campaña 8. npm `latest` = 0.42.0.
- Angelo: Replit aplica el texto **directo en la web real**, sin pasar por la copia de pruebas.

- **0.43.0 en npm** (`latest` desde las 16:00 UTC, publicada por Angelo; shasum `d24de126…`, el mismo del build
  preparado; lleva `snapshotUrl`). Costó varios intentos: `npm publish` se queda esperando la confirmación en el
  navegador (2FA de la cuenta `vio-`) y, con dos intentos a la vez o uno cortado, el registro contesta
  `409 Cannot publish over previously staged version` mientras `npm stage list` no enseña nada. El intento pendiente
  acabó publicándose solo unos minutos después.
- **Error mío:** con el 409 repetido di la 0.43.0 por perdida y corté una 0.43.1
  ([#178](https://github.com/vio-live/vio-web-sdk/pull/178)) en el mismo comando que volvía a mirar el registro, sin
  esperar a leerlo: justo entonces la 0.43.0 ya estaba publicada. Revertido en
  [#179](https://github.com/vio-live/vio-web-sdk/pull/179): `main` (`df854ea`) tiene el mismo árbol que la release
  0.43.0. La 0.43.1 no se publicó.

## Decisions
- Angelo: «sí, prepara el cambio de la SDK y el texto para Replit». Propuesta entregada (Replit: productos siempre en el HTML, caché del HTML sin contar las
  queries de seguimiento y con stale-while-revalidate, assets inmutables, tarjetas pintadas en servidor, una llamada
  en vez de 18; SDK: `getByIds` espera a la foto en vuelo, aceptar los productos que da la página, juntar llamadas).

## Blockers
- La carga en frío de nivel superior no se midió con el DOM (ventanas emergentes bloqueadas, pestaña oculta).
- Sin medida en móvil.

## Next session
- Cuando Replit aplique el texto (la 0.43.0 ya está en npm): volver a medir el artículo de Boots en frío y en móvil.
