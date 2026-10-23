---
title: Node se pone su propio techo de heap y aborta con media memoria del contenedor sin usar
date: 2026-10-23
author: miguel
---

# Síntoma

Un pod se reinicia solo, varias veces, sin que nadie lo toque. `kubectl describe` **no** dice
`OOMKilled`. El contenedor tiene límite de 512Mi y `kubectl top` lo enseña en 170-200Mi, o sea
cómodo. Desde fuera se ve como una pared de 503 en el dashboard, de todos los endpoints a la vez.

El único rastro está en el log del contenedor **anterior** (`kubectl logs --previous`):

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Mark-Compact (reduce) 250.8 (258.1) -> 250.5 (258.4) MB
Aborted (core dumped)
error Command failed with exit code 134.
```

# Causa

**Node decide su `max-old-space-size` a partir del límite del cgroup y se queda más o menos en la
mitad.** Con 512Mi de límite, el techo de heap es **~256 MB**. Cuando el heap llega ahí, el proceso
**aborta él solo**: no interviene el kernel, así que no hay evento `OOMKilled` en ninguna parte.

De ahí la pista que más confunde: **exit 134 (SIGABRT) no es 137 (SIGKILL)**.

- **134** = Node se quedó sin heap y abortó. Sobra memoria en el contenedor.
- **137** = el kernel lo mató por pasarse del límite del contenedor.

Buscar «OOMKilled» en un 134 no devuelve nada y parece un reinicio sin causa.

# Cómo se comprueba, en un comando

```bash
kubectl exec -n default <pod> -c <svc> -- \
  node -e "console.log(Math.round(require('v8').getHeapStatistics().heap_size_limit/1048576))"
```

Si eso da ~256 con un límite de 512Mi, hay media memoria del contenedor que el proceso **nunca va
a usar**.

# Arreglo

`NODE_OPTIONS=--max-old-space-size=<MB>`, y **subir también el límite del contenedor**. Lo segundo
no es opcional: si se le da a Node un techo de 400 MB dentro de 512Mi, el fallo solo cambia de
forma — pasa de abortar por heap (134) a que el kernel lo mate (137). Hay que medir el RSS real
durante la petición que lo revienta y dejar margen por encima.

Medido el 23/10/2026 en `api` de producción: la petición que mataba el proceso deja el contenedor
en **414Mi de RSS**. Por eso el límite subió a 768Mi y no se quedó en 512Mi.

# Lo que esto NO arregla

Subir el techo es la red de seguridad, no la causa. Si una petición construye en memoria algo que
crece con los datos — un endpoint que hidrata el catálogo entero antes de filtrar y paginar —, con
el doble de heap solo hace falta el doble de datos para volver a caerse. El arreglo de fondo es
acotar la consulta.

# Relacionado

- `saturado-no-es-colgado.md` — la otra mitad de la distinción 137 vs 134.
- `../journal/2026-10/2026-10-23-api-muere-por-heap-en-prod.md`
