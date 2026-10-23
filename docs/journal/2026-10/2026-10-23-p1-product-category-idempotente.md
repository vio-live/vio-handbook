## P1 — `product_category` idempotente en vio-products-microservice — jhondev

- Contexto: brief de Miguel (acordado con Angelo), ver
  [`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md)
  y [`2026-10-23-reparto-del-plan-product-category.md`](2026-10-23-reparto-del-plan-product-category.md).
  `product_category` tenía 268.590 filas vivas para 5.871 pares reales porque cuatro sitios en
  `product.service.ts` escribían sin comprobar si el vínculo ya existía.
- Hecho: extraído el patrón de `linkFeedCategory` (findOne → skip si existe) a un helper único
  `linkProductCategory(productId, categoryId)`. Las cuatro rutas pasan por él ahora:
  `categoryShopify` (~641), el bucle de duplicar producto en `createDemos` (~4913), y los bloques
  de diff de categorías en `doUpdate` (~1081) y `newUpdate` (~3120) — estas dos ya filtraban contra
  una lista en memoria, el helper añade un backstop a nivel de BD. Añadido un test
  (`categoryShopify` en `product.service.spec.ts`) que llama dos veces y comprueba que no duplica
  la fila. PR abierto a `develop` (no mergeado, no desplegado — congelación por el go-live del
  26/10): https://github.com/vio-live/vio-products-microservice/pull/31
- No pude correr la suite completa en este entorno: sandbox sin DB de test y un conflicto de
  resolución de dependencias (Jest 27 contra una versión del SDK de Azure que trae `@vio-/service`,
  preexistente, no causado por este cambio). `tsc --noEmit` pasa limpio. **Falta la verificación en
  QA real** que pide el criterio de hecho del plan: importar dos veces el mismo producto de Shopify
  y contar `product_category` antes/después.
- Aviso: el brief que recibí mencionaba coordinar P2 con `maxi`, pero `maxi` es Lovisa (legal, no
  desarrollo) y ya rebotó ese mismo trabajo — ver
  [`2026-10-23-reparto-del-plan-product-category.md`](2026-10-23-reparto-del-plan-product-category.md)
  y [`../../../memory/reference_team_roster_agents.md`](../../../memory/reference_team_roster_agents.md)
  en mi propia memoria. Ese reparto también dice que P1+P2 quedaron juntas a propósito por el orden
  de despliegue. No arranqué P2 (otro repo, `package-database`, con una decisión bloqueante pendiente
  sobre borrado lógico vs. índice único) sin que me llegue ese brief explícito.
- Pendiente:
  - Confirmar a Miguel que esto está recogido y hecho (no solo registrado), por la lección de
    [`../../lessons/mandar-trabajo-a-otro-agente.md`](../../lessons/mandar-trabajo-a-otro-agente.md).
  - Aclarar quién lleva P2 ahora que `maxi` no es la vía.
  - QA real: contar filas antes/después de dos importaciones del mismo producto Shopify.
  - Avisar antes de mergear/desplegar — sigue frenado por el go-live.
