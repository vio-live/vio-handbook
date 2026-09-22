---
title: "Playbook — apagar y encender prod bajo demanda"
last-updated: 2026-09-16
owner: miguel
status: live
---

# Apagar y encender prod bajo demanda

Desde el 2026-09-16 (fin de los créditos de Azure) los entornos de prod pueden quedar **apagados** mientras no haya clientes reales, y encenderse solo cuando se vayan a usar. Lo hace Miguel con un script; se le pide por Discord ("enciende prod commerce", "apaga todo").

Script: `workspace-miguel/scripts/prod-power.sh <commerce|backend|all> <status|stop|start|guard>`

| Grupo | Qué apaga | Qué NO apaga (sigue costando) |
|---|---|---|
| `commerce` | AKS `vio-commerce-prod` (nodos 3 × D4as_v5), MySQL `vio-ecom-db-prod` | Redis `redus-vio-prod` (no se puede parar), IPs y LB, discos, ACR `reachuprod2`, blobs, Front Door |
| `backend` | Container Apps `ca-api-vio-production` y `ca-analytics-vio-production` (acción REST `stop`), PostgreSQL `pg-api-vio-production` | IP y LB del entorno, logs |

Ahorro aproximado con todo apagado (precios de lista): **commerce ~$700/mes, backend ~$200–250/mes**. Cada día encendido de commerce cuesta ~$23.

## Cómo funciona

- **Orden:** para encender, primero la base y después AKS o las apps; para apagar, al revés.
- **`start`** espera hasta que respondan `api-ecom.vio.live` y `graph-ql.vio.live` (commerce) o `api.vio.live/health` y `events.vio.live/health` (backend). Commerce tarda **~10–15 min**.
- **Estado deseado:** cada recurso lleva el tag `vio-power=on|off`.
- **Guard:** Azure vuelve a encender sola una MySQL o PostgreSQL flexible **a los 30 días** de apagada. El cron de OpenClaw `prod-power-guard` (diario a las 06:30, Europe/Oslo) corre `prod-power.sh all guard`: si un recurso tiene `vio-power=off` y no está apagado, lo apaga y avisa a Angelo por Discord. Si nada tiene el tag, no hace nada.
- **Guard DESACTIVADO (2026-09-22).** Angelo decidió que prod se enciende y apaga solo cuando él lo pide. El cron `prod-power-guard` quedó deshabilitado (además fallaba: ver `docs/lessons/cron-openclaw-toolsallow-claude-cli.md`). Consecuencia: Azure **enciende sola** una MySQL o PG flexible a los 30 días de apagada. La PG de backend prod (`pg-api-vio-production`) está apagada desde el 2026-09-16, así que se encendería sola hacia el **2026-10-16**. Hay que volver a apagarla a mano con `prod-power.sh backend stop`.

## Dependencias a tener en cuenta

- **Vio Backend prod usa `graph-ql.vio.live`** (`COMMERCE_GRAPHQL_URL`). Con commerce apagado y backend encendido, las funciones de comercio del backend de prod fallan.
- Con commerce apagado, los deploys a `master` de los microservicios **fallan** (el CI hace `helm upgrade` contra el cluster) y **no se pueden correr migraciones** en la MySQL de prod (p. ej. la de `nexi`, pendiente).
- Staging y QA no dependen de prod. El `.env` compartido de base-api vive en el blob `containerproduction2`, que no se apaga.
- Los certificados (cert-manager e Istio) se renuevan al volver a encender; las IPs públicas son estáticas y se conservan.

## Verificación

`prod-power.sh all status` muestra el estado real y el deseado. Después de un `start`, probar el flujo que se vaya a usar (dashboard, checkout), no solo el health.
