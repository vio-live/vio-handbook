---
date: 2026-10-13
session: "shopcart: la brand vende — cart.seller, un carrito por brand, método validado (F2.4, segunda parte)"
participants: [angelo, claude, svc-shopcart]
status: live
---

# shopcart: la brand vende

## Goal

Segunda parte de F2.4 del [plan de ejecución](../../handoff/campanas-en-commerce-plan-de-ejecucion.md),
según [ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md) punto 1. La primera
(`sellerOfCart`) está en el journal [shopcart-seller-of-cart](2026-10-13-shopcart-seller-of-cart.md).
Esta parte llena `cart.seller` con la brand, valida el método en el servidor y manda el channel a
orders.

## Done

Tres commits locales en `feature/brand-publisher` de vio-shopcart-microservice, encima de `48788bf`
(PR #87), en el worktree `~/vio-commerce/worktrees/shopcart-brand-publisher`. **Sin push** (ADR-0001):
Angelo actualiza el PR.

- `9a239bc` **Kernel.**
  - `@vio-/database` y `@vio-/service` pasan a 1.0.269; `definitions` y `testing`, a 1.0.268.
    `config`, `logger` y `utils` quedan en 1.0.267. Es el mismo set que usa users.
  - `yarn.lock` y `package-lock.json` **no se tocaron**: el token npm da 401.
  - Las pruebas corrieron con el `node_modules` del worktree. Se reemplazó `@vio-/database` por
    `dist`, `src` y `package.json` del tag `v1.0.269` del kernel (`git archive`). `@vio-/service`
    quedó en 1.0.267 en disco.
- `02306d1` **La brand vende.**
  - **`sellerOfCart(cart, db)`** pasa a ser async:
    - devuelve `cart.seller` y, si no hay, `cart.user`;
    - `Cart.seller` no es eager. Si la relación no vino cargada, lee `seller_id` de la fila y no
      adivina.
  - **`CheckoutService.prepareSale(cartId, method)`** corre en `AddCheckout` y en todos los inits:
    Stripe link e intent, Klarna KCO y native, Kustom, Qliro, Walley, Nexi, Adyen, Vipps, y Apple
    Pay y Google Pay (init y confirm). Hace esto:
    - 400 `CART_NOT_SINGLE_BRAND` si el carrito tiene productos de más de una brand;
    - escribe `cart.seller` **una sola vez** (gana el primero). Usa la regla de `brandOfChannel`
      de api sobre el channel del carrito, por las mismas rutas que el backfill del kernel;
    - **no** lo escribe si el carrito ya inició un pago sin seller;
    - una brand distinta del dueño solo vende sus propios productos;
    - si se pide un método, tiene que estar en `GET /channel/available-payment-methods`. Si no
      está, devuelve 400 `PAYMENT_METHOD_NOT_AVAILABLE`.
  - `cart.user` no se reescribe.
- `f2ee40c` **Orders.** Los 12 `orders/save` mandan `data.channelUserId`. El reseller sigue siendo
  `cart.user`.
- **Tests:**
  - 40 suites y 594 tests (antes 39 y 557). La suite nueva es `brand-of-cart.unit.spec.ts`, con 26
    tests.
  - Hay casos nuevos en `seller-of-cart`, `vipps-payment` y `adyen-init-payment`.
  - `tsc` limpio con `tsconfig.json` y con `tsconfig.build.json`.

## Decisions

Las tomó el agente; Angelo puede objetarlas.

- **El seller sale del channel y no de los productos del carrito.** Así es siempre la cuenta cuyos
  métodos devolvió api para ese channel. Si saliera de los productos, en un channel del dueño con
  productos de un supplier cobraría el supplier, y api le habría ofrecido los métodos del dueño.
- **El seller no cambia una vez escrito**, porque capture y refund dependen de él.
- **Si api no responde,** se usa una respuesta de hasta 10 minutos. Si no hay ninguna, se rechaza
  con `PAYMENT_METHODS_UNVERIFIED`, porque asumir el método podría cobrar con la cuenta de Vio sin
  que nadie lo eligiera.
- **Nombres de método:** se comparan solo las letras (`Apple Pay` = `applepay`), como los SDKs. El
  link de Stripe acepta también `Stripe`.
- **Carritos sin channel:** no se les escribe seller y no se valida el método; queda un warn.

## Blockers / open questions

- **`CART_NOT_SINGLE_BRAND` es estricto.** Rechaza también los carritos multi-supplier de los
  channels legacy del dueño, que hoy cobran bien. Vipps Express prevé "several suppliers".
  - Si hay que relajarlo, basta con exigir una sola brand solo cuando vende una brand distinta
    del dueño.
  - **Lo decide Angelo.**
- **Los nombres que devuelve api no se verificaron en su código** (la regla del workspace no lo
  permite).
  - Se aceptan `stripe`, `stripepaymentintent`, `stripepaymentlink`, `applepay`, `googlepay`,
    `klarna`, `kustom`, `vipps`, `qliro`, `walley`, `nexi` y `adyen`.
  - Lo tiene que confirmar el agente de api.
- **El SQL de `brandOfChannel` está duplicado en shopcart.** Lo mejor sería que api devuelva la
  brand en `available-payment-methods`.
- **Orden de deploy:**
  1. la migración de `cart.seller_id` (sin ella fallan los INSERT de cart);
  2. api F2.3 (si no, se valida contra los toggles viejos del channel mientras cobra la brand, y
     Stripe podría caer a la cuenta de Vio);
  3. shopcart.
- **payment-processors** tiene que resolver capture y refund con `cart.seller ?? cart.user`.
- **orders** tiene que leer `data.channelUserId` en `/save`. Hay que confirmar si eso engancha
  `order.channelUser` y dispara la sincronización con el sales-channel.
- **`EMAIL_DELIVERY`:** service ≥1.0.268 no manda mails si la variable no vale `on`. Hay que
  revisar el `.env` de shopcart en QA y en prod antes del deploy.
- **`sellerName`** (Kustom y Adyen) sigue saliendo de `cart.user`.

## Next session

- OK de Angelo sobre `CART_NOT_SINGLE_BRAND`, y actualizar el PR #87.
- Regenerar `yarn.lock` y `package-lock.json` con un token válido.
- Agentes de api, orders y payment-processors: los puntos de arriba.
- Probarlo en QA después de la migración y de api F2.3.
