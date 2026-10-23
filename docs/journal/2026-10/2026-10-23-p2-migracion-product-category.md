## P2 — migración de dedupe + UNIQUE en product_category — Miguel

- **Quién:** Miguel.
- **Dónde:** repo `package-database` (rama `feat/product-category-dedupe-unique-index`, PR
  [#26](https://github.com/vio-live/package-database/pull/26) contra `develop`, no mergeado).
- **Cuándo:** 23/10 noche, tras el incidente de heap de `api` del mismo día.
- **Contexto:** la tarea me llegó reenviada por la sesión de `maxi` (perfil legal/Lovisa, que
  rebotó la tarea porque no era suya) y después confirmada con datos nuevos por otra sesión mía
  (`miguel:discord:direct`). Antes de escribir nada verifiqué el contenido contra mi propio plan
  ([`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md))
  y contra la base real, no contra lo que decían los mensajes reenviados.
- **Hecho:**
  - Revisada la entidad real (`ProductCategory.js` en `@vio-/database` 1.0.282, y el código fuente
    en `package-database`): `deletedAt` es `DeleteDateColumn` nullable. Confirmado por qué
    `UNIQUE(product_id, category_id, deleted_at)` no funciona — MySQL no iguala NULL con NULL
    dentro de un índice único, así que esa variante deja duplicarse el 100% de las filas vivas.
  - Medido en prod (lectura, pod de `users`, `vio-commerce-prod-sc`): 268.776 filas, 5.871 pares
    reales, 0 soft-deleted, 0 `product_id`/`category_id` NULL, peor par 13.671 filas
    (product_id 421186, category_id 3529). Esto corrige el "132 filas" del plan original.
  - Probada la lógica de desempate (ROW_NUMBER, prefiere fila viva, si no la de menor id) en modo
    **solo lectura** contra QA (`kubernetesqa-sc`), que sí tiene 155 filas soft-deleted y 2 pares
    mixtos. En los dos pares mixtos la fila viva tenía el id más alto; la regla "menor id siempre"
    habría borrado la categoría viva por error — la regla implementada no.
  - Migración `1792800000000-product-category-dedupe-unique.ts`: dedupe por lotes de 2.000 filas
    en bucle (no una sola sentencia), re-ejecutable, con una comprobación de seguridad antes de
    crear el índice (`count(*) - count(distinct ...)` debe ser 0). `down()` sólo revierte el
    índice, no las filas borradas — documentado explícitamente en el código.
  - Añadido `@Index('IDX_product_category_unique', ['product', 'category'], { unique: true })` a
    la entidad para que no quede desincronizada del esquema.
  - `npx tsc --noEmit` limpio. Repuesto el contexto de `kubectl` a prod al terminar de leer QA.
- **Pendiente / bloqueante:**
  - **No corre en ningún entorno hasta que P1 (`vio-products-microservice` PR #31, de jhondev)
    esté desplegado ahí.** Sin eso, re-vincular una categoría quitada antes rompe contra el índice.
  - PR sin revisar ni mergeado. ADR-0001: paro aquí.
  - Nada en prod antes del lunes 26/10 (congelación Careless+Aller).
  - Avisé a Angelo de una inconsistencia entre sesiones: un mensaje reenviado decía que jhondev y
    juan estaban "desconvocados" de P1/P3 a favor de una sola sesión — eso es falso, los dos ya
    tienen PR abierto (#31 y #61 respectivamente) y la sesión de `vio` dice que esa reasignación
    sigue pendiente del visto bueno de Angelo, no decidida. No actué sobre esa parte; se la dejo a
    él para que la resuelva con el resto del equipo.
