---
title: "Playbook — operar Vio Analytics"
last-updated: 2026-11-26
owner: angelo
status: live
---

# Playbook — operar Vio Analytics

El runbook del pipeline de analytics. Arquitectura y porqués: [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md),
[ADR-0010](../decisions/0010-clickhouse-oss-self-hosted.md),
[`architecture/vio-analytics.md`](../architecture/vio-analytics.md).

## Mapa de piezas (qué es cada cosa y dónde vive)

| Pieza | Recurso | Repo/código |
|---|---|---|
| Colector (×2 envs) | **VMs de Oracle** (tenancy `vio-backend`, `eu-stockholm-1`), unit `vio-analytics.service`, árbol en `/opt/vio-analytics` sin `.git`: producción `vio-backend-amd` `82.70.54.151` (comparte máquina con el Vio Backend) · staging `vio-staging-amd` `129.151.196.99`. Las Container Apps de Azure desaparecieron el 2026-09-25. | `vio-live/vio-analytics` |
| Dominios | `events.vio.live` → `82.70.54.151` · `events-staging.vio.live` → `129.151.196.99` · `analytics.vio.live` → `79.76.61.149` (Cloudflare; comprobado con `dig` el 26/11/2026) | — |
| Store | Instancia de Oracle `vio-analytics-ch`, `VM.Standard.E5.Flex` 2 OCPU (4 vCPU) / 8 GB, IP reservada `79.76.61.149` (`analytics.vio.live`, Caddy delante; el 443 solo lo abren los dos colectores y «equipo Vio» por `iptables` `DOCKER-USER`) · bases `vio_staging` y `vio_production` · **de pago** (ver [caída del 23–25/11](../journal/2026-11/2026-11-25-clickhouse-caida-fin-prueba-oracle.md)) | `/opt/vio/docker-compose.yml` en la VM |
| Vendors | Mixpanel: "Vio Analytics" (prod, id 4055947) · "Vio Analytics - Staging" (id 4055964) · dev sin Mixpanel a propósito | `src/sinks/mixpanel.ts` |
| Espejo server | módulo `analytics` del outbox de vio-backend | `server/events/analytics-mirror.ts` |
| Proxy dashboards | `/api/analytics/vio/*` en vio-backend | `server/analytics-proxy.ts` |
| CI | `ci.yml` en cada push y PR: `lint`, `check`, `test`, `build`. **No hay CD**: el despliegue es manual por SSH (abajo). | `.github/workflows/ci.yml` |
| Azure (histórico) | `id-analytics-vio`, la app OIDC `vio-analytics-cicd`, el state `viotfstate` y el `infra/` del repo son de la etapa de Container Apps (hasta el 2026-09-25). No describen lo que corre hoy. | `infra/` |

## Dónde vive cada secret/config

| Valor | Dónde |
|---|---|
| Todo lo del colector (`CLICKHOUSE_*`, `INTERNAL_EVENTS_TOKEN`, `INTERNAL_READ_TOKENS`, `MIXPANEL_*`, `CAMPAIGNS_URL`, `API_KEY_CACHE_FILE`, `STATS_*`) | `/opt/vio-analytics/.env` de cada VM (600, dueño `ubuntu`), distinto por entorno. No se toca al desplegar. Qué significa cada una: `docs/DESPLIEGUE.md` del repo. |
| Password ClickHouse (`default`) | en el entorno del contenedor `vio-clickhouse-1` (compose de `/opt/vio`) y en el `.env` de los dos colectores |
| Token de solo lectura de prod, para consultar `/v1/stats` desde la laptop de Angelo | `~/.vio/analytics-prod.env` (`ANALYTICS_READ_TOKEN`, cabecera `x-internal-token`; toda lectura interna lleva `?client_app_id=`) |
| Lookup de api keys | ya no hay `DATABASE_URL`: el colector pregunta al micro de campañas (`CAMPAIGNS_URL`) desde el PR #16 |
| Mixpanel local | `vio-analytics/.env` (apunta a STAGING siempre) |

## Regla de emparejamiento de entornos (confirmada por Angelo, 2026-08-21)

**API y eventos van SIEMPRE en pareja del mismo entorno.** La api key debe
existir en el Postgres del MISMO entorno al que se mandan los eventos —
nunca cruzar (api-local + events-dev = 401 garantizado, fue el caso Replit):

| Si la app habla con… | los eventos van a… |
|---|---|
| `api-dev.vio.live` | `events-dev.vio.live` (desde el 2026-09-16 ambos son alias de staging, así que la pareja se mantiene) |
| `api-staging.vio.live` | `events-staging.vio.live` |
| `api.vio.live` | `events.vio.live` |
| `api-local-angelo.vio.live` (túnel) | `events-local-angelo.vio.live` (túnel → colector local, que guarda en `vio_development` de la VM) |

En el SDK esto se logra con `environment` (que fija ambos defaults juntos);
un override de `eventsBase` solo debe usarse manteniendo la pareja.

## Salud y diagnóstico

```bash
# ¿Está vivo? (por env)
curl -s https://events-staging.vio.live/health | jq
#  → clickhouse: {buffered, inserted, dropped, lastError} · sinks.mixpanel: {...}

# ¿Llegan eventos de una app? (usa la api key del partner)
curl -s "https://events-staging.vio.live/v1/stats/overview?days=1" -H "x-api-key: KEY" | jq

# Verificación de tracking para INTEGRADORES (browser-friendly, ?apiKey= en la URL):
# los eventos crudos recién llegados del tenant, del más nuevo al más viejo.
# Perillas: &minutes= (ventana, ≤24h) · &name= (filtrar un evento) · &limit= (≤200)
open "https://events-dev.vio.live/v1/stats/recent?minutes=60&apiKey=KEY"

# Logs del colector
az containerapp logs show -n ca-analytics-vio-staging -g rg-api-vio-staging --tail 50
```

**Evento no aparece — checklist en orden:**
1. `/health` del colector: ¿`dropped` creció? ¿`lastError`? (ClickHouse caído = buffer reteniendo)
2. ¿401 en el cliente? La api key no existe en el Postgres de ESE entorno (dev↔staging no cruzan)
3. ¿Evento rechazado? El POST devuelve `{accepted, rejected, errors[]}` — el SDK con backoff lo reintenta si fue 5xx, pero un rechazo de validación es definitivo
4. Espejo server: `SELECT * FROM events_outbox WHERE module='analytics' AND status IN ('pending','dead')` en el Postgres del env — `last_error` trae la razón del colector
5. Impresiones web: requieren página **renderizando** (IntersectionObserver no corre en tabs ocultas) y ≥50% visible ≥1s

## Aviso: el colector no puede escribir en ClickHouse

Tarea programada `aviso-salud-colector` (portátil de Angelo, cada 10 min de 07 a 23). Corre
`~/vio-reportes/colector/salud-colector.py`, que lee `https://events.vio.live/health`, y publica en
`#vio-ordenes` (más una notificación de escritorio):

- `🚨 Colector de analítica — el colector de prod lleva N sin poder escribir en ClickHouse…`: `lastError`
  puesto más de 5 min. Se repite cada 2 h con las cifras del momento, y al instante si `dropped` crece.
- `🚨 … no contesta en /health`: el colector mismo está caído; esos eventos se pierden.
- `✅ … vuelve a escribir`: cierre, una vez.

**Qué hacer cuando salta el primero:**

1. **No reiniciar el colector.** Los eventos esperan en su memoria (hasta 50.000 filas); un reinicio los
   pierde. El 23–25/11 se salvaron los 1.202 de dos días porque nadie lo reinició.
2. Mirar ClickHouse, no el colector: la VM `vio-analytics-ch` en Oracle (`79.76.61.149`, 443 solo desde los
   colectores) y sus contenedores `vio-clickhouse-1` y `vio-caddy-1`.
3. Cuando ClickHouse vuelve, el writer vacía el buffer solo. Comprobar `lastError: null`, `buffered: 0` y
   `dropped: 0` en `/health`, y `count() = uniqExact(event_id)` por día en `vio_production.events`.

`/health` del colector: desde [vio-analytics `feature/health-degraded-when-writes-stall`](https://github.com/vio-live/vio-analytics)
(pendiente de merge y de desplegar al 25/11) contesta `status: degraded` (200) y `clickhouse.stalled: true`
cuando hay filas esperando más de 60 s sin un insert correcto, y `GET /health/writes` da 503. Hasta que se
despliegue, `status` dice `ok` aunque `lastError` esté puesto: mirar `lastError`, no `status`.
Por qué el aviso anterior no sirvió: [lección](../lessons/un-aviso-publicado-con-tu-usuario-no-te-avisa.md).

## ClickHouse (VM de Oracle, por SSH)

```bash
# Entrar (laptop de Angelo; la llave de Miguel `~/.ssh/vio_oracle` sigue en `authorized_keys`)
ssh -i ~/.ssh/vio_oracle_ch ubuntu@79.76.61.149

# Estado: contenedores, carga, disco, memoria
sudo docker ps; uptime; df -h /; free -m

# SQL sin sacar la contraseña de la máquina (la lee el contenedor de su entorno)
ssh -i ~/.ssh/vio_oracle_ch ubuntu@79.76.61.149 'sudo docker exec -i vio-clickhouse-1 sh -c \
  '"'"'clickhouse-client --user "${CLICKHOUSE_USER:-default}" --password "$CLICKHOUSE_PASSWORD" --multiquery'"'"'' <<'SQL'
SELECT name, count() FROM vio_production.events FINAL WHERE received_at >= today() GROUP BY name ORDER BY 2 DESC;
SQL
```

- Compose en `/opt/vio` (`vio-clickhouse-1` 24.8 + `vio-caddy-1`), `restart: unless-stopped`; el dato vive en
  `/data/clickhouse`, **en el boot volume**. Un timeout al 443 desde una máquina que no esté en la lista de
  `iptables` es lo esperado, no una caída: probar por el colector (`/health`).
- **Copias:** política de Oracle `vio-analytics-ch-diaria-7d-semanal-4s` sobre el boot volume (diaria 03:00 UTC,
  7 días; semanal lunes 02:00 UTC, 28 días), puesta el 25/11/2026. En la VM **no hay** cron de copia (el de
  Azure Blob de la etapa anterior no existe aquí). Restaurar = instancia nueva desde la copia del volumen.
- **Tamaño:** se cambia en la consola (Instance → Edit → shape); reinicia la VM alrededor de un minuto y el
  colector retiene los eventos en memoria mientras tanto (hasta 50.000 filas). Hecho el 25/11: 1 → 2 OCPU.
- **Gasto:** presupuesto `vio-backend-mensual` (800 SEK/mes, avisos al 80 % real y 100 % de previsión). La
  cuenta es Pay As You Go desde el 25/11; las dos VMs del colector siguen siendo Always Free.
- Las lecturas usan `FINAL` (dedupe de reintentos antes del merge). Subir de versión: cambiar el tag en
  `/opt/vio/docker-compose.yml` y `docker compose -p vio up -d`.

## Lecturas de los paneles: qué mirar cuando van lentas o dan «analytics unavailable»

Con `/health` en `ok` y las escrituras al día, el problema es de **lecturas**. Una lectura de panel es un SQL de
~40.000 caracteres que cuesta 1,1–1,6 s de CPU **solo planificarlo**, y staging y producción comparten la VM.
Desde el 25/11/2026 (colector `a29de5f`) cada lectura pasa por una cola con caché
([entrada del día](../journal/2026-11/2026-11-25-analytics-lecturas-saturan-clickhouse.md)).

1. `curl -s https://events.vio.live/health | jq .reads` → `queued` alto de forma sostenida o `shed` creciendo =
   llegan más lecturas de las que caben; `cacheHits` y `shared` = lecturas que ClickHouse se ahorró.
2. En ClickHouse, quién aprieta y cuánto esperan (cambiar la ventana):

```sql
SELECT toStartOfMinute(event_time) AS m,
       multiIf(has(databases,'vio_production'),'prod', has(databases,'vio_staging'),'staging','otro') AS db,
       count() AS lecturas, countIf(type != 'QueryFinish') AS cortadas,
       round(avg(query_duration_ms)) AS media_ms, max(query_duration_ms) AS max_ms,
       round(avg(ProfileEvents['OSCPUWaitMicroseconds'])/1000) AS espera_cpu_ms
FROM system.query_log
WHERE event_time > now() - INTERVAL 1 HOUR AND query_kind = 'Select' AND NOT has(databases,'system')
  AND type IN ('QueryFinish','ExceptionWhileProcessing','ExceptionBeforeStart')
GROUP BY m, db ORDER BY m;
```

   `forwarded_for` dice qué colector la mandó (`82.70.54.151` prod, `129.151.196.99` staging). Una espera de
   CPU mucho mayor que el tiempo de trabajo = saturación, no consulta lenta.
3. Palancas, de menos a más: `STATS_READ_CACHE_TTL_MS` y `STATS_MAX_CONCURRENT_READS` en el `.env` del colector
   (el tope es por proceso; con 4 vCPU: prod 3, staging 2), más vCPU en la VM, y la de fondo, sin hacer:
   abaratar el SQL (repite el filtro de navegadores internos 27 veces y anida la compensación).
   Ver la [lección](../lessons/consulta-lenta-con-pocas-filas-mira-el-plan.md).

## Recuperar el acceso SSH a una VM de Oracle (sin la llave que entra)

Sirve para las tres VMs. Hace falta la consola de Oracle con Angelo dentro (el inicio de sesión le pide aprobar
en el teléfono). Sin reinicios.

1. Instance → **Management** → Oracle Cloud Agent → plugin **Bastion** → Enable. Tarda unos 10 minutos en
   pasar de `Stopped` a `Running`; hasta entonces crear la sesión da «plugin is not running».
2. Identity & Security → **Bastion** → Create: `vcn-vio`, `subnet-vio-pub`, allowlist = la IP pública de quien
   entra `/32`.
3. En el Bastion, **Create session**: Managed SSH session, usuario `ubuntu`, la instancia, y la llave pública.
   El formulario va en un iframe: si reintenta y enseña el error anterior, cancelar y abrirlo de nuevo.
4. «Copy SSH command» y conectarse con ese `ProxyCommand` (IP privada de la instancia: `10.0.0.99` staging,
   `10.0.0.209` backend).
5. Dentro, añadir la llave a `~/.ssh/authorized_keys` **en una línea propia**. El plugin mete la suya debajo
   de un marcador `#ocid1.bastionsession…` y, al borrar la sesión, quita solo esas dos líneas.
6. Borrar las sesiones, comprobar la entrada directa, borrar el Bastion y desactivar el plugin.

## Deploy y cambios

- **Código del colector**: merge a `main` y **despliegue manual por SSH**, staging primero. El procedimiento
  exacto (`git archive` → `scp` → `sudo tar` + `chown` → `pnpm install --prod=false && pnpm build` →
  `sudo systemctl restart vio-analytics`) vive en `docs/DESPLIEGUE.md` del repo. El reinicio corta ~2 s y el
  apagado vacía el buffer; con `clickhouse.lastError` puesto **no reiniciar** (se pierde lo retenido). Después:
  `/health` → `version` = el commit, `ready: true`, `lastError: null`. Producción necesita el OK de Angelo.
  Lo hacía Miguel; el 25/11/2026 lo hizo claude desde la laptop de Angelo (su llave entra en las dos VMs).
- **Agregar un evento a la taxonomía** (decisión de contrato, ADR-0009):
  1) Zod en `src/contract/analytics-schema.ts` + `docs/EVENTS_CONTRACT.md`
  2) deploy colector (acepta el nombre nuevo) 3) SDKs lo emiten después.
- **Encender/cambiar vendor**: `MIXPANEL_*` en el `.env` de la VM y reiniciar el colector. Local SIEMPRE
  al proyecto Staging.

## Gotchas de despliegue (aprendidos con sangre el 2026-08-20)

> Los tres primeros son de la etapa de Azure Container Apps (hasta el 2026-09-25) y ya no aplican al
> despliegue por SSH; se dejan como historia.

- **Identity de registry**: system-assigned muere al primer pull (el rol
  llega tarde) → user-assigned `id-analytics-vio` con AcrPull otorgado
  ANTES + `time_sleep` 90s. Ver lesson `container-apps-first-deploy-gotchas`.
- **Secrets vacíos**: Container Apps rechaza `value: ""` — el TF solo crea
  los seteados (filtro en `main.tf`).
- **OIDC GitHub**: esta org presenta subjects con IDs INMUTABLES
  (`repo:vio-live@269172431/vio-analytics@1340054227:...`) — el formato
  estándar da AADSTS700213.
- **El 202 del colector no es éxito por evento**: el body trae
  `{accepted, rejected}` — cualquier dispatcher debe verificar `accepted`.
