---
date: 2026-09-29
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-29 — Stripe Connect para Vio Commerce

## Goal

Resolver el cobro para clientes **sin contrato** con Stripe, Klarna o Vipps sin que Vio toque el
dinero (tema legal), y dejarlo implementado de punta a punta: backend, dashboard y SDKs.

## Done

**Decisión e investigación** → [ADR-0022](../../decisions/0022-stripe-connect-como-opcion-de-cobro.md) (accepted).
- Klarna por Stripe: disponible en Noruega (NOK), soporta Connect con todos los tipos de cobro; en Standard el seller lo activa en su dashboard.
- Vipps por Stripe: existe con Connect, pero en *private preview*. Alternativa: Vio como partner de Vipps MobilePay (el comercio firma su contrato y liquida a su cuenta).
- PSD2/EBA: una plataforma para comprador y vendedor sólo queda fuera si **nunca posee ni controla los fondos** → cobro directo sobre cuentas Standard.

**Implementación** — una rama `feature/stripe-connect` por repo, un PR por repo, sin merge:

| Repo | PR | Qué |
|---|---|---|
| vio-base-api | [#19](https://github.com/vio-live/vio-base-api/pull/19) | rutas `/api/paymentmethod/stripe/connect/{onboard,status,mode}`; `?userId=` de la sesión en GET/DELETE por id |
| vio-api-microservice | [#28](https://github.com/vio-live/vio-api-microservice/pull/28) | alta Standard, estado leído de Stripe, cambio de modo; `protectConnectFields`; `stripeAccount` en métodos disponibles; **fix IDOR** |
| vio-shopcart-microservice | [#44](https://github.com/vio-live/vio-shopcart-microservice/pull/44) | `stripeClient()` con `stripeAccount`; webhook exige `event.account`; `allow_redirects` sólo Connect |
| vio-payment-processors-microservice | [#9](https://github.com/vio-live/vio-payment-processors-microservice/pull/9) | reembolsos sobre la cuenta conectada; `jest.unit.json` |
| graphql | [#15](https://github.com/vio-live/graphql/pull/15) | `stripe_account` opcional en intent e init de wallets |
| webapp-vio-commerce | [#38](https://github.com/vio-live/webapp-vio-commerce/pull/38) | panel "Set up Stripe with Vio" en Settings → Payments |
| vio-web-sdk | [#68](https://github.com/vio-live/vio-web-sdk/pull/68) | Stripe.js con `stripeAccount` (la cuenta sale de la config del canal, no del gateway) |
| vev | [#47](https://github.com/vio-live/vev/pull/47) | rebundle; base `chore/rebundle-wallets` (#46 va primero) |
| VioKotlinSDK | [#3](https://github.com/vio-live/VioKotlinSDK/pull/3) | `PaymentConfiguration.init(ctx, pk, acct)` |
| react-native-sdk | [#4](https://github.com/vio-live/react-native-sdk/pull/4) | `initStripe({ stripeAccountId })` sólo en Connect |
| VioSwiftSDK | [#18](https://github.com/vio-live/VioSwiftSDK/pull/18) | `config.apiClient` con `stripeAccount` |

Para sellers sin Connect nada cambia (tests que lo fijan en cada repo; revisión independiente del
backend sin hallazgos de regresión).

**IDOR preexistente arreglado** (api-ms `520fb63` + base-api `30994fa`): `getById`/`deleteById`/`update`/`verify`
buscaban la fila de `payment_method` sólo por id y `update` re-asignaba el dueño — un seller con el id de
la fila de otro podía poner sus claves Stripe y cobrar las ventas del otro. Ahora `ownedRow(id, userId)`.

**Stripe de QA** (CLI 1.52, logueado en el sandbox):
- QA = sandbox **`acct_1TMTbsECwcLH8wcP`** ("New Co" es sólo el nombre interno). Angelo borró el otro entorno de test.
- Connect activo. Webhook de **cuentas conectadas** `we_1UKxwI…` creado → `https://api-ecom-staging.vio.live/api/shopcart/checkout/payment/webhook`, 4 eventos.
- Al webhook de plataforma `we_1To5Iz…` se le agregaron `payment_intent.canceled` y `checkout.session.expired`: sin ellos un pago Stripe abandonado nunca devolvía el stock en QA (preexistente).

**Variables en QA** — blob `containerqa2/env-file-microservices/.env.local` (respaldo `.env.local.backup-2026-09-29`):
`STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_ORIGINS="https://dashboard-staging.ecom.vio.live"`,
`STRIPE_PAYMENT_METHOD_DOMAINS="a-alan-local.vev.site,a-angelotest.vev.site"` (los dominios con Apple/Google Pay ya activos). Entran en el próximo build de shopcart y api-ms.

## Decisions

- Dos modos por seller: credenciales propias / Stripe Connect Standard con cobro directo. Sin comisión de plataforma. Sin reparto automático a suppliers (el seller del canal cobra todo y le paga al supplier por fuera).
- **El cobro con la cuenta de Vio se queda** (Stripe, Klarna, Qliro, Vipps, Adyen): no se retira, Connect es una opción más → [ADR-0023](../../decisions/0023-el-cobro-con-la-cuenta-de-vio-se-queda.md).
- Gestiones externas (Klarna partners, abogado) fuera de foco por ahora; producción sólo cuando Connect esté terminado y comprobado en QA.
- El IDOR va en la misma rama que Connect (Angelo).
- Las claves de test impresas por error en la sesión no se rotan ("en test no hay problemas"); prod se asegura al subir.
- Desvío del plan: no hay webhook de `account.updated`; el estado se relee de Stripe cuando el dashboard lo pide.

## Blockers

- **Vipps por Stripe:** acceso al private preview **pedido por Angelo el 2026-09-29** (formulario de docs.stripe.com/payments/vipps, `vipps_beta_preview`). Esperando respuesta por email. Cuando llegue: shopcart tiene que mandar `vipps_preview=v1` en el `Stripe-Version` de las llamadas que incluyan Vipps (hoy no lo hace), y cada seller Connect activa Vipps en su Dashboard. Sólo NOK / clientes en Noruega.

- El nombre real del `.env` que usan shopcart/api-ms en QA está en el secreto `ENV_FILE_QA` de GitHub; se asumió `.env.local` (Dockerfile). Se confirma en el primer build.
- Los `.env.test` de los micros y `shopcart/.env.local.qa` apuntan a cuentas Stripe que ya no existen. **Se dejan así a propósito:** los tests mockean Stripe, y copiar la secret key viva del sandbox a 9 archivos commiteados sería meter un secreto en git.

## Next session

1. Revisión y merge de los PR en orden: base-api → api-ms → shopcart + payment-processors → graphql → webapp → vev (#46 antes) → SDKs nativos.
2. ~~Branding de Connect en el Dashboard del sandbox~~ hecho por Angelo el 2026-09-29.
3. Primera alta de prueba desde `dashboard-staging` + E2E: tarjeta, Apple Pay, Klarna por Stripe, reembolso, evento repetido; y repetir los métodos actuales con un seller con credenciales propias.
4. ~~Pendientes técnicos menores~~ hechos (tarde del 2026-09-29), en las mismas ramas:
   - iOS `575e0ad`: `CacheHelper.clearAllCaches` `@MainActor` → **VioUI compila completo** con Xcode 26 (fallo que ya estaba en main).
   - iOS `289b139`: `cart.stripeReturnURL` → Klarna/Vipps por Stripe en el PaymentSheet si la app la configura.
   - Kotlin `d0620888`: Google Pay directo tokeniza con `"<pk>/<acct_…>"` (formato del `GooglePayConfig` de Stripe, verificado en su bytecode).
   - Dashboard `ba132b1`: avisos de Connect en el detalle del canal (doble Klarna; con qué cuenta cobra Stripe) — sólo avisa, no apaga nada (ADR-0023). `9c0543c`: test de Kustom que ya fallaba en develop. Suite 291/291.

**Antes de subir a producción:** activar Connect en la cuenta live con branding "Vio"; webhook live de cuentas
conectadas y revisar los 4 eventos del de plataforma; las tres variables en el `.env` de prod (`containerproduction2`)
cargadas por quien tenga acceso a secretos de prod, **sin imprimir ningún valor**; desplegar en orden; probar con una cuenta conectada real.

Lección del día: [comprobar secretos sin imprimirlos](../../lessons/comprobar-secretos-sin-imprimirlos.md).

## Merge a develop (QA) — ADR-0015, OK de Angelo en la sesión

- Mergeados en orden: base-api#19 `55e7f95` → api-ms#28 `1cbebbe` → shopcart#44 `c09a3bf` → payment-processors#9 `c914251` → graphql#15 `d1cb9c7` → webapp#38 `a4c00a0`.
- Pipelines de los 5 backends en verde; pods nuevos 2/2 Running en `kubernetesqa`; api, shopcart y payment-processors arrancaron sin errores en el log.
- Smoke: `GET /api/paymentmethod/stripe/connect/status` sin sesión → **401** (una ruta inexistente del mismo prefijo → 404: la ruta está desplegada).
- Dashboard: Vercel `staging` desplegó `a4c00a0` (success). El panel no se pudo ver sin login.
- **No verificado todavía:** el campo `stripe_account` en el gateway (la introspección pide API key), y que las builds hayan tomado las variables nuevas del `.env.local` (se ve en la primera alta).
- **Sin mergear (van a `main`, clic de Angelo):** web-sdk#68, vev#46 → vev#47, VioKotlinSDK#3, react-native-sdk#4, VioSwiftSDK#18.
- Aparte: 3 ejecuciones de `shopcart-reconcile` de ~5 h antes terminaron en Error; las recientes, Completed. No investigado.

## SDKs mergeados a main (OK explícito de Angelo: "ves desplegando los sdks, te doy permiso")

Excepción a ADR-0015 (merge a `main` normalmente es clic humano), autorizada por Angelo en la sesión.
- web-sdk#68 `beb3e71` · vev#46 `dc8dab8` · vev#47 `9629132` (re-apuntado a `main` tras #46) · VioKotlinSDK#3 `224f597` · react-native-sdk#4 `48b68d8` · VioSwiftSDK#18 `b6de9f9`.
- **Vev desplegado** (`vev deploy`, paquete `cq1lXld-TA9`) desde `main`; bundle de `main` = bundle probado en la rama (mismo sha256). Hubo que subir `@vev/cli` a 2.2.0 **con el npm de nvm** (`~/.nvm/versions/node/v24.16.0/bin/npm`): el `npm` del PATH es el de `/usr/local` y da EACCES. Las páginas ya publicadas en Vev probablemente necesiten re-publicarse desde el editor para tomar el componente nuevo.
- **Nativos: mergeados pero SIN versión nueva a propósito.** Se consumen por versión (SwiftPM `from: 0.1.0`, Maven `1.0.0-alpha`, npm `0.1.0-beta.1`); piden `stripe_account` al gateway y graphql sólo lo tiene en QA. No publicar versión de Kotlin/RN/iOS hasta que graphql#15 llegue a prod.
- web-sdk en npm sigue en 0.11.1 (el repo está en 0.16.x); Vev no lo necesita (bundlea desde el fuente). Publicar pide OTP de Angelo.

## Prueba para Alan

Tarjeta en Trello (To do, asignada a Alan): https://trello.com/c/l1fQDCcE — 6 bloques / 37 puntos: regresión de lo de hoy, alta en el dashboard, dónde cae el dinero con Connect, seguridad (IDOR y campos del servidor), SDKs nativos contra QA, y su opinión.

## Cuarto camino: vincular la cuenta de Stripe que el seller ya tiene (OAuth)

Pedido por Angelo. Rama `feature/stripe-connect-oauth` — PR [base-api#20](https://github.com/vio-live/vio-base-api/pull/20) · [api-ms#29](https://github.com/vio-live/vio-api-microservice/pull/29) · [webapp#39](https://github.com/vio-live/webapp-vio-commerce/pull/39) (abiertos, sin merge):
- **api-ms** `d05bd9a`, `b1fa3f4`, `280cabf`: `POST /paymentmethod/stripe/connect/oauth/{start,complete}` y `/disconnect`. `state` aleatorio guardado en la fila del seller (15 min, un solo uso, se consume **antes** de canjear el código); cuenta ya usada por otro seller → rechazada; otra cuenta ya conectada → hay que desconectarla primero (no se deja huérfana); acceso revocado desde el Stripe del seller → conserva el modo y el estado dice `access_revoked` (ADR-0023). `connectOrigin: 'created' | 'oauth'`. Env nueva `STRIPE_CONNECT_CLIENT_ID` (`ca_…`, no es secreto). Tests +13.
- **base-api** `d99e01b`: proxy de las tres rutas, userId de la sesión.
- **dashboard** `d157ba1`, `cdd63b9`: "I already have a Stripe account — connect it"; vuelta a `/settings/payments` con `?code&state`; "Disconnect Stripe account"; vinculada sin poder cobrar → "Finish in your Stripe Dashboard"; revocada → "Reconnect". Suite 297/297.
- Revisión independiente: sin bloqueos. Seguimientos anotados: las rutas de api-ms confían en el `userId` que manda base-api (igual que el resto del controlador: api-ms no debe estar expuesto); no hay alerta activa cuando un seller revoca el acceso (se ve al entrar al dashboard).

**Configuración en Stripe (Angelo):** Connect → Settings → OAuth: activar OAuth para cuentas Standard, registrar el redirect `https://dashboard-staging.ecom.vio.live/settings/payments`, y copiar el `client_id` (`ca_…`) a `STRIPE_CONNECT_CLIENT_ID` del `.env` de QA.

**Merge del OAuth a develop (QA):** base-api#20 `6dfd8ce`, api-ms#29 `65597e2`, webapp#39 `5e1e6a7`. Pipelines verdes, pods 2/2 Running. Smoke sin sesión: `oauth/start` y `oauth/complete` → 400 (validación del body, que corre antes del login), `disconnect` → 401, ruta inexistente → 404. Tarjeta de Alan con lista 8 (OAuth).

**Dashboard del OAuth en staging:** Vercel no recibió el push del merge `5e1e6a7` (sin despliegue ni estado). Como el árbol de `develop` era idéntico al de la rama (`93d324a`), se hizo `vercel redeploy` del preview de `cdd63b9` con `--target staging` — no `vercel deploy` desde local, que subiría archivos como `.env.local`. Quedó Ready y con el alias `dashboard-staging.ecom.vio.live`.

**OAuth listo para probar en QA:** `STRIPE_CONNECT_CLIENT_ID` (`ca_VLch…`, no es secreto) cargado en `containerqa2/.env.local` (respaldo `.env.local.backup-2026-09-29-oauth`); pipeline de api-ms relanzado → verde; pod nuevo 2/2 con la variable en `/usr/src/app/.env.local` (comprobado por conteo, sin imprimir valores). OAuth activado en el Stripe del sandbox con el redirect de `dashboard-staging`. Checklist 0 de la tarjeta de Alan completa.
