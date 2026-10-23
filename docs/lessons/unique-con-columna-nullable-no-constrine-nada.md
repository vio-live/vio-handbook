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

El índice va **plano**, sobre las columnas que de verdad definen la unicidad:

```sql
ALTER TABLE product_category ADD UNIQUE (product_id, category_id);
```

Eso traslada el problema al código de escritura, y ahí es donde hay que resolverlo: al re-vincular
algo que se quitó antes, **no se inserta** — se recupera la fila existente (aunque esté
soft-deleted) y se hace `restore()`, o `INSERT ... ON DUPLICATE KEY UPDATE deleted_at = NULL`.

Dos cosas más que se pasan por alto al limpiar la tabla antes de crear el índice:

- el dedupe tiene que mirar **todas** las filas, soft-deleted incluidas (`withDeleted`). El índice
  único las cuenta igual: una sola que sobreviva impide crearlo;
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
