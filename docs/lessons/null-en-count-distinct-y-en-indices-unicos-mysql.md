---
title: "NULL en MySQL: `COUNT(DISTINCT a,b)` descarta filas y un índice único no ata los NULL"
date: 2026-10-23
owner: Miguel
tags: [mysql, migraciones, null]
---

## Síntoma

Una migración que deduplica una tabla y después crea `UNIQUE (a, b)` se protege con:

```sql
SELECT (COUNT(*) - COUNT(DISTINCT a, b)) AS remaining FROM t
```

y lanza `remaining = 39` **sobre una tabla sin un solo duplicado real**, así que el índice nunca se
crea. La tabla queda limpia y sin la restricción: lo más parecido a no haber hecho nada, pero
pareciendo que se hizo.

## Causa real

Son dos reglas de NULL distintas y hay que tener las dos en la cabeza a la vez:

1. **`COUNT(DISTINCT a, b)` descarta las filas donde `a` o `b` es NULL.** `COUNT(*)` las cuenta.
   La resta no son los duplicados: son los duplicados **más** las filas con algún NULL.
2. **Un índice único de MySQL no ata las filas con NULL** — ver
   [`unique-con-columna-nullable-no-constrine-nada.md`](unique-con-columna-nullable-no-constrine-nada.md),
   que cuenta esa regla por el lado de `deleted_at`. Aquí sólo hace falta la consecuencia:
   `(NULL, 7)` puede repetirse cuantas veces quiera sin violar el índice.

Las dos juntas: el criterio frena por filas que al índice le dan exactamente igual.

Y hay una tercera, que es la que engaña: **`GROUP BY a, b` y
`ROW_NUMBER() OVER (PARTITION BY a, b ...)` sí agrupan los NULL entre sí**, justo al revés que el
índice único. Así que el dedupe, si no filtra, borra filas con NULL que el índice habría admitido.

## Cómo se arregla

El criterio tiene que mirar **las filas que el índice ata**, no la tabla entera:

```sql
SELECT COUNT(*) AS total, COUNT(DISTINCT a, b) AS pares
FROM t WHERE a IS NOT NULL AND b IS NOT NULL
```

Y por lo mismo, el dedupe **no debe borrar** las filas con NULL: no pueden violar el índice, así
que borrarlas es destruir datos a cambio de nada. Si la tabla tiene columnas nullable en el
índice, hay que filtrarlas a mano en los dos sitios — en el criterio y en el dedupe.

## Cómo comprobarlo en 30 segundos

Tabla con cero duplicados reales y sólo filas con NULL:

```sql
INSERT INTO t (a,b) VALUES (1,1),(1,2),(2,2),(NULL,1),(NULL,1),(2,NULL),(NULL,NULL);
SELECT COUNT(*), COUNT(DISTINCT a,b) FROM t;              -- 7 y 3: la resta da 4, y no hay duplicados
CREATE UNIQUE INDEX u ON t (a,b);                          -- se crea igual, con las 7 filas
```

## Dónde pasó

Las dos migraciones de P2 de `product_category` (23/10). Medido en QA: 4.755 filas, de las que
**39 tienen `product_id` o `category_id` en NULL**. El criterio sin filtrar daba 39 y frenaba el
índice; filtrado da `3.983 == 3.983`. En producción hay 0 filas con NULL, así que el fallo
**no se habría visto en prod y sí en QA**, que es donde corre primero.

Detalle en
[`../journal/2026-10/2026-10-23-p2-migracion-product-category.md`](../journal/2026-10/2026-10-23-p2-migracion-product-category.md).
