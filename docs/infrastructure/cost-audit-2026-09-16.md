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
| 6 | Blob `containerproduction2` (1,56 TB, 6,16 M blobs, Hot) y `containerqa2` (171 GB, 2,4 M blobs, Hot) | ~$36 | Uploads legacy (`outshifter-*`, `reachu-*`) servidos por Front Door | **Aplicado en prod el 2026-09-16** (ver abajo). En QA no se aplica: costaría $26 de una vez para ahorrar $1,7/mes | ~$15 |
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

## Cambio aplicado — punto 6 (2026-09-16, 11:15)

En `containerproduction2` (RG `prod-reachu`):
- Se activó el **seguimiento de último acceso** (last access time tracking, granularidad de 1 día).
- Nueva lifecycle policy `uploads-cool-tras-30d-sin-acceso`: los block blobs de `outshifter-uploads-production/`, `reachu-uploads-production/` y `others/` pasan a **Cool** tras 30 días sin acceso, con `enableAutoTierToHotFromCool` (si se leen, vuelven a Hot solos). `env-file-microservices` queda fuera a propósito.
- Los blobs sin fecha de acceso toman como referencia el día en que se activó el seguimiento, así que las primeras transiciones serán **hacia el 2026-10-16**.
- Números (Retail Prices API): el cambio de tier cuesta ~$0,11 cada 10.000 blobs, **~$68 de una vez** para 6,16 M; ahorra ~$15/mes (Hot $0,0207 → Cool $0,011 por GB). Se paga en ~4,5 meses. Se descartó Cold: $158 de una vez, lecturas ×30 y un mínimo de 90 días.
- Para revertir: `az storage account management-policy delete --account-name containerproduction2 -g prod-reachu`. Los blobs que ya estén en Cool vuelven a Hot al leerlos, o con un Set Blob Tier.
- Verificar en noviembre: métrica `BlobCapacity` por dimensión `Tier`.
