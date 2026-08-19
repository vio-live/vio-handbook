# Handoff — Vio Sync (app de Shopify)

> Estado al **2026-08-18**. App embebida de Shopify reescrita de cero (legacy Next.js → React Router 7).
> **EN PRODUCCIÓN** y **enviada a review del Shopify App Store el 18-ago** —
> esperando respuesta de Shopify. `vio-live/vio-shopify-sync` rama `master`,
> deployada en **`https://sync.vio.live`** (Vercel; dominio renombrado el
> 12-ago, ver "App Store submission" abajo — el nombre anterior
> `shopify-sync.vio.live` está MUERTO, no usarlo más). Ver journal
> [2026-08-11 (2)](../journal/2026-08/2026-08-11-2.md) para el push a prod y
> [2026-08-18 (2)](../journal/2026-08/2026-08-18-2.md) para todo el proceso
> de submission.
> Local: `/Users/angelo/vio-sync`. La rama `prod-compliance-merge` mencionada
> en versiones previas de este doc ya se mergeó — no existe más. El flujo de
> trabajo actual es rama corta → PR a `master` Y a `staging` → merge de los
> dos (mantenerlos en paridad; verificar con `git diff vio/master
> vio/staging --stat`, tiene que salir vacío).

## Qué es (dirección del flujo)

La app es de **EXPORTACIÓN**: empuja productos de **Shopify → Vio**. El merchant es un **supplier**: sus productos de Shopify se listan y se venden en Vio.

```
Productos:   Shopify ──(export / "Export selected")──▶ Vio   (se venden en Vio)
Una venta:                              ocurre en Vio
La orden:    Shopify ◀──(webhook)──── Vio   (para que el merchant la despache)
El pago:     lo cobra el merchant
```

Ojo con la terminología: el legacy usaba **"import"** desde la perspectiva de **Vio** ("imported as drafts to Vio") = traer productos *hacia* Vio = lo que para el merchant es **exportar**. El endpoint legacy lo confirma: `connectionType=export`. En la app nueva la UI dice **"Export"** sin ambigüedad.

**Decisión del producto (2026-06-23):** la app es **solo exportar, gratis, sin review**. Se sacó del scope: import masivo del catálogo, pagos/cuenta bancaria, publishing/review.

**⚠️ Qué es Vio realmente — corregido 2026-08-13, NO es un marketplace.**
Durante la submission asumí (mal, sin verificar) que "se venden en Vio" =
Vio es un sitio de compra propio tipo Amazon/Etsy, y escribí toda la
categoría/compliance del App Store sobre esa base. Angelo lo corrigió:
Vio deja poner los productos de la tienda Shopify **dentro de apps de
terceros** — apps de diarios como **VG** y **Dagbladet** (medios noruegos),
otras apps mobile — y via integración con **Vev** (herramienta de contenido
interactivo) un **redactor arma un artículo insertando productos de la
tienda**, y el lector genera la orden ahí mismo, sin salir del artículo/app
del diario. Es "shoppable content" / comercio embebido en contenido
editorial de terceros, no un destino de compra propio de Vio. Esto cambió:
la categoría del App Store (de "Marketplaces" a **"Product feeds"**, ver
"App Store submission" abajo) y cómo se justifica que el checkout no pase
por Shopify (no es "bypass" de un checkout de Shopify que existía — el
comprador nunca estuvo en la tienda Shopify, estaba leyendo una noticia).
**Lección:** verificar el modelo de negocio real ANTES de escribir
categoría/compliance, no inferirlo de señales parciales — ver
[lección dedicada](../lessons/verify-product-model-before-compliance-copy.md).

## Dónde vive

| | |
|---|---|
| Repo | `vio-live/vio-shopify-sync`, rama **`master`** = producción (el legacy Next.js ya no está en el flujo activo) |
| Local | `/Users/angelo/vio-sync`; remotes: `vio` → vio-shopify-sync, `origin` → template de Shopify (no se puede pushear) |
| Nota git | El repo es un **clone shallow** del template → para pushear a `vio` puede hacer falta `git fetch --unshallow origin` |

## Stack

- **React Router 7** + `@shopify/shopify-app-react-router@1.1` + **App Bridge 4** + **Polaris web components** (`s-page`, `s-table`, `s-button`, `s-select`, `s-search-field`, `s-thumbnail`, `s-badge`, …). **NO** Polaris React, **NO** antd.
- `flatRoutes()`; loaders/actions; tipado por `@shopify/polaris-types` (`polaris.d.ts`, ~7k líneas — ahí están los props válidos de cada `s-*`).
- Sesiones: **Prisma + SQLite** (template default) → **a migrar a Redis** (ver Pendientes).
- API Admin de Shopify: **October25** (`2025-10`).

## Auth a Vio: **API KEY** (no Firebase)

El merchant pega su **API key de Vio** en la pantalla de conexión.

- La key va **CRUDA** en el header **`Authorization`** (sin `Bearer`, sin transformar) — tal como espera el backend (visto en el plugin de Woo: `Authorization: get_option('vio_apikey')`).
- Se guarda **por-tienda** en un **metafield app-owned** (`$app:vio` / `apikey`), vía `metafieldsSet` sobre la `currentAppInstallation` (no requiere scope extra: la app es dueña de sus metafields `$app`).
- **Connect**: valida la key con `GET me` → si OK, la guarda → muestra productos.
- **Disconnect**: borra la key (`metafieldsDelete`) + avisa al backend (`DELETE sales-channel`, best-effort) → vuelve a la pantalla de conexión.
- **Gating**: sin key guardada NO se ven productos — la pantalla principal es "Connect to Vio".

Quedó **afuera** todo lo del legacy: Firebase (signInWithCustomToken/Password), login email/password, y el metafield-uid. **Cero llamadas a Google/Firebase ahora.** Server-side en `app/lib/vio.server.ts`.

## Rutas y endpoints que usa

**Shopify Admin GraphQL** (`https://{shop}/admin/api/2025-10/graphql.json`):
- `query VioProducts` — lista de productos (con paginación cursor + filtro)
- `query VioApiKey` — lee la API key guardada (metafield `$app:vio`)
- `query VioAppInstallation` — id de la AppInstallation (owner del metafield)
- `mutation SetVioApiKey` / `mutation ClearVioApiKey` — guarda / borra la key

**Backend Vio** (`${VIO_API_HOST}` + path, header `Authorization: <apikey>`):
| método | path | uso |
|---|---|---|
| GET | `/api/users/me/sales-channel?channel=SHOPIFY` | valida la key / "me" |
| GET | `/api/listings?page=0&size=1000` | productos ya exportados |
| POST | `/api/products/shopify-sqs` | export (sync) |
| DELETE | `/api/products/shopify` | quitar de Vio |
| DELETE | `/api/users/me/sales-channel` | disconnect (best-effort) |

**Rutas propias** (servidas en la URL del entorno): `/` (landing) · `/app` (conexión/productos) · `/app/additional` (Connection & log) · `/auth/*` · `/webhooks/app/uninstalled` · `/webhooks/app/scopes_update`.

## Cómo correr en local

> ⚠️ **Los quick tunnels de Shopify (`*.trycloudflare.com`) están ROTOS en la red de Angelo** — devuelven 404 a TODO (probado hasta con un server trivial). Hay que usar un túnel cloudflared **NAMED**. Esto costó horas de debug; no volver a intentar con el quick tunnel.

```bash
# 1) túnel named (shopify-dev.vio.live → localhost:8082) — dejarlo corriendo
cloudflared tunnel --config ~/.cloudflared/config-shopify-dev.yml run

# 2) dev apuntando al túnel — SIEMPRE con --config vio-sync-dev (nunca el de prod/staging)
cd /Users/angelo/vio-sync
npm run dev -- --config vio-sync-dev --tunnel-url=https://shopify-dev.vio.live:8082 --store development-jox88zjn.myshopify.com
```

- Dev store: `development-jox88zjn.myshopify.com`.
- Si tira 500 "Invalid path" en cualquier ruta (`/healthz` incluido): confirmar
  primero que `shopify.web.toml` existe en la raíz del repo, antes de
  sospechar de otra cosa (ver nota en "Multi-entorno" arriba).
- El `.env` (gitignored) sólo necesita **`VIO_API_HOST`** (la API key la pone el merchant en la UI, no va en env).
- `npm run typecheck` antes de dar por hecho un cambio de UI (valida los props de los `s-*`).

## Multi-entorno

| Entorno | App URL | Config file | client_id | Backend |
|---|---|---|---|---|
| Dev (solo local, con túnel) | `shopify-dev.vio.live` | `shopify.app.vio-sync-dev.toml` | `3b83a87d…` | `VIO_API_HOST` dev |
| Staging | `sync-staging.vio.live` | `shopify.app.vio-sync-staging.toml` | `62494b70…` | `VIO_API_HOST` staging |
| Prod | `sync.vio.live` | `shopify.app.vio-sync.toml` | `8994c429…` | `VIO_API_HOST` prod |

⚠️ **Los dominios de prod y staging se renombraron el 12-ago** (antes
`shopify-sync.vio.live` / `shopify-sync-staging.vio.live`) — Shopify no
permite la palabra "shopify" en la URL de una app que se somete a review.
Los nombres viejos están **muertos** (no resuelven DNS). Ojo: cuando Alan
renombró el DNS de **staging** no actualizó el `.toml` en el mismo commit —
quedó con `redirect_urls` apuntando a un dominio muerto durante unos días,
lo encontré y corregí el 13-ago. Si algo de OAuth/redirect falla en un
entorno, lo primero a chequear es que `application_url`/`redirect_urls` del
`.toml` coincidan con el dominio DNS real (`curl -I` al dominio).

**Riesgo del client_id compartido — resuelto (2026-08-11):** existía un
`automatically_update_urls_on_dev = true` en el toml de PROD, y ese mismo
`client_id` (`8994c429…`) se usaba para dev local con túnel — cualquier
`shopify app dev` corrido así le pisaba `application_url`/`redirect_urls`
reales. Se corrigió: **se creó `shopify.app.vio-sync-dev.toml`**, un config
de Partners separado solo para dev local (con `automatically_update_urls_on_dev
= true`, seguro ahí porque no es un dominio real de nadie). **Usar siempre
`--config vio-sync-dev` para levantar local, nunca el de prod/staging.**

Nota separada, no confundir con lo de arriba: para que `shopify app dev`
funcione en absoluto (sin importar qué config) hace falta que
**`shopify.web.toml` exista en el repo** (`roles = ["frontend","backend"]`).
Es config exclusiva del proxy local del CLI, no la usa Vercel para nada —
pero si falta, **todo** (`/healthz`, `/privacy`, hasta el embed real) tira
500 "Invalid path". Se borró por error una vez (commit "clean and build
toml file to prod" del 11-ago, alguien lo confundió con limpieza de prod) y
costó gran parte de una sesión encontrar la causa real leyendo el código
fuente del CLI (`chunk-PUTZFF2Z.js`). Restaurado — **tiene que seguir
versionado para siempre**, aunque parezca no usarse.

## App Store submission

**Estado: enviada a review el 2026-08-18, esperando respuesta de Shopify.**
Al volver, lo primero es chequear el estado en el Partner Dashboard (Apps →
Vio Sync → App submissions). Todo el contenido del listing (introduction,
details, features, subtitle, search terms, categoría, scopes, privacy
policy, screenshots, test account, testing instructions) vive en
**`docs/SUBMISSION.md`** del repo del app — esa es la fuente de verdad
completa, acá solo el resumen de decisiones que no son obvias releyendo ese
doc.

**Categoría**: Sales Channels → Selling online → tag **"Product feeds"**
(no "Marketplaces" — ver corrección del modelo de negocio arriba en "Qué
es"). Tag secundario: "Inventory sync".

**Self-review AI del App Store** (skill oficial `shopify-app-store-review`
del Shopify AI Toolkit, corrido manualmente vía sub-agentes porque el
plugin recién instalado no cargó en la sesión activa): 31 requisitos
evaluados de las secciones aplicables (Policy, Functionality, Security), 25
✅ directo, 6 ⚠️ que se terminaron resolviendo:
- **1.1.2 (bypass de checkout) y 1.1.15 (refunds)**: no son violación — el
  comprador nunca pasa por el checkout de la tienda Shopify (nunca estuvo
  ahí), paga vía el procesador propio de Vio en el contexto embebido
  (artículo/app de terceros), y la orden se sincroniza a Shopify ya pagada.
  Sin la misma confianza que un "marketplace connector" clásico (Amazon/eBay
  sync, patrón muy transitado) — esto es más inusual, quedó explicado
  explícito en las testing instructions para el reviewer en vez de asumir
  que lo va a inferir solo.
- **1.2.1 (Billing API)**: no aplica, la app es gratis y no cobra por
  ningún lado (fuera del propio Shopify).
- **Scope `write_locations`**: sacado — no se escribe, solo se lee
  (`read_locations` se mantiene, usado para resolver location en
  fulfillment).
- **`app/lib/redis.server.ts` con `tls: { rejectUnauthorized: false }`**:
  reportado a Alan (comentario en Trello
  [fiDbs5A2](https://trello.com/c/fiDbs5A2)), no se toca desde este repo —
  es infra/backend.
- **Form de login manual** (`myshopify.com` domain entry, plantilla stock
  de Shopify) en `_index/route.tsx`: eliminado — se mantiene el redirect
  legítimo por `?shop=`, ahora pasa por `authenticate.admin()` antes de
  redirigir (fix de Alan, "immediately authenticates after install").

**Regla descubierta sobre naming**: Shopify no permite la palabra
**"shopify"** en textos del listing (subtitle, search terms, título/meta de
SEO) ni en la URL de la app que se somete — confirmado en la práctica (no
en la doc oficial de requirements que llegué a leer), forzó reescribir toda
la copy y renombrar los dominios (ver "Multi-entorno" arriba).

**Sin resolver, para cuando vuelva Alan**: si el order-sync a Shopify marca
las órdenes creadas desde una venta de Vio con `source_name` (u otro
mecanismo del Orders API) indicando canal externo, en vez de crearlas como
si vinieran del checkout nativo de Shopify — importa para la solidez del
argumento de 1.1.2 de arriba. Vive en el backend, no en este repo.

**Credenciales del reviewer**: cuenta de test + API key de Vio para la
tienda `shop-user-to-submit` (app prod `vio-sync`, no la de dev) — pegadas
directo en el campo "Test account" del Partner Dashboard por Angelo, **NO
están en ningún archivo de este repo ni de vio-handbook** (regla de higiene
de credenciales — nunca committear secretos reales, ni siquiera de cuentas
de test).

## Estado — hecho ✅

- **Enviada a review del Shopify App Store** (2026-08-18) — ver sección de
  arriba.
- **En producción real**, deployada en Vercel, dominio propio (`sync.vio.live`,
  renombrado 12-ago), probada end-to-end con tienda/cuenta reales (2026-08-11,
  ver journal).
- Conexión por **API key** + **gating** (no productos hasta conectar) + **Disconnect**.
- **My products**: tabla `s-table` con búsqueda, filtro de status, filtro exported/not,
  columna **Type** (Single / N variants), badge **✓ Exported** con **actualización
  optimista** (sin refresh manual tras export/remove), selección múltiple con
  **Export / Remove bulk**, modal de bienvenida al conectar, **paginación** por
  cursor (20/pág).
- **Connection & log**: estado (Connected / API reachable / nº exportados) + log
  de exportados + Disconnect.
- **Rebrand total a Vio**: cero `outshifter`/`reachu` en el código.
- **Suite de tests**: 166 tests (Vitest + Testing Library), coverage 100% en
  statements/branches/functions/lines, typecheck y lint limpios.
- Session storage: **Redis (Upstash) condicional** — si hay `REDIS_URL` usa
  `RedisSessionStorage`, si no cae a Prisma/SQLite (dev local sin Redis).
- Bug de fondo de token de Shopify diagnosticado y con fix propuesto (ver
  Trello [pmsXD6wr](https://trello.com/c/pmsXD6wr)) — el lock de
  `asyncrefreshTokenIfApply` en `vio-extensions-microservice` no es atómico
  bajo llamadas concurrentes; el mecanismo de refresh en sí SÍ funciona para
  uso secuencial (verificado en prod).

## Pendiente 🔜

1. **Esperar respuesta de Shopify sobre la submission** (enviada 18-ago) —
   si rechazan o piden cambios, el punto de partida es `docs/SUBMISSION.md`
   + la sección "App Store submission" de arriba.
2. **Confirmar con Alan** si el order-sync marca `source_name` (canal
   externo) en las órdenes creadas desde Vio — ver "Sin resolver" arriba.
3. **`shopify app deploy`** contra `vio-sync-staging` (y confirmar que
   también se hizo para prod) para que Partners registre de verdad los
   `redirect_urls` nuevos (`sync.vio.live` / `sync-staging.vio.live`) — el
   `.toml` ya está corregido pero eso no le avisa a Shopify solo.
4. **CI del repo tiene el job de yarn roto** (bug conocido de Yarn Classic
   con vite/vitest — el repo no usa yarn.lock, solo npm) — no bloquea nada
   real, ensucia el status de cada PR. Flag ya viva como task sugerida.
5. **Pub/Sub de prod** apunta al proyecto GCP de **staging**
   (`tipio-staging-development`) — falta un topic real de producción.
6. **Probar el bug de concurrencia del token bajo carga real** (export masivo
   en prod, no solo unos pocos productos secuenciales) — ver
   [pmsXD6wr](https://trello.com/c/pmsXD6wr).
7. **Feature media (1600x900) y screenshots reales** del listing — texto ya
   escrito (ver `docs/SUBMISSION.md`), faltan los assets de imagen en sí;
   los screenshots de estados conectados necesitan la API key de test real
   (ya la tenemos, ver "Credenciales del reviewer" arriba).

## Gap vs legacy (decidido)

| Legacy tenía | Decisión |
|---|---|
| Login Firebase (email/password) | ❌ reemplazado por **API key** |
| Import masivo del catálogo (`importing` + `congrats` + `markImported`) | ❌ fuera de scope (solo export por selección) |
| Estado "connected vs imported" (`shopifySupplier.importedProducts`) | colapsado → **connected = listo para exportar** |
| Payments / cuenta bancaria | ❌ fuera (app gratis; vive en el dashboard de Vio) |
| Publishing / review (Vio revisa ~3 días) | ❌ fuera (sin review) |
| Disconnect / unregister | ✅ **agregado** |

## Decisiones clave

- **API key en vez de Firebase** — más simple, sin Firebase client, sin email/password.
- **Reescritura React Router** del legacy Next.js — el legacy (Next 10 + Koa) no corre en Node moderno (Next 10 pide Node ≤16; postcss `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- **Túnel cloudflared named** — los quick tunnels están rotos en la red.
- **Solo exportar, gratis, sin review** — scope del producto (2026-06-23).
- **Vio no es un marketplace propio** — es comercio embebido en apps/contenido
  editorial de terceros (VG, Dagbladet, Vev). Corregido 2026-08-13 después de
  escribir la categoría/compliance del App Store sobre la premisa equivocada.
  Determina la categoría del listing y el argumento de por qué el checkout
  fuera de Shopify no viola 1.1.2 — ver "Qué es Vio realmente" arriba.
