# 2026-09-29 — Stripe Connect: decisión e implementación completa en ramas

- Quién: Claude (sesión de Angelo, cwd vio-backend)
- Decisión: [ADR-0022](../../decisions/0022-stripe-connect-como-opcion-de-cobro.md). Dos modos por seller (credenciales propias / Stripe Connect Standard con cobro directo), sin comisión, sin reparto a suppliers, **respaldo con la cuenta de Vio se mantiene por ahora**.

## Qué quedó hecho (commits locales, SIN push — ADR-0001)

Una rama `feature/stripe-connect` por repo, un PR por repo al abrirlos:

| Repo | Commits | Qué |
|---|---|---|
| vio-shopcart-microservice | `67e1ce2`, `a339c58` | `getStripeApiKeys` resuelve Connect; `stripeClient()` (un argumento sin Connect, `{stripeAccount}` con); `stripe_account` en intent e init de wallets; webhook exige `event.account` del seller y verifica con `STRIPE_CONNECT_WEBHOOK_SECRET`; `allow_redirects:'always'` sólo Connect (Klarna/Vipps por Stripe). 377/377 |
| vio-payment-processors-microservice | `ae02d72` | reembolsos sobre la cuenta conectada; `jest.unit.json` sin DB |
| vio-api-microservice | `c4e2c9d`, `5db51e7` | `stripe-connect.ts`; rutas onboard/status/mode; `protectConnectFields` en create/update; `stripeAccount` en la config Stripe de métodos disponibles |
| vio-base-api | `0921377` | proxy `/api/paymentmethod/stripe/connect/{onboard,status,mode}`, userId de la sesión |
| graphql | `efaeb72` | `stripe_account` opcional en PaymentIntentStripe e InitPaymentApple/GooglePay |
| vio-web-sdk | `fe4beb3` | Stripe.js con `stripeAccount`; la cuenta sale de la config del canal (no depende del gateway nuevo). 262/262 |
| vev (vio-vev) | `49cca81` | rebundle sobre `chore/rebundle-wallets`; `vev build` OK |
| webapp-vio-commerce | `3169bef`, `27be8e0` | panel "Set up Stripe with Vio" en Settings → Payments |
| VioKotlinSDK | `c976b606` | PaymentConfiguration con la cuenta; compila, 4/4 |
| react-native-sdk | `fb26154` | `initStripe` con `stripeAccountId` sólo en Connect. 200/200 |
| VioSwiftSDK | `d58d268` | `config.apiClient` con `stripeAccount`; VioCore compila; VioUI no compila entero por un fallo **preexistente** en `VioDesignSystem/CacheHelper.swift` con Xcode 26 |

Los clones de VioKotlinSDK y VioSwiftSDK viven ahora en `~/Documents/GitHub/` (antes `/tmp`). `ReachuKotlinSDK` es el repo viejo: no usar.

## Para desplegar

- **Orden:** backend (api-ms, shopcart, payment-processors, base-api) → graphql → dashboard → Vev → SDKs nativos. Kotlin/RN/iOS piden `stripe_account` en la mutación: publicarlos antes del gateway rompe el pago embebido de todos. El web SDK no tiene esa dependencia.
- **Env nuevas:** shopcart `STRIPE_CONNECT_WEBHOOK_SECRET`; api-ms `STRIPE_CONNECT_RETURN_ORIGINS` (orígenes del dashboard) y `STRIPE_PAYMENT_METHOD_DOMAINS` (dominios con wallets).
- **Stripe (Fase 0, Angelo):** activar Connect en la cuenta de Vio; crear un endpoint de webhook "de cuentas conectadas" a la misma URL de relay de base-api; pedir el preview de Vipps.
- Sin `STRIPE_CONNECT_WEBHOOK_SECRET` no se rompe nada: decide la relectura del objeto (como hoy), pero conviene alertar si falta.

## Hallazgos

- **IDOR preexistente (grave):** `api-ms paymentMethod.service.update()` busca la fila sólo por id y reasigna `user.id` al que llama; `getById`/`deleteById` tampoco filtran por dueño. Un seller que conozca el id de la fila de otro puede poner SUS claves Stripe en ella y cobrar las ventas del otro. No es de Connect, pero la promesa del ADR depende de cerrarlo. Pendiente de decisión de Angelo si va en esta rama o aparte.
- `payments-lib.test.js` (Kustom `optionsFrom`) ya falla en develop del dashboard.
- Kotlin/iOS: Google Pay directo (`VioGooglePayManager`, tokenización con `stripe:publishableKey`) no se adaptó a Connect; con Connect los wallets van por PaymentSheet. iOS no configura `returnURL` en el sheet, así que Klarna por Stripe no aparece en iOS hasta configurarlo.
- Un seller Connect con el toggle Klarna del canal encendido vería dos Klarna (el nativo, que cobraría con el respaldo de Vio, y el de Stripe). Recomendación: apagar el toggle Klarna del canal para sellers Connect.

## Stripe de QA configurado por CLI (tarde)

- QA usa el **sandbox `acct_1TMTbsECwcLH8wcP`** ("New Co", nombre interno del sandbox; lo que ve el seller sale de Connect → Branding). Angelo borró el otro entorno de test. Los `.env.test` de los micros y `shopcart/.env.local.qa` apuntan a cuentas viejas (`acct_1Iq07vGa01S…`, `acct_1I72iQCClYv…`): hay que actualizarlos.
- Connect ya activo en el sandbox (0 cuentas conectadas).
- Creado `we_1UKxwIECwcLH8wcPgzrYmlsf` (**cuentas conectadas**) → `https://api-ecom-staging.vio.live/api/shopcart/checkout/payment/webhook`, 4 eventos. Su secreto está en `~/.config/vio/stripe-connect-whsec-qa` de la máquina de Angelo → cargarlo como `STRIPE_CONNECT_WEBHOOK_SECRET` de shopcart en QA.
- Arreglo **preexistente**: el webhook de plataforma `we_1To5IzECwcLH8wcPIydkBTq0` sólo tenía `payment_intent.succeeded` y `checkout.session.completed`; se agregaron `payment_intent.canceled` y `checkout.session.expired`. Sin ellos un pago Stripe abandonado nunca devolvía el stock en QA.
- Stripe CLI 1.52 instalado (`/opt/homebrew/bin/stripe`), logueado en el sandbox.
