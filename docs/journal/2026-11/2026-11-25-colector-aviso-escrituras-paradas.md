---
title: "Colector: /health dice cuándo no puede escribir, y un aviso que lo cuenta"
date: 2026-11-25
session: socket-server (Commerce backend)
participants: [angelo, claude]
status: live
---

# 25/11: que una caída de ClickHouse se note en minutos

## Goal

Tras la [caída del 23–25/11](2026-11-25-clickhouse-caida-fin-prueba-oracle.md), Angelo pide detección: que
`/health` del colector refleje los fallos de escritura y un chequeo externo que avise en `#vio-ordenes`.

## Done

- **Hallazgo que cambia el planteo: la caída sí se avisó.** El aviso de órdenes saltó a los 53 min
  (23/11 10:03 UTC) y el de datos parados publicó 35 mensajes, uno por hora, hasta el 25/11. Nadie los vio
  porque el conector de Slack publica como Angelo y `#vio-ordenes` tiene un solo miembro, Angelo: Slack no
  notifica los mensajes propios. Además el texto no decía qué estaba roto, y `/health` decía `ok`.
  [Lección](../../lessons/un-aviso-publicado-con-tu-usuario-no-te-avisa.md).
- **Quién lee `/health`.** Nada automático: los probes del Terraform viejo usan `/health/live` y
  `/health/ready`, y el colector corre como unit de systemd en Oracle. No se pudo ver la config del Caddy de
  prod, así que `/health` se deja en 200.
- **vio-analytics, rama `feature/health-degraded-when-writes-stall`, commit `ddaf417` (local, sin push):**
  - `ClickHouseWriter` dice `stalled: true` cuando hay filas esperando más de `CLICKHOUSE_STALL_AFTER_MS`
    (60 s) sin que un insert funcione. Nuevos en `clickhouse` de `/health`: `stalled`, `waitingSince`,
    `consecutiveFailures`, `bufferLimit`.
  - `/health` y `/_health`: `status: "degraded"` con 200. `GET /health/writes`: 200 o 503, para un monitor
    que solo mire el código de estado. La ingesta no cambia (202) y el proceso no sale.
  - Un `lastFlushAt` viejo con el buffer vacío no cuenta: es que no hay tráfico.
  - De paso: `buffered` ahora cuenta el lote en vuelo. Antes leía 0 mientras un insert colgaba hasta su
    timeout (30 de cada 31 s durante la caída), con todas las filas sin escribir.
  - `test/writes-stalled.test.ts` (10 casos). Suite entera: 505/505 en 30 ficheros contra un ClickHouse 24.8
    desechable, más `lint`, `check` y `build`.
  - Prueba real en local con el build: ClickHouse parado → 202 en la ingesta, `degraded` a los 5 s
    configurados, `/health/writes` 503, `/health/live` 200; ClickHouse arrancado → `ok`, 3 de 3 filas escritas,
    mismo proceso.
  - `README.md`, `docs/DESPLIEGUE.md` y `.env.example` actualizados en el mismo commit.
- **Chequeo externo, en marcha:**
  - `~/vio-reportes/colector/salud-colector.py` lee `https://events.vio.live/health` (sin key ni token).
    Vale para el colector de hoy (`lastError` en dos pasadas seguidas) y para el nuevo (`stalled`). Imprime
    `ALERTA`, `RESUELTO` u `OK`. Avisa pasados 5 min, recuerda cada 2 h con las cifras del momento, avisa al
    instante si `dropped` crece, si el colector se reinició en plena caída o si ni contesta, y cierra con un
    mensaje. Sin red en el portátil no dice nada.
  - `test_salud_colector.py`: 14 casos sin red, entre ellos la caída del 23/11 con el `/health` de entonces.
    Probado también contra un colector local con ClickHouse parado y con el colector muerto.
  - Tarea programada `aviso-salud-colector`: `5-59/10 7-23 * * *`, publica en `#vio-ordenes` y manda una
    notificación de escritorio. Primera pasada contra prod: `OK escribe bien`.
- **Playbook** [operate-vio-analytics](../../playbooks/operate-vio-analytics.md): qué hacer cuando salta el
  aviso (no reiniciar el colector).

## Decisions

- `/health` degradado sigue en 200; el 503 va en una ruta aparte. Un 503 en `/health` solo sirve si algo lo
  lee, y si ese algo reinicia el colector se pierde justo el buffer que salvó los datos.
- El chequeo no espera al deploy: lee los campos que el colector ya da hoy.

## Blockers / open questions

- **OK de Angelo** para pushear la rama y abrir el PR en `vio-analytics`. Después, deploy por Miguel
  (entrada en el [handoff](../../handoff/2026-10-19-coordinacion-claude-miguel.md) cuando esté en `main`).
- **El aviso sigue dependiendo del portátil de Angelo** (la app abierta, de 07 a 23) y de una notificación de
  escritorio. Para que no dependa: un monitor externo sobre `/health/writes` una vez desplegado, o el cron de
  Miguel. Decisión de Angelo.
- El aviso de datos parados sigue publicando «el colector no responde a /stats/recent» cada hora durante una
  caída. No se tocó.

## Next session

- Con el OK: push, PR, y pedir el deploy a Miguel (staging y prod; sin variables nuevas ni migración).
  Comprobación tras el deploy: `/health` trae `clickhouse.stalled: false` y `/health/writes` da 200.
- En este portátil el ClickHouse de `docker compose` del repo se cae al arrancar con su volumen actual
  (`loadOutdatedDataParts`); las pruebas `*.clickhouse.test.ts` se corrieron con un contenedor sin volumen.
