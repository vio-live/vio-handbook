---
date: 2026-10-14
session: "webapp: un producto con variantes no se podía publicar (precio en 0.00)"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: publicar un producto con variantes

## Goal

Bug de QA de Alan (14/10) en webapp-vio-commerce: *"Los productos con variantes no los puedo pasar a
published porque el price siempre me lo deja en 0.00 y es requerido mayor para habilitar el botón
Publish"*. Alan decía que era del front. Había que verificarlo, en el front y en el backend (este solo
leyendo), antes de darlo por hecho.

Rama `fix/publicar-con-variantes` sobre `origin/develop` `5dec43c`. Worktree:
`~/vio-commerce/worktrees/webapp-variantes`.

## Causa

**Es del front.** El backend no bloquea por precio.

- **El gate.** `computeMissingDetail` (`src/lib/products.js:255` en develop) pedía
  `form.publicPrice > 0` siempre, también con variantes. El botón Publish
  (`src/views/product-detail/index.jsx:216`) se deshabilita con cualquier faltante.
- **Con variantes, nadie escribe el precio del producto.** El precio se carga en la matriz, por
  variante, y el micro de products no deriva el del producto. Verificado contra staging con la cuenta
  desechable del lifecycle test (producto creado y borrado):
  - un alta con variantes S=30 y M=32, sin precio de producto, queda con `price.amount: null`, y la
    lista lo devuelve como `publicPrice: 0`;
  - después del primer `PUT /products/:id` que no trae `price`, queda en `"0.00"` (`newUpdate`,
    `product.service.ts:2947`: `if (!prevProduct?.price?.amount) prevProduct.price.amount = 0`);
  - una variante con el precio vacío queda en `"0.00"` si el PUT no trae `price`.
    `newUpdate` (`product.service.ts:3273-3287`) la hace heredar el precio del producto **solo** si
    el request trae `price > 0`. El alta (`doUpdate`, vía `save`) no hereda nunca.
- **El backend no valida precio al publicar.**
  - `PUT /api/products/:id/publish` de base-api es un proxy puro: `productController.ts:152` →
    `productService.ts:79`.
  - `publish` del micro (`product.service.ts:1533-1617`) valida título, shipping (si no es digital)
    y el plan. Precio no.
  - El publish de la prueba lo frenó el plan (la cuenta desechable está en 20/20 SKUs), no el precio.

## Done

Commit local **`0f7f259`**, sin push ni PR.

- **Gate del detalle con variantes.** El precio es el de cada variante, y una vacía hereda el del
  producto: es lo que hace `newUpdate`, y la matriz ya lo mostraba de placeholder. Falta precio solo si
  una variante no tiene el suyo y el producto tampoco: entonces el faltante es `variantPrices`
  ("Variant prices") y no `publicPrice`.
- **La UI dice qué falta:**
  - el banner del gate muestra "Variant prices";
  - en Details, "Set a price on every variant, or one here for those without.";
  - en la matriz, "No price for M. …", con la celda marcada (`aria-invalid` y borde de error);
  - el placeholder es el precio que se hereda, o "Required" si no hay nada que heredar.
- **El precio del producto se deriva, explícito y documentado.** Lo aplica `withVariantPrice` en
  guardar, publicar y crear:
  - con **todas** las variantes con precio propio, el del producto pasa a ser el **mínimo** (precio
    "desde"). Es lo que leen la lista (gate, columna y filtro de precio) y nadie lo hereda;
  - en Details, ese caso se ve como "Price from", deshabilitado, con "Lowest variant price. Prices are
    set per variant.";
  - **en un importado** (Shopify/Woo) solo se completa si falta. Ese precio lo pone el origen
    (Shopify: el de la primera variante) y guardar la comisión no debe pisarlo.
- **Una variante en `"0.00"` llega vacía al form** (`productToForm`), para que la celda muestre lo que
  hereda y no un 0.00 que parece un precio real.
- **La lista** (`computeMissing`) pide `variants=false` y no ve los precios de las variantes. A un
  producto con variantes y sin precio de producto ahora le marca "Variant prices" en vez de "Price".
  Sigue bloqueado para la publicación masiva: se resuelve abriéndolo.
- **Sin variantes no cambia nada.**
- **La cabecera de `src/lib/products.js`** documenta el contrato: `publish` no valida precio, y el PUT
  sin `price` deja las variantes vacías en 0.
- **Tests:** 18 nuevos.
  - `test/product-detail/publish-with-variants.test.jsx` renderiza la vista real con los payloads con
    la forma del GET (7):
    - con variantes y precios > 0, Publish habilitado y se guarda el mínimo;
    - con una variante en 0 y sin precio de producto, Publish deshabilitado y con el mensaje;
    - cargar el precio que falta habilita Publish;
    - una variante vacía hereda el precio del producto;
    - un importado no pisa el precio del origen;
    - sin variantes, igual que antes (dos casos).
  - Los tests de la lib suman 11.
  - Sin el arreglo fallan 6 de los 7 de la vista. El del bug falla porque Publish queda
    deshabilitado; otros fallan también por los `aria-label` nuevos.
- **Verificación:**
  - `npx jest`: 541 verdes y 2 rojos, que **ya fallaban en develop**: `payments-lib` (Vipps) y
    `qliro-shipping-config`;
  - eslint limpio en lo tocado;
  - `npm run build` OK, en una copia APFS temporal con las env en el proceso, sin copiar `.env`.
  - **No se vio en el navegador.**

## Decisions

- **Una variante sin precio hereda el del producto**, en vez de exigir precio en cada variante. Así
  funciona el backend y así lo mostraba la matriz, y exigirlo en cada una bloquearía drafts que hoy
  se publican.
- **El precio del producto es el mínimo de las variantes** cuando todas tienen el suyo. Ningún
  backend lo necesita para publicar, pero la lista y el filtro de precio leen esa columna.

## Blockers / open questions

- **Productos que ya existen** con variantes con precio y el del producto en 0.00, como los de
  Alan: la lista los sigue marcando ("Variant prices") hasta que alguien los abra y publique o guarde
  desde el detalle. Ahí se escribe el mínimo.
- **La publicación masiva no ve variantes** (ya pasaba antes). Un producto con precio de producto
  > 0 y una variante en 0 en la base se publica desde la lista sin que la herencia se materialice.
  Cuánto se cobra esa variante en el checkout no está verificado (shopcart).
- **Propuesta para products-ms** (otro repo, sin tocar):
  - que `newUpdate` y `doUpdate` deriven `price` del producto de las variantes (el mínimo) cuando
    `optionsEnabled`;
  - que la herencia de la variante vacía no dependa de que el request traiga `price`;
  - que `publish` rechace una variante con precio efectivo 0.
  Con eso, el front dejaría de ser el único gate.
- La cuenta desechable `claude-qa-final-…@viotest.dev` (user 1308) está al tope de 20 SKUs del plan
  Free. Para probar un publish de punta a punta hay que liberar SKUs o usar otra cuenta.

## Next session

- Con el OK de Angelo: push de `fix/publicar-con-variantes`, PR a `develop`, y verificar en staging en
  el navegador: un producto con variantes, sin precio de producto y con todas las variantes con
  precio, se publica.
