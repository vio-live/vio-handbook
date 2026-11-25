---
date: 2026-11-25
session: analytics — el panel falla a ratos porque las lecturas saturan la VM de ClickHouse
participants: [angelo, claude]
status: live
---

# Analytics: «unavailable» a ratos con el colector sano

## Goal

Angelo ve fallar analytics otra vez la tarde del 25/11, ya restaurada la VM de ClickHouse
([entrada de la caída](2026-11-25-clickhouse-caida-fin-prueba-oracle.md)). Averiguar qué pasa.

## Done

- **No es una caída.** `events.vio.live/health` en `ok`, `lastError: null`, `dropped 0`, escrituras al día. Lo
  que falla son **lecturas** del panel, y solo cuando coinciden varias cargas.
- **Qué se ve en `system.query_log`** (VM `vio-analytics-ch`, 2 vCPU, las mismas que antes de la caída):
  - Las lecturas pesadas son SQL de **~40.000 caracteres** (60 subconsultas; el filtro de navegadores internos
    se repite 27 veces y la compensación de cancelaciones va anidada en cada una). Cada una gasta **1,1–1,6 s de
    CPU**, lea las filas que lea: `EXPLAIN PLAN` solo, sin ejecutar, tarda lo mismo que la consulta entera
    (1,07 s). El coste es planificar el SQL, no leer datos (la tabla tiene 38.000 filas).
  - Una carga del panel de prod son ~18 consultas ≈ 16 s de CPU: sola ya ocupa las 2 vCPU unos 8 s.
  - El panel de **QA** (`vio_staging`, colector `129.151.196.99`) comparte la máquina. Con el rango «hoy» y sus
    5 superficies (apps 3, 13, 15, 16, 21) lanzó ráfagas de 100–125 consultas por minuto a las 16:54, 18:10,
    20:21 y 20:51 UTC: 105–112 s de CPU pedidos por minuto contra 120 disponibles.
  - Cuando coinciden, las consultas esperan CPU (7,5 s de espera por 1,6 s de trabajo) y pasan del límite de
    15 s del colector (`max_execution_time`): **47 lecturas cortadas hoy**, 22 de ellas de prod (16:54–16:55 y
    20:21 UTC). Además, las que tardan 10–15 s sin ser cortadas ya superan el tope de 10 s de
    `socket-server/server/analytics-proxy.ts` y rozan el de 15 s de base-api: de ahí el «analytics collector
    unreachable».
  - No es nuevo de la restauración: el 16/11 pasó lo mismo (473 lecturas pesadas, p95 11,8 s).
- **Descartado un ajuste del servidor:** con el analizador viejo (`allow_experimental_analyzer=0`) baja de 1,08
  a ~0,76 s, y ninguna otra opción del planificador probada cambia nada. No compensa el riesgo.
- El colector no tiene caché de lecturas ni tope de lecturas simultáneas (`src/stats.ts`, `makeStatsQuerier`).

## Decisions

- Pendiente de Angelo: subir la VM a 2 OCPU (4 vCPU) como alivio inmediato, y arreglo en el colector (caché
  corta + una sola lectura en vuelo por petición idéntica + tope de simultáneas).

## Blockers

- Ninguno técnico; faltan las dos decisiones.

## Next session

- Si se aprueba: redimensionar la VM (reinicio de ~2 min; el colector retiene los eventos en memoria) y rama
  en `vio-analytics` con el arreglo.
- A fondo: que el SQL no repita el filtro de internos ni la compensación en cada subconsulta.
- No sé quién tenía abierto el panel de QA a esas horas; desde ClickHouse solo se ve el colector de origen.
