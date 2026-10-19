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
  `~/vio-commerce/worktrees/graphql-sin-bearer-en-logs`. Commit `9f25bb8` (primera vuelta) →
  **PR [graphql#29](https://github.com/vio-live/graphql/pull/29)** → revisión → commit `5c3dd89`
  (segunda vuelta), **pusheado a la rama del PR con OK explícito de Angelo para esa rama**.
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
  4. `Redis/RedisService.ts:10, 53-57` — `console.log('config', config)` con `CACHE_PASSWORD` al
     arrancar (el config de Redis **no** lleva `DATADOG_API_KEY`; eso lo lee `DataDogProvider` de
     `process.env` — corregido en la revisión), y `configRedis` con `password`.
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
- **Segunda vuelta (revisión del PR, commit `5c3dd89`)** — un blocker y cuatro warnings:
  - **B1**: los `catch` del interceptor hacían `logger.error(msg, { error })` con el `AxiosError`
    entero; con winston `format.json()` su `toJSON()` lleva `config.headers` (`authorization`) y
    `config.data` (el token de pago). Y `error()` lanzaba dentro de su propio `try`, así que ese `catch`
    corría en **toda** llamada fallida y en cada reintento. Ahora: `describeError` →
    `{ name, message, code, status, method, url }` (nunca `config`/`request`/`response`) y el error
    original se relanza fuera del `try`. `messsage` (triple s) corregido.
  - **W1** regex ampliada (`(session|redirect)_result`, `session_data`, `ephemeral`,
    `client/checkout/private_key`, `jwt`, `signature`, `hmac`, `cvv`, `cvc`). **W2** `redactUrl`/
    `redactQuery` en toda URL logueada (shopcart recibe `session_result`/`redirect_result` por query).
    **W3** falla cerrado: `<max depth>`, `<circular>` (WeakSet por camino; una referencia compartida sí
    se expande), `Buffer`/typed arrays/`Map`/`Set` por tamaño, instancias de clase por sus claves,
    `Error` → `describeError`. **W4** `scrubText` para cuerpos no JSON (`key=value` y `Bearer`/`Basic`).
  - Nits: `params` por `redactSecrets` en todos los caminos; `Responser` (no montado, pero en el
    contenedor DI) redacta cabeceras/query/cuerpos en vez de devolverlo todo; comentario-changelog
    fuera del plugin; texto de `Redact.ts` corregido.
  - Tests: el spec del interceptor mete `Bearer …` en `config.headers.authorization`, un token en
    `config.data` y `session_result` en la query, y afirma que `JSON.stringify([response.calls,
    error.calls, info.calls])` no contiene ninguno en éxito, en los tres caminos de error y cuando el
    propio logger falla. Spec nuevo de `Responser`.
- **Resultados finales**: `npx tsc --noEmit -p tsconfig.json` exit 0. `NODE_ENV=test npx jest`: develop
  **8 suites / 52 tests** → primera vuelta 12 / 97 → **13 suites / 134 tests**, todo en verde. Prettier
  limpio en lo nuevo; en los archivos preexistentes ya sucios en develop ninguna de mis líneas es de las
  que prettier cambiaría.

## Decisions

- Presencia y longitud, nunca el valor, también para los tokens de pago de un solo uso
  (`apple_pay_token`, `authorization_token`): el criterio es por nombre de clave, no por tipo de
  credencial, para no tener que decidir caso a caso.
- Se redacta por **nombre de clave** a cualquier profundidad (objetos, arrays, JSON serializado) en
  vez de por "campos conocidos": las variables GraphQL y los cuerpos a los micros cambian con cada
  pasarela nueva.
- `getHeadersWithouthApiKey` → `redactedHeaders`: el nombre viejo prometía algo que no hacía.
- Un `Error` dentro de `redactSecrets` se convierte en `describeError` en vez de dejarse pasar: la
  revisión decía "Date/Error se dejan", pero un `AxiosError` que pasa intacto serializa la request con
  winston, así que la regla "falla cerrado" pesa más. Anotado en el PR.

## Blockers / open questions

- `Utils/Auth.ts` sigue volcando el usuario de middleware (email, flags) en cada resolver; ya sin
  credenciales, pero es PII y ruido. Fuera de este fix.
- Los `console.log` de depuración de Cart/Discount siguen ahí (sin credenciales). Fuera de este fix.

- **Seguimiento anotado en el PR, no tocado**: **W5** `LogResponsePlugin` sigue mandando el texto del
  documento GraphQL (`query`): un cliente que inline el token como literal lo manda en claro. **W6**
  facets/retención en Datadog de lo ya enviado (`authorization`, `apple_pay_token`).

## Next session

- Merge de [graphql#29](https://github.com/vio-live/graphql/pull/29) (decide Angelo) → develop → QA.
  Independiente de `feat/buyer-ref-en-checkout` (#28); cualquier orden.
- W5 y W6 como fix propio.
