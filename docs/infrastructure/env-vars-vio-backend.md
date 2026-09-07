---
title: "Inventario de variables de entorno — Vio Backend (socket-server)"
last-updated: 2026-09-08
owner: miguel
status: live
---

# Inventario de variables de entorno — Vio Backend

Vio Backend es infra completamente separada de Vio Commerce — ver
[[feedback-dont-mix-commerce-backend-infra]]. 3 entornos reales, cada uno su propia Container App y su
propia base de datos.

Auditado en vivo el 2026-09-08 con `az containerapp show` / `az containerapp secret list` (sólo nombres).

## Container Apps — variables de entorno

| Variable | production | staging | development | Dónde vive el valor |
|---|:---:|:---:|:---:|---|
| `NODE_ENV` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `PORT` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `DATABASE_URL` | ✅ | ✅ | ✅ | Container App **secret** (`database-url`) |
| `SESSION_SECRET` | ✅ | ✅ | ✅ | Container App **secret** (`session-secret`) |
| `ANALYTICS_EVENTS_URL` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `ANALYTICS_INTERNAL_TOKEN` | ✅ | ✅ | ✅ | Container App **secret** (`analytics-internal-token`) |
| `FIREBASE_PROJECT_ID` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `ADMIN_EMAILS` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `FIREBASE_SERVICE_ACCOUNT_JSON_B64` | ✅ | ✅ | ✅ | Container App **secret** (`firebase-service-account-json-b64`) |
| `COMMERCE_GRAPHQL_URL` | ✅ | ✅ | ✅ | Container App env var (plano) — apunta a `graph-ql` de Commerce |
| `COMMERCE_GRAPHQL_PUBLIC_URL` | ✅ | ✅ | ✅ | Container App env var (plano) |
| `AZURE_CONTAINER` | ❌ | ✅ | ❌ | Container App env var (plano) |
| `AZURE_STORAGE_ACCOUNT` | ❌ | ✅ | ❌ | Container App env var (plano) |
| `AZURE_STORAGE_KEY` | ❌ | ✅ | ❌ | Container App **secret** (`azure-storage-key`) |
| `AZURE_STORAGE_CONNECTION_STRING` | ❌ | ✅ | ❌ | Container App **secret** (`azure-storage-connection-string`) |

**Hallazgo:** los 4 `AZURE_STORAGE_*` sólo existen en `staging`. O es una prueba que quedó a medio limpiar,
o production/development necesitan la misma capacidad y no la tienen — confirmar con el equipo antes de
asumir cualquiera de las dos.

**Nota positiva:** este es el único sistema de los tres auditados (Commerce/Backend/Vercel) que ya usa un
mecanismo de secretos nativo de la plataforma (`az containerapp secret`) en vez de bakear valores en la
imagen o en un blob — de los tres, es el que menos trabajo va a dar migrar los *valores* (el problema aquí
es "más contenedores agnósticos de nube" a nivel de plataforma, no a nivel de secretos).

## Vestigial — secrets de GitHub Actions previos a la migración a Container Apps

El repo `tipiodevelopment/socket-server` todavía tiene, además de los secrets Container-Apps-era que sí se
usan (`AZURE_CREDENTIALS`, `AZURE_REGISTRY_USERNAME`, `AZURE_REGISTRY_PASSWORD`, `AZURE_CLIENT_ID`, y los 4
que también viven como Container App secret arriba), un set completo de secrets **de la era AKS**
(pre-2026-06-01, cuando `socket-server` corría en `kubernetesqa` en vez de Container Apps):

`ACR_PROD`, `ACR_QA`, `ACR_STAGING`, `AZ_KUB_NAME_PROD`, `AZ_KUB_NAME_QA`, `AZ_KUB_NAME_STAGING`,
`AZ_RG_PROD`, `AZ_RG_QA`, `AZ_RG_STAGING`, `AZ_STORAGE`, `AZ_STORAGE_PROD`, `AZ_STORAGE_QA`,
`AZ_STORAGE_STAGING`, `CACHE_ENABLED`, `CACHE_HOST`, `CACHE_PASSWORD`, `CACHE_PORT`

Ninguno de estos se referencia en el `deploy.yml` actual (que sólo hace `docker build` + push a
`acrvioapi.azurecr.io` + `az containerapp update`). Candidatos a borrar directamente.

## Al migrar de nube

Este es el sistema más simple de portar: 15 variables reales (11 planas + 4 en secret store), sin
dependencia de Azure Storage para bakear config (excepto en `staging`, que si se limpia queda igual de
simple que los otros dos). El único acoplamiento real a Azure es el mecanismo de "Container App secret" en
sí — el equivalente en otra nube (AWS Secrets Manager + ECS, Google Secret Manager + Cloud Run) es
prácticamente 1:1.

## Ver también

- [`env-vars-vio-commerce.md`](env-vars-vio-commerce.md) — Vio Commerce (AKS), no compartir nada con esto
- [`azure-overview.md`](azure-overview.md) — recursos completos de `api-vio` / Container Apps
