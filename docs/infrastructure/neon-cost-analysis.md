---
title: "Neon — análisis de costo + alternativas"
last-updated: 2026-05-28
owner: miguel
status: live
---

# Neon — análisis de costo + alternativas

> Análisis hecho 2026-05-28 con la Neon API (key project-scoped en `socket-server/.env`). Decisión pendiente — territorio de infra (Miguel). Angelo levantó la pregunta "¿conviene sacar Neon?".

## TL;DR

El costo de Neon en nuestro caso es **compute, no storage ni cantidad de branches**. El driver es la branch `develop` corriendo casi 24/7 porque `api-dev.vio.live` + los backends locales del equipo la golpean constantemente y nunca llega a estar 5 min idle (nunca suspende).

**Sacar Neon es técnicamente viable y replica el flow**, pero a nuestra escala (DB de 0.12 GB) el ahorro es marginal (~$6/mes en este project) y perdés el branching. La optimización que mueve la aguja de verdad es **dejar que `develop` suspenda off-hours**, lo cual es gratis y mantiene Neon.

## Números reales (período 2026-05-01 → 2026-06-01, medido el 28)

Project: `silent-recipe-32135926` (pg17, azure-eastus2, creado 2026-03-16).

| Métrica | Valor | Lectura |
|---|---|---|
| `compute_time` (CU-horas) | **213 CU-h** | Métrica facturable. Probablemente plan Launch (~$19/mes, incluye 300 CU-h). |
| `active_time` | **696.7 h** | ~1.04 computes activos en promedio TODO el tiempo → un compute prácticamente siempre encendido. |
| `synthetic_storage_size` | **0.12 GB** | Trivial. 12 branches × ~0.034 GB. No roza ningún límite. |
| Branches totales | **12** | Pero las idle no cobran compute. |
| Computes (endpoints) | **9** | Todos con suspend a 5 min (default). Solo `develop` activo al momento de medir. |

## Por qué `develop` es el 90% del costo

`develop` es la DB de dev compartida. `api-dev.vio.live` (el backend dev desplegado) + los backends locales del equipo le pegan constantemente, así que su compute **nunca alcanza 5 min idle → nunca suspende → corre 24/7**.

A 0.25 CU mínimo × ~744 h/mes ≈ 186 CU-h de baseline, + spikes de autoscaling hasta 2 CU = los 213 CU-h medidos. Ese es el grueso de la factura de este project.

## Qué da Neon y qué se desperdicia en nuestro caso

| Ventaja Neon | ¿Aplica a nosotros? |
|---|---|
| **Branching instantáneo** (copy-on-write) | Sí, pero a 0.12 GB un `pg_dump \| pg_restore` tarda segundos igual. La ventaja killer (copiar 100s de GB en segundos) no aplica a nuestra escala. |
| **Scale-to-zero** | **Desperdiciada** en `develop` (always-on). Pagás serverless a precio de servidor fijo. Sí aplica a las branches idle. |
| **Autoscaling** 0.25→2 CU | Aprovechada en spikes. |
| **Zero-ops** (backups, PITR managed) | Aprovechada. Es lo que más seguís ganando. |

## ¿Se puede sacar y tener el mismo flow? Sí.

| Pieza | Neon hoy | Alternativa sin Neon |
|---|---|---|
| DB dev compartida | branch `develop` always-on | Azure Postgres Flexible Server (ya hay footprint Azure) |
| DB local por dev | branch `local/angelo-*` | Postgres en Docker local (gratis, aislado, instantáneo) |
| Branching pre-migración | branch `backup/pre-promote-*` | `pg_dump` antes de migrar (segundos a 0.12 GB) |
| staging / production | branches | databases separadas en la misma Flexible Server, o instancias dedicadas |

El flow se replica sin perder capacidad funcional. Lo que se pierde: branching instantáneo + zero-ops/PITR.

## La matemática del costo (por qué NO es dramático)

- Neon Launch ≈ **$19/mes** base (213 CU-h cae dentro del allowance de 300 CU-h).
- Azure Postgres Flexible **B1ms** always-on ≈ **$13/mes** flat + storage despreciable.
- **Migrar este project ahorra ~$6/mes.** Marginal. El branching vale más que eso en velocidad de dev (seguridad en migraciones, dev aislado).

**Insight clave**: Neon es óptimo en costo cuando la DB está mayormente idle (scale-to-zero ahorra). Cuando está always-on (como `develop`), un instance flat-rate sale más barato — pero la diferencia a nuestra escala es chica.

## Las palancas que SÍ mueven la aguja

1. **Suspender `develop` off-hours** — escalar a 0 el deploy de `api-dev` de noche/finde → `develop` deja de recibir tráfico → suspende → dejás de pagar compute esas horas. Si suspende ~10 h/día = **~40% menos compute**. Gratis, mantenés Neon. **Esta es la optimización real.**
2. **Bajar `develop` max CU de 2 → 1** — si rara vez necesita 2 CU, capás los spikes (1 API call).
3. **¿Hay más projects Neon en la org?** La API key es **project-scoped a `silent-recipe-32135926`** — no se ven otros projects desde ahí. **Si la org tiene 3-4 projects Neon, la factura los suma** y ahí consolidar/rip-out sí tiene sentido. Verificar en la consola Neon (billing).

## Branches stale candidatas a borrar (hygiene, ahorro ~$0)

Borrarlas no baja la factura (idle no cobran) pero limpia el project:

| Branch | Last active | Razón |
|---|---|---|
| `local/angelo-20260423-1814` | 2026-05-06 | Superseded por `local/angelo-20260512-2214` |
| `feature/placements-v2-20260423-1250` | 2026-04-24 | Feature vieja |
| `test/tv-subscribe-validation` | 2026-04-23 | Test branch |
| `backup/develop-pre-phase1-20260423-0131` | sin compute | Backup viejo |
| `backup/develop-pre-promote-20260427-1435` | sin compute | Backup viejo |
| `backup/develop-pre-promote-20260429-1550` | sin compute | Backup viejo |

Conservar: `production`, `develop`, `staging`, `dev/alan`, `dev/jhondev`, `local/angelo-20260512-2214`.

## Preguntas abiertas para Miguel

1. **¿Cuántos projects Neon tiene la org en total?** (la key project-scoped no deja verlo — es la variable que más cambia el cálculo)
2. **¿`api-dev` puede escalar a 0 off-hours?** Es la palanca #1 de ahorro sin sacar Neon.
3. **¿Qué plan Neon estamos pagando exactamente?** (Free con throttle / Launch / Scale) — define si 213 CU-h ya genera overage.

## Recomendación

**No rip-out por este project solo** — $6/mes no justifica perder branching + zero-ops + el esfuerzo de migración. Antes de cualquier decisión:
1. Verificar en consola si hay más projects sumando a la factura.
2. Probar suspender `develop` off-hours (gratis, reversible, ~40% menos compute).

Si después de eso el costo sigue siendo un problema y hay capacidad Azure, consolidar a Flexible Server es viable — pero es decisión + ejecución de Miguel porque toca el footprint Azure.

## Nota de mantenimiento

El `## Database — Neon Postgres` de [`infrastructure/overview.md`](./overview.md) está **desactualizado** (lista 4 branches, hay 12; endpoints viejos). Refrescar esa tabla en algún momento — no es parte de este análisis pero se notó al hacerlo.
