---
title: Al arrancar un AKS parado, el webhook de Istio deja deployments sin pods
last-updated: 2026-10-12
---

## Sintoma
Tras `az aks start` de un cluster con Istio, algunos deployments quedan en `0/N` **sin ningun pod
creado** (no hay pods Pending ni CrashLoop: no existen). `kubectl get pods` no muestra nada de ese
servicio, y el deployment dice:

```
ReplicaFailure=True reason=FailedCreate
Internal error occurred: failed calling webhook "namespace.sidecar-injector.istio.io":
Post "https://istiod.istio-system.svc:443/inject?timeout=10s": no endpoints available for service "istiod"
```

El 12/10 pasó con `tracking` (0/3), `users` (0/2) y `templates` (0/1) en `vio-commerce-prod-sc`.

## Causa real
Carrera de arranque. Al encender el cluster todo se programa a la vez, y los ReplicaSets intentan
crear pods **antes de que `istiod` tenga endpoints**. El webhook de inyeccion de sidecar es
`FailPolicy: Fail`, asi que la creacion del pod se rechaza. No es un fallo de la aplicacion, ni de
la base, ni de la imagen.

## Como se arregla
**No hacer nada.** El deployment controller reintenta `FailedCreate` con backoff y crea los pods
solo en cuanto `istiod` responde. Converge en unos 6 minutos.

Comprobar que istiod ya esta listo antes de dudar:
```bash
kubectl get endpoints -n istio-system istiod -o jsonpath='{.subsets[*].addresses[*].ip}'
```
Si devuelve una IP, solo hay que esperar.

## Lo que NO hay que hacer
`kubectl rollout restart deploy/<x>` "para despertarlo". Funciona, pero mete
`kubectl.kubernetes.io/restartedAt` en la plantilla del pod, que es territorio de Helm, y no hacia
falta: el controlador ya lo estaba reintentando. Escalar a 0 y volver a subir toca `spec.replicas`
por el mismo precio.

## Ruido que acompaña y no es incidente
Los Jobs de CronJob que disparan durante la ventana de arranque fallan con `Error` y un
`Could not connect to <servicio>:80`, porque su destino aun no atendia. El 12/10 fueron dos
`shopcart-reconcile-*`. El siguiente ciclo corre bien.

## Regla
Al encender un AKS con Istio, dar por bueno el arranque solo despues de
`kubectl wait --for=condition=Available deploy --all`, y si algo queda en `0/N`, mirar
**`.status.conditions[ReplicaFailure]` antes que los logs del pod** — si no hay pod, el log no
existe y el motivo esta en el deployment.
