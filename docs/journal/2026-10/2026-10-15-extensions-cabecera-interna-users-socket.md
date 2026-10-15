---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
status: live
service: extensions
---

# Session — 2026-10-15 — extensions: cabecera interna en `/api/users/socket`

## Goal
Fase 2 de [base-api: socket con auth](./2026-10-15-base-api-socket-con-auth-y-uploads.md)
(vio-base-api #37): base-api va a exigir `identification-microservice` (valor =
env `MICROSERVICE_TOKEN`) en `POST /api/users/socket/:userId` y
`GET /api/users/socket/counters/:userId`. `vio-extensions-microservice` hacía
11 llamadas a la primera sin cabecera; con el guard recibirían 401 y el front
dejaría de enterarse de publish/login/stages de Magento.

## Done
Rama `fix/cabecera-interna-users-socket` (worktree
`~/vio-commerce/worktrees/extensions-cabecera-interna`, base `origin/develop`
e171979), **2 commits locales, sin push** (ADR-0001):

1. `4f0587f Añade MICROSERVICE_TOKEN y el helper internalHeaders para base-api`
   - `Configuration.MICROSERVICE_TOKEN` en `src/config/utils/config.keys.ts`
     (no existía en este micro).
   - `src/utils/internal-headers.ts`: `internalHeaders(configService)` →
     `{ 'identification-microservice': token }`; sin token devuelve `{}` para
     no mandar una cabecera `undefined` (axios 0.21 / Node la rechazan antes
     de salir, y la llamada moriría por otra causa).
   - `src/utils/tests/internal-headers.spec.ts` (usa `Pick<ConfigService,'get'>`
     porque el `ConfigService` real hace `process.exit` si falta el `.env`).
   - `MICROSERVICE_TOKEN=` como placeholder en `.env.test`.
2. `086cec5 Manda la cabecera interna en los avisos por socket de Magento`
   - `{ headers: internalHeaders(this._configService) }` como tercer argumento
     de `HttpService.post` en las 11 llamadas de
     `src/modules/magento/providers/magento.service.ts` (eventos
     `product-publish` PENDING/SUCCESS/ERROR ×7, `new-channel`,
     `connection-ecom-user` ×2, `active-ecom-user`, `product-sync-stage`).
     Cuerpos, URLs y manejo de errores intactos.

`git diff --stat origin/develop..HEAD`: 5 archivos, +69 líneas.

**Sin verificación local**: el repo no tiene `node_modules` y el token npm da
401 (`@vio-/*`), así que ni `tsc` ni `jest`. La inserción se hizo con un script
que exigía la estructura exacta (`URL` → `{` → `},` al mismo indent) y abortaba
si no cuadraba; la verificación real es `yarn build` del Dockerfile
(`tsconfig.build.json` excluye `**/*spec.ts`; el workflow de deploy **no corre
jest**, el spec solo sirve en local).

## Decisions
- Helper en `src/utils/` y no método privado del servicio: shopify/woo no lo
  necesitan hoy (sus `/socket/publish` van a api-ms, que ya pone su cabecera
  al reenviar a base-api), pero cualquier llamada futura a base-api lo reutiliza.
- Sin token → `{}` (misma llamada que hoy, 401 visible en base-api) en vez de
  lanzar: no añadir un modo de fallo nuevo en un micro sin tests ejecutables.

## Blockers / open questions
- **Orden de despliegue**: extensions (y users/products/api/orders) tienen que
  salir con la cabecera **antes** de que base-api aplique
  `requireMicroserviceOrSelf`. 10 de las 11 llamadas son fire-and-forget
  (`lastValueFrom(...)` sin `await` ni `.catch`) y en `src/` no hay
  `process.on('unhandledRejection')`: un 401 ahí sería un rechazo sin manejar,
  que en Node 20 por defecto tumba el proceso (no verificado si el kernel
  `@vio-/*` registra un handler). La 11.ª (`processLogin`, ~L2965) sí está
  `await`eada dentro de `try/catch` → el login de canal Magento fallaría.
  Fuera de alcance arreglarlo aquí (el encargo era no tocar manejo de errores).
- `MICROSERVICE_TOKEN` está en el `.env` de QA de extensions (confirmado en el
  journal de base-api); **en prod no se ha comprobado**. Si falta, el helper
  manda `{}` y base-api devolverá 401 cuando active el guard.
- Este micro **no** llama a `GET /api/users/socket/counters/:userId`
  (`git grep users/socket -- src` → solo los 11 POST).

## Next session
- OK de Angelo → push + PR a `develop` de vio-extensions-microservice.
- Coordinar con base-api la fase 3 (guard + `verifyMicroService` endurecido)
  cuando los cinco micros estén desplegados con la cabecera.
