---
title: Cambiar el node pool de un AKS con Istio — el PDB bloquea el drain y la cuota es por familia
last-updated: 2026-09-25
---

## Síntoma
Reemplazando el node pool de `kubernetesqa` (3×E2as_v4 → 2×B2ms) aparecieron dos bloqueos que no
estaban en el plan:

1. `az aks nodepool add` con `Standard_B2as_v2` falló:
   `ErrCode_InsufficientVCPUQuota: requested 4, remaining 0 for family standardBasv2Family`.
2. `kubectl drain` del último nodo se colgó hasta el timeout sin mensaje de error claro. Los pods de
   aplicación ya se habían movido; los que quedaban eran `istiod`, `istio-ingressgateway` y
   `istio-egressgateway`.

## Causa real
1. **La cuota de vCPU en Azure es por familia, no global.** Había 31 vCPU libres de 51 en
   "Total Regional vCPUs", pero `standardBasv2Family` estaba en límite 0. Que la región tenga
   cuota libre no dice nada sobre el tamaño concreto que querés usar.
2. **Istio instala PodDisruptionBudgets con `minAvailable: 1` y los deployments tienen 1 réplica.**
   Con 1 réplica y `minAvailable: 1`, las disrupciones permitidas son 0, así que `drain` no puede
   desalojar el pod y espera para siempre. Se ve con `kubectl get pdb -A`: la columna
   `ALLOWED DISRUPTIONS` en 0 es la señal.

## Cómo se arregla / evita
- Antes de elegir el tamaño, mirar la cuota **de esa familia**:
  `az vm list-usage -l <region>` y buscar la fila de la familia (p. ej. "Standard BS Family vCPUs").
  Si está en 0 hay que pedir aumento de cuota, que no es inmediato: tener un plan B de otra familia.
  En este caso B v1 (`B2ms`, $77/mes) tenía cuota y Basv2 (`B2as_v2`, $69/mes) no.
- Para el drain con Istio: escalar temporalmente a 2 réplicas los deployments con PDB, drenar, y
  volver a 1.
  ```
  for d in istiod istio-ingressgateway istio-egressgateway; do
    kubectl scale deploy/$d -n istio-system --replicas=2; done
  # drain; después volver a --replicas=1
  ```
  No usar `--disable-eviction` ni borrar el PDB: eso baja el ingress de golpe.
- Hacer el reemplazo **aditivo y verificando de a poco**: crear el pool nuevo, `cordon` de los
  viejos, drenar UN nodo, confirmar con `kubectl rollout status` que los pods arrancan en el hardware
  nuevo, y sólo después seguir con el resto. Los nodos nuevos tienen la caché de imágenes vacía, así
  que el primer arranque tarda más de lo normal y `PodInitializing` por un rato es esperable, no un
  fallo.
- Si los deployments tienen 1 réplica, el drain corta cada servicio ~30–60 s. En un entorno que usan
  otras personas, hacerlo en una ventana tranquila o avisar antes.
