---
title: "Un UNIQUE que incluye una columna nullable no impide duplicados (MySQL: NULL != NULL)"
last-updated: 2026-10-23
---

# Síntoma

Tienes una tabla con borrado lógico (`deleted_at` nullable) y filas duplicadas. La solución
obvia parece ser un índice único que incluya `deleted_at`:

```sql
ALTER TABLE product_category ADD UNIQUE (product_id, category_id, deleted_at);
```

El razonamiento suena bien: así el índice no bloquea re-añadir algo que se quitó antes, porque la
fila vieja tiene `deleted_at` con fecha y la nueva lo tiene a NULL.

La migración corre sin error, el índice aparece en `SHOW INDEX`, y **los duplicados vuelven a
crecer igual que antes**. Nadie se da cuenta hasta que el problema reaparece semanas después.

# Causa real

En MySQL, dentro de un índice único, **dos NULL no se consideran iguales**. Si `deleted_at` es
nullable y las filas vivas lo tienen a NULL, el índice no las compara entre sí: puedes insertar
`(1, 5, NULL)` tantas veces como quieras sin violar nada.

Y las filas vivas son justo las que querías constreñir. En `product_category` de producción el
100 % de las 268.748 filas tenía `deleted_at IS NULL`, así que el índice no habría impedido ni un
solo duplicado de los que tumbaron `api` por heap ese día.

Lo mismo vale para cualquier columna nullable del índice, no sólo `deleted_at`: antes de confiar
en un único, mirar `IS_NULLABLE` de **todas** sus columnas.

```sql
SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_category';
```

# Cómo se arregla

**La buena, y la que acabó en producción el 23/10:** una columna generada que vale 1 en las filas
vivas y NULL en las borradas, y el único sobre ella. Así el índice restringe **solo** las filas
vivas, y las borradas quedan exentas porque dos NULL nunca son iguales — exactamente la propiedad
que arruina el `UNIQUE (a, b, deleted_at)` se usa aquí a favor:

```sql
ALTER TABLE product_category
  ADD COLUMN live tinyint GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL;
ALTER TABLE product_category
  ADD UNIQUE INDEX UQ_product_category_live (product_id, category_id, live);
```

Lo que lo hace mejor que el único plano no es el SQL, es que **no exige tocar el código de
escritura**: re-vincular algo que se quitó antes sigue siendo un `INSERT` normal y no choca con la
fila borrada. Un `UNIQUE (product_id, category_id)` plano sí obliga a cambiar el camino de
escritura — `restore()` de la fila existente o `INSERT ... ON DUPLICATE KEY UPDATE
deleted_at = NULL`, nunca un insert a ciegas — y si ese cambio no está desplegado **antes** de que
corra la migración, el re-vinculado falla en silencio: la excepción se la traga el `catch` de turno
y el dato simplemente no aparece. Esa versión plana se escribió (PR #26 de `package-database`) y se
descartó por eso.

En sqlite el equivalente exacto es un índice parcial con el mismo predicado, útil para escribir el
test de esto sin MySQL:

```sql
CREATE UNIQUE INDEX UQ_product_category_live
  ON product_category (product_id, category_id) WHERE deleted_at IS NULL;
```

Dos cosas más que se pasan por alto al limpiar la tabla antes de crear el índice:

- con el único plano, el dedupe tiene que mirar **todas** las filas, soft-deleted incluidas: el
  índice las cuenta igual y una sola que sobreviva impide crearlo. Con la columna generada basta
  deduplicar las vivas, que es lo que hizo la migración que corrió;
- al elegir qué fila se conserva, **preferir una viva** (menor `id` con `deleted_at IS NULL`) y
  caer al menor `id` global sólo si no hay ninguna. Conservar la soft-deleted y borrar la viva hace
  desaparecer el dato de la aplicación en silencio, sin error en ninguna parte.

# Lección hermana

Si además de las columnas del índice son nullable las columnas de la **pareja** (`product_id`,
`category_id` lo son aquí), hay un segundo NULL que muerde en el criterio de verificación y en el
propio dedupe:
[`null-en-count-distinct-y-en-indices-unicos-mysql.md`](null-en-count-distinct-y-en-indices-unicos-mysql.md).
Frenó la creación del índice en QA con la tabla ya limpia.

# De dónde salió

Plan de `product_category` duplicada, 23/10/2026
([handoff](../handoff/2026-10-23-plan-product-category-duplicada.md)). La opción del índice con
`deleted_at` estaba escrita en el propio plan como alternativa válida; se descartó al mirar el
esquema real antes de escribir la migración.
