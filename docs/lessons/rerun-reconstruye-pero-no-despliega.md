---
title: "Relanzar un run recoge el cambio del blob, pero no reemplaza los pods"
date: 2026-11-05
author: miguel
status: live
---

## Síntoma

Cambias el `.env` en el blob, relanzas el último run de CI para que la imagen lo recoja, el run sale
**verde**, el `helm upgrade` dice OK… y el pod sigue con el valor viejo. Parece que el blob no llegó
a la imagen.

## Causa real

La etiqueta de imagen de estos workflows es `github.run_number`, y **un re-run conserva el número de
run**. El build sí reconstruye y sí sobrescribe ese tag en el registry con la imagen nueva, pero
después Helm renderiza un manifiesto **idéntico** al que ya está aplicado (misma `image.tag`), así
que Kubernetes no ve ningún cambio y **no reemplaza ningún pod**. `imagePullPolicy: Always` no
rescata nada: solo actúa cuando se crea un pod, y aquí no se crea ninguno.

O sea: la imagen nueva existe, pero nadie la está ejecutando.

## Cómo se arregla

```bash
kubectl rollout restart deploy/<servicio>
kubectl rollout status  deploy/<servicio> --timeout=300s
```

El pod nuevo se baja el mismo tag, que ahora es la imagen reconstruida.

## Cómo evitar el falso diagnóstico

Antes de culpar al blob o al Dockerfile, comprobar **dentro del pod** si el fichero tiene el valor:

```bash
kubectl exec <pod> -c <svc> -- grep -c "^MI_VAR" .env.local
```

Y mirar la edad del pod: si es anterior al run que relanzaste, el run no lo tocó. Un pod más viejo
que el despliegue que crees haber hecho es la pista, igual que en
[objeto más viejo que su nodo](objeto-mas-viejo-que-su-nodo.md).

## Cuándo sí hay rollout

Un **push** nuevo sí: cambia el `run_number`, cambia la etiqueta, cambia el manifiesto y Helm hace
el rolling update de verdad. El re-run es el único caso raro — y es justo el que apetece usar cuando
el cambio está en el blob y no en el código, porque no quieres ensuciar la rama con un commit vacío.
