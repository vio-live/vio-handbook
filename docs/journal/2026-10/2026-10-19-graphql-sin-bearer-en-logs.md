---
date: 2026-10-19
session: quick-fix
participants: [angelo, claude, svc-graphql]
status: live
---

# Session — 2026-10-19 — graphql: ninguna credencial en los logs

## Goal

Cerrar el hallazgo de la sesión de `buyer_ref`
([journal](2026-10-19-graphql-buyer-ref-en-checkout.md)): `ConfirmPaymentApplePay` mandaba el bearer
del cliente a Datadog en cada confirm. Y revisar `src/` entero por cualquier otro log que interpole
`auth`, `authorization`, `bearer`, `token`, `apiKey`, `x-api-key` o cabeceras completas.

## Done

- Rama `fix/sin-bearer-en-logs` desde `origin/develop` (`0c6fd70`), worktree
  `~/vio-commerce/worktrees/graphql-sin-bearer-en-logs`. **Commit local `9f25bb8`, sin push ni PR**
  (ADR-0001): 10 archivos, +425/−20.
- **Inventario (grep de `logger.*`/`console.*` y de toda interpolación `${…auth|token|apiKey…}`)** —
  no era una línea, eran cinco archivos:
  1. `Services/Sdk/Checkout/Payment/ApiRestSdkCheckoutPaymentService.ts:1069` — `auth=${…auth}`: el
     bearer en claro.
  2. `GraphQL/plugins/LogResponsePlugin.ts:62-66` — `getHeadersWithouthApiKey` devolvía, pese al
     nombre, **todas** las cabeceras del request (la `authorization` = API key del cliente) y
     `variables` sin filtrar (`apple_pay_token`, `authorization_token`), en **cada** respuesta GraphQL.
  3. `Fetcher/LogAxiosResponseInterceptor.ts:49-50, 72, 95, 111-117` — `body: config.data` (el cuerpo
     enviado al micro: tokens de Apple/Google/Klarna) y `errorResponse.data`; cabeceras de respuesta
     del micro (`set-cookie` posible).
  4. `Redis/RedisService.ts:10, 53-57` — `console.log('config', config)` con `CACHE_PASSWORD` y
     `DATADOG_API_KEY` al arrancar, y `configRedis` con `password`.
  5. `Utils/Auth.ts:8, 23` — `JSON.stringify(info)` del usuario de middleware en cada resolver
     (`loginInfo.specificApiKey`, forma no confirmada).
  Revisados y **no tocados** (no llevan credencial): los `console.log('*data'|'*body')` de
  `ApiRestSdkCartService`/`ApiRestSdkDiscountService`, el `console.log('********r', response)` de
  `Cart.Mutation.ts`, los `logger.info` de `AuthPlugin` (solo flags y `error.message`), y la URL del
  transporte de Datadog (no es un log).
- **Helper `src/Infra/Logger/Redact.ts`**: `isSecretKey` (regex
  `authorization|^auth(Header)?$|bearer|token|api[-_]?key|password|passwd|secret|cookie|credential`),
  `describeSecret` → `<empty>` / `<redacted len=N>` / `<redacted typeof>`, `redactSecrets` (copia
  profunda sin mutar, respeta instancias de clase, tope de profundidad 8 para ciclos) y `redactBody`
  (parsea un JSON serializado, redacta y vuelve a serializar; lo que no es JSON se deja). Lo que viaja a
  los micros no cambia.
- **Tests nuevos** (45): `tests/Infra/Logger/Redact.spec.ts` (helper, 22 casos de claves),
  `tests/Infra/GraphQL/plugins/LogResponsePlugin.spec.ts` (plugin con contexto Apollo falso: ni la
  `authorization` ni `x-api-key` ni `apple_pay_token` llegan al `logger.response`; `<empty>` si venía
  vacía), `tests/Infra/Fetcher/LogAxiosResponseInterceptor.spec.ts` (éxito y error con rethrow),
  `tests/Infra/Services/Sdk/Checkout/Payment/ConfirmPaymentApplePayLog.spec.ts` (harness del service:
  la línea dice `auth=<redacted len=N>` o `auth=<empty>`, nunca el bearer, y el bearer sigue yendo a
  shopcart).
- **Resultados**: `npx tsc --noEmit -p tsconfig.json` exit 0. `NODE_ENV=test npx jest`: develop
  **8 suites / 52 tests** → **12 suites / 97 tests**, todo en verde. Prettier limpio en lo nuevo; en los
  5 archivos preexistentes (4 ya sucios en develop) ninguna de mis líneas es de las que prettier
  cambiaría.

## Decisions

- Presencia y longitud, nunca el valor, también para los tokens de pago de un solo uso
  (`apple_pay_token`, `authorization_token`): el criterio es por nombre de clave, no por tipo de
  credencial, para no tener que decidir caso a caso.
- Se redacta por **nombre de clave** a cualquier profundidad (objetos, arrays, JSON serializado) en
  vez de por "campos conocidos": las variables GraphQL y los cuerpos a los micros cambian con cada
  pasarela nueva.
- `getHeadersWithouthApiKey` → `redactedHeaders`: el nombre viejo prometía algo que no hacía.

## Blockers / open questions

- `Utils/Auth.ts` sigue volcando el usuario de middleware (email, flags) en cada resolver; ya sin
  credenciales, pero es PII y ruido. Fuera de este fix.
- Los `console.log` de depuración de Cart/Discount siguen ahí (sin credenciales). Fuera de este fix.

## Next session

- OK de Angelo → push + PR de `fix/sin-bearer-en-logs` contra `develop`. Es independiente de
  `feat/buyer-ref-en-checkout`; se pueden mergear en cualquier orden.
