---
title: "Azure Infrastructure Overview"
last-updated: 2026-07-02
owner: angelo
status: live
---

# Azure Infrastructure Overview

Mapa completo de todos los recursos activos en la suscripción Azure de Vio Commerce.

**Suscripción:** Microsoft Azure Sponsorship (`3d276f7e-0783-4581-8a49-ad0a2c432c63`)  
**Tenant:** `angelotipio.onmicrosoft.com` (`0c592ce5-257d-49de-b50b-4ac1fbc6fb05`)  
**Región principal:** Norway East

---

## Clusters AKS

> **Corrección 2026-08-24:** esta nota decía que `kubernetesqa` (RG `qa`) ya no existía — falso. Se recreó (~2026-07-09) y está activo como cluster QA de **Vio Commerce**. `reachu-prod` (RG `prod-reachu`) sí sigue eliminado. Esta imprecisión causó que un agente casi mezclara infra de Vio Backend con este cluster el 2026-08-24 — ver [`lessons/dont-mix-vio-commerce-and-vio-backend-infra.md`](../lessons/dont-mix-vio-commerce-and-vio-backend-infra.md).

| Cluster | Resource Group | VM Size | Nodos | Ingress IP |
|---|---|---|---|---|
| `vio-commerce-prod` | `rg-vio-commerce-prod` | Standard_D4as_v5 | 3 | `20.100.174.93` |
| `kubernetesqa` | `qa` | Standard_D2s_v5 | 3 | — (namespace `default`: base-api, graph-ql, products, users, etc. — microservicios de Commerce QA) |

### `vio-commerce-prod` (único cluster activo)
- Kubernetes: v1.34.8
- Ingress: **Istio** (`istio-ingressgateway`) — IP `20.100.174.93`
- ACR: `reachuprod2.azurecr.io`
- Redis: **Azure Managed Redis** (externo, con TLS obligatoria) — migrado 2026-07-01
- cert-manager: ClusterIssuer `letsencrypt-prod`

---

## Microservicios en `vio-commerce-prod` (namespace `default`)

| Deployment | Imagen | Réplicas |
|---|---|---|
| api | `reachuprod2.azurecr.io/api` | 2 |
| base-api | `reachuprod2.azurecr.io/base-api` | 3 |
| graph-ql | `reachuprod2.azurecr.io/graph-ql` | 2 |
| middleware | `reachuprod2.azurecr.io/middleware` | 3 |
| products | `reachuprod2.azurecr.io/products` | 2 |
| users | `reachuprod2.azurecr.io/users` | 2 |
| orders | `reachuprod2.azurecr.io/orders` | 2 |
| shopcart | `reachuprod2.azurecr.io/shopcart` | 2 |
| collections | `reachuprod2.azurecr.io/collections` | 2 |
| tracking | `reachuprod2.azurecr.io/tracking` | 3 |
| extensions | `reachuprod2.azurecr.io/extensions` | 2 |
| payment-processors | `reachuprod2.azurecr.io/payment-processors` | 2 |
| shopify-export | `reachuprod2.azurecr.io/shopify-export` | 2 |
| shopify-import | `reachuprod2.azurecr.io/shopify-import` | 2 |
| webapp | `reachuprod2.azurecr.io/webapp` | 2 |
| templates | `reachuprod2.azurecr.io/templates` | 1 |

> Redis ya no corre como StatefulSet en el cluster. Eliminados 2026-07-01: `redis`, `redis-sentinel`, `redis-svc`, `redis-nodeport`, `redis-sentinel-config`.

---

## Dominios

| Dominio | Servicio | IP |
|---|---|---|
| `api-ecom.vio.live` | base-api | `20.100.174.93` |
| `graph-ql.vio.live` | graph-ql | `20.100.174.93` |
| `dashboard.ecom.vio.live` | webapp | `20.100.174.93` |

> `sales-channel.vio.live`, `shopify-seller.vio.live`, `msrvc.vio.live` — **deprecados**, sin DNS, no usar.

---

## Container Registries

| Recurso | RG | Tier | Uso |
|---|---|---|---|
| `reachuprod2` | `prod-reachu` | Standard | Vio Commerce microservices |
| `acrvioapi` | `rg-vio-shared` | Standard | socket-server / api-vio backend |

> `reachuqa2` (RG `qa`) — activo, usado por el cluster `kubernetesqa` (Commerce QA). Corregido 2026-08-24 — ver nota en la sección "Clusters AKS".

---

## Redis

Azure Managed Redis. Migrado desde Redis Sentinel en-cluster el 2026-07-01 (Alan).
- TLS obligatoria en todos los entornos
- `@reachu/service` package actualizado para soportar Azure Managed Redis con TLS
- `graph-ql` y `base-api` tienen lógica propia (no usan `@reachu/service`) — también actualizados

---

## Service Bus

| Recurso | RG | Tier |
|---|---|---|
| `production-order-processing2` | `prod-reachu` | Basic |
| `production-product-processing2` | `prod-reachu` | Basic |

> Service Bus de QA (`qa-order-processing2`, `qa-product-processing2`) en RG `qa` — verificar si siguen activos o se eliminaron con el cluster.

---

## Storage Accounts

| Recurso | RG | Uso |
|---|---|---|
| `containerproduction2` | `prod-reachu` | Blobs prod (`AZ_STORAGE=containerproduction2`) |
| `saapivio` | `rg-vio-shared` | DB snapshots + sponsor media uploads |

---

## api-vio — Container Apps (socket-server backend)

Infraestructura independiente de AKS. Módulo Terraform `socket-server-env` en `vio-live/vio-infra-tf`.

### Resource Groups

| RG | Entorno |
|---|---|
| `rg-api-vio-production` | Production |
| `rg-api-vio-staging` | Staging |
| `rg-api-vio-development` | Development |

### Container Apps

| Entorno | Container App | Dominio custom |
|---|---|---|
| production | `ca-api-vio-production` | `api.vio.live` ✅ |
| staging | `ca-api-vio-staging` | `api-staging.vio.live` ✅ |
| development | `ca-api-vio-development` | `api-dev.vio.live` ✅ |

ACR: `acrvioapi.azurecr.io` (imagen: `acrvioapi.azurecr.io/socket-server`)

### PostgreSQL Flexible Server (acceso privado por VNet)

| Entorno | Servidor | SKU |
|---|---|---|
| production | `pg-api-vio-production.postgres.database.azure.com` | GP_Standard_D2s_v3 |
| staging | `pg-api-vio-staging.postgres.database.azure.com` | B_Standard_B1ms |
| development | `pg-api-vio-development.postgres.database.azure.com` | B_Standard_B1ms |

### CI/CD

Repo: `tipiodevelopment/socket-server` → `.github/workflows/deploy.yml`
- Push a `main` → deploy a development
- `workflow_dispatch` → cualquier entorno

---

## Cloudflare (vio.live)

- Zone ID: `d8ebb16763e96258028487006145eb9c`
- WAF custom ruleset activo: bloqueo de `.php` scanners (creado 2026-07-01)

---

## Ver también

- [`docs/infrastructure/environments-and-endpoints.md`](./environments-and-endpoints.md) — mapa dominios × entorno
- [`docs/playbooks/cluster-restore.md`](../playbooks/cluster-restore.md) — restaurar cluster desde cero
- [`docs/journal/`](../journal/) — log de cambios
