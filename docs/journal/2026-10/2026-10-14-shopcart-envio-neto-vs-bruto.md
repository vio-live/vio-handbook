---
date: 2026-10-14
session: "shopcart: por qué el envío se mostró a 26.48 y se cobró a 33.10 (carrito 5c029ec6, orden 4548)"
participants: [angelo, claude, svc-shopcart]
status: live
---

# shopcart: envío neto vs bruto, `total_tax` inflado y la moneda de la clase de envío

## Goal

Bug de QA del 14/10. El carrito `5c029ec6-…` (NOK, NO, 1 × producto 411957 a 249 NOK, brand 1289,
clase "Express" a 3.00 **EUR**) mostró el envío a 26.48 NOK en `GetLineItemsBySupplier`. El
checkout, Vipps y la orden 4548 cobraron 33.10. El `total_tax` quedó en 62.25. Fue una investigación
de solo lectura sobre `origin/develop` (shopcart `0355bd0`, graphql `85599c1`, products `b2bf488`,
webapp `88ad8ad`). No se tocó código.

## Done (hallazgos)

- **Es la misma cifra, con y sin IVA.** Las dos salen de `convertPrice(3, EUR, NOK)` =
  `round(3 × 11.0338, 2)` = 33.10. Es la misma función y la misma fila de `exchange_rate`, sin
  cache (package-service `src/currency/exchangeRate/index.ts:40-46,61-71`).
  - `cart.service.ts:137-195` convierte el envío.
  - `formatLineItemsPrices` (`checkout.service.ts:865-877`) le saca el IVA al 25 % del producto:
    `amount` = 26.48 neto y `amount_incl_taxes` = 33.10.
  - `transformProductAvailableShippingsBySupplierToSnakeCase` (`cart/dtos/transform/index.ts:274-278`)
    pone el neto en `price.amount` y el bruto en `price.amount_incl_taxes`.
  - La convención es la de todo el API: en las líneas, `price.amount` también es el neto
    (`transform/index.ts:133`).
- **Lo cobrado es correcto (bruto).**
  - `calculatePriceAndTaxes` (`checkout.service.ts:536-552`) da `total_price` = 249 + 33.10 = 282.10.
  - Vipps cobra `vippsMinor(totals.total)` (`vipps.service.ts:229-231`).
  - La orden toma `totals.shipping` (`checkout.service.ts:5030-5036` → `completeBaseOrder:2541`).
  - El precio del producto se guarda con IVA (`cart.service.ts:1149-1177`). Qliro declara el envío
    como `PriceIncVat` y Vipps Express usa `amount_incl_taxes` (`vipps-payload.ts:107-108`).
- **`total_tax` 62.25 está mal.**
  - `applyPrices` (`checkout.service.ts:562-578`) hace `249 × 25 %` sobre un precio que ya incluye
    el IVA, y no suma el IVA del envío.
  - Lo correcto es `282.10 − 282.10/1.25` = 56.42. Ese es el valor que el API ya devuelve como
    `totals.taxes` (`checkout.service.ts:765-775`).
  - La columna la escriben cuatro sitios (`checkout.service.ts:386`, `cart.service.ts:466,2066,2228`).
    En el código no la lee nadie: Klarna y Kustom la pisan con el valor del PSP.
- **Moneda de la clase.**
  - products `POST /shipping/create` exige `currencyCode` (400 si falta, `shipping.service.ts:65-66`).
    No tiene default, y base-api solo reenvía.
  - El webapp manda `me.settings.currency.code || 'EUR'` (`settings/sections/shipping.jsx:89`)
    desde `6289710` (25/08). Entre el 21/08 y el 25/08 (`74daad6`) mandaba `'EUR'` fijo.

## Decisions

- Ninguna; queda como propuesta para Angelo. Hay tres arreglos mínimos:
  1. El consumidor que mostró 26.48 debe mostrar `amount_incl_taxes`. El bundle del SDK en vio-vev
     ya lo usa. Además hay que corregir la descripción de `amount` en graphql (`Cart.ts:152`).
  2. `calculatePriceAndTaxes` debe sacar el IVA del bruto con `getTaxByFullAmount` y sumar el IVA
     del envío.
  3. products debe usar por defecto la moneda de `user_settings` del dueño, y el webapp no debe
     caer a `'EUR'` en silencio.

## Blockers / open questions

- Falta saber qué UI mostró 26.48: el bundle de vio-vev prefiere `amount_incl_taxes`.
- Faltan datos: el `created_at` de la clase `1d5481e4` y de su `shipping_country`, y el
  `user_settings.currency` de la cuenta 1289. Con eso se sabe si la clase en EUR viene de la
  ventana del 21-25/08, de una cuenta sin moneda o de otro cliente.

## Next session

- Con OK de Angelo, el arreglo de `total_tax` en una rama `agent/shopcart/<slug>`, con su test.
