---
title: Un dump hecho con pg_dump 17 no restaura en PostgreSQL 16 — y la validación estructural no lo detecta
last-updated: 2026-09-25
---

## Síntoma
Antes de borrar `pg-api-vio-production` sacamos el respaldo final con la imagen `postgres:17-alpine`
contra un servidor **16.15**. El dump parecía perfecto:

- `gzip -t` correcto
- 318 KB, 4210 líneas
- 39 `CREATE TABLE` y 39 bloques `COPY`
- terminaba con el marcador de cierre de pg_dump, o sea no estaba truncado

Al restaurarlo de verdad, falló en la línea 13:

    psql:/tmp/d.sql:13: ERROR:  unrecognized configuration parameter

## Causa real
pg_dump 17 escribe en el preámbulo `SET transaction_timeout = 0;`, un parámetro que **se introdujo
en PostgreSQL 17 y no existe en 16**. Con `ON_ERROR_STOP=1` psql corta ahí y no restaura nada.

La trampa es que pg_dump *puede* leer un servidor más viejo sin quejarse — el dump se genera
correctamente y el propio archivo dice `Dumped from database version 16.15 / Dumped by pg_dump
version 17.11`. El problema aparece recién al restaurar, y sólo si el destino es 16.

Ninguna de las validaciones "de archivo" (integridad gzip, contar tablas, ver que el dump cierre
bien) detecta esto. Son necesarias pero no suficientes.

## Cómo se arregla / evita
- **Usar una versión de pg_dump igual a la del servidor.** Acá se rehizo con `postgres:16-alpine`
  (pg_dump 16.15 contra servidor 16.15) y restauró sin tocar nada.
- Si ya tenés un dump de 17 y el destino es 16, se puede quitar la línea:
  `grep -v '^SET transaction_timeout' dump.sql`. Preferible regenerarlo bien.
- **Un respaldo no está verificado hasta que se restauró.** El chequeo que vale es restaurar en una
  base nueva con `ON_ERROR_STOP=1` y comparar conteos contra el origen:

      psql "$ADMIN" -c 'CREATE DATABASE restoretest'
      psql -v ON_ERROR_STOP=1 -d restoretest -f dump.sql
      # comparar: cantidad de tablas y count(*) de las tablas principales
      psql "$ADMIN" -c 'DROP DATABASE restoretest'

  Si la base es privada (VNet), esto se puede correr como Container Apps Job dentro del mismo
  entorno, que ya tiene acceso de red — pero hay que hacerlo **antes** de borrar el entorno.
- Anotar en el README del respaldo con qué versión se generó y contra qué versión se validó.
