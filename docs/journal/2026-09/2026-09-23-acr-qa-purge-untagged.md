---
title: Purga de manifests huérfanos en los ACR de QA y prod (reachuqa2, reachuprod2)
date: 2026-09-23
owner: miguel
---

## Purga del ACR `reachuqa2` — Miguel

- **Quién:** Miguel, con el OK de Angelo (punto 4 del análisis staging/QA).
- **Dónde:** ACR `reachuqa2` (RG `qa`, Standard) y cluster `kubernetesqa`.
- **Cuándo:** 2026-09-23, 07:40–08:05 UTC.

### Contexto

Revisando qué quedaba por hacer en Azure apareció que `reachuqa2` estaba en **141 GB** contra los 100 GB incluidos en el SKU Standard. El audit del 16/09 lo tenía como hallazgo menor (~$2/mes), pero hacía una semana estaba en 116 GB: crecía ~25 GB/semana. Al ritmo actual serían ~$30/mes de exceso en tres meses.

Causa: la `retentionPolicy` del registry está **deshabilitada** (lo está desde el 2025-05-16), así que cada build deja atrás el manifest anterior sin tag y nunca se limpia.

### Hecho

Inventario previo: 241 manifests en 23 repos, de los cuales **77 sin tag** (69,2 GB nominales). Los 13 microservicios de QA corren todos con `:latest` (verificado con `kubectl get pods -o jsonpath`), así que ningún tag versionado está en uso por un deployment.

1. Lista de auditoría de los 77 digests guardada en `workspace-miguel/backups/acr-purge-2026-09-23/untagged-manifests.tsv` antes de borrar nada.
2. **Se descartó `acr purge`** para el borrado: ver la lección asociada. El dry-run mostró que iba a borrar 168 tags y 233 de los 241 manifests, incluidos todos los `latest`.
3. Borrado explícito con `az acr manifest delete` por digest, re-consultando `[?tags==null]` por repo en el momento de borrar. **77 borrados, 0 fallidos.** Log en `backups/acr-purge-2026-09-23/deleted.log`.
4. Verificado después: los 13 `latest` intactos, y el registry pasó de **141 GB a 90 GB** (bajo el límite incluido, exceso $0).
5. `retentionPolicy` automática **no se pudo activar**: `az acr config retention update` responde "Policies are only supported for managed registries in Premium SKU". Pasar a Premium cuesta ~$30/mes más para ahorrar ~$4/mes, así que se descartó.
6. En su lugar se creó la **ACR Task programada `purge-untagged`** (funciona en Standard): `--ago 7d --untagged` con filtro `'<repo>:^$'` en los 23 repos, schedule `0 3 * * 0` (domingos 03:00 UTC). Probada a mano con `az acr task run`: 0 tags y 0 manifests borrados, como correspondía al estar el registry ya limpio.

### Aparte — pods zombie del ciclo stop/start

Al verificar el cluster aparecieron 5 pods con 8 h de antigüedad en `PodInitializing` / `ContainerStatusUnknown` (`base-api`, `extensions`, `orders`, `payment-processors`, `tracking`). **No los causó la purga**: sus `istio-init` terminaron a las 06:04 UTC, cuando el cluster arrancó, y la purga fue a las 07:45. Cada deployment tenía además su réplica sana Running, así que no hubo impacto en servicio. Son residuo del ciclo `az aks stop`/`start`. Se borraron con `--force --grace-period=0`; el cluster quedó en 56 pods Running y ningún deployment incompleto.

### Pendiente

- Siguen sin ejecutar los puntos 1, 2 y 3 del análisis de staging/QA (node pool a 2 × B2as_v2, apagar la MySQL de staging de noche, Redis staging B1 → B0).

## Segunda parte — `reachuprod2` (mismo día, 08:00–08:20 UTC)

Angelo autorizó aplicar lo mismo en prod.

- Estado previo: **104,5 GB** de 100 incluidos, `retentionPolicy` también deshabilitada. 244 manifests en 19 repos, **95 sin tag** (71,7 GB nominales).
- `vio-commerce-prod` estaba Running (3 clientes sincronizando). Verificado con `kubectl` que los 13 microservicios corren con `:latest`, igual que en QA; `socket-server` usa su propio esquema (`production-latest`, `staging-latest`, `development-latest`).
- **Verificación extra que en QA no se hizo:** se exportaron por separado los 95 digests sin tag y los 149 con tag, y se cruzaron por `repo@digest`. **Intersección 0**, o sea ningún manifest a borrar estaba referenciado por algún tag. Ambas listas quedaron en `workspace-miguel/backups/acr-purge-prod-2026-09-23/`.
- Borrado por digest con re-consulta fresca: **95 borrados, 0 fallidos**.
- Resultado: **104,5 GB → 64,1 GB**, 36 GB de margen bajo el límite. Los 16 `latest` y los 3 `*-latest` de socket-server verificados uno por uno. Cluster prod: 61 pods Running, ningún deployment incompleto, sin pods zombie (a diferencia de QA, prod no pasa por ciclos stop/start).
- Prevención: ACR Task `purge-untagged` en `reachuprod2`, `0 4 * * 0` (domingos 04:00 UTC, una hora después de la de QA para no solapar) y `--ago 14d` en vez de 7d, para dejar más ventana de recuperación por digest en prod. Probada con `az acr task run`: 0 y 0.

### Resultado combinado del día

| Registry | Antes | Después | Exceso sobre 100 GB |
|---|---|---|---|
| `reachuqa2` | 141 GB | 90 GB | $0 (antes ~$4/mes y subiendo) |
| `reachuprod2` | 104,5 GB | 64,1 GB | $0 |

172 manifests huérfanos borrados en total, 0 fallidos, sin impacto en servicio en ninguno de los dos clusters. Los dos registries quedan con purga semanal automática.
