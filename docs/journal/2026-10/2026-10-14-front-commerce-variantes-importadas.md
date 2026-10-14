---
date: 2026-10-14
session: "webapp: en un producto importado, una variante sin precio no hereda el del producto"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: variantes sin precio en productos importados

## Goal

Alinear el gate de Publish con variantes del webapp (#54, ya mergeado) a la regla nueva de
products-ms #23, que está en QA desde el 14/10. Ver
[`2026-10-14-products-precio-desde-variantes`](2026-10-14-products-precio-desde-variantes.md) y
[`2026-10-14-front-commerce-publicar-con-variantes`](2026-10-14-front-commerce-publicar-con-variantes.md).

La regla del micro tiene dos partes:

- **Derivación**, en todos los orígenes: un producto sin precio propio (<= 0) toma el mínimo de
  sus variantes activas con precio > 0.
- **Herencia**, solo en nativos: una variante sin precio toma el precio propio del producto.
  - Nativo es `origin` NATIVE o vacío, y sin `originId`.
  - El feed de Google Merchant guarda NATIVE con `originId`, así que cuenta como importado.
  - En un importado, una variante en 0 queda en 0.

El problema: #54 suponía herencia en todos los orígenes. Con un Woo con precio de producto y
una variante en 0, el webapp habilitaba Publish y mostraba el precio heredado. El backend, en
cambio, deja esa variante en 0.

## Done

Rama `fix/variantes-importadas` desde `origin/develop` `2cc0253`. Worktree en
`~/vio-commerce/worktrees/webapp-variantes-importadas`, con `node_modules` symlinkeado. Un commit
local, **`a8d86c6`**, sin push ni PR.

- **`inheritsVariantPrices(product)`** en `src/lib/products.js`, con el criterio del micro. Sin
  producto (un alta) es nativo.
- **Importado**:
  - una variante sin precio no muestra un precio heredado. Se marca "Not for sale (no price in
    <origen>)", asociado al input con `aria-describedby`. El placeholder de la celda es "—";
  - no bloquea Publish si al menos una variante activa tiene precio;
  - si ninguna tiene precio, bloquea (`variantPrices`) aunque el producto tenga precio, porque
    no hay nada que vender. El copy dice que el precio se pone en el origen;
  - sin precio de producto, "Price from" es el mínimo de las variantes activas con precio
    (`lowestForSalePrice`), igual que la derivación del micro. Es lo que se guarda;
  - con precio de producto, ese precio no se pisa (como antes, y como el micro). El hint de
    Details ya no dice que lo usan las variantes sin precio;
  - el origen sale de `priceSourceName`: WooCommerce, Shopify, Magento, BigCommerce,
    Squarespace, "the feed" (NATIVE con `originId`) o "the source".
- **Nativo:** igual que antes.
- La cabecera de `src/lib/products.js` documenta la regla del micro y el cambio de contrato del
  PUT: desde #23, en un nativo la variante vacía hereda traiga o no `price`.
- **Tests:** 12 nuevos.
  - 7 de la lib.
  - 5 de la vista, en `test/product-detail/publish-with-variants.test.jsx`:
    - Woo con producto en 0 y variantes 110/0: Publish habilitado, M "Not for sale", "Price
      from" 110, y el PUT lleva 110 de producto y M vacía;
    - Woo con producto en 150 y una variante en 0: M no muestra 150, y el PUT no le pone precio;
    - Woo sin ninguna variante con precio: bloquea;
    - feed (NATIVE con `originId`): se trata como importado;
    - el mismo producto sin `originId`: es nativo y bloquea.
  - El test nativo de herencia suma que no aparezca "Not for sale".
  - Contra `origin/develop` fallan 11 de los 12. El que pasa es el guard nativo.
- **Verificación:**
  - `npx jest`: 578 verdes y 2 rojos, los de siempre en develop (`payments-lib` y
    `qliro-shipping-config`);
  - eslint limpio en lo tocado. `npm run lint` da 2 errores en `src/views/shell/index.jsx`, que
    ya estaban;
  - `npm run build` OK sobre `a8d86c6`, en una copia APFS en el scratchpad con env ficticias. Sin
    `.env` en el worktree;
  - **no se vio en el navegador**.

## Decisions

- **El "desde" de un importado sigue la derivación del micro: solo si falta precio de
  producto.** Con un Woo en 150 y variantes 110/0, Details muestra "Public price" 150, no "Price
  from 110". El micro no pisa un precio > 0, y el plugin de Woo con su patch ya manda el mínimo
  activo.
- **Importado sin ninguna variante con precio: bloquea.** Antes, con precio de producto, la
  herencia lo dejaba pasar. Con #23 nada de ese producto se cobra.
- **Solo variantes activas** (`active !== false`) para "al menos una con precio" y para el
  mínimo, como el micro. En nativo no se tocó (`lowestVariantPrice` sigue exigiendo todas).
- **`locked` no cambia.** El feed sigue editable en el dashboard (`origin` NATIVE): ahí se puede
  cargar el precio de una variante, aunque el próximo refresh del feed lo pise.
- **`originId` en el GET:** es columna normal de la entidad `Product` del kernel (sin
  `select: false`), y el GET devuelve la entidad, igual que `originUrl`, que el detalle ya lee.
  No se comprobó con un payload real de staging.

## Blockers / open questions

- **Orden de deploy.** Con un backend sin #23, el webapp marca "Not for sale" en una variante que
  el micro sí hereda: `handlePublish` manda `price` > 0 y el `newUpdate` viejo hereda. Peor: un
  Woo en 0 con 110/0 ahora se publica con 110 de producto, y el micro viejo le pone 110 a M. **El
  webapp no puede llegar a un entorno antes que products-ms #23.** En QA ya está; en prod hay que
  esperar.
- **La lista no ve variantes** (`variants=false`): un importado con producto en 0 sigue marcado
  "Variant prices" hasta que corra el backfill de #23 o alguien lo guarde desde el detalle.
- **Qué hace shopcart con una variante en 0 de un importado** (¿la vende a 0 o la bloquea?).
  Sigue abierto, igual que en el journal de products.
- El banner "Synced from …" del detalle dice "WooCommerce" para cualquier origen que no sea
  Shopify (Magento incluido). No se tocó: está fuera de alcance. `priceSourceName` serviría.

## Next session

- OK de Angelo para push de `fix/variantes-importadas` y PR a `develop`, **después** de que
  products-ms #23 esté donde vaya a salir el webapp.
- Verificar en staging, en el navegador, un Woo de QA con variantes y una en 0: "Not for sale" y
  Publish habilitado.
