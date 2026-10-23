---
title: "Colector de analytics al 82c4af0f en staging y en producción"
date: 2026-10-23
participants: [angelo, miguel]
status: live
---

## Deploy del colector en las dos VMs — miguel

- Quién: miguel (lo pidió Angelo, excepción suya a la norma de no tocar prod: «quiero hacerlo ya»)
- Dónde: `129.151.196.99` (staging) y `82.70.54.151` (producción), `/opt/vio-analytics`
- Cuándo: 2026-10-23, 11:49–11:52 UTC
- Contexto: `main` de `vio-analytics` en **82c4af0f** (PR #31, identidad por defecto; PR #32,
  `version` y `mode` en `/health`). Las dos VMs corrían **c2fc1614** desde el 22/10 19:47 UTC.

### Antes: una corrección a la premisa del pedido

El pedido decía que la identidad estaba apagada porque los procesos no habían reiniciado
(`uptime_s 55294`). **La identidad ya estaba encendida en las dos VMs** desde el 22/10, por la
línea `MIXPANEL_IDENTITY=simplified` del `.env`, y lo comprobé por tercera vez antes de tocar nada:
`tr '\0' '\n' < /proc/<MainPID>/environ | grep MIXPANEL_IDENTITY` devuelve `simplified` en las dos.
Ayer lo confirmé además por el export de Mixpanel: los 30 eventos de prod traían `$device_id`.
O sea: **no había historia partiéndose** y la urgencia del pedido se apoyaba en un dato falso.
Es la segunda vez que la aritmética de uptime lleva a esa conclusión equivocada
(ver `../../lessons/`, nota de identidad del 22/10).

Lo que el deploy **sí** aporta y no existía: los campos `version` y `sinks.mixpanel.mode` en
`/health`, que son justamente los que habrían evitado esta confusión. Por eso lo hice igual.

### Hecho

Procedimiento de siempre (la VM **no tiene `.git`**): tarball con `git archive` del commit,
respaldo, extraer, `pnpm install --prod=false`, `pnpm build`, `systemctl restart`.

- **El tarball trae el sha ya sustituido** (`.gitattributes` con `export-subst`):
  `const ARCHIVE_COMMIT = "82c4af0f…"`. Verificado **en el tarball antes de subirlo**, no después.
  77 ficheros, y **ningún `.env`** (solo el `.env.example` versionado) — comprobado también antes.
- Respaldos: `/home/ubuntu/vio-analytics-backup-20261023-114901.tgz` (staging) y
  `-115114.tgz` (prod), sin `node_modules`.
- **Ningún `.env` tocado**, y `MIXPANEL_IDENTITY` aparece **una sola vez** en cada uno: no hubo
  duplicado que limpiar.
- Diff `c2fc1614..82c4af0f` revisado antes de desplegar: 10 ficheros, +137/−16, **sin cambios de
  ClickHouse** y **sin variables obligatorias nuevas** (lo miré a propósito: una var requerida sin
  defecto tumba el arranque).

### Verificado

| | staging | prod |
|---|---|---|
| `version` | `82c4af0f…` | `82c4af0f…` |
| `sinks.mixpanel.mode` | `simplified` | `simplified` |
| `uptime_s` tras el restart | 6 s | 15 s |
| `clickhouse.lastError` | `null` | `null` |

- **Staging, ingesta real probada de punta a punta:** evento `component_impression` (surface `web`,
  host `replit`, con `anon_id` y `external_user_id`) por `POST /v1/events` con el token interno de
  escritura → `{"accepted":1,"rejected":0}` y, 12 s después, `clickhouse.inserted` **0 → 1** y
  `sinks.mixpanel.forwarded` **0 → 1**, los dos a la vez y con `lastError: null`. Eso es lo que
  prueba que la versión nueva ingiere; el `status: ok` no prueba nada.
- **En prod no inyecté nada**, a propósito. Queda a la espera del tráfico real.
- Journal de prod sin errores tras el arranque: `[sink:mixpanel] enabled` y
  `[clickhouse] schema ready (vio_production.events)`. La única línea que casa con «error» es
  `stale-if-error` del cargador de claves — falso positivo.

### Para quien venga detrás

A partir de ahora «¿está desplegado?» se contesta con **un curl**, no con aritmética de uptime:

```bash
curl -s https://events.vio.live/health | jq '{version, identity: .sinks.mixpanel.mode, uptime_s}'
```

`version: "dev"` significa que el proceso **no** viene de un tarball (un clon, el repo local).
