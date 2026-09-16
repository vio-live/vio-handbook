---
title: Audit de costos Azure — 2026-09-16
last-updated: 2026-09-16
owner: miguel
---

# Audit de costos Azure — 2026-09-16

Se hizo el día en que se acabaron los créditos del Sponsorship. No se cambió ni borró nada: todo lo de abajo son propuestas.

## Método y límites

- Hay 4 suscripciones. Todos los recursos (141) están en "Microsoft Azure Sponsorship" (`3d276f7e…`); las otras 3 están vacías.
- **No hay costo real por recurso**: Cost Management no devuelve filas para esta suscripción (los primeros intentos dieron 429 y el último vino vacío). Los importes salen de la Azure Retail Prices API (Norway East, pago por uso, USD) multiplicada por el inventario.
- **Las métricas de uso de Azure Monitor no son fiables aquí**: `ca-api-vio-production` aparece con 0 requests en 30 días, pero `api.vio.live` apunta a esa app y responde 200. Por eso "sin uso" solo se afirma cuando lo respalda la configuración, no la métrica sola.

## Hallazgos (ordenados por ahorro)

| # | Recurso | Hoy | Hallazgo | Propuesta | Ahorro/mes aprox. |
|---|---|---|---|---|---|
| 1 | AKS `vio-commerce-prod` (3 × D4as_v5) | $540 | Pide 7,33 cores y usa ~0,5. El autoscaler tiene min=3 | Bajar los CPU requests y poner min=2, o pasar a 3 × E2as_v5 ($354) | ~$180 |
| 2 | Azure Managed Redis `redus-vio-prod` y `redus-vio-staging` (Balanced B1, $144 c/u) | $288 | 1 % de memoria y máx. 4 ops/s en las dos | Bajar a B0 ($57 c/u), o como mínimo staging. Verificar antes si se puede bajar en caliente o hay que recrear | ~$87–174 |
| 3 | MySQL `vio-ecom-db-prod` y `-staging` (GP D2ds_v4, sin HA) | ~$340–470 | CPU al 3 % y al 1 % | Pasar a Burstable B2ms (~$128 c/u). Requiere reinicio | ~$80–200 |
| 4 | APIM `OpenClawCodex` y `OpenClawCodexRetry` (RG `qa`, Developer) | ~$96 | Los creó angelo@tipio.no el 2026-04-11. Solo tienen la `echo-api` de ejemplo; no son de Vio | Borrar (lo decide Angelo) | ~$96 |
| 5 | App Service plan `ASP-prodreachu-96fd` (B1 **Windows**) | ~$56 | Aloja las funciones legacy `prod-functions-code2` y `qa-functions-code2` (Service Bus de Reachu) | Confirmar con Alan si siguen en uso. Si siguen, pasarlas a Consumption (Y1); si no, borrarlas | ~$56 |
| 6 | Blob `containerproduction2` (1,56 TB, Hot) y `containerqa2` (171 GB, Hot) | ~$36 | Uploads legacy (`outshifter-*`, `reachu-*`). Sin lifecycle policy | Regla de lifecycle a Cool/Cold para lo que tenga más de N días. Ojo con los costos de lectura desde Front Door | ~$15–27 |
| 7 | `claude-trader-rg` (App Service B1 Linux, West Europe, más storage) | ~$14 | App personal (`claude-trader-angelo`) en la factura de Vio | Moverla o borrarla (lo decide Angelo) | ~$14 |
| 8 | Job `pg-stop-api-vio-staging` | — | Su cron es `0 3 1 1 *` (solo el 1 de enero), así que la PG de staging (B1ms) no se apaga nunca. El de development sí (`0 18 * * 1-5`) | Corregir a `0 18 * * 1-5` | ~$7 |
| 9 | ACR `reachuprod2` / `reachuqa2` (Standard, 112 / 116 GB) | ~$42 | Superan los 100 GB incluidos | Purgar tags viejos | ~$2 |

**Total identificado: ~$550–750/mes**, frente a un gasto estimado de ~$1.550/mes.

## Revisado y sin costo raro

- Public IPs: las 8 están asignadas. No hay discos huérfanos ni snapshots.
- Log Analytics: ~1,3 GB/mes en total, dentro de la franja gratuita.
- Service Bus: 4 namespaces Basic, costo despreciable.
- Cuentas de Azure OpenAI/AI Services (`ai-services`, `rg-sonner`): todas las deployments son de pago por token, sin PTU. Las métricas marcan 0 tokens en 30 días (con la salvedad del método), así que no hay costo fijo.
- Front Door `prod-cdn` (Standard, $35 base): se usa, sirve `container.vio.live`, `container-staging.vio.live` y los `container*.reachu.io` legacy.
- ClickHouse `vm-clickhouse-vio` (B2s): es el store de analytics (ADR-0010). Se mantiene.
- Container Apps: entornos Consumption; dev y staging con min=0 réplicas.
- Load Testing `vio-load-testing` (lo creó Angelo en marzo): cobra por uso y no se pudo medir.
- Cluster QA: 2 × E2as_v5. Se apaga y enciende con cron (ver journal 2026-09-16).
