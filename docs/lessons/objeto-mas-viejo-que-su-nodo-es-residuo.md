---
title: Un pod más viejo que su nodo es residuo de un reinicio, no una avería
last-updated: 2026-10-01
---

## Síntoma
En un cluster con apagado nocturno programado, por la mañana aparecen pods clavados:

```
base-api-5d66d456ff-6tzhg   0/2   PodInitializing   15h
orders-5b6c777489-5hk98     0/2   PodInitializing   15h
```

Suena a avería: 15 horas sin inicializar. Y el monitoreo lo reporta como entorno roto.

## La comprobación que lo resuelve en un comando
Comparar la edad del pod con la del nodo donde está:

```bash
kubectl get pod <pod> -o jsonpath='{.spec.nodeName}'
kubectl get node <nodo> -o jsonpath='{.metadata.creationTimestamp}'
```

Si el **pod es más viejo que su nodo**, no está fallando: es residuo. Un proceso no puede llevar
vivo más tiempo que la máquina que lo ejecuta.

## Causa real
`az aks stop` no borra los objetos Pod: viven en etcd. Al arrancar, el VMSS **reutiliza los nombres
de instancia**, así que el pod sigue atado a un nombre de nodo que existe — pero es una máquina
nueva, y su kubelet nunca lo inicializa.

En paralelo el scheduler crea réplicas frescas. El resultado es un deployment con **una réplica sana
y una fantasma**:

```
base-api-...-5d4hk   2/2   Running            8h   <- la real, nacida al encender
base-api-...-6tzhg   0/2   PodInitializing   15h   <- residuo de antes del apagado
```

Nadie lo limpia porque el ReplicaSet ya está satisfecho con el pod nuevo, así que el controlador no
tiene motivo para actuar.

## Lo que confirma el diagnóstico antes de borrar
- `kubectl get deploy` muestra **todas las réplicas completas** (el servicio está sano).
- El `istio-init` del pod fantasma está en `Completed` con exit 0 (no falló nada).
- El nodo no tiene ninguna presión: `MemoryPressure`, `DiskPressure`, `PIDPressure`,
  `KubeletProblem` todos en `False`.

## Arreglo
Borrar los pods fantasma. Si hay CronJobs, borrar también los Jobs fallidos de la ventana de
arranque: un cronjob frecuente **falla una o dos veces cada mañana por diseño** mientras los
servicios levantan, y esos objetos `Error` quedan como historial y ensucian el informe.

## Regla general
Antes de declarar algo roto, comprobar **si el servicio atiende** (réplicas listas, conexiones
activas, últimas ejecuciones del job) y la **edad relativa** de los objetos. El mismo día me pasó la
versión gemela de este error: di por caída una base de datos que tenía 19 conexiones activas, cuando
lo roto era mi pod de prueba.

## Relacionado
- `lessons/aks-stopped-fqdn-no-resuelve.md`
