---
title: "Cluster Restore Playbook"
description: Restaurar un cluster AKS de Vio Commerce desde cero
category: playbook
tags: [kubernetes, azure, disaster-recovery]
status: active
last-updated: 2026-05-27
---

# Cluster Restore Playbook

Procedimiento completo para restaurar `reachu-prod` o `kubernetesqa` tras una destrucción accidental.

> Este playbook documenta las lecciones del incidente del 2026-05-23 donde terraform CI destruyó ambos clusters.

---

## Paso 1 — Permisos ACR

```bash
az aks update --attach-acr reachuprod2 --resource-group prod-reachu --name reachu-prod
# QA:
az aks update --attach-acr reachuqa2 --resource-group qa --name kubernetesqa
```

Definido en `aks.tf` vía `azurerm_role_assignment` — automático en el próximo recreate vía Terraform.

---

## Paso 2 — nginx-ingress con IP estática

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx

# Prod (IP permanente: 20.100.188.135):
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.loadBalancerIP=20.100.188.135 \
  --set "controller.service.annotations.service\.beta\.kubernetes\.io/azure-pip-name=nginx-ingress-prod" \
  --set "controller.service.annotations.service\.beta\.kubernetes\.io/azure-load-balancer-resource-group=prod-reachu"

# QA (IP permanente: 20.100.180.164):
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.loadBalancerIP=20.100.180.164 \
  --set "controller.service.annotations.service\.beta\.kubernetes\.io/azure-pip-name=nginx-ingress-qa" \
  --set "controller.service.annotations.service\.beta\.kubernetes\.io/azure-load-balancer-resource-group=qa"
```

---

## Paso 3 — Fix Azure LB health probes

⚠️ nginx-ingress crea probes HTTP que fallan (nginx devuelve 404). Cambiar a TCP:

```bash
RG="MC_prod-reachu_reachu-prod_norwayeast"   # o MC_qa_kubernetesqa_norwayeast
LB="kubernetes"
az network lb probe list --resource-group $RG --lb-name $LB -o table
# Actualizar cada probe:
az network lb probe update --resource-group $RG --lb-name $LB --name <probe> --protocol Tcp --path ""
```

---

## Paso 4 — cert-manager + ClusterIssuer

```bash
helm repo add jetstack https://charts.jetstack.io
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true

kubectl apply -f PROD/cert-manager-issuer.yaml   # o QA/
```

---

## Paso 5 — Redis + Sentinel

```bash
kubectl apply -f PROD/redis-stack.yaml   # o QA/
```

⚠️ Verificar que el ClusterIP de `redis-svc` coincide con el del ConfigMap:
```bash
kubectl get svc redis-svc -o jsonpath='{.spec.clusterIP}'
```
Si difiere, actualizar el ConfigMap y reiniciar los pods sentinel.

- Prod ClusterIP esperado: `10.0.210.133`
- QA ClusterIP esperado: `10.0.188.111`

---

## Paso 6 — Microservicios

Los pipelines fallan por `@reachu/config` no disponible en npm. Desplegar desde ACR `:latest`:

```bash
gh api repos/vio-live/<repo>/contents/charts/<name>-0.1.0.tgz --jq '.content' | base64 -d > /tmp/<name>.tgz
helm upgrade --install <name> /tmp/<name>.tgz \
  --set image.repository=reachuprod2.azurecr.io/<name> \
  --set image.tag=latest
```

Repos que SÍ pueden redesplegar vía pipeline (empty commit en develop/master):
- `vio-live/graphql`

---

## Paso 7 — Ingresses

```bash
kubectl apply -f PROD/ingresses.yaml   # o QA/
```

---

## Paso 8 — MySQL firewall (Hetzner)

IPs de egress son permanentes — no cambiar el firewall salvo que se recreen las IPs `aks-outbound-*`:

| Servidor | IP | Egress whitelistado |
|---|---|---|
| `server-bd-prod` (`204.168.185.15`) | TCP 3306 | `20.100.186.77` |
| `server-bd-develop` (`204.168.215.2`) | TCP 3306 | `20.100.169.12` |

---

## Paso 9 — Egress IPs (si el cluster fue recreado vía Terraform)

Las IPs `aks-outbound-*` sobreviven en `prod-reachu` / `qa`. Reasignar:

```bash
PROD_IP_ID=$(az network public-ip show --name aks-outbound-prod --resource-group prod-reachu --query id -o tsv)
az aks update --resource-group prod-reachu --name reachu-prod --load-balancer-outbound-ips $PROD_IP_ID

QA_IP_ID=$(az network public-ip show --name aks-outbound-qa --resource-group qa --query id -o tsv)
az aks update --resource-group qa --name kubernetesqa --load-balancer-outbound-ips $QA_IP_ID
```

---

## ⛔ No hacer

- No reactivar el SP `vio-infra-tf-cicd` (`b9bb7f7c-cd80-446d-9251-2572d9bcb546`)
- No configurar terraform apply automático en push a main
- No usar anotaciones `--set` numéricas en cert-manager — aplicar via `kubectl annotate`
