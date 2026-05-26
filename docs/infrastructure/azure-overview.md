---
title: "Azure Infrastructure Overview"
last-updated: 2026-05-27
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

| Cluster | Resource Group | VM Size | Autoscaling | Ingress IP (static) | Egress IP (static) |
|---|---|---|---|---|---|
| `reachu-prod` | `prod-reachu` | Standard_D4as_v5 | ✅ min=2 max=4 | `20.100.188.135` | `20.100.186.77` |
| `kubernetesqa` | `qa` | Standard_D2s_v5 | ✅ min=1 max=3 | `20.100.180.164` | `20.100.169.12` |

### IPs estáticas (permanentes — sobreviven recreación del cluster)

| Recurso Azure | RG | IP | Propósito |
|---|---|---|---|
| `nginx-ingress-prod` | `prod-reachu` | `20.100.188.135` | Ingress HTTP/HTTPS prod |
| `aks-outbound-prod` | `prod-reachu` | `20.100.186.77` | Egress prod (MySQL firewall) |
| `nginx-ingress-qa` | `qa` | `20.100.180.164` | Ingress HTTP/HTTPS QA |
| `aks-outbound-qa` | `qa` | `20.100.169.12` | Egress QA (MySQL firewall) |

### Prod (`reachu-prod`)
- Node RG: `MC_prod-reachu_reachu-prod_norwayeast`
- ACR: `reachuprod2.azurecr.io`
- Kubelet identity: `ab6a040d-83d1-4530-aa54-c1f0ca66d103`
- Redis master ClusterIP: `10.0.210.133`

### QA (`kubernetesqa`)
- Node RG: `MC_qa_kubernetesqa_norwayeast`
- ACR: `reachuqa2.azurecr.io`
- Kubelet identity: `af64ece5-d224-40f3-9a9e-118c65d9b049`
- Redis master ClusterIP: `10.0.188.111`

---

## Servicios en Kubernetes

### Prod — `reachu-prod` (todos en namespace `default`)

| Helm release | Imagen ACR | Réplicas |
|---|---|---|
| api | `reachuprod2.azurecr.io/api` | 2 |
| base-api | `reachuprod2.azurecr.io/base-api` | 2 |
| graph-ql | `reachuprod2.azurecr.io/graph-ql` | 2 |
| middleware | `reachuprod2.azurecr.io/middleware` | 2 |
| products | `reachuprod2.azurecr.io/products` | 2 |
| users | `reachuprod2.azurecr.io/users` | 2 |
| orders | `reachuprod2.azurecr.io/orders` | 2 |
| shopcart | `reachuprod2.azurecr.io/shopcart` | 2 |
| collections | `reachuprod2.azurecr.io/collections` | 2 |
| tracking | `reachuprod2.azurecr.io/tracking` | 2 |
| extensions | `reachuprod2.azurecr.io/extensions` | 2 |
| payment-processors | `reachuprod2.azurecr.io/payment-processors` | 2 |
| redis (StatefulSet) | `redis:7-alpine` | 1 |
| redis-sentinel (StatefulSet) | `redis:7-alpine` | 4 |

Sistema: `ingress-nginx-4.15.1` (ns `ingress-nginx`), `cert-manager-v1.20.2` (ns `cert-manager`)

### QA — `kubernetesqa` (namespace `default`)

Todo lo de prod más:

| Helm release | Imagen ACR | Réplicas |
|---|---|---|
| socket-server | `reachuqa2.azurecr.io/socket-server` | 1 |
| webapp | `reachuqa2.azurecr.io/webapp` | 2 |

> `bigcommerce-app`, `shopify-export`, `shopify-import` — en 0 réplicas en QA. Levantar con `kubectl scale deployment/<nombre> --replicas=1` si se necesitan.

---

## Dominios y DNS

Todos los DNS deben apuntar a las IPs estáticas. Nunca a IPs dinámicas.

### Prod (`20.100.188.135`)

| Dominio | Servicio | HTTPS |
|---|---|---|
| `api.reachu.io` | base-api | ✅ Let's Encrypt |
| `graph-ql.vio.live` | graph-ql | ✅ Let's Encrypt |
| `graph-ql.reachu.io` | graph-ql | ✅ Let's Encrypt |
| `api-ecom.vio.live` | base-api | ⏳ sin DNS |

### QA (`20.100.180.164`)

| Dominio | Servicio | HTTPS |
|---|---|---|
| `api-dev.vio.live` | socket-server | ✅ Let's Encrypt |
| `graph-ql-dev.vio.live` | graph-ql | ✅ Let's Encrypt |
| `webapp-dev.vio.live` | webapp | ✅ Let's Encrypt |
| `api-qa.reachu.io` | base-api | ✅ Let's Encrypt |
| `api-ecom-dev.vio.live` | base-api | ⏳ sin DNS |

---

## Bases de datos externas (Hetzner)

| Servidor | IP | Entorno | Puerto | Egress IP whitelistada |
|---|---|---|---|---|
| `server-bd-prod` | `204.168.185.15` | Prod | 3306 (MySQL) | `20.100.186.77` |
| `server-bd-develop` | `204.168.215.2` | QA | 3306 (MySQL) | `20.100.169.12` |

> Neon Postgres (socket-server QA): `ep-summer-star-a89av46e-pooler.eastus2.azure.neon.tech`

---

## Container Registries

| Recurso | RG | Tier |
|---|---|---|
| `reachuprod2` | prod-reachu | Standard |
| `reachuqa2` | qa | Standard |

---

## Service Bus

| Recurso | RG | Tier |
|---|---|---|
| `production-order-processing2` | prod-reachu | Basic |
| `production-product-processing2` | prod-reachu | Basic |
| `qa-order-processing2` | qa | Basic |
| `qa-product-processing2` | qa | Basic |

---

## Storage Accounts

| Recurso | RG | Uso |
|---|---|---|
| `containerproduction2` | prod-reachu | Blobs prod (`AZ_STORAGE=containerproduction2`) |
| `containerqa2` | qa | Blobs QA (`AZ_STORAGE=containerqa2`) |
| `prodreachua7a9` | prod-reachu | Functions prod |
| `prodreachua371` | prod-reachu | Legacy |
| `qa8ecc` | qa | Legacy |
| `viopartnermockqasa` | qa | Partner mock QA |
| `viopartnermockv2sa` | qa | Partner mock v2 |

---

## Azure Functions

| Recurso | RG | Plan | Estado |
|---|---|---|---|
| `prod-functions-code2` | prod-reachu | `ASP-prodreachu-96fd` (B1 Windows) | Running |
| `qa-functions-code2` | qa | mismo plan | Running |

---

## CDN (Azure Front Door)

- Perfil: `prod-cdn` (Standard_AzureFrontDoor, `prod-reachu`)
- Endpoints: `prod-cdn-reachu`, `qa-cdn-reachu`

---

## API Management

| Recurso | RG | Tier |
|---|---|---|
| `OpenClawCodex` | qa | Developer |
| `OpenClawCodexRetry` | qa | Developer |

---

## Ver también

- [`docs/playbooks/terraform-infra.md`](../playbooks/terraform-infra.md) — gestión de IaC
- [`docs/playbooks/cluster-restore.md`](../playbooks/cluster-restore.md) — restaurar cluster desde cero
- [`docs/journal/`](../journal/) — log de cambios
