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

- VioSwiftSDK: VioUI no compila en `main` con Xcode 26 (`VioDesignSystem/Helpers/CacheHelper.swift`, aislamiento de main actor); sólo se pudo compilar VioCore.
- El nombre real del `.env` que usan shopcart/api-ms en QA está en el secreto `ENV_FILE_QA` de GitHub; se asumió `.env.local` (Dockerfile). Se confirma en el primer build.
- Los `.env.test` de los micros y `shopcart/.env.local.qa` apuntan a cuentas Stripe que ya no existen (`acct_1Iq07vGa01S…`, `acct_1I72iQCClYv…`).

## Next session

1. Revisión y merge de los PR en orden: base-api → api-ms → shopcart + payment-processors → graphql → webapp → vev (#46 antes) → SDKs nativos.
2. ~~Branding de Connect en el Dashboard del sandbox~~ hecho por Angelo el 2026-09-29.
3. Primera alta de prueba desde `dashboard-staging` + E2E: tarjeta, Apple Pay, Klarna por Stripe, reembolso, evento repetido; y repetir los métodos actuales con un seller con credenciales propias.
4. Pendientes menores: `returnURL` en el PaymentSheet de iOS; Google Pay directo en Kotlin; apagar el toggle Klarna del canal para sellers Connect.

**Antes de subir a producción:** activar Connect en la cuenta live con branding "Vio"; webhook live de cuentas
conectadas y revisar los 4 eventos del de plataforma; las tres variables en el `.env` de prod (`containerproduction2`)
cargadas por quien tenga acceso a secretos de prod, **sin imprimir ningún valor**; desplegar en orden; probar con una cuenta conectada real.

Lección del día: [comprobar secretos sin imprimirlos](../../lessons/comprobar-secretos-sin-imprimirlos.md).
