## Migración FeedRunHistory en prod — Miguel

- Quién: Miguel (infra)
- Dónde: `package-database`, DB `outshifter` (prod, `vio-ecom-db-prod`), tabla `product_feed_run` + columna `product.absent_runs`
- Cuándo: 2026-09-03, ~21:55 UTC
- Contexto: última etapa de la secuencia del runbook (staging → publicar kernel → mergear products → **prod**). Prerequisito cumplido: `@vio-/database@1.0.247` publicado (ver journal release-kernel-1.0.246.md) y `products` ya desplegado en QA con `Entity.ProductFeedRun` compilando.

  Nota de corrección: un reporte de otra sesión de Claude Code atribuyó a "Alan" la publicación de 1.0.246/1.0.247 y describió el merge de `products` (`0696374`) como trabajo nuevo — verifiqué contra timestamps de npm y git log: ambos son el mismo trabajo que ya hice y documenté antes hoy (journal `release-kernel-1.0.246.md`, PR #5 de products). No hubo doble trabajo, solo un reporte cruzado sin visibilidad entre sesiones.
- Hecho: verificado antes de correr (mismo protocolo que staging) — confirmé que la migración no estaba aplicada ni trackeada en prod, confirmé backup automático de hoy disponible. Corrida con `DB_MIGRATION_FILE=1789000000000-FeedRunHistory.ts`. Verificado: tabla `product_feed_run` + FK a `product_feed`, columna `product.absent_runs`, tracking en `migrations` (id 162).
- Pendiente: promoción de la función `google-merchant-feed` (rama `feature/streaming-parser`, según el otro reporte) de `develop` a `main` — decisión de Angelo, esperando un sync real en Test primero.
