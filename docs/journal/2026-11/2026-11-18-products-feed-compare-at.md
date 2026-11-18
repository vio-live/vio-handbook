---
date: 2026-11-18
session: quick-fix — products, precio tachado del feed
participants: [angelo, claude]
status: live
---

# products: el feed de Google Merchant perdía el precio anterior de las ofertas

## Goal

Kondomeriet pone sus precios de Black Week en el feed (`sale_price`). Vio guardaba el precio rebajado
pero perdía el anterior, así que la tienda no podía tachar el precio ni poner la etiqueta de descuento.
El encargo: que el feed rellene `price.compareAt`, que lo limpie cuando la oferta termina, y
abrir PR a `develop` sin mergear ni desplegar.

## Done

- **Causa raíz** (products, `origin/develop` `78b5f9b`):
  - `upsertFromFeed` (`src/modules/product/providers/product.service.ts:5188`) no leía
    `compareAtPrice`.
  - `applyFeedUpdate` (`:6001`) copia `price` en su lista `scalars`, pero no hace nada con el precio
    anterior.
  - `feedFingerprint` (`:5949`) no tenía en cuenta los compareAt, así que un cambio solo en el precio
    regular no se habría notado.
- **Arreglo**, en la rama `fix/feed-compare-at`: commit `45f7987`,
  [PR #67](https://github.com/vio-live/vio-products-microservice/pull/67) a `develop`, abierto y sin mergear.
  - `helpers/feed-compare-at.ts` es nuevo. `feedCompareAt` aplica la regla y `applyFeedCompareAt` la
    escribe en el producto y en sus variantes.
  - `upsertFromFeed` saca `compareAtPrice` del payload y escribe `price.compareAt` antes de calcular
    la huella. Lo hace después del fallback de moneda y de la regla de precio desde variantes.
  - En variantes, un `compareAtPrice` por variante va a `originalPrice.compareAt`.
  - La huella incluye los compareAt del producto y de las variantes, y trata null y 0 como iguales.
- **Tests**: `feed-compare-at.spec.ts` es nuevo, sin BD, con 19 casos. Sin el cambio en el servicio
  fallan 8.
  - Suite sin BD en `develop`: 28 de 29 suites y 258 tests en verde.
  - En la rama: 29 de 30 suites y 277 tests en verde.
  - La suite que cae en las dos es `variant-price-paths.spec.ts`, por errores de TS en el propio spec
    (TS2698 y TS2556). Con los diagnostics de ts-jest apagados pasa 35 de 35.
  - Se corrió contra el kernel 1.0.258 que hay instalado, aunque `package.json` pide el 1.0.292.
    Por eso se ignoró el TS2339 de `Shipping.logoUrl` en `shipping.service.ts`, que solo existe en el
    kernel nuevo.

## Decisions

- **0 = sin precio tachado, nunca null.** Es lo que escriben las importaciones de Shopify
  (`compareAt: compareAtPrice?.amount ?? 0`) y de Woo, y lo que pone `save()`. Además se escribe
  siempre de forma explícita, porque TypeORM no escribe un `undefined` al actualizar y la oferta
  terminada se quedaría guardada.
- **Moneda:**
  - Un compareAt sin moneda se lee en la moneda del precio, que ya pasó por el fallback del vendedor.
  - Si el compareAt declara otra moneda que el precio, se guarda 0, porque la columna no tiene moneda
    propia.
  - Si el compareAt no es mayor que el precio, también se guarda 0, porque eso no es un descuento.
- **El feed es dueño del compareAt**, igual que del precio. Un compareAt puesto a mano en Vio sobre un
  producto de feed se pisa en la siguiente corrida.

## Blockers / open questions

- **La función todavía no lo manda.** En `google-merchant-feed` (`main` = `develop` = `9823562`),
  `itemToProduct` calcula `compareAtPrice` (`index.js:232`), pero `toStandalone` (`:264`) y
  `toGrouped` (`:311`) arman el objeto publicado campo a campo y lo descartan. Las variantes de
  `toGrouped` tampoco llevan precio anterior. Hasta que la función lo reenvíe, este PR escribe 0, que
  es lo que esas filas ya tienen, así que no reescribe nada.
  - Hace falta un cambio en la función: añadir `compareAtPrice` en `toStandalone` y `toGrouped`
    (el del lead) y, por variante, `compareAtPrice: variant.compareAtPrice`.
  - Ese cambio altera el `productHash`, así que todo el catálogo se republica una vez.
  - Ese repo no es de este agente; no lo toqué.

## Next session

- Arreglar la función para que reenvíe `compareAtPrice`.
- Merge de #67 en QA y una corrida del feed de Kondomeriet para comprobar que `price_compare_at` se
  rellena.
