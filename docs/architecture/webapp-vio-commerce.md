# Webapp Vio Commerce — arquitectura (estado 2026-08-28 · EN PRODUCCIÓN)

Dashboard de sellers de Commerce (`dashboard.ecom.vio.live`), repo
`vio-live/webapp-vio-commerce`. La migración Next.js + rediseño **terminó y
está en producción** desde el 2026-08-26 (dashboard `3be4aaf`): el SPA
legacy se retiró por completo (react-router, redux-saga, antd,
styled-components, Formik — 37 dependencias, −315 paquetes). Este doc es el
mapa del estado final y sus contratos.

> Historia del strangler (dos mundos, adapter, rebrand): ver journals
> 2026-08-19 → 2026-08-24 y el git history de este archivo.

## Stack

- **Next.js pages router**, `output: 'export'` (estático a `out/`, nginx
  con fallback a `/index.html`), JSX sin TypeScript, React 18, Node 22.
- **UI propia** `src/ui/` (primitivas Radix patrón shadcn) + **Tailwind v4**
  con los tokens del design handoff (`src/assets/styles/tailwind.css` +
  `vio-tokens.css`). Dark default + light por `[data-theme]` (persistido
  `vio-theme`, script pre-paint en `_document`).
- **Datos**: SWR + fetch con token Firebase (`src/lib/api.js`: `api`,
  `fetcher`, `errorMessage`, `apiRoot` [endpoints en raíz del host, texto o
  JSON, acepta body], `apiUpload` [multipart]). Forms: react-hook-form + zod.
- Identidad: Geist/Geist Mono · verde commerce `#10B981`/`#059669` ·
  Phosphor (shell) / lucide (auth).
- Firebase **compat v10** (`src/firebase`) — misma sesión que tenía el
  legacy; providers email + Google (Facebook eliminado).

## Estructura

- `pages/` — una página Next real por ruta. `[[...slug]].jsx` (catch-all)
  solo atiende detalles dinámicos client-side (`/listings/edit/:id`,
  `/orders/:id`, `/channels/:id` — export estático no puede enumerarlos),
  redirige `/`→`/home` y `/feed/*`→`/feed`, y cae a 404 para lo demás.
  `/design-system` existe SOLO en dev (gate `NODE_ENV` en el catch-all).
- `src/views/<vista>/` — una carpeta por vista (products, product-detail,
  orders, order-detail, channels, channel-detail, collections, connections,
  activity, dashboard, settings, auth, system, shell).
- `src/lib/` — data layers por dominio; **cada lib documenta el contrato
  real del backend en su cabecera** (fuente de verdad de gotchas):
  products, orders, channels, collections, connections, settings,
  notifications, magento, me, auth, nav, format, api.
- `test/` — jest (jsdom + Testing Library), por dominio + `test/system/`.
- `scripts/` — smoke/crawl E2E con puppeteer-core + Chrome del sistema.

## Shell y navegación

- `src/views/shell/` — AppShell (sidebar negra colapsable + topbar:
  workspace, breadcrumbs, Upgrade si Free, moneda, campana, theme, user).
  Registro de nav en `src/views/shell/nav.js`.
- **Navegación 100 % client-side**: `src/lib/nav.js` (`goTo`/`replaceTo`
  sobre next/router). Login/logout son full reload a propósito (cambia la
  sesión Firebase).
- **Shell continuo** (sin flash blanco): `useSession` cachea la sesión a
  nivel módulo (+ `auth.currentUser` síncrono) y los `dynamic()` de páginas
  con shell usan `ShellFallback` (chrome completo + spinner en contenido).
- Guards en AppShell: sin sesión → `/login?referrer=…`; usuario sin
  `subscriptions` (desactivado) → `/user-deactivated`.
- Notificaciones: campana SOLO en header (`NotificationsPanel`), "View all
  activity" → `/feed` (página Activity paginada, mark-all/mark-on-click).

## Tiempo real (socket.io)

El servidor sigue vivo en `{API_HOST}/socket.io` (**socket.io v4, solo
transporte websocket** — polling responde "Transport unknown"). Al retirar
el legacy se perdió el cliente (lo usaban las sagas); se reintrodujo en
`src/lib/socket.js`: una conexión por sesión + `useSocketEvent(name, fn)`,
y `closeSocket()` en el logout.

Contratos (base-api `userService.userSocket` / `notificationService`):

- Los eventos llevan el userId **en el nombre**: `${event}/${userId}` — no
  hay rooms, hay que suscribirse al nombre exacto.
- El payload de `users/socket/:id` viene **envuelto**:
  `{ event, data: { status, data } }` → el estado está en
  `payload.data.status`.
- Eventos disponibles: `connection-ecom-user/:id`
  (`waiting`|`success`), `users/:id/notifications/new`, `new-order/:id`,
  `accepted-request/:id`, `received-request/:id`, `new-channel/:id`,
  `product-publish/:id`, `subscription-update/:id`,
  `imported-from-{shopify,woo,magento}/:id`.
- Para QA: cualquier evento se puede disparar con
  `POST /api/users/socket/:userId {data:{event,data}}`.

Hoy se usa para la espera de conexión de tienda y para refrescar la campana
al instante; el resto de eventos están disponibles y sin cablear.

## Vistas y flujos (todo real contra backend)

- **/login /signup** — AuthShell split con switcher Commerce/Channel;
  signup 2 pasos; claims business/channel vía users-microservice
  (`getIdToken(true)` post-signup); redirect Channel a
  `CHANNEL_DASHBOARD_URL`. Microsoft deshabilitado (provider sin alta).
- **/home** — dashboard con **DEMO DATA** (badge) hasta que exista el
  stats service (contrato esperado: `docs/stats-service-contract.md` del repo).
- **/listings** + detalle — ciclo completo (crear, editar, variantes,
  shipping por país `{country, amount, currencyCode}`, publicar con gate;
  límites de plan server-side, Free = 20 SKUs).
- **/orders** + detalle — búsqueda texto=fullName, status single vía
  item-EXISTS, sin sort server → ventana 100 client-side. ⚠️ completar el
  último item CIERRA la orden en cascada (bug backend, issue orders-ms #1).
- **/channels** + detalle — pausa/rename vía
  `PUT channel/user/bychannelid/:id`; SIN `useCache` (sirve stale tras
  escrituras); apple_pay/google_pay se escriben snake_case; conexión de
  tienda asíncrona (modal cerrable + pending en localStorage
  `vio_pending_store_connection` + match al volver).
- **/collections** — ids string uuid; multi-group
  `data=[{product_id}|{collection_id}]`.
- **/connections** — diseño in-house (sin handoff); requests + partners.
- **/settings/payments** — credenciales de pago del seller (Stripe,
  Klarna, Kustom, Vipps). Modelo, contratos y gotchas en
  [`payments.md`](./payments.md); helpers en `src/lib/payments.js`.
- **/settings** — 9 secciones; PATCH dialecto `buildForm/formToPatch`
  (currency como objeto DENTRO de settings, merge sin clobber).
- **/settings/integrations = conectar TU tienda (supplier)**: se elige
  plataforma (`options.ecom` = `SHOPIFY|WOOCOMMERCE|MAGENTO` en
  `POST /users/me/api-credentials`; con ella el backend crea el `ecom-user`
  al vuelo **y la credencial pasa a venir en `GET /ecom-user`** — sin ella
  la key solo existe en la respuesta del POST y es irrecuperable). Estado
  "esperando a que conecte" persistido en localStorage (24h) + socket +
  polling de respaldo. ⚠️ La plataforma se guarda en `ecomUser.name`
  ("SHOPIFY | user | NOT SHOP") y `ecomName` queda vacío; el GET no
  devuelve `name` → pendiente de backend.
- **/feed** — Activity (notificaciones). Generación de REQUEST_RECEIVED
  arreglada en api-ms (PR #1 mergeado); limpieza al borrar request en PR #3.
- **Flujos de sistema** (migrados 2026-08-24): `/start`→redirect signup ·
  `/login-token` (custom token admin, errores visibles) ·
  `/user-deactivated` (reactivar Free `users/create/subscription`
  codePlan "1") · `/no-service` · `/error` · 404 real ·
  `/magento/channel-connection` y `/magento/supplier-connection`
  (popups públicos del OAuth de Magento; `src/lib/magento.js`; endpoints
  en RAÍZ del host, payload snake_case; supplier = credential→confirm).

## Gotchas vigentes

- Aliases semánticos de color en `:root, [data-theme]` (las custom props
  se sustituyen donde se declaran). `color-scheme` scoped a `.vio-app`.
- Primitivas en `src/ui/` (NO `components/ui`: colisión case-insensitive
  en Linux). NUNCA `next build` con `next dev` corriendo.
- Catch-all: path por `useRouter().asPath` + `key={path}` en los detalles
  (remount en transiciones cliente).
- Puppeteer: clicks reales para triggers Radix; native value-setter para
  limpiar inputs; interceptar API cross-origin exige headers CORS en
  `req.respond()` + preflight OPTIONS; medir "no white flash" = muestreo
  in-page 30 ms de `.vio-app`.
- `AVATAR_PLACEHOLDER` (signup Google sin foto) apunta hardcoded al
  container de staging (`outshifter-uploads-qa`) — flaggeado, sin decidir.

## Tests y QA

- `npx jest` — **124 tests** (libs con contrato backend documentado,
  modales, integración por página con router/fetch/Firebase mockeados,
  `test/system/` para los flujos de sistema). Los tests del mundo legacy
  murieron con él.
- E2E por vista con puppeteer (scratchpad de sesión + `scripts/`):
  login real staging, red interceptada para Magento, regresión de
  navegación interna (marker `window.__SPA_MARKER`).
- Cuentas staging: `shopify-vio-dev@test.no/123123` (1303, NO destruir,
  al tope del plan Free) · `claude-qa-final-…@viotest.dev` (1308,
  desechable; fixtures: products 409313/409314, channel 491,
  colecciones QA, orders 4230-4237).

## Entornos y deploy

- Vercel `tipio-2/vio-commerce-webapp`: `master`→prod
  `dashboard.ecom.vio.live` (Firebase reachu-prod) · `staging`+`develop`→
  `dashboard-staging.ecom.vio.live` (reachu-qa). El entorno "staging" es un
  custom environment de Vercel (env vars con `customEnvironmentIds`).
- **Regla operativa**: todo se prueba en staging; `develop:master` SOLO
  con OK explícito de Angelo.

## Pendientes (2026-08-28)

1. **Backend (tarjetas en Trello To do, asignadas a Alan)**: notificación
   persistente al conectar la tienda + guardar `ecomName` · PRs api-ms #3
   (notificaciones huérfanas) y #4 (avisar al aceptar conexión) ·
   reactivar la suite de `request` y meter jest al CI · cascade de orders.
2. **Stats service** (Angelo): /home sigue con datos demo (badge visible);
   contrato esperado en `docs/stats-service-contract.md` del repo.
3. DNS `dashboard*.vio.live` (redirect de Channel) y verificar el provider
   de Google en el Firebase de prod.
4. Posible: React 19 + App Router, preflight de Tailwind (ya sin antd),
   cablear el resto de eventos de socket (órdenes y sync en vivo).

## Referencias

- Memoria de sesión (Layer 1): proyecto Claude
  `-Users-angelo-Documents-GitHub-webapp-vio-commerce` →
  `nextjs-migration-branch.md` (cronología fina y realidades por fecha).
- Issues/PRs: webapp #1/#2 · users-ms #1/#2 · products-ms (trío listings)
  · api-ms #1 (notif generation), #2/#3 (notif huérfanas) · orders-ms #1
  (cascade).
- Journals: 2026-08-19 (auth+shell), 2026-08-20/21 (surfaces, CMS Aller),
  2026-08-24 (flujos de sistema + retiro del legacy).
