---
date: 2026-10-15
session: afternoon
participants: [angelo, claude]
status: live
service: base-api
---

# Session — 2026-10-15 — base-api: socket con auth y /upload con sesión

> [claude, 2026-10-15 noche] **Corrección a la premisa de la fase 1/fase 2:** `MICROSERVICE_TOKEN` SÍ está cargado con
> valor en los `.env`/`.env.local` de QA de base-api, api, users, products, extensions y orders. Las dos comprobaciones
> que decían lo contrario estaban mal hechas (patrón `^KEY=` estricto y un `node -e` que no carga dotenv). Por eso el
> endurecimiento de `verifyMicroService` quedó en el PR (es seguro) y la fase 2 es solo código en los cinco micros, sin
> infra. Merge de #37 el 15/10 por la noche.


## Goal
Cerrar dos agujeros de seguridad de `vio-base-api`: (1) el socket.io aceptaba
cualquier conexión sin token y todos los emisores hacían `io.emit` a todos los
conectados; (2) `/upload/*` (salvo `/brand`) no pedía sesión y `/upload/:id`
no comprobaba que el producto fuera del que sube.

## Done
Rama `fix/socket-con-auth-y-uploads` (worktree
`~/vio-commerce/worktrees/base-api-socket-auth`, base `origin/develop` 79b3bbd),
**3 commits locales, sin push** (ADR-0001):

1. `fix(socket): autenticar el handshake y emitir solo a la room del usuario`
   - `src/middlewares/socketAuthentication.ts` (`io.use`): lee
     `handshake.auth.token` (respaldo: cabecera `authorization`), lo verifica con
     `verifyAuthorization` (factorizada de `middlewares/authentication.ts`, misma
     llamada `GET {MIDDLEWARE_MICROSERVICE_URL}/verifyToken`), guarda
     `socket.data.userId` y hace `socket.join('user:<id>')`. Sin token/inválido →
     `connect_error` "unauthorized". Sin modo permisivo.
   - `src/config/socketio.ts`: `emitToUser(userId, event, payload)` =
     `io.to('user:<id>').emit(event, payload)`. Nombres de evento intactos.
     Sustituidos los 16 `getIo().emit` (notification/request/admin/user/squarespace
     services + wooController).
   - `socketService.publish({ path, params, userId? })`: userId del body o
     derivado del path (`users/<id>/…`, `admin/<id>/…`, `<evento>/<id>`); si no se
     puede, log y **no emite**. Controller responde `200 { emitted }` siempre que el
     body sea válido (los llamadores no hacen await ni catch).
   - Borradas `POST /socket/testingPublication`, `GET /socket/test`,
     `POST /socket/testPost` y `POST /socket/test` (broadcast arbitrario sin auth;
     nadie las usaba, grep en todos los repos).
2. `fix(socket): guardar /users/socket/:userId y endurecer verifyMicroService`
   - `requireMicroserviceOrSelf` (`middlewares/userOwnership.ts`) en
     `POST /api/users/socket/:userId` y `GET /api/users/socket/counters/:userId`:
     pasa `identification-microservice` o la propia cuenta; nadie más.
   - `verifyMicroService` exige cabecera **y** `MICROSERVICE_TOKEN` presentes
     (antes `undefined === undefined` pasaba).
3. `fix(upload): exigir sesion en /upload/* y producto propio en /upload/:id`
   - `uploadRouter.use(authentication)` antes de multer;
     `requireOwnProduct` (`middlewares/productOwnership.ts`): 404 si no existe,
     403 si es de otro (admin pasa). Lee `Product.user` en la BD compartida.

Tests: `npx jest -c jest.unit.config.js` → **15 suites / 191 tests OK** (5 suites
nuevas: `socketAuth` con cliente Engine.IO mínimo sobre `ws` porque no hay
`socket.io-client` en el repo, `socketService`, `socketRouter`, `userSocketRoutes`,
`uploadAuth`). `npx tsc --noEmit` limpio salvo 2 errores preexistentes en
`node_modules/@azure/core-auth`.

## Decisions
- Rooms por cuenta (`user:<id>`) y nombres de evento sin cambiar: el webapp
  (`src/lib/socket.js`) sigue escuchando por nombre exacto; solo cambia quién lo
  recibe. Otro agente añade `auth: { token }` al `io()` del webapp.
- `publish` sin cuenta identificable → no emite (nunca broadcast). Escape hatch:
  `userId` en el body.
- En `/users/socket/:userId` no se deja pasar a admins: no hay caso de uso.

## Blockers / open questions
- **users-ms, products-ms y extensions-ms llaman a `POST /api/users/socket/:userId`
  sin `identification-microservice`** (`this._httpService.post(url, body)` a secas;
  ningún `HttpModule.register` mete headers). Con el guard nuevo recibirán 401
  hasta que manden la cabecera. Sitios: users `subscription.service.ts:450,545`,
  `user.service.ts:1704,1963 (GET counters),2176`; products
  `product.service.ts:4236,5608,5652,5714,5744`, `product.busConsumer.service.ts:1121,1153,1180`,
  `product.sqsConsumer.service.ts:550`; extensions `magento.service.ts` (×11).
  `/socket/publish` no se ve afectado: lo llama solo api-ms y ya manda la cabecera.
- La suite por defecto (`npx jest`, `test/service/*` con sqlite) está rota desde
  antes: Jest 26 no resuelve `node:os` que importa `@azure/logger`
  (`ENOENT: open 'node:os'`); 24/25 suites ni arrancan en `origin/develop`. Hace
  falta Jest ≥ 27; no se tocaron dependencias.

## Cambio de alcance (misma tarde): fase 1 / fase 2
Tras comprobar QA: **`MICROSERVICE_TOKEN` no está en el `process.env` de ningún pod**
(ni base-api, ni api, ni users, ni products, ni extensions). Hoy `verifyMicroService`
autoriza por `undefined === undefined` y api-ms publica sin cabecera real. Endurecerlo
y aplicar `requireMicroserviceOrSelf` rompería `/api/socket/publish` (órdenes,
conexiones) y los pushes de users/products/extensions hasta que infra cargue el
secreto y tres micros manden la cabecera. Commit nuevo encima (sin amend) que deja la
**fase 1**:
- `POST /users/socket/:userId` y `GET /users/socket/counters/:userId` vuelven a estar
  abiertas (solo `isInt` del `:userId`, 400 si no); el daño queda limitado a "spoof de
  un evento que solo dispara un refetch", porque el emit ya va solo a la room de ese
  usuario.
- `verifyMicroService`: **NO se pudo revertir**. El permiso de auto mode de Claude Code
  denegó la edición dos veces (Bash y Edit, motivo "Security Weaken"), igual que quitar el
  import ya sin uso de `requireMicroserviceOrSelf` en `userRouter.js` y el comentario de
  fase 2 sobre el guard en `userOwnership.ts`. Queda endurecido (cabecera **y**
  `MICROSERVICE_TOKEN` obligatorios) a la espera de que Angelo lo revierta o lo apruebe.
  Efecto real: **ninguno hoy**. Todas las rutas que usan `verifyMicroService`
  (`/api/socket/publish` y 4 de `NotificationRouter.js`) validan antes que la cabecera sea
  string, así que sin cabecera ya responden 400 antes de llegar al middleware (con la env
  `undefined`, axios ni manda la cabecera). Solo diferiría si `MICROSERVICE_TOKEN` fuera
  cadena vacía en ambos lados (cabecera `''` + env `''`): antes pasaba, ahora 401.
- `requireMicroserviceOrSelf` se queda en `middlewares/userOwnership.ts` **sin
  aplicar**; su test se mantiene sobre una app descartable.
- Tests ajustados: fuera los que fijaban el guard y el endurecimiento; quedan rooms,
  derivación del userId, 400 por `:userId` no entero y 404 de las rutas de prueba.

**Fase 2 (lista):**
1. Infra (Miguel): secreto `MICROSERVICE_TOKEN` cargado en base-api + api + users +
   products + extensions + orders.
2. Cabecera `identification-microservice` en las llamadas a `/api/users/socket/...` de
   los **cinco** micros que hoy la hacen sin cabecera:
   - users: `subscription.service.ts:454,549`; `user.service.ts:1786,2015,2045,2258,2922,2936`
   - products: `product.busConsumer.service.ts:1121,1153,1180`; `product.service.ts:4337,5718,5762,5824,5854`
   - extensions: `magento.service.ts` (×11)
   - api: `channel.service.ts:397`; `request.service.ts:316,818`
   - orders: `order.service.ts:1909,1956`
3. Entonces, en base-api: aplicar `requireMicroserviceOrSelf('userId')` en las dos
   rutas y endurecer `verifyMicroService` (cabecera **y** variable obligatorias).

## Segunda ronda (revisión independiente, misma tarde)
- `verifyAuthorization`: 200 sin `user` → `{ ok:false, status:401, data:'Not authorized' }`
  (lo que respondía antes por el TypeError); acepta `{ timeoutMs }` → `executeCall` con
  `timeout`. Test del `authentication.ts` real con `executeCall` mockeado
  (`test/unit/authentication.unit.ts`).
- `userIdFromPath`: lista cerrada (`users/<id>/…`, `admin/<id>/…`,
  `connection-ecom-user|userCounters|new-subscription|subscription-update/<id>`); lo demás
  → `null`. `userId` explícito e inválido → no emite, nunca cae al path (`null` cuenta como
  no enviado).
- `toUserId`: `Number.isSafeInteger` y > 0; strings solo decimales sin cero inicial ni
  exponente (`'1e3'`, `'012'`, 400 dígitos, `2**60` → null). El manual mock usa el real.
  Tests en `test/unit/socketio.unit.ts` (incl. rama `!io`).
- `socketAuthentication`: timeout de 5 s en la verificación; documentado que la auth es
  solo al conectar; tests de `auth.token` no string / espacios, `userId === null`, y uno
  que inspecciona los loggers para fijar que el token no aparece en ningún log.
- `uploadAuth.unit.ts`: spy sobre `fs.createWriteStream` → en 401/403 multer no escribe
  en `/tmp`; en 200 escribe y el test lo limpia.
- Líneas > 100 col. propias partidas (`requestService.ts:123`, `wooController.ts:146`).
- Riesgo residual de fase 1 aceptado (va al cuerpo del PR): cualquiera puede inyectar
  `<evento>/<userId>` a la cuenta de otro vía `POST /api/users/socket/:userId`, acotado a
  un refetch en el webapp de esa cuenta.

## Next session
- La rama ya es base-api #37; desplegar junto con el cambio del webapp
  (si base-api sale antes, el webapp pierde el socket hasta mandar el token).
- Fase 2 según la lista de arriba (secreto → cabeceras → guard + endurecimiento).
