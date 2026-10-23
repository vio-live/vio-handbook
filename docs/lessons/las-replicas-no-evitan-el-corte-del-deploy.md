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

---

## Corolario (23/10): el mismo ReplicaSet NO significa "no hubo deploy"

**Síntoma:** los dos pods de un servicio desaparecen y vuelven a la vez, pero el hash del
ReplicaSet es el mismo que antes. Parece un borrado manual o un problema de nodo.

**Causa real:** aquí el deploy borra los pods **por label**, no hace `rollout` de una revisión
nueva. Si el chart no cambia (solo cambia la imagen detrás del mismo tag), el ReplicaSet es el
mismo y los pods nuevos nacen sobre él. Ver el mismo hash es lo **esperado** en un deploy, no la
prueba de que no lo hubo.

**Cómo distinguirlo, antes de molestar a nadie:** cruzar la edad del pod con el CI.

```bash
kubectl get pods -n default | grep '^<svc>-'
gh run list --repo vio-live/<repo> --limit 6 \
  --json headBranch,conclusion,createdAt,updatedAt,displayTitle \
  -q '.[]|[.headBranch,.conclusion,.createdAt,.updatedAt,.displayTitle]|@tsv'
```

Si hay un run de `master` que termina dentro de la ventana en que nacieron los pods, fue el CI.
Si no hay ninguno, entonces sí toca mirar el nodo o el activity log.

Me pasó la noche de la congelación: reporté como borrado manual lo que era el deploy del PR #66
(run 20:02:24 → 20:08:17 UTC) y pregunté a Angelo si había sido él.
