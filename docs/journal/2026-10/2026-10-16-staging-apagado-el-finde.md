---
date: 2026-10-16
session: "Apagar staging el fin de semana"
participants: [angelo, miguel]
status: live
---

# Staging apagado el fin de semana del 17-18/10

Angelo, 17:18 OSL: *"programa para apagar staging este finde hoy a las 22.00 hasta el lunes 9 am"*.

## Programado
Dos crons de **un solo disparo**, los dos con `--delete-after-run` (se borran al correr):

| | cuando | que hace |
|---|---|---|
| `staging-off-finde-20261016` | **vie 16/10 22:00 Oslo** (20:00Z) | para el cluster y luego la base |
| `staging-on-lunes-20261019` | **lun 19/10 09:00 Oslo** (07:00Z) | arranca la base y luego el cluster |

Ambos avisan por Discord con el resultado.

## Hallazgo: no habia nada apagando staging
Los crons `qa-cluster-start` y `qa-cluster-stop` estan **deshabilitados** desde hace tiempo, y
apuntaban al cluster **viejo de Noruega** (`-g qa -n kubernetesqa`), que ya no existe. Fallaban con
`All models failed`. **Staging llevaba encendido en continuo**, no en el ciclo lun-vie 08:00-01:00
que estaba anotado. Lo apuntado estaba desactualizado desde la mudanza.

## Por que un script y un cron tipo `command`
El cron viejo era `agentTurn` con `toolsAllow` y moria con
`CLI backend claude-cli cannot enforce runtime toolsAllow`. **En este Gateway solo ejecuta fiable
el payload `kind: command`**, y ese **no se puede crear con el tool de cron** (su esquema solo
admite `systemEvent` y `agentTurn`): hay que usar `openclaw cron add --command`.

Script: `docs/playbooks/scripts/staging-power.sh` (`stop` | `start`), tambien en el workspace.

## Detalles que importan del script
- **Orden**: al apagar, primero el cluster y luego la base (si cae la base antes, los pods llenan
  el log de errores). Al encender, al reves: la base primero.
- **Idempotente**: si algo ya esta en el estado pedido, no lo toca.
- **No se fia del exit code de `az`**: vuelve a consultar al final y solo devuelve 0 si el estado
  real es el pedido. Si no, sale con 1 y lo dice.
- Deja traza en `monitoring/staging-power.log`.

## Comprobado antes de dejarlo programado
Ejecutado tal como lo lanzara el cron (`sh -lc`): `az` esta en el PATH, la sesion de Azure
responde, las dos consultas de estado devuelven `Running` y `Ready` con los nombres correctos
(`rg-vio-qa-sc`/`kubernetesqa-sc` y `vio-ecom-db-staging-sc`), y el fichero de log es escribible.

## Para la proxima
Si se quiere volver al ciclo diario, **no reactivar los crons viejos**: apuntan a Noruega. Rehacer
con este script y `openclaw cron add --command --cron "..." --tz Europe/Oslo`.
