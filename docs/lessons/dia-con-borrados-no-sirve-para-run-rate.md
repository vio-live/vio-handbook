---
title: Un día en el que borraste recursos no sirve para leer run-rate
last-updated: 2026-09-30
---

## Síntoma
Mirás el coste por resource group del último día disponible, ves `rg-vio-shared` a 45 USD/mes y
`ai-services` a 26 USD/mes, y armás una lista de "restos que sobran, ~70 USD/mes de ahorro".
Después bajás a nivel de recurso y no queda nada que borrar.

## Causa real
Azure imputa al día el consumo **parcial** de los recursos que existieron durante parte de él. Si ese
día borraste cosas, el RG sigue mostrando el gasto de lo ya eliminado. Multiplicar por 30 convierte
un residuo de unas horas en un ahorro mensual imaginario.

En el caso del 29/09: los 45 USD/mes de `rg-vio-shared` eran la VM de ClickHouse y sus discos, y los
26 de `ai-services` eran `vio-openai-main` — las tres borradas **ese mismo día**.

## Cómo evitarlo
1. Leer siempre el **último día completo sin cambios de estado**, no el día del recorte.
2. Agrupar por `ResourceId`, no por `ResourceGroupName`: el nombre del recurso delata al fantasma.
3. Cruzar contra `az resource list -g <rg>` antes de prometer un ahorro. Si el recurso no está en la
   lista, no hay nada que borrar.

## Relacionado
Es la misma trampa que `no promediar sobre cambios de estado`, vista desde el otro lado: ahí el
problema era promediar, acá es proyectar un solo día.
