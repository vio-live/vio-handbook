## Reconciliación del reparto de `product_category` y veredicto sobre P1b — Miguel

- **Quién:** Miguel, a petición de `jhondev` (preguntó directamente, no por registro en memoria).
- **Dónde:** `vio-handbook` (plan y lecciones), lectura de la MySQL de producción
  (`vio-commerce-prod-sc`, pod de `users`) y de los PR de `vio-products-microservice`,
  `vio-api-microservice` y `package-database`.
- **Cuándo:** 23/10, 21:50–22:10 (Oslo).
- **Contexto:** `jhondev` señaló una contradicción en el plan — el doc decía que a él y a `juan`
  «los desconvoqué antes de que abrieran nada», pero su PR #31 figura abierto a las 18:45, antes de
  las «20:40» de la decisión. Preguntó si la reasignación a `claude` seguía en pie y quién lleva P2.
- **Hecho:**
  - **Reconciliada la contradicción, y el equivocado era yo — dos veces.** La decisión de Angelo es
    el commit `e941cd0`, **20:42:58 +0200 = 18:42 UTC**; el PR #31 se abrió **18:45:11 UTC =
    20:45 Oslo**, y el #61 de `juan` a las 20:46. Son **tres y cuatro minutos después**, no «hora y
    media antes»: mi corrección previa mezclaba UTC con hora de Oslo. Sustituida en el plan por la
    secuencia completa en un solo huso. Lección en
    [`../../lessons/comparar-horas-sin-normalizar-el-huso.md`](../../lessons/comparar-horas-sin-normalizar-el-huso.md).
  - **Contestado el fondo: la pregunta es discutible pero ya no decide nada.** Los tres pasos
    entraron en producción esa misma noche porque Angelo lo pidió («vamos con todo»), y lo que se
    mergeó es el trabajo de ellos: P1 = `jhondev` (#31 → #32), P3 = `juan` (#61 → #62), P2 =
    `claude` (package-database#28, ejecutada en prod 19:27Z). Nadie pisó el fichero de nadie.
  - **Verificado en producción, lectura directa:** `product_category` con 5.871 filas, 5.871 vivas,
    5.871 pares distintos, 0 duplicados, e índice `UQ_product_category_live` sobre
    `(product_id, category_id, live)` con `live` como columna generada
    `if(deleted_at is null, 1, NULL)`.
  - **Veredicto sobre P1b (products#33, abierto): no bloquea.** Su premisa es el `UNIQUE` plano de
    package-database#26, que está **cerrado por superado**. Con el índice que sí entró, una fila
    con borrado lógico tiene `live = NULL`, los NULL no chocan en un índice único de MySQL y el
    reenlace inserta una fila viva sin error. El síntoma descrito (categoría que desaparece en
    silencio) no puede darse hoy. Se queda abierto por lo que aporta aparte: no dejar huérfanos por
    cada ciclo quitar/poner, conservar el `id`, y sobre todo **arreglar cuatro cosas que impedían
    correr la suite** del repo.
  - Registrado también el hallazgo de `jhondev` que no es de ese repo: con kernel
    `@vio-/database@1.0.282` el arnés de sqlite no levanta el esquema (`json`, `enum`,
    `collation: utf8mb4_*`). Va a `package-database` **después** del go-live.
- **Pendiente:**
  - La verificación de verdad de P1: importar dos veces el mismo producto de Shopify **contra el
    servicio desplegado** y contar. Lo hecho es la lógica SQL simulada contra datos de QA.
  - Revisar products#33 el lunes, después del go-live.
