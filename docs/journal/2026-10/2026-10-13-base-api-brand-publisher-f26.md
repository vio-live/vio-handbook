---
date: 2026-10-13
session: "base-api: proxies de los pagos de la cuenta (F2.6)"
participants: [angelo, claude, svc-base-api]
status: live
---

# base-api — F2.6: proxies de los pagos de la cuenta

## Goal

Hacer F2.6 del [plan de campañas en Commerce](../../handoff/campanas-en-commerce-plan-de-ejecucion.md)
en vio-base-api: exponer al dashboard el contrato nuevo de api
(`GET`/`PUT /paymentmethod/account/:userId`, ver el
[journal de F2.3](2026-10-13-api-brand-publisher-f23.md)), con la cuenta tomada de la sesión, y
documentar que `POST /api/channel/update/settings/:id` ya no guarda pagos.

## Done

Rama local **`feature/brand-publisher`** desde `origin/develop` (`bdf89cd`), en el worktree
`~/vio-commerce/worktrees/base-api-brand-publisher`. Tiene 2 commits, **sin push y sin PR**
(ADR-0001), y se le quitó el upstream.

- `5a475a6` **Proxies `GET` y `PUT /api/paymentmethod/account`.**
  - La cuenta sale de `req.user.id`. Un admin puede elegir otra con `?userId=`. El chequeo de
    rol es el mismo de `verifyAdminUser`: se extrajo a `isAdminUser`
    (`src/config/middlewares.js:24`), sin cambiar su comportamiento. La decisión la toma
    `resolveAccountUser` (`src/middlewares/userOwnership.ts:87`), que deja la cuenta en
    `res.locals.accountUserId`.
  - Un `?userId=` de alguien que no es admin se ignora y se loguea un warn. Si la tabla de
    roles no se puede leer, responde 500: no cae a la cuenta propia.
  - El `PUT` acepta el cambio suelto o envuelto en `data`, y solo reenvía `switches` y
    `useVioAccount`. Un `userId` en el body nunca elige la cuenta, ni siquiera si viene de un
    admin.
  - Reenvía `authorization`. Los 400 y 404 de api llegan tal cual.
  - Las rutas quedan antes de `GET /paymentmethod/:id`. Si no, esa ruta captura el GET como
    `id = "account"`.
  - Tienen Swagger en `/apidoc-internal`, con los schemas `AccountPayments` y
    `AccountPaymentsUpdate`.
- `e7ec171` **Swagger de `POST /api/channel/update/settings/{channelUserId}`.** Antes no
  tenía. Base-api reenvía el body tal cual (`channelController.ts:640` solo fija `userId`
  desde la sesión). El doc dice que los campos de pago se ignoran y manda a
  `PUT /api/paymentmethod/account`.
- **Tests:** `test/unit/accountPayments.unit.ts`, 19 tests. Corren el router, el middleware,
  el controller y el service reales, y mockean el micro de auth, la tabla de roles y
  `executeCall`. Cubren:
  - 401 sin sesión, en `GET` y en `PUT`;
  - lectura y escritura de la cuenta propia;
  - el `userId` de un no-admin ignorado, en la query y en el body (suelto y en `data`);
  - un admin que lee y escribe otra cuenta;
  - que manda la tabla de roles y no el flag del micro de auth;
  - un 400 para un `userId` inválido de un admin;
  - un 500 si los roles no se pueden leer;
  - que los 400 y 404 de api pasan tal cual.

  Dos mutaciones (sacar el chequeo de admin y poner las rutas después de `/:id`) rompen 3 y
  8 tests.
- **Verificación:**
  - `jest -c jest.unit.config.js`: 7 suites y 106 tests en verde. Antes eran 87.
  - `tsc --noEmit` (con `tsconfig.json` y con `tsconfig.build.json`): solo quedan los 2
    errores que ya estaban, en los tipos de `@azure/core-auth` dentro de `node_modules`.
  - `node_modules` es un symlink al del repo principal.
  - `swagger-jsdoc` genera las dos specs sin errores.

## Decisions

Las tomó el agente en el código; Angelo puede objetarlas.

- **El `?userId=` de un no-admin se ignora, no se rechaza.** Así lo pidió el coordinador. La
  respuesta trae `userId`, así que el cliente ve qué cuenta se leyó o escribió.
- **El rol lo decide la tabla de roles**, igual que `verifyAdminUser`, no el `isAdmin` del
  micro de auth. Para eso se extrajo `isAdminUser`, en vez de duplicar el chequeo.
- **base-api no valida los valores.** Los valida api, que responde 400. base-api solo filtra
  las claves.

## Blockers / open questions

- **Los nombres de las claves en el Swagger** (los 11 encendidos y `stripe/klarna/vipps/qliro/adyen`)
  salen de la fila 2.1 del plan y del brief de api, no del código de api. Si no coinciden, solo
  está mal el doc: base-api reenvía los objetos tal cual.
- **El Swagger de `update/settings` también sale en el `/apidoc` público**, porque
  `channelRouter.js` entra entero en esa spec. Ya pasaba con otras rutas autenticadas del
  router.
- **`swagger/yamls/*.yaml` no se regeneró.** El Dockerfile los regenera en el build.
- **Sin probar contra QA:** la rama de api no está mergeada ni desplegada.
- **`/channel/me` todavía documenta `settings` de pago** como si fueran del channel. Ahora los
  calcula api desde la brand. No se tocó.

## Next session

- OK de Angelo para push y PR de `feature/brand-publisher` de base-api (ADR-0001). Conviene
  hacerlo después de mergear el PR de api, o junto con él.
- **webapp (2.7):** Settings › Payments contra `GET`/`PUT /api/paymentmethod/account`.
