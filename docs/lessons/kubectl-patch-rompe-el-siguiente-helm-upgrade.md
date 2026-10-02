---
title: Un kubectl patch rompe el siguiente helm upgrade (server-side apply)
last-updated: 2026-10-02
---

## Síntoma
Parcheas algo en caliente para levantar un servicio, abres el PR que lo persiste, lo mergeas, y **el
deploy falla** hablando de conflictos:

```
UPGRADE FAILED: conflict occurred while applying object default/products apps/v1, Kind=Deployment:
Apply failed with 5 conflicts: conflicts with "kubectl-patch" using apps/v1:
- .spec.template.spec.containers[name="products"].livenessProbe.failureThreshold
- .spec.template.spec.containers[name="products"].livenessProbe.periodSeconds
...
```

Lo confuso es que el chart y el cluster tienen **el mismo valor**. No es un conflicto de contenido.

## Causa real
Helm 3 usa **server-side apply**, y ahí cada campo tiene dueño: el `managedFields` del objeto. Un
`kubectl patch` registra un field manager llamado `kubectl-patch` como dueño de los campos que tocó, y
a partir de ese momento Helm (manager `helm`) **no puede sobrescribirlos**, ni para ponerles el mismo
valor.

O sea: la mitigación en caliente bloquea el arreglo definitivo.

## Cómo salir
Quitar al manager la propiedad de esos campos. Los valores **no se borran** — sólo la entrada de
propiedad — así que no hay cambio de comportamiento ni reinicio:

```bash
IDX=$(kubectl -n <ns> get deploy <dep> -o json --show-managed-fields \
  | python3 -c "import json,sys
for i,m in enumerate(json.load(sys.stdin)['metadata'].get('managedFields',[])):
    if m.get('manager')=='kubectl-patch': print(i); break")

kubectl -n <ns> patch deploy <dep> --type=json \
  -p "[{\"op\":\"remove\",\"path\":\"/metadata/managedFields/$IDX\"}]"
```

Después, relanzar el deploy. **Ojo:** `managedFields` no sale en un `kubectl get -o json` normal, hace
falta `--show-managed-fields`; sin esa bandera la lista aparece vacía y parece que no hay managers.

## Cómo evitarlo
- Para mitigar en caliente, preferir `kubectl rollout restart`, `scale`, o editar lo que ya es tuyo.
  Si hay que tocar campos del chart, saber que habrá que limpiar el manager después.
- O aplicar la mitigación **con el mismo field manager que usa Helm**:
  `kubectl apply --server-side --field-manager=helm --force-conflicts`.
- Y la de siempre: no dar un deploy por bueno sin leer su resultado. Aquí `gh run watch --exit-status` devolvió **0** sobre un run que acabó en `failure`; lo que delató
  el fallo fue `gh run view --json conclusion`.
