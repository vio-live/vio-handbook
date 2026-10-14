---
date: 2026-10-14
session: "api + base-api: los pagos de la brand se filtran por channel (backend de ADR-0031)"
participants: [angelo, claude, svc-api]
status: live
---

# api + base-api: pagos de la brand filtrables por channel (ADR-0031)

## Goal

Implementar en vio-api-microservice y en el proxy de vio-base-api el
[ADR-0031](../../decisions/0031-pagos-de-la-brand-filtrables-por-channel.md), aprobado por Angelo el
14/10. Lo ofrecido en un channel es lo efectivo de la brand ∩ lo visible en el channel. Los
interruptores por método de `channel_user_settings` vuelven a contar, ahora con el significado de
"visible en este channel". La UI va en paralelo en el webapp
([journal del webapp](2026-10-14-front-commerce-pagos-filtro-por-channel.md), `0b11a22`).

Base: `origin/develop` de api (`7effd96`, F2 con PR #45) y de base-api (`cbbe6dd`, PR #32).
Rama `feature/pagos-filtro-por-channel` en los dos. Worktrees en
`~/vio-commerce/worktrees/api-filtro` y `~/vio-commerce/worktrees/base-api-filtro`, sin upstream.

## Done

Commits locales, **sin push ni PR**: api **`3cb6fa9`** y base-api **`ddb70b9`**.

**api:**

- **`src/modules/channel/providers/channel-payment-visibility.ts`** (nuevo, puro):
  - `channelVisibilityOf`: sin fila de settings, los 11 métodos visibles.
  - `visibleOnChannel`: brand ∩ channel.
  - `channelVisibilityUpdate`: los campos de pago de `update/settings`. Es parcial y acepta los
    alias `google_pay`/`apple_pay`. 1/0 valen como booleanos; cualquier otro valor da 400.
  - `channelPaymentMethods`: la tarjeta del dueño.
  - `channelOwnership`.
- **`offered-payment-methods.ts`**: recibe `visible` y aplica la intersección antes de decidir.
- **`channel.service.ts`**:
  - `getAvailablePaymentMethods` (`:5729`) y `channelPaymentSwitches` (`:5621`) aplican la
    intersección. Lo segundo cubre `all-by-user-exposed` y `user/v2`. Si no recibe la fila del
    channel, la lee en vivo (`:5637`).
  - `createChannelUser` (`:341`) y la fila que crea `getChannelUserByUserId` (`:601`) nacen con los
    11 en true.
  - `postUptadeSettings` (`:5381`):
    - vuelve a guardar los 11 campos, en forma parcial;
    - solo lo puede hacer el dueño (`ownedChannelUser`, `:5433`): 403 `CHANNEL_NOT_OWNED` y 404
      `CHANNEL_NOT_FOUND`, antes era un 417 "Channel not found.";
    - un valor que no es booleano da 400 `INVALID_CHANNEL_SETTINGS`;
    - un channel sin fila de settings recibe una con todo visible, más lo que llegó.
  - `getChannelPaymentMethods` (`:5758`) es el endpoint nuevo.
- **Controller**:
  - `GET /channel/user/:userId/:channelUserId/payment-methods` (`:1509`).
  - `update/settings` devuelve el status y el `{code, message}` del error (`:1409`).
- Se quitó `paymentFieldsIn`/`CHANNEL_PAYMENT_FIELDS` de `account-payments.ts`, que solo servía
  para ignorar esos campos.
- No quedaba ningún rastro de `VIO_BACKEND_URL` ni de `campaign/payments/apikey` en ninguno de los
  dos repos. Lo verifiqué con grep sobre todo el árbol, charts incluidos.
- **Tests:**
  - `channel-payment-visibility.unit.spec.ts` (nuevo, 20 tests). Uno de ellos comprueba que la
    tarjeta y `offeredPaymentMethods` coinciden en 2 brands × 3 visibilidades × 2 markets.
  - Se reescribió `channel-settings.unit.spec.ts` y se extendió
    `available-payment-methods.unit.spec.ts`.
  - Resultado: 257 verdes y 1 rojo en 3 suites que ya fallaban en develop (`klarna-verify`,
    `vipps-verify`, `stripe-connect-oauth`).
  - Hice una mutación: sin la intersección fallan 4 tests.
  - `tsc -p tsconfig.build.json` limpio.

**base-api:**

- `GET /api/channel/:channelUserId/payment-methods`:
  - va con `authentication` (`channelRouter.js:783`) y reenvía con el usuario de la sesión
    (`channelController.ts:690`, `channelService.ts:643`);
  - la ruta es la que ya usa el webapp;
  - el `?userId=` se ignora;
  - un id no numérico da 400 antes de llamar a api.
- En `update/settings` el body ya viajaba tal cual con el `userId` de la sesión. Solo cambió el
  Swagger (`:638`), que vuelve a listar los 11 campos con el significado de visibilidad.
- Test `test/unit/channelPaymentVisibility.unit.ts`, con 7 tests. La suite unit queda en 113
  verdes.

### Contrato

`GET /api/channel/:channelUserId/payment-methods` → 200:

```json
{ "channelUserId": 50, "brandId": 9,
  "methods": [ { "method": "klarna", "offeredByBrand": true, "visible": false, "effective": false },
               { "method": "nexi", "offeredByBrand": false, "reason": "no-credential", "visible": true, "effective": false } ] }
```

- `methods` trae siempre los 11, en el orden de `PAYMENT_SWITCHES`: `stripePaymentIntent`,
  `stripePaymentLink`, `klarna`, `vipps`, `kustom`, `qliro`, `walley`, `nexi`, `adyen`,
  `googlePay`, `applePay`.
- `reason` aparece solo cuando el método no puede llegar al checkout por algo que el dueño no
  controla:
  - `no-switch`: la brand lo tiene apagado;
  - `no-credential`: está encendido, pero nadie lo puede cobrar;
  - `market`: la brand lo ofrece, pero el channel no vende en NO (Kustom y Adyen).
- `effective = offeredByBrand && market ok && visible`.

`POST /api/channel/update/settings/:id` es parcial, por ejemplo `{ "vipps": false }`.
`google_pay`/`apple_pay` también valen. Respuestas:

- 200: la fila de settings completa;
- 400 `INVALID_CHANNEL_SETTINGS`;
- 403 `CHANNEL_NOT_OWNED`;
- 404 `CHANNEL_NOT_FOUND`.

## Decisions

- **`effective` usa las mismas reglas que el checkout** y lo cubre un test. Stripe es un solo
  método en el checkout: si intent y link son efectivos a la vez, corre el flujo nativo.
- **`market` es un `reason` con `offeredByBrand: true`.** La brand lo ofrece, pero en ese channel no
  funciona, y el dueño lo arregla agregando NO a los markets.
- **Ruta interna en api `/channel/user/:userId/:channelUserId/payment-methods`**, en el estilo de
  `/user/:userId/:channelUserId`. En base-api va `/channel/:channelUserId/payment-methods`, la ruta
  que ya usaba el webapp.
- **`authentication` en vez de `verifyToken`.** Es el middleware de todas las rutas de channel en
  base-api, incluido `update/settings`, y valida el token igual.

## Blockers / open questions

- **Channels que ya existen:** van a ocultar lo que tienen en false. Un channel creado antes de
  esto nació con klarna, stripeIntent y stripeLink en true y el resto en false (el default de la
  columna). Un publisher que vende una brand con Vipps lo pierde hasta que lo prenda. Eso incluye
  los channels de QA creados con F2. Si se quiere que muestren todo, hace falta un data patch, y
  eso lo decide Angelo.
- **El webapp, para alinear con `0b11a22`:**
  - `reasonText` no conoce `market`, así que hoy diría "The brand hasn't enabled X";
  - la regla "deshabilitado si no lo ofrece la brand" tiene que ser "deshabilitado si hay
    `reason`".
- **El 417 de `update/settings` pasó a 403/404**, con body `{code, message}`. Además, un valor no
  booleano ahora da 400.
- **shopcart cachea `available-payment-methods` 60 s por channel**, así que un cambio de
  visibilidad tarda hasta 1 minuto en llegar al gate del checkout.
- **Queda pendiente, fuera de alcance:**
  - `payment-readiness.ts` (los checks del verify) sigue leyendo solo los interruptores de los
    channels propios del seller;
  - `exposedChannelSettings` no expone vipps, walley, nexi ni adyen, y eso ya pasaba antes.

## Next session

- Con el OK de Angelo: push y PR de los dos repos, junto con el del webapp. Salen juntos, porque
  el webapp sin el endpoint muestra error.
- Decidir el data patch de visibilidad para los channels existentes.
