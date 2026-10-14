---
date: 2026-10-14
session: "webapp: las clases de envío ya no caen a EUR y pasan a la moneda de la cuenta"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: moneda de las clases de envío

## Goal

Es la parte del webapp del arreglo de la moneda de las clases de envío, que Angelo aprobó el 14/10.
El contexto está en [`2026-10-14-shopcart-envio-neto-vs-bruto`](2026-10-14-shopcart-envio-neto-vs-bruto.md).

- **El bug:** `src/views/settings/sections/shipping.jsx` mandaba `currencyCode: me.settings.currency.code || 'EUR'`.
  Si la cuenta no tenía moneda, la clase quedaba en EUR aunque la cuenta fuera NOK.
- **En QA:** hay 20 clases en una moneda distinta a la de su cuenta. Por ejemplo, la brand 1289 (NOK) tiene "Express"
  a 3 EUR, que se convierte al cobrar.
- **El modal de edición:** precargaba el monto con la etiqueta de la moneda de la cuenta aunque la clase
  estuviera en otra.

Rama `fix/envio-moneda-e-iva` en webapp-vio-commerce, la misma que el arreglo de products. Base:
`origin/develop` `88ad8ad`. Worktree: `~/vio-commerce/worktrees/webapp-envio`.

## Done

Commit local **`b3bfd47`**, sin push ni PR.

- **Sin fallback a EUR.** Con `shippingCurrencyOf(user)` = `me.settings.currency.code` o `null`:
  - sin moneda, "New class" y "Save" quedan deshabilitados;
  - un aviso `role="alert"` manda a Profile › Regional;
  - `onSave` no manda nada.
- **Mientras carga `/users/me`:** el mismo spinner de Settings. En la práctica lo cubre el padre, que no
  monta la sección sin `me`.
- **Editar una clase en otra moneda:** muestra la línea "This class is in EUR (€3.00); your account is in NOK. Saving switches it to
  NOK — enter the price in NOK." y la etiqueta del precio dice la moneda en la que se va a guardar.
- **El PUT `shipping/:id`** ahora lleva `currencyCode` arriba, además de en cada país.
- **La lógica vive en `src/lib/settings.js`** (`shippingCurrencyOf`, `shippingClassBody`,
  `shippingCurrencyMismatch`, `shippingEditAmount`) y la cabecera documenta el contrato de moneda.
- **Tests:**
  - archivos nuevos: `test/settings/shipping-currency.test.js` (lib) y
    `test/settings/shipping-section.test.jsx` (vista), con 17 tests;
  - si se vuelve a meter `|| 'EUR'`, fallan 2;
  - suite completa: 497 tests verdes y 2 rojos que ya fallaban en `origin/develop` (abajo).
- **Verificado en navegador** con el harness de sesión inyectada sobre `out/` y base-api interceptada:
  - en una cuenta NOK, editar "Express" (EUR) muestra el aviso y deja el precio vacío. Al guardar 33 sale
    `PUT /api/shipping/1d5481e4 {name, amount: 33, currencyCode: 'NOK', countries: [{country: 'NO', amount: 33, currencyCode: 'NOK'}]}`;
  - en una cuenta sin moneda se ve el aviso, los botones quedan deshabilitados y no sale ninguna escritura.

## Decisions

- **Al editar una clase en otra moneda, el monto NO se precarga.** El aviso muestra el valor guardado
  (€3.00) y la etiqueta, la moneda de guardado (NOK). Con el 3 precargado bajo "Price (NOK)", renombrar la
  clase y guardar habría convertido 3 EUR en 3 NOK sin avisar. Si Angelo prefiere precargarlo, se cambia en
  `shippingEditAmount`.
- **Copy en inglés**, como el resto de la UI. El texto en castellano del pedido se tradujo.
- **La comparación también mira la moneda de cada país** (`shippingCountry[].currencyCode`), aunque no se
  verificó contra staging que el GET la traiga. Si no viene, se compara solo la de la clase.

## Blockers / open questions

- **El `currencyCode` de arriba en el PUT depende del arreglo de products.** Se mandaba solo por país. No
  está verificado que el `PUT /shipping/:id` actual lo acepte: el brief de products no documenta el DTO y
  no se leyó su código. Si products valida con `forbidNonWhitelisted` y no lo declara, la edición daría 400.
  Hay que confirmarlo con el arreglo de products en la misma rama.
- **Dos tests rojos en `origin/develop` (`88ad8ad`), ajenos a este cambio:**
  - `payments-lib` › "Vipps manda sus cuatro credenciales";
  - `qliro-shipping-config` › "los que NO tienen fallback siguen sin él".
- **`next build` falla en un worktree con `node_modules` symlinkeado.** Pasa en "Collecting page data" con
  `TypeError: c(...) is not a function` en `_app.js`: `next/font/local` (Geist) resuelve fuera del proyecto y
  el loader de fuentes no se aplica. Pasa igual sin el cambio. Con una copia APFS (`cp -cR`) de
  `node_modules`, el build pasa entero.
- **La lista de clases no maneja el `error` de SWR** (`useShippingClasses`): si el GET falla, el spinner
  gira para siempre. Es previo y no se tocó.

## Next session

- Confirmar con el arreglo de products que `PUT /shipping/:id` acepta `currencyCode` arriba. Después,
  push + PR de la rama con OK de Angelo y prueba en staging con la brand 1289.
- Las 20 clases de QA siguen en la moneda vieja hasta que alguien las edite. Si se quieren corregir sin
  tocarlas a mano, hace falta un data patch, que no es del webapp.
