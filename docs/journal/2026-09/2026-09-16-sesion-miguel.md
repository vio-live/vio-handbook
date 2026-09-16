# 2026-09-16 — Sesión de Miguel: fin de los créditos de Azure, audit de costos y eliminación de development

- Quién: Miguel, con Angelo por Discord DM (10:08–13:05)
- Dónde: suscripción Microsoft Azure Sponsorship (`3d276f7e…`), crons de OpenClaw del agente miguel, Cloudflare (`vio.live`), repos `tipiodevelopment/vio-backend`, `vio-live/vio-analytics` y los 4 SDKs
- Cuándo: 2026-09-16. Hoy se acabaron los créditos del Sponsorship; la suscripción sigue Enabled y tiene el límite de gasto desactivado.
- Contexto: Angelo pidió el status de ayer. De ahí salieron el fallo de los crons, el fin de los créditos y el recorte de costos.

## Qué se hizo, en orden

1. **Status del 15/09 de Miguel:** ese día no hubo sesiones. La nota `memory/2026-09-15.md` tenía la fecha mal (era del 14) y se movió.
2. **Copia local del handbook:** iba 57 commits por detrás y 5 archivos sin trackear bloqueaban el pull. Se movieron fuera del repo; por pedido de Angelo se borraron 2 docs de mayo y un `terraform/` de prueba. Se conservan 2 briefings viejos en `workspace-miguel/backups/`.
3. **Crons del cluster QA:** no encendían ni apagaban nada; solo reenviaban el texto de la orden. Ahora ejecutan `az` y verifican el estado. Horario 01:00/08:00, elegido por Angelo. Ver [crons-cluster-qa](./2026-09-16-crons-cluster-qa-miguel.md).
4. **Revisión del "Review Azure" de Alan** contra la infra real: la MySQL de prod no tiene alta disponibilidad, el autoscaler de AKS tiene min=3 y hay VMs más baratas que D4as_v5. Ver [revision-review-azure](./2026-09-16-revision-review-azure-alan-miguel.md). **En pausa por decisión de Angelo.**
5. **Audit exhaustivo de costos:** 9 hallazgos, ~$550–750/mes. Ver [cost-audit-2026-09-16](../../infrastructure/cost-audit-2026-09-16.md).
6. **Aplicado (punto 6):** lifecycle a Cool tras 30 días sin acceso en `containerproduction2`, con vuelta automática a Hot. ~$68 de una vez para ahorrar ~$15/mes.
7. **Aprobado (6b):** borrar los uploads sin uso de `containerproduction2` (`outshifter-uploads-production` no tiene ninguna referencia en la DB de prod). Soft delete subido a 30 días y blob inventory creado. Los números se presentan el 17/09 y el borrado se ejecuta antes del 16/10.
8. **Development de Vio Backend eliminado** (decisión de Angelo, [ADR-0018](../../decisions/0018-un-solo-entorno-de-pruebas-backend.md)):
   - backup de la base en `saapivio/backups/pg-api-vio-development/`;
   - `api-dev.vio.live` y `events-dev.vio.live` quedaron como alias de staging;
   - `rg-api-vio-development` borrado;
   - Miguel mergeó los PRs con OK explícito de Angelo ([ADR-0015](../../decisions/0015-merge-delegado-con-ok-explicito.md)): vio-backend#60, vio-analytics#13, vio-web-sdk#52, react-native-sdk#3, VioKotlinSDK#2, VioSwiftSDK#16;
   - el primer deploy main → staging salió bien en los dos servicios.
9. **Correcciones propias:**
   - El horario 19:00/09:00 del cluster QA se había puesto a propósito el 14/09 para ahorrar. Se volvió a 01:00/08:00 por pedido de Angelo, y se le avisó que hoy eso cuesta más.
   - El cron del stop de la PG de staging, que Miguel había reportado como bug, es intencional: staging es la demo 24/7.

## Pendiente

- **17/09 10:00** (cron `blob-cleanup-inventory-check`): números del inventario y, después, borrado 6b. Luego, quitar la regla de inventario.
- **17/09 mañana:** confirmar que el cluster QA se apagó a la 01:00 y se encendió a las 08:00.
- **Decisiones de Angelo:**
  - borrar los APIM `OpenClawCodex*` y `claude-trader-rg`;
  - Redis de staging a B0;
  - nodos de AKS y MySQL a Burstable (en pausa);
  - funciones legacy de Reachu (preguntar a Alan);
  - confirmar el método de pago de la suscripción en el portal.
- **Limpieza:**
  - base `vio_development` en ClickHouse;
  - `infra/` de vio-analytics (Terraform con `development`);
  - retirar los alias `api-dev` y `events-dev` cuando los SDKs nuevos estén publicados y adoptados.
- **Releases de los SDKs** con las URLs nuevas (Kotlin sigue en pausa).
