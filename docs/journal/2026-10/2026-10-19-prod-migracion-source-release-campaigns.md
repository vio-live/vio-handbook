---
date: 2026-10-19
session: prod-source-migration
participants: [angelo, claude]
status: live
---

# Session — 2026-10-19 — Prod: migración `source` de los slots y release del micro de campañas

## Goal

Retomar el programa de slots tras el viernes: cerrar la publicación de la SDK web 0.24.0, dar status y
preparar en prod la migración de `surface_campaign_slot.source` antes del siguiente release del micro de
campañas. Angelo decidió que la ejecución en prod la hace Miguel.

## Done

- **SDK web 0.24.0 ya estaba en npm**: el `npm publish` del lunes devolvió `E403 cannot publish over
  0.24.0` (el E404 anterior era sesión caducada, no un fallo de publicación). Vev 0.331 lleva ese mismo
  bundle (`f772974`).
- **Comprobación previa de prod** (solo lectura desde el pod de users, context `vio-commerce-prod-sc`): el
  micro de campañas corre en prod desde `main` @ `bda3f49` con kernel 1.0.273 (desplegado por Miguel el
  16/10, sin errores de base); la columna `source` no existe; `surface_campaign_slot` tiene 0 filas; la
  cadena de `migrations` termina en `surfacePrivacyMode1792000000000`.
- **Backup a demanda** de `vio-ecom-db-prod-sc`: `pre-slot-source-prod-20261019` (10:33 UTC).
- **Script de migración** idempotente para correr desde el pod (mismo `ALTER` y mismo `name` que la
  migración del kernel, verificado contra `package-database` `develop`). El `ALTER` en prod lo lanza una
  persona, no el agente (igual que en QA).
- **PR de release del micro** abierto: [vio-campaigns-microservice#18](https://github.com/vio-live/vio-campaigns-microservice/pull/18),
  `develop` → `main`, 13 commits (kernel 1.0.275, #15, #16, #17). Marcado para no mergear hasta aplicar
  la migración.
- **Handoff para Miguel**: [2026-10-19-prod-migracion-source-y-release-campaigns](../../handoff/2026-10-19-prod-migracion-source-y-release-campaigns.md)
  (estado de partida, script, verificación, merge, smoke in-cluster, rollback).

## Decisions

- La migración va **antes** del merge a `main`: el kernel 1.0.275 mapea `source`; el micro nuevo sin la
  columna respondería 500 en la config del SDK. El micro viejo con la columna no tiene problema.
- Prod lo ejecuta Miguel (pedido de Angelo, 19/10). El agente deja preparado lo que no toca prod.

## Blockers

- `api.vio.live` sigue apuntando a la VM de Oracle: el micro de prod solo se alcanza dentro del clúster.
  D2 (Istio + DNS) sigue pendiente de decisión de Angelo.
- El deploy del colector (`main` @ `477b56b`) en las VMs no es verificable desde fuera (el `/health` no
  expone versión).

## Next session

- Miguel: migración → verificación → merge #18 → smoke. Después, confirmar la columna y el pod en prod.
- Angelo: prueba de Vev desde cero (artículo, selector de campaña, "From page", reasignación, split de
  compra por campaña); rearmar el monitor del micro en QA cuando pruebe.
- D2 cuando Angelo lo decida; `helm --timeout` del workflow; CronJob de backup de prod.
