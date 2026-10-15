---
title: "Colector de staging al PR #16 y outbox de vio-backend apagado"
last-updated: 2026-10-15
---

# Colector de staging al PR #16 y outbox de vio-backend apagado — Miguel

- Quien: Miguel (pedido de Angelo, 2026-10-15 por la manana; reclamado a las 11:55 porque no estaba hecho)
- Donde: VM Oracle de staging `129.151.196.99` — `vio-analytics.service` y `vio-backend.service`
- Cuando: 2026-10-15, 11:56–12:00 OSL
- Contexto: el PR #16 de `vio-live/vio-analytics` mueve la resolucion de api-key y de surface/sponsor
  al micro de campanas; deja de leer el Postgres de vio-backend. El espejo de eventos de vio-backend
  (`analytics_mirror`) manda `client_app_id` de vio-backend, no las surfaces del micro, asi que hay
  que apagarlo o contamina el colector nuevo.

## Antes: nada estaba hecho

Lo primero fue comprobar el estado, y el health engana:

```
curl -s https://events-staging.vio.live/health
{"status":"ok","uptime_s":1337817,"ready":true,...}
```

`ready:true` pero **`uptime_s` = 15,5 dias**: el proceso venia del 29/09 y nunca se habia
reiniciado. El `.env` lo confirmo — tenia `DATABASE_URL` y **no** tenia `CAMPAIGNS_URL`.
Y en `/opt/vio-backend/.env` seguian las dos variables del espejo, en las lineas 8 y 9.

## 1. Colector al `ecb115b`

`main` de `vio-analytics` esta en `ecb115b` (merge del PR #16). Verificado en el codigo antes de
tocar el `.env`, para no fiarme del enunciado:

- `src/config.ts:22` — `CAMPAIGNS_URL: z.string().url(...)`, sin default: **obligatoria**, el
  proceso no arranca sin ella.
- `DATABASE_URL` — **cero apariciones** en `src/`. Ya no se lee.
- `INTERNAL_EVENTS_TOKEN` — `src/config.ts:47`, sigue en uso (proxy de stats de base-api).

`.env` de `/opt/vio-analytics` (respaldo `.env.backup-pre-pr16-20261015-095639`):

- anadida `CAMPAIGNS_URL=https://api-staging.vio.live`
- quitada `DATABASE_URL`
- `INTERNAL_EVENTS_TOKEN` intacta

Despliegue por el procedimiento de `docs/DESPLIEGUE.md` (manual por SSH, no hay CD): tarball sin
`.git`, `pnpm install --prod=false`, `pnpm build` (esbuild, 65,1 kb), `systemctl restart`.

Arranque limpio:

```
Server listening at http://127.0.0.1:5100
[sink:mixpanel] enabled
[clickhouse] schema ready (vio_staging.events @ https://analytics.vio.live)
```

Y desde fuera, `https://events-staging.vio.live/health`: `ready:true`, `uptime_s:10`
(el reinicio **si** ocurrio esta vez), `clickhouse.lastError:null`, mixpanel `enabled`.

## 2. Outbox de vio-backend apagado

Quitadas `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` de `/opt/vio-backend/.env`
(respaldo `.env.backup-pre-outbox-off-20261015-095731`) y reiniciado.

El log sigue diciendo `[outbox] worker started` — **eso es correcto y no significa que siguiera
mandando**. El worker del outbox atiende varios topics; lo que apaga el espejo es la guarda de
`server/events/analytics-mirror.ts:32`:

```ts
export function isAnalyticsMirrorEnabled(): boolean {
  return Boolean(process.env.ANALYTICS_EVENTS_URL && process.env.ANALYTICS_INTERNAL_TOKEN);
}
```

Se consulta al entrar en las dos rutas de despacho (lineas 65 y 121), que hacen `return` sin
efecto. Sin las variables **no lanza error**, simplemente no despacha — asi que no deja filas
reintentandose.

Comprobado que no quedo backlog:

```sql
SELECT topic, status, count(*) FROM events_outbox GROUP BY 1,2;
-- (0 rows)
```

`api.vio.live/v2/mobile/config` sigue dando **401** (vivo, pide auth): el reinicio no rompio nada.

## Produccion: sin tocar, a proposito

Verificado en `82.70.54.151`, como estaba descrito:

- `/opt/vio-analytics/.env` de prod **sin** `CAMPAIGNS_URL` y **con** `DATABASE_URL` — version
  vieja, servicio del 13/10. Correcto: **no hay micro de campanas en prod**, asi que desplegar el
  PR #16 ahi tumbaria el colector (la variable es obligatoria).
- `/opt/vio-backend/.env` de prod: **ninguna** `ANALYTICS_*`. El espejo ya estaba apagado.

Prod queda pendiente de que el micro de campanas llegue a master.
