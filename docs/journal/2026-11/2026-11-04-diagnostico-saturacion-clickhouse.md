# Diagnóstico: saturación de ClickHouse por la vista general del dashboard (staging) — Miguel

- **Quién:** Miguel, en respuesta a una entrada de claude (guardia de Alan) en el handoff
  `2026-10-19-coordinacion-claude-miguel.md`.
- **Dónde:** VM ClickHouse Oracle `vio-analytics-ch` (`129.151.210.107`, contenedor `vio-clickhouse-1`),
  compartida por las bases `vio_staging` y `vio_production`. Colector de staging en `129.151.196.99`
  (`vio-analytics.service`), base-api de QA.
- **Cuándo:** 2026-11-04, picos a las 13:11 UTC (81 timeouts) y 15:16–15:23 UTC (~640 timeouts).
- **Contexto:** Alan reportó `502 analytics collector unreachable` en
  `/api/stats/surfaces/<id>/timeseries` al abrir la vista general del dashboard de staging. claude
  diagnosticó por los logs de base-api que era un timeout de 15 s contra el colector, no una caída
  (`/health` seguía rápido), y me dejó la entrada pidiendo que mirara la VM del colector o un tope de
  concurrencia.

## Hecho

- Entré a las dos VMs (`129.151.196.99` colector, `129.151.210.107` ClickHouse) por SSH con
  `~/.ssh/vio_oracle`.
- El colector estaba en reposo (load 0.00 en el momento de mirar); no es ahí donde se atasca.
- La VM de ClickHouse tenía `load average` 0.35/0.95/2.08 en 2 vCPU — compatible con el pico ya
  pasado.
- Consulté `system.query_log` de la ventana 15:16–15:24 UTC con el usuario `default` (contraseña
  sacada del `docker-compose.yml` del host, no la guardo en texto):
  - **1.331 queries**, promedio **2,8 s** (2.842 ms), máximo **9,4 s**, **506 por encima de 5 s**.
  - Las más lentas (8,9–9,4 s, repetidas decenas de veces en el mismo minuto) son todas el mismo
    patrón: un breakdown de traffic source con
    `multiIf(s_utm_source != '', 'utm', (s_referrer_host != '') AND (s_referrer_site != s_page_site), 'referrer', 'direct')`.
- **Mecanismo:** la vista general del dashboard pide el `timeseries` de 14 días + funnels + desgloses
  de las 8 surfaces del publisher 1332 **a la vez**, sin límite de concurrencia. Cada desglose de
  traffic source tarda ~9 s en esta ClickHouse de 2 vCPU; con 8 surfaces disparando varias de esas en
  paralelo, la cola se llena y algunas tardan más de los 15 s que tolera `statsService` en base-api →
  502. `/health` no lo refleja porque pega a una ruta sin esa carga.
- **No es la VM del colector, no es una caída, no es memoria.** Es capacidad de cómputo de ClickHouse
  frente a fan-out sin tope de paralelismo.

## No hecho (a propósito)

- No toqué código ni configuración. La ClickHouse es compartida con `vio_production`: cualquier
  cambio de capacidad o de código del fan-out excede mi alcance (config/infra/PRs, nunca código de
  producto sin OK de Angelo) y además staging comparte el recurso con prod.
- Dejé el hallazgo en el handoff con dos caminos posibles para quien lo tome: (a) semáforo/cola en
  `statsService` para no mandar las 8×N queries del overview en paralelo, o (b) cachear el breakdown
  de traffic source por surface con TTL corto.

## Pendiente

- Decisión de quién implementa el fix (claude, por ser código de `base-api`/`vio-analytics`) y si
  Angelo quiere escalar la VM de ClickHouse además de limitar la concurrencia.
