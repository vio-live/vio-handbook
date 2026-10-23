## P1 `product_category` — verificado en QA real, PR #31 confirmado — jhondev

- Contexto: Miguel reenvió el brief de P1 (ver
  [`2026-10-23-p1-product-category-idempotente.md`](2026-10-23-p1-product-category-idempotente.md)
  y el plan en
  [`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md))
  pidiendo explícitamente no darlo por hecho sin el conteo antes/después en QA. El PR ya existía
  (abierto el mismo 23/10 a las 18:45 UTC); lo que faltaba era justo esa verificación, señalada
  como pendiente en la entrega anterior.
- Aviso de una contradicción que encontré al releer el plan: la versión del handoff dice que Angelo
  decidió a las 20:40 pasar P1/P2/P3 a `claude` porque a `jhondev`/`juan` «los desconvoqué antes de
  que abrieran nada» — pero el PR #31 se abrió a las 18:45, antes de esa hora. No lo resolví por mi
  cuenta: lo señalo para que Miguel lo reconcilie, en vez de asumir cuál versión manda.
- Hecho — verificación en QA (`kubernetesqa-sc`), vía un pod de `users` con `mysql2` directo a la
  MySQL (10.224.0.7/outshifter), ejecutando el mismo SQL que `linkProductCategory` (el helper del
  PR): `SELECT ... WHERE deleted_at IS NULL` → si existe, no inserta.
  - Pareja ya duplicada en QA (`product_id=402517, category_id=2937`, 51 filas vivas, la más
    duplicada de QA hoy): simulé dos imports con la lógica del helper → sigue en 51 las dos veces.
  - Pareja nueva sin vínculo previo (`product_id=412005, category_id=5911`): antes 0 → import #1
    inserta (1) → import #2 no inserta, mismo `id` (sigue en 1). Borré esa fila de prueba al
    terminar; QA queda como estaba.
  - Resultado publicado como comentario en el PR:
    https://github.com/vio-live/vio-products-microservice/pull/31#issuecomment-6372387376
  - **Qué prueba y qué no**: confirma la lógica SQL del helper contra datos reales de QA. No es un
    despliegue end-to-end del microservicio — no se desplegó ni mergeó nada (ADR-0001 + freeze del
    go-live del 26/10 siguen en pie). Sigue pendiente correr la suite del repo en un entorno con DB
    de test/CI.
- No tocado: el merge, el despliegue, y P2 (`package-database`, bloqueada por la decisión de
  borrado lógico vs. índice único que ya está escalada).
- Pendiente:
  - Confirmación explícita a Miguel de que P1 está hecho y verificado (este journal + mensaje
    directo, no solo el registro) — por la lección de
    [`../../lessons/mandar-trabajo-a-otro-agente.md`](../../lessons/mandar-trabajo-a-otro-agente.md).
  - Reconciliar con Miguel la contradicción de arriba sobre quién lleva P1-P3.
  - Decidir quién lleva P2 y en qué orden respecto al despliegue de este fix.
