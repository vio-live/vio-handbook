---
title: "AKS Autoscaling — Plan de reducción de costos"
last-updated: 2026-05-18
owner: miguel
status: live
---

# AKS Autoscaling — Plan de reducción de costos

Guía operacional para habilitar autoscaling en los clusters AKS de Vio Commerce y reducir el gasto mensual al mínimo sin sacrificar disponibilidad.

## Contexto

A 2026-05-18, ninguno de los dos clusters tiene autoscaler habilitado. Están fijos en:
- `reachu-prod`: 2 nodos × Standard_D4as_v5 → ~$276/mes
- `kubernetesqa`: 3 nodos × Standard_D2s_v5 → ~$207/mes

Objetivo: habilitar cluster autoscaler para que los nodos escalen según demanda real.

---

## Fase 1 — QA primero (bajo riesgo)

### Por qué QA primero

- No afecta usuarios reales
- Reversible al instante (`az aks scale --node-count 3`)
- Sirve para validar el comportamiento antes de tocar prod

### Comando

```bash
az aks update \
  --resource-group qa \
  --name kubernetesqa \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 3 \
  --nodepool-name agentpool
```

### Qué hace

- Habilita el cluster autoscaler nativo de AKS
- En carga baja: escala hasta min=1 nodo (ahorro ~$138/mes vs estado actual de 3 nodos)
- En carga alta: escala hasta max=3 nodos automáticamente
- No baja nodos inmediatamente — espera 10 minutos de nodo inactivo antes de escalar hacia abajo

### Verificar que funcionó

```bash
az aks show \
  --resource-group qa \
  --name kubernetesqa \
  --query "agentPoolProfiles[].{name:name,count:count,minCount:minCount,maxCount:maxCount,enableAutoScaling:enableAutoScaling}"
```

### Revertir si hay problemas

```bash
# Escalar manualmente de vuelta a 3 nodos
az aks scale --resource-group qa --name kubernetesqa --node-count 3

# O deshabilitar el autoscaler completamente
az aks update \
  --resource-group qa \
  --name kubernetesqa \
  --disable-cluster-autoscaler \
  --nodepool-name agentpool
```

---

## Fase 2 — Apagado nocturno de QA ✅ ACTIVO

El cluster QA se apaga y enciende automáticamente vía OpenClaw cron. Con el cluster parado, las VMs no cobran (el control plane de AKS es gratuito).

**Schedule configurado (timezone: Europe/Oslo):**

| Cron ID | Horario | Acción |
|---|---|---|
| `f5b9d9a3-783f-4ca4-a1c5-149757b2f1cd` | Lun–Sáb 01:00 | `az aks stop` |
| `51878702-3667-4715-87e6-0a49dfe36cbe` | Lun–Vie 08:00 | `az aks start` |

**Resultado:** cluster activo lunes–viernes de 08:00 a 01:00. Fin de semana apagado desde el viernes 01:00 hasta el lunes 08:00 (55h).

```bash
# Encender manualmente si se necesita fuera de horario
az aks start --resource-group qa --name kubernetesqa

# Apagar manualmente
az aks stop --resource-group qa --name kubernetesqa
```

**Ahorro estimado:** ~$100–150/mes adicional sobre el autoscaler.

> ⚠️ Si CI/CD usa el cluster QA, revisar que los pipelines corran en horario laboral o ajustar el schedule.

---

## Fase 3 — Prod con autoscaler (requiere monitoreo)

Solo ejecutar después de validar en QA y monitorear al menos 48h.

```bash
az aks update \
  --resource-group prod-reachu \
  --name reachu-prod \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 4 \
  --nodepool-name agentpool
```

**Parámetros recomendados:**
- `min-count: 1` — si el tráfico real lo permite; subir a 2 si los pods no caben en 1 nodo
- `max-count: 4` — headroom para picos

**Monitorear después de activar:**
```bash
# Ver estado del autoscaler
kubectl describe configmap cluster-autoscaler-status -n kube-system

# Ver eventos de scaling
kubectl get events --field-selector reason=TriggeredScaleUp -n kube-system
kubectl get events --field-selector reason=ScaleDown -n kube-system
```

---

## Fase 4 — KEDA (escalar pods a 0 por colas Service Bus)

Para maximizar el ahorro, instalar KEDA permite que los deployments de procesamiento de colas escalen a 0 réplicas cuando no hay mensajes.

```bash
# Instalar KEDA
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

```yaml
# Ejemplo: ScaledObject para consumidor de órdenes
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-processor-scaler
  namespace: production
spec:
  scaleTargetRef:
    name: order-processor-deployment
  minReplicaCount: 0
  maxReplicaCount: 10
  triggers:
  - type: azure-servicebus
    metadata:
      queueName: orders
      namespace: production-order-processing2
      messageCount: "5"
```

---

## Ahorro estimado por fase

| Fase | Acción | Ahorro/mes est. | Estado |
|---|---|---|---|
| 1 | Autoscaler QA (min=1) | ~$138 | Pendiente |
| 2 | Apagado nocturno QA | ~$100–150 | Pendiente |
| 3 | Autoscaler Prod (min=1) | ~$0–138 | Pendiente |
| 4 | KEDA para pods | variable | Futuro |

---

## Historial de cambios

| Fecha | Acción | Quién |
|---|---|---|
| 2026-05-18 | Auditoría inicial, plan creado | miguel |
| — | Autoscaler habilitado en QA | — |
| — | Autoscaler habilitado en Prod | — |
