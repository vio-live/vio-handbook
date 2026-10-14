---
date: 2026-10-15
session: night
participants: [angelo, claude]
status: live
---

# Session — 2026-10-15 — Sprint nocturno: seguridad, analytics contra el micro, privacidad, logo y variante a 0

## Goal
Angelo (14/10, noche): "podrías ir con todo ello durante la noche y dejarlos listos para que
cuando me levante esté operativo". Definido en cuatro respuestas: analytics lo tomo yo (Miguel
despliega el colector), privacidad en PRs y release del kernel mañana, el fichero de secretos de
shopcart se quita del repo y se avisa para rotar, y se mergea a develop con despliegue en QA
(prod, Vev y wp.org, no). QA quedó encendido esta noche a propósito ([journal de Miguel](./2026-10-15.md)).

## Done

Todo lo mergeado está desplegado en QA (pipelines en verde) y comprobado desde fuera.

| Repo | PR | Qué | Estado |
|---|---|---|---|
| shopcart | [#89](https://github.com/vio-live/vio-shopcart-microservice/pull/89) | `.env.local.qa` fuera del repo, `.env.local.*` ignorado | ✅ QA |
| shopcart | [#90](https://github.com/vio-live/vio-shopcart-microservice/pull/90) | una variante sin precio de un producto importado no se vende (`notForSale`); el `return` que faltaba cuando la variante no existe | ✅ QA |
| base-api | [#34](https://github.com/vio-live/vio-base-api/pull/34) | `/api/role/add`, `/role/to-disable`, `GET /role/:id` y `POST /api/admin/users/token` exigen admin; `validateRequest` con un solo array; orden de argumentos de `toDisableUserRole` | ✅ QA |
| graphql | [#26](https://github.com/vio-live/graphql/pull/26) | lo público se decide por el documento (una query con solo `Channel.GetPurchaseConditions`, o introspección), no por el nombre de la operación | ✅ QA |
| micro | [#9](https://github.com/vio-live/vio-campaigns-microservice/pull/9) | `GET /v2/mobile/surface`: la surface de la key, para el colector | ✅ QA |
| base-api | [#35](https://github.com/vio-live/vio-base-api/pull/35) | el puente de stats manda `sponsor_id = id de la cuenta` (la brand es el sponsor) | ✅ QA |
| vio-analytics | [#16](https://github.com/vio-live/vio-analytics/pull/16) | la key se resuelve contra el micro (sin Postgres, sin `pg`, `CAMPAIGNS_URL`); stats por `sponsor_id`; modo de privacidad por surface (cherry-pick de `feat/modo-privacidad-por-surface`) | ✅ `main`; **despliegue en Oracle: Miguel** |
| base-api | [#36](https://github.com/vio-live/vio-base-api/pull/36) | `POST /upload/brand`: el logo de la marca, con cuenta, 2 MB, `{ url }` | ✅ QA |
| webapp | [#57](https://github.com/vio-live/webapp-vio-commerce/pull/57) | botón Upload del logo en Settings › Brand | ✅ staging |
| package-database | [#19](https://github.com/vio-live/package-database/pull/19) | `surface.privacy_mode` (enum, migración, `dist`) | ⏸ **sin mergear a propósito**: un push a `develop` publica el kernel |
| micro | [#10](https://github.com/vio-live/vio-campaigns-microservice/pull/10) | `privacyMode` en client-apps y en `/v2/mobile/surface` | ⏸ espera el kernel 1.0.271 |
| webapp | [#58](https://github.com/vio-live/webapp-vio-commerce/pull/58) | selector Analytics privacy en alta y detalle de la surface | ⏸ espera micro #10 en QA |

**Comprobado en QA al cierre (solo lectura):**
- `GET /v2/mobile/surface` con la key de la surface Vev de Aller → `{ id: 3, name: "Vev", status: "active" }`; sin key → 401.
- `POST /api/role/add`, `POST /api/admin/users/token` y `POST /upload/brand` anónimos → 401.
- graphql: `query GetPurchaseConditions { Payment { ... } }` sin key → 401 `UNAUTHENTICATED`; las condiciones de compra sin key → 200.

**Seguridad, lo que encontró el agente de lectura (más de lo que decía el hallazgo):**
- graphql: la exención por nombre valía también para `IntrospectionQuery`, y detrás muchos resolvers (Payment, Discounts, Markets, parte de Cart y Channel) no vuelven a comprobar el `user`.
- base-api: `POST /api/admin/users/token` devolvía un custom token de Firebase de cualquier `uid` sin pedir nada: la sesión de esa cuenta. Arreglado en el mismo PR #34.
- users-ms: los endpoints de roles y de custom token tampoco tienen guard; solo los cubre que base-api sea la única puerta pública.

**Cómo se probó:** cada arreglo con tests que fallan sobre el código viejo (shopcart 615/615 unit, base-api 126/126 unit + 4 del puente, graphql 52/52 unit, micro 143/143 y 148/148 con la columna nueva, colector 93/93), y el smoke de arriba en QA.

**Probar el micro contra un kernel sin publicar:** un `jest.kernel-local.config.js` con
`moduleNameMapper` (`@vio-/database` → `dist` del worktree del kernel) y un `tsconfig.kernel-local.json`
con `paths`, los dos fuera de git. Así corrió la suite del micro #10 contra package-database #19
antes de la release.

## Decisions
- **El colector pregunta al micro por HTTP con la misma key del lote** (`GET /v2/mobile/surface`), sin base de datos ni segunda credencial. 401/403 es "no es un tenant" (se cachea); 5xx o red caída es error (no se cachea; 503 al cliente).
- **El sponsor de un evento es el usuario brand de Commerce.** base-api nombra al tenant de las stats con `sponsor_id = id de la sesión`; `channel_id` y `commerce_key_hash` desaparecen (400 con pista). Los ids de sponsor cambian (ADR-0025 lo da por bueno).
- **Lo público en graphql se decide sobre el documento parseado**, por el nombre real del campo y no por el alias, sin fragments.
- **En un importado, una variante a 0 no se vende** (`notForSale`, en `hasError` como `availableProduct`); los NATIVE no cambian, products-ms ya escribe el precio heredado.
- **El modo de privacidad lo aplica el colector, server-side.** El kernel solo guarda la columna; el micro la expone; el webapp la edita. Hasta que el micro la mande, todo es `standard`.
- **`POST /upload/brand` lleva auth** aunque el resto de `/upload/*` no la tenga: no amplío el agujero.
- **El PR del kernel no se mergea de noche:** `kernel-release.yml` corre con cada push a `develop`.

## Blockers
- **Miguel:** desplegar vio-analytics `main` en Oracle con `CAMPAIGNS_URL=https://api-staging.vio.live` y sin `DATABASE_URL`; **apagar o reapuntar el outbox de vio-backend** (`ANALYTICS_EVENTS_URL`), porque sus `client_app_id` no son los del micro; rotar las credenciales de `.env.local.qa` de shopcart (siguen en el historial).
- **Angelo:** release del kernel (#19 → 1.0.271, `pkg=all`), migración en QA, bump automático en los micros, y entonces mergear micro #10 y webapp #58.
- **Hallazgos nuevos, sin hacer:** las otras rutas de `/upload/*` en base-api no piden cuenta (cualquiera sube ficheros al storage); los errores de graphql en QA traen el stack trace en `extensions`; `.env.test` de shopcart lleva valores con pinta de reales (Firebase, Mailjet, Aftership, Klarna, Vipps, Datadog).
- Mis PRs micro #9/#10 dejaron `src/modules/sdk/*.ts` y dos tests con comillas dobles (prettier sin config); no pasar prettier por todo el repo.

## Next session
- Los pendientes con su siguiente paso están en el [handoff](../../handoff/2026-10-14-campanas-handoff.md) (sección "Noche del 14→15/10").
