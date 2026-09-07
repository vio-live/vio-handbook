---
title: "Un kubectl patch de memoria se pierde en el próximo deploy de Helm"
last-updated: 2026-09-07
owner: miguel
---

# Un kubectl patch de memoria se pierde en el próximo deploy de Helm

**Síntoma:** parcheaste `limits.memory` de un deployment a mano (`kubectl patch`) para
estabilizar un pod en crashloop por OOM. Funciona. Horas después, un deploy normal de CI/CD
(sin relación aparente con el cambio) vuelve a tumbar el servicio con el mismo OOM.

**Causa real:** el pipeline de deploy usa `helm upgrade` con un chart que trae
`resources.limits.memory` hardcodeado en `values.yaml` (o en el propio template). Cada
`helm upgrade` reconcilia el manifiesto completo contra el chart — no hace diff selectivo —
así que cualquier campo que no venga de un `--set` explícito vuelve al valor del chart,
pisando el `kubectl patch` sin avisar ni loguear nada raro.

**Cómo se detecta:** después de un deploy, comparar
`kubectl get deploy <nombre> -o jsonpath='{.spec.template.spec.containers[0].resources}'`
contra lo que se había parcheado a mano. Si volvió al valor viejo, es esto.

**Cómo se arregla (bien, no el parche):** subir el límite directo en el chart/`values.yaml`
del repo, no en el cluster. Un `kubectl patch` posterior a un deploy es un band-aid válido
para frenar la hemorragia mientras se prepara el PR con el fix real — pero hay que asumir
que se va a perder en el próximo `helm upgrade` y reaplicarlo, o simplemente no considerar
resuelto el incidente hasta que el valor esté commiteado.

**Visto en:** [[project journal 2026-09-07 — products crashloop OOM feed]]
