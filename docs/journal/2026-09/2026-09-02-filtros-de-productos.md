---
date: 2026-09-02
session: bugfix
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-09-02 · los filtros de productos no filtraban

Feedback de Alan: **los filtros de /listings no funcionan**. Confirmado, y no
era un bug sino cinco. De los cinco filtros, **tres devolvían siempre cero** y
**los cinco órdenes se ignoraban**.

## Verificado en staging antes de tocar nada

Cuenta `bohus` (user 1322), 16 productos, todos con categoría
"Apparel & Accessories" a la vista en la tabla:

| Prueba | Esperado | Real |
|---|---|---|
| Categoría = Apparel & Accessories | 16 | **0** |
| Ships to = Norway | 16 | **0** |
| Orden A–Z | alfabético | **idéntico al default** |
| Comisión ≥ 10% | 16 | 16 ✅ |

El request capturado deja el orden a la vista:

```
/api/listings?page=1&size=25&variants=false&user=1322
  &referralFeeFrom=10&referralFeeTo=100&shipTo=NO&orderalphabet=ASC
```

## Las causas

**1. Categoría — `search.ts` filtraba por la tabla muerta.**
`subcategory.category.id IN (…)` recorre `product.subcategories → Subcategory`,
la tabla que ayer confirmamos **vacía y deprecada**
([`architecture/product-categories.md`](../../architecture/product-categories.md)).
La relación viva es `ProductCategory`, y el query builder ya la tenía joineada
— la usaba para *mostrar* la categoría en la fila, nunca para filtrar.

Hay un segundo nivel: el dashboard ofrece las **raíces** del árbol y los
productos cuelgan de las **hojas**, así que filtrar por el id pelado tampoco
alcanzaba. El fix expande a los descendientes por `fatherId`.

**2. Source — filtraba una relación que nadie escribe.**
`channel.name IN (…)` sobre `product.channels`. Grepeados los cuatro repos:
**ningún servicio escribe esa relación**. La procedencia real vive en
`product.origin` (`NATIVE | SHOPIFY | WOOCOMMERCE | MAGENTO`), que es
justamente lo que el front ya pinta en el badge de cada fila.

**3. Ships to — columna que nadie escribe.**
`product.shipTo LIKE '%NO%'`. Misma historia: la columna existe en la entidad y
no la escribe nadie. El envío real se modela por clase de envío
(`/shipping/product-id/:id`), no por una columna de texto en el producto.

**4. El orden nunca se aplicó — regresión de la migración.**
El backend compara `orderalphabet == 'asc' || == 'desc'`, en minúscula. El
dashboard Next manda `ASC`/`DESC`, así que no matchea ninguna rama y cae
siempre al `createdAt DESC` por defecto. El legacy mandaba minúscula
(`routes/app/listings/index.jsx:129`); se perdió al reescribir la vista. Peor:
había un test que **fijaba el comportamiento roto** (`expect(…).toBe('ASC')`).

**5. `orderstatus` ordenaba por `product.origin`**, no por `product.status`.
Copy-paste de la rama de arriba.

## Hecho — tres PRs abiertos con OK de Angelo

| Repo | Rama | PR |
|---|---|---|
| webapp-vio-commerce | `fix/listings-filters` | [#3](https://github.com/vio-live/webapp-vio-commerce/pull/3) |
| vio-products-microservice | `feature/fix-listings-filters` | [#2](https://github.com/vio-live/vio-products-microservice/pull/2) |
| vio-base-api | `feature/listings-origin-filter` | [#1](https://github.com/vio-live/vio-base-api/pull/1) |

Los tres van juntos: el front manda `origin`, base-api lo reenvía, products lo
usa. Mergear solo el front no arregla nada.

- **webapp**: dirección del orden en minúscula; Source manda `origin` con los
  valores reales y suma **Vio** (`NATIVE`), que no estaba como opción; el
  popover deja de cortar las categorías en 8 (desde que `/categories-all`
  devuelve árbol, esas 8 eran solo las primeras raíces).
- **products**: categorías por `ProductCategory` + descendientes; parámetro
  `origin` nuevo sobre `product.origin`; `orderstatus` por `product.status`.
  `channels` queda intacto para no romper a nadie.
- **base-api**: `/listings` acepta y reenvía `origin`.

## Decisiones

- **"Ships to" se saca de la UI** (decisión de Angelo). Filtraba por
  `product.shipTo`, columna de texto que no escribe ningún servicio: siempre
  cero. El param sigue soportado en la capa de datos por si algún día se
  puebla. La implementación real tendría que derivarlo de las clases de envío
  del producto (`/shipping/product-id/:id`), no de una columna en el producto.

- **Los tramos de precio se escalan con la moneda**. Eran "Under kr 10 / 25 /
  50 / 100" contra un catálogo de 599 a 19 299 kr: los cuatro seleccionaban
  nada. Solo se traducía el símbolo, no el orden de magnitud. NOK/SEK/DKK pasan
  a 100/250/500/1000; EUR/USD/GBP quedan igual.

## Blockers

- **`products` no typechequea local**: sin `node_modules` porque `@reachu/*`
  vive en el registro privado (solo CI). El cambio se revisó a mano. `base-api`
  sí typechequea limpio.
- Los tres PRs esperan review. El de products necesita que el CI corra el
  typecheck que no se pudo correr local.

## Lección

**Un filtro que devuelve cero se lee como "no hay nada", no como "está roto".**
Los tres filtros muertos apuntaban a relaciones y columnas que ningún servicio
escribe — no fallaban, no logueaban, simplemente no matcheaban. La comprobación
barata era la que hicimos primero: filtrar por un valor que la propia tabla
muestra en pantalla y ver si el resultado desaparece.
