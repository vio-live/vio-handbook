## Migración walley-channel-toggle en staging — Miguel

- Quién: Miguel (infra)
- Dónde: `package-database`, DB `outshifter` (staging, `vio-ecom-db-staging`), tabla `channel_user_settings`
- Cuándo: 2026-09-03, ~14:30 UTC
- Contexto: Angelo avisó que había avances (integración Walley) y hacía falta correr migraciones de nuevo. `develop` de `package-database` tenía 9 commits nuevos desde la última sincronización (incluye PR #6, fix snake_case de order-webhook; y PR #8, merge de `integration/walley-channel-toggle`).
- Hecho: sincronicé `develop`, encontré una sola migración genuinamente nueva (`1788150000000-walley-channel-toggle.ts`, agrega `channel_user_settings.walley`). Verifiqué antes de correr (mismo protocolo que la vez pasada): campo `walley` presente en la entidad actual, ninguna otra migración la toca/supera. Corrida con `DB_MIGRATION_FILE`, confirmada por columna + registro en `migrations` (id 222). Verificación final: 0 pendientes (195 archivos, 210 trackeadas).
- Pendiente: nada de mi lado en staging. El resto de la integración Walley (SDK web, hardening de pagos) sigue en curso del lado del equipo — ver [journal de hoy de la otra sesión](2026-09-03-release-kernel-1.0.245-qliro.md).
