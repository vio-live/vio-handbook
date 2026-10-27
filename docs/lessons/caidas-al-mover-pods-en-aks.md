# Prod de Commerce se cae cada vez que se mueven pods

**Aprendido:** 26–27/10/2026, go-live de Mote & Livsstil × Careless. Journal:
[2026-10-27](../journal/2026-10/2026-10-27-go-live-mote-livsstil-careless.md).

## Qué pasó

- 26/10 16:15–16:28 UTC, con el artículo ya en vivo: AKS actualizó la imagen de los nodos (canal `NodeImage`) y vació
  nodos uno tras otro. El catálogo devolvió 502/503 unos 13 minutos; graph-ql estuvo en 0/2.
- 26/10 por la tarde: un deploy de shopcart dejó el checkout ~83 s caído. El CI hacía
  `kubectl delete pod -l app.kubernetes.io/instance=…`: borraba **todos** los pods a la vez.
- 27/10 02:10–02:35 CET, ya dentro de la ventana de mantenimiento nueva: otra actualización de nodos, varios cortes
  cortos. De noche y sin tráfico, pero el mecanismo es el mismo.

## Por qué cae (todas a la vez, ninguna basta sola)

1. **Sin PodDisruptionBudget** en ningún micro: el drain puede sacar todas las réplicas de un servicio a la vez.
2. **Réplicas en el mismo nodo**: sin anti-affinity, las 2 réplicas suelen compartir nodo y caen juntas.
   campaigns y template tienen **1 réplica**.
3. **Imágenes de 0,8–1 GB** con tag `latest`: un pod que se reprograma en un nodo nuevo tarda minutos en tirar la imagen.
4. **graph-ql muere si api no responde**: un error de axios sin capturar al arrancar → `exit 1` → CrashLoopBackOff
   mientras api se reprograma. Además graph-ql **no tiene readiness probe**: recibe tráfico antes de estar listo.
5. **El PDB de istiod** (`minAvailable: 1` con 1 réplica) bloqueaba el vaciado del nodo: AKS esperaba, reintentaba y
   alargaba la ventana de corte.
6. **El CI borraba los pods** en lugar de hacer rollout.

## Qué se hizo ([ADR-0040](../decisions/0040-despliegues-y-mantenimiento-sin-caida.md))

- Ventana de mantenimiento `aksManagedNodeOSUpgradeSchedule`: martes 02:00–06:00 UTC+1.
- HPA de istiod con mínimo 2 réplicas (su PDB ya no bloquea).
- CI de los 13 micros: `kubectl rollout restart deployment/<app>` + `kubectl rollout status --timeout=15m`
  (RollingUpdate 25 %/25 %). campaigns ya lo hacía.

## Qué falta (sin esto, la próxima actualización de nodos vuelve a cortar)

- PDB (`maxUnavailable: 1`) y 2 réplicas en graph-ql, api, middleware, shopcart, products, campaigns.
- `topologySpreadConstraints` / anti-affinity por nodo.
- graph-ql: capturar el error de axios al arrancar (reintentar, no morir) y readiness probe.
- `preStop` con `sleep` para que el Service deje de mandar tráfico antes de que el proceso muera.
- Imágenes más pequeñas (multi-stage, sin devDependencies) y tags inmutables en lugar de `latest`.

## Cómo detectarlo antes

`kubectl get pdb -A` vacío fuera de `kube-system`/`istio-system` y deployments con `replicas: 1` en el camino del
checkout son una caída anunciada. Revisarlo antes de cualquier go-live con tráfico pagado.
