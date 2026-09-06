## Verificación cluster QA detenido — Miguel
- Quién: Miguel (cron 01:00)
- Dónde: AKS `kubernetesqa` (cluster QA de Vio Commerce)
- Cuándo: 2026-09-07 01:00
- Contexto: Job programado que corre `az aks stop` sobre el cluster QA fuera de horario para ahorrar costos.
- Hecho: `az aks stop` falló porque el cluster ya estaba detenido de una corrida anterior. Se verificó estado real: `powerState=Stopped`, `provisioningState=Succeeded`. Resultado esperado (cluster apagado) ya estaba cumplido, no se requirió acción adicional.
- Pendiente: ninguno.
