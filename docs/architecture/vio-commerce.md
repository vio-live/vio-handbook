---
title: "Vio Commerce — arquitectura del código"
last-updated: 2026-07-01
owner: angelo
status: live
---

# Vio Commerce — Arquitectura del código

**Última revisión:** 2026-07-01 (Claude, deep-dive de los 13 servicios)
**Estado:** 🟢 Completo — 13 servicios leídos a fondo, con brief por servicio + lógica de negocio.

> **Detalle por servicio:** este doc es el mapa. El **brief profundo de cada servicio**
> (módulos, entities, lógica de negocio, quirks, bugs localizados) vive en el workspace de
> agentes `~/vio-commerce/briefs/<servicio>.md`, y los hallazgos transversales en
> `~/vio-commerce/FINDINGS.md`. Ese workspace tiene además un agente-experto por servicio
> (`.claude/agents/svc-*`).

Este doc describe **cómo está planteado el código** de Vio Commerce y cómo funciona
en runtime. Para infra/deployment prod (Terraform, IPs, endpoints, Istio) ver los docs
hermanos:

- [`infrastructure/vio-commerce-prod-plan.md`](../infrastructure/vio-commerce-prod-plan.md) — plan de infra prod, endpoints, routing.
- [`handoff/api-commerce-debugging.md`](../handoff/api-commerce-debugging.md) — debugging Istio/TLS de `api-commerce.vio.live`.
- [`architecture/woocommerce-sync.md`](./woocommerce-sync.md) — el plugin WooCommerce que consume esta API.

---

## 1. Qué es y de dónde viene

Vio Commerce es la **plataforma e-commerce headless** de Vio (catálogo, carrito,
checkout, pagos, colecciones, órdenes, canales de venta), servida como API para las apps
y para integraciones externas (WooCommerce, Shopify, BigCommerce, Magento, Squarespace).

**Linaje: Outshifter → Reachu → Vio.** El código nació como `outshifter-*` (los README
y títulos de Swagger todavía dicen "Outshifter"), pasó por `@reachu/*` (scope npm privado,
DB `outshifter`, dominios `*.reachu.io`) y ahora migra a `*.vio.live`. Al leer el código,
tratar `outshifter`, `reachu` y `vio` como **la misma cosa en distintas épocas**.

**Patrón de migración: strangler-fig.** Hay un **monolito** (`base-api`, Express, CHANGELOG
desde 2023) del que se van **extrayendo microservicios NestJS** uno por uno. Ej.
`base-api` CHANGELOG: _"TASK1023: Migrar todos los endpoints del proyecto base referente
a products al microservicio"_. Por eso muchas responsabilidades existen **duplicadas**:
una ruta vieja en `base-api/src/router/*` y un microservicio nuevo que la reemplaza.

---

## 2. Los repos (org `vio-live` en GitHub)

Todos clonados en `~/Documents/GitHub/`. Rama default de todos = **`develop`**.
El grueso del backend commerce se pusheó el **2026-06-30** (los "fix timeout" /
"re estructurar la conexión a la bd" recientes son la pelea de estabilidad DB, ver §6).

### Capa de entrada

| Repo | `name` interno | Rol |
|---|---|---|
| **vio-base-api** | `vio-api` | **Monolito / gateway legacy** (Express, ~50 routers). Fuente de verdad de lo aún no migrado + connectors externos |
| **graphql** | `vio-graphql` | **Gateway GraphQL** (Apollo Server + type-graphql + Express) sobre los microservicios REST → `graph-ql.vio.live` |

### Microservicios de dominio (NestJS, path bajo `msrvc.vio.live`)

| Repo | Path | Módulos / dominio |
|---|---|---|
| **vio-api-microservice** | `/api` | campaign, channel, connection, listings, components, currency, paymentMethod, notification, socket, request — **gestión de canales/listings y conexiones** a tiendas externas |
| **vio-products-microservice** | `/products` | product, catalog, category, attribute, shipping, **scraper**, listener |
| **vio-collection-microservice** | `/collections` | collection, collectionItem, collectionShared |
| **vio-shopcart-microservice** | `/shopcart` | cart, checkout, discount — **orquesta el checkout** |
| **vio-orders-microservice** | `/orders` | order, listener — gestión de órdenes (multicurrency) |
| **vio-users-microservice** | `/users` | user, **plan, subscription, settings** — usuarios + billing/planes SaaS |
| **vio-payment-processors-microservice** | `/payment-processors` | **stripe, klarna, vipps** — cobros |
| **vio-extensions-microservice** | `/extensions` | **bigcommerce, magento, shopify, woo** — conectores de canal de venta (import/export catálogo) |
| **vio-tracking-microservice** | `/tracking` | ⚠️ **NO trackea envíos** — es un proxy de eventos de analítica a **Mixpanel**. El tracking de envío real (Postmen/AfterShip) está en `base-api` |
| **vio-template-microservice** | `/templates` | auth (creds de tienda externa), **data-mapping**, webhook — motor de mapeo de integraciones (plantillas JSON en S3 → esquema canónico) |
| **vio-middleware-microservice** | `/middleware` | ⚠️ **NO es un proxy** — es el **gate de auth central** (forward-auth): valida API key / Firebase token / suscripción activa → 200/401 |

> **⚠️ extensions ≠ payment-processors (resuelto 2026-07-01).** Son **dos repos distintos**.
> `vio-extensions-microservice` = conectores de **canal** (bigcommerce/magento/shopify/woo).
> `vio-payment-processors-microservice` = **pagos** (stripe/klarna/vipps). OJO: el
> `package.json` de payment-processors se llama `vio-extensions-microservice` — es un
> artefacto de haber sido forkeado del starter de extensions. **No confiar en el `name`,
> mirar los módulos.**

### Kernel compartido — `@reachu/*` (cada uno es su propio repo `package-*`)

Publicados a un **registro npm privado**, consumidos por todos los microservicios. **Ojo:
hay drift de versión** — la mayoría en `1.0.212`, pero `extensions` en `1.0.219` y `api` en
`1.0.227`. No están alineados. Confirmado 2026-07-01 que viven como repos en `vio-live`:

| Repo | Paquete | Qué aporta |
|---|---|---|
| **package-config** | `@reachu/config` | Lectura/validación de configuración |
| **package-database** | `@reachu/database` | `Utils.getConnectionConfig()` — arma la conexión TypeORM (pool, entities, naming) centralizada |
| **package-definitions** | `@reachu/definitions` | Tipos/DTOs/contratos compartidos entre servicios |
| **package-logger** | `@reachu/logger` | `logger` + `expressLogger` (DataDog) |
| **package-service** | `@reachu/service` | Utilidades de servicio, incl. `cache.redis` |
| **package-utils** | `@reachu/utils` | `General`, helpers |
| **package-testing** | `@reachu/testing` | Harness de tests |

> **BD compartida, NO database-per-service.** Todos los servicios apuntan a la **misma MySQL**;
> las entities/repos viven en `@reachu/database` y el **schema canónico (~54 entities) +
> migraciones** vive en `base-api`. Los microservicios no declaran `@Entity` propias.

---

## 3. Stack común (todos los microservicios de dominio)

Son **el mismo esqueleto NestJS**, clonado del mismo starter:

- **NestJS** + **TypeORM** + **MySQL** (Azure Database for MySQL).
- **Estructura idéntica:** `src/main.ts` → `app.module.ts` → `modules/<dominio>/{controllers,services,...}` + `config/` + `database/` + `shared/` + `utils/`.
- **Bootstrap idéntico** (`main.ts`): global prefix = `BASE_PATH`, Swagger en `/<basePath>/docs`, `bodyParser` 50mb, CORS abierto, logger DataDog opcional (`expressLogger` si hay `DATADOG_API_KEY`).
- **Config estática vía clase:** `AppModule` expone `static port/basePath/docUrl/dataDogApiKey`, poblados desde `ConfigService` (`@nestjs/config` con `ignoreEnvFile: true` — **la env llega del entorno/K8s, no de un `.env` versionado**; por eso no hay `.env.example`).
- **HTTP client:** `@nestjs/axios` + `axios-rate-limit`.
- `test/`, `__mocks__/`, `requests/`, `Dockerfile`, `charts/` (Helm) en cada repo.

**Excepciones:**
- `base-api` — **Express puro** (`.js`+`.ts` mezclados), routers en `src/router/`, entities en `src/entity/`, `cron/`, `migrations/`, `subscribers/`, `listeners/`, `connectors/`. El más viejo y grande.
- `graphql` (`vio-graphql`) — **Apollo Server** + `type-graphql`, no NestJS. `src/{Modules,Infra,app.ts}`, `axios-retry` + `express-timeout-handler` para hablar con los microservicios de abajo.

---

## 4. Cómo se comunican los servicios (runtime)

**Predominantemente HTTP service-to-service por URL en env, con token compartido** — pero
**NO es todo HTTP**: `orders` y `products` **consumen Azure Service Bus** (con DLQ) para
creación de orden e import/publish cross-canal (cada uno arrastra además un consumer AWS SQS
muerto, migración sin limpiar). `base-api` sí es HTTP puro.
Cada servicio conoce a los demás por variables de entorno (de `shopcart/config.keys.ts`):

```
PRODUCTS_MICROSERVICE_URL      ORDERS_MICROSERVICE_URL
EXTENSIONS_MICROSERVICE_URL    TRACKING_MICROSERVICE_URL
SHOPCART_MICROSERVICE_URL      API_MICROSERVICE_URL / API_BASE_HOST
MICROSERVICE_TOKEN   ← bearer compartido para llamadas internas
```

En prod esas URLs resuelven a paths bajo `msrvc.vio.live` (ver prod-plan). Encima,
**`graphql` (`graph-ql.vio.live`) es el agregador** que el frontend/SDKs consumen, y
que fanea a los microservicios REST.

**Ejemplo de flujo (checkout):** `shopcart` orquesta — pide precios/stock a `products`,
aplica `discount`, **crea la orden en `orders` (estado PENDING/PROCESSING) ANTES del cobro**,
e **inicia el pago él mismo** (Stripe/Klarna/Vipps/Apple/Google Pay; Klarna/Vipps por HTTP
directo, no SDK). El pago se confirma **por webhook**. `payment-processors` **NO inicia
pagos ni recibe webhooks** — solo hace capture/cancel/refund post-autorización.
`orders` emite `order:paid` → dispara fulfillment en Shopify/Woo/Magento.

**Canales de venta externos (import/export de catálogo):** `extensions` (bigcommerce/
magento/shopify/woo) + `api-microservice` (channel/connection/listings) + `template`
(data-mapping/webhook). Más los connectors legacy en `base-api/src/connectors/`
(`shopifyConnector`, `magentoConnector`, `klarnaConnector`, `vippsConnector`,
`afterShipConnector`). El plugin externo [`vio-woocommerce-sync`](./woocommerce-sync.md)
consume esta capa.

---

## 5. Deployment (resumen — detalle en infra docs)

- **Contenedores:** cada repo tiene `Dockerfile` + Helm chart en `charts/<svc>/`.
- **Registry:** Azure Container Registry `reachuqa2.azurecr.io/<svc>:latest` (QA; prod tendrá el suyo). IaC en repo **`vio-infra-tf`** (Terraform), config K8s en **`vio-kubernetes-config`**.
- **Orquestación:** **Azure Kubernetes Service (AKS)**, `replicaCount: 2`, HPA, `Service` ClusterIP puerto 80 → `targetPort 8000`.
- **DB:** Azure Database for MySQL. El pool en `database.service.ts` está tuneado para AKS + Azure (connectionLimit 10, keepAlive, SSL `rejectUnauthorized:false`, timeouts anti-zombie) — comentarios en español de esa pelea ("50 es demasiado alto para AKS + Azure MySQL"). Los commits recientes "fix timeout" / "re estructurar la conexión a la bd" son de esto.
- **Cache:** Redis (vía `@reachu/service` → `cache.redis`), invalidación por match de keys atada a TypeORM.
- **Ingress/TLS:** Istio VirtualService + cert-manager/ACME (ver `handoff/api-commerce-debugging.md`).
- **Región prod:** `norwayeast`, resource group `rg-vio-commerce-prod` (infra nueva, independiente de `reachu-prod`).
- **Observabilidad:** DataDog (opt-in por `DATADOG_API_KEY`).

---

## 6. Inventario relacionado (NO clonado — fuera del backend core)

Otros repos de `vio-live` que orbitan commerce pero no son el backend de runtime:

- **Canal-específicos / plugins:** `vio-woocommerce-sync`, `woo-vio`, `vio-shopify-sync`, `vio-shopify-seller`, `vio-plugin-export`, `bigcommerce-app`, `embed-commerce-wordpress-plugin`, `google-merchant-feed`, `web-scraping`.
- **Infra:** `vio-infra-tf` (Terraform), `vio-kubernetes-config`.
- **Frontends / SDKs:** `admin-panel`, `webapp`, `vio-web-sdk`, `react-native-sdk`, `flutter-sdk`, `sdk`, `vio-docs`.
- **Automatización / QA:** `vio-automatize`, `cypress`.

---

## 7. Gotchas / notas para el próximo que entre

1. **Nombres mienten:** `outshifter`/`reachu`/`vio` = lo mismo. `vio-payment-processors` se
   llama internamente `vio-extensions` (ver ⚠️ §2). No confiar en el nombre, leer los módulos.
2. **No hay `.env.example`** — la config entra por entorno (K8s ConfigMaps/Secrets),
   `ignoreEnvFile: true`. Para correr local hay que fabricar el env a mano.
3. **Necesitas el registro `@reachu` privado** para instalar (`package-*` repos publicados
   ahí, v1.0.212). Sin token, `yarn install` falla.
4. **Duplicación monolito↔microservicio** por la migración en curso — la fuente de verdad
   de un dominio puede ser el router viejo de `base-api` O el microservicio nuevo. Verificar
   cuál está ruteado en prod antes de tocar.
5. **Rama de trabajo = `develop`** en todos (no `main`/`master`).
6. **MySQL, no Postgres** aquí (ojo: el resto de Vio backend / socket-server usa Neon/Postgres — no mezclar).
7. **Dos gateways:** `base-api` (REST legacy, Express) y `graphql` (Apollo). El nuevo
   frontend debería ir por GraphQL; lo legacy sigue en base-api hasta terminar de migrar.
