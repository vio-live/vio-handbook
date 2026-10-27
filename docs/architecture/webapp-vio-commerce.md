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

- **Handshake autenticado (2026-10-15):** el cliente manda `auth: { token }`
  con el mismo ID token de Firebase que va en la cabecera `authorization`
  (sin "Bearer"); fuente única `authToken()` en `src/lib/api.js`. `auth` va
  como función: socket.io-client la llama en cada (re)conexión y el token se
  renueva solo. Sin sesión no se abre el socket. Sin token el servidor
  responde `connect_error` con `unauthorized`.
- Tras un rechazo del handshake socket.io-client **no reintenta solo**
  (destruye el socket, `active === false`); `socket.js` reconecta a mano con
  espera creciente y token fresco, y si la sesión ya no existe cierra sin
  bucle. Las caídas de transporte sí las reintenta socket.io.
- El servidor emite a la room del usuario, pero los eventos siguen llevando
  el userId **en el nombre**: `${event}/${userId}` — hay que suscribirse al
  nombre exacto.
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
  > **2026-10-19:** ya no es demo. El host sale de `API_HOST` (puente de base-api, 2026-09-14) y, desde la rama
  > `feat/analytics-por-campana-y-slot`, el home cruza las campañas del micro con `GET /stats/surfaces/:id/campaigns` (publisher)
  > o `/stats/campaigns` (brand, `id: 'cmp-<id>'`), y el detalle de la campaña tiene "Performance" por slot. Ver el journal
  > [`2026-10-19-front-commerce-analytics-por-campana-y-slot`](../journal/2026-10/2026-10-19-front-commerce-analytics-por-campana-y-slot.md).
  > **2026-10-20 (ADR-0036, PR #68):** el dinero es **neto** por defecto. `netOf()` en `src/lib/stats.js` lee `gmv` (neto),
  > `gmv_gross`, `refunded_value`, `cancelled_orders`, `purchases` (hechos) y `purchases_net` en todas las lecturas (products:
  > `revenue`, `revenue_gross`, `refunded_value`), con fallback bruto = neto si el colector no los manda; AOV y conversión se
  > derivan sobre lo neto; «Net revenue» con «gross · refunded · cancelled», «Orders» netos con «placed · cancelled», «Gross
  > revenue» como serie apagada en la leyenda — y la serie solo pide `purchases_net`/`gmv_gross` si el colector manda el
  > bruto (`netAwareFor`: lo dice cualquier lectura y se recuerda por surface; en el detalle, el `content` de la campaña);
  > con el colector anterior pide lo de siempre, rotula «Revenue»/«AOV» sin «net» y el CSV deja vacías las celdas netas. Journal
  > [`2026-10-20-front-commerce-analytics-neto`](../journal/2026-10/2026-10-20-front-commerce-analytics-neto.md).
  > **2026-10-27 (ADR-0041, PR #83, sin mergear):** cambios en analytics.
  > - **Días en hora de Oslo:**
  >   - todo se corta en Europe/Oslo: «hoy», presets, periodo anterior, `rangeBounds` de pedidos y la serie por hora;
  >   - los días de cambio de hora tienen 23 o 25 horas;
  >   - toda lectura manda `tz=Europe/Oslo`. El puente lo descarta sin error hasta su PR.
  > - **Preset «Yesterday»:** viaja como `from = to = ayer`.
  > - **Funnel por sesiones** (`session-funnel`), en el dashboard (publisher: suma de surfaces; brand: comodín) y en la
  >   campaña:
  >   - cinco pasos con tasas y variación vs `previous`;
  >   - al lado, el carrito, el checkout, la ida a Vipps y los pedidos sin visita;
  >   - los resultados de Vipps;
  >   - un desglose `by` por dispositivo, fuente y artículo.
  > - **Funnel por producto** (`session-funnel/products`), con CSV.
  > - **Antes de que haya colector y puente**, `isReadMissing` reconoce `400 unknown stats path` y `502
  >   upstream_status 404`. La campaña vuelve entonces al funnel por eventos y a la tabla de productos de antes, y el
  >   dashboard dice «not available yet».
  >
  > Journal
  > [`2026-10-27-front-commerce-funnel-por-sesiones`](../journal/2026-10/2026-10-27-front-commerce-funnel-por-sesiones.md).
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

## Surfaces y campañas del Publisher (2026-10-13, rama local `feature/brand-publisher`)

F4 del [plan de campañas](../handoff/campanas-en-commerce-plan-de-ejecucion.md). Detalle en el
journal `2026-10/2026-10-13-front-commerce-surfaces-y-campanas.md`.

- **Backend:** vio-backend (`vioApi`, `src/lib/vio.js`) con las rutas `/client-apps…`,
  `/campaigns…` y `/sponsors`. El micro de campañas va a responder las mismas rutas (ADR-0027).
  Todo el contrato y sus gotchas están en las cabeceras de **`src/lib/surfaces.js`** y
  **`src/lib/campaigns.js`**: al cortar, se tocan esos dos archivos.
- **Quién ve qué: una sola matriz, `src/lib/access.js`** (decisión de Angelo del 13/10; journal
  `2026-10-13-front-commerce-acceso-por-tipo-y-v2`).
  - `sectionsFor(account)` la usan la nav, el guard de rutas del AppShell y el rail de Settings.
  - **Tipo de cuenta:** se normaliza `business→brand` y `seller→publisher` (el micro ya devuelve
    `brand|publisher|internal`).
  - **Lo que vive en Vio** (surfaces, campaigns, Settings › Brand) pide además la feature de
    `/auth/me`.
  - **URL directa a una sección ajena:** `/home?blocked=<sección>` con aviso.
  - **Publisher:** está exento de suscripción (no va a `/user-deactivated`, ADR-0028) y ve
    Orders en solo lectura.
  - **Sin cuenta de Vio** (prod hoy, sin `VIO_HOST`): Commerce como siempre.
  - **El shell espera `/auth/me`** (timeout de 8 s) antes de montar la vista.
- **"Getting started" del publisher** en `/home` (`src/lib/onboarding.js`): 4 pasos con estado
  real. Si la Connection está aceptada pero no hay colecciones compartidas, el paso 1 queda en
  *Waiting*.
- **Pasos 1 y 2 del publisher** (`src/lib/publisher-channels.js`; journal
  `2026-10-13-front-commerce-pasos-1-y-2-publisher`):
  - el publisher pide acceso a una brand desde Connections;
  - la brand usa "Accept and share" (acepta y comparte en un paso);
  - el asistente "New channel" crea un channel **tipo 10 por debajo**, sin tipo visible, con
    colecciones compartidas o productos de UNA brand;
  - el channel del publisher no muestra provider ni sync; los pagos son de la brand y el
    publisher los filtra por channel (ver abajo, ADR-0031);
  - hasta F2.3 la key es una por usuario y tipo: se avisa con `CHANNEL_KEY_SHARED_PER_TYPE`.

  Commerce no guarda la brand del channel: se deriva de los dueños de sus colecciones
  compartidas.
- **Pagos a nivel cuenta (F2.7, flag `ACCOUNT_PAYMENTS`, apagado):** `src/lib/account-payments.js`
  contra `GET`/`PUT /paymentmethod/account` (api F2.3, proxy de base-api F2.6).
  - Settings › Payments: los 11 encendidos de la cuenta con lo que realmente se ofrece
    (`effective`) y el opt-in "Use Vio's account" con confirmación.
  - El channel no tiene switches: lista heredada de solo lectura, con el aviso de markets de
    Kustom y Adyen (solo NO).
  - "No payment method" es una condición de la cuenta.
  - Con el flag apagado, todo sigue por channel (api viejo).
- **Pagos de la brand filtrables por channel (ADR-0031, 2026-10-14, rama local
  `feature/pagos-filtro-por-channel`, `0b11a22` + `54c8b8d`, sin push):**
  `src/lib/channel-payments.js`, contra el contrato de api `3cb6fa9` y base-api `ddb70b9`.
  - `GET /channel/:id/payment-methods` → `{ channelUserId, brandId, methods }`, siempre con los 11
    métodos.
  - `reason` vale `no-switch`, `no-credential` o `market`. Un método con `reason` no se elige,
    aunque la brand lo ofrezca.
  - El `POST update/settings` parcial guarda la visibilidad (`google_pay`/`apple_pay`).
  - Los errores llegan como `{ code, message }`.
  - Todavía no se probó contra un backend levantado.
  - En `PublisherSettingsTab`, la tarjeta "Payment methods in this channel" tiene un check por
    método elegible, que guarda al instante con cambio optimista y rollback.
  - Los métodos con `reason` salen deshabilitados, con su texto.
  - Muestra "N of M shown to buyers", donde M son los elegibles, y, si no queda ninguno
    visible, el aviso "Nothing can be paid in this channel".
  - En la lista, el badge "No payment method" sale del fan-out `useChannelsPaymentMethods`.
    Un channel que falla no se marca.
  - Sin flag: el webapp no debe salir antes que api y base-api.
- **Rutas:**
  - `/surfaces` y `/campaigns` son páginas;
  - `/surfaces/:id` y `/campaigns/:id` van por el catch-all;
  - `/campaigns?surface=<id>` abre el alta con esa surface elegida.
- **Estado de campaña:** se calcula solo en `campaignStatus()`, con las fronteras de
  `isCampaignActive` del server. `isPaused` llega como string en vio-backend y boolean en el
  micro; se aceptan los dos.
- **Flag `VIO_CAMPAIGNS_V2`** (`next.config.js → env`, apagado), contra el contrato del micro
  (`campaigns-microservice` feature/app). Cubre:
  - en la surface: channels asignados, slots de solo lectura, markets, dominios y `custom-web`.
    En el alta se pueden elegir sus channels: viajan en el mismo `POST /client-apps`;
  - en la campaña: un channel por sponsor, la campaña por defecto y slots con ventana;
  - **alta de campaña sin pasar por la surface** (2026-10-14, `53d8f94`):
    - el primary sponsor sale de todas las brands del publisher (`/sponsors`);
    - su channel, de `GET /channels` del micro (`usePublisherChannels`), esté o no en la surface;
    - el micro asigna a la surface, en la misma transacción del POST, el que no estaba;
    - el webapp no puede salir antes que el micro con `GET /channels`;
    - el secundario, en el detalle, sigue pidiendo un channel que ya esté en la surface.
  - Los errores de sponsor y channel se muestran con un texto claro por código
    (`CAMPAIGN_ERROR_TEXT`); el del micro queda en `detail`.

  Con el flag apagado no se muestran ni se mandan: vio-backend no valida el POST de campañas y
  rechaza `custom-web`. Se enciende con el micro.
- **Borrar una surface:** el micro da 409 si tiene campañas (vio-backend las borraba en
  cascada). El diálogo lo explica según el backend, y borrar campaña está en su detalle.
- **Probar contra el micro sin Firebase ni MySQL:** compilarlo a un directorio aparte y
  levantarlo con `MemoryAdaptersModule` + `InMemoryCommerce`. El token falso del harness pasa su
  auth, porque el verificador en memoria compara strings. Detalle en el journal.

## Gotchas vigentes

- Aliases semánticos de color en `:root, [data-theme]` (las custom props
  se sustituyen donde se declaran). `color-scheme` scoped a `.vio-app`.
- Primitivas en `src/ui/` (NO `components/ui`: colisión case-insensitive
  en Linux). NUNCA `next build` con `next dev` corriendo.
- **`next build` en un worktree con `node_modules` symlinkeado** falla en "Collecting page data"
  (`TypeError: c(...) is not a function` en `_app.js`, 2026-10-14): `next/font/local` resuelve
  fuera del proyecto. Para el build, copiar `node_modules` con `cp -cR` (clon APFS) o `npm ci` en el
  worktree (sin deps privadas, ~1 min). Volvió a morder el 2026-10-20: ya está también en el brief.
- **El build y `next dev` no necesitan el `.env` real** (2026-10-14): con variables ficticias
  en el entorno (`FIREBASE_API_KEY=dummy …`, `API_HOST=https://api.fake.test`) el
  `next build` pasa "Collecting page data". El `auth/invalid-api-key` sale solo si la key
  está **vacía**. Para el harness de puppeteer alcanza con usar la misma key ficticia en la
  clave de IndexedDB. Así no hay que copiar secretos al worktree.
- **Clases de envío (Settings › Shipping): la moneda es la de la cuenta, sin fallback**
  (2026-10-14, `b3bfd47`). Sin `me.settings.currency.code` no se guarda. El POST y el PUT llevan
  `currencyCode` arriba y en cada país, y editar una clase en otra moneda la pasa a la de la
  cuenta. Antes, un `|| 'EUR'` dejaba clases en EUR en cuentas NOK.
- **Producto con variantes: el gate de Publish es del front, y el precio del producto también**
  (2026-10-14, `0f7f259`, rama `fix/publicar-con-variantes`). El micro de products no deriva el
  `price` del producto de las variantes: un alta con variantes queda en `null`, y tras un PUT sin
  `price`, en `"0.00"`. Además, `publish` no valida precio. Por eso `computeMissingDetail` mira el
  precio de cada variante (una vacía hereda el del producto) y `withVariantPrice` guarda el mínimo
  como precio del producto cuando todas tienen el suyo. En un importado solo lo completa si falta.
  La lista (`variants=false`) no ve variantes y marca "Variant prices".
  - **La herencia es solo de los nativos** (2026-10-14, `a8d86c6`, rama
    `fix/variantes-importadas`, espejo de products-ms #23). `inheritsVariantPrices(product)`:
    nativo es `origin` NATIVE o vacío, y sin `originId`. El feed (NATIVE con `originId`) es
    importado. En un importado, una variante en 0 no se vende:
    - se marca "Not for sale (no price in <origen>)", sin precio heredado;
    - no bloquea Publish mientras una variante activa tenga precio. Sin ninguna, bloquea;
    - sin precio de producto, "Price from" es el mínimo de las activas con precio (la derivación
      del micro).

    El webapp no puede salir a un entorno antes que products-ms #23.
- **Modales de alta o edición: `FormDialog`, no `Dialog`** (`src/ui/dialog.jsx`, 2026-10-14,
  `35552f0`). Con `dirty`, un clic fuera no cierra, y Esc o la X piden "Discard changes?". El
  `dirty` sale de `formState.isDirty` o de `formChanged` (`src/lib/utils.js`). Dos trampas que
  solo se ven en Chrome, no en jsdom:
  - un clic fuera "prevenido" igual manda el foco a `<body>` (el `mousedown` del overlay);
  - un `AlertDialog` sin trigger, al cerrarse, deja el foco en `<body>`.
  `FormDialog` resuelve las dos.
- Catch-all: path por `useRouter().asPath` + `key={path}` en los detalles
  (remount en transiciones cliente).
- Puppeteer: clicks reales para triggers Radix; native value-setter para
  limpiar inputs; interceptar API cross-origin exige headers CORS en
  `req.respond()` + preflight OPTIONS; medir "no white flash" = muestreo
  in-page 30 ms de `.vio-app`.
- **Ver vistas autenticadas sin cuenta de staging (2026-10-13):** `next dev` y puppeteer con la
  sesión de Firebase inyectada. Se escribe el user en IndexedDB `firebaseLocalStorageDb` con la
  clave `firebase:authUser:<apiKey>:[DEFAULT]`, con un `accessToken` falso y `expirationTime`
  futuro. Hay que abortar `identitytoolkit` (`accounts:lookup`): ante `network-request-failed`
  Firebase conserva el user. Después se interceptan base-api y vio-backend con fixtures, con CORS
  y respuesta al OPTIONS. Más trampas (2026-10-14):
  - el `Combobox` no usa `role="option"`: hay que clickear por texto;
  - después de editar archivos, el primer `goto` de `next dev` puede dar `ERR_ABORTED` o errores de
    hidratación: esperar y repetir antes de culpar al cambio;
  - para ver el flujo V2: `VIO_CAMPAIGNS_V2=true` y `VIO_API_HOST`/`API_HOST` falsos en `next dev`.
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
- **El front NO deploya por GitHub Actions.** El workflow "CI/CD" del repo
  está parado desde 2026-08-10; los deploys los hace la integración Git de
  Vercel en cada push. Que `gh run list` no muestre nada NO significa que
  no haya deployado — comprobarlo con `vercel ls` (hay una fila con
  environment `staging` por push) y no con el pipeline de Azure, que es
  del backend (AKS), no de esto.
- **Cómo verificar que un cambio llegó a staging.** Funcionalmente, con el
  navegador: entrar a `dashboard-staging.ecom.vio.live` y comprobar el
  comportamiento (un `aria-label` nuevo, una petición que ya no se repite).
  NO sirve grepear el bundle: los chunks de página se cargan bajo demanda,
  así que buscar un string en los `<script>` del HTML da falso negativo y
  parece que el deploy no salió. Dos veces me llevó a decir "staging no
  está tomando los cambios" cuando sí los tenía.

## Pendientes (2026-08-28)

1. **Backend (tarjetas en Trello To do, asignadas a Alan)**: notificación
   persistente al conectar la tienda + guardar `ecomName` · PRs api-ms #3
   (notificaciones huérfanas) y #4 (avisar al aceptar conexión) ·
   reactivar la suite de `request` y meter jest al CI · cascade de orders.
2. **Stats service** (Angelo): ~~/home sigue con datos demo (badge visible)~~ — resuelto: puente de base-api (2026-09-14) y
   analytics por campaña y por slot (2026-10-19, ver §5 arriba); contrato en `docs/stats-service-contract.md` del repo.
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
