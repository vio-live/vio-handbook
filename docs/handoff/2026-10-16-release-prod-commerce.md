---
title: "Handoff — Encender prod y llevar Vio Commerce a producción (release 2026-10)"
date: 2026-10-16
owner: miguel
decides: angelo
status: live
---

# Encender prod y llevar Vio Commerce a producción

**Para Miguel.** Angelo pidió el 16/10: "encender prod y mandar todo a prod para dejar
zanjado esto". Este documento es el runbook completo: estado de partida verificado,
decisiones que son de Angelo, y los pasos en orden con qué comprobar en cada uno. Todo lo
que se podía dejar preparado sin tocar prod está preparado (PRs abiertos, chart del micro,
listas de variables). Lo que toca prod lo ejecutas tú.

Si algo de aquí contradice lo que ves en el clúster, manda lo que ves: esto se escribió
con prod apagado y sin acceso al blob de `.env` de prod.

## 0. Decisiones de Angelo (antes de empezar)

| # | Decisión | Recomendación |
|---|---|---|
| D1 | **`PAYMENT_SECRETS_KEY` en prod.** Hoy las credenciales de pago de cada vendedor están en texto plano en `payment_method.options`. El procedimiento (playbook [prod-power-on-demand](../playbooks/prod-power-on-demand.md) §"Secretos") tiene cuatro pasos con orden obligatorio y, hecho el cuarto, no se deshace. | **Hacerlo en este encendido**, antes de que entre ningún cobro real (paso 3.3). |
| D2 | **Corte de `api.vio.live` al micro de campañas** (ADR-0029/0030). Hoy apunta a la VM de Oracle `82.70.54.151` (vio-backend viejo, `nginx` + Express, `/health` responde). Al cortar, todo lo que pegue a `api.vio.live` pasa al micro, que arranca con la base de campañas **vacía** (sin brands, surfaces ni keys). | Cortar **en este release** salvo que haya una app móvil viva en prod usando vio-backend; en ese caso, después de crear los datos (paso 8). |
| D3 | **Comportamiento nuevo en prod con este código:** una devolución hecha en la Shopify/Woo de un cliente ahora mueve dinero en **Vipps** (según «Let Vio refund these payments») y también en **Stripe** (`refundedInShop` de orders en `develop`; en el `master` de hoy solo Vipps). Y los apps de Shopify de Careless, Gladkokken y Makeupmekka **ya suscriben `refunds/create`** desde hoy 11:00 UTC. | Avisar a los tres clientes de que las devoluciones hechas en su tienda se reflejan en Vio y en la pasarela. |

## 1. Estado de partida (verificado 16/10, 10:00–12:30 UTC)

- **Apagado desde el 05/10:** AKS `vio-commerce-prod-sc` (RG `rg-vio-commerce-prod-sc`, 3 × `Standard_D4as_v5`) y MySQL `vio-ecom-db-prod-sc` (RG `rg-vio-databases`) en `Stopped`. Redis `redus-vio-prod-sc`, Service Bus (`vio-order-processing-sc`, `vio-product-processing-sc`), ACR `vioprodsc` y storage `containerproductionsc` siguen encendidos.
- **Kernel:** prod corre `@vio-/* 1.0.267` en los 11 micros con kernel; `develop` está en **1.0.273**. Entre medias el kernel empezó a leer **`EMAIL_DELIVERY`** (`package-service` ≥ 1.0.268: sin la variable, o con cualquier valor distinto de `on`, **no sale ningún email**; QA la tiene sin definir a propósito). Ninguna otra variable nueva en el kernel ni en el código de los micros entre `master` y `develop`.
- **Código, `develop` por delante de la rama de prod** (último deploy a prod 12–13/10; payment-processors 30/09): api 27, base-api 23, users 22, products 18, orders 20, extensions 13, shopcart 27, collection 8, payment-processors 12, graphql 8, middleware 5, template 4, tracking 2, webapp 39. **PRs de release abiertos** (abajo). El **micro de campañas nunca ha ido a prod**: tiene todos los secrets `*_PROD` en el repo, pero no existe la rama `main`.
- **Migraciones del kernel** desde septiembre, candidatas a faltar en prod (la lista real sale de la tabla `migrations`, paso 2.2): `1788100000000-order-webhook`, `1789000000000-FeedRunHistory`, `1787951365225-productDescriptionUtf8mb41`, `1787951365226-titleProductUtf8mb4`, `1789058220000-titleVariantUtf8mb4`, `1789058220001-titlesUtf8mb4`, `1789158220001-nexi-channel-toggle`, `1789643151000-adyen-channel-toggle`, `1791899686000-brand-publisher`, `1791899686001-brand-publisher-payments-backfill` (lleva `SET SESSION group_concat_max_len = 1048576`, tu revisión de package-database #17), `1791900705000-surface-tables`, `1792000000000-surface-privacy-mode`.
- **DNS hoy:** `api.vio.live` y `events.vio.live` → `82.70.54.151` (Oracle prod: vio-backend + colector); `api-staging.vio.live` y `graph-ql-staging.vio.live` → `74.158.41.166` (Istio de QA); `graph-ql.vio.live` y `api-ecom.vio.live` → `135.116.206.152` (Istio de prod, IP estática, hoy sin responder).
- **Istio en QA para el micro:** `Gateway gateway-campaigns-qa` + `VirtualService virtual-service-campaigns-qa` (ns `istio-system`), hosts `campaigns-staging.vio.live`, `campaigns-dev.vio.live`, `api-staging.vio.live`, ruta única a `campaigns.default.svc.cluster.local:80`, TLS `domain-cert-campaignsqa` emitido por cert-manager `ClusterIssuer clusterissuer-dns01-cloudflare`. Prod necesita el equivalente (paso 5.4).
- **Env:** QA usa un solo `.env.local` compartido (185 variables) horneado en la imagen; prod usa un `.env` **por servicio** en el blob `containerproductionsc/env-file-microservices/<servicio>/.env`, montado como Secret `env-sc-<servicio>` sobre `/usr/src/app/.env` (playbook, corrección del 12/10). La cuenta `angelo@tipio.no` **no tiene** `Storage Blob Data Contributor` en ese storage ni en el de QA.
- **Shopify:** apps de cliente publicados hoy con `refunds/create` (`vio-sync-3`; dev `vio-client-dev-2`); PR [vio-shopify-sync #124](https://github.com/vio-live/vio-shopify-sync/pull/124) pendiente de merge.
- **Analytics:** colector `vio-live/vio-analytics` `main` @ `22458c2` (resuelve las keys contra el micro, `CAMPAIGNS_URL` **obligatoria**); en prod corre lo del playbook [levantar-colector-analytics-prod](../playbooks/levantar-colector-analytics-prod.md) (12/10), anterior a eso. Deploy manual por SSH.

### PRs de release abiertos (no mergear hasta el paso 4)

| Repo | PR | Rama prod |
|---|---|---|
| vio-api-microservice | [#49](https://github.com/vio-live/vio-api-microservice/pull/49) | master |
| vio-base-api | [#39](https://github.com/vio-live/vio-base-api/pull/39) | master |
| vio-users-microservice | [#24](https://github.com/vio-live/vio-users-microservice/pull/24) | master |
| vio-products-microservice | [#27](https://github.com/vio-live/vio-products-microservice/pull/27) | master |
| vio-orders-microservice | [#26](https://github.com/vio-live/vio-orders-microservice/pull/26) | master |
| vio-extensions-microservice | [#25](https://github.com/vio-live/vio-extensions-microservice/pull/25) | master |
| vio-shopcart-microservice | [#92](https://github.com/vio-live/vio-shopcart-microservice/pull/92) | main |
| vio-collection-microservice | [#13](https://github.com/vio-live/vio-collection-microservice/pull/13) | main |
| vio-payment-processors-microservice | [#15](https://github.com/vio-live/vio-payment-processors-microservice/pull/15) | master |
| graphql | [#27](https://github.com/vio-live/graphql/pull/27) | master |
| vio-middleware-microservice | [#11](https://github.com/vio-live/vio-middleware-microservice/pull/11) | main |
| vio-template-microservice | [#11](https://github.com/vio-live/vio-template-microservice/pull/11) | main |
| vio-tracking-microservice | [#8](https://github.com/vio-live/vio-tracking-microservice/pull/8) | main |
| webapp-vio-commerce | [#62](https://github.com/vio-live/webapp-vio-commerce/pull/62) | master (Vercel) |
| vio-campaigns-microservice | [#14](https://github.com/vio-live/vio-campaigns-microservice/pull/14) `chore/values-prod-env-secret` → `develop` (chart: Secret `env-sc-campaigns` en `main`) | `main` se crea en el paso 5 |

## 2. Paso 1 — Encender (≈15 min)

Tu script `prod-power.sh commerce start` hace esto; a mano es:

```bash
az mysql flexible-server start -g rg-vio-databases -n vio-ecom-db-prod-sc
az aks start -g rg-vio-commerce-prod-sc -n vio-commerce-prod-sc
az aks get-credentials -g rg-vio-commerce-prod-sc -n vio-commerce-prod-sc --overwrite-existing
kubectl get nodes; kubectl get pods -A | grep -vE "Running|Completed"
```

Comprobar: `curl -s https://graph-ql.vio.live/health`, `https://api-ecom.vio.live`, pods de los 13 servicios `Running` sin reinicios en bucle, certificados renovados (`kubectl -n istio-system get certificate`). Tag `vio-power=on` en los recursos. Prod encendido cuesta ~23 $/día; Angelo decide cuándo se apaga.

## 3. Paso 2 — Base de datos (antes de cualquier deploy)

1. **Backup:** `az mysql flexible-server backup list -g rg-vio-databases -n vio-ecom-db-prod-sc` (con el servidor encendido) y, si el último es de antes del 05/10, lanzar uno a demanda.
2. **Qué falta de verdad:** `SELECT name FROM migrations ORDER BY timestamp` contra los archivos de `package-database/src/migrations/*.ts` (`develop` @ `513bcf6`). Aplicar las reglas del playbook [commerce-db-migrations](../playbooks/commerce-db-migrations.md): una "pendiente" cuyo schema ya está no se corre, se inserta su fila.
3. **Consulta previa** (journal [2026-10-13-campanas-en-commerce](../journal/2026-10/2026-10-13-campanas-en-commerce.md), consulta 7): brands con productos vendidos por channels ajenos y sin channel propio activo. Es lo que el backfill de pagos toca; guardar el resultado para comparar después.
4. **Correr una por una**, desde `package-database` en `develop` con `.env` (`TYPEORM_*`, `TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}`, `PROCESS_ENV=development`) y el token npm de la cuenta `vio-`:
   `DB_MIGRATION_FILE=<archivo>.ts yarn migration:execute`. Orden: las de septiembre, `brand-publisher`, `brand-publisher-payments-backfill`, `surface-tables`, `surface-privacy-mode`.
   Alternativa que usé en QA para la de privacidad (si la MySQL de prod no se alcanza desde fuera): ejecutar el SQL de la migración desde un pod con `mysql2` e insertar la fila en `migrations` (`timestamp` + `name` del archivo).
5. **Verificar con `information_schema`**, no con el exit code: `surface.privacy_mode`, tablas `surface*`, `channel_user_settings`/`user_settings` con las columnas de pagos, etc. Repetir la consulta 7 y comparar.

## 4. Paso 3 — `.env` y secretos de prod (antes de mergear)

Por servicio: editar el blob `containerproductionsc/env-file-microservices/<servicio>/.env` → recrear el Secret `env-sc-<servicio>` → borrar pods (el `.env` horneado en la imagen **no es** el que la app lee; playbook). Respaldar cada Secret antes.

1. **`EMAIL_DELIVERY=on`** en **orders, users y api** (son los que envían con `@vio-/service`; en los demás no estorba). Sin esto, con el kernel 1.0.273 prod deja de mandar emails en silencio (`[mailService] … skipped`).
2. **Comprobar presencia** (no valores) en el `.env` de prod de cada servicio de lo que QA ya tiene: `PAYMENT_SECRETS_KEY` (shopcart, api, payment-processors), `VIO_CUSTOM_APPS` (extensions: client id/secret de los apps custom de Careless, Gladkokken, Makeupmekka; sin ella los `shpua_` no se renuevan), `CAMPAIGNS_DASHBOARD_ORIGINS` y `COMMERCE_GRAPHQL_PUBLIC_URL` (para el micro, abajo). Comparación segura: `grep -c '^NOMBRE=' <servicio>.env`.
3. **`PAYMENT_SECRETS_KEY` (D1)**, en este orden y no otro: (a) `openssl rand -base64 32`, distinta de la de QA; (b) al `.env` de **shopcart, api y payment-processors** en el blob y al `TOOLS.md`; (c) Secret + pods de los tres; (d) **solo después del paso 4** (código nuevo desplegado y los tres pods con la clave, `grep -c ^PAYMENT_SECRETS_KEY= /usr/src/app/.env` = 1 en cada uno): `POST /paymentmethod/reencrypt-all` interno; esperar `changed` = filas vivas con secretos, y cero campos sin `enc:v1:` incluyendo `deleted_at IS NOT NULL`.
4. **`.env` del micro de campañas:** copia del `.env` compartido de prod (el micro usa el mismo fichero que los demás: 185 variables en QA, incluidas `DB_*`, `TYPEORM_HOST`, Firebase) más `CAMPAIGNS_DASHBOARD_ORIGINS` (orígenes del dashboard de prod), `COMMERCE_GRAPHQL_PUBLIC_URL=https://graph-ql.vio.live`, `PORT` y, si se usan, `API_MICROSERVICE_URL` (URL interna de api-ms, para el catálogo de Replit) y `SDK_WEBSOCKET_BASE_URL`. Subirlo como `campaigns/.env` y crear el Secret:
   ```bash
   kubectl create secret generic env-sc-campaigns -n default --from-file=.env=campaigns.env --dry-run=client -o yaml | kubectl apply -f -
   ```
   `YARN_START_PROD` del repo debe ser `start:prod` (`PROCESS_ENV=production` → lee `.env`); `YARN_BUILD_PROD`, `build:prod`.
5. **`VIPPS_PARTNER_WEBHOOK_SECRET`:** solo cuando haya unidades de venta firmadas por el partnership (playbook, §2). Hoy no bloquea.

## 5. Paso 4 — Código a prod (mergear los PRs)

Con las migraciones aplicadas y los `.env` listos, mergear los PRs de release. Cada merge despliega solo (`helm upgrade` + `kubectl delete pod`: ~1 min de 503 por servicio). Orden sugerido:

1. **users, api, products, orders, extensions, shopcart, collection, payment-processors, middleware, template, tracking** (los 11 con kernel 1.0.273; pueden ir seguidos).
2. **graphql** y **base-api**.
3. Por cada uno: `gh run watch` del deploy, `kubectl get pods -l app.kubernetes.io/instance=<svc>` en `Running` con 0 reinicios, `kubectl logs` de arranque sin `Unknown column`, `Cannot find module` ni `error`, y en orders/users/api la línea `[mailService] EMAIL_DELIVERY=on`.
4. Smoke por el gateway: `Channel.GetProducts`, `Payment.GetAvailablePaymentMethods` (playbook [vio-commerce-cambio-con-migracion](../playbooks/vio-commerce-cambio-con-migracion.md)). Mirar el consumer de bus de products.
5. Cerrar D1: `reencrypt-all` (paso 3.3.d).

Rollback por servicio: `helm rollback <svc>` o revertir el merge (redeploya solo).

## 6. Paso 5 — Vio API en prod (micro de campañas)

1. Mergear [#14](https://github.com/vio-live/vio-campaigns-microservice/pull/14) del micro a `develop` (solo añade `values-prod.yaml` y el `-f` condicional en `main`; QA no cambia).
2. Con el Secret `env-sc-campaigns` creado (paso 3.4): **crear `main` desde `develop`** (`git push origin origin/develop:refs/heads/main`). El workflow despliega a `vio-commerce-prod-sc` con `vioprodsc` (`APP_NAME_PROD`, `ENV_FILE_PROD`, …) y hace `rollout status`; si falla por el env, los logs del pod lo dicen (`.env file does not exist` = Secret mal montado).
3. Comprobar dentro del clúster: `kubectl exec deploy/collections -- curl -s http://campaigns/health` (o `/test`) y `GET http://campaigns/v2/mobile/surface` con `X-Api-Key` cualquiera → `401 Invalid API key`.
4. **Istio:** replicar lo de QA en prod, en `istio-system`: `Certificate domain-cert-campaigns` (`dnsNames`: `api.vio.live`, `campaigns.vio.live`; `issuerRef` `ClusterIssuer clusterissuer-dns01-cloudflare`, comprobar que existe en prod), `Gateway gateway-campaigns` (servers http y https con `credentialName: domain-cert-campaigns`, mismos hosts) y `VirtualService virtual-service-campaigns` (hosts idem, `gateways: [gateway-campaigns]`, ruta única a `campaigns.default.svc.cluster.local` puerto 80). Los manifests de QA se exportan con `kubectl -n istio-system get gateway gateway-campaigns-qa -o yaml` (y el VirtualService); cambiar nombres, hosts y el secret del cert.
5. **DNS (D2):** en Cloudflare, `api.vio.live` A → `135.116.206.152` (la misma IP que `graph-ql.vio.live`), proxy como esté `graph-ql`. Verificar `curl -sI https://api.vio.live/v2/mobile/surface -H 'X-Api-Key: x'` → 401 del micro (y ya no `Server: nginx/1.24.0 (Ubuntu)`).
6. Después del corte, `events.vio.live` sigue en la VM de Oracle: no se toca.

## 7. Paso 6 — Analytics en prod

Después del paso 5 (el colector no arranca sin `CAMPAIGNS_URL` alcanzable):

1. En `82.70.54.151`: `/opt/vio-analytics` a `main` @ `22458c2`, `pnpm install --prod=false && pnpm build`.
2. `/opt/vio-analytics/.env`: añadir `CAMPAIGNS_URL=https://api.vio.live`, `API_KEY_CACHE_FILE=/opt/vio-analytics/.keycache.json`; quitar `DATABASE_URL` (ya no se usa); mantener `INTERNAL_EVENTS_TOKEN`, ClickHouse y Mixpanel. El usuario de la unit tiene que poder escribir en `/opt/vio-analytics`.
3. `systemctl restart vio-analytics`; `curl -s https://events.vio.live/health` → `ready:true`, bloque `auth` sin errores.
4. **vio-backend viejo en esa VM:** quitar `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` de su `.env` y reiniciarlo (apaga el espejo; sus ids no son los del micro). Con el DNS cortado ya no recibe tráfico de `api.vio.live`.
5. Histórico de ClickHouse `vio_production`: hoy 0 filas, nada que cortar.

## 8. Paso 7 — Fronts

1. **Webapp:** mergear [#62](https://github.com/vio-live/webapp-vio-commerce/pull/62) (Vercel despliega `master`). Variables de **producción** en Vercel: `VIO_API_HOST=https://api.vio.live`, `VIO_CAMPAIGNS_V2=true`, `ACCOUNT_PAYMENTS=true` (hoy solo están en staging). Después, comprobar que el dominio de prod sirve el último commit de `master` (lección de Miguel sobre Vercel).
2. **Vev:** no hay paquete de prod; las páginas que apunten a prod necesitan keys de surfaces creadas en el dashboard de prod (paso 8). Angelo.
3. **Replit (Mote & Livsstil):** Angelo lo recrea contra prod (keys nuevas, SDK 0.22.0).
4. **vio-backend / Container Apps del backend:** quedan fuera de este release.

## 9. Paso 8 — Datos y backfills en prod (después del código)

1. **Precios de productos con variantes:** en el pod de products, `PROCESS_ENV=production node dist/scripts/recompute-variant-prices.js` (en QA fue `PROCESS_ENV=local` porque el pod lee `.env.local`; 333 productos). Es idempotente.
2. **Rol Publisher:** `POST /admin/backfill-publisher-roles` con un admin, primero dry-run (users F2.2).
3. **Datos de campañas** (Angelo, en el dashboard de prod): brand, publisher, channels, surfaces y keys de los clientes reales; con eso, Vev y Replit.
4. Pendiente conocido, no bloqueante: backfill de la referencia de Stripe en órdenes antiguas (`checkout.origin_payment_body.paymentIntentId`).

## 10. Paso 9 — Verificación final

- Dashboard de prod: login, catálogo, Settings › Payments (filas con `••••last4`, no credenciales en claro), surfaces.
- Checkout real de prueba con importe mínimo por una tienda de cliente: orden en Vio y en la tienda, email de confirmación (`EMAIL_DELIVERY=on`), evento en `events.vio.live`.
- Devolución de prueba desde la Shopify de un cliente: en extensions `webhook refunds/create from <tienda>`, orden `Refunded`, dinero devuelto en la pasarela (D3).
- `api.vio.live/v2/mobile/surface` con una key de prod → 200 con `privacyMode`.

## 11. Apagar y rollback

- Rollback de un servicio: `helm rollback <svc>`; del código, revertir el merge. Las migraciones no se revierten: por eso van antes y una por una.
- Apagar: `prod-power.sh commerce stop` (AKS primero, luego MySQL). Con prod apagado, los merges a `master`/`main` **fallan** en el helm: no mergear nada con el clúster apagado.

## 12. Fuera de este release

Vipps partner (webhook secret) hasta que haya unidades firmadas; Klarna (401 en QA); slots desde Vev/web (siguiente foco de Angelo); borrar el flag `ACCOUNT_PAYMENTS` cuando F2 esté encendido en los dos entornos; limpiar `pre-develop` de los `deploy.yml`.
