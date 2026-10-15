---
title: "Handoff — campañas en Commerce, estado al cierre del 14/10"
last-updated: 2026-10-14
owner: angelo
status: live
---

# Handoff: campañas y surfaces en Commerce (14/10)

> **Para quien sigue** (otro agente u otra persona): este doc es el punto de entrada. Léelo entero
> antes de tocar nada. El detalle está en los docs enlazados; aquí van el estado, lo que está en
> curso y lo que falta, con el siguiente paso concreto de cada cosa.

## Dónde leer

| Qué | Doc |
|---|---|
| Decisiones | ADR [0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) a [0032](../decisions/0032-precio-de-productos-con-variantes.md). Las de hoy: **0030** (`api-staging` por DNS al micro, Vio API frente a Commerce), **0031** (pagos de la brand, filtrables por channel) y **0032** (precio de productos con variantes) |
| Plan, fases y ronda de mejoras | [campanas-en-commerce-plan-de-ejecucion](./campanas-en-commerce-plan-de-ejecucion.md) |
| Prueba de punta a punta, paso a paso | [playbook e2e-campanas-commerce](../playbooks/e2e-campanas-commerce.md) |
| Lo que pasó el 14/10 | [journal 2026-10-14-e2e-campanas-commerce](../journal/2026-10/2026-10-14-e2e-campanas-commerce.md), más los journals por repo del mismo día |
| Infra del micro y corte | [micro-campanas-infra](./micro-campanas-infra.md) (§9b, corte de `api-staging`) |

## Estado en QA (verificado el 14/10)

- **El flujo de punta a punta funciona.** La orden 4551 se pagó con Vipps desde Vev y **cobró la brand**: 1289 en modo partner, `cart.seller_id` 1289, `order.channel_user_id` 505 y reseller 1312.
- **`api-staging.vio.live` es el micro de campañas** (ADR-0030, corte por DNS hecho por Miguel). Ojo: QA se apaga de noche y los fines de semana, y `api-staging` con él.
- **F2 desplegado:** api #45, base-api #32, users #21, middleware #10, payment-processors #12, orders #21 y shopcart #87.
- **Ronda de mejoras desplegada:**
  - micro #8: la campaña asigna su channel a la surface, el nombre del sponsor no es el email y `GET /api/channels`;
  - webapp #53 (formulario de campaña y modales), webapp #54 (publicar con variantes desde el dashboard);
  - api #44 (`REQUEST_ACCEPTED` solo al sender) y graphql #25 (401 en vez de 500);
  - products #22, webapp #52, shopcart #88 y graphql #24 (moneda de envío, `total_tax` y descripciones neto/bruto).
- **Vev:** paquete compartido `cq1lXld-TA9` en la **0.327** (15/10: SDK 0.20.4, la carrera del bootstrap; vev #62). La 0.326 es vev #61, el sponsor sale de la config de la key. Rollback: `vev restore` a la 0.326.

**Cuentas y datos de prueba en QA:**
- **Brand:** Fredrik & Louisa (1289, `is_business=1`, Vipps partner MSN 545865, envíos Express 0 NOK y Standard 100 NOK). Se muestra como "Fedrik Louisa".
- **Publisher:** Aller (1312), con el channel 505, la surface 3 "Vev" y la campaña 2 "Test vev".

## Hecho después del primer cierre (14/10, tarde)

| Qué | Dónde | Estado |
|---|---|---|
| **ADR-0031**: el publisher filtra qué métodos de la brand se ven en cada channel | api #46, base-api #33, webapp #55 | ✅ en QA. El channel 505 ofrece Vipps; `GET /api/channel/:id/payment-methods` sin token da 401 |
| **Precio de productos con variantes**: si falta, el mínimo de las variantes; la herencia solo en NATIVE | products #23 | ✅ en QA. **Backfill aplicado: 333 productos** (301 Woo, 10 Magento y 22 nativos), 0 errores, idempotente. El 411959 de Alan pasó a 110 NOK |
| Plugin de Woo: el producto variable manda el precio de su variación más barata | vio-woocommerce-sync #1 → **1.0.1 en wp.org**, y #2 → **1.0.2** | ✅ **publicado el 14/10.** Tag `1.0.1` y Action en verde en 30 s; la API de wp.org da 1.0.1, `tested 7.1.3`. Probado en wp-env con WordPress 7.1.3: 20/20 tests, y los 6 nuevos fallan con el código viejo. Plugin Check 0/0. Las tiendas lo reciben al actualizar el plugin. Ver el [journal del release](../journal/2026-10/2026-10-14-woo-sync-release-1-0-1.md) |
| Dashboard: en importados, una variante en 0 sale "Not for sale" (alinea #54 con products #23) | webapp #56 | ✅ en staging |
| `ACCOUNT_PAYMENTS=true` en Vercel staging | Miguel | ✅ encendido. Verificado en el bundle de las 17:06 UTC. El dominio se quedaba en builds viejos porque el proyecto usa un **entorno custom** `staging` y el dominio estaba atado por `gitBranch`. Miguel lo ató por `customEnvironmentId` y ahora sigue a develop solo. Ver la [lección](../lessons/dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md) |

**Backfill de precios:** se corre con `node dist/scripts/recompute-variant-prices.js` en el pod de products, anteponiendo `PROCESS_ENV=local` (el pod usa `.env.local`). Es dry-run por defecto; `--apply` escribe. Filtros: `--ids`, `--user`, `--limit`, `--json`.

## Pendiente (siguiente paso concreto)

0. **16/10: Angelo prueba Vev 0.327** (la carrera del bootstrap al cambiar de clave), en el editor. La receta está en el [journal](../journal/2026-10/2026-10-14-vio-web-sdk-carrera-del-bootstrap.md) (Next session). Si algo falla: `vev restore` a la 0.326.
1. **Backfill del rol Publisher** (users F2.2): `POST /admin/backfill-publisher-roles` con un admin, primero en dry-run. Después, recontar las conexiones "brand↔brand" (mejora 3 del plan).
2. ✅ ~~`ACCOUNT_PAYMENTS=true` en Vercel staging~~, hecho el 14/10. Después de tocar variables o dominios en Vercel, verificar que `dashboard-staging` sirva el último commit de develop. La causa de que no lo hiciera está en la [lección de Miguel](../lessons/dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md).
3. ✅ **La carrera del bootstrap en `vio-web-sdk`, arreglada y desplegada en Vev 0.327 (15/10).** vio-web-sdk 0.20.4 ([#79](https://github.com/vio-live/vio-web-sdk/pull/79), contador de generación en `bootstrap()`) y rebundle en Vev ([#62](https://github.com/vio-live/vev/pull/62)), los dos mergeados el 14/10. `vev build` OK. Las páginas ya publicadas la cogen al republicarlas. Ver el [journal](../journal/2026-10/2026-10-14-vio-web-sdk-carrera-del-bootstrap.md).
4. **SDK y Vev: mostrar "fra X"** con el mínimo de las variantes si el producto llega en 0. Es defensa extra; con products-ms ya no debería pasar.
5. **Precio "desde" que queda viejo:** si se borra la variante más barata de un producto con precio derivado, no se recalcula, porque no hay columna que distinga un precio derivado de uno explícito. Hace falta `price_derived` en package-database (con OK de Angelo y release `pkg=all`).
6. ✅ ~~¿Qué hace shopcart con una variante en 0 de un producto importado?~~ **Se podía comprar a 0; arreglado** (shopcart [#90](https://github.com/vio-live/vio-shopcart-microservice/pull/90), en QA): `notForSale` al añadir una variante sin precio de un producto que no es NATIVE.
7. **Borrar el flag `ACCOUNT_PAYMENTS`** cuando F2 esté en prod y encendido en los dos entornos.
8. **Clases de envío en otra moneda:** 19 en QA. Dos son de Alan (1295 y 1299) y las arregla él; el resto son cuentas de prueba viejas.
9. **Alan:** prueba y estrés de todo, en su [tarjeta de Trello](https://trello.com/c/ftrrjOW0). Su loop de VG necesita una surface nueva en el dashboard.
10. **Prod:** el mismo corte (ADR-0029/0030), F2, las migraciones del kernel (con el `group_concat_max_len` de la revisión de Miguel) y `PAYMENT_SECRETS_KEY`. Nada de esto está en prod.
11. **Hallazgos de seguridad** — los tres de la lista, **arreglados el 15/10** (en QA):
   - base-api [#34](https://github.com/vio-live/vio-base-api/pull/34): `/api/role/add`, `/role/to-disable`, `GET /role/:id` **y `POST /api/admin/users/token`** (daba un custom token de Firebase de cualquier uid) exigen admin;
   - graphql [#26](https://github.com/vio-live/graphql/pull/26): lo público se decide por el documento, no por el nombre (`GetPurchaseConditions` e `IntrospectionQuery`);
   - shopcart [#89](https://github.com/vio-live/vio-shopcart-microservice/pull/89): `.env.local.qa` fuera del repo. No se rota nada: era QA (Angelo, 15/10).
   - **Nuevos, sin hacer:** las otras rutas de `/upload/*` en base-api no piden cuenta; los errores de graphql en QA traen el stack trace en `extensions`; `.env.test` de shopcart lleva valores con pinta de reales; los endpoints de roles y custom token de users-ms no tienen guard (solo los cubre base-api).
12. ✅ ~~Plugin de Woo: una variación editada desde el admin no llegaba bien a Vio~~. **Arreglado en 1.0.2** (vio-woocommerce-sync #2, en wp.org el 14/10). El auto-sync corre una vez al final de la petición y ya no hay candado de 5 s. Verificado en el panel real con Save changes y con Update; el detalle está en el [journal del release](../journal/2026-10/2026-10-14-woo-sync-release-1-0-1.md). Falta que Alan lo pruebe en su tienda (pasos 3, 4 y 5 de su tarjeta).

## Noche del 14→15/10 (sprint nocturno, [journal](../journal/2026-10/2026-10-15-sprint-nocturno-seguridad-analytics-privacidad.md))

| Qué | Dónde | Estado y siguiente paso |
|---|---|---|
| **Analytics sin vio-backend**: el colector resuelve la key contra el micro (`GET /v2/mobile/surface`) y las stats van por `sponsor_id` = id de la brand | micro [#9](https://github.com/vio-live/vio-campaigns-microservice/pull/9), base-api [#35](https://github.com/vio-live/vio-base-api/pull/35) (QA), vio-analytics [#16](https://github.com/vio-live/vio-analytics/pull/16) (`main`) | ⏳ **Miguel despliega el colector** en Oracle: `CAMPAIGNS_URL=https://api-staging.vio.live`, quitar `DATABASE_URL`, y **apagar o reapuntar el outbox de vio-backend** (`ANALYTICS_EVENTS_URL`): sus `client_app_id` no son los del micro |
| **Privacidad por surface** (Nørs): `surface.privacy_mode`, `privacyMode` en client-apps y en `/v2/mobile/surface`, selector en el webapp; el colector ya lo aplica (`minimal`) | package-database [#19](https://github.com/vio-live/package-database/pull/19), micro [#10](https://github.com/vio-live/vio-campaigns-microservice/pull/10), webapp [#58](https://github.com/vio-live/webapp-vio-commerce/pull/58) | ✅ **15/10 09:20 UTC, todo en QA/staging**: kernel **1.0.273** en los 12 micros, migración corrida en QA (fila 233), micro y webapp mergeados ([journal](../journal/2026-10/2026-10-15-kernel-release-privacidad.md)). Queda: probar `/v2/mobile/surface` con la key de Vev (`privacyMode: "standard"`) y el selector en staging; el modo `minimal` solo se nota cuando Miguel despliegue el colector |
| **Logo de la marca** | base-api [#36](https://github.com/vio-live/vio-base-api/pull/36), webapp [#57](https://github.com/vio-live/webapp-vio-commerce/pull/57) | ✅ en QA/staging. Probar: subir un PNG en Settings › Brand, Save brand, y verlo como `logo` del sponsor en `/v2/mobile/config` |
| **Variante a 0 de un importado** | shopcart [#90](https://github.com/vio-live/vio-shopcart-microservice/pull/90) | ✅ en QA |
| **Seguridad** | base-api #34, graphql #26, shopcart #89 | ✅ en QA; rotación de secretos pendiente (Miguel); hallazgos nuevos en el punto 11 |

**Probar el micro contra un kernel sin publicar:** `jest.kernel-local.config.js` + `tsconfig.kernel-local.json` en el worktree `campaigns-privacidad` (fuera de git): `moduleNameMapper`/`paths` de `@vio-/database` al `dist` del worktree del kernel. Es como corrió la suite de #10 contra #19.

### Pedido a Miguel (15/10, actualizado por la tarde)

Solo la VM de **staging** (`129.151.196.99`). Prod no: no hay micro de campañas en prod y `CAMPAIGNS_URL` es obligatoria.

**Ahora, sin esperar a nada:**
1. **Outbox de vio-backend**: quitar `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` del `.env` de vio-backend en esa VM y reiniciarlo (sin las dos, el espejo queda apagado). Sus `client_app_id` son los de vio-backend, no las surfaces del micro.
2. **`.env` del colector** (`/opt/vio-analytics/.env`, 600): añadir `CAMPAIGNS_URL=https://api-staging.vio.live` (obligatoria), `API_KEY_CACHE_FILE=/opt/vio-analytics/.keycache.json`; quitar `DATABASE_URL`; mantener `INTERNAL_EVENTS_TOKEN`; comprobar que `INTERNAL_READ_TOKENS` contiene el token que usa base-api (`ANALYTICS_INTERNAL_TOKEN` del Secret `env-sc-base-api` de QA). Opcionales con default: `CAMPAIGNS_TIMEOUT_MS=1500`, `API_KEY_CACHE_TTL_MS=60000`, `API_KEY_NEGATIVE_CACHE_TTL_MS=30000`, `API_KEY_STALE_IF_ERROR_MS=259200000` (72 h: lo que aguanta con `api-staging` apagado).
3. Comprobar que el usuario de la unit `vio-analytics.service` puede escribir en `/opt/vio-analytics` (para el fichero de caché; si no puede, el colector avisa en el log y sigue solo con memoria).
4. **Cortar el histórico de ClickHouse de staging**: las filas anteriores al corte llevan `client_app_id`/`sponsor_id` de vio-backend, que colisionan con los ids nuevos del micro y de Commerce (ADR-0025 ya daba por aceptado perder esas ~4.000 filas). En la VM, con el cliente de ClickHouse contra `vio_staging`: `ALTER TABLE vio.events DELETE WHERE received_at < '2026-10-15 00:00:00'` (exportar antes a un fichero si se quiere conservar).

**Desplegar el colector**: vio-analytics `main` en **`22458c2`** (PR [#17](https://github.com/vio-live/vio-analytics/pull/17), mergeado 15/10 por la tarde), según `docs/DESPLIEGUE.md`, y reiniciar. Comprobar `https://events-staging.vio.live/health` → `ready:true`, `clickhouse.lastError: null`, y que aparece `tenancy` en la respuesta.

## Mañana del 15/10: los 5 reportes de Alan ([journal](../journal/2026-10/2026-10-15-revision-de-alan-y-arreglos.md))

| Reporte | Qué era | Estado |
|---|---|---|
| Stripe no cancela/reembolsa desde Woo | Hueco de siempre (solo había gancho de Vipps; `'Stripe'` vs `'STRIPE'`; sin referencia del pago en la orden; `orders/:id/update` daba 500 siempre) | ✅ payment-processors #13/#14, orders #22 y #23 (`update()` daba 500 siempre), shopcart #91 en QA. Falta probar con dinero: una orden nueva de Stripe desde Vev, cancelarla y reembolsar parcial desde Woo |
| Crear surface falla la primera vez | Transitorio (pool de MySQL) | ✅ endurecido: micro #11 (503 `DB_UNAVAILABLE`, reintento, keepalive) y webapp #59 (timeout, revalidar, texto). Si vuelve, ahora hay rastro en el log |
| Productos de una colección compartida no llegan a Vev; no puede quitarla | Bug real: GraphQL lee una **foto** que no se rehacía al cambiar items | ✅ products #24, api #47, collection #12 en QA. El channel 508 de Alan, reparado (4 filas; GraphQL los devuelve) |
| Pagar con un método recién apagado | Diseño: se valida al iniciar el pago | ✅ documentado en [cuentas-y-capacidades](../architecture/cuentas-y-capacidades.md) |
| `CHANNEL_IN_USE` al quitar un channel | No es bug: un channel vive en varias surfaces | ✅ micro #11 (`details`) + webapp #59 (aviso con enlace; selector de channel de la campaña) |

**Pendientes nuevos:** backfill de la referencia de Stripe en las órdenes anteriores (desde `checkout.origin_payment_body.paymentIntentId`); vigilar Klarna (al normalizar mayúsculas entra en su camino legacy sin try/catch; en 401 en QA); `deleteChannelGroupId` en api sigue buscando `collection_shared` por PK (el webapp no lo usa).

## Reglas que siguen valiendo

- **PRs y merges** en repos de código, con OK de Angelo. Angelo da OK en lote ("mergea y sube"), pero **un cambio sobre trabajo de Alan necesita confirmación explícita**.
- **El handbook se pushea siempre.** Sin `Co-Authored-By` en los commits. No imprimir `.env`.
- **Token npm local en 401:** los locks se resuelven mergeando develop (el kernel ya va en 1.0.270), o lo hace Miguel.
- **Consultas a la base de QA:** solo lectura, con un script copiado al pod de `users` (`kubectl exec`, kubeconfig de QA) y borrado al terminar.
