---
date: 2026-11-25
session: Boots × Mote & Livsstil — revisión del artículo en vivo y medida de carga
participants: [angelo, claude]
status: live
---

# 25/11: artículo de Boots en vivo, revisión y línea base de carga

Artículo: `https://www.moteoglivsstil.no/skjonnhet/guider/arets-skjonnhetsgaver-pa-tilbud-no7-favorittene-du-kan-legge-under-treet`
(contenido 196, campaña 8, canal 487). Contexto de la marca: [journal de Boots en prod](2026-11-24-boots-no7-coleccion-prod.md).

## Goal
Angelo: revisar que el artículo publicado esté bien y medir cuánto tarda en cargar, para tener números con los que comparar las mejoras.

## Done
- **Revisión (12:25–12:35 UTC), en la web real:**
  - 19 bloques y 24 tarjetas, 18 productos distintos: los 18 de la colección `tWOhIb-4q`, todos con `data-vio-campaign="8"`.
  - Precio y tachado de los 18 iguales a boots.no en ese momento (JSON-LD de cada ficha); los 18 `InStock` allí.
  - Fotos 24/24 (se sirven desde `www.boots.no/media/…?size=large`, 1200 px). Móvil 375 px sin desborde.
  - Ficha → carrito → kasse: abre el widget *live* de Kustom (`js.live.kustom.co`), «godtar Boots Apoteks vilkår», Klarna, Vipps, tarjetas, Apple Pay y Google Pay. Sin pagar ni meter datos; carrito de prueba vaciado. Queda una sesión `checkout_incomplete` en el Kustom de Boots.
  - Analítica: `component_impression` a `events.vio.live/v1/events` con `campaign_id` 8, `content_id` 196 y `sdk_version` 0.37.7.
  - Etiquetas para compartir (og:title, og:description, og:image, canonical): bien. El texto del artículo va en el HTML; las tarjetas se pintan en el navegador.
- **Hallazgos:**
  1. **«Gratis frakt» en tarjetas, ficha, carrito y resumen de la kasse.** Sale de la clase de envío a 0 kr que existe solo para poder publicar. En `boots.no/frakt-og-levering` solo es gratis Klikk & Hent; buzón 19 kr, punto de recogida 49 kr, domicilio 89 kr (gratis para miembros por encima de 399 kr). No se vio qué cobra el Shipping Assistant en nuestra kasse: pide dirección antes de enseñar los envíos.
  2. **La web real sigue en la SDK 0.37.7** (bundle del 4/11). El arreglo de la línea de envío del resumen (0.40.2) y los de Kustom (0.39.1–0.39.3) solo están en la copia de pruebas.
  3. Dos productos muestran la marca «BOOTS BEAUTY INT NUMBER 7» (Restore and Renew Duo, Dagkrem Lift & Luminate): viene del feed.
  4. `/api/auth/me` se pide 22 veces por carga (401 cada una, ~0,5 s de servidor). Es código de Replit.
- **Línea base de carga (12:37–12:39 UTC).** Mediana de 5 pasadas, Chrome nuevo en cada una. Tiempos en segundos desde que empieza la navegación.

  | | Móvil 4G, 1ª visita | Móvil 4G, 2ª visita | Escritorio sin límite, 1ª visita |
  |---|---|---|---|
  | Primer contenido (FCP) | 1,0 | 0,3 | 0,4 |
  | Título del artículo | 1,0 | 0,3 | 0,4 |
  | Imagen principal (LCP) | 3,7 | 0,3 | 1,1 |
  | **Primera tarjeta de producto** | **10,2** (10,2–10,6) | 3,4 (3,0–3,7) | 3,6 (3,4–3,8) |
  | Foto de la primera tarjeta | 11,6 | 3,5 | 4,1 |
  | **Las 24 tarjetas** | **15,3** (15,0–16,0) | 9,0 (8,4–9,2) | 8,3 (7,8–8,7) |
  | Peticiones | 106 | 106 | 103 |
  | Peso total | 1,7–3,1 MB | 0,4 MB | 4,1 MB |
  | JavaScript | 952 kB (11) | caché | 898 kB (10) |
  | Imágenes | 2,0 MB | 0,4 MB | 3,1 MB |
  | Peticiones a GraphQL | 37 | 37 | 37 |
  | `/api/auth/me` | 22 | 22 | 22 |
  | Bloqueo del hilo (TBT) | 0,48 | 0,15 | 0 |
  | Salto de layout (CLS) | 0 | 0 | 0,002 |

  Perfil «móvil 4G»: el de la medida de Kondomeriet del 19/11 (412×915, DPR 2,625, 150 ms, 1,6 Mbps de bajada, CPU 4×). En móvil sale el aviso de cookies de Aller encima; no se pulsa.
- **Dónde se va el tiempo hasta la primera tarjeta** (fin de cada paso, medianas):

  | Paso | Móvil 4G | Escritorio |
  |---|---|---|
  | JS del bloque de Vio (`VioProductsBlock-*.js`) descargado | 6,4 | 0,6 |
  | `/api/vio/bootstrap` (Replit) responde, tras `status` y `public-config` | 7,7 | 2,2 |
  | `api.vio.live/v2/mobile/surface` responde | 9,4 | 2,7 |
  | Sale la primera consulta a GraphQL | 9,8 | 3,3 |
  | Vuelve → primera tarjeta | 10,2 | 3,6 |

  - Hay ~3 s fijos aunque la red sea rápida o todo esté en caché: una cadena de llamadas una detrás de otra (tres al servidor de Replit a ~0,5 s cada una, luego `surface`, luego GraphQL).
  - Después, los bloques cargan de uno en uno: 37 consultas a GraphQL en serie suman ~4,7 s hasta la última tarjeta.
  - En móvil, además, nada de Vio empieza hasta que baja el JS de la página (952 kB a 1,6 Mbps).
  - No hay `preconnect` a `api.vio.live`, `graph-ql.vio.live` ni `www.boots.no`.
- **Cómo repetir la medida** (laptop de Angelo, usa el Chrome instalado):
  `cd ~/vio-reportes/perf && node medir-articulo.mjs "<url>" --runs 5 --profile movil4g --warm --out <fichero>.json` y lo mismo con `--profile escritorio`. Resultados de hoy: `boots-2026-11-25-movil4g.json` y `boots-2026-11-25-escritorio.json` en esa carpeta. Las visitas van marcadas como internas (`vio.internal.v1`).

## Decisions
- Ninguna. La etiqueta de envío gratis queda a decisión de Angelo y Boots.

## Blockers
- Saber qué cobra el Shipping Assistant de Boots en nuestra kasse para envío a domicilio (hace falta una compra con dirección o que Boots lo confirme).
- Replit: publicar la 0.40.2 en la web real.

## Next session
- Repetir la medida tras cada mejora, con el mismo comando, y comparar con esta tabla.
