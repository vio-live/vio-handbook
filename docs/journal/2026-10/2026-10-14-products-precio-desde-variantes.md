---
date: 2026-10-14
session: "products: el precio de un producto con variantes sale de sus variantes (regla única, todos los caminos de escritura, backfill)"
participants: [angelo, claude, svc-products]
status: live
---

# products: el precio de un producto con variantes

## Goal

Arreglo definitivo en vio-products-microservice, aprobado por Angelo el 14/10. Continúa
[`2026-10-14-front-commerce-publicar-con-variantes`](2026-10-14-front-commerce-publicar-con-variantes.md)
y va en paralelo a [`2026-10-14-extensions-precio-variable-woo`](2026-10-14-extensions-precio-variable-woo.md).

- En QA hay 333 productos con variantes con `price_amount` en 0.00 y las variantes con su
  precio: 301 WOOCOMMERCE, 10 MAGENTO y 22 NATIVE.
- Publicados, el catálogo muestra "0 NOK". El caso de Alan es el producto 411959, cuenta 1331,
  con variantes de 110 y 120 NOK.
- Ninguna capa derivaba el precio del producto desde sus variantes.

## Done

Rama `fix/precio-desde-variantes` desde `origin/develop` `0002037`. Worktree en
`~/vio-commerce/worktrees/products-precio`. Tres commits locales, **sin push ni PR**:

- `ed3750a`: la regla, los caminos y el arreglo del `baseAmount`;
- `b1d8206`: el backfill y los tests de caminos;
- `c5280b8`: la herencia queda sólo para productos nativos del dashboard (ver Decisions).

### La regla, en un solo lugar

La regla vive en `src/modules/product/providers/variant-price.ts`, pura. Precedencia dentro de
una escritura:

1. **Precio propio del producto** (`productOwnPrice`): el del request si es > 0; si no, el
   guardado si es > 0.
2. **Herencia** (`inheritedVariantPrice`): una variante sin precio (<= 0) toma ese precio
   propio, traiga o no `price` el request. **Sólo en un nativo del dashboard**
   (`inheritsVariantPrices`: `origin` NATIVE o vacío, y sin `originId`). En un importado
   (Woo, Shopify, Magento, feed, scraper, BigCommerce) una variante en 0 queda en 0.
3. **Derivación** (`productPriceFromVariants`): **sólo si el producto no tiene precio propio**,
   toma el mínimo de los precios > 0 de sus variantes activas (sin borrar ni desactivar). Es la
   decisión del coordinador: un precio > 0 no se pisa (el de Shopify, el que puso el seller o el
   de una derivación anterior).
4. Sin variantes activas, o ninguna con precio, el producto queda igual. Si las variantes con
   precio están en dos monedas, tampoco se toca.

- **No hay ciclo**: la regla 2 sólo corre con precio propio y la 3 sólo sin él. La herencia va
  antes de derivar, así que una variante en 0 no hereda el mínimo derivado en esa escritura.
- **Moneda**: la de las variantes, porque es lo que se cobra (como la clase de envío, cuya
  moneda la mandan sus países). Un producto en 0 suele tener moneda por defecto: EUR en
  `newUpdate` y en `cleanData`.
- **Precio de la variante**: `price_amount` si es > 0 (lo que lee el checkout); si no, la
  columna `price`.

`VariantPriceService` (`variant-price.service.ts`) la aplica. Escribe `price_amount`,
`price_currency_code`, `price_base_amount` (EUR, `convertBaseAmountByUserSettings`, como el
resto) y `public_price`. `price_compare_at` no se toca.

- `applyToProduct`: en memoria, antes del save de cada camino.
- `syncProduct`: lee y persiste sólo si cambia, e invalida la cache. Lo usan `publish` y el
  backfill.

### Caminos de escritura

| Camino | Dónde | Estado |
|---|---|---|
| Alta (`save` → `doUpdate`); también bus `create` (Woo), scraper y `bulkByService` | `product.service.ts:954` (herencia), `:994` (derivación) | cubierto |
| Edición, alta y borrado de variantes (`PUT /:productId` → `newUpdate`, `bulkUpdate`; `save` de un existente) | `:3039` (precio propio), `:3344` (herencia), `:3431` (derivación) | cubierto. No hay endpoints propios de variantes: el request trae la lista entera |
| `newUpdate`: `price_base_amount` con `amount: ''` del plugin de Woo | `:3029` | arreglado: usa el monto que queda |
| Import de Shopify (`importShopifyProduct`: bus `import-from-shopify`, webhook de listing, `POST /import/shopify/product`) | `:2303` | sólo derivación, sin herencia. Precio = primera variante, intacto |
| Import de Magento (`importProductFromMagento`) | `:4619` | cubierto |
| Feed de Google Merchant (`upsertFromFeed`) | `:5048` | cubierto, antes de la huella: no reescribe en cada corrida |
| `syncFeedVariants` (cuando el feed actualiza o desactiva variantes) | vía `upsertFromFeed` | cubierto: la derivación usa las variantes del payload |
| `publish` / `bulkPublish` / `createDemos` | `:1583` | recalcula antes de publicar, también si ya estaba publicado. Si falla, publica igual |
| `update()` (público) | `doUpdate` | cubierto, pero no tiene callers |
| `fastInsert`, `ProductSqsConsumerService` | — | sin tocar: código muerto, sin callers / no registrado |
| `deleteByIds`, `sweepAbsentProducts` | — | sólo `quantity`; no cambian precios |
| Custom products (`CustomProduct`/`CustomVariant`) | — | fuera de alcance: no son el precio del producto |
| **extensions `POST /bulk-products` (BigCommerce)** | otro repo | **no pasa por products-ms**. Lo cubren `publish` y el backfill |

### Backfill

`src/scripts/recompute-variant-prices.ts`, dry-run por defecto.

- **Candidatos**: productos vivos con `price_amount` null o <= 0 y alguna variante sin borrar.
- **Cómo escribe**: pasa cada uno por `syncProduct`. No usa SQL directa.
- **Arranque**: sólo `DatabaseModule` y el servicio, sin el consumer del bus ni HTTP.
- **Salida**: con `--apply` escribe. `--ids`, `--user`, `--limit` y `--json`.

### Tests

Corren con el setup que sólo carga `reflect-metadata`.

- **`variant-price.spec.ts`** (puro, 20): el mínimo; ignora borradas, inactivas y en 0; sin
  variantes queda igual; monedas mezcladas; precedencia; sin ciclo.
- **`variant-price-paths.spec.ts`** (22): `ProductService` real con repositorios en memoria.
  - **Caminos** (18): alta, Woo `create` con `amount: ''`, edición, borrar la más barata,
    `baseAmount`, Shopify, Magento, feed y `publish`.
  - **Backfill** (4): dry-run, apply con segunda pasada, filtros y argumentos.
- **Contra el `product.service.ts` de develop fallan 14 de los 18 de caminos.** Los 4 que pasan
  son guardas: sin variantes, precio propio intacto y Shopify intacto.
- **Resultado**: 122/122 de los specs puros del repo en verde. `tsc --noEmit` da 0 errores.
  eslint no suma errores en lo tocado.

### Verificado contra MySQL real

Contenedor local desechable (`mysql:8.0.21`). Las tablas `product`, `variant` y `user` salen de
las entidades del kernel; `exchange_rate` se creó a mano. Se corrió el **script compilado**:

- dry-run → `--apply` → dry-run otra vez;
- la variante borrada y la inactiva no cuentan;
- monedas mezcladas, y variantes sin precio: no se tocan;
- un producto en EUR por defecto con variantes en NOK pasa a NOK;
- la base sale de `exchange_rate`;
- la segunda pasada no encuentra nada;
- `--ids` y `--user` filtran bien.

El contenedor se borró.

## Decisions

- **Derivar sólo cuando el producto no tiene precio** (decisión del coordinador). Así:
  - Shopify queda intacto: su precio es el de la primera variante;
  - no se pisan comisiones ni precios explícitos;
  - coincide con el dashboard (#54) y con el patch del plugin de Woo, que manda el precio
    **activo** más bajo. products-ms usa el mismo criterio: `price_amount` de cada variante,
    que el plugin mapea como precio activo.
- **La herencia, sólo en productos nativos del dashboard** (`c5280b8`, decisión del
  coordinador al cierre de la sesión).
  - **Qué es nativo**: `origin` NATIVE o vacío, y sin `originId`. El feed guarda NATIVE con el
    `g:id` en `originId`, así que cuenta como importado.
  - **Importados**: la variante refleja el origen; en 0 queda en 0, porque no se vende algo que
    el merchant no puso a la venta.
  - **Cambio respecto de develop**: allí la vacía tomaba el precio del request (p. ej. un
    `bulkUpdate`) en cualquier origen; ahora, en un importado, no.
  - **Sin cambios**: la derivación sigue para todos los orígenes, y el backfill también (sólo
    deriva).
  - **Tests**: 4 nuevos (Woo en alta y edición, con precio en el request, la escritura siguiente
    y el feed). Fallan contra `b1d8206`. 128/128 de los specs puros en verde.
- **Monedas mezcladas: no se adivina.** Mismo criterio que la clase de envío.
- **`syncProduct` lee con query builder, no con `findOne({ relations })`.** En TypeORM 0.2.41
  `relations` arrastra las relaciones eager de lo que une (el `user` trae una docena de joins).
  Apareció contra MySQL real.
- **El `update` lleva `id` en el SET**, como `deleteByIds`. Sin él, el `ProductSubscriber` del
  kernel emite `product.updated` e invalida las caches con `undefined`. También apareció contra
  MySQL real.

## Blockers / open questions

- **Precio "desde" que queda viejo.** Un producto con precio derivado (> 0) no lo recalcula si
  después se borra o se encarece su variante más barata. Ya tiene precio, y no hay columna que
  distinga un precio derivado de uno explícito. Ejemplo: 110/120 → 110; se borra la de 110 y
  sigue en 110.
  - El dashboard lo cubre en nativos: manda el mínimo explícito.
  - El plugin de Woo, con su patch, también: manda el mínimo activo en cada sync.
  - Si se quiere que siga solo, hace falta una columna `price_derived` en `package-database` (no
    tocado), o aceptar el riesgo de seguir al mínimo cuando el precio coincide con el mínimo
    anterior.
- ~~Herencia de un precio derivado en variaciones de Woo~~: resuelto en `c5280b8`. La herencia
  queda sólo en nativos.
  - **En nativos sigue**: una variante vacía hereda el mínimo derivado en el próximo `newUpdate`.
  - **Pendiente**: no se sabe qué hace shopcart con una variante en 0 de un importado (¿la vende
    a 0 o la bloquea?).
- **El gate del webapp (#54) supone herencia en todos los orígenes.** "Falta precio sólo si una
  variante no tiene el suyo y el producto tampoco", y la matriz muestra el precio heredado como
  placeholder. En un importado ya no se hereda: el lane de front-commerce tiene que tratar esa
  variante en 0 como sin precio (no a la venta) cuando `origin` no es nativo.
- **El backfill no propaga a canales.** No emite `listing-product:updated`, así que los
  productos listados en Shopify/Woo de terceros siguen en 0 allá hasta el próximo update.
- **`doUpdate` heredado**: un alta sin moneda de producto guarda las variantes en EUR (la
  `tmpCurrency` sale de `cleanData`). Es el bug de `variant-currency` del 15/09, que sólo se
  arregló en `newUpdate`. No se tocó; el precio derivado queda en la misma moneda que las
  variantes.
- El `node_modules` es el del clon principal, con el kernel 1.0.258, no el 1.0.270 del
  `package.json`.

## Next session

- OK de Angelo para push y PR de `fix/precio-desde-variantes` (`ed3750a` + `b1d8206` + `c5280b8`).
- Después del deploy a QA, correr el backfill en el pod (instrucciones en el brief):
  1. dry-run;
  2. revisar la lista: tienen que salir los 333;
  3. `--ids=411959 --apply`, y comprobar en el catálogo;
  4. `--apply`.
- Decidir si hace falta `price_derived`.
- Front-commerce: ajustar el gate y el placeholder de la matriz para productos no nativos.
