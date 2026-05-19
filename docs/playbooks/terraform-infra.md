---
title: Terraform Infrastructure
description: How to manage Vio Commerce Azure infrastructure with Terraform
category: playbook
tags: [terraform, azure, infrastructure]
status: active
---

# Terraform Infrastructure

All Azure infrastructure for Vio Commerce is managed as code in [vio-live/vio-infra-tf](https://github.com/vio-live/vio-infra-tf).

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) + logged in (`az login`)
- `Storage Blob Data Contributor` role on the `viotfstate` storage account (see Onboarding below)

## Repository layout

```
vio-infra-tf/
├── main.tf              # Provider + remote backend config
├── variables.tf         # subscription_id
├── resource_groups.tf   # prod-reachu, qa, vio-tools, ai-services
├── aks.tf               # AKS clusters (prod + qa) with autoscaler
├── registry.tf          # Container registries (prod + qa)
├── servicebus.tf        # Service Bus namespaces (orders + products × prod/qa)
├── cdn.tf               # Front Door profile + endpoints
├── functions.tf         # App Service Plan + Windows Function Apps
└── storage.tf           # Storage accounts
```

Remote state lives in `viotfstate/tfstate/vio-commerce.tfstate` (Azure Blob, `vio-tools` RG).

## Daily workflow

### Run a plan locally

```bash
cd vio-infra-tf
az login                     # skip if already logged in
terraform init               # first time, or after provider changes
terraform plan
```

### Apply a change

All changes should go through a PR. The CI pipeline runs `terraform plan` automatically and posts the diff as a PR comment. Merge to `main` triggers `terraform apply`.

For urgent changes, apply locally:

```bash
terraform apply
```

Never run `terraform apply` directly on main without a plan review.

### Add a new resource

1. Create or edit the relevant `.tf` file (group by service, not environment).
2. Run `terraform plan` and confirm the diff looks correct.
3. Open a PR — the plan will be posted as a comment.
4. Merge → CI applies automatically.

If you're importing an existing Azure resource:

```bash
terraform import azurerm_resource_type.name "/subscriptions/<sub>/resourceGroups/<rg>/providers/..."
```

Run `terraform state show azurerm_resource_type.name` to capture the current config, then write the matching HCL block.

## CI/CD

GitHub Actions workflow: `.github/workflows/terraform.yml`

| Trigger | Action |
|---------|--------|
| Pull Request → main | `terraform plan` — posts diff as PR comment |
| Push to main | `terraform apply` — applies the approved plan |

### Required GitHub secrets

Set these in **Settings → Secrets and variables → Actions** on `vio-live/vio-infra-tf`:

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | App registration / managed identity client ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | `3d276f7e-0783-4581-8a49-ad0a2c432c63` |

The workflow uses **OIDC federation** (no static credentials). To set it up:

1. Create an App Registration in Azure AD (or use an existing one).
2. Add a **Federated Credential** for the repo:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:vio-live/vio-infra-tf:ref:refs/heads/main` (for apply)
   - Subject: `repo:vio-live/vio-infra-tf:pull_request` (for plan)
3. Grant the App Registration the following roles on the subscription:
   - `Contributor` — to manage resources
   - `Storage Blob Data Contributor` on `viotfstate` storage account — for remote state

## Onboarding a new team member

1. Grant `Storage Blob Data Contributor` on the `viotfstate` storage account:
   ```bash
   az role assignment create \
     --assignee <user-email-or-object-id> \
     --role "Storage Blob Data Contributor" \
     --scope "/subscriptions/3d276f7e-0783-4581-8a49-ad0a2c432c63/resourceGroups/vio-tools/providers/Microsoft.Storage/storageAccounts/viotfstate"
   ```
2. Add them as a collaborator on `vio-live/vio-infra-tf` on GitHub.
3. Verify access: `terraform init && terraform plan` should succeed with no errors.

## Naming conventions

Azure resource names containing "reachu" (e.g. `reachu-prod`, `prodreachua7a9`) are legacy portal-assigned names kept as-is to avoid resource recreation. The product is **Vio Commerce**. New resources should use `vio-` prefixes where possible.

## State management

- Never commit `terraform.tfstate` or `*.tfvars` (both in `.gitignore`).
- If state becomes corrupted: contact the team before running `terraform state` destructive commands.
- To view current state: `terraform state list` / `terraform state show <resource>`.
