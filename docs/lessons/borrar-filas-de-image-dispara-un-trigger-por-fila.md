---
title: "Borrar en `image` dispara un trigger por fila, y un `kubectl exec` cortado no para la sentencia"
date: 2026-11-04
---

## Síntoma

El 4/11 a las 00:15 UTC, una purga de imágenes con borrado lógico en prod
(`DELETE FROM image WHERE deleted_at IS NOT NULL ORDER BY id LIMIT 5000`) estuvo 10 minutos viva. Llegó a tener
~278.000 filas bloqueadas y **28 imports de Shopify fallaron por `Lock wait timeout`**, además del barrido horario de
huérfanas. El `kubectl exec` que la lanzó se había cortado (websocket 1006) y parecía que no había pasado nada.

## Causa real

1. **`image` tiene tres triggers** (`image_AFTER_INSERT`, `image_AFTER_UPDATE`, `image_AFTER_DELETE`) que llaman a
   `update_product_active_state(product_id)` por cada fila. Ese procedimiento cuenta
   `image WHERE deleted_at IS NULL AND product_id = ?` y **`image` no tiene índice por `deleted_at`**: solo el de
   `product_id`. Con un producto de 40.000 filas, cada fila borrada cuesta ~63 ms y deja la fila del producto
   bloqueada. Borrar las filas de un producto así cuesta O(n²).
2. **Un `DELETE` con un `WHERE` sin índice y `ORDER BY … LIMIT`** recorre la tabla bloqueando filas y huecos, y choca
   con los `INSERT` de products.
3. **Cortar el cliente no cancela la sentencia.** MySQL la sigue ejecutando hasta que termina. En autocommit, al
   terminar confirma su parte.

## Cómo se arregló

- La sentencia se encontró en `information_schema.innodb_trx` (antigüedad, `trx_rows_locked`, `trx_query` con el
  `CALL` del trigger) y se paró con `KILL <hilo>`.
- La purga se rehízo por id, desde la lista exportada antes de borrar:
  - `DELETE … WHERE deleted_at IS NOT NULL AND id IN (…)`, en READ COMMITTED y con `innodb_lock_wait_timeout` bajo;
  - primero lo barato (variantes, cuyo trigger recibe NULL) y los productos de menor a mayor;
  - los grandes, en sentencias de 100 filas con pausa.
- Resultado: 174.976 filas borradas en 2 h 40 min, sin una sola espera más.
- En el código, `purgeRetiredImages` borra como mucho 500 por import, por el mismo trigger
  ([vio-products-microservice#54](https://github.com/vio-live/vio-products-microservice/pull/54)).

## Regla

- **Antes de borrar en bloque en prod, mira los triggers de la tabla** (`information_schema.triggers`) y qué hacen
  por fila.
- **Borra por clave primaria**, desde una lista exportada, en lotes pequeños. Nada de `WHERE` sin índice con `LIMIT`
  sobre una tabla que recibe `INSERT`.
- **Lanza cada tanda en una conexión corta y, si se corta, mira `innodb_trx` antes de reintentar.** Una sentencia
  huérfana sigue bloqueando aunque el cliente ya no exista.
- Un índice `image (product_id, deleted_at)` haría barato el `COUNT` del trigger. Está pendiente del OK de Angelo
  (lo crearía Miguel).
