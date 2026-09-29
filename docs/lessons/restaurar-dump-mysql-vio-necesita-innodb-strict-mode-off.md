---
title: Un dump de la DB de Vio no se restaura sin apagar innodb_strict_mode
last-updated: 2026-09-29
---

## Síntoma
Restaurar un `mysqldump` de `outshifter` en un MySQL 8.0 limpio aborta con:

```
ERROR 1118 (42000) at line 3875: Row size too large (> 8126).
Changing some columns to TEXT or BLOB may help.
```

Lo peligroso no es el error: es que **si se restaura con `--force` o sin mirar la salida, el
proceso termina con código 0 y deja la base a medias**. En la prueba real quedaron
**106 de 119 tablas** y nada lo avisó.

## Causa real
La tabla `user` tiene **69 columnas, 44 de ellas `VARCHAR(>=255)` en utf8mb4**. En utf8mb4 cada
carácter puede ocupar 4 bytes, así que al recrear la tabla la fila potencial supera el límite de
InnoDB (8126 bytes con page size de 16 KB).

No es diferencia de entorno: origen y destino tenían el mismo `innodb_page_size` (16384),
el mismo `innodb_default_row_format` (dynamic) y el mismo `innodb_strict_mode` (1). El servidor
de Azure tolera la tabla porque ya existe; **recrearla desde cero es lo que falla**.

## Cómo se arregla
```sql
SET GLOBAL innodb_strict_mode=0;
```
y después restaurar normalmente:
```bash
gunzip -c dump.sql.gz | mysql -u <user> -p
```
Con eso el límite pasa a ser advertencia y entran las 119 tablas.

## Cómo se evita
**Contar las tablas y las filas después de restaurar, siempre.** Un archivo que nadie restauró
no es un respaldo, es un archivo. La verificación que sirve es:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='outshifter';  -- debe dar 119
```
y comparar el total de filas contra el origen (al 2026-09-29: **374.751**).
