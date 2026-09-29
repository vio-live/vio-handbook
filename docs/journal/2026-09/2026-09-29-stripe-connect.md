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

## Ramas subidas y PR abiertos (cierre del día)

- **IDOR arreglado en la misma rama** (decisión de Angelo): api-ms `520fb63` (`ownedRow(id, userId)` en getById/deleteById/update/verify, update ya no re-asigna dueño) + base-api `30994fa` (`?userId=` de la sesión en GET/DELETE). **Desplegar base-api antes que api-ms.**
- PR: [base-api#19](https://github.com/vio-live/vio-base-api/pull/19) · [api-ms#28](https://github.com/vio-live/vio-api-microservice/pull/28) · [shopcart#44](https://github.com/vio-live/vio-shopcart-microservice/pull/44) · [payment-processors#9](https://github.com/vio-live/vio-payment-processors-microservice/pull/9) · [graphql#15](https://github.com/vio-live/graphql/pull/15) · [webapp#38](https://github.com/vio-live/webapp-vio-commerce/pull/38) · [web-sdk#68](https://github.com/vio-live/vio-web-sdk/pull/68) · [vev#47](https://github.com/vio-live/vev/pull/47) (base `chore/rebundle-wallets`, mergear #46 antes) · [VioKotlinSDK#3](https://github.com/vio-live/VioKotlinSDK/pull/3) · [react-native-sdk#4](https://github.com/vio-live/react-native-sdk/pull/4) · [VioSwiftSDK#18](https://github.com/vio-live/VioSwiftSDK/pull/18)
- Orden: base-api → api-ms → shopcart + payment-processors → graphql → webapp → Vev → SDKs nativos.

## Variables de Connect cargadas en QA

- Blob `containerqa2/env-file-microservices/.env.local` (el `.env` compartido de los micros de QA; se hornea en el build). Respaldo previo: `.env.local.backup-2026-09-29`. Acceso con la account key (RBAC de datos no asignado a Angelo), igual que el 2026-09-07.
- Agregadas: `STRIPE_CONNECT_WEBHOOK_SECRET` (endpoint `we_1UKxwI…`), `STRIPE_CONNECT_RETURN_ORIGINS="https://dashboard-staging.ecom.vio.live"`, `STRIPE_PAYMENT_METHOD_DOMAINS="a-alan-local.vev.site,a-angelotest.vev.site"` (los dos dominios que ya tenían Apple/Google Pay activos en el sandbox).
- Confirmado: el `.env.local` de QA ya cobra con el sandbox `acct_1TMTbs…`.
- Entran en efecto en el próximo build de shopcart y api-ms (los PR todavía no están en develop; las variables sobrantes no afectan a nadie mientras tanto).
- ⚠️ Incidente: al revisar el archivo, un filtro mal escrito imprimió completas en la sesión del agente `STRIPE_API_SECRET`, `STRIPE_PUBLISH_KEY` y `STRIPE_WEBHOOK_SECRET` del sandbox de QA (test, no prod). Recomendado rotar la secret key y el secreto del webhook `we_1To5Iz…`, y actualizar el blob.

## Antes de subir Connect a producción (checklist)

Angelo decidió no rotar las claves de test impresas ("en test no hay problemas"). Para prod:

1. Activar Connect en la cuenta **live** de Vio (perfil de plataforma, Standard, Branding con nombre "Vio").
2. Crear el webhook **live** de cuentas conectadas (misma URL de relay de prod, 4 eventos) y revisar que el webhook live de plataforma tenga también `payment_intent.canceled` y `checkout.session.expired`.
3. Cargar `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_ORIGINS` (dashboard de prod) y `STRIPE_PAYMENT_METHOD_DOMAINS` (dominios de prod con Apple/Google Pay) en el `.env` de prod — `containerproduction2`, lo hace quien tenga acceso a secretos de prod; **ningún valor se imprime** en consolas ni chats.
4. Desplegar en el orden de los PR (base-api primero por el arreglo del IDOR).
5. Probar con una cuenta conectada real antes de ofrecerlo a sellers.
