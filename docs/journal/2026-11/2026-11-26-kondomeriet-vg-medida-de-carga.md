---
date: 2026-11-26
session: Kondomeriet × VG — medida de carga del artículo de pruebas en vg.no
participants: [angelo, claude]
status: live
---

# 26/11: cuánto tarda el artículo de Kondomeriet en vg.no

## Goal
Angelo pasó la página de pruebas de VG (`vg.no/annonsorinnhold/_dev/test/tipio-live-shopping-v2/`, 21 tarjetas de
Kondomeriet montadas por Partner Studio en Vev) y pidió medirla.

## Done
- **Medida** con `~/vio-reportes/perf/medir-articulo.mjs`, el mismo perfil que Boots y que Kondomeriet el 19/11
  (móvil de gama media en 4G: 150 ms, 1,6 Mbps, CPU ×4; y escritorio sin límites). Mediana de 5 pasadas, visitas
  marcadas como internas. Ficheros `vg-kondomeriet-2026-11-26-{movil4g,escritorio}.json`.

  | | Móvil 4G, primera visita | Móvil 4G, repetida | Escritorio, primera | Escritorio, repetida |
  |---|---|---|---|---|
  | Título del artículo | 1,0 s | 0,24 s | 0,39 s | 0,05 s |
  | Primera tarjeta con producto | **6,7 s** (6,68–6,90) | 0,62 s | 0,75 s | 0,13 s |
  | Foto de la primera tarjeta | 7,2 s | 0,68 s | 0,88 s | 0,14 s |
  | Las 21 tarjetas | 6,8 s | 0,62 s | 0,75 s | 0,13 s |
  | LCP | 6,4 s | 0,78 s | 0,63 s | 0,19 s |
  | CLS | 0,012 | 0 | 0,001 | 0 |
  | Peso | 64 peticiones, 1.966 KB (JS 1.051 KB) | 666 KB | 3.812 KB | 54 KB |

- **Qué ve el lector en móvil con 4G:** el artículo (título y texto) al segundo; las tarjetas, como marcos grises
  hasta los 6,7 s. La primera tarjeta está a unos 2.250 px del inicio (dos pantallas y media).
- **Por qué 6,7 s:** el HTML publicado trae las tarjetas como esqueleto, a propósito (`useKondomerietGroups`: el
  primer render no usa ni la foto del CDN ni la copia guardada en las props, para que hidrate igual). El producto se
  pinta cuando corren los dos scripts del final del documento: el runtime de Vev (75 KB) y **nuestro paquete,
  `cdn.vev.design/pkg/v1/9a3aa…js`, 266 KB en brotli (904 KB sin comprimir)**. Pesa eso porque **Vev mete nuestro
  código tres veces** (`knd.photoKey.v1`, `KondomerietCards` y `react-dom` aparecen 3 veces cada uno); una copia
  son ~89 KB. En 4G termina de bajar a los ~5,8 s, compitiendo con lo de VG: seguimiento de Schibsted 425 KB,
  consentimiento 152 KB, Partner Studio 62 KB, un vídeo de 334 KB, fuentes e imágenes. Las tarjetas se pintan con la
  copia guardada en las props (las 21 la llevan): salen antes de que vuelvan la config (6,8 s), GraphQL (8,0 s) y la
  foto del CDN (7,9 s).
- **Descartado con pruebas** (misma página servida con el HTML cambiado, 3 pasadas): quitar el bloque `<style>` de
  847 KB que va delante del artículo (928 `@font-face`, 744 de Noto Sans JP) no cambia los tiempos; hacer `async` el
  script `pulse-vev.js` de Partner Studio, tampoco.
- **Fallo del script de medida, corregido:** el observador arrancaba en `readystatechange` cuando aún no había
  `<html>`, es decir en DOM-interactive, y el título de una página que ya lo trae en el HTML salía a 5,9 s en vez de
  1,0 s. Ahora observa `document` desde el primer instante. La línea base de Boots del 25/11 no estaba afectada
  (título 1,0 s con DCL a 5,9 s). El script admite `--card '<selector>'` (para estos bloques:
  `.knd-card .vnc-image[role="button"][aria-label]`) y `--shot`.

## Decisions
- Ninguna todavía.

## Blockers
- Vev sirve el paquete repetido (dos veces en nuestra página de pruebas el 18/11, tres aquí). Escribirles sigue pendiente.

## Next session
- Si se quiere bajar los 6,7 s desde nuestro lado: pintar en el HTML publicado el nombre y la foto desde la copia
  guardada en las props (el precio, al hidratar). Cambio en el paquete de Vev y republicar la página.
- No medido: el aviso de consentimiento de VG, que en un navegador normal tapa la página hasta que se contesta (en
  Chrome sin interfaz no llegó a pintarse en 10 s).
- Repetir la medida con el mismo comando tras cada cambio.
