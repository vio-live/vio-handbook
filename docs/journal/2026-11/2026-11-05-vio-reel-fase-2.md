---
date: 2026-11-05
session: vio-reel fase 2 — experiencias en el micro de campañas
participants: [angelo, claude]
status: live
---

## Goal

Arrancar [ADR-0042](../../decisions/0042-vio-reel-experiencias-gestionadas-desde-commerce.md): el reel
de Replit como experiencia gestionada desde Commerce, editable desde Replit y desde Vio, con vídeo en
Cloudflare Stream. Hoy, la fase 2 (entidad, API y subida).

## Done

- **Lectura del demo** `mote-livsstil-hub-vio.replit.app/demo/vio-reel`: el reproductor es de Replit
  (unos 45 KB de React); la SDK 0.37.7 pone sponsor, carrito, checkout, ficha y analítica. La config
  está en el código del artículo y los mp4 en el storage de Replit. Enseña tres productos de Faves bajo
  la campaña de Careless QA (los copié ayer al canal 513).
- **ADR-0042** escrito y aceptado por Angelo (`a169904`, `d3e0102`). Mux descartado: la analítica es
  nuestra. Angelo fijó dos cosas que la propuesta de Aller no decía: Aller edita en Replit y nosotros
  en Vio, sobre la misma experiencia; y el vídeo necesita infraestructura de verdad (trozos, calidades,
  CDN) → Cloudflare Stream.
- **Kernel** `package-database` [#31](https://github.com/vio-live/package-database/pull/31)
  (`f7583d0`): migración `1792900000000-surface-experience` (`surface.management_api_key` UNIQUE,
  `surface_experience`, `surface_experience_revision`, `surface_experience_media`), entidades,
  repositorios y enums. Nombres de FK los de TypeORM, para que el diff del micro quede limpio.
- **Micro de campañas** [#31](https://github.com/vio-live/vio-campaigns-microservice/pull/31)
  (`feat/vio-reel-experiencias`): dominio del documento (`src/domain/experience.ts`), puertos,
  adaptadores en memoria, TypeORM y Cloudflare Stream, guards de key de gestión, servicio y dos
  controllers (`/v2/experiences` con `X-Management-Key`, `/api/experiences` con Firebase), emisión y
  rotación de la key desde `/api/client-apps/:id/management-key`, README. Tests: 355 en memoria y 191
  contra MySQL 8 en Docker (migración real + adaptadores de producción). La suite de MySQL estaba
  atrás desde el 19/10 (faltaban `brand_profile.terms_url/refund_policy_url/highlights` y
  `surface_campaign.publisher_commission_pct`): corregida en el mismo PR.
- **Cómo se trabajó sin registro npm** (token local en 401): `node_modules` copiados del pod de
  campaigns de QA (`kubectl exec … tar | tar`) y el kernel compilado en local con esos mismos
  `node_modules` por symlink, con el `dist` copiado encima de `node_modules/@vio-/database` del micro.
  Sirve para type-check y tests; el pin de `package.json` se sube cuando salga la release.
- **Subida a QA (tarde, con el OK de Angelo):** migración aplicada en la MySQL de QA desde el pod de
  users (script idempotente, 11+8+14 columnas, fila en `migrations`); kernel #31 mergeado con
  `[skip ci]` y release `pkg=all` → **1.0.290** (run 42021266384, el freno de migraciones paró el
  dispatch como debe); `kernel-published` disparado a mano a los 12 micros; bump de campaigns
  (`26c3de6`) desplegado y sano; micro #31 mergeado (`15369b2`) y desplegado con rolling update sin
  corte. **Prueba de humo en QA** contra la surface 13 (Careless QA, key de gestión puesta a mano en
  la base): crear → media `url` → borrador con `If-Match` (428 sin él) → publish rechaza un producto
  ajeno (400 `PRODUCT_NOT_IN_SPONSOR_CATALOG`, 1302) → publish OK revisión 1 → lectura pública con
  `ETag W/"exp-1-r1"`, `Cache-Control` público y 304 → preview con la key de gestión, 401 sin key y
  con otra. Subidas a Stream: 503 `MEDIA_UPLOADS_NOT_CONFIGURED` (sin credenciales en QA). La
  experiencia 1 queda en QA como base para la fase 3 de Replit.
- **Aviso del bump a los 12:** seis `deploy.yml` (api, collection, extensions, shopcart, tracking,
  users) salieron rojos por `exceeded its progress deadline` en el `kubectl rollout status` de 10
  minutos: once micros rodando a la vez en el nodo de QA. Los pods nuevos quedaron 2/2 sin reinicios
  y `rollout status` posterior dice «successfully rolled out» en todos; catálogo (GraphQL + products)
  y métodos de pago (api) responden. Es un timeout del pipeline, no un fallo del kernel. Los errores
  401 de extensions son la tienda de prueba de Alan desconectada (tarjeta #472), de antes.
  `collections` fue el único con un pod nuevo colgado en `istio-init` (el init terminó y nunca salió):
  borrado el pod, el ReplicaSet lo recreó y el rollout cerró bien.
- **Dashboard (fase 5 mínima, tarde):** webapp
  [#98](https://github.com/vio-live/webapp-vio-commerce/pull/98) mergeado en `develop` y ya en el
  bundle de `dashboard-staging.ecom.vio.live` (deployment `dpl_5cBjUiJW…`, 13:17 UTC): tarjeta
  **Management key** en el detalle de la surface (generar, rotar, revocar, copiar) y tarjeta
  **Experiences** en el detalle de la campaña (lista, alta por título, publicar con `If-Match`,
  borrar). Solo cuentas `internal` (`canManageExperiences`); **sin flags de entorno**, por decisión de
  Angelo («es como hacer todo a medias»): a `main` no va hasta que esté completo. Detalle del agente
  front en [front-commerce-vio-reel-dashboard](./2026-11-05-front-commerce-vio-reel-dashboard.md).
- **Fase 4, `<vio-reel>` en la web SDK** (vio-web-sdk [#141](https://github.com/vio-live/vio-web-sdk/pull/141),
  mergeado en `main`, **sin publicar en npm**; CHANGELOG en Unreleased): feed vertical con snap, bucle,
  autoplay silenciado, precarga solo del siguiente, tarjetas compactas que abren `<vio-product-detail>`
  sin parar el vídeo, badge de cue, mute, pantalla completa, progreso; HLS con `hls.js` del CDN solo
  cuando hay un reel; la revisión montada se mantiene y la nueva se guarda para la siguiente apertura;
  última revisión válida en `localStorage`; una experiencia de otra campaña no pinta nada
  (`sdk_error reel_incompatible`); tema solo por tokens `--vio-*`. `Vio.api.experience()` con ETag,
  `core/experience`, `observeImpression({ props })`, slot kind `reel`, wrapper React `VioReel`, demo
  `examples/reel.html`. Probado en el navegador contra staging con la experiencia 1 de la surface 13:
  vídeo, tarjetas de Faves, click → ficha abierta y el vídeo sigue. Dos tropiezos reales que salieron
  solo en el navegador: había que esperar al bootstrap antes de `Vio.commerceFor` (como hace el
  carrusel) y el `IntersectionObserver` con `root` en el feed se quedaba mudo; ahora el vídeo activo lo
  decide el scroll del feed y un observador de página pausa al salir de pantalla, con un fallback a
  400 ms. 23 tests nuevos; los fallos de `cart-manager.quantity` y `vio-cart.stepper` son previos en
  `main` en esta máquina (`localStorage` ausente en ese jsdom).
- Handoff para Replit: [vio-reel-replit-modo-remoto](../../handoff/2026-11-05-vio-reel-replit-modo-remoto.md).
  Script de la migración en QA: `docs/handoff/assets/2026-11-05-vio-reel/m-surface-experience-qa.js`.

## Decisions

- Key de gestión **por surface**, no por publisher (el alcance de una experiencia es la surface).
- La revisión publicada congela título y sponsor además de los vídeos.
- Comprobación de productos al publicar contra el catálogo del sponsor en la surface (moneda NOK,
  mercado el primero de la surface); Commerce caído = 503, nunca un publish sin comprobar.
- Slot (`binding.slot`) se guarda desde ya; la SDK que lo use es la fase 7.

## Blockers / open questions

- **Credenciales de Cloudflare Stream** (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`) en el
  `.env` de campaigns de QA (va horneado en la imagen: cambiar el blob y reconstruir).
- Angelo pidió que esto lo haga yo con mis agentes; Miguel solo donde yo no llego (release del kernel
  si falla el flujo por Actions, secretos).

## Next session

1. Cloudflare Stream en el `.env` de campaigns de QA (Angelo/Miguel) y probar una subida real.
2. Fase 3: que Replit pase su bloque a modo remoto con el handoff de arriba, contra la experiencia 1
   de la surface 13 (la key de gestión se rota desde `POST /api/client-apps/13/management-key`).
3. Publicar la SDK cuando Angelo lo decida (`SDK_VERSION` + package.json; CHANGELOG ya en Unreleased) y
   actualizar Replit; Vev fuera del flujo.
5. Editor completo en el dashboard (vídeos con subida directa, productos del canal del sponsor,
   cues, tema, vista previa con `<vio-reel>`), en `/campaigns/:id/experiences/:expId`.
4. Prod: la migración `1792900000000` antes del próximo release de campaigns a `main`.
   > [claude, 2026-11-05] Comprobado: products, extensions, api y orders ya llevan la 1.0.290 en `develop`, pero
   > ninguno consulta `surface` con la entidad del kernel. La migración solo bloquea el release de campaigns.
