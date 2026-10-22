## Admin de equipo Vio sembrado en prod (bloqueante A1 del go-live) — Miguel

- Quien: Miguel. Angelo paso el id de cuenta por DM.
- Donde: prod, cluster `vio-commerce-prod-sc`, MySQL `outshifter`, tabla `user_role`.
- Cuando: 2026-10-22, ~15:10 Oslo.
- Contexto: `user_role` estaba **vacia** en produccion desde siempre, asi que no habia ningun Admin
  y la pagina *Vio team > Vipps partner* era inalcanzable (`AdminGuard` exige rol 1 en la base).
  Eso bloqueaba en cadena la fila `payment_method` de Careless y por tanto el pago del go-live del
  lunes 26/10. Arranque en frio: tambien bloqueaba `POST /admin/backfill-publisher-roles`.
- Hecho:
  - Verificado primero quien es el 1328: `username=vio`, name Angelo, `brand_name=Vio`,
    `is_business=1`, creada hoy 13:06Z. No es la 1309 (Life) ni la 1326 (testprod).
  - `INSERT INTO user_role (active_user_role, user_id, role_id_role) VALUES (1, 1328, 1)`
    -> `id_user_role = 707`. Script idempotente (comprueba antes de insertar).
    Corrido desde un pod de `users` con su propio `mysql2` y su `.env`, sin abrir firewall.
  - Comprobado en el `dist` del pod **por que** esto basta y por que no hace falta re-login:
    `resolveAccountType` (dist/modules/user/helpers/account-type.js) empuja `internal` **antes** de
    `brand`, asi que el Admin gana sobre `is_business=1`; y `getAccountType` llama a
    `roleService.getActiveRoleIds(user.id)` **en cada peticion** — lee la base, no el claim de
    Firebase, y no hay cache. Con `internal` vienen las 8 features, incluidas `channels:manage`,
    `surfaces:manage` y `campaigns:manage`.
  - Contadores de prod en el mismo paso: `payment_method` 0, `campaign` 0, `surface` 0,
    `brand_profile` 0, `channel` 12, `channel_user_products` 15 (0 de Careless).
  - `organization_number` de Careless (1327) sigue **null**. Si la pagina de partnership lo exige,
    se rellena con 928540650. No lo toque sin que haga falta.
- Pendiente: una **segunda** cuenta Admin para no depender de una sola persona el lunes.
  Checklist vivo en `docs/handoff/2026-10-22-checklist-go-live.md`.
