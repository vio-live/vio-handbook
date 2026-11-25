---
date: 2026-11-25
session: Vio- Merge
participants: [angelo, claude]
status: live
---

# SDK web: carga rápida con la foto del CDN y la interfaz en dos tiempos

## Goal
Angelo (25/11): «tenemos un tema que arreglar urgente y es el tiempo de carga». Lo de Kondomeriet en Vev
(foto en el CDN + JS ligero, LCP de 4,7 a 0,7 s) para la SDK web en los artículos (Replit/Mote & Livsstil y
cualquier publisher).

## Done
- **Medición de partida** (artículo de Boots en la copia de Replit, caché caliente, buena red): productos a
  ~2,4 s, todo en cascada: configuración de Replit → su `/api/vio/bootstrap` (proxy) → SDK entera
  (~540 KB min) → `/v2/mobile/surface` → 6 GraphQL → imágenes grandes de boots.no. Replit importa `/ui`
  con import dinámico, así que se trae carrito, checkout y ficha antes de pintar.
- **campaigns** [#46](https://github.com/vio-live/vio-campaigns-microservice/pull/46) (mergeado, **en QA**):
  - foto de **toda surface activa con campaña activa**, sin la lista `CDN_SNAPSHOT_CAMPAIGN_IDS`;
  - un fichero por plataforma web, `snapshots/<hash>.<web|custom-web|vev>.{json,js}`, además del de
    siempre, que no cambia (lo lee el paquete de Kondomeriet);
  - productos con `tags sku barcode categories` y `tax_*` (superconjunto de `GetProductsByIds`);
  - límite de 5 MB y una línea de resumen por pasada.
  - En QA: 10 surfaces, 80 ficheros, ninguno fallido; Mote QA (13), 44 productos en 100 KB.
  - ⚠️ En QA la foto no pasa por `container.vio.live`: está en `containerqasc.blob.core.windows.net/reachu-uploads-qa`
    (otra cuenta de almacenamiento). Prod: `container.vio.live/reachu-uploads-production`.
- **SDK** [#167](https://github.com/vio-live/vio-web-sdk/pull/167) (mergeado en `main` `8cbdf87`, **sin publicar**):
  - `Vio.init()` carga la foto `<hash>.<platform>.js`; fresca (< 10 min), `bootstrap()` responde de ella
    (la API la reemplaza al llegar) y `getByIds()` también (mismo mercado, `large`, key e ids que conoce;
    nunca `useCache: false` ni un producto en dos canales);
  - `@vio-live/web-sdk/preload` → `preloadVio()` (~3 KB gz), `snapshot: false` para CSP estrictas, `preconnect`;
  - **interfaz en dos tiempos**: `/ui` define tarjetas/carrusel/reel al momento y carga ficha, carrito y
    checkout (≈80 % de la UI) aparte, en reposo o al primer uso; `show()/close()` y el clic en una tarjeta
    se guardan y se repiten. React sin cambios. `/ui` deja de exportar esas tres clases como valor.
  - Peso antes de los productos: ~78 KB gz en vez de ~138 KB.
  - Tests: 27 nuevos; suite 1530 en verde, los 16 rojos son los de Node 26 de siempre (iguales en `main`).
    Un test de descuentos dependía del orden (un único método se autoselecciona) y se arregló.
  - Probado en navegador contra QA (surface 13): foto cargada, carrusel de 12 productos sin GraphQL propio,
    ficha, carrito y checkout abren; sin errores de red.
- **PR de la versión 0.41.0** ([vio-web-sdk#168](https://github.com/vio-live/vio-web-sdk/pull/168)): solo #167. Es minor porque `/ui` deja de exportar como valores las clases del carrito, del checkout y de la ficha. Quita además el enlace `node_modules` que c3d9669 coló en `main` (el `.gitignore` decía `node_modules/` y eso no ignora un enlace). npm no se vio afectado. La publicación la hace Angelo.

## Decisions
- Foto para todas las surfaces, sin lista ni flags (Angelo: «arranca con todo»).
- La interfaz en dos tiempos, con las llamadas guardadas mientras carga (Angelo: «haz también lo de la interfaz»).

## Blockers
- **campaigns a prod**: `develop` lleva también [#37](https://github.com/vio-live/vio-campaigns-microservice/pull/37)
  (regalo del código en el canal + chequeo diario de códigos) sin publicar; aplicar solo #46 sobre `main`
  choca en los tests. Propuesto release de `develop` entero; espera la frase de Angelo.
- **SDK en npm**: lo publica Angelo.

## Next session
- Con la frase: release de campaigns a prod y comprobar `<hash>.web.js` de la surface 1.
- Tras publicar la SDK: texto a Replit (abajo, en el handoff) y medir el artículo de Boots otra vez.
