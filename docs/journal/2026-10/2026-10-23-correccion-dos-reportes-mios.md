---
title: "Corrección de dos cosas que reporté mal la noche del 23/10"
date: 2026-10-23
participants: [angelo, miguel]
status: live
---

## Dos errores míos, verificados y corregidos — miguel

- Quién: miguel (Angelo: «es que te llevas equivocando toda la tarde»)
- Dónde: `vio-commerce-prod-sc` / ns `default`, repos `vio-api-microservice` y
  `vio-products-microservice`
- Cuándo: 2026-10-23, verificación a las 20:34 UTC
- Contexto: noche de congelación de prod, con claude subiendo arreglos del endpoint de channel.

## 1. Dije que alguien había borrado los pods de `api` a las 20:07. Era el pipeline.

Lo que vi: los dos pods de `api` desaparecieron y volvieron **con el mismo ReplicaSet**
(`api-b85f6b78f`), y de ahí deduje que no era un deploy y que alguien los había eliminado a mano.
Le pregunté a Angelo si había sido él o claude.

Lo que era: **el deploy a master del PR #66**. El run de Actions corrió
**20:02:24 → 20:08:17 UTC**, que encaja exactamente con el hueco.

El razonamiento estaba invertido: en estos repos **el deploy no cambia el ReplicaSet** cuando no
cambia el chart — borra los pods por label y los recrea sobre el mismo RS (es la misma mecánica que
ya medí en [`replicas-no-evitan-el-corte-del-deploy`](../../lessons/)). Ver el mismo hash de RS es
lo *esperado* en un deploy aquí, no la prueba de que no lo hubo.

**Cómo se comprueba bien, en 10 segundos:** cruzar la edad del pod con
`gh run list --repo <repo> --limit 6` y mirar si hay un run de `master` que termine en esa ventana.
Si lo hay, es el CI. Si no lo hay, entonces sí toca mirar el nodo.

## 2. Dije que el PR #63 de `api` quedaba pendiente para el lunes. Ya estaba en prod.

- #63 → `develop` a las **19:40:49**
- **#64 → `master` a las 19:49:13**, deploy `success`

O sea que el arreglo (sin `page`/`size` no hidrata el catálogo) llevaba ~45 min en producción
cuando yo lo anuncié como pendiente. Lo di por abierto leyendo el estado de la rama de develop sin
buscar el PR gemelo a master. En estos repos **cada arreglo viaja en dos PRs** (uno a `develop`,
otro a `master`): mirar solo uno de los dos da el estado equivocado la mitad de las veces.

## Estado real a las 20:34 UTC, para que quede un sitio con la verdad

- `api` 2/2 Running, **0 restarts**, 26 min. `products` 2/2, 68 min. Los dos sirviendo 200.
- A `master` esta noche entraron: api **#62** (19:29), **#64** (19:49), **#66** (20:02);
  products **#32** (19:20). Eso es lo que corre en prod.
- En `develop` sin subir: api **#67** (20:09) y **#69** (20:29).
- Abierto de verdad: **api #68** (a master) y **products #33** (solo tests).
- Cada deploy a master corta ~60 s de 503 aunque haya 2 réplicas. #68 sería el cuarto de la noche;
  recomendé a Angelo dejarlo parado hasta el lunes si no es necesario para el go-live. Decide él.

## Pendiente

Nada técnico abierto por esto. Lo que cambio de mi parte: no reportar estado de PRs ni de pods sin
`gh pr list --state open` + `gh run list` + `kubectl get pods` en la misma pasada que el mensaje.
