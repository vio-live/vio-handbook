# Handoff — Vio Web SDK: Klarna + Apple Pay express (vio-web / Allermedia)

> Última actualización: 2026-06-04 · dirigido por angelo, ejecutado por claude.
> Estado: **demo DEPLOYADO** en `https://vio-demo.vercel.app` (build self-contained, SDK inlineado por Vite), apuntando a `api-staging.vio.live`. **Pendiente único para 24/7: redeploy de staging desde `main`** (el fix de CORS `c514f09` ya está en main; staging corre código viejo). Localmente también corre sobre `https://demo-local.vio.live`.
> Klarna Payments (widget) + Apple Pay express + shipping; **express también en el carrito** (Apple Pay + Klarna). Log de cierre: [`journal/2026-06/2026-06-04.md`](../journal/2026-06/2026-06-04.md).

> ⚠️ **Este handoff reemplaza la versión anterior, que estaba equivocada.** El diagnóstico viejo ("la journey se cuelga en el logo = la cuenta Klarna no soporta NOK/Noruega") era **falso**: probamos que la cuenta soporta NO/NOK en todos los montos. Aquel handoff describía el flujo **KEC (Klarna Web SDK v2 button)** que **abandonamos**. Ver "El pivot" abajo.

## TL;DR — qué funciona hoy

Sobre `https://demo-local.vio.live` (túnel HTTPS → localhost:5174):

- 🅰️ Header **Mote & Livsstil con el logo de Aller** ("A"), wordmark mayúsculas + nav mayúsculas.
- 🧴 **Productos reales** de Vio Commerce (Biotherm/Clarins/Ole Henriksen…), multi-sponsor (3 sponsors).
- 🛍️ **Klarna Payments** express: producto → "Kjøp nå med Klarna" → modal con **widget inline** + **selector de envío** (Standard/Express) + pagar. También en el checkout completo.
- 🍎 **Apple Pay** express: producto → " Pay" → **hoja nativa** con **envío nativo** (selector Standard/Express, total en vivo).
- 🔒 Todo HTTPS: front por `demo-local.vio.live`, backend por `api-local-angelo.vio.live`, + verification file de Apple Pay servido.
- 🛒 **Express también en el carrito** (no solo en el detalle): botones **Apple Pay** y **Kjøp med Klarna** en el cart drawer. Apple Pay → confirmación in-drawer; Klarna → drawer lateral express (sin dirección ni selección de método).
- ✅ Marca en las cards del carrusel: **tick negro** en el carrito + **contador** si qty>1; el add-icon **no abre el carrito** (se agregan varios y se paga con el FAB flotante).

## Deploy + 24/7 (Vercel + staging) — estado actual

**Deployado**: `https://vio-demo.vercel.app` (Vercel, scope `reachu`).
- `npx vite build` en vio-web **inlinea el SDK** (alias Vite → `../../../vio/src`) → `dist/` self-contained (~104 kB gzip) → "demo + SDK en uno".
- Se deploya el **`dist/` prebuilt** (copiar `dist/` + `vercel.json` → `vercel deploy --prod --yes`). **No** dejar que Vercel buildee: su env no tiene `/Users/angelo/vio` → el alias rompería.
- `vercel.json`: SPA fallback (`/(.*) → /index.html`). El build **sí** copia `public/.well-known/` (Apple Pay) — solo el dev server de Vite salta los dotfiles.

**24/7 — data del backend a staging**: el demo dependía de un **Postgres en Docker local** (`localhost:5432`, en la Mac) — no era solo el server lo local, la data también. Para always-on:
1. `yarn db:snapshot:push` (`scripts/db-push.ts`) → `pg_dump` → Azure `saapivio/db-snapshots` (`AZURE_STORAGE_CONNECTION_STRING`). Archivo: `angelo-sepulveda-2026-06-03-1725.sql`.
2. **Miguel restauró** en **staging** (`api-staging.vio.live`): tiene los 3 sponsors + commerce key `1TKRYGF…`; productos siguen en `graph-ql-dev`. (`api-dev` NO tiene el client-app del demo → "Invalid API key".)
3. `VITE_VIO_API_BASE=https://api-staging.vio.live` + rebuild + redeploy.

**CORS preflight — el bloqueo** (ver lesson [`web-sdk-cors-preflight-x-api-key`](../lessons/web-sdk-cors-preflight-x-api-key.md)): la Web SDK manda `X-API-Key` (header custom) → el browser hace **preflight OPTIONS** → el server debe listarlo en `allowedHeaders`. Las nativas no hacen preflight → solo aparece en web. El código committed no lo tenía. **Fix en `main`: `c514f09`** (`x-api-key`, case-insensitive) → **Miguel redeployó staging → demo 24/7 funcionando** (verificado 2026-06-04: bootstrap + 5 productos desde staging; el "no carousel" de la 1ra carga era un preflight viejo cacheado en el edge, el SDK reintenta). PR #37 (mayúscula, redundante) **cerrado**.

**Klarna en staging — pendiente (2026-06-04).** Las rutas `/v2/commerce/klarna/{sessions,orders}` + `server/services/klarna.ts` estaban **solo local sin commitear** → `origin/main` (lo que deploya staging) NO las tenía → el POST a staging caía al **catch-all del SPA** (HTML, no JSON) → la Klarna express del demo falla en staging. **PR #38** (`tipiodevelopment/socket-server`, branch `fix/klarna-payments-routes`) tiene las 2 rutas + el service. **Falta:** Miguel mergea + redeploya + setea `KLARNA_API_USERNAME/PASSWORD/BASE` en el env de staging. (Verificado en **local**: `POST /v2/commerce/klarna/sessions → 201 + clientToken` con categorías `pay_over_time`/`pay_later`/`pay_now`.)

> 🏗️ **TODO de arquitectura (apuntado 2026-06-04 — pedido por angelo):** el **proxy de pagos** (`/v2/commerce/klarna/*`, y a futuro el confirm de Stripe/Apple Pay) hoy vive en el **`socket-server`** porque es el **gateway del SDK** (el SDK le pega ahí para bootstrap + Klarna; ya tenía `/v2/commerce/products` + `/sponsors/:id/catalog`; y tiene las creds server-side). **Decisión del equipo: mover el procesamiento de pagos a `vio-commerce`** (el backend de commerce real; hoy el SDK le pega directo solo para productos vía GraphQL `graph-ql-dev`). Mover = acceso al repo de `vio-commerce` + replantear el `apiBase` que el SDK usa para pagos (hoy = socket-server). **Deuda técnica, no bloquea el demo.**

## El pivot — KEC ❌ → Klarna Payments (KP) ✅ (lo más importante)

Empezamos con **KEC** (Klarna Express Checkout, Web SDK v2: `js.klarna.com/web-sdk/v2/klarna.mjs`, `KlarnaSDK().Payment.button().initiate()`). **Lo abandonamos.** Por qué:

- El "se cuelga en el logo" **NO era** mercado/moneda. Probado: `POST /payments/v1/sessions` para NO/NOK devuelve 3 métodos (`pay_now`/`pay_later`/`pay_over_time`) en todos los montos.
- El 403 de `eu.playground.klarnaevt.com/.../backend_bridge_handshake` era **telemetría** (viene de `trackerFactory.ts`, dominio `klarna**evt**`, da el mismo 403 a cualquier origin incluido ninguno) → **red herring**, no el bloqueo funcional.
- KEC necesita **clientId público + Allowed Origins** registrados + el handshake; y para shipping "dentro de Klarna" hace falta **KCO/KSA**, que la cuenta **no tiene provisionado** (`POST /checkout/v3/orders` → **401**; KSA es solo-KCO).

**Camino que funciona = Klarna Payments (KP), flujo clásico del widget** (`x.klarnacdn.net/kp/lib/v1/api.js`):

1. **Backend** crea una sesión: `POST {base}/payments/v1/sessions` (Basic auth) → `client_token` + `payment_method_categories`. Ruta nuestra: `POST /v2/commerce/klarna/sessions`.
2. **Frontend**: `Klarna.Payments.init({ client_token })` → `Klarna.Payments.load({ container, payment_method_category }, {}, cb)` → renderiza el widget **inline** → `Klarna.Payments.authorize({ payment_method_category }, {}, cb)` → `authorization_token`.
3. **Backend** cambia el token por orden: `POST {base}/payments/v1/authorizations/{token}/order`. Ruta nuestra: `POST /v2/commerce/klarna/orders`.

KP usa el **client_token server-side** → **sin clientId público ni origin handshake**. Todo el problema de KEC desaparece.

**Gotcha clave**: `Klarna.Payments.load` es de **3 argumentos** `(options, data, callback)`. Con 2 args el SDK toma el callback como `data` y **nunca lo invoca** (el widget no resuelve). El lib carga por `<script>` + `window.klarnaAsyncCallback`.

## Apple Pay express — 3 problemas resueltos

Stripe Payment Request con la **publishable key real de Vio** (`pk_test_51TMTc5…`, NO la sample genérica `pk_test_TYooMQ…`). El botón express vive en el product detail. Lo que costó:

1. **Gesto de usuario**: `pr.show()` tiene que dispararse **síncrono** dentro del tap. El flujo viejo hacía `await canMakePayment()` *antes* de `show()` → perdía el gesto → "no abre nada". **Fix**: `prepareApplePay()` pre-crea el PaymentRequest + resuelve `canMakePayment()` al **cargar el producto**; `show()` se llama síncrono en el tap (`buyWithApplePay`).
2. **Registro de dominio en Stripe**: Apple Pay exige el dominio registrado (Stripe → Settings → Payment methods → Apple Pay → Web domains). `demo-local.vio.live` está registrado.
3. **Verification file**: Stripe/Apple verifican fetcheando `/.well-known/apple-developer-merchantid-domain-association`. **Vite no sirve dotfiles** → agregamos un **plugin de Vite** (`vite.config.ts`, middleware) que sirve ese archivo. El archivo es de **Stripe** (mismo para todos sus merchants), bajado de `js.stripe.com/.well-known/...` → `vio-web/public/.well-known/`.

**Shipping nativo de Apple Pay**: `requestShipping: true` + `shippingOptions` en el PaymentRequest → la hoja muestra el selector de envío y el total se actualiza en vivo (handler `shippingoptionchange`).

⚠️ **El cobro es OPTIMISTA**: al autorizar se muestra la confirmación pero **no se cobra de verdad todavía**. El paso real (autorizar → confirmar PaymentIntent en el backend con `STRIPE_SECRET_KEY`) **falta cablearlo** (la sk ya está en el backend, misma cuenta que la pk).

## Shipping (Klarna) — selector nuestro

Klarna Payments **no renderiza** un picker de envío (el merchant maneja el envío y lo pasa como línea `shipping_fee`). KCO/KSA lo harían pero la cuenta no lo tiene. Entonces:

- **Selector nuestro** Standard (49 kr) / Express (99 kr) en el modal express (`renderKlarnaPanel`, gated en `this.express`).
- Al cambiar → **re-crea la sesión Klarna** (el widget no permite cambiar el monto en vivo) con la opción elegida como línea `shipping_fee`. Sesión = autorización = orden → **reconcilia**.
- `KLARNA_SHIPPING_OPTIONS` se exporta del SDK y se reusa también para el shipping nativo de Apple Pay (consistencia).

## Productos / Commerce

- Los 3 sponsors del demo (Fredrik & Louisa / Apotek 1 / Cubus) tenían **commerce key por-sponsor en la DB**. Las cambiamos las 3 a la key nueva (catálogo de cosmética: Biotherm/Clarins/etc., IDs 408909–408913) vía `storage.updateSponsor`. **Las keys viejas (para revertir) están en el transcript de la sesión.**
- `product-refs` en `vio-web/src/pages/Home.tsx` apuntan a los IDs nuevos.
- **El SDK fetchea productos DIRECTO del GraphQL** (browser → `graph-ql-dev.vio.live`) con `sponsor.commerce.apiKey` del **bootstrap** (`/v2/mobile/config` → `buildSponsorBlock` usa `sp.commerceApiKey`, **sin** fallback al env global). → El `COMMERCE_API_KEY` del backend **no** llega al SDK; lo que importa es la key por-sponsor en la DB.

## Mapa de archivos (lo nuevo/relevante)

**vio (SDK)** — `/Users/angelo/vio`
- `src/core/checkout/payments/klarna-payments.ts` — **flujo KP** (load lib, `createKlarnaPaymentsWidget` init/load/authorize). **(reemplaza a `klarna.ts` que es el KEC viejo, sin uso)**
- `src/core/checkout/payments/apple-pay.ts` — `prepareApplePay` (gesto), `shippingOptions`, handler `shippingoptionchange`.
- `src/core/checkout/checkout-manager.ts` — `mountKlarnaPayments({withShipping, shippingId})`, `startKlarnaInstant` (sin uso), `completeKlarnaOrder`, `prepareApplePayFor`, `KLARNA_SHIPPING_OPTIONS` (export), `buildKlarnaInstantContext(shippingId)`.
- `src/ui/components/vio-checkout.ts` — modo `express`, `renderKlarnaPanel` (widget + selector envío), `renderKlarnaExpress`, confirmación drawer (`as-drawer`) con order id + total.
- `src/ui/components/vio-product-detail.ts` — botones express **"Kjøp nå med Klarna"** + **" Pay"** bajo add-to-cart; `prepareApplePayFor` al cargar; `buyWithKlarna`/`buyWithApplePay`.

**vio-web** — `/Users/angelo/Documents/GitHub/vio-web`
- `vite.config.ts` — alias al SDK + **plugin Apple Pay** (sirve el verification file).
- `src/components/Layout.tsx` — header con logo Aller (`public/aller-logo.png`).
- `src/hooks/useVio.ts` — handler `vio:checkout-open` (express + instant + preselect método).
- `src/pages/Home.tsx` — `MIXED_PRODUCT_REFS` (IDs nuevos).
- `public/aller-logo.png` (A blanca, recoloreada por CSS) + `public/.well-known/apple-developer-merchantid-domain-association`.
- `.env.local` (gitignored) — `VITE_VIO_API_BASE=https://api-local-angelo.vio.live`, `VITE_VIO_STRIPE_PK` (real), `VITE_VIO_GRAPHQL_BASE`, `VITE_VIO_API_KEY`.

**vio-backend** — `/Users/angelo/vio-backend/socket-server`
- `server/services/klarna.ts` — `createKlarnaSession` + `createKlarnaOrder` (Basic auth). Líneas con `type: shipping_fee`.
- `server/routes.ts` — `POST /v2/commerce/klarna/sessions` + `/orders`. Apple Pay confirm route (`STRIPE_SECRET_KEY`) existe pero **no la usa el flujo aún**.
- `.env` (gitignored) — `KLARNA_API_*`, `STRIPE_SECRET_KEY`, `COMMERCE_API_KEY`, `COMMERCE_GRAPHQL_URL`.

## Cómo levantar (servers + túneles)

```bash
# Backend (:5001) — sin watch, reiniciar para tomar cambios de .env/código
cd /Users/angelo/vio-backend/socket-server && npx tsx server/index.ts

# Front (:5174) — SDK por alias de Vite, sin build. Reiniciar para .env / vite.config / public/
cd /Users/angelo/Documents/GitHub/vio-web && npm run dev
```

**Túneles HTTPS (cloudflared):**
- `api-local-angelo.vio.live` → `localhost:5001` (backend). Túnel **named** `angelo-local-backend`, config en `~/.cloudflared/config.yml`.
- `demo-local.vio.live` → `localhost:5174` (front). Túnel **token** (proceso aparte, lo levanta angelo).
- ⚠️ Los **quick tunnels account-less** (`cloudflared tunnel --url …` → `*.trycloudflare.com`) dan **404 en el edge** desde este entorno — no usar.

**Crítico**: `VITE_VIO_API_BASE` debe ser **HTTPS** (`https://api-local-angelo.vio.live`). Si es HTTP (ej. la IP LAN) y el front carga por HTTPS (`demo-local`), el navegador bloquea las llamadas (**mixed content**) → el bootstrap del SDK falla → vio-web cae a sus productos hardcodeados de fallback.

Typecheck SDK: `cd /Users/angelo/vio && npm run typecheck`.

## Credenciales

**Nunca pegar secretos en el handbook** (viven en `.env` gitignored):
- Klarna API (Basic auth, server) → `vio-backend/.env`: `KLARNA_API_USERNAME/PASSWORD`, `KLARNA_API_BASE=https://api.playground.klarna.com`.
- Stripe → publishable (`pk_test_51TMTc5…`) en `vio-web/.env.local`; secret en `vio-backend/.env`. **Misma cuenta** (prefijo `51TMTc5E7CXHlMk3L`).
- Commerce key (los 3 sponsors) → en la DB (`sponsors.commerce_api_key`) + `COMMERCE_API_KEY` env. **Keys viejas para revertir: en el transcript de la sesión.**

## Gotchas duros (no re-derivar)

- **KP `load` es de 3 args** `(options, data, cb)`. 2 args = nunca invoca el callback.
- **Apple Pay gesto**: pre-crear el PaymentRequest + `canMakePayment` al cargar; `show()` síncrono en el tap.
- **Apple Pay dominio**: registrar en Stripe (Web domains) **+ servir** `/.well-known/apple-developer-merchantid-domain-association` (Vite no sirve dotfiles → plugin).
- **`klarnaevt.com` 403 = telemetría** (trackerFactory), red herring. No es el bloqueo.
- **KCO/KSA = cuenta no provisionada** (401). El shipping "en Klarna" no es posible con esta cuenta → selector nuestro + `shipping_fee`.
- **Mixed content por el túnel** rompe el SDK → apiBase HTTPS.
- **CORS preflight `X-API-Key`**: la Web SDK manda el header custom `X-API-Key` → el browser hace preflight OPTIONS; el backend debe listarlo en `allowedHeaders` (case-insensitive). Sin eso: `Failed to fetch` / "x-api-key is not allowed by Access-Control-Allow-Headers". Solo afecta a la **Web** SDK (las nativas no hacen preflight). `curl` NO lo detecta (no hace preflight). Ver lesson dedicada.
- **Vite SPA fallback**: rutas desconocidas dan 200 + `text/html`. Un 200 no garantiza que el archivo exista — chequear `Content-Type`.
- **Stripe pk genérica** (`pk_test_TYooMQ…`) NO sirve para Apple Pay (no es cuenta real).
- (vigente del flujo anterior) **bottom-sheet Lit**: `height` fijo, no `max-height` con `inset:auto`.

## Pendientes / próximos pasos

0. **(inmediato) Klarna en staging** — mergear **PR #38** (rutas + service) + redeploy + setear `KLARNA_API_USERNAME/PASSWORD/BASE` en el env de staging (ver "Klarna en staging" arriba). Sin esto la Klarna express del demo falla en staging. (CORS ✅ ya deployado, demo 24/7 OK. **Y apuntado: mover el proxy de pagos a `vio-commerce`** — TODO de arquitectura, arriba.)
1. **Cobro real de Apple Pay** — cablear: paymentMethod del sheet → `POST` al backend → confirmar PaymentIntent con `STRIPE_SECRET_KEY` (misma cuenta que la pk). El flujo hoy es optimista.
2. **Limpieza del KEC muerto** — `klarna.ts` (KEC button), `resumeKlarnaReturn`, config `klarnaClientId/Environment`, hook `useVioKlarnaReturn`, `startKlarnaInstant` (sin uso). Dejar un solo flujo Klarna (KP).
3. **Stripe Connect por-sponsor** — hoy se usa la platform key; en prod el `connectedAccount` del sponsor (ver lesson `stripe-connect-per-sponsor`).
4. **Tax real** (hoy `tax=0`), **linkear `order_id` a Vio Commerce** (PlaceOrder), **webhooks** Klarna/Stripe.
5. Menor: el monto de la hoja Apple Pay se prepara con `qty` al cargar (qty 1) — si cambia la cantidad antes del tap, el monto puede quedar viejo (re-preparar on qty change).
6. **Klarna express multi-sponsor**: el botón "Kjøp med Klarna" del carrito abre el checkout para el **primer sponsor** con items (cobra solo ese). El multi-sponsor real (encadenar sponsors) queda pendiente.

## Lecciones a `docs/lessons/`

- ✅ Creada: [`web-sdk-cors-preflight-x-api-key.md`](../lessons/web-sdk-cors-preflight-x-api-key.md).
- Pendientes (ofrecidas): `klarna-payments-kp-vs-kec.md` · `apple-pay-web-gesture-domain-verification.md` · `cloudflare-tunnel-https-mixed-content.md` · `klarna-shipping-needs-kco-not-kp.md`.

---

Retomable. El demo está **completo y verificado en vivo** (Klarna + Apple Pay + shipping, HTTPS, iPhone). El único "pago" que no es real todavía es el cobro de Apple Pay (paso 1 de pendientes).
