---
date: 2026-10-20
session: staging-apagado-manual-y-arranque-0830
participants: [angelo, miguel]
status: live
---

# Staging apagado a mano y el arranque movido a las 08:30

Angelo (19/10 23:59): *«Apagas staging y lo levantas a las 8.30?»*.

- **Quién:** Miguel. **Cuándo:** 2026-10-20 ~00:05 CEST (19/10 22:05 UTC).
- **Dónde:** `rg-vio-qa-sc` — clúster `kubernetesqa-sc` y MySQL `vio-ecom-db-staging-sc`.

## Antes de apagar

Comprobado que no había nada a medias, que es lo que convierte un apagado en un problema:
**0 runs de CI/CD en vuelo** en los 16 repos del programa y **los 14 deployments de QA estables**
(ninguno por debajo de sus réplicas). Si hubiera habido un deploy corriendo, el apagado lo habría
dejado con el `helm upgrade` a medias.

## Hecho

- `az aks stop` de `kubernetesqa-sc` → **`Stopped` / `Succeeded`**.
- `az mysql flexible-server stop` de `vio-ecom-db-staging-sc` → **`Stopped`**.
  Azure avisa de que **se reenciende solo a los 30 días** si nadie la arranca: con el scheduler
  diario no aplica, pero queda dicho.
- **Arranque movido de 08:00 a 08:30.** Los horarios los llevan cuatro Container Apps Jobs en
  `rg-vio-qa-sc`, y **sus crons van en UTC**:

| Job | Cron (UTC) | Hora Oslo |
|---|---|---|
| `job-qa-sc-mysql-start` | `25 6 * * 1-5` | **08:25** (antes 07:55) |
| `job-qa-sc-aks-start` | `30 6 * * 1-5` | **08:30** (antes 08:00) |
| `job-qa-sc-aks-stop` | `0 23 * * 1-5` | 01:00 — sin tocar |
| `job-qa-sc-mysql-stop` | `15 23 * * 1-5` | 01:15 — sin tocar |

La base se mantiene **5 minutos por delante** del clúster a propósito: si los micros arrancan antes
que la MySQL, fallan al conectar y hay que recrear pods a mano.

## Dos cosas que conviene saber

- **El cambio es al horario recurrente, no de una sola noche.** Angelo pidió «lo levantas a las
  8.30» y la vía limpia era mover el cron; a partir de ahora staging arranca a las 08:30 de lunes a
  viernes. Para volver a las 08:00:
  `az containerapp job update -g rg-vio-qa-sc -n job-qa-sc-mysql-start --cron-expression "55 5 * * 1-5"`
  y el de `aks-start` a `"0 6 * * 1-5"`.
- **Los jobs de parada van a dispararse esta noche a la 01:00 y 01:15 contra algo ya parado.**
  Un `az aks stop` sobre un clúster `Stopped` puede devolver error y dejar el job en rojo. **No es
  una avería**: es el reverso de lo que ya teníamos anotado para el arranque (un `start` sobre algo
  ya `Running` tampoco es un fallo). Si aparece un job rojo de madrugada, es esto.
