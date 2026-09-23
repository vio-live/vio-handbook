---
date: 2026-09-23
session: full-day
participants: [angelo, claude]
status: live
---
# Session — 2026-09-23 — `/users/:id` sin dueño: IDOR, mass assignment y secretos

## Goal

Cerrar el segundo issue de prod que dejó abierto el estudio de entrega de órdenes
([2026-09-22](2026-09-22-como-llega-la-venta-al-comercio.md), repetido como pendiente en
[el fix del webhook de Stripe](2026-09-22-stripe-webhook-forgery-fix.md)): `PATCH /api/users/:id`
no comprobaba que `:id` fuera el que llama. Reglas de siempre: rama + PR a `develop`, nada a
`main`/`master`, nunca contra prod.

## Done

### La cadena (leída en código, `develop` y `master` iguales)

`userRouter.patch('/users/:id', …, verifyToken, userController.update)` — `verifyToken` sólo
prueba que el token de Firebase es válido y llena `req.user`; nadie miraba `:id`. El controller
reenvía `req.params.id` + `req.body` a users-ms, y `@Patch('/:userId')` no tiene guard.
El dashboard guarda ahí el webhook de órdenes del seller (`lib/settings.js`, `setOrderWebhook`),
y orders postea **cada orden pagada** — nombre, email, teléfono y dirección del comprador — a
esa URL. Cualquier usuario registrado podía apuntarse el webhook de otro seller.

### Lo que apareció al auditar, y que hace que el check del edge no alcance

`update()` en users-ms volcaba el body sobre la fila que guardaba (`{ id, ...user }`, con el
`id` del body **después** del de la URL). Reproducido en la base de prueba en memoria, con el
código tal cual está en `develop`:

| body | qué pasaba |
|---|---|
| `{id: <otro>, name}` | se renombraba la otra cuenta |
| `{settings: {id: <settings del otro>, orderWebhookUrl}}` | se repuntaba el webhook del otro seller |
| `{business: {id: <business del otro>}}` | se escribía la fila del otro |
| `{userRole: [{role: {idRole: 1}, activeUserRole: true}]}` | **el que llama quedaba admin** (`isAdmin: true`) |
| `{apiCredentials: [{apiKey: 'chosen'}]}` | credencial de API con la key elegida |
| `{uid, active: false, rate: 999}` | identidad, estado y ranking |

Los tres últimos son sobre la **propia** cuenta: un check de dueño en el edge no los para. Admin
en Commerce llega a `/api/admin/*`, incluido `generateCustomToken` (loguearse como cualquiera).

Lo mismo en el alta: `POST /users` no tiene autenticación —es el signup— y `doSave()` volcaba el
body igual. Un signup con `userRole` creaba una cuenta **ya admin**.

### Confirmado en QA (sólo QA, nunca prod)

Sin credenciales y sin tocar ninguna fila real, por port-forward en `kubernetesqa`:

- `GET /api/users/sellers/squarespaceApiTokens` en base-api, **sin header `Authorization`** → `200`.
  La ruta no tiene ningún middleware de auth y devuelve el token de Squarespace de todas las
  cuentas; en QA el array volvió vacío (ninguna cuenta tiene uno configurado), así que no se
  expuso ni se imprimió ningún secreto.
- users-ms, sin `Authorization`: `GET /test` → `200`, `GET /999999999` (id inexistente) → `400`,
  **no 401**. El servicio no pregunta nunca quién llama; se confía en el gateway.

Lo que **no** se confirmó en vivo: el PATCH A→B autenticado en el edge. Hacía falta operar como
dos usuarios de prueba (dos ID tokens de Firebase) y eso es autenticarse en nombre de alguien;
queda como repro para Angelo (abajo). El comportamiento está cubierto por tests locales sobre el
mismo blob que corre en QA/prod (`user.controller.ts` = `15cba5c` en las dos ramas).

### Los fixes — tres PRs, se liberan juntos

- **base-api [#14](https://github.com/vio-live/vio-base-api/pull/14)** (`fix/users-ownership`) — quién
  puede llamar: `requireSelfOrAdmin` en `PATCH /users/:id`, `/users/:id/{shopify,magento,logistics}`,
  `GET`+`DELETE /users/:id/requests` y `PUT /users/:id/requests/:requestId`; `guardUserUpdate`
  limpia del body lo que decide *de quién* es la fila; `/users/settings` (devolvía los settings de
  **todas** las cuentas a cualquier autenticado) pasa a admin y `/users/settings/:id` a dueño;
  las dos rutas de tokens de Squarespace pasan a admin; el secreto del webhook sale enmascarado
  de todas las respuestas; se dejan de loguear el ID token, el `MICROSERVICE_TOKEN` y el user
  entero. 51 tests unit nuevos (`yarn test:unit`).
- **users-ms [#11](https://github.com/vio-live/vio-users-microservice/pull/11)** (`fix/users-ownership`) —
  qué puede tocar una escritura: la URL decide la cuenta, `settings`/`business` se atan a las filas
  que la cuenta ya tiene, allowlist de columnas de perfil (se cae toda relación), el signup escribe
  lo mismo, `UserOwnershipGuard` (verifica el ID token que reenvía base-api) en las 7 rutas
  `/:userId`, **inyección SQL** en `find()` (`requestState` de la query string iba interpolado al
  SQL) y secretos/contraseñas fuera de los logs INFO. 28 unit + 10 contra la DB en memoria.
- **api-ms [#24](https://github.com/vio-live/vio-api-microservice/pull/24)** (`fix/users-ownership`) —
  `deleteRequestsByUserId` borraba cualquier id de conexión que le pasaran (y con una aceptada, los
  productos importados de las dos partes). Ahora sólo las dos cuentas de la conexión.

En los tres, los tests fallan contra el código de `develop` y pasan con el fix.

## Decisions

- **El edge decide quién; el servicio decide qué.** base-api chequea la cuenta de la URL; users-ms
  ata las filas y mantiene la allowlist de campos. Se duplica a propósito (defensa en profundidad):
  los microservicios no tienen guards y se alcanzan dentro del cluster.
- **El secreto del webhook no sale nunca en claro.** Vuelve enmascarado (`••••`+4) y un valor
  enmascarado en una escritura significa "dejá el guardado" — que es lo que el dashboard ya manda.
  Los dos lados lo descartan, así que el enmascarado es seguro aunque se libere un repo solo.
- **Tests unit sin DB** siguiendo la convención que ya existía en api-ms (`*.unit.spec.ts` +
  `jest.unit.json` + `yarn test:unit`), también en users-ms y base-api.

## Blockers / open questions

- **Necesita release a prod después del review.** Sin `gh pr merge` — mergea Angelo. Los tres PRs
  juntos: sin el de users-ms, un `id` en el body todavía redirige la escritura.
- **Repro del PATCH A→B en QA**, para correr con dos cuentas de prueba (dos ID tokens):
  `curl -s -o /dev/null -w '%{http_code}\n' -X PATCH -H "authorization: $TOKEN_A" -H 'content-type: application/json' -d '{"description":"idor-probe"}' http://127.0.0.1:18080/api/users/$ID_B`
  (port-forward de `svc/base-api` en `kubernetesqa`). Hoy: `200`. Con #14: `403`. Restaurar
  `description` después.
- **Sin tocar, reportado:** `POST /api/users/create/subscription` sin autenticación con `userId`
  y `codePlan` arbitrarios; `GET /api/users` devuelve todas las columnas de todos los usuarios
  (incluidos `squarespaceApiToken` y `facebookAccessToken`) a cualquier autenticado, y
  `GET /users/:id/requests` la fila completa de la contraparte; `GET /users/registeredEmail/:uid`
  resuelve el email de cualquier uid; el kernel `@vio-/logger` loguea cuerpo y respuesta de cada
  request a INFO (Datadog) — la redacción debería vivir ahí, no en cada handler.
- **Infra:** el `VirtualService` de prod `msrvc-p.vio.live` rutea `/users`, `/api`, `/orders`… a
  microservicios que no tienen auth propia. Sin DNS, pero el gateway de Istio es público y rutea
  por Host. Verificar si acepta tráfico externo (no se probó: es prod).
- Las suites viejas de base-api y users-ms no corren, antes ni después: jest 26 no resuelve los
  imports `node:` de `@azure/logger`, el esquema del kernel tiene columnas `json` que sqlite
  rechaza y `user.service.spec.ts` no compila.

## Next session

- Al mergear: `gh run list` verde en los tres y correr el repro de arriba en QA (debe dar 403).
- Decidir si los "sin tocar" se abren como PRs aparte (el de `GET /api/users` es el más gordo:
  filtra credenciales de terceros a cualquier cuenta registrada).
