---
title: "Runbook — migración FeedRunHistory (product_feed_run + product.absent_runs)"
date: 2026-09-03
status: live
owner: miguel (infra)
author: claude
---

# Migración `1789000000000-FeedRunHistory`

Para Miguel. Angelo pidió **estar muy seguros** con esta migración; este runbook
existe para eso. Sigue el procedimiento que ya usa el repo (`.env.migrations.example`
+ `yarn migration:execute`), con una diferencia: **se corre pinneada a este único
archivo**, no "todas las pendientes".

## Qué hace — y qué no

**Solo agrega.** No modifica ni borra ninguna fila existente.

```sql
ALTER TABLE `product` ADD `absent_runs` int NOT NULL DEFAULT 0;
CREATE TABLE `product_feed_run` ( … )  -- historial de corridas de feed
ALTER TABLE `product_feed_run` ADD CONSTRAINT `FK_product_feed_run_feed`
  FOREIGN KEY (`feed_id`) REFERENCES `product_feed`(`id`) ON DELETE CASCADE;
```

- `absent_runs`: contador por producto de corridas seguidas sin aparecer en el
  feed. Default 0, así que ninguna fila cambia de comportamiento hasta que el
  sync nuevo empiece a escribirlo.
- `product_feed_run`: tabla nueva, vacía al crearse. Índice en
  `(feed_id, started_at)`, que es la única query del historial.

**`down()` borra exactamente lo que `up()` crea**: la FK, la tabla, la columna.
Revertible sin pérdida mientras nadie haya escrito en `product_feed_run` — y aun
entonces, lo que se pierde es historial, no productos.

Archivo: `package-database/src/migrations/1789000000000-FeedRunHistory.ts`, en
`develop` (merge `dfc3b23`).

## Orden respecto a los deploys

```
1. esta migración en staging        ← Miguel
2. verificar (abajo)
3. publicar @vio-/database 1.0.246   ← quien tenga credenciales del registro (Alan)
4. mergear/desplegar products        ← claude, recién cuando exista 1.0.246
5. esta migración en prod            ← Miguel
6. desplegar products a prod
```

Products **no compila** sin el paquete publicado (importa `Entity.ProductFeedRun`),
así que el orden 1→3→4 no es opcional. Y products **degrada bien** si la tabla
faltara — captura y sigue — pero no tiene sentido desplegarlo sin ella.

## Cómo correrla — pinneada

En un checkout de `package-database` en `develop`:

```bash
cp .env.migrations.example .env
# completar TYPEORM_HOST / TYPEORM_PASSWORD del entorno (staging primero)
```

Correr **solo esta** migración. `DB_MIGRATION_FILE` restringe el glob de
`config/connect.ts` a un archivo; sin él correría todas las pendientes:

```bash
DB_MIGRATION_FILE=1789000000000-FeedRunHistory.ts yarn migration:execute
```

`PROCESS_ENV=development` (como en el ejemplo) resuelve desde `src/`, por eso el
`.ts`. La salida muestra `pendindMigrations: true` y luego el SQL ejecutado.

## Verificar antes de dar por buena

```sql
SHOW CREATE TABLE product_feed_run;                 -- existe, con el índice y la FK
SHOW COLUMNS FROM product LIKE 'absent_runs';        -- int, NOT NULL, default 0
SELECT COUNT(*) FROM product WHERE absent_runs <> 0; -- 0
SELECT * FROM migrations ORDER BY id DESC LIMIT 1;   -- FeedRunHistory1789000000000
```

## Revertir

```bash
yarn migration:revert
```

Revierte la **última** aplicada (TypeORM CLI, mismo `.env`). Confirmar antes en
la tabla `migrations` que la última es `FeedRunHistory1789000000000`, para no
revertir otra.

## Contexto

Por qué existe: [`journal/2026-09/2026-09-03-feed-sync-improvements.md`](../journal/2026-09/2026-09-03-feed-sync-improvements.md).
Migraciones en este repo son manuales por decisión (Alan, 2026-09-01): validar el
SQL, no perder datos, y republicar el paquete después. Este runbook respeta eso.
