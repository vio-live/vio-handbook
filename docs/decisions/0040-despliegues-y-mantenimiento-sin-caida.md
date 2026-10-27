---
status: aceptada
date: 2026-10-27
deciders: [angelo]
consulted: [claude]
---

# ADR-0040 — Despliegues y mantenimiento de AKS sin caída

## Contexto

Durante el go-live de Mote & Livsstil × Careless (26/10) prod cayó dos veces por mover pods: una actualización de la
imagen de los nodos de AKS en horario de tráfico (13 min de catálogo caído) y un deploy de shopcart que borró todos los
pods a la vez (~83 s de checkout caído). Causas en la lección
[caídas al mover pods](../lessons/caidas-al-mover-pods-en-aks.md).

## Decisión

1. **Ventana de mantenimiento** en el AKS de prod (`vio-commerce-prod-sc`): `aksManagedNodeOSUpgradeSchedule`
   semanal, martes 02:00, 4 h, UTC+01:00. Las actualizaciones de imagen de nodo (`NodeImage`) solo ocurren ahí.
2. **istiod con HPA `minReplicas: 2`**: su PDB (`minAvailable: 1`) deja de bloquear el vaciado de nodos.
3. **Los despliegues hacen rollout**, nunca `kubectl delete pod`: `kubectl rollout restart deployment/<APP_PREFIX>`
   seguido de `kubectl rollout status --timeout=15m`, que falla el job si el rollout no termina. Aplicado en los 13
   micros (PRs `ci/despliegue-sin-caida` a develop y `release/despliegue-sin-caida` a la rama de prod), probado en QA
   y luego en prod el 27/10 de madrugada.

## Alternativas descartadas

- **Desactivar las actualizaciones de nodos**: deja los nodos sin parches de seguridad.
- **Seguir borrando pods pero de uno en uno** (script en el CI): reimplementa lo que ya hace un RollingUpdate y no
  espera a la readiness.
- **Cambiar el tag `latest` por tags inmutables en el mismo cambio**: correcto pero toca charts e imágenes de 13 repos;
  se deja como siguiente paso.

## Consecuencias

- Un deploy ya no corta el servicio **si** el micro tiene ≥2 réplicas y readiness. campaigns y template (1 réplica) y
  graph-ql (sin readiness) siguen expuestos.
- La ventana solo mueve el riesgo a la madrugada del martes: sin PDB ni réplicas repartidas por nodo, el vaciado sigue
  cortando (27/10 02:10–02:35). Los PDB son el siguiente paso, no opcional.
- Si un rollout se cuelga, el CI falla a los 15 min en lugar de dar verde con pods rotos.
