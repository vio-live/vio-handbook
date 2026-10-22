---
title: Un script de migracion que consulta una columna inexistente se cae a medias
last-updated: 2026-10-22
---

## Sintoma

Un script de migracion a mano (`m-brand-policy-urls-qa.js`, 22/10) aplicaba el `ALTER` y la fila de
`migrations`, y acto seguido moria con `Unknown column 'email' in 'field list'` y `exit 1`.
El `ALTER` queda aplicado, la migracion marcada como corrida, y la **parte de datos sin hacer**:
el script "fallo", pero no se puede volver a confiar en su salida para saber que quedo hecho.

## Causa real

La tabla `user` de Commerce **no tiene columna `email`** — el correo vive en Firebase, no en la base.
El script la usaba solo para imprimir de quien era la marca, un paso de verificacion, no de trabajo.
Un paso cosmetico puesto **despues** de los pasos con efecto.

## Como se arregla / evita

- **Las comprobaciones de identidad van primero, antes del primer `ALTER` o `INSERT`.** Si el script
  se cae ahi, no dejo nada a medias.
- Antes de correr un script ajeno: `SELECT COLUMN_NAME FROM information_schema.columns` de cada
  tabla que toque, y comprobar que **todas** las columnas que lee existen. Es una consulta y ahorra
  un estado intermedio.
- Para identificar una marca en Commerce: `username`, `brand_name` y `organization_number`
  (el org se puede cruzar con Vipps). **No** `email`.
- Si el script tiene variante de prod, el fallo esta en las dos: corregir las dos en la misma pasada
  o se cae igual el dia del release.

## Relacionado

- `docs/journal/2026-10/2026-10-22-migracion-brand-policy-urls-qa.md`
- `docs/lessons/env-del-pod-se-llama-distinto-en-prod-y-qa.md` (el `.env` vs `.env.local` del pod de
  users: el mismo script, dos rutas)
