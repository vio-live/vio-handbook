---
title: Terraform Infrastructure
description: How to manage Vio Commerce Azure infrastructure with Terraform
category: playbook
tags: [terraform, azure, infrastructure]
status: active
last-updated: 2026-05-27
---

# Terraform Infrastructure

All Azure infrastructure for Vio Commerce is managed as code in [vio-live/vio-infra-tf](https://github.com/vio-live/vio-infra-tf).

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) + logged in (`az login`)
- `Storage Blob Data Contributor` role on the `viotfstate` storage account

## Repository layout

```
vio-infra-tf/
├── main.tf              # Provider + remote backend config
├── variables.tf         # subscription_id
├── resource_groups.tf   # prod-reachu, qa, vio-tools, ai-services
├── aks.tf               # AKS clusters + ACR pull + static IPs + egress IPs
├── registry.tf          # Container registries (prod + qa)
├── servicebus.tf        # Service Bus namespaces
├── cdn.tf               # Front Door profile + endpoints
├── functions.tf         # App Service Plan + Windows Function Apps
└── storage.tf           # Storage accounts
```

Remote state: `viotfstate/tfstate/vio-commerce.tfstate` (Azure Blob, `vio-tools` RG, `use_azuread_auth=true`).

## ⚠️ CI/CD — apply requiere dispatch manual

> **El workflow NO aplica automáticamente en push a main.** Esto se cambió tras el incidente del 2026-05-23 donde un apply automático con tfstate vacío destruyó ambos clusters.

| Trigger | Acción |
|---|---|
| Push / PR → main | Solo `terraform plan` |
| `workflow_dispatch` con `apply: true` | `terraform plan` + `terraform apply` |

Para aplicar cambios:
1. Merge el PR a main
2. Ir a Actions → Terraform → Run workflow → seleccionar `apply: true`

## Workflow local

```bash
cd vio-infra-tf
az login
terraform init
terraform plan
terraform apply   # solo para cambios urgentes — preferir CI
```

## Recursos que NO gestiona Terraform (aplicar manualmente)

Estos recursos se crean manualmente y se referencian con `data` sources en `aks.tf`:
- `nginx-ingress-prod` / `nginx-ingress-qa` — IPs estáticas para nginx-ingress
- `aks-outbound-prod` / `aks-outbound-qa` — IPs estáticas de egress

Los manifiestos de Kubernetes (Redis, nginx-ingress, cert-manager, ingresses) están en `vio-live/vio-kubernetes-config` y se aplican manualmente. Ver [cluster-restore.md](./cluster-restore.md).

## Secrets de GitHub (vio-live/vio-infra-tf)

| Secret | Valor |
|---|---|
| `AZURE_CLIENT_ID` | Client ID del federated identity |
| `AZURE_TENANT_ID` | `0c592ce5-257d-49de-b50b-4ac1fbc6fb05` |
| `AZURE_SUBSCRIPTION_ID` | `3d276f7e-0783-4581-8a49-ad0a2c432c63` |

Usa **OIDC federation** (sin credenciales estáticas). El `vio-infra-tf-cicd` SP está **deshabilitado** — no reactivar.

## Naming

Recursos con "reachu" en el nombre (e.g. `reachu-prod`, `reachuprod2`) son nombres legacy de portal. El producto es **Vio Commerce**. Nuevos recursos: prefijo `vio-` donde sea posible.
