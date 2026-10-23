## P1 mergeado no cumple el contrato que P2 da por hecho — jhondev

- **Quién:** jhondev. Recibí (de nuevo, vía `sessions_send` desde la sesión de discord de Miguel)
  la reasignación de P1+P2 a mí, sin reconocer la anulación de hace unos minutos
  ("Anulo P1 y P2 — Angelo quiere que esto lo lleve `claude`") ni lo que ya había reportado entonces
  (P1 mergeado, P2 con PR abierta). Ver
  [`2026-10-23-p2-choque-con-trabajo-no-commiteado-de-claude.md`](2026-10-23-p2-choque-con-trabajo-no-commiteado-de-claude.md)
  para el choque anterior.
- **Qué NO hice:** no escribí una tercera versión de la migración de P2. Ya existe PR #26
  (`package-database`, `feat/product-category-dedupe-unique-index`) con el diseño correcto
  (índice plano, dedupe por lotes, preferencia por fila viva).
- **Qué encontré en su lugar, verificando el estado real antes de actuar:**
  - `linkProductCategory` en `vio-products-microservice/src/modules/product/providers/product.service.ts:5376`
    (mergeado en PR #31, `develop@481b968`) hace `findOne` **sin `withDeleted: true`**, así que una
    fila soft-deleted no cuenta como "ya existe". Inserta una fila nueva.
  - Con el índice único de PR #26 ya puesto, esa inserción choca (`ER_DUP_ENTRY`). El catch añadido
    en `3f8396e` (Angelo, 21:00) trata **cualquier** `ER_DUP_ENTRY` como "ya existe, no pasa nada" y
    devuelve sin más — nunca llama a `restore()`.
  - Efecto real: un vendedor quita una categoría y la vuelve a añadir → la llamada no da error, pero
    la categoría **no vuelve a aparecer**, en silencio.
  - El propio mensaje de commit de PR #26 asume que esto ya está resuelto en P1 ("this is P1, PR
    #31 — this migration must not run... before P1 is deployed there"). No lo está: el catch que
    Angelo añadió en `3f8396e` fue pensado para dos importaciones simultáneas del mismo producto
    (caso legítimo), no para el caso de fila soft-deleted, y ambos casos caen hoy en el mismo
    `return`.
  - Consecuencia operativa: **PR #26 no se puede mergear/correr en ningún entorno con seguridad
    todavía**, aunque P1 esté "desplegado" — el despliegue de P1 no cubre el caso que PR #26 exige.
- **Hecho:** reporté esto a Miguel (mismo canal) con el fix mínimo propuesto (añadir `withDeleted:
  true` al `findOne`, y `restore()` en vez de insertar si la fila existe soft-deleted) y pregunté
  si lo escribo yo o se lo paso a `claude`, que lleva P1-P3 por decisión de Angelo. No toqué código
  en ningún repo.
- **Pendiente:** confirmación de quién escribe el fix, y si P1 necesita un PR de seguimiento antes
  de que nadie mergee PR #26.
