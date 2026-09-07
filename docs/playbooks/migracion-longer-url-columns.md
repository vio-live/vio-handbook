---
title: "Runbook — migración 1788500000000-LongerUrlColumns (pendiente en prod)"
last-updated: 2026-09-07
owner: angelo
status: live
---

# Migración `1788500000000-LongerUrlColumns`

Procedimiento general: [`commerce-db-migrations.md`](./commerce-db-migrations.md).
Quién puede correrla: Angelo o Miguel (infra) — no depende de Alan.

**Estado (2026-09-07): aplicada y verificada en staging/development. Falta
PROD.** La verificación de staging fue reimportar el feed de Bohus y ver
entrar las imágenes completas.

## Qué hace — y qué no

```sql
ALTER TABLE `image`   MODIFY `url`        varchar(2048) NOT NULL;
ALTER TABLE `product` MODIFY `origin_url` varchar(2048) NULL;
```

Amplía. No transforma datos, no agrega ni borra columnas, no toca índices
(verificado en su momento: ninguna de las dos está indexada — con índice,
2048 en utf8mb4 son 8192 bytes y habría chocado con el límite de InnoDB).

**Por qué importa**: el feed de Bohus tiene 8 de 16 imágenes con URLs de más
de 255 caracteres (la más larga, 316) porque la URL incluye la ruta del PIM
con el nombre del producto URL-encodeado. Con `varchar(255)` esos productos
**se pierden en silencio**. El de Kondomeriet no pasa de 113 — por eso el
problema no se vio antes.

## ⚠️ En qué se diferencia de las otras migraciones recientes

`FeedRunHistory` y `walley-channel-toggle` son **aditivas** (tabla nueva,
columna con default): corren en segundos y no molestan a nadie. Esta es un
`MODIFY` sobre tablas existentes: **MySQL reconstruye la tabla**. Sobre una
`image` grande puede tardar y **bloquear escrituras** mientras corre.

→ Correrla en **ventana de baja carga**, y usar el tiempo que tardó en
staging como estimación.

## Chequeo previo — no saltearlo

El playbook lo dice y acá aplica con fuerza: **el estado de prod es
independiente del de staging**. En la sincronización del 3-sep, 49
migraciones se marcaron como aplicadas sin ejecutar DDL (*fake-mark*) porque
el schema real ya las tenía. Si en prod pasara lo contrario —registro
presente, columna sin ampliar— la migración figuraría como corrida y el bug
seguiría vivo e invisible.

```sql
-- 1. ¿Qué dice el schema REAL?
SHOW COLUMNS FROM image   LIKE 'url';          -- varchar(255) → falta correrla
SHOW COLUMNS FROM product LIKE 'origin_url';

-- 2. ¿Qué dice el tracking?
SELECT * FROM migrations WHERE name LIKE '%LongerUrlColumns%';
```

- Columna en 255 **y** sin registro → correr normal (abajo).
- Columna en 255 **con** registro → está *fake-marked*: correr el `ALTER` a
  mano (el CLI la saltearía por creerla aplicada) y **auditar las otras 48**,
  porque sería síntoma de un problema mayor.
- Columna ya en 2048 → nada que hacer, solo confirmar el registro.

## Orden respecto a los deploys

Ninguno que respetar: **prod ya corre el código que espera 2048**
(`@vio-/database` 1.0.258 incluye la entidad ampliada desde 1.0.244). O sea
el orden natural —migración antes del deploy— ya se invirtió; hoy prod tiene
la entidad y le falta la columna. La migración va sola, cuando haya ventana.

## Cómo correrla — pinneada

En un checkout de `package-database` en `develop`:

```bash
cp .env.migrations.example .env
# completar TYPEORM_HOST / TYPEORM_PASSWORD de PROD
```

```bash
DB_MIGRATION_FILE=1788500000000-LongerUrlColumns.ts yarn migration:execute
```

`DB_MIGRATION_FILE` restringe el glob de `config/connect.ts` a un archivo;
sin él correría todas las pendientes. `PROCESS_ENV=development` (como en el
example) resuelve desde `src/`, por eso el `.ts`. El `.env.migrations.example`
ya trae `TYPEORM_DRIVER_EXTRA` — **no** `TYPEORM_SSL`, que TypeORM 0.2.41 no
lee y deja la conexión sin SSL (Azure MySQL la rechaza).

## Verificar antes de dar por buena

```sql
SHOW COLUMNS FROM image   LIKE 'url';         -- varchar(2048), NOT NULL
SHOW COLUMNS FROM product LIKE 'origin_url';  -- varchar(2048), NULL
SELECT * FROM migrations WHERE name LIKE '%LongerUrlColumns%';
```

Y la verificación de verdad, la misma que se usó en staging: **reimportar el
feed de Bohus en prod** y confirmar que entran los 16 productos con imagen
(antes entraban 8).

## Revertir

**No revertir sin limpiar antes.** El `down()` vuelve a `varchar(255)`: en
modo estricto el `ALTER` falla, y si no, **trunca** cualquier URL de más de
255 caracteres — justo las que esta migración vino a permitir.

Si hubiera que bajarla: primero `SELECT` de las filas con `LENGTH(url) > 255`
y decidir qué hacer con ellas; recién después `yarn migration:revert`
(revierte la **última** aplicada — confirmar en `migrations` que es esta).

## Contexto

Por qué existe: [`journal/2026-09/2026-09-01-feed-url-columns.md`](../journal/2026-09/2026-09-01-feed-url-columns.md).
Handoff del feed y el resto de los pendientes: [`handoff/google-merchant-feed.md`](../handoff/google-merchant-feed.md).
