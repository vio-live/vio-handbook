---
title: "Las réplicas no evitan el corte: el deploy borra todos los pods a la vez"
last-updated: 2026-10-13
---

# Síntoma

"Este servicio tiene 2 (o 4) réplicas, así que el deploy no corta." Falso en Vio Commerce. El
2026-10-13, durante el deploy de los fixes de F0, `api-ecom.vio.live` (base-api, **4 réplicas**)
devolvió **503 durante 62 segundos** — medido con una sonda cada 2 s: 29 de 150 fallaron, de
13:55:40 a 13:56:42 UTC, justo cuando sus cuatro pods se reemplazaron.

# Causa real

El último paso del `deploy.yml` de **todos** los repos es:

```bash
kubectl delete pod -l app.kubernetes.io/instance=<APP_PREFIX>
```

Ese selector casa con **todos** los pods del deployment, así que los borra **simultáneamente** y
salta por encima de la estrategia `RollingUpdate` del propio deployment (que es la que respetaría
`maxUnavailable: 25%`). El ReplicaSet los recrea en paralelo, y los nuevos no reciben tráfico hasta
pasar la readiness: `initialDelaySeconds: 15` más el arranque de NestJS. De ahí el minuto.

Las réplicas no ayudan porque no sobrevive ninguna. Tampoco hay `PodDisruptionBudget` en
`default` que lo frene (solo existen los de `istiod` y `coredns`).

El paso existe por una razón: el chart se despliega con `image.tag=latest`, así que el manifiesto
no cambia entre deploys y sin borrar los pods Kubernetes no se enteraría de que hay imagen nueva.

# Cómo se evita

Etiquetar la imagen con algo que cambie (`image.tag=${{ github.run_number }}`): el manifiesto del
deployment cambia, Kubernetes hace el rolling de verdad y el paso de `kubectl delete pod` deja de
hacer falta. Con readiness probe y `maxUnavailable: 0`, el corte desaparece.

Mientras siga el patrón actual: **asumir ~1 minuto de 503 por servicio y por deploy**, también en
producción, y desplegar fuera de horario los servicios del camino caliente.

El micro nuevo de campañas nace con tag por run y rolling
([micro-campanas-infra](../handoff/micro-campanas-infra.md)).
