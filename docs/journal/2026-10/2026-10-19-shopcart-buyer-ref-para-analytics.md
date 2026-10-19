---
date: 2026-10-19
session: afternoon
participants: [angelo, claude, svc-shopcart]
status: live
---

# Session — 2026-10-19 — shopcart: `buyer_ref`, el comprador para analytics sin su email

## Goal

Analytics quiere contar compradores únicos y recurrentes por campaña sin guardar nunca un
email (decisión de Angelo, 19/10: el colector guarda `order_id` y `payment_method` por compra;
los datos personales se quedan en `Order.customer` de Commerce). Darle al web SDK un
identificador estable y no personal en las respuestas que recibe cuando un checkout está pagado.

## Done

- Rama `feat/buyer-ref-para-analytics` desde `origin/develop` (`a271e97`, kernel 1.0.275),
  worktree `~/vio-commerce/worktrees/shopcart-buyer-ref`. **Commits locales `0b0e11a` + `12732aa` (revisión), sin push ni PR**
  (ADR-0001): 12 archivos, +337/−12.
- **`buyer_ref`** = HMAC-SHA256 hex del email normalizado (`trim().toLowerCase()`) con el secreto
  `BUYER_REF_SECRET`. Misma persona → misma referencia en todas sus órdenes, dispositivos y
  plataformas; nadie la invierte sin el secreto. Sin email o sin secreto → `''`; nunca lanza, nunca
  bloquea un pago. Nada nuevo se persiste; package-database intacto.
  - Helper puro `src/modules/checkout/providers/buyer-ref.ts` (`buyerRefFor(email, secret)`,
    `normalizeBuyerEmail`), en `providers/` como los demás helpers puros del módulo.
  - Único lector del secreto: `CheckoutService.buyerRefOf(email)` →
    `this._configService?.get(Configuration.BUYER_REF_SECRET)` (config key nueva en
    `src/config/utils/config.keys.ts`).
- **Dónde viaja** (verificado contra el SDK 0.24.0, `core/api/cart-queries.ts` y
  `ui/components/vio-checkout.ts`): el SDK no pega a shopcart directo, va por el gateway GraphQL.
  1. **Read model del checkout** — `GetCheckoutById(id, formated=true)` en
     `checkout.service.ts`, junto a `totals`. Lo devuelven `GET /checkout/:id`, `POST /checkout` y
     `POST /checkout/update/:id` (los tres pasan por `transformCheckout`, que hace spread). Es lo
     que el SDK lee tras volver de Stripe (link y embebido), Vipps, Kustom, Qliro, Walley, Nexi y
     Adyen (`GetCheckout` para el estado y `GetCheckoutOrderNumber` para el `#orden`).
  2. **Apple Pay / Google Pay confirm** — `apple-pay.service.ts`, `google-pay.service.ts`: las tres
     salidas (`SUCCESS`, `PENDING`/`FAILURE` con orden, `catch` → `''`); DTOs de respuesta con
     `buyer_ref` (Swagger). Email = el del checkout tras el `UpdateCheckout` del confirm.
  3. **Klarna native confirm** — `settleKlarnaNativeConfirm`: ya procesado, fraude `PENDING` y orden
     creada. Email = el que lleva la orden (`billing_address.email ?? shipping_address.email` de la
     orden Klarna, el mismo de `customer.email` en `finalizeKlarnaOrder`), fallback `checkout.email`.
- **Tests**: `buyer-ref.unit.spec.ts` nuevo (helper: determinismo, normalización, vacíos sin lanzar,
  distinto por secreto/email; read model formateado con y sin secreto y sin config; controller
  `GET /:id`). Un `it` por respuesta tocada en `wallet-charge-required` (Apple, Google, fallo → `''`)
  y `klarna-native-confirm` (3 salidas). Los 4 harnesses de wallets necesitaron `buyerRefOf` en el
  mock de `CheckoutService` y `toEqual` → `toMatchObject` (`seller-of-cart`,
  `stripe-order-reference` también).
- **Resultados**: `npx tsc --noEmit -p tsconfig.json` exit 0 (antes y después). `jest --config
  jest.unit.json`: antes 43 suites / 637 tests; después **44 suites / 652 tests, todo en verde**.
  Kernel instalado (node_modules prestado del worktree brand-publisher): `@vio-/database` 1.0.269,
  resto 1.0.267, mientras `package.json` de develop pide 1.0.275 — compila igual porque nada de este
  cambio toca tipos nuevos del kernel; `yarn install` no se corrió (token npm 401 en la laptop).

## Decisions

- Nombre del campo **`buyer_ref`** (snake_case, como sus vecinos `order_id` y `duplicate_of`):
  decidido por el coordinador la misma tarde tras una primera versión `buyer_ref`; gateway y SDK lo
  leen como `buyer_ref`. Los helpers internos siguen en camelCase (`buyerRefFor`, `buyerRefOf`).
- El ref se calcula en el **service** (`GetCheckoutById` formateado), no en el controller: una sola
  serialización cubre los tres endpoints y los self-calls, y no rompe los specs que mockean el
  service. El controller sigue sin tocar.
- Para Klarna native se usa el email de la orden Klarna (lo que Klarna verificó), no `cart.user.email`
  (ese es el publisher, no el comprador).

## Blockers / open questions

- **Falta en otros repos** (no es mi lane): el gateway `graphql` tiene que exponer `buyer_ref` en el
  tipo de `GetCheckout` (y en los resultados de `ConfirmPaymentApplePay` / `ConfirmPaymentGooglePay`
  / `ConfirmPaymentKlarnaNative`); el SDK tiene que seleccionarlo. El sitio más barato en el SDK:
  `GET_CHECKOUT_ORDER_NUMBER_QUERY` (hoy `{ id order_id }`), que `fillOrderNumber` ya llama en TODOS
  los caminos pagados, Vipps incluido (Vipps solo lee `GetVippsStatus { state duplicate_of }` para el
  estado). Y `CONFIRM_PAYMENT_APPLE_PAY_MUTATION` (hoy `{ order_id status }`) y la mutation
  `ConfirmPaymentKlarnaNative` de `checkout-manager.ts:244` (hoy `{ order_id checkout_id fraud_status order {…} }`).
  Google Pay confirm no lo usa el web SDK (solo móviles); el campo va igual en su respuesta.
- **Env**: `BUYER_REF_SECRET` en el `.env.local` de QA (va horneado en la imagen desde el blob) y en
  el Secret `env-sc-shopcart` de prod (Miguel). Generar con `openssl rand -hex 32`; el valor nunca se
  imprime. Sin la variable el campo sale `''` y nada falla, así que el deploy no depende del secreto,
  pero sin él analytics no cuenta compradores.
- Gotcha de worktree: un `node_modules` **symlink** no lo ignora el `.gitignore` (patrón `node_modules/`
  con barra no matchea symlinks) → aparece como `??`; nunca `git add -A` en estos worktrees.

## Revisión independiente (misma tarde) — commit `12732aa`, sin push

Sin blockers; seis puntos aplicados en la rama (`feat/buyer-ref-para-analytics` queda `ahead 2`
de `origin/develop`: `0b0e11a` + `12732aa`):

- **W1 — solo pagados.** El read model formateado emite `buyer_ref` solo con `status === SUCCESS`
  (tras `stripeReconcileOnRead`); si no, `''`. Antes, `POST /checkout/update/:id` con cualquier email
  devolvía su HMAC desde un checkout ACTIVE: un oráculo del secreto. Test: ACTIVE/INACTIVE con email → `''`.
- **W2 — una identidad por orden.** `CheckoutService.rememberBuyerEmail(row, checkout, providerEmail)`:
  al completar la orden guarda en `checkout.email` el email que verificó el proveedor **si el checkout no
  tenía ninguno** (nunca pisa; nunca el del publisher). Llamado en el punto único de cada método, justo antes
  del `save` con `SUCCESS`: Klarna native (`finalizeKlarnaOrder`, `checkoutToUpdate`), Klarna KCO
  (`settleKlarnaOrder`), Kustom (sustituye el `if (!chk.email…)` que ya había), Qliro, Walley, Nexi y Adyen.
  **Vipps no necesitó cambio**: `createVippsOrder` ya hace `UpdateCheckout(…, email)` con lo que Vipps
  devuelve (userDetails o Userinfo) y `completeBaseOrder` lee `checkout.email` — ojo, ese camino sí pisa
  un email previo (comportamiento anterior, no tocado). Tests por método: Klarna native (3 casos), KCO,
  Kustom, Adyen, Vipps. Qliro/Walley/Nexi no tienen spec que ejecute el ok-handler: sin test.
- **W3 — Klarna native.** La confirmación fresca, la repetida (`alreadyProcessed`) y el GET devuelven la
  misma referencia: el email con el que queda el checkout (el suyo, si no el de Klarna, que W2 persiste).
  Tests: emails distintos entre checkout y Klarna (gana el del checkout en las tres respuestas), Klarna con
  `''`, sin email en ninguno (`''`), billing = publisher (ignorado).
- **W4 — nunca el publisher.** `buyerEmailOf(candidates, publisherEmail)` (puro, `||`-semántica, exige `@`,
  compara normalizado) alimenta el ref en el read model, wallets y Klarna, y `customer.email` de las órdenes
  Klarna (native y KCO). Los dos fallbacks `?? cart.user?.email` del email que se manda a Klarna
  (`checkout.service.ts` ~2273 KCO y ~2418 native → `buildCheckoutKlarnaDto`) desaparecen.
- **W5 — secreto.** `logger.warn` una vez por proceso si `BUYER_REF_SECRET` falta o tiene < 32 caracteres
  (`buyerRefSecretWarner`, nunca el valor). Docblock: el secreto se `trim`ea; rotarlo rompe el histórico.
- **W6 — tests.** `toEqual({ order_id, status, buyer_ref })` otra vez en los 3 harnesses de wallets; PENDING
  y FAILURE-sin-catch de Apple/Google con `buyer_ref`; fallback al email del wallet cuando el checkout no
  tiene; publisher → `''`; vector fijo `HMAC-SHA256('test-secret','kari@example.no') =
  683000d648e76f83cc9348e5f2961c9b8778d7604da7ac285cd87b81e12cab65` (verificado con node antes de fijarlo).
- Nits: `.normalize('NFC')` antes de minúsculas, guard `typeof === 'string'` en email y secreto, ejemplo de
  Swagger obviamente falso, `docs/klarna-native-flow.md` con `buyer_ref`, comentarios en inglés en los
  archivos en inglés (incluido `buyer-ref.ts`).
- **Números:** `npx tsc --noEmit -p tsconfig.json` exit 0; `jest --config jest.unit.json` **44 suites /
  668 tests en verde** (antes de la revisión 652; línea base de develop 637). Rama vs develop: 17 archivos,
  +650/−17.
- Edge asumido y documentado: si el comprador escribió un email en nuestro formulario y pagó con otro en
  Klarna/Kustom/…, `Order.customer.email` lleva el del proveedor y `checkout.email` (y el ref) el escrito.
  Es la consecuencia de "no pisar"; cambiarlo es decisión de producto.

## Next session

- OK de Angelo → push + PR de `feat/buyer-ref-para-analytics` contra `develop`.
- gateway + SDK: exponer y seleccionar `buyer_ref`; colector de analytics: aceptarlo en `purchase`.
