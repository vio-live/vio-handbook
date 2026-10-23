## P3 — `getChannelUserByIdV2` no depende de `product_category` limpia — juan

- Contexto: Miguel me pasó la tarea por sesión entre agentes (la P3 estaba sin asignar en el
  reparto). Brief completo en
  [`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md)
  y el incidente en
  [`2026-10-23-api-muere-por-heap-en-prod.md`](2026-10-23-api-muere-por-heap-en-prod.md):
  `getChannelUserByIdV2` hidrataba el catálogo con un único join cartesiano, y con los duplicados de
  hoy en `product_category` (hasta 132 filas para una sola combinación producto/categoría en el
  peor caso de Careless) eso multiplicaba el join de 1.582 a 51.576 filas — una petición de ~15 MB
  pasaba a ~172 MB y tumbaba el proceso por heap.
- Hecho: en `vio-api-microservice`, `src/modules/channel/providers/channel.service.ts`, las 4 rutas
  de hidratación de `getChannelUserByIdV2` (`collection`, `variant`, `product`, `collectionShared`)
  dejan de hacer `leftJoinAndSelect`/`leftJoin` de `productCategory` → `category` dentro de la
  consulta principal. En su lugar, una vez hidratado el catálogo completo (después del
  `Promise.all(channelInfo.map(getInfo))`), se hace **una sola consulta por lote**
  (`product.id IN (...)` contra `_productCategoryRepository`, ya inyectado pero sin usar en este
  archivo) y se adjunta `productCategory` a cada producto antes de los filtros/orden en memoria.
  El endpoint deja de multiplicar aunque la tabla se vuelva a ensuciar — es la red de seguridad que
  pedía el plan, independiente de que P1/P2 limpien el dato. PR abierto a `develop` (no mergeado,
  no desplegado — congelación por el go-live del 26/10):
  https://github.com/vio-live/vio-api-microservice/pull/61
- No toqué el filtrado/orden/paginación en memoria del endpoint (P4, ~4.800 líneas) — fuera de
  alcance según el plan.
- **No pude correr la verificación en QA real** que pide el criterio de hecho (`VmHWM` antes/después
  con la petición del channel que explota hoy), por dos límites de este entorno, no del plan:
  - QA solo se despliega por CI al hacer push a `develop` (visto en `.github/workflows/deploy.yml`),
    y mergear está fuera de alcance (ADR-0001, "paro en push + PR"). No tengo tampoco las
    credenciales de CI (service principal de Azure / login de ACR) para construir la imagen a mano
    como hizo Miguel con el parche de contención de prod.
  - Tampoco pude instalar `@reachu/database` en este entorno (el scope no está mapeado a un
    registro privado en el `.npmrc` disponible aquí, solo a `registry.npmjs.org`), así que no hay
    `tsc --noEmit` real. Lo que sí hice: validar que el archivo sigue siendo TypeScript
    sintácticamente válido con `esbuild` (sin bundlear, solo parseo), y confirmar los nombres de
    relación (`productCategory.product`, `productCategory.category`) contra el uso ya probado de
    `_productCategoryRepository` en `vio-products-microservice/src/modules/product/providers/product.service.ts`
    (`linkProductCategory`, `getCategoriesByProduct`) — mismo paquete `@reachu/database`, mismas
    entidades.
  - Dejé el comando exacto de verificación (el mismo del plan) en la descripción del PR, para que
    quien mergee a `develop` lo corra en QA antes de dar P3 por cerrado: la petición que hoy deja
    ~172 MB debería quedarse en ~15 MB.
  - Noté en `kubectl config get-contexts` que el contexto activo al empezar era
    `vio-commerce-prod-sc` (prod). No ejecuté nada contra ese contexto — el plan es explícito en
    que prod está congelada hasta el lunes.
- Pendiente:
  - Verificación real en QA (`VmHWM` antes/después) una vez el PR esté en `develop`.
  - Avisar antes de mergear/desplegar — sigue frenado por el go-live del 26/10.
