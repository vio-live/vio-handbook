---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
service: products
status: live
---

# Session — 2026-10-15 — products: cabecera interna en los POST a `/api/users/socket/:userId`

## Goal
Fase 2 de [base-api: socket con auth](./2026-10-15-base-api-socket-con-auth-y-uploads.md)
(vio-base-api #37): base-api va a exigir `identification-microservice` (valor = env
`MICROSERVICE_TOKEN`) en `POST /api/users/socket/:userId` y
`GET /api/users/socket/counters/:userId`. `vio-products-microservice` hacía 9 POST a la
primera sin cabecera (scraper ×4 y `status-ecom-user` en `product.service.ts`; `callSocket*`
×3 en el consumidor del Service Bus; ×1 en el consumidor SQS muerto). Añadirla con un helper
reutilizable sin tocar cuerpos, URLs ni manejo de errores. Hermanas:
[api](./2026-10-15-api-cabecera-interna-users-socket.md) y
[extensions](./2026-10-15-extensions-cabecera-interna-users-socket.md).

## Done
Rama `fix/cabecera-interna-users-socket` (worktree
`~/vio-commerce/worktrees/products-cabecera-interna`, base `origin/develop` `1f7f825`),
**2 commits locales, sin push** (ADR-0001). `git diff --stat origin/develop..HEAD`: 9 archivos,
+384 líneas (de las cuales 352 son specs).

1. `817ba4b fix(socket): manda la cabecera interna en los avisos a /api/users/socket de base-api`
   - `Configuration.MICROSERVICE_TOKEN` en `src/config/utils/config.keys.ts` (no existía en
     este micro; el `ConfigService` propio lee el `.env` del `PROCESS_ENV`, así que basta la
     clave).
   - `src/config/utils/internal-headers.ts`: `INTERNAL_HEADER` y `internalHeaders(config)` →
     `{ 'identification-microservice': token }`; sin token devuelve `{}`. Tipo estructural
     `{ get(key) }`, no `ConfigService` (hace `process.exit` si falta el `.env`).
   - Tercer argumento `{ headers: internalHeaders(this._configService) }` en las 9 llamadas:
     `product.service.ts` (`importProductFromMagento` → `status-ecom-user`; `executeScraper`
     → `scraping` PENDING/PENDING/SUCCESS/FAILED), `product.busConsumer.service.ts`
     (`callSocketBaseApiPublishProduct`, `callSocketBaseApiImportProduct`, `callSocket`) y
     `product.sqsConsumer.service.ts` (`callSocketBaseApiPublishProduct`). Inserción por script
     que exigía la estructura exacta (URL → `{` → `},` al mismo indent) y abortaba si no cuadraba;
     el diff son sólo esas 9 líneas + 3 imports.
   - `MICROSERVICE_TOKEN=` como placeholder en `.env.test` (versionado).
2. `e2d3f24 test(socket): la cabecera interna llega en los avisos por socket, con y sin token`
   - `src/config/tests/internal-headers.spec.ts` (3): nombre, valor desde la config, `{}` sin
     token.
   - `src/modules/product/tests/socket-internal-header.spec.ts` (3): `ProductService` sin BD
     con los mocks de `variant-price-paths.spec.ts`. `executeScraper` con Cloud Run devolviendo
     `[]` → 3 avisos con cabecera y el POST a Cloud Run sin ella; con `save` del job fallando →
     aviso FAILED con cabecera. `importProductFromMagento` con `health-check` `active:false` →
     `status-ecom-user` con cabecera, health-check a extensions sin ella, y el método devuelve
     `{ executed: false }` (su `catch` no relanza).
   - `src/modules/product/tests/consumers-socket-internal-header.spec.ts` (5):
     `ProductBusConsumerService` y `ProductSqsConsumerService` instanciados sin BD mockeando
     `@azure/service-bus`, `aws-sdk`, `sqs-consumer`, `@vio-/logger` y
     `../providers/product.service`; URL + cuerpo exacto + cabecera; sin token el tercer
     argumento es `{ headers: {} }`.

Verificación (overlay `node_modules` del clon principal, kernel instalado 1.0.258):
- `npx jest --setupFilesAfterEnv=<scratch>/jest-nodb-setup.js -- <3 specs>` → **3 suites /
  11 tests OK**. Suite completa sin BD (`--testPathIgnorePatterns '\.service\.spec\.ts$'`) →
  **16 suites / 153 tests OK** (eran 13/143 esta mañana). El setup sólo hace
  `require('<abs>/node_modules/reflect-metadata')`; no existe `.jest-nodb-setup.js` en el repo.
- `npx tsc --noEmit -p tsconfig.json` → limpio antes y después (los specs entran en el
  type-check porque `tsconfig.json` no tiene `include`).
- Prettier: limpio en todo lo nuevo. `product.service.ts` y `product.busConsumer.service.ts`
  ya estaban sucios en `origin/develop`; comprobado que mis líneas son exactamente lo que
  prettier produciría y **no se reformatearon** (diff mínimo).

## Decisions
- Helper en `src/config/utils/` junto a `config.keys.ts` (sólo depende de `Configuration`),
  no un método de `ConfigService` ni un privado por servicio: tres servicios lo usan y cualquier
  llamada futura a base-api lo reutiliza. Mismo criterio que extensions.
- Sin token → `{}` (la llamada sale como hoy y es base-api quien la rechaza) en vez de mandar
  `undefined` (axios 0.21 / Node la rechazan antes de salir, con un error que no dice nada del
  token). Misma decisión que extensions y api.
- Se parcheó también `product.sqsConsumer.service.ts` aunque sea dead code (no está en ningún
  módulo): si alguien lo revive, que no vuelva a salir sin cabecera.
- `console.error` del `catch` de `importProductFromMagento` silenciado sólo en el spec; el
  código no se tocó.

## Blockers / open questions
- **Riesgo de despliegue (nuevo hallazgo, en el brief §9)**: los 9 avisos son
  `lastValueFrom(post(...))` sin `await` ni `.catch`, y ni `src` ni el kernel `@vio-/*`
  registran `unhandledRejection` (Dockerfile `node:22`). Hoy es latente (base-api caída o 5xx).
  Con la fase 2, un `MICROSERVICE_TOKEN` ausente o distinto al de base-api convierte cada aviso
  en 401 → rechazo sin handler → **pod reiniciado** en cada scraping/publish/feed. **El token
  tiene que estar en products antes de que base-api lo exija.** No se cambió el manejo de
  errores (fuera del encargo); si se quiere blindar, es un `.catch` + `logger.warn` por aviso.
- El encargo dice que `MICROSERVICE_TOKEN` ya está cargado en products en QA; el brief de
  base-api (misma fecha) dice que no está en el env de ningún pod. No lo pude comprobar desde la
  laptop (sin acceso a K8s): confirmar en el chart/secret de products antes del merge.
- Este micro **no llama** a `GET /api/users/socket/counters/:userId`
  (`git grep counters -- src` sólo da `UserCountPlan`).
- Falta QA real: el worktree no tiene BD ni red a QA; la cabecera se verificó sólo por spec.
- `package.json` pinnea `@vio-/*` 1.0.273 pero el overlay de `node_modules` trae 1.0.258:
  `tsc`/`jest` corrieron contra el kernel viejo. Nada de lo tocado usa el kernel más allá de
  `Entity`/`logger`, así que no debería cambiar, pero la verificación de verdad es el `yarn
  build` del Dockerfile.

## Next session
- OK de Angelo → push de `fix/cabecera-interna-users-socket`, PR a `develop`. Coordinar con
  users/api/extensions/orders (misma fase 2) y con el secreto en K8s antes de que base-api
  aplique `requireMicroserviceOrSelf`.
- `briefs/products.md` actualizado (commits locales `0c854a0` y siguiente en `~/vio-commerce`).
