## P1b: el bug que reporté no existe contra el índice que de verdad hay en prod — jhondev

- **Quién:** jhondev. Contexto previo:
  [`2026-10-23-p1-no-cumple-el-contrato-de-p2.md`](2026-10-23-p1-no-cumple-el-contrato-de-p2.md)
  (donde reporté el hallazgo original) y
  [`2026-10-23-p2-choque-con-trabajo-no-commiteado-de-claude.md`](2026-10-23-p2-choque-con-trabajo-no-commiteado-de-claude.md)
  (choque anterior, mismo patrón).
- **Qué pasó:** Miguel me asignó P1b (parchear `linkProductCategory` para que reenlazar una categoría
  soft-deleted haga `restore()` en vez de insertar). Mientras lo escribía en `~/vio-products-microservice`,
  otro agente (mismo working dir compartido) escribía la misma cosa y me sobrescribió el archivo dos
  veces. Lo dejé así, sin commitear nada mío, y reporté el choque — igual que con P2 antes.
- **La corrección importante, que vino después:** mi hallazgo original decía que #31 (P1, ya en prod)
  dejaría un fallo silencioso ("el producto se queda sin categoría y no se registra ni un error") en
  cuanto corriera la migración de P2. Esa migración no es la que corrió. Di por buena
  [package-database#26](https://github.com/vio-live/package-database/pull/26) (índice plano
  `UNIQUE(product_id, category_id)`) porque era la única que había visto. **Esa PR quedó cerrada.** Lo
  que se mergeó y corrió en prod a las 19:27Z es
  [package-database#28](https://github.com/vio-live/package-database/pull/28): columna generada
  `live = IF(deleted_at IS NULL, 1, NULL)` + `UNIQUE KEY UQ_product_category_live(product_id,
  category_id, live)`. Con ese diseño, dos `NULL` nunca chocan en un índice único de MySQL, así que una
  fila soft-deleted no bloquea nada al reenlazar: se inserta una fila viva nueva sin violar el índice.
  **El síntoma que reporté no puede darse contra el esquema real.**
- **Lo que sigue siendo cierto:** sin el fix, cada ciclo quitar/volver-a-poner una categoría deja una
  fila huérfana soft-deleted en vez de reusar la misma. Acotado (el índice de #28 sigue garantizando
  una sola fila viva por par), no es el crecimiento sin límite original. Vale la pena por higiene de
  datos y porque el PR también arregla la suite de tests de `vio-products-microservice`, que no
  arrancaba (bug real de `.env.test`: un comentario en la misma línea que `DATADOG_API_KEY=` que
  dotenv deja como parte del valor).
- **Hecho:**
  - Avisé a Miguel del encuadre equivocado en cuanto lo detecté, antes de que se mergeara nada con la
    premisa incorrecta.
  - Reescribí la descripción de [vio-products-microservice#33](https://github.com/vio-live/vio-products-microservice/pull/33)
    (la PR de P1b, ya abierta por el otro agente): quité el encuadre de "esto arregla un bug en vivo",
    puse el diseño real de #28, y marqué el PR como limpieza sin prisa de freeze — P1 y P2 ya están
    verificados en prod, esto no bloquea nada. No toqué el código de la PR, solo la descripción.
- **Pendiente:** QA, después del lunes: confirmar que reenlazar una categoría reutiliza la misma fila
  en vez de crear una nueva. Verificación de P1 contra el servicio desplegado (no SQL simulado),
  también después del lunes — es mía si la quiero, según Miguel.
