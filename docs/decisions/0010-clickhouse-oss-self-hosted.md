---
title: "ADR-0010: ClickHouse OSS self-hosted en VM propia (no Cloud)"
last-updated: 2026-08-20
owner: angelo
status: live
---

# ADR-0010: ClickHouse OSS self-hosted en VM propia (no Cloud)

## Context

ADR-0009 fija ClickHouse como system of record de analytics. El plan
original (2026-07-27) asumía **ClickHouse Cloud** (managed, EU). Al momento
de provisionar (2026-08-20), Angelo preguntó por la versión open source y
decidió self-hosted tras ver el trade-off.

## Decision

**ClickHouse OSS 24.8 en una VM propia** (`vm-clickhouse-vio`,
`rg-vio-shared`, norwayeast), gestionada por Terraform en
`vio-analytics/infra/clickhouse.tf`:

- **Una VM, una database por entorno** (`vio_development` / `vio_staging` /
  `vio_production`). El colector bootstrapea su propia database+tabla al
  arrancar (idempotente) — cero DDL manual. Se separa en más VMs cuando el
  volumen lo pida.
- **Tamaño launch**: B2s + disco de datos dedicado 128GB (StandardSSD,
  ext4 en `/data`, LUN 10). ~40–50€/mes total.
- **Exposición mínima**: ClickHouse en Docker SOLO accesible vía Caddy
  (80 para ACME, 443 TLS). **TLS automático** (Let's Encrypt) sobre el
  FQDN de Azure `vio-clickhouse.norwayeast.cloudapp.azure.com` — sin
  esperar DNS propio. **Sin SSH en el NSG**: operación por
  `az vm run-command invoke -g rg-vio-shared -n vm-clickhouse-vio`.
- **Backups nuestros** (el costo real de self-hosted, automatizado):
  cron 03:00 UTC, `BACKUP DATABASE vio_* TO AzureBlobStorage` (zstd) al
  storage existente `saapivio`, container `clickhouse-backups`.

## Rationale

| | OSS self-hosted (elegido) | ClickHouse Cloud |
|---|---|---|
| Dato | En el tenant de Vio | Cuenta de ClickHouse Inc (EU) |
| Costo launch | ~40–50€/mes fijo | ~2× y escala con uso |
| Ops | Nuestros (automatizados acá) | Cero |
| Migración futura | backup/restore + cambiar `CLICKHOUSE_URL` — el código no distingue | ídem |

La escala del launch (un sponsor, un mercado) cabe holgada en una VM chica;
el diseño del pipeline ya tolera caídas cortas (buffers acotados en el
colector, retries con `event_id` estable en SDKs y outbox). La decisión es
reversible barato en cualquier dirección.

## Consequences

- Upgrades de ClickHouse y crecimiento de disco son responsabilidad
  nuestra (playbook `operate-vio-analytics.md`).
- Nodo único = ventana de indisponibilidad si la VM muere; mitigada por
  los retries del ecosistema y el backup diario. HA real (réplicas) queda
  para cuando haya tráfico que lo justifique.
- El password del user `default` vive en `infra/terraform.tfvars`
  (gitignorado) y en los secrets de los Container Apps del colector.
