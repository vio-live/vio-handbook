---
title: "Azure Infrastructure Overview"
last-updated: 2026-10-05
owner: miguel
status: live
---

# Azure Infrastructure Overview

Mapa completo de todos los recursos activos en la suscripción Azure de Vio Commerce.

**Suscripción:** Microsoft Azure Sponsorship (`3d276f7e-0783-4581-8a49-ad0a2c432c63`)
**Tenant:** `angelotipio.onmicrosoft.com` (`0c592ce5-257d-49de-b50b-4ac1fbc6fb05`)
**Región principal:** Sweden Central — migrado desde Norway East ([ADR-0021](../decisions/0021-mudar-vio-commerce-a-sweden-central.md)). Corte de prod y staging completo desde 2026-10-01.

> **Reescrito 2026-10-05** (verificado en vivo con `az group/aks/acr/servicebus/mysql/redis/storage list`) tras la mudanza a Suecia. La versión anterior (2026-09-16) describía la infra vieja en Norway East (`rg-vio-commerce-prod`, `reachuprod2`, IP `20.100.174.93`) — todo eso ya no existe.

---

## Clusters AKS

| Cluster | Resource Group | Región | VM Size | Nodos | Power State |
|---|---|---|---|---|---|
| `vio-commerce-prod-sc` | `rg-vio-commerce-prod-sc` | Sweden Central | Standard_D4as_v5 | 3 | **Stopped** (ver scheduler) |
| `kubernetesqa-sc` | `rg-vio-qa-sc` | Sweden Central | Standard_B2ms | 2 | **Stopped** (ver scheduler) |

> Power state verificado 2026-10-05 04:04 CEST — ambos clusters apagados por el scheduler de horario laboral (fuera de la ventana 07:00–01:00 Oslo). No es una caída: ver [`qa-aks-scheduler.md`](./qa-aks-scheduler.md) para la lógica de encendido/apagado (ese doc describe el cluster QA viejo en Norway East — **pendiente de actualizar** con el cluster `-sc`).

### `vio-commerce-prod-sc` (prod)
- Kubernetes: 1.35 (current 1.35.7)
- Node RG: `MC_rg-vio-commerce-prod-sc_vio-commerce-prod-sc_swedencentral`
- Ingress: **Istio** (`istio-ingress-vio-prod-sc`) — IP `135.116.206.152` (reemplaza a la vieja `20.100.174.93`)
- Outbound: `aks-outbound-vio-prod-sc` — IP `4.223.89.241` (es la única IP permitida en el firewall de MySQL prod)
- IP huérfana: `nginx-ingress-vio-prod-sc` (`4.225.221.49`) — existe pero no está en uso por ningún dominio activo (Istio es el ingress real)
- ACR: `vioprodsc.azurecr.io`
- Redis: **Azure Managed Redis Enterprise** (`redus-vio-prod-sc`), TLS obligatoria
- cert-manager: DNS-01 vía Cloudflare (HTTP-01/nginx no sirve: todo el tráfico entra por Istio)

### `kubernetesqa-sc` (QA/staging Commerce)
- Kubernetes: 1.35.7
- Node RG: `MC_rg-vio-qa-sc_kubernetesqa-sc_swedencentral`
- IPs en el node RG: `kubernetes-a5f09c5bf723e4698b74e2ae5ebfe755` (`74.158.41.166`, ingress activo) y `d2f92b10-ced6-4304-b71f-f63a14b43372` (`57.174.14.11`)
- ACR: `vioqasc.azurecr.io`
- Redis: **Azure Managed Redis Enterprise** (`redus-vio-staging-sc`)

---

## Resource Groups viejos (Norway East) — ya no tienen infra de Commerce

`prod-reachu` y `qa` siguen existiendo pero están vacíos de AKS/ACR/Service Bus (todo eso se eliminó o migró a Suecia). Lo único que queda son residuos sin relación con Commerce:

| RG | Qué queda |
|---|---|
| `prod-reachu` | 2 storage accounts huérfanos (`prodreachua7a9`, `prodreachua371`) |
| `qa` | Storage/App Insights de `vio-partner-mock` (herramienta de testing, no Commerce), identidad `oidc-msi-a7e1` |

No borrar sin confirmar con Angelo — puede haber dependencias no documentadas.

---

## Dominios

| Dominio | Servicio | IP / destino |
|---|---|---|
| `api-ecom.vio.live` | base-api (prod) | `135.116.206.152` (Istio, `vio-commerce-prod-sc`) |
| `graph-ql.vio.live` | graph-ql (prod) | `135.116.206.152` |
| `dashboard.ecom.vio.live` | webapp | CNAME a Vercel |

> `sales-channel.vio.live`, `shopify-seller.vio.live`, `msrvc.vio.live` — **deprecados**, sin DNS, no usar.

---

## Container Registries

| Recurso | RG | Región | Tier | Uso |
|---|---|---|---|---|
| `vioprodsc` | `rg-vio-commerce-prod-sc` | Sweden Central | Standard | Vio Commerce prod (reemplaza a `reachuprod2`) |
| `vioqasc` | `rg-vio-qa-sc` | Sweden Central | Standard | Vio Commerce QA/staging (reemplaza a `reachuqa2`) |
| `acrvioapi` | `rg-vio-shared` | Norway East | Basic | Huérfano — era de los Container Apps de `api-vio`, eliminados (ver sección siguiente) |

---

## Redis

Azure Managed Redis **Enterprise**, uno por entorno:

| Recurso | RG | Entorno |
|---|---|---|
| `redus-vio-prod-sc` | `rg-vio-commerce-prod-sc` | Prod |
| `redus-vio-staging-sc` | `rg-vio-qa-sc` | QA/staging |

- TLS obligatoria en todos los entornos
- `redus-vio-prod-sc` **no es cache**: guarda tokens OAuth offline de Shopify sin TTL — nunca recrear vacío, mantener HA

---

## Service Bus

| Recurso | RG | Entorno |
|---|---|---|
| `vio-order-processing-sc` | `rg-vio-commerce-prod-sc` | Prod |
| `vio-product-processing-sc` | `rg-vio-commerce-prod-sc` | Prod |
| `vio-qa-order-processing-sc` | `rg-vio-qa-sc` | QA/staging |
| `vio-qa-product-processing-sc` | `rg-vio-qa-sc` | QA/staging |

Reemplazan a `production-order-processing2` / `production-product-processing2` (RG `prod-reachu`, ya eliminados).

---

## MySQL

| Recurso | RG | Región | SKU | Estado |
|---|---|---|---|---|
| `vio-ecom-db-prod-sc` | `rg-vio-databases` | Sweden Central | Standard_D2ds_v4 (GeneralPurpose) | **Stopped** (scheduler) |
| `vio-ecom-db-staging-sc` | `rg-vio-qa-sc` | Sweden Central | Standard_B2s (Burstable) | **Stopped** (scheduler) |

> `rg-vio-databases` figura como RG en Norway East por metadata, pero el servidor en sí corre en Sweden Central (un RG puede alojar recursos de otra región).
> Sweden Central **no soporta geo-backup nativo** para MySQL Flexible Server — la única protección regional es el CronJob diario que copia el backup a `viodbbackupwe` (West Europe, GRS, retención 90d). Retención local en 35 días. HA sigue diferida (+178 USD/mes, pendiente de OK).

---

## Storage Accounts

| Recurso | RG | Región | Uso |
|---|---|---|---|
| `containerproductionsc` | `rg-vio-commerce-prod-sc` | Sweden Central | Blobs prod (reemplaza a `containerproduction2`) |
| `containerqasc` | `rg-vio-qa-sc` | Sweden Central | Blobs QA/staging |
| `saapivio` | `rg-vio-shared` | Norway East | DB snapshots + sponsor media uploads (no migrado, backup a GRS) |

---

## api-vio — Container Apps (socket-server backend) — **eliminado de Azure**

Esta sección describía `rg-api-vio-production` / `rg-api-vio-staging` con los Container Apps `ca-api-vio-production` / `ca-api-vio-staging`. **Verificado 2026-10-05: esos resource groups ya no existen** — Vio Backend fue desmantelado de Azure el 2026-09-25 y rehospedado en Oracle Cloud Always Free.

- `api.vio.live` → `82.70.54.151` (Oracle, `eu-stockholm-1`, instancia `vio-backend-amd`)
- `api-staging.vio.live` → `129.151.196.99` (Oracle)
- Detalle completo: [`vio-backend-oracle.md`](./vio-backend-oracle.md) y [`vio-staging-oracle.md`](./vio-staging-oracle.md)

> Vio Backend y Vio Commerce nunca comparten infra — esta sección queda solo como nota histórica de que ese costo ya no está en esta suscripción Azure.

---

## Cloudflare (vio.live)

- Zone ID: `d8ebb16763e96258028487006145eb9c`
- WAF custom ruleset activo: bloqueo de `.php` scanners (creado 2026-07-01)
- `container.vio.live` migrado de Front Door a Cloudflare (2026-09-30)

---

## Ver también

- [`docs/decisions/0021-mudar-vio-commerce-a-sweden-central.md`](../decisions/0021-mudar-vio-commerce-a-sweden-central.md) — decisión y motivo de la mudanza
- [`docs/infrastructure/environments-and-endpoints.md`](./environments-and-endpoints.md) — mapa dominios × entorno (**pendiente de actualizar** con los nombres `-sc`)
- [`docs/infrastructure/qa-aks-scheduler.md`](./qa-aks-scheduler.md) — scheduler de encendido/apagado (**pendiente de actualizar** con el cluster `-sc`)
- [`docs/infrastructure/backup-db-prod.md`](./backup-db-prod.md) — backup offsite de MySQL prod
- [`docs/playbooks/cluster-restore.md`](../playbooks/cluster-restore.md) — restaurar cluster desde cero (**pendiente de actualizar** con los nombres `-sc`)
- [`docs/journal/`](../journal/) — log de cambios
