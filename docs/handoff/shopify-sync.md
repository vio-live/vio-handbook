# Handoff — Vio Sync (app de Shopify)

> Estado al **2026-06-23**. App embebida de Shopify reescrita de cero (legacy Next.js → React Router 7).
> Repo: **`vio-live/vio-shopify-sync`**, rama **`rewrite/react-router-app`** (HEAD `d0452d4`).
> Local: `/Users/angelo/vio-sync`.

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

## Dónde vive

| | |
|---|---|
| Repo | `vio-live/vio-shopify-sync`, rama **`rewrite/react-router-app`** (el legacy Next.js sigue en `master`/`develop` del mismo repo) |
| Local | `/Users/angelo/vio-sync` — rama `main-cli`; remotes: `vio` → vio-shopify-sync, `origin` → template de Shopify (no se puede pushear) |
| HEAD | `d0452d4` |
| Nota git | El repo es un **clone shallow** del template → para pushear a `vio` hizo falta `git fetch --unshallow origin` una vez |

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

# 2) dev apuntando al túnel
cd /Users/angelo/vio-sync
npm run dev -- --tunnel-url=https://shopify-dev.vio.live:8082
```

- Dev store: `development-jox88zjn.myshopify.com`.
- El `.env` (gitignored) sólo necesita **`VIO_API_HOST`** (la API key la pone el merchant en la UI, no va en env).
- `npm run typecheck` antes de dar por hecho un cambio de UI (valida los props de los `s-*`).

## Multi-entorno

| Entorno | App URL | Config file | Backend |
|---|---|---|---|
| Dev | `shopify-dev.vio.live` (túnel) | `shopify.app.toml` / `shopify.app.vio-sync.toml` | `VIO_API_HOST` |
| Staging | `shopify-sync-staging.vio.live` | `shopify.app.staging.toml` (client_id a completar) | idem |
| Prod | `shopify-sync.vio.live` | `shopify.app.production.toml` (client_id a completar) | idem |

- Cada entorno = **una app de Shopify** (client_id distinto) + su `application_url`. CLI multi-config: `shopify app config use <env>` / `deploy --config <env>`.
- **Lío a ordenar**: hay 2 configs de dev — `shopify.app.toml` (`dfb8ce59…`) y `shopify.app.vio-sync.toml` (`8994c429…`, la **activa**). Consolidar a una.

## Estado — hecho ✅

- Conexión por **API key** + **gating** (no productos hasta conectar) + **Disconnect**.
- **My products**: tabla `s-table` con búsqueda, filtro de status, filtro exported/not, columna **Type** (Single / N variants), badge **✓ Exported**, selección múltiple + **Export / Remove**, **paginación** por cursor (20/pág).
- **Connection & log**: estado (Connected / API reachable / nº exportados) + log de exportados + Disconnect.
- **Rebrand total a Vio**: cero `outshifter`/`reachu` en el código (valores de contrato por env).

## Pendiente 🔜

1. **Session storage Redis** — reusar `lib/redis-store.js` del legacy (ioredis + Sentinel). **Ojo:** los hosts de sentinel son **internos de K8s** (`*.svc.cluster.local`) → **no se alcanzan desde Vercel**. Decisión de deploy atada a esto:
   - **Deploy en K8s** (mismo cluster) → reuso directo del Redis.
   - **Vercel** → hay que exponer el Redis externamente.
2. **`VIO_API_HOST` + una API key real** → probar connect / export / disconnect en vivo.
3. **`client_id`** de las apps de Shopify de staging/prod → completar los `.toml`.
4. **Confirmar contra el backend** (`vio-shopify-sync` backend / `vio-*-microservice`): (a) endpoint exacto para **validar la key**; (b) cómo asocia el backend **tienda ↔ key** (el plugin de Woo sólo manda `Authorization`; en Shopify, ¿la key implica la tienda o hay que mandar el `shop`?).
5. Consolidar las 2 configs de dev.

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
