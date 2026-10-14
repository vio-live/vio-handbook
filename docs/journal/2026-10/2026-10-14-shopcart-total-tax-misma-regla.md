---
date: 2026-10-14
session: "shopcart: checkout.total_tax con la misma regla que totals.taxes"
participants: [angelo, claude, svc-shopcart]
status: live
---

# shopcart: `total_tax` sale de la misma regla que `totals.taxes`

## Goal

Arreglar el `total_tax` inflado que salió en la investigación de la mañana
([2026-10-14-shopcart-envio-neto-vs-bruto](2026-10-14-shopcart-envio-neto-vs-bruto.md)). Angelo lo aprobó el 14/10.
El caso de QA es el checkout `16cbc04d…` (orden 4548): 249 NOK con IVA más 33.10 NOK de envío. Quedó
`total_price` 282.10, que está bien, y `total_tax` 62.25, cuando lo correcto es 56.42. El objetivo es que la
columna y `totals.taxes` salgan de una sola función pura.

## Done

- **Commit `2cfd2d8`** en `vio-shopcart-microservice`, rama `fix/envio-moneda-e-iva` sobre `origin/develop`
  `0355bd0`. Worktree en `~/vio-commerce/worktrees/shopcart-envio`. **Sin push ni PR** (ADR-0001).
- Módulo puro nuevo `src/modules/checkout/providers/checkout-tax.ts`:
  - `taxedLineOf(item)` devuelve `{ gross, rate }` de una línea, tanto cruda como formateada (si está
    formateada, el bruto está en `priceDataExtra.amount_incl_taxes`). Sin tasa cuenta como exenta.
  - `checkoutTax(lines, total)`: cada línea paga su propia tasa. Lo que las líneas no explican (el envío)
    paga la tasa de la línea con más dinero, la misma regla que `dominantTaxRate` de Kustom.
  - Redondea con `toFixed(2)`. Con una sola tasa da exactamente `getTaxByFullAmount(total, tasa)`.
- `checkout.service.ts`:
  - `calculatePriceAndTaxes` (~562-567): `applyPrices` se sustituye por `checkoutTax`. Esa función alimenta los
    cuatro sitios que escriben la columna: `checkout.service.ts:386` (`AddCheckout`) y
    `cart.service.ts:466` (`consistencyTaxesCheckout`), `2066` (`checkoutConsistency`) y `2228`
    (`updateShippingsToCart`).
  - `GetCheckoutById` (~751-756): `totals.taxes` sale de `checkoutTax(lines, total_price)`.
- Tests en `src/modules/checkout/tests/checkout-tax.unit.spec.ts`, 14 en total:
  - el caso de QA (56.42 / 282.10, y ya no 62.25);
  - un producto exento y una línea con `tax` NULL (0 en los dos casos);
  - tasas distintas (25 % + 15 %, y un exento que arrastra el envío a 0 %);
  - el mismo resultado con la línea cruda o formateada;
  - `totals.taxes` igual a la columna guardada en 4 checkouts, uno de ellos con dos suppliers y dos envíos.
- Contra el código viejo fallan 5 de los 14, y el caso de QA da exactamente `62.25`.
- Suite unitaria completa: **39 suites, 553 tests en verde**. La base tenía 38 suites y 539 tests.
  `tsc --noEmit -p tsconfig.build.json` sale limpio. `node_modules` es un symlink al de `shopcart-brand-publisher`
  (kernel 1.0.269; develop pide 1.0.270), porque el token npm local da 401.
- Grep de solo lectura sobre las refs remotas, sin fetch: **nadie fuera de shopcart lee `checkout.total_tax`**.
  - Se revisaron base-api, orders, analytics, payment-processors, graphql, api, users, products,
    collection, webapp, web-sdk y vev. Solo aparecen fixtures de Klarna/Shopify/Woo y `total_tax_amount` de Klarna.
  - `/checkout/by-orders-ids` (orders) devuelve el checkout formateado, pero orders solo lee
    `totals.discounts` y `cart.currency`.

## Decisions

- **El envío paga la tasa de la línea con más dinero**, igual que Kustom (`kustom-lines.ts:228-238`).
  En develop, `totals.taxes` aplicaba la tasa de la *última* línea con `tax` ≠ 0 a todo el total.
  - Con una sola tasa (el caso real: `priceData.tax` = "Standard" del market) el resultado es idéntico.
  - Con tasas mezcladas o una línea exenta, `totals.taxes` cambia. Es intencional: antes era incorrecto.
- **El impuesto es una parte del mismo bruto que `total_price`.** Ya no se convierte por su lado. La
  conversión vieja era un no-op en la práctica, porque `convertPrice` devuelve el precio tal cual si `from === to`
  y `priceData.currency` = `cart.currency` al crear el ítem.
- `total_price`, `totals.tax_rate` y la convención neto/bruto (`amount` / `amount_incl_taxes`) no se tocan.

## Blockers / open questions

- **OK de Angelo** para push y PR a develop.
- **Bug aparte, anotado y sin tocar:** `calculatePriceAndTaxes` no convierte `totalPrice` de
  `priceData.currency` a `cart.currency`. Hoy no se nota porque al crear el ítem las dos monedas coinciden.
- **Quinto escritor** de la columna que no pasa por `checkoutTax`: `settleKlarnaOrder` (KCO, ~L6780) usa
  `getTaxByFullAmount(total_price, items[0].taxRate)`. Coincide con una sola tasa. Además, Klarna native y Kustom
  pisan la columna con el valor del PSP.
- Los checkouts que ya existen conservan su `total_tax` viejo hasta el siguiente recálculo (mutación del
  carrito o `PATCH /cart/:id/consistency`). No hay backfill: la columna no la lee nadie.
- `update` (`cart.service.ts:349-431`) recalcula con `tmpCart` en memoria, antes de que se actualice
  `priceData.tax`. Es preexistente y no cambia con este arreglo.

## Next session

- Con OK: `git push -u origin fix/envio-moneda-e-iva` y PR a `develop`. Ojo: la rama tiene como upstream
  `origin/develop`, así que hay que usar `-u` con el nombre explícito.
- Opcional: llevar `settleKlarnaOrder` a `checkoutTax` y corregir la conversión de `totalPrice`, cada uno en su rama.
