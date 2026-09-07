---
title: "Inventario de variables de entorno — Vio Commerce"
last-updated: 2026-09-08
owner: miguel
status: live
---

# Inventario de variables de entorno — Vio Commerce

Auditoría hecha en vivo el 2026-09-08: `gh api` sobre cada repo (`deploy.yml`, `Dockerfile`, lista de secrets),
`az storage` sobre las cuentas de blobs, y `kubectl exec` sobre pods corriendo en `kubernetesqa` y
`vio-commerce-prod` para leer **nombres** de variables directamente del `.env` horneado en cada imagen.

**Regla seguida en toda esta auditoría: nunca se copió un VALOR real a este documento.** Donde hizo falta
comparar dos secretos, se comparó por tamaño de archivo/md5 del `.env` completo, nunca por su contenido.

**Entornos reales de Commerce: 2, no 3.** `develop` → QA (`kubernetesqa`) y `master` → prod
(`vio-commerce-prod`). La rama `pre-develop` ("staging") no recibe pushes — confirmado en
[`environments-and-endpoints.md`](environments-and-endpoints.md) — así que todo lo marcado `_STAGING` abajo
existe pero es config muerta hoy.

## Patrón 1 — El `.env` compartido ("outshifter monolith")

11 microservicios comparten un **único blob de `.env`** con ~170 variables. El Dockerfile de cada uno
descarga el mismo archivo y sólo reemplaza la línea `APP_NAME` con `sed` — confirmado comparando tamaño y
md5 del `.env` final entre pods de `api` y `products` en QA (13612 vs 13613 bytes, 1 byte de diferencia,
md5 distinto sólo por esa línea).

**Servicios que usan este patrón:** `api`, `products`, `users`, `orders`, `shopcart`, `collections`,
`tracking`, `extensions`, `payment-processors`, `middleware`, `templates` (repos `vio-api-microservice`,
`vio-products-microservice`, `vio-users-microservice`, `vio-orders-microservice`,
`vio-shopcart-microservice`, `vio-collection-microservice`, `vio-tracking-microservice`,
`vio-extensions-microservice`, `vio-payment-processors-microservice`, `vio-middleware-microservice`,
`vio-template-microservice`).

**Dónde vive el valor real:**
- QA: blob `.env.local` en la raíz de `env-file-microservices` (cuenta `containerqa2`)
- Prod: blob `.env` en la raíz de `env-file-microservices` (cuenta `containerproduction2`)
- El nombre exacto del blob (`.env.local` vs `.env`) lo decide el secret `ENV_FILE_QA` / `ENV_FILE_PROD` /
  `ENV_FILE_STAGING` en **cada uno de los 11 repos** — 33 secrets GitHub distintos apuntando, en la
  práctica, al mismo par de 2 blobs.
- El Dockerfile hace `az login --service-principal` con `SV_APP_ID`/`SV_PASSWORD`/`SV_TENANT_ID` (secret
  por repo × entorno) y luego `az storage blob download`.

**Diff QA vs prod (nombres, no valores):** 172 vars en QA vs 170 en prod. Prod tiene `MIDDLEWARE_MICROSERVICE_URL`,
`REACHU_PROD`, `REPORT_ALL_STATICS_EMAILS_2` que QA no tiene; QA tiene `QLIRO_API_KEY`/`QLIRO_API_SECRET`/
`QLIRO_SANDBOX`/`QLIRO_TERMS_URL` y `SHOPIFY_APPLICATION_CHARGE_TEST` que prod no tiene. Es decir, ya hay
**drift real entre entornos** en un archivo que nadie versiona ni diffea — nadie sabría decir hoy si esas
diferencias son intencionales.

**Categorías de variables (170+, lista completa de nombres en el blob, no reproducida aquí por longitud):**

| Categoría | Ejemplos de nombres |
|---|---|
| Base de datos | `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_TYPE`, `DB_USERNAME`, `TYPEORM_*` (7 vars) |
| Cache/Redis | `CACHE_ENABLED`, `CACHE_HOST`, `CACHE_PASSWORD`, `CACHE_PORT`, `CACHE_USER`, `CACHE_USE_CLUSTER`, `CACHE_USE_SENTINEL`, `SENTINEL_HOSTS` |
| Azure Service Bus | `AZURE_SERVICE_BUS_ORDER_CONNECTION_STRING`, `AZURE_SERVICE_BUS_ORDER_QUEUE_NAME`, `AZURE_SERVICE_BUS_PRODUCT_CONNECTION_STRING`, `AZURE_SERVICE_BUS_PRODUCT_QUEUE_NAME` |
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_SQS_*` (3), `AWS_IMAGES_S3` |
| Firebase | `FIREBASE_API_KEY`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_PROJECT_ID`, + 5 más |
| Pagos | `STRIPE_API_SECRET`, `STRIPE_PUBLISH_KEY`, `STRIPE_WEBHOOK_SECRET`, `KLARNA_API_URL`, `KLARNA_AUTH_KEY`, `VIPPS_*` (7), `QLIRO_*` (4, solo QA), `SPREEDLY_*` (3) |
| Shopify | `SHOPIFY_CLIENT_ID_EXPORT`, `SHOPIFY_CLIENT_SECRET_EXPORT`, `SHOPIFY_CLIENT_ID_IMPORT`, `SHOPIFY_CLIENT_SECRET_IMPORT`, + 6 más |
| Envíos/logística | `AFTERSHIP_API_KEY`, `POSTMEN_API_KEY`, `WOLT_*` (5), `ODA_*` (4) |
| Email/marketing | `MAILJET_*` (9), `MIXPANEL_*` (2), `GA4_*` (2), `DATADOG_API_KEY`, `NEW_RELIC_*` (2) |
| URLs internas de microservicios | `API_MICROSERVICE_URL`, `PRODUCTS_MICROSERVICE_URL`, `ORDERS_MICROSERVICE_URL`, `SHOPCART_MICROSERVICE_URL`, `USERS_MICROSERVICE_URL`, `EXTENSIONS_MICROSERVICE_URL`, `TRACKING_MICROSERVICE_URL`, `PAYMENT_PROCESSORS_MICROSERVICE_URL`, `COLLECTIONS_MICROSERVICE_URL`, `TEMPLATE_MICROSERVICE_URL`, `MIDDLEWARE_MICROSERVICE_URL`, `GRAPHQL_URL`, `VIO_BACKEND_URL` |
| Otros/config | `APP_NAME` (única var realmente distinta por servicio), `PORT`, `NODE_OPTIONS`, `GS1_COMPANY_PREFIX`, `EXCHANGE_RATE_*`, `MAGENTO_*`, `WOO_APP_NAME`, `G_TRANSLATE_*`, `GCP_*`, `FACEBOOK_APP_*`, `STORYBLOK_ACCESS_TOKEN`, `USE_AZURE`, `CRON_*` (7 flags de scheduling) |

**Por qué esto importa para una migración:** cualquier microservicio de este grupo — aunque nunca use
Stripe, Vipps o Mailjet — tiene esas credenciales en su propio filesystem porque vienen todas en el mismo
archivo. Rotar **una sola** de estas ~170 variables significa re-subir el blob y re-desplegar los 11
servicios (o esperar al próximo build normal de cada uno). Es el opuesto de "dispersión" — es
**concentración excesiva sin segmentación por servicio**, con el mismo radio de exposición que si fuera un
único secreto gigante.

## Patrón 2 — `.env` propio por servicio (base-api, graph-ql)

`base-api` y `graph-ql` **no** usan `ENV_FILE` como build-arg — el nombre del blob está **hardcodeado en el
Dockerfile** (`base-api/.env`, `graph-ql/.env`). Confirmado leyendo el `Dockerfile` de ambos repos.

- **base-api** (`vio-live/vio-base-api`): `.env` con ~140 variables. Fuerte solapamiento con el blob
  compartido del Patrón 1 — mismas credenciales de Stripe, Klarna, Vipps, Firebase, DB, AWS, Service Bus —
  es una **copia separada y mantenida a mano** de casi el mismo secreto. Blob: `base-api/.env`
  (QA: `containerqa2`, prod: `containerproduction2`). Existe también un backup manual
  `base-api/.env.backup-2026-09-07` en QA — de esta semana, probablemente de alguien preparando un cambio.
- **graph-ql** (`vio-live/graphql`): `.env` chico (16 variables) — sólo config de ruteo interno y cache:
  `API_MICROSERVICE_URL`, `MIDDLEWARE_MICROSERVICE_URL`, `PRODUCTS_MICROSERVICE_URL`,
  `SHOPCART_MICROSERVICE_URL`, `CACHE_*` (5), `SENTINEL_HOSTS`, `DATADOG_API_KEY`, `APP_NAME`, `PORT`,
  `NODE_ENV`, `RETRIES`, `TIMEOUT_TIME`. Este servicio está bien segmentado — no carga secretos que no usa.

**Secret vestigial confirmado (código muerto real, no sospecha):** en `vio-base-api` y `graphql`, el
workflow (`deploy.yml`) sigue exportando `ENV_FILE_QA` / `ENV_FILE_PROD` / `ENV_FILE_STAGING` a
`$GITHUB_ENV`, pero el `Dockerfile` de ninguno de los dos declara `ARG ENV_FILE` ni lo usa en el
`docker build --build-arg`. Igual con `YARN_BUILD_*` / `YARN_START_*`: el workflow los exporta, pero el
`CMD`/`RUN` del Dockerfile tiene `yarn start` / `yarn build` hardcodeado. **6 secrets × 2 repos = 12
secrets de GitHub que no hacen nada.**

## Patrón 3 — Apps independientes (Shopify export/import)

`vio-plugin-export` (Shopify export, imagen `shopify-export`) y `vio-shopify-seller` (Shopify import, imagen
`shopify-import`) son apps Next.js separadas, cada una con su propio `.env` chico, descargado en un step del
workflow (no en el Dockerfile):

- `shopify-export/.env` (17 vars): `NEXT_PUBLIC_FIREBASE_*` (6), `NEXT_PUBLIC_FACEBOOK_APP_ID`,
  `NEXT_PUBLIC_SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_NAMESPACE`,
  `REDIS_HOST`/`REDIS_PASSWORD`/`REDIS_PORT`, `SENTINEL_HOSTS`, `OUTSHIFTER_API_HOST`, `OUTSHIFTER_APP_HOST`
- `shopify-import/.env` (16 vars): mismo estilo — `NEXT_PUBLIC_FIREBASE_*` (6), `SHOPIFY_API_KEY`,
  `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_NAMESPACE`, `REDIS_*` (3), `SENTINEL_HOSTS`,
  `OUTSHIFTER_API_HOST`, `HOST`, `PORT`

Ambas imágenes en prod no se rebuildean hace 74 días (`shopify-export`/`shopify-import` pods con esa
antigüedad) — bajo tráfico de cambios, no bloqueante para la migración.

## admin-panel (Firebase + AKS mixto)

`vio-live/admin-panel` es un caso híbrido: además del patrón `ENV_FILE`/`AZ_STORAGE` estándar, tiene 8
secrets `FIREBASE_*` y `API_HOST`/`WEBAPP_HOST` propios inyectados directo como build-args (no vía blob).
No pincheado en ningún AKS namespace activo hoy (no aparece en `kubectl get deploy` de ninguno de los dos
clusters) — verificar con el equipo si sigue en uso o es candidato a archivar.

## GitHub Secrets — patrón repetido en los 15 repos de microservicios

Cada uno de los 15 repos (`vio-api-microservice`, `vio-base-api`, `graphql`,
`vio-middleware-microservice`, `vio-products-microservice`, `vio-users-microservice`,
`vio-orders-microservice`, `vio-shopcart-microservice`, `vio-collection-microservice`,
`vio-tracking-microservice`, `vio-extensions-microservice`, `vio-payment-processors-microservice`,
`vio-plugin-export`, `vio-shopify-seller`, `vio-template-microservice`, `admin-panel`) tiene **el mismo
esqueleto de ~10-16 secrets × 3 sufijos** (`_QA`, `_PROD`, `_STAGING`):

`ACR_*`, `SV_APP_ID_*`, `SV_PASSWORD_*`, `SV_TENANT_ID_*`, `AZ_RG_*`, `AZ_KUB_NAME_*`, `AZ_KUB_RG_*`,
`AZ_STORAGE_*`, `ENV_FILE_*` (dead en base-api/graphql), `YARN_BUILD_*`/`YARN_START_*` (dead en
base-api/graphql, sólo en repos con `ARG YARN_BUILD` — la mayoría), `APP_NAME_DEV/PRE/PROD`, `API_HOST_*`
(no todos los repos), `FIREBASE_API_KEY_*`/`FIREBASE_AUTH_DOMAIN_*` (sólo algunos), más `APP_PREFIX`,
`AZ_SUBSCRIPTION_ID`, `NPM_CONTENT_FILE`, `GCP_ACCOUNT_KEY_FUNCTIONS` (compartidos, sin sufijo).

**Total estimado: ~30-45 secrets de GitHub por repo × 15 repos ≈ 500-650 secrets individuales**, de los
cuales el tercio `_STAGING` (≈33%) no se usa nunca porque `pre-develop` está muerta, y ~12 más
(`ENV_FILE_*`/`YARN_*` en base-api y graphql) son código muerto confirmado.

## Vestigial confirmado (candidatos a NO migrar)

| Qué | Evidencia | Acción sugerida |
|---|---|---|
| `ENV_FILE_QA/PROD/STAGING` en `vio-base-api` y `graphql` | Dockerfile no declara `ARG ENV_FILE`, nunca se pasa a `docker build` | Borrar los 6 secrets |
| `YARN_BUILD_*`/`YARN_START_*` en `vio-base-api` y `graphql` | Mismo motivo — Dockerfile tiene `yarn start`/`yarn build` hardcodeado | Borrar los 6 secrets |
| Todos los secrets `_STAGING` (15 repos) | `pre-develop` sin push en los últimos runs (confirmado en `environments-and-endpoints.md`) | Evaluar borrar o documentar como "reservado, no usar" antes de migrar |
| Blob `env-file-microservices/socket-server/.env` en `containerqa2` | Última modificación 2026-04-09; contiene `PGHOST/PGUSER/PGPASSWORD` (Neon, eliminado 2026-06-02) y `CACHE_HOST`/`SENTINEL_HOSTS` de Redis-en-cluster (eliminado 2026-07-01) — el socket-server real corre en Container Apps con env vars propias, no lee este blob hace meses | Borrar el blob |
| Blob `env-file-microservices/bigcommerce-app/.env` en `containerqa2` | Última modificación 2025-10-09; repo `vio-live/bigcommerce-app` sin push desde 2026-04-27; sin deployment en ningún cluster | Borrar el blob y archivar el repo |
| Secrets del repo `tipiodevelopment/socket-server`: `ACR_QA/PROD/STAGING`, `AZ_KUB_NAME_*`, `AZ_RG_*`, `AZ_STORAGE_*`, `CACHE_*`, `DATABASE_URL` (como secret plano, duplicado del que ya vive en el Container App) | El deploy real usa Container Apps (`AZURE_CREDENTIALS`, `AZURE_REGISTRY_*`, `COMMERCE_GRAPHQL_URL`) — los secrets de AKS son remanentes de antes de la migración a Container Apps (2026-06-01) | Borrar los secrets AKS-era del repo |
| Blob `env-file-microservices/.env` (raíz, cuenta `containerqa2`, sin prefijo de servicio) | No identificado a qué build corresponde — nombre genérico, no coincide con ningún `ENV_FILE_*` conocido | Confirmar con el equipo antes de tocar; puede ser un archivo de prueba |

## Ver también

- [`env-vars-vio-backend.md`](env-vars-vio-backend.md) — Vio Backend (Container Apps), infra separada
- [`env-vars-vercel.md`](env-vars-vercel.md) — proyectos Vercel (webapp, sync, portal)
- [`environments-and-endpoints.md`](environments-and-endpoints.md) — topología real de entornos
- [`../decisions/0016-consolidacion-secretos-terraform.md`](../decisions/0016-consolidacion-secretos-terraform.md) — plan de consolidación
