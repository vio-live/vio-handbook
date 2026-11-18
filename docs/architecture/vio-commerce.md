---
title: "Vio Commerce — arquitectura del código"
last-updated: 2026-11-18
owner: angelo
status: live
---

# Vio Commerce — Arquitectura del código

**Última revisión:** 2026-10-14 (Miguel: añadido el micro de campañas, 14º servicio, y retirado `msrvc-p`). Deep-dive original de los 13: 2026-07-01 (Claude)
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
| **vio-campaigns-microservice** | *(ninguno: host propio)* | **Campañas y surfaces** (ADR-0025 a 0029), la reconstrucción de lo que hoy vive en vio-backend. Creado el **13/10/2026** |

> **El de campañas es distinto de los otros 11** y conviene tenerlo claro:
> - **Se expone al público** en `campaigns.vio.live` / `campaigns-staging.vio.live`, porque lo
>   llaman los SDKs, Vev y el webapp. Los demás solo son internos.
> - **Hace su propia auth**, sin pasar por el middleware: token de Firebase para el dashboard y
>   key de surface para el SDK.
> - **Rutas internas `/internal/*`** (desde el 17/11/2026; en QA y en prod con la próxima release): solo desde
>   dentro del cluster. Como el micro es público, `ClusterOnlyGuard` devuelve 403 `INTERNAL_ONLY` a lo que trae
>   cabeceras del Gateway (`x-forwarded-for`, `x-envoy-external-address`…). La primera es
>   `POST /internal/discount-codes/check`, el chequeo diario de los códigos de campaña: añade al canal el regalo
>   de un cupón y avisa en el dashboard. La llama el CronJob `campaigns-discount-check` (07:00 UTC en QA, 06:00 en
>   prod; [vio-campaigns-microservice#37](https://github.com/vio-live/vio-campaigns-microservice/pull/37)).
> - **Su rama de prod es `main`** (como `collection`), no `master`.
> - **Su deploy hace rolling update de verdad** (tag por número de run, `maxUnavailable: 0`), en
>   vez del `image.tag=latest` + `kubectl delete pod` de los demás, que cuesta ~1 min de 503
>   ([lección](../lessons/las-replicas-no-evitan-el-corte-del-deploy.md)).
>
> Config e infra: [micro-campanas-infra](../handoff/micro-campanas-infra.md). Restaurarlo tras una
> pérdida de cluster: paso 6 bis de [cluster-restore](../playbooks/cluster-restore.md).

**`msrvc.vio.live` / `msrvc-p.vio.live` ya no existe** (verificado 2026-10-14: sin registro en
Cloudflare ni Gateway). Los 11 micros son hoy **solo internos**; se les llega desde base-api y
graph-ql dentro del cluster.

> **Tokens de Shopify de las apps custom (desde 2026-09-24).** Para las tiendas listadas en
> `VIO_CUSTOM_APPS` (`.env` de `extensions`, blob de Azure), `extensions` **no guarda ni
> renueva** el token: se lo pide al app custom del cliente (`GET /internal/token`, secreto
> `CRON_SECRET` del proyecto de Vercel), lo cachea en Redis hasta dos minutos antes de vencer
> y reintenta una vez ante un 401. El app renueva el suyo cuando le quedan < 35 min y además
> lo empuja cada 10 min (copia de respaldo en `shopify_connection`). Contrato y alta de
> clientes: [playbook](../playbooks/shopify-app-custom-por-cliente.md); por qué:
> [lección](../lessons/robusto-por-diseno-no-por-cadencia.md).

> **⚠️ extensions ≠ payment-processors (resuelto 2026-07-01).** Son **dos repos distintos**.
> `vio-extensions-microservice` = conectores de **canal** (bigcommerce/magento/shopify/woo).
> `vio-payment-processors-microservice` = **pagos** (stripe/klarna/vipps). OJO: el
> `package.json` de payment-processors se llama `vio-extensions-microservice` — es un
> artefacto de haber sido forkeado del starter de extensions. **No confiar en el `name`,
> mirar los módulos.**

### Kernel compartido — `@vio-/*` (ex `@reachu/*`, ver [ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md)) (cada uno es su propio repo `package-*`)

Publicados a un **registro npm privado**, consumidos por todos los microservicios. **Ojo:
hay drift de versión** — la mayoría en `1.0.212`, pero `extensions` en `1.0.219` y `api` en
`1.0.227`. No están alineados. Confirmado 2026-07-01 que viven como repos en `vio-live`:

| Repo | Paquete | Qué aporta |
|---|---|---|
| **package-config** | `@vio-/config` | Lectura/validación de configuración |
| **package-database** | `@vio-/database` | `Utils.getConnectionConfig()` — arma la conexión TypeORM (pool, entities, naming) centralizada |
| **package-definitions** | `@vio-/definitions` | Tipos/DTOs/contratos compartidos entre servicios |
| **package-logger** | `@vio-/logger` | `logger` + `expressLogger` (DataDog) |
| **package-service** | `@vio-/service` | Utilidades de servicio, incl. `cache.redis` |
| **package-utils** | `@vio-/utils` | `General`, helpers |
| **package-testing** | `@vio-/testing` | Harness de tests |

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
pagos ni recibe webhooks** — solo hace capture/cancel/refund post-autorización, con la
cuenta del vendedor del carrito (`cart.seller ?? cart.user`, ADR-0028; en Stripe gana el
`sellerId` grabado en el pago; rama `feature/brand-publisher`, 2026-10-13, sin mergear).
`orders` emite `order:paid` → dispara fulfillment en Shopify/Woo/Magento. Y cuando una
orden **deja de valer dinero** (cancelación entera o por líneas, devolución total o parcial),
`orders` se lo cuenta al **colector de analytics** con el token interno — `order_cancelled` /
`order_refunded`, `event_id` UUID v5 determinista, fire-and-forget; variables
`ANALYTICS_EVENTS_URL` + `ANALYTICS_INTERNAL_TOKEN`, sin ellas no emite
([ADR-0036](../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md),
orders #28, 2026-10-20).

**Canales de venta externos (import/export de catálogo):** `extensions` (bigcommerce/
magento/shopify/woo) + `api-microservice` (channel/connection/listings) + `template`
(data-mapping/webhook). Más los connectors legacy en `base-api/src/connectors/`
(`shopifyConnector`, `magentoConnector`, `klarnaConnector`, `vippsConnector`,
`afterShipConnector`). El plugin externo [`vio-woocommerce-sync`](./woocommerce-sync.md)
consume esta capa.

---

## 5. Deployment (resumen — detalle en infra docs)

### Ramas y entornos — hay DOS, no tres (verificado 2026-09-08)

| Rama | Entorno | Clúster / Registry |
|---|---|---|
| `develop` | El que el equipo llama QA **y también staging** | AKS `kubernetesqa` (RG `qa`) · ACR `reachuqa2` |
| `main` / `master` | Producción | AKS `vio-commerce-prod` (RG `rg-vio-commerce-prod`) · ACR `reachuprod2` |

**Mergear a `develop` es desplegar.** El paso de Deploy no espera a que los pods estén
sanos, así que hay que mirar el pipeline y los pods después.

⚠️ **El tercer nivel es ficción.** El `deploy.yml` de cada servicio tiene cableado
`pre-develop`→STAGING con su juego completo de secretos `*_STAGING`, pero:

- La rama `pre-develop` existe en **1 de 8 repos** (products), abandonada el 2026-08-20 y
  34 commits por detrás de develop.
- **La infraestructura de staging no existe.** En la suscripción sólo hay dos AKS
  (`vio-commerce-prod`, `kubernetesqa`) y dos ACR relevantes (`reachuprod2`, `reachuqa2`).

Es un camino armado que nadie vigila: si alguien crea una rama `pre-develop` en cualquier
repo, el pipeline dispara y despliega con esos secretos — a ninguna parte si están vacíos,
o **a donde apunten** si alguien los rellenó. Conviene borrar ese camino de los workflows.

Nota de vocabulario: el host `graph-ql-staging.vio.live` dice *staging* pero pega en
`kubernetesqa`. Son el mismo sitio.

### ⚠️ El registry vive en el chart, y difiere por rama

`charts/<svc>/values.yaml` lleva `image.repository`, y **difiere entre ramas a propósito**:

```
main:    repository: reachuprod2.azurecr.io/<svc>
develop: repository: reachuqa2.azurecr.io/<svc>
```

El paso de deploy es `helm upgrade --install ./charts/<svc>-0.1.0.tgz` **sin ningún
`--set image.repository`**, así que el registry sale tal cual del archivo versionado. Cada
merge `develop`→`main` depende de que alguien resuelva bien ese archivo; si gana la
versión de develop, **producción intenta tirar imágenes del registry de QA**. Hay además
un `.tgz` binario del chart que git no puede fusionar de forma sensata.

Arreglo limpio, aún no hecho: pasar `--set image.repository=$ACR/<svc>` en el `helm
upgrade` (el ACR ya está en una variable de entorno del workflow) y dejar el chart
idéntico en las dos ramas. Ver
[`lessons/config-de-entorno-en-archivo-versionado.md`](../lessons/config-de-entorno-en-archivo-versionado.md).

### Lo demás

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
5. **Rama de trabajo = `develop`** en todos (no `main`/`master`). Y `develop` **es** el
   entorno compartido: mergear es desplegar. Ver §5.
6. **MySQL, no Postgres** aquí (ojo: el resto de Vio backend / socket-server usa Neon/Postgres — no mezclar).
7. **Dos gateways:** `base-api` (REST legacy, Express) y `graphql` (Apollo). El nuevo
   frontend debería ir por GraphQL; lo legacy sigue en base-api hasta terminar de migrar.
8. **Los channels sirven una foto, no la colección en vivo.** GraphQL (`Channel.GetProducts`,
   lo que ve Vev) lee `channel_user_products`, que products-ms rehace solo cuando alguien
   llama `POST {PRODUCTS}/channel-process/collections/update { collectionsId }`. Cualquier
   escritura que cambie qué productos tiene una colección o quién la ve (items, compartir,
   des-compartir) tiene que proyectar; en collection-ms lo centraliza
   `ChannelProjectionService` (2026-10-15, ver
   [journal](../journal/2026-10/2026-10-15-collection-foto-coleccion.md)). Además
   `channel_group` referencia `collection_shared` **por id**: des-compartir es soft-delete y
   re-compartir debe **restaurar** esa fila, no crear otra.

---

## 8. Imágenes de producto: variantes de tamaño sin redirecciones (desde 2026-11-18)

**Qué pasaba.** El API (`vio-api-microservice`, channel products) devolvía cada imagen como
`<url>?size=<size>` (el gateway GraphQL pide `large` por defecto). Para una imagen de nuestro
contenedor eso eran **dos redirecciones** antes del primer byte:

```
container.vio.live/.../product-images/<id>.jpg?size=large
  308  Cloudflare (Redirect Rule `imageResize`, ver infrastructure/cdn-container-cloudflare.md)
  302  api-ecom.vio.live -> resizer de base-api (genera la variante si falta y la GUARDA)
  200  container.vio.live/.../product-images/<id>large.jpg
```

Medido en prod el 2026-11-18 (Kondomeriet, 20 imágenes, `?size=large`): 2 redirecciones en
todas, **1,66 s** de media por imagen, y 31,8 KB por `large` frente a 8,2 KB del original. Las
variantes sólo existían si alguien las había pedido: de 235 imágenes, 49 tenían `large`,
3 `medium`, 1 `thumbnail`. Y las que existían estaban **recortadas a cuadrado y ampliadas**
(`resize(w, h)` con el `fit: cover` por defecto): un original de 400x484 salía como `large`
de 1024x1024.

**Cómo funciona ahora.**

| Pieza | Qué hace |
|---|---|
| `vio-base-api` `src/service/imageVariants.ts` | Fuente de verdad: tamaños (`thumbnail` 150, `medium` 500, `large` 1024), nombre del blob (`<base><size><ext>`), render (`fit: 'inside'`, `withoutEnlargement`, `rotate()` por EXIF). Si sharp no puede con la imagen, la variante es **copia del original**: nunca un 404. |
| `vio-base-api` `POST /upload/:productId` | Sube el original y escribe las 3 variantes **antes** de devolver la URL. |
| `vio-products-microservice` `helpers/image-variants.ts` | Espejo del anterior (mantener los dos iguales). `uploadToAzure(..., { variants: true })` en `centralizedImages` (feeds/Magento) y `reviewImages` (webp/heic). |
| `vio-api-microservice` `transform/image-size-url.ts` | `sizedImageUrl`: imágenes bajo `${AZURE_STORAGE_URL_REACHU}/${AZURE_BUCKET}/` en `product-images/` o `products/`, jpg/jpeg/png/webp y sin query → URL directa de la variante (y el original para `full`). Todo lo demás (Shopify, otras carpetas, gif/svg, URLs con query, o si falta una de las dos env) sigue con `?size=`. |
| Resizer de base-api + regla de Cloudflare | Siguen igual, para las URLs viejas con `?size=` (cachés, clientes antiguos). No hace falta tocar Cloudflare. |

**Orden obligatorio en cada entorno:** base-api (y products) desplegados → backfill → api. Si
el API publica la URL directa antes de que exista la variante, la tienda ve una imagen rota y
**Cloudflare cachea el 404** unos minutos. Por lo mismo: **nunca hacer HEAD/GET a una variante
que todavía no existe** para "comprobar"; comprobar con el SDK de Azure dentro del cluster.

**Backfill** (`vio-base-api` `src/scripts/backfillImageVariants.ts`, idempotente):

1. Lista de URLs referenciadas (lectura): `select distinct url from image where deleted_at is null
   and (url like '<base>product-images/%' or url like '<base>products/%')`. No listar el
   contenedor entero: cada sync de feed sube blobs nuevos y la mayoría están huérfanos (QA:
   ~125k blobs, ~17k referenciados).
2. **Pod propio** con la imagen de base-api (por digest), `sidecar.istio.io/inject: "false"`,
   1,5 GiB de límite, `command: sleep`; la lista entra por stdin a `/tmp/list.txt`.
   **Nunca** `kubectl exec` del backfill en el contenedor que sirve tráfico: en QA (512Mi)
   tumbó base-api por OOM.
3. Ensayo: sin `--apply` (sólo cuenta) y comprobación de solo lectura de que los originales
   existen. Después `node dist/scripts/backfillImageVariants.js --apply --overwrite
   --names-file /tmp/list.txt --concurrency 6`. `--overwrite` regenera las viejas recortadas.
4. Con `failed=0`, desplegar el API. Borrar el pod.

Resultados del 2026-11-18: QA 17.261 originales → 51.777 variantes, 6 copias, 0 fallos;
prod 30.143 originales → 90.429 variantes, 0 copias, 0 fallos (~12 min a 6 en paralelo). En QA, tras el API: 0 redirecciones y 0,22–0,41 s de media por
imagen (antes 2 redirecciones y 1,4–2,1 s). Prod, tras el API (Kondomeriet, 235 imágenes): 0 redirecciones y 200 en los tres tamaños;
media por imagen 0,24 s `thumbnail` (2,8 KB), 0,45 s `medium` (13,5 KB), 0,47 s `large` (14,6 KB),
frente a 2 redirecciones, 1,66 s y 31,8 KB de antes.

**Gotchas vistos el mismo día.**

- **Cloudflare sirve un rato la variante vieja.** `--overwrite` reescribe el blob, pero si
  Cloudflare ya lo tenía en caché (variantes recortadas que generó el resizer antiguo) sigue
  sirviendo esa copia hasta que caduca. Es una imagen válida, sólo más pesada.
- **Vev (Kondomeriet) ya construía `<n>large.jpg` por su cuenta** (`directImage`, en
  `src/components/kondomeriet-perf.ts`) antes de que existieran las variantes: las imágenes de la
  galería sin `large` dieron 404 (lo vio Alan a las 17:27 UTC) hasta que el backfill las generó.
  Ahora el API ya devuelve la URL directa, así que `directImage` la deja tal cual; su comentario
  de que `medium` no existe ya no es cierto.
- **Cada sync del feed sube blobs nuevos** (`product-images/<Date.now()>.jpg`): el catálogo cambia
  de URLs cada pocos minutos. Por eso la lista se saca de la base justo antes del backfill, y por
  eso products tiene que escribir las variantes al subir.

**Pendiente / ideas.** Si el original ya cabe en la caja, `medium`/`large` son una recodificación
~5 % más pesada que el original (se podría guardar el original tal cual). El SDK pide `large` para
tarjetas donde `medium` bastaría. Las respuestas cacheadas (Redis del API/gateway, `useCache`)
conservan las URLs viejas con `?size=` hasta que se refrescan; siguen funcionando.

PRs: base-api #72 #73 (release #74), products #70 (release #71), api #80 (release #81).
