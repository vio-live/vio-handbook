---
title: "ClickHouse de analytics caído dos días: Oracle retiró la VM al acabar la prueba gratuita"
date: 2026-11-25
session: socket-server (Commerce backend)
participants: [angelo, claude]
status: live
---

## Goal

Angelo ve en el dashboard `Analytics unavailable. analytics collector unreachable` y pide arreglarlo.

## Done

- **Causa.** La instancia `vio-analytics-ch` (ClickHouse de `vio_production` y `vio_staging`,
  `VM.Standard.E5.Flex`, de pago) **dejó de existir el 23/11 a las 09:10 UTC**. La tenancy de Oracle
  (`vio-backend`, alta 25/09) seguía en Free Tier sin medio de pago; al acabar la prueba, Oracle retira lo que
  no es Always Free. La consola decía «Your Free Trial ended». Que fueran 30 días de prueba + 30 de gracia es
  deducción por las fechas: no vimos el aviso de Oracle.
- **Síntomas.** `129.151.210.107` sin respuesta en 22/443/8123; colector de prod con
  `clickhouse.lastError: "Timeout error."` y `lastFlushAt` congelado en `2026-11-23T09:10:58Z`; lecturas
  `/v1/stats/*` → 500 a los 30 s; base-api cortaba a los 15 s → 502 `collector unreachable`.
- **Nada se perdió.** El boot volume (50 GB) quedó `Available`. El colector de prod no reinició en esos dos
  días y retuvo los eventos en memoria (buffer de 50.000 filas, `dropped: 0`).
- **Restauración (25/11, 15:10–16:10 UTC):**
  1. Copia completa del boot volume: `vio-analytics-ch-antes-de-restaurar-20261125`.
  2. Sin pagar no había dónde arrancarlo: `E2.1.Micro` en 2 de 2, `A1.Flex` «Out of capacity» dos veces.
  3. Angelo añadió tarjeta y pasó la cuenta a **Pay As You Go** (~15:35 UTC; activa ~16:04 UTC).
  4. IP pública **reservada** `vio-analytics-ch-ip` = `79.76.61.149` (la anterior era efímera y se perdió).
  5. Cloudflare: registro A `analytics.vio.live` → `79.76.61.149` (DNS only, TTL 1 min).
  6. Instancia nueva `vio-analytics-ch` desde el boot volume viejo: `E5.Flex` 1 OCPU / 8 GB, `vcn-vio` /
     `subnet-vio-pub`, IP privada `10.0.0.250`, creada 16:06:50 UTC. Docker levantó solo `vio-clickhouse-1`
     y `vio-caddy-1`. Las reglas de iptables del disco siguen (443 solo desde los dos colectores y «equipo Vio»).
- **Verificado.**
  - Colector prod a las 16:09:08 UTC: `lastError: null`, `inserted` 2668 → 3850, `buffered 0`, `dropped 0`.
  - ClickHouse: `vio_production.events` 35.103 filas (22/10 → hoy); desde la caída 1.202, la primera a las
    09:10:56 del 23/11; `count() = uniqExact(event_id)` por día (sin duplicados). `vio_staging` 8.018.
  - Lecturas que hace el dashboard (`campaigns/8/session-funnel/products`, `content`, `funnel`) → 200 en 1–2,4 s.

## Decisions

- Cuenta de Oracle en Pay As You Go (Angelo). Las dos `E2.1.Micro` siguen siendo Always Free; esta VM se factura.
- IP reservada en vez de efímera para la VM de ClickHouse.

## Blockers

- Ninguno.

## Next session

- Alerta cuando el colector no pueda escribir (`clickhouse.lastError` no nulo o `lastFlushAt` viejo): estuvo
  dos días fallando sin que nadie lo viera.
- Política de copias programadas del boot volume y alerta de presupuesto en Oracle.
- Acceso SSH: la llave nueva `~/.ssh/vio_oracle_ch` (laptop de Angelo) entra como `ubuntu@79.76.61.149`;
  `vio_oracle` de Miguel debería seguir valiendo (mismo disco), sin comprobar.
- Actualizar las referencias a `129.151.210.107` en la documentación de infraestructura.
