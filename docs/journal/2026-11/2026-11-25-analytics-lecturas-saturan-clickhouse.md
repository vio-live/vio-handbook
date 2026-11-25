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
    15 s del colector (`max_execution_time`): **45 lecturas cortadas hoy**, 22 de prod y 23 de QA (16:54–16:55 y
    20:21 UTC). Además, las que tardan 10–15 s sin ser cortadas ya superan el tope de 10 s de
    `socket-server/server/analytics-proxy.ts` y rozan el de 15 s de base-api: de ahí el «analytics collector
    unreachable».
  - No es nuevo de la restauración: el 16/11 pasó lo mismo (473 lecturas pesadas, p95 11,8 s).
- **Descartado un ajuste del servidor:** con el analizador viejo (`allow_experimental_analyzer=0`) baja de 1,08
  a ~0,76 s, y ninguna otra opción del planificador probada cambia nada. No compensa el riesgo.
- El colector no tiene caché de lecturas ni tope de lecturas simultáneas (`src/stats.ts`, `makeStatsQuerier`).
- **VM de ClickHouse a 2 OCPU (4 vCPU), 8 GB** (OK de Angelo, 21:05 UTC). Cambio de forma desde la consola
  (Angelo aprobó el inicio de sesión en su teléfono); la VM se reinició sola: última escritura 21:08:14, de
  vuelta a las 21:09:13, colector vaciado a las 21:09:57 (`inserted` 7033 → 7098, `dropped 0`). 92 eventos
  recibidos durante el reinicio están guardados, sin duplicados. Contenedores e `iptables` (`DOCKER-USER`)
  volvieron solos. Tres lecturas de prod a la vez: 0,7–1,5 s (antes 1,4–2,6 s).
- **PR [vio-live/vio-analytics#51](https://github.com/vio-live/vio-analytics/pull/51)**, rama
  `fix/lecturas-cache-y-tope`, commit `c3d993f` (subida con OK de Angelo, 21:20 UTC). **Mergeado a las 21:33
  UTC** con su OK: `a29de5f`, mismo árbol que el commit probado; el check `verify` del PR pasó antes del merge.
  **Sin desplegar**: los dos colectores siguen en `edee83d`. `src/stats-guard.ts` delante de todas las lecturas:
  respuesta reutilizada 30 s (`STATS_READ_CACHE_TTL_MS`), una sola ejecución por lectura idéntica en vuelo y
  tope de simultáneas (`STATS_MAX_CONCURRENT_READS`, 3) con cola; pasados 15 s de espera
  (`STATS_READ_QUEUE_MAX_WAIT_MS`) contesta el mismo 503 `read limit exceeded`. `/recent`, `/seen` y la búsqueda
  de la compra de una compensación van directas (`fresh`). `/health` gana `reads`. 512 pruebas en verde
  (17 nuevas; las 141 de ClickHouse contra un contenedor local), `tsc` y `biome` limpios.

## Decisions

- Angelo (21:05 UTC): subir la VM y preparar la rama del colector. (21:20 UTC): subir la rama, abrir el PR y
  subir el presupuesto de Oracle.
- Presupuesto `vio-backend-mensual`: de 500 a **800 SEK/mes** (los 500 salían de 1 OCPU). Los dos avisos (80 %
  de gasto real, 100 % de previsión) siguen, ahora sobre 800.
- El tope es por proceso y los dos entornos comparten la VM: producción `3`, staging `2`
  (`docs/DESPLIEGUE.md` de la rama).
- Las lecturas de «¿ha llegado ya?» no se guardan ni hacen cola: un panel puede ir 30 s por detrás, una
  verificación no.

## Blockers

- **Despliegue de `a29de5f` (OK de Angelo para staging y prod, 21:30 UTC): no puedo hacerlo yo.** Desde la
  laptop de Angelo no hay acceso SSH a las VMs del colector (`Permission denied (publickey)` en `129.151.196.99`
  y `82.70.54.151` con `vio_oracle_ch` y con `id_ed25519`); solo entra la llave de Miguel. Pasos para él en el
  handoff (`docs/handoff/2026-10-19-coordinacion-claude-miguel.md`, nota de las 21:40 UTC).

## Next session

- Desplegar `a29de5f`: staging con `STATS_MAX_CONCURRENT_READS=2`, repetir la carga
  del panel de QA en «hoy» y mirar `/health` → `reads` (que `shed` no crezca) y `system.query_log`.
- Coste real de la VM con 2 OCPU: mirar Cost Analysis en una semana (los ~55 USD/mes son precio de lista).
- La rama `feature/health-degraded-when-writes-stall` toca el mismo `healthBody` de `src/app.ts`: quien entre
  segundo tiene un conflicto pequeño.
- A fondo: que el SQL no repita el filtro de internos ni la compensación en cada subconsulta.
- No sé quién tenía abierto el panel de QA a esas horas; desde ClickHouse solo se ve el colector de origen.
