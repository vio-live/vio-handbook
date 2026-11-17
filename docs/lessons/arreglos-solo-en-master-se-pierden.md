---
title: "Un arreglo hecho solo en master se pierde en la siguiente release por cherry-pick"
last-updated: 2026-11-17
owner: angelo
---

# Un arreglo hecho solo en master se pierde en la siguiente release por cherry-pick

**Qué pasó (17/11).** Al preparar la release de códigos de descuento, extensions tenía en `master` tres PRs
(#14, #15 y #16: backoff, tope de 5 reintentos y `flowControl` en el consumidor de Pub/Sub). Se hicieron directamente
sobre prod tras el incidente del 02/10 y **nunca llegaron a `develop`**. Mientras, en `develop`,
[#77](https://github.com/vio-live/vio-extensions-microservice/pull/77) reescribió el mismo handler sin esas
protecciones. Un cherry-pick ciego de develop habría quitado de prod el arreglo del incidente sin que nadie lo notara.
Se vio solo porque la release se comprobó con `git diff origin/develop` y el diff no salía vacío.

**Por qué pasa.** Las releases van por cherry-pick (develop → `release/*` → master) porque las dos ramas divergieron.
Un commit que entra en master por otro camino no tiene equivalente en develop, y QA nunca lo prueba.

**Cómo evitarlo.**
- Un arreglo urgente en prod se hace en develop y se lleva a master por cherry-pick, igual que todo. Si se hizo en
  master, se porta a develop el mismo día.
- Al preparar una release, comprobar que `git diff origin/develop` en la rama release queda vacío, salvo `charts/`.
  Cualquier otra diferencia se explica en el PR antes de mergear.
- `git cherry -v origin/master origin/develop` (líneas `+`) dice qué falta de verdad en prod. `compare ahead_by`
  cuenta de más, porque incluye lo ya llevado con otro sha.

**Pendiente:** portar #14–#16 a develop, combinados con #77.
