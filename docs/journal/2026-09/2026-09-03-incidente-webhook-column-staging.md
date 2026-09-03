## Incidente: products fallando en bus por columna mal nombrada — Miguel

- Quién: Miguel (infra), coordinado con otra sesión de Claude Code de Angelo (`angelo-vio-backend`) que hizo el diagnóstico inicial
- Dónde: `kubernetesqa` (staging), namespace `default`, deployment `products`, DB `outshifter` tabla `user_settings`
- Cuándo: 2026-09-03, ~09:14–09:29 UTC (detectado y resuelto en ventana de ~15 min)
- Contexto: Tras correr la migración `order-webhook` en staging (ver [journal de migraciones](2026-09-03-migraciones-staging-outshifter.md)), `products` empezó a fallar en cada mensaje del bus con `Unknown column 'ProductFeed__user__settings.order_webhook_url'`. Causa raíz: la migración de Alan (`1788100000000-order-webhook.ts`) creó la columna como `orderWebhookUrl` (camelCase, copiado literal del nombre de la propiedad TS) en vez de `order_webhook_url` (lo que espera `SnakeNamingStrategy`).
- Hecho:
  - Verifiqué el bug de forma independiente (decorator de la entidad sin `name:` override + columna real en DB) antes de actuar, no confié ciegamente en el diagnóstico ajeno
  - `ALTER TABLE user_settings CHANGE orderWebhookUrl order_webhook_url ...` (y lo mismo para `orderWebhookSecret`) — sin pérdida de datos
  - Encontré la connection string real del Service Bus (`qa-product-processing2`) vía `.env.local` dentro del pod (no había secret de k8s, el config viene compilado en la imagen)
  - Confirmé por 3 vías (az cli, peek con SDK, logs) que la DLQ terminó en 0 mensajes sola — el propio `ProductBusConsumerService.processDeadLetterQueue()` reintenta la DLQ automáticamente al arrancar, así que una vez arreglada la columna el loop de reintentos infinito se drenó solo, sin necesidad de reencolar nada a mano
  - Documenté el bug en [lessons/raw-sql-migration-column-name-must-match-naming-strategy.md](../../lessons/raw-sql-migration-column-name-must-match-naming-strategy.md)
- Pendiente: PR #6 en `package-database` (de la otra sesión) corrige la migración fuente para que prod no repita esto — falta mergear.
