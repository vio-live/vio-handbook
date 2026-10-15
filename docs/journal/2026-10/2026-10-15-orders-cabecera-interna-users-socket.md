---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
status: live
service: orders
---

# Session — 2026-10-15 — orders: cabecera interna en `/api/users/socket`

## Goal
Fase 2 de [base-api: socket con auth](./2026-10-15-base-api-socket-con-auth-y-uploads.md)
(vio-base-api #37): base-api va a exigir `identification-microservice` (valor =
env `MICROSERVICE_TOKEN`) en `POST /api/users/socket/:userId` y
`GET /api/users/socket/counters/:userId`. `vio-orders-microservice` hacía las
dos llamadas de `save()` (push `new-order` a cada supplier y al reseller) sin
cabecera; con el guard recibirían 401 y el dashboard dejaría de ver las órdenes
nuevas en tiempo real.

## Done
Rama `fix/cabecera-interna-users-socket` (worktree
`~/vio-commerce/worktrees/orders-cabecera-interna`, base `origin/develop`
`8bc5179` = kernel 1.0.273), **1 commit local, sin push** (ADR-0001):

`e6e54a2 fix(order): identificar el micro ante base-api en los push de users/socket`

- `Configuration.MICROSERVICE_TOKEN` en `src/config/utils/config.keys.ts`
  (no existía en este micro).
- `src/utils/internal-headers.ts`: `internalHeaders(configService)` →
  `{ 'identification-microservice': token }`; sin token devuelve `{}` y hace
  `logger.warn` (misma llamada que hoy y 401 visible en base-api, en vez de un
  `TypeError` local de Node por un valor `undefined`). Mismo diseño que el
  helper de extensions (según su journal).
- `src/modules/order/providers/order.service.ts`:
  `{ headers: internalHeaders(this._configService) }` como tercer argumento de
  los dos `HttpService.post` a `${API_HOST}/api/users/socket/:id`
  (~L1905 supplier, ~L1953 reseller). Son los **únicos** usos de `API_HOST` en
  `src/`. Cuerpos, URLs y `try/catch` intactos; nada de #22/#23 tocado.
- `.env.test`: `MICROSERVICE_TOKEN=test-microservice-token` (fixture).
- Tests:
  - `src/modules/order/tests/order-internal-headers.unit.spec.ts` (suite
    `jest.unit.json`, sin DB): 3 tests del helper + 2 que recorren el `save()`
    **real** hasta el bloque de sockets con el patrón de
    `order-channel-user.unit.spec.ts` (stubs de repos, `findByIdWithStatus`
    espiado, `_orderRepository.update` lanza STOP justo después de los push) y
    asertan URL (`/api/users/socket/40` y `/7`), body y
    `{ headers: { 'identification-microservice': 'tok-save' } }`; sin token
    sale `{ headers: {} }` y dos `warn`.
  - `order.service.spec.ts` › `Soft delete`: aserción sobre
    `httpService.post.mock.calls` filtradas por `/api/users/socket/` → todas
    con la cabecera.

Verificación:
- `npx jest --config ./jest.unit.json` → 4 suites, 68 tests OK (los 3 specs
  unit de hoy + el nuevo).
- `npx tsc --noEmit -p tsconfig.json` → el mismo único error que en
  `origin/develop` (`order.service.spec.ts:3`: `mockRequest` no exportado por
  `@woocommerce/woocommerce-rest-api`); nada nuevo.
- `prettier --check` limpio en lo mío; los avisos en `order.service.ts`
  (L436-500, código de #22) ya estaban en HEAD.
- La suite con DB (`order.service.spec.ts`) **no corre en este overlay** por
  dos causas preexistentes: el error TS anterior (ts-jest la rechaza antes de
  ejecutar) y, con diagnósticos apagados vía una config temporal fuera del
  repo, `sqlite3` no está instalado en el `node_modules` enlazado
  (`DriverPackageNotInstalledError`). La aserción de `Soft delete` queda sin
  ejecutar localmente; CI (`deploy.yml`) no corre jest.

## Decisions
- Mismo helper y ubicación que los otros micros (`src/utils/internal-headers.ts`)
  para que la fase 3 de base-api encuentre lo mismo en los cinco repos.
- Sin token → `{}` + `logger.warn` por llamada, no excepción: la config que
  falta se ve en el log y `save()` sigue exactamente igual que hoy.
- Los listeners (`socket/publish`, `notifications/saveOrder`) **no** se tocan:
  van a api-ms (`API_MICROSERVICE_URL`), que ya pone su cabecera al reenviar.

## Blockers / open questions
- Orden de despliegue: orders tiene que salir con la cabecera antes de que
  base-api active el guard. Riesgo menor que en extensions: las dos llamadas
  están `await`eadas dentro de `try/catch` con `logger.error`, así que un 401
  no tumba el proceso ni la orden, solo se pierde el push.
- `MICROSERVICE_TOKEN` está en el `.env` de QA de orders (dato del encargo);
  **en prod no se ha comprobado**.
- Este micro **no** llama a `GET /api/users/socket/counters/:userId`
  (`git grep users/socket -- src` → solo los dos POST).
- Deuda ajena, para cuando toque: `order.service.spec.ts` no compila bajo
  ts-jest (`mockRequest`) y el overlay no tiene `sqlite3`; la suite con DB es
  inejecutable en local desde antes de este cambio.

## Next session
- OK de Angelo → push + PR a `develop` de vio-orders-microservice.
- Fase 3 de base-api cuando los cinco micros estén desplegados con la cabecera.
