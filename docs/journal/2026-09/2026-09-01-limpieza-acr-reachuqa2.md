---
date: 2026-09-01
session: infra
participants: [angelo, miguel]
status: live
---

# ACR `reachuqa2` sobre cupo (328%) — limpieza — Miguel

## Contexto
El cron `azure-usage-weekly` posteó en #dev la alerta: `reachuqa2` (QA) al 328% de su
cupo de 100GB (328GB usados). Angelo pidió limpiarlo, dejando solo lo de los
últimos 10 días.

## Hecho
1. Verifiqué antes de tocar nada que todos los deployments de `kubernetesqa` (namespace
   `default`) usan el tag `:latest` — ningún tag numerado/fechado está referenciado
   directamente por un deployment.
2. Fase 1 — borré manifests **sin tag** (huérfanos de builds sobrescritos) en las 23
   repos del registro. `socket-server` solo tenía 2 tags pero 51 manifests huérfanos
   (90.5GB). Liberó ~114GB (328GB → 214GB).
3. Fase 2 — en los 20 repos que siguen convención CI (build numérico + `latest`),
   borré tags con `lastUpdateTime` > 10 días, **excluyendo siempre `latest`**
   sin importar su fecha. Liberó ~165GB más (214GB → ~49.5GB, 46% del cupo).
4. Dejé sin tocar 3 repos que no tienen tag `latest` (no son builds de CI, son
   releases nombrados a mano): `vio-vision-backend` (demo, demo-v2..v5, v0.4.0,
   v0.4.1 — ~28GB), `vio-vision-web` (mismos nombres — ~1GB), `reachu-webapp-qa`
   (tag único `develop` — ~0.06GB). Angelo confirmó dejarlos así por ahora.

## Resultado
`reachuqa2`: 328GB → ~49.5GB / 100GB cupo.

## Pendiente
- Configurar retention policy nativa en el ACR (o un cron de purge) para que esto
  no se vuelva a acumular — no se hizo hoy, solo la limpieza puntual.
- Decidir en algún momento qué hacer con los 3 repos de vio-vision / reachu-webapp-qa
  (¿siguen en uso? ¿aplican misma convención de latest?).
