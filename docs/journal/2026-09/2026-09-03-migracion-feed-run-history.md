## Migración FeedRunHistory en staging — Miguel

- Quién: Miguel (infra), runbook y merge de otra sesión de Claude Code de Angelo (ver [runbook](../playbooks/migracion-feed-run-history.md))
- Dónde: `package-database`, DB `outshifter` (staging, `vio-ecom-db-staging`), tabla nueva `product_feed_run` + columna `product.absent_runs`
- Cuándo: 2026-09-03, ~15:00 UTC
- Contexto: entrega vía runbook para la migración `1789000000000-FeedRunHistory.ts` (merge `dfc3b23` a `develop`). Solo aditiva (tabla nueva + columna con default). No verifiqué el runbook a ciegas — leí la migración y la entidad (`ProductFeedRun.ts`, `Product.entity.ts`) yo mismo antes de correr, mismo protocolo que las veces anteriores: nombres de columna consistentes con `SnakeNamingStrategy` (`feed_run_id`, `started_at`, `absent_runs`, etc.), FK a `product_feed` (tabla que confirmé existe en staging).
- Hecho: corrida con `DB_MIGRATION_FILE=1789000000000-FeedRunHistory.ts`. Verificado: tabla `product_feed_run` existe, columna `product.absent_runs` existe, FK `FK_product_feed_run_feed` existe, tracking en `migrations` (id 223), y la query de sanity del runbook (`COUNT(*) FROM product WHERE absent_runs <> 0` = 0) pasa. 0 pendientes en el scan completo (196 archivos, 211 trackeadas).
- Pendiente: staging es solo el paso 1 de la secuencia del runbook — falta publicar `@vio-/database@1.0.246` (Alan, tiene las credenciales del registro), mergear `products` contra el paquete publicado, y recién después correr esta misma migración en prod.
