---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
status: live
service: users
---

# Session — 2026-10-15 — users: cabecera interna en `/api/users/socket`

## Goal
Fase 2 de [base-api: socket con auth](./2026-10-15-base-api-socket-con-auth-y-uploads.md)
(vio-base-api #37) en `vio-users-microservice`: base-api va a exigir
`identification-microservice` (valor = env `MICROSERVICE_TOKEN`) en
`POST /api/users/socket/:userId` y `GET /api/users/socket/counters/:userId`.
Este micro las llamaba sin cabecera en 9 sitios; con el guard recibirían 401 y
el front dejaría de enterarse de altas de subscripción, cambios de plan y
conexiones ecom (Shopify/Woo/Magento/API key). Entrada hermana:
[extensions](./2026-10-15-extensions-cabecera-interna-users-socket.md).

## Done
Rama `fix/cabecera-interna-users-socket` (worktree
`~/vio-commerce/worktrees/users-cabecera-interna`, base `origin/develop`
57b42d3), **1 commit local, sin push** (ADR-0001):

`6ca184f fix(socket): manda la cabecera interna a /api/users/socket de base-api`
(6 archivos, +235):
- `Configuration.MICROSERVICE_TOKEN` **ya existía** (`src/config/utils/config.keys.ts:19`);
  no hubo que añadirlo. Lo que faltaba era la clave en `.env.test`
  (versionado): va con un valor de prueba.
- `src/shared/helpers/internal-headers.ts`: `internalHeaders(configService)` →
  `{ headers: { 'identification-microservice': token } }` (el objeto de
  config entero, para pasarlo tal cual como 3.er argumento de `post` / 2.º de
  `get`). Sin token devuelve `{ headers: {} }`, igual que extensions.
- Las 9 llamadas, cuerpos/URLs/errores intactos:
  `subscription.service.ts::webhookStripe` (x2: `new-subscription`,
  `subscription-update`); `user.service.ts`: `saveShopifyExportConnection`,
  `saveShopifySellerConnection` (GET counters), `createApiCredential`,
  `saveWooConnection` (x3, uno es GET counters), `updateEcomUser`. La 10.ª
  coincidencia del grep (`saveShopifySellerConnection`, `new-channel`) está
  comentada y se dejó así.
- Tests (sin specs previos que ejercitaran esos métodos; los `*.spec.ts`
  normales necesitan MySQL vivo):
  - `src/shared/tests/internal-headers.unit.spec.ts`: helper (con y sin
    token) + **guard sobre el fuente**: recorre `src/`, y para cada línea
    activa con `/api/users/socket/` exige `internalHeaders(this._configService)`
    entre los argumentos de esa llamada. Una llamada nueva sin cabecera rompe
    la suite. → 4/4.
  - `src/modules/user/tests/socket-internal-header.unit.spec.ts`:
    `UserService` por prototipo (patrón de `disconnect-sales-channel.unit.spec.ts`),
    `createApiCredential` (MAGENTO) y `updateEcomUser` (health-check Magento):
    comprueba cabecera y cuerpo exacto, y que el health-check a extensions no
    la lleva. → 2/2 **con `--globals '{"ts-jest":{"diagnostics":false}}'`**
    (ver blockers).
- `npx tsc --noEmit -p tsconfig.json`: 10 errores, **los mismos 10 del
  baseline** antes de tocar nada (9 `StaticData.RoleId`, 1 `mockRequest` de
  woo); ninguno en lo nuevo. Prettier avisa en `subscription.service.ts`
  desde HEAD (líneas 42/82/130/280, no mías): no se reformateó.

## Decisions
- Helper en `src/shared/helpers/` (lo usan dos módulos, user y subscription),
  firma `Pick`-like `{ get(key) }` para poder pasar un stub: el `ConfigService`
  real hace `process.exit` si falta el `.env`.
- Devuelve el `{ headers }` completo (extensions devuelve solo el objeto de
  headers). Las dos formas valen; no se unifican entre repos.
- Sin token → sin cabecera: comprobado en Node local que `http.request` lanza
  **síncronamente** con un header `undefined`; mejor que llegue a base-api y
  se vea el 401.
- Guard sobre el fuente además del test de runtime: el runtime solo cubre 2 de
  las 9 llamadas (webhookStripe/saveWooConnection necesitan montar Stripe/Woo),
  y lo que de verdad hay que impedir es que alguien añada otra llamada sin la
  cabecera.
- Un solo commit (amend) en vez de dos: el ajuste "sin token" no merece
  historia aparte antes del PR.

## Blockers / open questions
- **Overlay de `node_modules` en el worktree**: symlink al del repo principal,
  kernel `@vio-/database` **1.0.267** mientras `package.json` pide 1.0.273
  (sin `StaticData.RoleId`). Por eso `tsc` y 4 de 6 suites unit fallan
  **antes** de mi cambio. No se puede reinstalar (token npm en 401). En CI con
  1.0.273 debería compilar; verificar en el PR.
- **Fire-and-forget**: 7 de las 9 son `lastValueFrom(...)` sin `await` ni
  `.catch`; los dos `GET counters` sí se `await`ean sin catch. Un 401 ahí es
  un rechazo sin manejar y en `src/` no hay `process.on('unhandledRejection')`
  (no verificado si el kernel registra uno). Fuera de alcance tocarlo (el
  encargo era no cambiar el manejo de errores), pero obliga al **orden de
  despliegue**: users con cabecera antes de que base-api active el guard.
- `/socket/publish`: las 4 llamadas activas de este micro
  (`listener/providers/socket-listener.ts:33`, `user.service.ts:1159/2499/2635`)
  van a `API_MICROSERVICE_URL` (api-ms), **no a base-api**; api-ms pone la
  cabecera al reenviar. Nada que cambiar aquí.
- `MICROSERVICE_TOKEN` está en el `.env` de QA de users (journal de base-api);
  **en prod no se ha comprobado**.

## Next session
- OK de Angelo → push + PR a `develop` de vio-users-microservice.
- Coordinar la fase 3 de base-api (guard activo) cuando los cinco micros
  estén desplegados con la cabecera.
