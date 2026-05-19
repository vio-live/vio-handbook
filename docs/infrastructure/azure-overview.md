---
title: "Azure Infrastructure Overview"
last-updated: 2026-05-18
owner: angelo
status: live
---

# Azure Infrastructure Overview

Mapa completo de todos los recursos activos en la suscripción Azure de Vio Commerce.

**Suscripción:** Microsoft Azure Sponsorship (`3d276f7e-0783-4581-8a49-ad0a2c432c63`)  
**Tenant:** `angelotipio.onmicrosoft.com`  
**Región principal:** Norway East

---

## Clusters AKS

| Cluster | Resource Group | Nodos | VM Size | vCPU/RAM | Autoscaling | Costo/mes est. |
|---|---|---|---|---|---|---|
| `reachu-prod` | `prod-reachu` | 2 | Standard_D4as_v5 | 4 vCPU / 16 GB | ❌ No | ~$276 |
| `kubernetesqa` | `qa` | 3 | Standard_D2s_v5 | 2 vCPU / 8 GB | ❌ No | ~$207 |

### Prod (`reachu-prod`)
- Node pool: `agentpool` (System), modo fijo, 2 nodos
- Sin autoscaler habilitado — siempre corre 2 nodos independientemente de la carga
- Región: Norway East

### QA (`kubernetesqa`)
- Node pool: `agentpool` (System), modo fijo, 3 nodos
- Sin autoscaler — 3 nodos siempre activos
- Región: Norway East

---

## API Management

| Recurso | RG | Tier | Región | Costo/mes est. |
|---|---|---|---|---|
| `OpenClawCodex` | qa | Developer | Norway East | ~$50 |
| `OpenClawCodexRetry` | qa | Developer | Norway East | ~$50 |

> ⚠️ El tier Developer no tiene SLA de producción. No usar en ambientes críticos.

---

## Container Registries

| Recurso | RG | Tier | Costo/mes est. |
|---|---|---|---|
| `reachuprod2` | prod-reachu | Standard | ~$20 |
| `reachuqa2` | qa | Standard | ~$20 |

---

## App Service Plans y Web Apps

| Plan | RG | Tier | App(s) alojadas | Estado app | Costo/mes est. |
|---|---|---|---|---|---|
| `ASP-prodreachu-a6f6` | prod-reachu | B1 | `reachu-prod-webapp` | **STOPPED** | ~$13 |
| `ASP-prodreachu-96fd` | prod-reachu | B1 | `prod-functions-code2` | Running | ~$13 |
| `ASP-qa-a51f` | qa | B1 | `reachu-qa-webapp` | Running | ~$13 |
| `NorwayEastPlan` | vio-tools | Y1 (Consumption) | `vio-trello-webhook` | Running | ~$0–2 |
| `viopartnermockv2-plan` | qa | — | `viopartnermockv2` | Running | — |

> ⚠️ `ASP-prodreachu-a6f6` cobra ~$13/mes aunque su app esté stopped. Candidato a eliminar.

---

## Service Bus

| Recurso | RG | Tier |
|---|---|---|
| `production-order-processing2` | prod-reachu | Basic |
| `production-product-processing2` | prod-reachu | Basic |
| `qa-order-processing2` | qa | Basic |
| `qa-product-processing2` | qa | Basic |

Todos en tier Basic — mínimo costo posible. Sin acción necesaria.

---

## Storage Accounts

| Recurso | RG | Uso conocido |
|---|---|---|
| `containerproduction2` | prod-reachu | Blobs producción |
| `containerqa2` | qa | Blobs QA |
| `viotoolsstorage2026` | vio-tools | Herramientas Vio |
| `viopartnermockqasa` | qa | Partner mock QA |
| `viopartnermockv2sa` | qa | Partner mock v2 |
| `prodreachua7a9` | prod-reachu | — |
| `prodreachua371` | prod-reachu | — |
| `qa8ecc` | qa | — |

---

## AI / Cognitive Services

| Recurso | RG | Región | Tipo |
|---|---|---|---|
| `vio-openai-main` | ai-services | Norway East | Azure OpenAI |
| `vio-openai-engagement` | ai-services | Norway East | Azure OpenAI |
| `sonnet-resource-vio` | rg-sonner | Sweden Central | CognitiveServices |
| `angel-mnqj7rxe-eastus2` | ai-services | East US 2 | CognitiveServices |
| `agent-coordinator-angel-resource` | ai-services | North Europe | CognitiveServices |

Cobran por uso — revisar métricas si alguna tiene tráfico cero.

---

## CDN

| Recurso | RG | Endpoints |
|---|---|---|
| `prod-cdn` | prod-reachu | `prod-cdn-reachu`, `qa-cdn-reachu` (Azure Front Door) |

---

## Otros

| Recurso | RG | Tipo | Nota |
|---|---|---|---|
| `vio-load-testing` | qa | Load Test Service | Revisar si tiene runs activos |
| `NetworkWatcherRG` | NetworkWatcherRG | Network Watcher | Automático de Azure, costo mínimo |

---

## Costo mensual estimado total

| Categoría | Costo/mes est. |
|---|---|
| AKS (2 clusters) | ~$483 |
| APIM (2 instancias) | ~$100 |
| Container Registry (x2) | ~$40 |
| App Service Plans | ~$39 |
| Storage, Service Bus, CDN | ~$20–40 |
| AI/Cognitive Services | variable (uso) |
| **TOTAL estimado** | **~$680–700/mes** |

---

## Ver también

- [`docs/playbooks/aks-autoscaling.md`](../playbooks/aks-autoscaling.md) — plan de autoscaling y reducción de costos
- [`docs/decisions/`](../decisions/) — decisiones arquitecturales
- [`docs/journal/`](../journal/) — log de cambios realizados
