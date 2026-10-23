## Reparto del plan de `product_category` a los agentes — Miguel

- **Quién:** Miguel. Coordinación con `vio` (Trello), `jhondev` (P1+P2), `juan` (P3). `maxi` rebotó.
- **Dónde:** repos `vio-products-microservice`, `package-database`, `vio-api-microservice`.
  Nada ejecutado en infraestructura: sólo despacho y verificación de lectura.
- **Cuándo:** 23/10 por la noche, después del incidente de heap de `api`.
- **Contexto:** Angelo pidió el arreglo con código y no limpieza a mano
  (*«no, lo quiero con código»*), y apoyarnos en los otros agentes. El plan quedó en
  [`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md).
- **Hecho:**
  - Verificado en el código, no supuesto, dónde se escribe `product_category` antes de escribir los
    briefs: `product.service.ts` de `vio-products-microservice`, cuatro sitios —`categoryShopify`
    (~641) y la ruta de duplicar producto (~4913) insertan **sin comprobar**; `newUpdate` (~1081 y
    ~3120) filtra contra `allCategoriesOfAProdcut`; `linkFeedCategory` (~5379) hace `findOne` y sale.
    Ese último es el patrón a replicar.
  - Briefs despachados con criterio de hecho medible cada uno (conteo antes/después en QA para P1;
    `count(*) == count(distinct …)` más el índice para P2; `VmHWM` de 172 MB a ~15 MB para P3).
  - Localizada y trasladada a P2 una trampa que no estaba en el plan inicial: la tabla tiene
    **borrado lógico** (`softDelete` en ~1055 y ~3088), así que un `UNIQUE (product_id, category_id)`
    plano hace fallar el re-añadir una categoría que el vendedor quitó antes. Entregado como
    decisión bloqueante, no como detalle.
  - P1 y P2 reunidas en un solo agente a propósito: están acopladas por el orden de despliegue.
  - Corregido el reparto en el plan tras el rebote de `maxi` (perfil legal, ya no desarrollo) y
    avisado a `vio` de que dos dueños de sus tarjetas propuestas estaban mal antes de crearlas.
- **Pendiente:**
  - Confirmación explícita de `jhondev` (P1+P2) y `juan` (P3) de que las cogen. Entregado no es
    aceptado — ver [`../../lessons/mandar-trabajo-a-otro-agente.md`](../../lessons/mandar-trabajo-a-otro-agente.md).
  - Las tarjetas de Trello esperan el visto bueno de Angelo en #dev.
  - La decisión de P2 sobre borrado lógico vs físico sube a Angelo si se opta por lo segundo.
  - Orden de despliegue y ventanas: míos. P1 desplegado antes de que corra P2 en ese entorno.
