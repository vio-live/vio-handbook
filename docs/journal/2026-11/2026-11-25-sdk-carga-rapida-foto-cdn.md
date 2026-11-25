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

- **Campaigns a prod, `develop` entero** (OK de Angelo, ~15:00 UTC): [campaigns#47](https://github.com/vio-live/vio-campaigns-microservice/pull/47) (`a9b730b`), con un árbol idéntico a `develop` (`04e4c79`) y `main` mezclado con `-s ours`. Los commits propios de `main` (#41, #43, #45) eran cherry-picks de otros que ya están en `develop`. Entra la #46 (foto para todas las surfaces y por plataforma) y la #37 (el regalo del cupón en el canal y el chequeo diario de los códigos, CronJob `campaigns-discount-check` a las 06:00 UTC).
  - **Antes, la migración 1793300 en prod** (`surface_campaign_discount_code.problem` y `problem_notified_at`, más su fila en `migrations`), con un script idempotente desde el pod de users. Sin ella, elegir un código en el dashboard y el chequeo diario habrían fallado.
  - Deploy run 45640217965 terminado sin errores (build y deploy). Primera pasada: `surfaces=2 written=16 failed=0` (~3,9 MB sin comprimir). La surface 1 (Aller) lleva sus 6 catálogos (campaña 8 / canal 487: 18 productos), y el logo y las promesas de Boots ya están en la foto.
  - **Cloudflare guarda los 404:** una petición hecha antes de que exista el fichero deja un 404 en caché unos minutos, aunque la URL cambie de query. Solo pasa la primera vez que se crea el fichero de una surface.

- **«Todo a prod» (Angelo, ~15:15 UTC): inventario de `develop` frente a prod en los 14 repos de Commerce.** Solo dos tenían algo de `develop` sin subir: lo de Faves (#125 y #117).
  - shopcart [#126](https://github.com/vio-live/vio-shopcart-microservice/pull/126) (`140f3cc`): `/discount/coverage` dice si el canal vende el regalo. Desplegado (run 45642924205), con 2 pods sanos. `tsc` sin errores y discount 257/257. Falla `store-coupon-cart.unit.spec.ts` («the cache first, then the shop»), igual en `main`: viene de antes.
  - webapp [#118](https://github.com/vio-live/webapp-vio-commerce/pull/118) (`74ae90c`): los avisos del código de campaña en el selector y en las notificaciones. Vercel Production terminado; 190/190 tests.
  - **Lo que NO se subió a propósito** (en estos repos `develop` está por detrás de prod; copiarlo encima borraría cosas):
    - los `pdb.yaml` de casi todos los charts;
    - las sondas y los recursos de products;
    - los mercados disponibles de graphql (en `develop` solo hay un `console.log`);
    - el consumidor Pub/Sub de extensions (pendiente desde el 17/11);
    - la suscripción automática de middleware (prod la quitó el 15/09);
    - el bump del kernel a 1.0.292 en template y tracking (prod sigue en 1.0.282 sin necesitarlo).
- **SDK 0.41.0:** #168 mergeada (`faf6296`). Hay una copia limpia de `main` lista para `npm publish` en `~/vio-commerce/worktrees/sdk-publish-0410`; la publica Angelo.

- **SDK 0.41.0 en npm** (`latest` a las 15:36 UTC, publicada por Angelo; `exports` con `./preload`). Texto a Replit en el [handoff](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md); falta que Replit la suba y volver a medir el artículo de Boots (partida ~2,4 s).

- **Prueba de la 0.41.0 contra prod** (~15:50 UTC, página local de `examples/` sobre `main` = la versión publicada, key de la surface 1, `?vio_internal=1`, campaña 8):
  - la foto `….web.js` llega en ~0,27 s (59 → 325 ms) en paralelo con config y surface;
  - las 4 tarjetas de Boots salen de la foto a los ~335 ms, **sin ninguna petición a `graph-ql.vio.live`**;
  - la ficha muestra el logo de Boots, el precio con el tachado (183,92 / 229,90), «Kjøpsvilkår · Angrerett og retur» y las 3 promesas;
  - el carrito funciona y se vació al terminar.
  - El checkout de Kustom **no arranca desde localhost**: Kustom live rechaza `merchant_urls.confirmation` en http (`400 BAD_VALUE Bad value: confirmation`). Es lo esperado; desde https funcionó en la 4145.
  - Efecto visible de la tarifa a 1 kr: la ficha dice «Frakt fra 1 Kr» (antes, con 0, «Gratis»).

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
