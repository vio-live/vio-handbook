---
title: Hallazgo "P1 no hace restore()" descartado — era contra una PR cerrada
date: 2026-10-23
author: Miguel
---

## Verificación de un hallazgo de jhondev sobre P1/P2 de product_category — Miguel

- Quién: Miguel (reporte de jhondev, sesión de coordinación)
- Dónde: `vio-live/vio-products-microservice` (P1) y `vio-live/package-database` (P2), rama `develop`
- Cuándo: 2026-10-23, noche
- Contexto: jhondev reportó, antes de tocar código, que el P1 mergeado (PR #31,
  `linkProductCategory`) hace `findOne` sin `withDeleted: true` y nunca llama a `restore()`.
  Conclusión suya: con el índice único de P2, re-añadir una categoría previamente quitada
  daría `ER_DUP_ENTRY`, el catch lo trataría como "ya existe" y la categoría no volvería,
  en silencio. Pidió permiso para un fix mínimo.

- Hecho: verificado contra el remoto, **el hallazgo no aplica**. No se tocó código.
  - `package-database` **#26 y #27 están CLOSED**. La que entró es la **#28**
    (merge commit `7604e79`, 19:18Z), con un diseño distinto: columna generada VIRTUAL
    `live = IF(deleted_at IS NULL, 1, NULL)` + `UNIQUE (product_id, category_id, live)`
    (`src/migrations/1792600000000-product-category-unique.ts:97` y `:107`).
  - Con ese índice una fila soft-deleted tiene `live = NULL`, no colisiona, el INSERT de la
    fila nueva pasa y la categoría **sí vuelve**. La #28 lo probó explícitamente contra
    MySQL 8.0.21 (46/46).
  - El comentario del P1 mergeado ya dice "índice único **entre filas vivas**"
    (`product.service.ts:5392`): el autor conocía el diseño de #28.
  - El fix propuesto habría sido peor: `restore()` de la fila vieja cuando ya hay una viva
    del mismo par **sí** da 1062 (documentado y probado en #28).

- Pendiente (menor, no de hoy): cada ciclo quitar/re-añadir deja una fila soft-deleted de
  más en `product_category`. No afecta a ningún join (todos filtran `deleted_at`), pero la
  tabla acumula filas muertas. No se abre PR.
