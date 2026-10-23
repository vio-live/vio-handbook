# P1 (enlaces producto-categoria idempotentes) llego a produccion el mismo 23/10

- Quien: Miguel (verificacion). El merge a master y el cierre del PR de P2 los hizo Angelo.
- Donde: `vio-live/vio-products-microservice`, `vio-live/package-database`, cluster `vio-commerce-prod-sc`.
- Cuando: 23/10/2026, 19:01-19:30 UTC.
- Contexto: yo habia dado el reparto por cerrado diciendo que jhondev y juan no habian abierto
  nada. **Era falso.** jhondev lo corrigio; al verificar aparecio ademas un segundo PR, a master.

## Que paso de verdad

- **PR #31** `fix(product): make product_category links idempotent (P1)` -> **develop**, mergeado
  19:01:39Z. Unifica los 4 puntos de escritura a `product_category` en un helper
  `linkProductCategory(productId, categoryId)` que hace `findOne` antes de insertar y traga
  `ER_DUP_ENTRY`. Trae test de doble importacion de Shopify.
- **PR #32** `fix(product): enlaces producto-categoria idempotentes (P1, a prod)` -> **master**,
  mergeado por `angelosv` 19:20:41Z, rama `fix/product-category-idempotent-link-master`. CI/CD verde.
- **Desplegado en prod**: deployment `products` Available 19:27:15Z; pods `products-6bdf7d58d7-*`,
  2/2, 0 restarts. O sea P1 esta vivo en produccion desde el 23/10, no el lunes.
- **PR #26** de `package-database` (dedupe + UNIQUE) cerrado por `angelosv` 19:30:02Z. La migracion
  P2 no corre en ningun entorno.
- Residuo sin commitear en el checkout local de `package-database` (`src/entity/ProductCategory.ts`
  + migracion `1792600000000-product-category-dedupe-unique.ts` sin trackear): se deja tal cual.

## Cabo abierto, latente

`linkProductCategory` llama a `findOne` **sin `withDeleted`**, asi que no ve filas con borrado
logico, y el `catch` devuelve `return` ante un 1062. El dia que entre el `UNIQUE(product_id,
category_id)` plano de P2, re-vincular una categoria que estaba borrada logicamente chocara con la
fila muerta y el error se tragara en silencio: **el producto se queda sin la categoria y nadie se
entera**. Arreglo cuando P2 vuelva: `withDeleted: true` + `restore`, nunca insert.
Hoy no muerde porque en prod hay **0 filas** de `product_category` con borrado logico (medido 23/10).

## Correccion a lo que dije antes

El peor par duplicado no son 132 filas: son **13.671** para un solo (producto, categoria).
268.748 filas vivas, 262.877 sobrantes.
