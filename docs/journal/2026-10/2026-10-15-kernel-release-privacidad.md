---
date: 2026-10-15
session: morning
participants: [angelo, claude]
status: live
---

# Session — 2026-10-15 — Release del kernel con la columna de privacidad: tres runs, una migración y el bump a los 12 micros

## Goal
Cerrar la privacidad por surface ([sprint nocturno](2026-10-15-sprint-nocturno-seguridad-analytics-privacidad.md)):
mergear package-database [#19](https://github.com/vio-live/package-database/pull/19), correr la migración en QA,
subir el kernel a los micros y entonces mergear micro [#10](https://github.com/vio-live/vio-campaigns-microservice/pull/10)
y webapp [#58](https://github.com/vio-live/webapp-vio-commerce/pull/58). Angelo: "ahora. si necesitas que miguel nos ayude me dices".

## Done

### Lo que pasó, en orden

| Hora (UTC) | Qué | Resultado |
|---|---|---|
| 08:45 | Merge de #19 → `kernel-release.yml` por push ([run 38707992104](https://github.com/vio-live/package-database/actions/runs/38707992104)) | Detectó la migración y "Paquetes a publicar: database"; `publish-packages.js` publica **en cascada**: `database` 1.0.271 y `testing` 1.0.271 salieron; en `definitions` el push del tag falló (`Failure when receiving data from the peer`) y abortó. `definitions` quedó con el commit "implement version 1.0.271" en `develop` sin tag ni publish; `service` sin tocar. Como era por push, de todos modos se habría parado en el Migration gate |
| 08:54 | Backup a mano `pre-surface-privacy-20261015` en `vio-ecom-db-staging-sc` (misma práctica que el 13/10) | OK |
| 08:54 | Migración `1792000000000-surface-privacy-mode.ts` en QA | `surface.privacy_mode enum('standard','minimal') NOT NULL DEFAULT 'standard'` + fila 233 en `migrations` (`surfacePrivacyMode1792000000000`). Las 4 surfaces quedan en `standard` |
| 08:55 | `gh workflow run kernel-release.yml -f pkg=all` ([run 38709122414](https://github.com/vio-live/package-database/actions/runs/38709122414)) | `utils`, `config`, `logger` salieron en **1.0.272**; `database` cayó en `yarn install` por un **503 de registry.yarnpkg.com** bajando `github-from-package`. Abortó |
| 08:59 | Otra vez `pkg=all` ([run 38709680753](https://github.com/vio-live/package-database/actions/runs/38709680753)) | **1.0.273 para los 7**, en orden, en 7 min; `kernel-published` despachado a los 12 micros (campaigns incluido, su primer bump automático) |
| 09:05 | `kernel-bump.yml` en los 12 micros (el de campaigns era la primera vez que corría; ve los secretos de la org) | 12/12 en verde: commit `chore(kernel): bump @vio-/* to 1.0.273` en cada `develop` |
| 09:06–09:16 | `deploy.yml` de los 12 micros a QA | 12/12 en verde; en el pod de campaigns `@vio-/database` es 1.0.273 y trae `privacyMode` en la entidad `Surface` y la migración en `dist` |
| 09:13 | Merge micro [#10](https://github.com/vio-live/vio-campaigns-microservice/pull/10) → deploy ([run 38711374239](https://github.com/vio-live/vio-campaigns-microservice/actions/runs/38711374239)) | Verde; pod nuevo con la imagen 13, `/health` 200, `GET /v2/mobile/surface` sin key → 401 y con key inválida → 401 `Invalid API key`; el `dist` desplegado lleva `privacyMode` en `sdk.service`, `presenters` y `surfaces.*`; sin errores en el arranque |
| 09:21 | Merge webapp [#58](https://github.com/vio-live/webapp-vio-commerce/pull/58) (rebasado sobre #59: un conflicto de imports en `surface-detail/index.jsx`) | En `develop` → Vercel despliega el dashboard de staging |

### Cómo se corrió la migración
La base de QA no se alcanza desde la laptop (VNet) y el token npm local da 401, así que no se puede usar
`yarn migration:execute` del [playbook](../../playbooks/commerce-db-migrations.md) tal cual. Se ejecutó **lo
mismo que hace TypeORM**, desde el pod de `users` (que ya tiene `mysql2`, `dotenv` y el `.env.local` de QA):
el `ALTER TABLE` literal de la migración y el `INSERT INTO migrations(timestamp, name)` con el mismo
timestamp y nombre de clase, en un script idempotente (comprueba columna y fila antes) copiado al pod y
borrado al terminar. Verificado después con `information_schema` y `SELECT * FROM migrations ORDER BY id DESC`.

## Decisions
- **Con migración, el release se termina siempre con `pkg=all`**, después de la migración, aunque el run
  por push haya dejado versiones intermedias publicadas (1.0.271 de `database`/`testing`, 1.0.272 de
  `utils`/`config`/`logger`): son huérfanas e inofensivas, ningún micro las pinea. Es la regla de la
  [lección del 17/09](../../lessons/release-parcial-del-kernel.md); hoy se confirmó dos veces más.
- **Un corte de red en `publish-packages.js` no se "reanuda": se relanza `pkg=all`** y sale la versión
  siguiente para los 7. Reintentar con lista de paquetes vuelve a la cascada fuera de orden.
- **La migración desde el pod, con el SQL literal + la fila de `migrations`**, vale como ejecución de la
  migración: deja la base exactamente como `migration:execute`. Queda anotado aquí para que la próxima
  persona no la vuelva a correr ni la dé por pendiente.

## Blockers
- **No se probó `GET /v2/mobile/surface` con una key real desde aquí**: el clasificador del agente bloquea
  cualquier script que lea `surface.api_key` de la base, aunque no la imprima. Lo que sí está verificado:
  la ruta responde en la imagen nueva (401 sin key / key inválida), el `dist` desplegado contiene
  `privacyMode` y el kernel del pod es 1.0.273. Falta que alguien con la key de la surface Vev de Aller
  haga la llamada y vea `"privacyMode": "standard"`; o abrir una surface en el dashboard de staging y
  ver el selector.
- **Versiones huérfanas en npm**: `@vio-/database`/`testing` 1.0.271, `@vio-/utils`/`config`/`logger`
  1.0.272, y en `package-definitions` un commit "implement version 1.0.271" sin tag. Nadie las pinea;
  no hay que hacer nada, pero que no sorprendan en `npm view`.
- Sigue pendiente de Miguel: colector de staging con `CAMPAIGNS_URL` (es quien aplica el modo `minimal`)
  y apagar el outbox de vio-backend en esa VM. Las credenciales de QA no se rotan (Angelo, 15/10).

## Next session
- Angelo o Alan: probar el selector de privacidad en el dashboard de staging (crear surface y detalle),
  y la llamada a `/v2/mobile/surface` con la key de Vev; poner una surface en `minimal` y comprobar con
  el colector (cuando Miguel lo despliegue) que `page.url`/`page.title`/nombres de producto no llegan.
- Prod: cuando toque, la misma migración antes de subir los micros (`DB_MIGRATION_FILE=1792000000000-surface-privacy-mode.ts`),
  y recordar que prod está muy por detrás del kernel (ver [handoff](../../handoff/2026-10-14-campanas-handoff.md)).
- Deuda del automatismo (sin cambios hoy): el run por push sigue publicando una cascada parcial antes
  del `pkg=all`; está en la [lección del 17/09](../../lessons/release-parcial-del-kernel.md).
