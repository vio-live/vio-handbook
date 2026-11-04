---
title: "En TypeORM 0.2, withDeleted también trae los hijos borrados de las relaciones eager"
date: 2026-11-04
---

## Síntoma

El 3 y 4/11, `products` en prod abortó una y otra vez con «JavaScript heap out of memory»: 10 reinicios en 12 h,
siempre en una ráfaga de syncs de Shopify. Solo había 2–4 imports en vuelo a la vez, así que el problema no era
la concurrencia. Era el tamaño de una sola consulta.

## Causa real

`importShopifyProduct` buscaba el producto anterior con `findOne({ withDeleted: true, where })` para poder revivir
uno borrado. `Product` tiene `images`, `variants` (con sus `images`), `options`, `channels`… como **eager**, y TypeORM
las carga con LEFT JOIN en una sola consulta.

En TypeORM 0.2.41, `withDeleted` no se limita a la fila principal. También quita el `deleted_at IS NULL` de **cada
JOIN** (`SelectQueryBuilder.js:957`: el filtro solo se añade si `!withDeleted`). Así que cada import cargaba todas las
imágenes retiradas del producto y de sus variantes, y los JOIN las multiplicaban entre sí:

- «Stella - Black» (421785): 146 imágenes de producto × 3 opciones × 483 de variante ≈ 200.000 filas;
- 421192 (gladkokken): 40.262 filas de imagen para 7 vivas.

Las retiradas crecían en cada sync. `reviewImages` dejaba el original webp borrado al lado de la copia subida, y el
arreglo de duplicados de variante también retiraba con borrado lógico.

## Cómo se arregló

[vio-products-microservice#52](https://github.com/vio-live/vio-products-microservice/pull/52) /
[#53](https://github.com/vio-live/vio-products-microservice/pull/53):

- El producto anterior se busca con `loadEagerRelations: false` y solo `relations: ['variants']`.
- Las imágenes se emparejan por URL, para no reinsertarlas.
- Tras cada import, las imágenes retiradas se borran de verdad (con tope, ver
  [borrar en `image` dispara un trigger por fila](borrar-filas-de-image-dispara-un-trigger-por-fila.md)).

## Regla

- **`withDeleted` + relaciones eager = cargar todo lo borrado de todo el árbol.** Si solo necesitas saber si existe
  la fila (o sus columnas), usa `loadEagerRelations: false` y pide solo las relaciones que vas a usar.
- **Un borrado lógico que nadie lee no ahorra nada.** Si ninguna consulta mira las filas con `deleted_at`, borrarlas
  de verdad evita que algún `withDeleted` las arrastre algún día.
- Antes de atribuir un OOM a la concurrencia, cuenta cuántas operaciones había en vuelo. Si eran pocas, mira cuántas
  filas devuelve una sola.
