---
title: Cost Management ya devuelve datos reales — ranking de costos verificado
date: 2026-09-23
owner: miguel
---

## Ranking de costos con datos de facturación reales — Miguel

- **Quién:** Miguel, a pedido de Angelo ("qué es lo más caro de la infra").
- **Dónde:** suscripción Azure Sponsorship `3d276f7e…`.
- **Cuándo:** 2026-09-23, ~08:40 UTC.

### Contexto

Hasta ahora todos los costos del handbook eran **estimaciones** hechas con la Retail Prices API por inventario, porque Cost Management no devolvía filas para esta suscripción (ver `docs/lessons/azure-sponsorship-sin-datos-de-costo.md`). **Eso ya no es cierto:** la query de Cost Management ahora responde con datos reales, presumiblemente porque desde el 2026-09-16 la suscripción factura de verdad en vez de consumir créditos.

La moneda de la respuesta es **NOK**, no USD. Las conversiones de abajo usan 10,6 NOK/USD.

### Ranking real — 2026-09-22 (último día completo)

Total: **514 NOK/día ≈ $1.474/mes**.

| # | Recurso | USD/mes | Nota |
|---|---|---|---|
| 1 | `aks-agentpool-...-vmss` (nodos de `vio-commerce-prod`) | ~$353 | |
| 2 | `aks-e2asv4pool-...-vmss` (nodos de `kubernetesqa`) | ~$257 | Aún 24/7 ese día; el horario empezó a funcionar esa misma noche |
| 3 | `redus-vio-prod` | ~$184 | El audit lo estimaba en $144 |
| 4 | `vio-ecom-db-staging` | ~$147 | El paso a B2s fue ese mismo día, todavía parcial |
| 5 | `vio-ecom-db-prod` | ~$124 | El cálculo por retail decía $221: ver corrección abajo |
| 6 | **8 discos OS de nodos AKS** | **~$108** | **No aparecía en ningún audit** |
| 7 | `containerproduction2` | ~$32 | |
| 8 | `redus-vio-staging` | ~$28 | |
| 9 | `vm-clickhouse-vio` | ~$25 | ADR-0010, se mantiene |
| 10 | `prod-cdn` (Front Door) | ~$23 | |
| | control planes AKS + 46 recursos chicos | ~$150 | |

### Tres correcciones al audit del 16/09

1. **`vio-ecom-db-prod` cuesta ~$124/mes, no ~$221.** El cálculo por Retail Prices API (2 vCore × $0,1490/h × 730 + storage) daba $221, pero la facturación real del 22/09 son 43,3 NOK/día. Cuando haya diferencia, **mandan los datos de Cost Management**. Esto reduce el ahorro real de pasarla a Burstable B2s.
2. **`redus-vio-prod` sale ~$184/mes**, no los ~$144 estimados. Es el tercer recurso más caro de toda la infra, y el audit ya había medido que usa 1 % de memoria y 4 ops/s.
3. **Los discos OS de los nodos AKS suman ~$108/mes** entre 8 discos (~$16 c/u). Nunca se habían contabilizado. Los node pools se crearon con disco OS administrado Premium; con **ephemeral OS disk** el costo sería $0, pero cambiarlo obliga a recrear el node pool.

### Histórico útil

`vio-ecom-db-prod` facturó ~1 NOK/día hasta el 20/09 y saltó a 35 el 21 y 43 el 22: es el rastro del apagado de prod del 16/09 y su reencendido, coherente con la decisión de Angelo del 22/09 de dejar commerce prod encendido.

### Pendiente

- Angelo decidió el 23/09 **esperar con prod**: nada de lo de arriba se toca en prod (AKS, MySQL ni Redis) hasta que él lo retome.
- Lo de staging/QA sigue habilitado: node pool de QA, apagado nocturno de la MySQL de staging, Redis staging a B0.
- Evaluar los discos OS efímeros la próxima vez que haya que recrear un node pool — se puede hacer junto con el cambio de SKU de QA, sin trabajo extra.
