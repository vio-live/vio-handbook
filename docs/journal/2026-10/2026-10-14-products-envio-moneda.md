---
date: 2026-10-14
session: "products: una clase de envío tiene una sola moneda (crear sin moneda → la de la cuenta; editar arrastra la clase)"
participants: [angelo, claude, svc-products]
status: live
---

# products: la moneda de la clase de envío

## Goal

Es la continuación de [`2026-10-14-shopcart-envio-neto-vs-bruto`](2026-10-14-shopcart-envio-neto-vs-bruto.md),
punto 3, aprobado por Angelo el 14/10. La clase "Express" de la brand 1289 quedó en EUR (3.00)
aunque la cuenta está en NOK. En QA hay 20 de 290 clases vivas, de 18 cuentas, en otra moneda que
la de su dueño. Una de ellas dice EUR sobre países en NOK.

## Done

- Rama `fix/envio-moneda-e-iva` en vio-products-microservice, sacada de `origin/develop` (`b2bf488`).
  Commit local **`df95ed6`**, sin push. Worktree en `~/vio-commerce/worktrees/products-envio`.
- `src/modules/shipping/providers/shipping-currency.ts` (nuevo, puro): `resolveCreateCurrency`,
  `resolveUpdateCurrency`, `requestCurrencies`, `normalizeCurrency`.
- `shipping.service.ts`:
  - `create` (`:67-102`): moneda del request (clase o países) → la de la cuenta
    (`user.settings.currency.code`, sólo si llega `userId`) → 400 `Field currencyCode is required.`
    Los países de la clase nueva se guardan en esa moneda.
  - `update` (`:104-134`): lee los países guardados **antes** de escribir y valida. La clase toma la
    moneda en la que quedan sus países, en el mismo `save`.
    - Una petición con dos o más monedas → 400.
    - Cambiar sólo `currencyCode` cuando hay países guardados en otra moneda → 400.
    - Sin moneda en la petición → la clase conserva la suya.
- `src/modules/shipping/tests/shipping-currency.spec.ts`: 16 tests. Usa repositorios en memoria y
  `jest.mock('@vio-/service')`, sin BD. **16/16 pasan.** Contra el `shipping.service.ts` viejo fallan
  5: crear sin moneda, el caso del 14/10, países mezclados, mezcla en create y `currencyCode`
  suelto con países en otra moneda.
- `npx tsc --noEmit` da 0 errores. Ojo: el `node_modules` es el del clon principal y tiene el kernel
  1.0.258, no el 1.0.270 del `package.json`.
- Brief `products.md` actualizado (workspace `5a9f975`).

## Decisions

- **Las monedas mezcladas se rechazan, no se adivinan.** El `currency_code` por fila de
  `shipping_country` no es una función multi-moneda:
  - la clase tiene un solo `currencyCode`;
  - la clase por defecto (`addShippingOrReturnPrevious`) usa una sola moneda;
  - nada en products elige una fila de país por moneda (el `update` sólo la usa para detectar si
    la fila cambió).
- **En el `update` la moneda la mandan los países, porque es lo que se cobra.** Si `currencyCode`
  contradice a los países, se responde 400 en vez de elegir uno.
- **Sólo se usa la cuenta si llega `userId`.** `findOne(undefined)` en TypeORM 0.2.41 devuelve el
  primer usuario de la tabla.
- El mensaje de "falta la moneda" se mantiene igual por compatibilidad.

## Blockers / open questions

- **El 400 sale como 417.** El controller hace `catch` de todo y responde `EXPECTATION_FAILED`
  con el mensaje en texto plano. Así era antes y no se tocó.
- **El webapp no aprovecha el fallback.** Manda `me.settings.currency.code || 'EUR'`
  (`settings/sections/shipping.jsx:89`, según el journal de shopcart). Para una cuenta sin moneda
  sigue mandando EUR explícito. Habría que quitar el `|| 'EUR'` en el lane del webapp.
- **Riesgo nuevo de 400 en el `update`.** Si algún cliente edita mandando `currencyCode` de la
  clase vieja (EUR) y países en la moneda nueva (NOK), ahora recibe 400 (417 en la red). Antes
  quedaba la clase incoherente. Falta comprobar qué manda el webapp al editar. No lo leí: no es mi
  lane.
- **Siguen abiertos `POST /add-country` y `PUT /edit/country`.** Pueden meter un país en otra
  moneda; quedan fuera del alcance.
- **Los datos existentes no se corrigen solos.** Las 20 clases de QA (y las de prod) siguen como
  están hasta que se editen o se haga un data patch. La fila "EUR sobre NOK" se arregla con un
  `PUT` que mande sólo `currencyCode: 'NOK'`.
- Los tests con BD del repo (`shipping.service.spec.ts`) no corren en la laptop: Jest 27 no
  resuelve `exports` de `@typespec/ts-http-runtime` y el setup exige conexión.

## Next session

- OK de Angelo para push y PR de `fix/envio-moneda-e-iva`.
- Lane webapp: quitar el `|| 'EUR'` y comprobar el payload del editar clase.
- Decidir el data patch de las 20 clases de QA (y contarlas en prod).
