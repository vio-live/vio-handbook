---
title: "Lesson — Container Apps: los tres gotchas del primer deploy"
last-updated: 2026-08-20
owner: angelo
status: live
---

# Container Apps: los tres gotchas del primer deploy

Los tres golpes seguidos del primer despliegue de `ca-analytics-vio-*`
(2026-08-20). Cada uno cuesta un ciclo de debugging si no se conoce.

## 1. System-assigned identity + ACR = app que nace muerta

Con `identity { type = "SystemAssigned" }` + `registry { identity =
"system" }`, la identity nace CON la app — pero el rol AcrPull se asigna
DESPUÉS (necesita el principal_id). La primera revisión intenta el pull sin
permiso, muere, y la app queda `provisioningState: Failed` **sin revisiones**
(a veces ni siquiera se puede reciclar: hay que borrarla).

**Fix estructural**: identity **user-assigned** creada antes
(`id-analytics-vio`), AcrPull otorgado sobre ella, `time_sleep` ~90s para
propagación RBAC, y las apps referencian esa identity. Patrón en
`vio-analytics/infra/main.tf` — reusar para cualquier Container App nueva.

## 2. Secrets con valor vacío = 400 al crear

`ContainerAppSecretInvalid: value or keyVaultUrl and identity should be
provided` — la API rechaza `secret { value = "" }`. En Terraform: filtrar el
mapa (`if value != ""`) y condicionar los `env` que los referencian con
`dynamic`. Aplica a cualquier secret "todavía no lo tengo" (ej. tokens de
Mixpanel antes de crear el proyecto).

## 3. OIDC de GitHub: esta org presenta subjects INMUTABLES

El federated credential estándar
(`repo:vio-live/vio-analytics:ref:refs/heads/main`) falla con
**AADSTS700213**. La org GitHub tiene activado el formato de IDs
inmutables: `repo:vio-live@269172431/vio-analytics@1340054227:ref:...`.
El subject correcto se lee del propio error del workflow (trae la assertion
presentada), o `gh api repos/<org>/<repo> --jq .id`. Ya había pasado con
vio-backend — tercera vez que muerde, por eso lesson propia.

## Bonus operativo

`az containerapp update` esperando provisioning puede colgar >10 min si la
revisión no levanta — correr con timeout y mirar
`az containerapp revision list` en paralelo (una lista `[]` con estado
Failed = caso 1).
