---
title: "Un \"pendiente\" heredado de un documento es una hipótesis, no un hecho"
date: 2026-10-19
author: miguel
tags: [metodo, handoff, verificacion, dns]
---

## Síntoma

Angelo pidió "haz D2" (cortar `api.vio.live` al micro de campañas en prod). **Ya estaba hecho desde
tres días antes, por mí mismo**, y documentado en su propio journal. No había nada que ejecutar.

## Causa real

El handoff del 19/10 traía en su tabla de estado de partida:

> `api.vio.live` | sigue en la VM de Oracle `82.70.54.151` (D2 no hecho)

Yo **repetí esa línea en el informe a Angelo sin comprobarla**, y la propagué además a un tercer
documento (`micro-campanas-infra.md`) al actualizarlo. Un dato de tres días antes se convirtió en
"estado verificado" solo por estar escrito en un doc con `status: live`.

Desmentirlo costaba un segundo:

```bash
dig +short api.vio.live A @1.1.1.1          # 135.116.206.152, no 82.70.54.151
curl -sI https://api.vio.live/health | grep -i server   # istio-envoy, no nginx/1.24.0
```

## La regla

Las secciones de "estado de partida", "pendientes" y "blockers" de un handoff son **la foto del
momento en que se escribió**, no un hecho vigente. Antes de repetirlas en un informe o de ejecutar
lo que dicen que falta:

1. **Verificar el estado de lo que vas a tocar**, no solo lo que vas a cambiar. Si el handoff dice
   "X está pendiente", comprobar X antes de empezar a hacerlo.
2. El coste de comprobar es asimétrico: una consulta DNS o un `kubectl get` contra ocho palabras de
   doc. Siempre gana comprobar.
3. Si el estado real difiere, **corregir el doc en la misma pasada** y decir quién y cuándo lo
   corrigió, para que el siguiente no herede el mismo error.

Esto es la misma familia que [verificar los claims de otros contra el código/infra real], pero el
sujeto aquí es **un documento mío de hace tres días**, que es justo el que menos se cuestiona.

## Daño

Ninguno material: el error era en la dirección segura (creer que falta algo que ya está) y no se
tocó nada. En la dirección contraria —creer hecho algo que falta— habría sido un corte a ciegas.
