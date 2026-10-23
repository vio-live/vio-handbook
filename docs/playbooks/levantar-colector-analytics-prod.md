---
title: "Levantar el colector de analytics en producción (Oracle)"
last-updated: 2026-10-13
owner: angelo
status: done
---

# Levantar el colector de analytics en producción

> **EJECUTADO.** El colector de producción está vivo desde el 2026-10-12
> (`events.vio.live` → `127.0.0.1:5100`, systemd `vio-analytics.service`, ClickHouse
> `vio_production`), y **Mixpanel quedó activado el 2026-10-13** con las claves del
> proyecto `4055947` (`enabled:true`, fan-out verificado end-to-end).
> Este playbook se conserva como referencia de cómo se hizo y para rehacerlo si la VM
> se pierde. Lo que sigue describe el estado ANTERIOR al 12/10.
> Detalle de la ejecución: [journal 12/10](../journal/2026-10/2026-10-12.md) ·
> [journal 13/10](../journal/2026-10/2026-10-13.md).
>
> **Pendiente real que queda:** el colector no recibe eventos porque el espejo
> server-side de `vio-backend` no tiene las variables `ANALYTICS_*` en producción.

Hoy **no hay colector de producción**. Desde el rehost a Oracle, `events.vio.live`
vive en la VM del backend (`82.70.54.151`) y devuelve `503
analytics_collector_not_deployed` (vhost `events-vio-gone`, puesto por Miguel el
2026-10-12). Este playbook lo reemplaza por el colector real.

Quien lo ejecuta necesita **SSH a la VM de producción** — el agente de analytics
no lo tiene. Espejo de lo que ya corre en staging
([vio-staging-oracle](../infrastructure/vio-staging-oracle.md)).

## Antes de empezar: lo que ya está listo (verificado 2026-10-12)

| Pieza | Estado |
|---|---|
| ClickHouse (`analytics.vio.live`, Oracle) | ✅ vivo; `vio_production` existe con la tabla `events`, 0 filas |
| `events.vio.live` → `82.70.54.151` (DNS + cert) | ✅ el certificado ya cubre el nombre |
| Colector en staging (`129.151.196.99:5100`) | ✅ sano, 7.535 eventos, Mixpanel al día |
| Código | `vio-live/vio-analytics` `main` @ `3f1a5f6` |

⚠️ **El CI del repo no sirve**: `.github/workflows/deploy.yml` sigue desplegando a
Azure Container Apps (`acrvioapi`, `rg-api-vio-*`), que ya no existen. El deploy
es manual, como en staging. Arreglar el workflow es tarea aparte.

⚠️ **RAM**: la VM es `E2.1.Micro` (954 MB + 2 GB swap) y ya corre `vio-backend` +
Postgres. En staging los mismos tres procesos ocupan 405 MB. Entra, pero medir
con `free -m` después de arrancar.

## 1. Token interno: generar uno nuevo (no reutilizar)

El token que hoy tiene base-api de producción (`ANALYTICS_INTERNAL_TOKEN`)
**quedó expuesto en una captura de Trello el 2026-09-15** y además **no coincide**
con el de `vio-analytics/infra/terraform.tfvars`. Así que:

```bash
openssl rand -hex 32   # token nuevo, uno solo
```

Ese valor va en **dos lugares**, y tienen que ser idénticos o el dashboard de
Commerce responde 401:

1. el `.env` del colector (`INTERNAL_EVENTS_TOKEN`, paso 2);
2. el `.env` de prod de base-api (`ANALYTICS_INTERNAL_TOKEN`) en
   `containerproduction2` / `env-file-microservices` / `base-api/.env`, que se
   hornea en el build → hay que **redesplegar base-api** después.

Opcional pero recomendado: `INTERNAL_READ_TOKENS` con un segundo token distinto,
y que base-api use **ese** (solo lectura). Ver
[handoff/analytics-stats-bridge](../handoff/analytics-stats-bridge.md).

## 2. El `.env` del colector

En la VM de producción, `/opt/vio-analytics/.env` (600, dueño del servicio):

```
NODE_ENV=production
PORT=5100
DATABASE_URL=            # Postgres LOCAL de la VM (la misma que usa vio-backend)
CLICKHOUSE_URL=https://analytics.vio.live
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=     # el mismo que usa el colector de staging
CLICKHOUSE_DATABASE=vio_production
MIXPANEL_PROJECT_TOKEN=  # proyecto "Vio Analytics" (prod), id 4055947 — NO lo usa ningún código
MIXPANEL_API_SECRET=     # el que AUTENTICA el fan-out (Basic base64(secret:))
INTERNAL_EVENTS_TOKEN=   # el del paso 1
INTERNAL_READ_TOKENS=    # opcional, solo lectura
```

**Dos valores de `terraform.tfvars` están viejos y NO se copian tal cual**:
`database_url` (apunta a la Postgres de Azure, desmantelada) y `clickhouse_url`
(apunta al host viejo de Noruega). El resto de los valores de producción siguen
siendo válidos.

`DATABASE_URL` es para resolver api keys → tenant: es la Postgres del backend, no
una base propia del colector.

## 3. Servicio

En `/opt/vio-analytics`, con `pnpm install --prod=false`, `pnpm build`, y una unit
`vio-analytics.service` con `Restart=always`,
`EnvironmentFile=/opt/vio-analytics/.env`, `ExecStart=/usr/bin/node dist/index.js`.
El colector crea las columnas que falten al arrancar (`ADD COLUMN IF NOT EXISTS`),
así que no hay migración manual.

> ⚠️ **No hay clon de git en las VMs** (corregido 2026-10-22, Miguel). No existe
> `/opt/vio-analytics/.git`: un `git pull` allí da `fatal: not a git repository`.
> El despliegue **siempre** se hizo por tarball, y en el home de cada máquina
> quedan los de las veces anteriores (`vio-analytics-<commit>.tar.gz`). La receta
> real para actualizar es:
>
> 1. `git archive` del commit en local → `vio-analytics-<commit>.tar.gz`
> 2. copiarlo a la VM, **respaldar** lo que hay, extraer sobre `/opt/vio-analytics`
> 3. `pnpm install --prod=false && pnpm build && systemctl restart vio-analytics`
>
> El `.env` vive en la VM y no viaja en el tarball: comprobar su md5 antes y
> después para asegurarse de que no se tocó.

## 4. nginx: reemplazar el 503

`events.vio.live` pasa del vhost `events-vio-gone` a uno que haga proxy a
`127.0.0.1:5100`, con el mismo certificado. **Guardar el vhost del 503**: es el
estado al que se vuelve si hay que apagar el colector.

```bash
nginx -t && systemctl reload nginx
```

## 5. Verificación (desde fuera, sin SSH)

```bash
curl -s https://events.vio.live/health          # ready:true, clickhouse sin lastError
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' \
  -d '{}' https://events.vio.live/v1/events     # 400 (envelope inválido) = contrato vivo, NO 200 ni 503
curl -s https://events.vio.live/v1/commerce-stats/overview   # 401 internal token required
curl -s https://api.vio.live/health             # 200 — el backend no se tocó
```

Y con el token nuevo, que el puente del dashboard responda:
`curl -H "authorization: <ID token Firebase de prod>" https://api-ecom.vio.live/api/stats/overview`
→ 200 (con ceros, hasta que haya tráfico).

## 5.1 Qué prueba de verdad que la versión nueva corre (2026-10-22)

`status: ok` **no** lo prueba: lo dice igual un proceso viejo. Lo que lo prueba:

- `uptime_s` bajo (reinició de verdad), y
- en staging, **un evento real entrando y saliendo**: `clickhouse.inserted` y
  `sinks.mixpanel.forwarded` subiendo juntos con `lastError: null`.
- **Desde `82c4af0` ya no hay que deducirlo**: `/health` expone `version` (el commit,
  sustituido por `git archive` en el tarball) y `sinks.<vendor>.mode` (en Mixpanel, la
  identidad). Un `curl` contesta qué corre:

  ```bash
  curl -s https://events-staging.vio.live/health | jq '{version, identity: .sinks.mixpanel.mode, uptime_s}'
  ```

  `version: "dev"` = ese despliegue no viene de un tarball. Para los despliegues
  anteriores a `82c4af0` no hay `version`, y entonces la garantía sigue siendo que el
  bundle sea **idéntico** al que se vio funcionando en staging (md5 de `dist/index.js`).

**En prod no se inyecta un evento de prueba.** Prod está en `inserted: 0` por falta
de tráfico, y ese cero es justamente la señal que se vigila («el día que deje de ser
0 es que llegó tráfico real»). Un evento de prueba la ensucia.

## 6. Qué esperar después

Producción va a seguir mostrando **0** hasta que alguna superficie use
`environment: production` en el SDK (la pareja es `api.vio.live` ↔
`events.vio.live`). Hoy ninguna lo usa: Vev y la demo van a staging. Eso se decide
aparte — ver [cuentas-y-capacidades](../architecture/cuentas-y-capacidades.md) y
el journal del 2026-09-15.

## Rollback

Volver al vhost `events-vio-gone` (503 explícito) y `systemctl stop vio-analytics`.
El 503 es un estado correcto: el SDK reintenta, no da el lote por aceptado.
