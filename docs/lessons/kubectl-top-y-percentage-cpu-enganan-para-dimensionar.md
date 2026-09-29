---
title: "Dimensionar nodos de AKS: `kubectl top` es una foto y `Percentage CPU` del VMSS incluye instancias muertas"
date: 2026-09-29
owner: miguel
---

## Síntoma

Con `kubectl top nodes` el cluster `vio-commerce-prod` parecía desperdiciar CPU a lo bestia:

```
CPU     139m / 259m / 189m  de 3860m por nodo  -> 3-6%
memoria 41% / 50% / 49%
```

De ahí salió la conclusión "el límite es la memoria, no la CPU, así que pasamos de
D4as_v5 (4 vCPU/16GB) a E2as_v5 (2 vCPU/16GB) y ahorramos ~$200/mes". **Era falso**, y
habría dejado prod estrangulado.

## Causa real

Tres trampas encadenadas:

**1. `kubectl top` es instantáneo.** Esa medición se tomó un martes a las 09:00, en un
valle. El p50 horario real es 14,4% y el máximo 70,8% (2,83 cores de un D4as_v5). En un
E2as_v5 ese mismo pico serían **142%**: imposible.

**2. `Percentage CPU` del VMSS con `Maximum` y sin filtrar dimensión mezcla instancias
que ya no existen.** La consulta a 29 días daba picos de 85-93%, pero los nodos vivos son
los instance ID 87, 88 y 89 (creados el 24/09 07:07-07:17). Los IDs llegan al 89 porque
el pool se rota seguido. Filtrando por `VMName` aparecían `_0`, `_2`, `_3` — muertos hace
semanas. **Siempre hay que acotar la ventana al nacimiento de los nodos actuales**
(`kubectl get nodes -o json` -> `creationTimestamp`) y confirmar los instance ID vivos con
`az vmss list-instances`.

**3. Algunos de esos picos altos eran la rotación del propio pool, no la carga.** El
85,58% del 2026-09-24T07:00Z coincide exactamente con la creación de los tres nodos
actuales: image pulls y todos los pods reprogramándose a la vez. Un pico de
provisioning no dice nada sobre el dimensionado.

Serie limpia (120 muestras horarias, sólo nodos actuales, carga actual):

```
p50 14,4%   p95 41,0% (1,64 cores)   p99 67,1%   max 70,8% (2,83 cores)
```

## Y una trampa aparte: los requests

Independiente de lo anterior, los **requests** de CPU del cluster son 7334m contra 379m
de uso real (19x). Eso no cuesta plata directamente, pero sí importa: con 11580m
allocatable, el autoscaler levanta un cuarto nodo (~$208/mes) en el próximo deploy aunque
la CPU real esté al 3%. Y bloquea cualquier SKU más chico: 7334m de requests **no entran**
en los ~5700m de 3 × E2as_v5, los pods quedarían `Pending` sin importar el uso real.

Bajar requests es seguro mientras los limits queden altos: los limits son los que
estrangulan, los requests sólo garantizan y condicionan el scheduling.

## Cómo se arregla / evita

- Nunca dimensionar con una sola muestra de `kubectl top`. Sin Container Insights ni
  Prometheus (este cluster no tiene ninguno), la fuente es `Percentage CPU` del VMSS, pero
  acotada a la vida de las instancias actuales y mirando percentiles, no sólo el máximo.
- Descartar las ventanas que contengan una rotación de nodos.
- Separar dos preguntas que se confunden: "¿sobran requests?" (casi siempre sí) y
  "¿sobra hardware?" (hay que probarlo con el p95/p99 real).
- Para bajar costo sin tocar el dimensionado, mirar reservas antes que SKUs más chicos.
  Retail Prices API, Norway East, `Standard_D4as_v5`, 3 nodos:
  PAYG lista $942/mes · reserva 1 año **$332/mes** · reserva 3 años **$213/mes** · Spot $100/mes.
  Ojo: la factura real medida era $623/mes, o sea 66% de la lista PAYG — comparar contra
  Cost Management, no contra la lista, y confirmar el ahorro en el flujo de compra del portal.
