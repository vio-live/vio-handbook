---
title: Encendido y apagado automático del cluster QA (kubernetesqa)
last-updated: 2026-09-22
owner: miguel
---

# Scheduler del cluster QA

Reemplaza a los crons de OpenClaw `qa-cluster-start` / `qa-cluster-stop`, que desde el 2026-09-22 están deshabilitados. No usa ningún LLM ni depende del Mac de Angelo.

## Recursos (RG `qa`, Norway East)

- `cae-qa-ops`: Container Apps Environment, solo Consumption. Sin costo mientras no corre nada.
- `job-qa-aks-start`: cron `0 6 * * 1-5` (UTC).
- `job-qa-aks-stop`: cron `0 23 * * 1-5` (UTC).
- `id-qa-aks-scheduler`: user-assigned identity. Tiene solo el rol custom **`AKS Start-Stop (kubernetesqa)`** (read, start y stop), con scope en el cluster. No puede borrarlo ni modificarlo.
- `log-qa-ops`: Log Analytics con retención de 30 días, para los logs de los jobs.

Imagen: `mcr.microsoft.com/azure-cli:latest`, 0,25 CPU / 0,5 Gi, timeout de 30 min y 1 reintento.

## Horario

Container Apps solo acepta cron en UTC:
- En verano (CEST): encendido de lunes a viernes a las 08:00 y apagado de lunes a viernes a las 01:00 del día siguiente.
- En invierno (CET): encendido a las 07:00 y apagado a las 00:00.

Los fines de semana queda apagado: el viernes a las 23:00 UTC se apaga y el lunes a las 06:00 UTC se enciende.

## Lógica

Cada job es idempotente:
1. `az login --identity`.
2. Lee `powerState`. Si está en el estado de origen, ejecuta `az aks start|stop`; si no, no hace nada.
3. Vuelve a leer el estado y termina con error si no quedó como se esperaba. Así la ejecución queda como Failed en Azure.

## Operar

```bash
# historial
az containerapp job execution list -g qa -n job-qa-aks-stop -o table
# correr a mano
az containerapp job start -g qa -n job-qa-aks-start
# logs
az monitor log-analytics query -w $(az monitor log-analytics workspace show -g qa -n log-qa-ops --query customerId -o tsv) \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerJobName_s startswith 'job-qa-aks' | project TimeGenerated, ContainerJobName_s, Log_s | order by TimeGenerated desc | take 20"
# pausar el horario (por ejemplo, una demo nocturna): suspender el job
```

## Pendiente

- Todavía no hay alerta si un job falla: hay que revisar el historial.
- La MySQL de staging (`vio-ecom-db-staging`) sigue 24/7. Se puede sumar a estos jobs si nadie la usa fuera del horario del cluster.
