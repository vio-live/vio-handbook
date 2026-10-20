---
date: 2026-10-21
author: claude
for: miguel
status: live
---

# Release a prod — slots v2, analytics avanzado, atribución y cancelaciones (ADR-0034/0035/0036)

Lo que está en QA/staging desde el 19–20/10 pasa a prod. Ejecuta **Miguel**; claude mergea los PRs del paso 5 si se lo
pides en el canal. Prod hoy **no tiene ventas** (0 órdenes desde el encendido del 16/10), así que no hay datos en riesgo:
este release es para que la primera campaña real ya nazca atribuida y con analytics completo.

Anterior: [release del 16/10](./2026-10-16-release-prod-commerce.md) (mismo formato, misma infraestructura).

## 0. Decisiones de Angelo (antes de empezar)

| # | Decisión | Recomendación |
|---|---|---|
| D1 | **Vercel** | **Resuelto (21/10, Angelo):** la cuenta `angelosv` ya está en el team `tipio-2`; los commits de ese autor dejan de salir BLOCKED. |
| D2 | **`BUYER_REF_SECRET` de prod**: clave con la que shopcart convierte el email del comprador en un identificador (HMAC-SHA256) para contar compradores únicos y repetidores y cruzar analytics con Commerce sin que el email salga. Nueva para prod (no la de QA, para que los datos no se puedan relacionar) y **no se cambia nunca** una vez en uso: cambiarla hace que el mismo comprador cuente como nuevo. Sin ella no se rompe nada: las órdenes nacen sin `buyer_ref`. | Miguel la genera en el paso 3 (`openssl rand -hex 32`) y la pone solo en el Secret de shopcart de prod. |
| D3 | **Comportamiento nuevo en prod**: el app `Vio Sync` empieza a mandar `refunds/create` (los apps propios de Careless, Gladkokken y Makeupmekka ya lo hacen desde el 16/10): una devolución hecha en la tienda mueve dinero en Vipps/Stripe y resta en analytics. | Sin aviso extra (ya avisado el 16/10 para los apps propios); recordarlo al primer cliente de `Vio Sync`. |

## 1. Estado de partida (verificado 21/10)

- **Kernel en prod**: 1.0.273 (campaigns 1.0.275). Destino: **1.0.280** (lo traen los PRs de release: 1.0.279 + el logger sin credenciales, `package-logger` #10).
- **Base de prod** (`vio-ecom-db-prod-sc`): última migración `SurfaceCampaignSlotSource1792100000000` (id 176). Faltan
  `1792200000000-surface-slot-kind`, `1792300000000-order-attribution` y `1792400000000-cart-attribution-utf8mb4`.
- **Backup externo** `mysql-prod-offsite-backup`: su job lleva **7 días en Running 0/1** (roto, diferido por Angelo). Para
  este release vale el backup automático de Azure (PITR), ver paso 1.
- **Colector de prod** (`events.vio.live`, VM de Oracle): versión del 16/10, `ready:true`, 0 eventos insertados.
- **Órdenes en prod desde el 16/10**: 0.

### PRs de release abiertos (no mergear hasta el paso 5)

| Repo | PR | Rama prod |
|---|---|---|
| vio-extensions-microservice | [#28](https://github.com/vio-live/vio-extensions-microservice/pull/28) | master |
| vio-orders-microservice | [#32](https://github.com/vio-live/vio-orders-microservice/pull/32) | master |
| vio-shopcart-microservice | [#97](https://github.com/vio-live/vio-shopcart-microservice/pull/97) | main |
| graphql | [#31](https://github.com/vio-live/graphql/pull/31) | master |
| vio-campaigns-microservice | [#23](https://github.com/vio-live/vio-campaigns-microservice/pull/23) | main |
| vio-base-api | [#47](https://github.com/vio-live/vio-base-api/pull/47) | master |
| vio-api-microservice | [#50](https://github.com/vio-live/vio-api-microservice/pull/50) | master |
| vio-users-microservice | [#25](https://github.com/vio-live/vio-users-microservice/pull/25) | master |
| vio-products-microservice | [#28](https://github.com/vio-live/vio-products-microservice/pull/28) | master |
| vio-payment-processors-microservice | [#16](https://github.com/vio-live/vio-payment-processors-microservice/pull/16) | master |
| vio-collection-microservice | [#15](https://github.com/vio-live/vio-collection-microservice/pull/15) | main |
| vio-middleware-microservice | [#12](https://github.com/vio-live/vio-middleware-microservice/pull/12) | main |
| vio-template-microservice | [#12](https://github.com/vio-live/vio-template-microservice/pull/12) | main |
| vio-tracking-microservice | [#9](https://github.com/vio-live/vio-tracking-microservice/pull/9) | main |
| webapp-vio-commerce | [#69](https://github.com/vio-live/webapp-vio-commerce/pull/69) | master (Vercel) |

Los 15 están **MERGEABLE** (comprobado 21/10). Los 10 micros sin cambios funcionales solo traen el bump a 1.0.279.

## 2. Paso 1 — Punto de restauración (≈5 min)

1. Encender prod si está apagado (playbook [prod-power-on-demand](../playbooks/prod-power-on-demand.md)).
2. Confirmar que el servidor tiene backups automáticos y anotar la hora UTC exacta antes del paso 2 (es el punto al que
   se restauraría):
   `az mysql flexible-server show -g rg-vio-databases -n vio-ecom-db-prod-sc --query "{backup:backup, state:state}"`
3. Opcional, más limpio: `az mysql flexible-server backup create -g rg-vio-databases -n vio-ecom-db-prod-sc --backup-name pre-release-20261021`.

## 3. Paso 2 — Migraciones de la base (antes de cualquier deploy)

Scripts idempotentes, desde el pod de **users** del contexto `vio-commerce-prod-sc` (leen el `.env` del pod, no imprimen
valores), en este orden y **uno a uno** (cada uno comprueba lo anterior):

| Orden | Script | Qué hace |
|---|---|---|
| 1 | [`m-slot-kind-prod.js`](./assets/2026-10-19-staging/m-slot-kind-prod.js) | `surface_slot.kind` |
| 2 | [`m-order-attribution-prod.js`](./assets/2026-10-19-staging/m-order-attribution-prod.js) | `order` +6, `order_item` +3, índice, `surface_campaign.publisher_commission_pct` |
| 3 | [`m-cart-attribution-prod.js`](./assets/2026-10-19-staging/m-cart-attribution-prod.js) | `cart_item.origins`, `checkout.attribution` (JSON) y los 5 textos de atribución a utf8mb4 |

```
P=$(kubectl --context vio-commerce-prod-sc get pods -o name | grep pod/users- | head -1 | sed 's#pod/##')
kubectl --context vio-commerce-prod-sc cp m-slot-kind-prod.js $P:/usr/src/app/m.js -c users
kubectl --context vio-commerce-prod-sc exec $P -c users -- node /usr/src/app/m.js
kubectl --context vio-commerce-prod-sc exec $P -c users -- rm -f /usr/src/app/m.js
```

(repetir con los otros dos). **Verificación**: la última fila de `migrations` es `CartAttributionUtf8mb41792400000000` y
la salida de cada script lista las columnas como presentes. Todas las columnas son nuevas y `NULL`: nada existente cambia.
El script 3 se corrigió el 21/10 para leer `.env` (el de prod), no `.env.local`.

## 4. Paso 3 — Variables de prod (antes de mergear)

En los Secrets `env-sc-<svc>` de prod (como el 16/10):

| Servicio | Variable | Valor |
|---|---|---|
| orders | `ANALYTICS_EVENTS_URL` | `https://events.vio.live` (sin path) |
| orders | `ANALYTICS_INTERNAL_TOKEN` | el `INTERNAL_EVENTS_TOKEN` **full** del colector de prod (el de escritura; no el de lectura de base-api) |
| shopcart | `BUYER_REF_SECRET` | nuevo (D2) |
| base-api | `ANALYTICS_STATS_URL`, `ANALYTICS_INTERNAL_TOKEN` | **comprobar que existen** (el puente ya los usaba antes de este release): el token es uno de lectura del colector de prod |

Sin las de orders, orders no emite compensaciones (un aviso en el log, nada se rompe). Sin `BUYER_REF_SECRET`, las
órdenes nacen sin `buyer_ref` (nada se rompe). Comprobar presencia sin imprimir valores (`grep -c '^NOMBRE='`).

## 5. Paso 4 — Colector de prod (antes que orders)

En la VM de `events.vio.live`: desplegar `vio-analytics` **`main` = `132887e`** como hiciste en staging (tarball del
commit, respaldo del directorio actual, `pnpm install && pnpm build`, restart). Sin variables nuevas. **Verificación**:
`schema ready` sin errores de `ALTER` (añade `items.campaign_id`, `items.location_id` y `checkout_id`), `/health` con el
bloque `compensation`, y `GET /v1/stats/surface/overview?client_app_id=<una surface de prod>&days=7` con el token interno
→ 200 con `gmv_gross` y `purchases_net`.

## 6. Paso 5 — Código a prod (mergear los PRs)

Con los pasos 2–4 hechos. Mergear **de uno en uno por repo** (dos merges seguidos al mismo repo provocan la carrera de
helm); repos distintos pueden ir a la vez. Orden recomendado:

1. extensions #28 → orders #32 → shopcart #97 (en ese orden: shopcart ya manda `processor: 'STRIPE'` a orders).
2. graphql #31, campaigns #23, base-api #47.
3. Los 9 micros que solo suben el kernel (api, users, products, payment-processors, collection, middleware, template,
   tracking).

**Verificación por micro**: CI/CD en verde, pod 2/2, `@vio-/database` = 1.0.279 dentro del pod, y 0 líneas de
`Unknown column` / `QueryFailedError` en el arranque (un `ECONNREFUSED` de TypeORM en el primer segundo es el sidecar
de Istio, no un fallo). En orders, que el arranque **no** diga `[analyticsMirror] ... not set`.

## 7. Paso 6 — Apps de Shopify

Los `shopify app deploy` los ejecuta una persona (piden el login del CLI de Shopify). Desde `/Users/angelo/vio-sync`
(`git checkout master && git pull vio master`):

| App | Comando | Qué cambia |
|---|---|---|
| Vio Sync Staging (QA) | `shopify app deploy --config shopify.app.vio-sync-staging.toml` | + `refunds/create` (vio-shopify-sync #110). Hacerlo primero y probar una devolución en una tienda de pruebas |
| Vio Sync (prod) | `shopify app deploy --config shopify.app.vio-sync.toml` | + `refunds/create`. Después del paso 5 |
| Careless, Gladkokken, Makeupmekka | ya desplegados el 16/10 (`vio-sync-3`) con `refunds/create` | nada |

Los dos `toml` no cambiaban desde el 09/09: el deploy solo añade ese webhook. El código del app (Vercel, `sync.vio.live`)
no cambia; el commit de #110 sale BLOCKED en Vercel por D1, pero como solo toca los `toml`, no hace falta redesplegarlo.

**Verificación**: en el Partner Dashboard, la versión nueva de cada app lista `refunds/create`; desde el pod de extensions
de prod, `/internal/token` de cada app sigue en 200 (como el 16/10).

## 8. Paso 7 — Fronts

- **Webapp** `master` en Vercel tras mergear #69 (D1 resuelto: debería desplegar solo; si sale BLOCKED, redeploy como owner). Comprobar `dashboard.ecom.vio.live`
  (o el dominio de prod) → home nueva con «Net revenue».
- **Vev**: el paquete compartido `cq1lXld-TA9` ya lleva la SDK 0.26.0; las páginas de prod hay que **republicarlas** en el
  editor de Vev para que la cojan.
- **Replit**: subir a `@vio-live/web-sdk@0.26.0` (su agente).

## 9. Paso 8 — Verificación final

- Una compra real de importe mínimo desde una página de prod (Vipps o Stripe): orden en Vio con `surface_id`,
  `campaign_id` y `buyer_ref`; evento `purchase` en `events.vio.live`.
- Cancelarla desde el dashboard: devolución en la pasarela, `order_cancelled` en el colector (`compensation.resolved` sube)
  y en el overview de esa surface bajan `purchases_net` y `gmv` mientras `purchases` y `gmv_gross` no.
- Anotar en el canal hora UTC, id de orden y contadores.

## 10. Rollback

- **Código**: revertir el merge del PR de release en la rama prod del repo afectado (el deploy vuelve a la versión
  anterior). Las columnas nuevas no molestan a la versión anterior (son nuevas y `NULL`).
- **Migraciones**: no hace falta deshacerlas para volver atrás. Si hubiera que hacerlo, el `down` de cada migración está
  en `package-database`; el punto de restauración del paso 1 es la red de seguridad.
- **Colector**: restaurar el respaldo del directorio del paso 4 y reiniciar.
- **Apps de Shopify**: volver a la versión anterior desde el Partner Dashboard (Versions → Release).

## 10b. Credenciales del `.env.test` de extensions (Angelo, 21/10)

`vio-extensions-microservice` tenía commiteado desde el 21/04 un `.env.test` con credenciales con pinta real de QA
(clave privada de Firebase de `outshifter-qa`, Mailjet, Mixpanel, Klarna, Vipps, Aftership, Postmen, tipos de cambio,
Stripe test). Hecho: valores de mentira en `develop` (extensions [#29](https://github.com/vio-live/vio-extensions-microservice/pull/29),
entra con el release #28). **No se reescribe el historial** (repo privado). **Falta, Miguel:** ejecutar
[`cmp-envtest-vs-prod.py`](./assets/2026-10-21-prod/cmp-envtest-vs-prod.py) (compara por hash con los Secrets de prod;
solo imprime nombres) y **rotar únicamente lo que salga «COINCIDE CON PROD»**; lo que sea solo de QA no se rota (regla de
Angelo). Anotar en el canal qué se rotó.

En el mismo release, los logs dejan de sacar credenciales: el kernel 1.0.280 tapa `token|secret|password|apikey|…` en
los volcados INIT/FINISH de los 12 micros, y extensions #29 hace lo mismo en `findProductById`/`findAllProducts` (sacaban
el `accessToken` y el `refreshToken` de Shopify de cada tienda). Las keys que ya estén en logs viejos **no se rotan**
(decisión de Angelo del 20/10).

## 11. Fuera de este release

- SDK #88 (número de Vio en el `purchase`): aparcado; las cancelaciones ya casan por `checkout_id`.
- Durabilidad de la emisión de compensaciones (outbox o reconciliador), `RETURNED` de base-api, Kustom sin aviso a orders.
- Tokens de una hora del app de desarrollo de Shopify (solo afecta a pruebas de Alan).
- Backup externo de prod (D de Angelo del 16/10).
