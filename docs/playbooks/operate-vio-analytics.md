---
title: "Playbook — operar Vio Analytics"
last-updated: 2026-08-20
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
| Colector (×3 envs) | `ca-analytics-vio-{development,staging,production}` en `rg-api-vio-*` / `cae-api-vio-*` | `vio-live/vio-analytics` |
| Dominios | `events-dev.vio.live` · `events-staging.vio.live` · `events.vio.live` (Cloudflare, nube gris + TXT `asuid.*`; certs managed de Azure) | — |
| Store | VM `vm-clickhouse-vio` (rg-vio-shared) · bases `vio_{development,staging,production}` | `infra/clickhouse.tf` |
| Vendors | Mixpanel: "Vio Analytics" (prod, id 4055947) · "Vio Analytics - Staging" (id 4055964) · dev sin Mixpanel a propósito | `src/sinks/mixpanel.ts` |
| Espejo server | módulo `analytics` del outbox de vio-backend | `server/events/analytics-mirror.ts` |
| Proxy dashboards | `/api/analytics/vio/*` en vio-backend | `server/analytics-proxy.ts` |
| Identity pull | `id-analytics-vio` (user-assigned, AcrPull en `acrvioapi`) | `infra/main.tf` |
| CI/CD | push a main → dev · staging/prod por `workflow_dispatch` · OIDC app `vio-analytics-cicd` | `.github/workflows/deploy.yml` |
| IaC state | `viotfstate` (rg `vio-tools`) / container `tfstate` / key `vio-analytics.tfstate` | `infra/` (OpenTofu ok) |

## Dónde vive cada secret/config

| Valor | Dónde |
|---|---|
| Password ClickHouse (`default`) | `vio-analytics/infra/terraform.tfvars` (gitignorado, máquina de Angelo) + secrets de las apps del colector |
| `INTERNAL_EVENTS_TOKEN` (uno por env) | mismo tfvars + secret en colector Y en `ca-api-vio-*` (`analytics-internal-token`) |
| `DATABASE_URL` por env (lookup api keys) | tfvars (copiado de los secrets de `ca-api-vio-*`) |
| Mixpanel token/secret | tfvars (staging+prod) + secrets de las apps · local: `vio-analytics/.env` (apunta a STAGING siempre) |
| GH secrets del repo | `AZURE_CLIENT_ID/TENANT_ID/SUBSCRIPTION_ID` (falta `TELEGRAM_*`, opcional) |

## Salud y diagnóstico

```bash
# ¿Está vivo? (por env)
curl -s https://events-staging.vio.live/health | jq
#  → clickhouse: {buffered, inserted, dropped, lastError} · sinks.mixpanel: {...}

# ¿Llegan eventos de una app? (usa la api key del partner)
curl -s "https://events-staging.vio.live/v1/stats/overview?days=1" -H "x-api-key: KEY" | jq

# Logs del colector
az containerapp logs show -n ca-analytics-vio-staging -g rg-api-vio-staging --tail 50
```

**Evento no aparece — checklist en orden:**
1. `/health` del colector: ¿`dropped` creció? ¿`lastError`? (ClickHouse caído = buffer reteniendo)
2. ¿401 en el cliente? La api key no existe en el Postgres de ESE entorno (dev↔staging no cruzan)
3. ¿Evento rechazado? El POST devuelve `{accepted, rejected, errors[]}` — el SDK con backoff lo reintenta si fue 5xx, pero un rechazo de validación es definitivo
4. Espejo server: `SELECT * FROM events_outbox WHERE module='analytics' AND status IN ('pending','dead')` en el Postgres del env — `last_error` trae la razón del colector
5. Impresiones web: requieren página **renderizando** (IntersectionObserver no corre en tabs ocultas) y ≥50% visible ≥1s

## ClickHouse (VM sin SSH — todo por run-command)

```bash
# Estado de contenedores / disco
az vm run-command invoke -g rg-vio-shared -n vm-clickhouse-vio --command-id RunShellScript \
  --scripts "docker ps; df -h /data" --query "value[0].message" -o tsv

# Query directa (password en tfvars)
curl -s -u "default:$PASS" 'https://vio-clickhouse.norwayeast.cloudapp.azure.com/?database=vio_staging' \
  -d "SELECT name, count() FROM events FINAL GROUP BY name FORMAT PrettyCompact"

# Backups: cron 03:00 UTC → storage saapivio / container clickhouse-backups (uno por db por día)
# Log del backup:  ... --scripts "tail -20 /var/log/vio-backup.log"
# Restore (a una db nueva, luego renombrar):
#   RESTORE DATABASE vio_staging AS vio_staging_restored FROM AzureBlobStorage('<conn>', 'clickhouse-backups', 'vio_staging-YYYYMMDD')
```

Queries de lectura usan `FINAL` (dedupe de reintentos pre-merge). Upgrade de
ClickHouse: cambiar el tag en `/opt/vio/docker-compose.yml` de la VM
(run-command) + `docker compose -p vio up -d`; el dato vive en `/data`.

## Deploy y cambios

- **Código del colector**: push a main → deploy automático a development;
  staging/prod con `workflow_dispatch` eligiendo environment.
- **Infra** (`infra/`): humanos aplican (nunca CI). `tofu plan` primero.
  La imagen del contenedor tiene `ignore_changes` — CI es dueño de deploys.
- **Agregar un evento a la taxonomía** (decisión de contrato, ADR-0009):
  1) Zod en `src/contract/analytics-schema.ts` + `docs/EVENTS_CONTRACT.md`
  2) deploy colector (acepta el nombre nuevo) 3) SDKs lo emiten después.
- **Encender/cambiar vendor**: tfvars (`mixpanel_*` por env) + flip
  `mixpanel_enabled` en `infra/variables.tf` + `tofu apply`. Local SIEMPRE
  al proyecto Staging.

## Gotchas de despliegue (aprendidos con sangre el 2026-08-20)

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
