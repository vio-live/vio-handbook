# Handoff — Vio Sync (app de Shopify)

> Estado al **2026-08-11**. App embebida de Shopify reescrita de cero (legacy Next.js → React Router 7).
> **YA ESTÁ EN PRODUCCIÓN**: `vio-live/vio-shopify-sync` rama `master` (HEAD `e730740`),
> deployada en `https://shopify-sync.vio.live` (Vercel). Ver journal
> [2026-08-11 (2)](../journal/2026-08/2026-08-11-2.md) para el detalle de la
> verificación de ese push.
> Local: `/Users/angelo/vio-sync` — hay una rama `prod-compliance-merge` con
> fixes de compliance/seguridad sobre `master` **todavía sin pushear**
> (pendiente OK de Angelo), ver sección "Pendiente" abajo.

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
| Repo | `vio-live/vio-shopify-sync`, rama **`master`** = producción (el legacy Next.js ya no está en el flujo activo) |
| Local | `/Users/angelo/vio-sync`; remotes: `vio` → vio-shopify-sync, `origin` → template de Shopify (no se puede pushear) |
| HEAD (prod) | `e730740` |
| Rama local sin pushear | `prod-compliance-merge` (GDPR + fix de seguridad + tests, ver Pendiente) |
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

# 2) dev apuntando al túnel
cd /Users/angelo/vio-sync
npm run dev -- --tunnel-url=https://shopify-dev.vio.live:8082
```

- Dev store: `development-jox88zjn.myshopify.com`.
- El `.env` (gitignored) sólo necesita **`VIO_API_HOST`** (la API key la pone el merchant en la UI, no va en env).
- `npm run typecheck` antes de dar por hecho un cambio de UI (valida los props de los `s-*`).

## Multi-entorno

| Entorno | App URL | Config file | client_id | Backend |
|---|---|---|---|---|
| Staging | `shopify-sync-staging.vio.live` | `shopify.app.vio-sync-staging.toml` | `62494b70…` | `VIO_API_HOST` staging |
| Prod | `shopify-sync.vio.live` | `shopify.app.vio-sync.toml` | `8994c429…` | `VIO_API_HOST` prod |

Alan consolidó (2026-08-11) de 5 tomls a estos 2 — los demás (`shopify.app.toml`
con `dfb8ce59…`, `production.toml`, `staging.toml`, `shopify.web.toml`) fueron
**borrados**, ya no existen.

⚠️ **Riesgo conocido, en proceso de arreglar**: el `client_id` de PROD
(`8994c429…`) es el **mismo** que se venía usando para dev local con túnel.
Ambos tomls tenían `automatically_update_urls_on_dev = true` — cualquier
`shopify app dev` corrido con ese config activo en una máquina de desarrollo
le pisa `application_url`/`redirect_urls` reales de producción. La rama local
`prod-compliance-merge` ya lo corrigió a `false` (ver Pendiente) — el
trade-off es que `shopify app dev` contra ese config deja de servir bien el
túnel local (probado: `/healthz` pasa de 200 a 500). **Recomendación pendiente:
crear una app de Partners separada solo para dev**, para no perder la
comodidad de local dev ni volver a exponer el riesgo.

## Estado — hecho ✅

- **En producción real**, deployada en Vercel, dominio propio, probada end-to-end
  con tienda/cuenta reales (2026-08-11, ver journal).
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

1. **Mergear + pushear GDPR compliance a `master`**: las 3 rutas de privacidad
   (`customers/data_request`, `customers/redact`, `shop/redact`) +
   `[webhooks.privacy_compliance]` en los tomls — **obligatorio para el
   Shopify App Store**, el release del 2026-08-11 salió sin ellas. Ya está
   listo en la rama local `prod-compliance-merge`, falta el OK de Angelo para
   pushear + que Alan corra `shopify app deploy` y redeploy Vercel.
2. **Separar app de Partners para dev** de la de prod (ver "Riesgo conocido"
   arriba) — hoy comparten `client_id`.
3. **Pub/Sub de prod** apunta al proyecto GCP de **staging**
   (`tipio-staging-development`) — falta un topic real de producción.
4. **Probar el bug de concurrencia del token bajo carga real** (export masivo
   en prod, no solo unos pocos productos secuenciales) — ver
   [pmsXD6wr](https://trello.com/c/pmsXD6wr).
5. **Checklist de submission al App Store** (listing, screenshots, Protected
   Customer Data, cuenta demo para el reviewer) — ver `docs/SUBMISSION.md` y
   `docs/PUBLISH.md` en el repo del app, y Trello
   [bUTspa3l](https://trello.com/c/bUTspa3l).

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
