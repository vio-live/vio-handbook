---
title: El límite de "stop" de una base Azure depende del motor (PG 7 días, MySQL 30)
last-updated: 2026-09-25
---

## Síntoma
Apagamos `pg-api-vio-production` (PostgreSQL Flexible Server) el 2026-09-16 para ahorrar y anotamos
"se enciende sola hacia el 2026-10-16, a los 30 días". El 2026-09-23 arrancó sola y el 24/09 ya
aparecía facturando ~53 NOK/día (~$170/mes) en Cost Management, con las Container Apps que la usan
todavía en `Stopped`: una semana pagando una base que nadie consultaba.

## Causa real
El límite de tiempo en estado detenido **no es el mismo en todos los motores de Azure Database**:

- **PostgreSQL Flexible Server: 7 días.** Pasados los 7 días Azure la arranca automáticamente.
- **MySQL Flexible Server: 30 días.**

Asumimos el número de MySQL para la PG. El auto-start no manda aviso ni deja rastro visible en
`az monitor activity-log list` del resource group, así que pasa desapercibido: lo único que lo delata
es el salto en el costo diario del recurso.

## Cómo se arregla / evita
- Apagar una base Azure para ahorrar **no es una acción de una sola vez**: hay que dejar un
  recordatorio antes del límite del motor (6 días para PG, 29 para MySQL) para volver a apagarla,
  o aceptar que no es una solución durable.
- Verificar el estado con `az postgres flexible-server show -g <rg> -n <name> --query state`
  (`Ready` = encendida y facturando; no confiar en lo anotado).
- Si el ahorro tiene que ser permanente y las apps que la usan están apagadas, lo correcto es
  borrarla con backup o bajarla de tier, no dejarla en `Stopped`.
- Al anotar "se enciende sola el <fecha>", escribir también **de qué motor es el límite**, para que
  el número se pueda verificar en vez de heredarse.
