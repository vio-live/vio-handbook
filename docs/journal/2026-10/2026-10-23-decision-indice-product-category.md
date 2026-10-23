---
title: "Decidida la forma del índice único de product_category (P2)"
last-updated: 2026-10-23
---

## Resuelta la decisión que bloqueaba P2 del plan de `product_category` — Miguel

- Quién: Miguel. La sesión que escribe la migración (P2) se había parado a pedir luz verde; la
  resolví yo midiendo, sin que Angelo tuviera que adjudicar.
- Dónde: producción, base `outshifter` del MySQL de Sweden Central. Consultas de **sólo lectura**
  desde el pod `users-86b6d95f5b-9s49g` con su `mysql2`. Repo afectado: `package-database` (la
  migración todavía no está escrita).
- Cuándo: 23/10/2026, 22:05 Oslo.
- Contexto: el plan ofrecía dos caminos para el índice único y pedía elegir con criterio. Uno de
  los dos, el que parecía más conservador (`UNIQUE (product_id, category_id, deleted_at)`, para no
  romper el re-añadido de una categoría quitada), **no sirve**: en MySQL dos NULL no se comparan
  iguales dentro de un índice único, y `deleted_at` es `datetime(6)` nullable. Habría dejado el bug
  abierto después de limpiar la tabla.

### Hecho

- Esquema real medido: `id` int PK, `created_at`/`updated_at` NOT NULL, `deleted_at` datetime(6)
  NULL, `product_id` int NULL, `category_id` int NULL. Índices existentes: sólo `PRIMARY` y los dos
  de FK. Ningún único.
- Estado medido: **268.748 filas**, **5.871 pares** `(product_id, category_id)`, **262.877
  sobrantes**, **188 pares duplicados**. **0 filas soft-deleted**, **0 con `product_id` o
  `category_id` en NULL**, **0 pares que mezclen fila viva y soft-deleted**.
- **Corrección a mi propio plan:** decía «132 filas para 1 sola categoría». Es falso — el peor par
  tiene **13.671 filas**. Corregido en el handoff.
- Decisión: **`UNIQUE (product_id, category_id)` plano**. El borrado lógico se queda, así que no hay
  cambio de comportamiento que discutir con Angelo. La condición se traslada a P1: al re-vincular
  una categoría hay que hacer `restore()` de la fila existente, nunca un `insert` a ciegas.
- Requisitos que le pasé a quien escribe la migración: dedupe sobre **todas** las filas
  (soft-deleted incluidas), preferir conservar la **fila viva** de cada par, borrado **por lotes**
  e idempotente, y `down()` que diga explícitamente que las filas borradas no vuelven.
- Actualizado el handoff del plan con la decisión, el esquema y las cifras nuevas.
- Lección nueva:
  [`unique-con-columna-nullable-no-constrine-nada`](../../lessons/unique-con-columna-nullable-no-constrine-nada.md).

### Pendiente

- La migración no está escrita todavía.
- **No corre en ningún entorno hasta que P1 esté desplegado ahí.** El orden de despliegue y la
  ventana de prod los llevo yo; en prod nada antes del lunes 26 por la congelación del go-live.
- En QA no he medido si hay filas soft-deleted o pares mixtos. No asumir que es como prod.
- Corregido de paso un dato de reparto que viajaba mal en los mensajes: P1 no la lleva jhondev.
  Angelo decidió a las 20:40 que P1, P2 y P3 las lleva `claude`.
