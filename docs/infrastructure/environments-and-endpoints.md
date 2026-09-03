---
title: "Environments & Endpoints — Vio Commerce + Backend"
last-updated: 2026-09-03
owner: miguel
status: live
---

# Environments & Endpoints — Vio Commerce + Backend

**Reescrito 2026-09-03** (Miguel) con datos verificados en vivo (`kubectl`, `dig`, `az`, workflows de GitHub Actions) — la versión anterior (2026-06-18) era un plan que nunca se actualizó con la realidad y tenía dos errores de fondo: decía que staging era un CNAME temporal a prod (falso, es un cluster físico aparte) y que dev vivía en un namespace del cluster prod (ese namespace no existe).

## Cómo funciona realmente el CI/CD (verificado en `deploy.yml` de los repos de microservicios)

Cada repo de servicio (`vio-*-microservice`, `vio-base-api`, `graphql`) tiene un único workflow (`.github/workflows/deploy.yml`) que dispara **automático, sin aprobación manual**, con esta rama → entorno:

| Rama Git | "Entorno" (nombre de los secrets) | Cluster AKS real | ACR |
|---|---|---|---|
| `develop` | QA | `kubernetesqa` (confirmado) | `reachuqa2.azurecr.io` |
| `pre-develop` | Staging | *(secrets separados existen, `AZ_KUB_NAME_STAGING`/`ACR_STAGING`, pero **`pre-develop` no recibió un solo push en los últimos 15 runs** de `vio-products-microservice` — rama dormida en la práctica)* | — |
| `master` | Prod | `vio-commerce-prod` (confirmado) | `reachuprod2.azurecr.io` |

El job hace `docker build` + `docker push` a la ACR del entorno, luego `helm upgrade --install <APP_PREFIX> ./charts/<APP_PREFIX>-0.1.0.tgz` + `kubectl delete pod` (fuerza el rollout) contra el AKS del entorno vía `azure/login` con un Service Principal (`SV_APP_ID`/`SV_PASSWORD`/`SV_TENANT_ID`, por entorno).

**Consecuencia práctica: "QA", "staging" y "dev" son hoy el mismo cluster físico** (`kubernetesqa`, namespace `default`) — porque nadie pushea a `pre-develop`. Los dominios `-staging` y `-dev` de Commerce resuelven a la **misma IP** y sirven los **mismos pods**:

```
dig +short api-ecom-staging.vio.live   → 20.251.70.230  (kubernetesqa)
dig +short api-ecom-dev.vio.live       → 20.251.70.230  (misma IP)
dig +short api-ecom.vio.live           → 20.100.174.93  (vio-commerce-prod, distinta)
```

No existe namespace `vio-commerce-dev` en ningún cluster (verificado: `kubectl get ns` en `vio-commerce-prod` no lo tiene). Si algún día se empieza a pushear a `pre-develop` con los secrets `_STAGING` apuntando a otro AKS, esto cambia — hasta entonces, tratar dev y staging de Commerce como **un solo entorno**.

## Vio Commerce (microservicios NestJS + base-api + graph-ql)

| Servicio | Prod (`vio-commerce-prod`, ns `default`) | QA/Staging/Dev (`kubernetesqa`, ns `default`) |
|---|---|---|
| base-api | `api-ecom.vio.live` | `api-ecom-staging.vio.live` = `api-ecom-dev.vio.live` |
| graph-ql | `graph-ql.vio.live` | `graph-ql-staging.vio.live` = `graph-ql-dev.vio.live` |
| microservicios (11, path-based) | `msrvc-p.vio.live/<servicio>` (Istio VirtualService, confirmado `/payment-processors`, `/api`, `/collections`, `/orders`, `/users`, `/products`, etc.) | cluster-internal only, sin VirtualService propio hoy |
| shopify-export | — (sin VS encontrada en prod hoy pese a estar deployado) | — |
| shopify-import | ⚠️ **deployado y corriendo (2/2) en prod** pese a que el infra doc viejo decía "deprecado, no desplegar" — verificar con el equipo si sigue siendo así | — |

Routing real (Istio, `istio-system`, no hay `Ingress` — todo es `VirtualService`+`Gateway`):
- `gateway-reachu-prod-base-api` → hosts `api-ecom.vio.live`, `api-ecom-staging.vio.live` (⚠️ esta segunda entrada es config huérfana en prod — el DNS real de staging apunta a `kubernetesqa`, no a prod, así que esto nunca recibe tráfico; limpiar cuando se toque el archivo)
- `gateway-reachu-prod-graph-ql` → `graph-ql.vio.live`
- `gateway-reachu-prod-microservices` → `msrvc-p.vio.live`
- (en `kubernetesqa`) `gateway-reachu-qa-base-api` → `api-ecom-staging.vio.live`, `api-ecom-dev.vio.live`
- (en `kubernetesqa`) `gateway-reachu-prod-graph-ql-qa` → `graph-ql-staging.vio.live`, `graph-ql-dev.vio.live` (el nombre del gateway dice "prod", es QA — mal nombrado, no tocar sin confirmar)

## Vio Backend (socket-server) — Azure Container Apps, NO AKS

| Entorno | RG | URL |
|---|---|---|
| Prod | `rg-api-vio-production` | `api.vio.live` → `ca-api-vio-production...azurecontainerapps.io` |
| Staging | `rg-api-vio-staging` | `api-staging.vio.live` → `ca-api-vio-staging...azurecontainerapps.io` |
| Dev | `rg-api-vio-development` | `api-dev.vio.live` → `ca-api-vio-development...azurecontainerapps.io` |

Estos SÍ son 3 entornos físicamente separados (3 Container Apps distintas, 3 RG distintos) — a diferencia de Commerce. No confundir los dos sistemas.

> Frontend legacy del monolito de Vio Backend: `staging.vio.live`, corre en `kubernetesqa` (mismo cluster que Commerce QA). Sin prod propio todavía.

## Externos / Estáticos

| Dominio | Destino |
|---|---|
| `vio.live`, `www.vio.live` | Vercel |
| `docs.vio.live` | Vercel |

## Notas

- `reachu-prod` (cluster viejo) sigue operativo, separado de `vio-commerce-prod`.
- Si en algún momento `pre-develop` empieza a usarse de verdad, esta tabla queda desactualizada — volver a verificar `AZ_KUB_NAME_STAGING` contra el real antes de asumir que sigue siendo el mismo cluster que QA.
