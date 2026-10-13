---
title: "Plan de ejecución — campañas y surfaces en Commerce"
last-updated: 2026-10-13
owner: angelo
status: draft
---

# Plan de ejecución — campañas y surfaces en Commerce

> **En revisión.** Lo revisan Miguel y un agente revisor (2026-10-13). Los comentarios van
> en la sección [Revisión](#revisión) al final, o directo en Slack a Angelo.

## De dónde sale

- [ADR-0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md): campañas y
  surfaces se reconstruyen en un microservicio nuevo de Commerce, y se retira lo que no se usa.
- [ADR-0026](../decisions/0026-brand-publisher-channel-surface.md):
  - **Brand:** catálogo, pagos y markets.
  - **Publisher:** channels (de una sola brand por ahora), surfaces y campañas.
  - **Checkout:** cobra la brand de los productos.
- [ADR-0027](../decisions/0027-servicio-de-campanas-contrato-y-slots.md):
  - **Contrato:** mismas rutas en `api.vio.live` y `/v2/mobile/config` compatible.
  - **Campañas simultáneas:** se reparten por slots livianos.
  - **Plataformas:** web snippet, custom web, Vev, apps y TV.
- Audit y modelo completo:
  [campanas-y-surfaces-en-commerce](../architecture/campanas-y-surfaces-en-commerce.md).

## Reglas de ejecución

- **Ramas:** `feature/<slug>`, la misma rama en cada repo que toca una feature, con un PR
  por repo. Se trabaja en worktrees (`~/vio-commerce/worktrees/<repo>-<slug>`) para no pisar
  las ramas locales de nadie.
- **Push y merge:** los PRs a repos de código se abren con OK de Angelo
  ([ADR-0001](../decisions/0001-no-auto-merge.md)) y se mergean con su OK explícito
  ([ADR-0015](../decisions/0015-merge-delegado-con-ok-explicito.md)).
- **Kernel:** un cambio en `package-database` necesita OK de Angelo, y la release va con los
  7 paquetes juntos ([ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md)). Las migraciones
  se corren **antes** de desplegar los micros.
- **Datos de pago:** las filas de `payment_method` **no se mueven ni se recrean**. Los
  reembolsos de órdenes viejas, las URLs de webhook de Adyen (`{ref}` = id de la fila) y
  los secretos de Vipps y Kustom dependen de ellas.
- **Orden de deploy:** backend antes que front. En el middleware, las bajas van al final.

## Fases

Estado: ⬜ pendiente · 🟡 en curso · ✅ hecho · ⏸ bloqueado.

### F0 — Fixes urgentes (aprobados el 2026-10-13)

| # | Qué | Repo | Estado |
|---|---|---|---|
| 0.1 | `disconnectShopifySalesChannel` hace `softDelete(userId)`, que borra la `shopify_connection` cuyo **id** coincide con el userId (puede ser la de otro merchant). La propia la borra extensions `deleteAccount`. vio-sync lo llama al desconectar. | users: [#19](https://github.com/vio-live/vio-users-microservice/pull/19) (develop), [#20](https://github.com/vio-live/vio-users-microservice/pull/20) (master) | 🟡 PR abierto |
| 0.2 | `GET /api/channel/user/admin/by-shopify-url` no tiene auth y devuelve la `shopifyConnection` con `accessToken`/`refreshToken`. Se arregla en dos lados: api solo selecciona ids, y base-api pide `verifyToken` + `verifyAdminUser` y codifica el `shop`. No hay llamadores en ningún repo. | api: [#42](https://github.com/vio-live/vio-api-microservice/pull/42)/[#43](https://github.com/vio-live/vio-api-microservice/pull/43); base-api: [#30](https://github.com/vio-live/vio-base-api/pull/30)/[#31](https://github.com/vio-live/vio-base-api/pull/31) | 🟡 PR abierto |

### F1 — Mediciones (antes de migrar o borrar datos)

✅ **Hechas por Miguel el 13/10**, desde un pod de `users` de cada cluster, sin abrir firewalls
(journal `2026-10-13.md`). Resultados:
- **Consulta 1:** una sola cuenta con conflicto (1295).
- **Consulta 4:** **0 víctimas** del `softDelete(userId)`, en QA y en prod.
- **Consulta 6:** 474 pares en QA y 4 en prod (cuentas 1295 y 1300).
- **Consulta 7:** 66 brands en QA (152 ms) y 0 en prod (43 ms).
- El rol con id 3 está libre y no existen tablas `surface*`.
- **Escala:** prod tiene 36 usuarios y 0 `payment_method`; QA es unas 15 veces más grande.
- Pendiente: las consultas 2, 3 y 5 (channels de tienda, conexiones de reseller y liveshow).

Son de solo lectura, en la MySQL de QA y de prod; las corre Angelo con el `.env` del kernel.
Las consultas están en el [journal del 2026-10-13](../journal/2026-10/2026-10-13-campanas-en-commerce.md).
Miden:

1. Los conflictos de encendidos de pago por business (insumo de la unión).
2. Los channels 2/5/11 vivos, sus keys y sus órdenes de los últimos 90 días.
3. Las conexiones Shopify de reseller que tienen token (alcance de 0.2).
4. Las candidatas a víctima del `softDelete(userId)` (alcance de 0.1).
5. Las filas de `campaign`/`component` de liveshow.
6. Los métodos encendidos sin credencial propia activa, es decir, que hoy cobran con la cuenta de Vio (insumo de ADR-0028).
7. Las brands que venden solo por channels ajenos (antes de migrar; mirar también cuánto tarda).

Además, **Miguel** saca el `access.log` de nginx de las VMs de Oracle para confirmar que nada
fuera de `/v2/mobile/config` tiene tráfico real.

### F2 — Ajustes de Commerce (rama `feature/brand-publisher` en cada repo)

| # | Qué | Repo | Depende de |
|---|---|---|---|
| 2.0 🟡 | Middleware: PR [#10](https://github.com/vio-live/vio-middleware-microservice/pull/10) a develop, falta probarlo en QA y `@vio-/service validateApiKey`: resolver el ChannelUser por su FK `user_channel_api_key`, no por el tipo de channel. Exención de suscripción para cuentas Publisher ([ADR-0028](../decisions/0028-orden-fallback-suscripcion-y-corte.md)). | middleware, package-service | — (la exención depende de 2.2) |
| 2.1 🟡 | (PR draft [package-database#17](https://github.com/vio-live/package-database/pull/17). Mediciones y comprobaciones hechas, revisión de Miguel aplicada (`77acd39`, `group_concat_max_len`); falta el OK de Angelo; `e538ba7`: columnas `payment_*` y `payment_*_use_vio_account` en `user_settings`, `cart.seller_id` y rol Publisher con id 3 (`StaticData.RoleId`); backfill idempotente validado en MySQL 8.0.21 local. Resuelto en `09e3de5`: la unión cuenta también los channels ajenos que venden productos de la brand. Antes de migrar, correr la consulta 7 del journal.) **Va en la misma release del kernel que las tablas del micro (3.2), por [ADR-0029](../decisions/0029-corte-por-dns-keys-de-surface-y-nombres.md).** En `UserSettings`: columnas de encendidos de pago (stripePaymentIntent, stripePaymentLink, klarna, vipps, kustom, qliro, walley, nexi, adyen, googlePay, applePay) y un flag "cuenta de Vio" por método. Migración: encendido = unión ∩ credencial propia; encendido sin credencial propia = encendido con el flag marcado, más un listado para revisión (ADR-0028). Fila de rol **Publisher**. Campo de vendedor en el carrito. | package-database | F1.1 + OK |
| 2.2 | Persistir el tipo de cuenta (Brand/Publisher) en el alta (`doSave`, hoy solo pone el claim) y rellenar las cuentas existentes desde los claims. `/api/users/me` devuelve `accountType` y `features`. | users | 2.1 |
| 2.3 | **Incluye el reapunte de vio-analytics a MySQL (Miguel, cambio de código; ADR-0029).** `getAvailablePaymentMethods` lee los encendidos de la **brand**. Endpoint nuevo para los encendidos de la cuenta, que invalida las caches de todos sus channels. El settings del channel se queda sin pagos (markets, condiciones, email). **Una key por channel** (hoy es una por usuario y tipo). Se borra la propagación a `VIO_BACKEND_URL` y se arreglan los bugs de `postUptadeSettings`. | api | 2.1 |
| 2.4 🟡 | (Primera parte en el PR [#87](https://github.com/vio-live/vio-shopcart-microservice/pull/87) a develop, falta probarlo en QA: `sellerOfCart` en todos los caminos y el `userId` del cliente ignorado. Claude verificó que graphql y base-api mandan el dueño de la key, igual a `cart.user`, en create y en pagos.) Una sola fuente de vendedor para init, capture, refund y webhooks: el campo del carrito, y si no existe, `cart.user`. El campo se llena con la brand de los productos al crear el checkout. Se acaba el `userId` que manda el cliente. Los `orders/save` siguen con reseller = publisher y mandan `channelUserId`. Se valida del lado del servidor que el método esté encendido. | shopcart | 2.1, 2.3 |
| 2.5 | `ChannelDTO.settings` sigue lleno (desde la brand) para no romper el schema de los SDKs. | graphql | 2.3 |
| 2.6 | Proxies y docs de los endpoints nuevos de encendidos. | base-api | 2.3 |
| 2.7 | Settings › Payments gana los encendidos. El detalle del channel muestra los pagos heredados en solo lectura. "Channel" pasa a ser grupo de productos, y la cuenta "Channel" se llama **Publisher**. | webapp | 2.3, 2.6 |

### F2.1/F3.2 — Release del kernel 1.0.269 (13/10)

✅ El PR #17 está mergeado (`6c1b3c6`) y publicó **`@vio-/database` 1.0.269** (tag `v1.0.269`). El
gate de migraciones frenó el bump automático, como se esperaba.

**Pasos que siguen. Solo QA; prod no se toca.**
1. **Migraciones en la base de QA (Miguel)**, de a una y en este orden, desde
   `package-database` en `develop` (o desde el pod, como en las mediciones):
   - `DB_MIGRATION_FILE=1791899686000-brand-publisher.ts yarn migration:execute`
   - `DB_MIGRATION_FILE=1791899686001-brand-publisher-payments-backfill.ts yarn migration:execute`.
     **Guardar el log:** trae la consulta 7 y el listado de "cuenta de Vio" por método. En QA
     son unos 474 pares, y es lo esperado.
   - `DB_MIGRATION_FILE=1791900705000-surface-tables.ts yarn migration:execute`
2. **Comprobar:** `SELECT * FROM role WHERE id_role = 3` (tiene que dar Publisher) y
   `SHOW TABLES LIKE 'surface%'` (8 tablas), más `brand_profile`.
3. **Recién después, el bump a QA.** `kernel-bump.yml` de cada micro **pushea directo a `develop`**
   y redespliega los 11 en QA. Se dispara con un `repository_dispatch` `kernel-published`
   con `version=1.0.269` a cada uno de los 11 repos (la lista está en `kernel-release.yml`). Lo
   hace Claude cuando Miguel confirme el paso 1. `api` en QA tiene 1 réplica: corte de uno o
   dos minutos.

### F3 — Microservicio `vio-campaigns-microservice`

**División (Angelo, 2026-10-13): Miguel se encarga de la configuración y la infra del micro;
Claude, del código.** La lista detallada para Miguel está en
[micro-campanas-infra](./micro-campanas-infra.md).

**Miguel: configuración e infra.** Se toma `collection` como referencia, porque es el micro
más chico. No hay repo starter, y `vio-template-microservice` **no** es un template: es el
servicio de mapeo de integraciones.

| # | Qué |
|---|---|
| 3.1a | Crear el repo `vio-live/vio-campaigns-microservice` (privado), con ramas `develop` (QA) y `main` (prod). |
| 3.1b | `Dockerfile`, `charts/campaigns` (Service ClusterIP 80→8000; 50m/192Mi; 1 réplica en QA y 2 en prod; registry por `$ACR`, como el fix de middleware #8), `.github/workflows/deploy.yml` y `kernel-bump.yml`. |
| 3.1c | Secrets de GitHub del repo por entorno: `ACR_*`, `SV_APP_ID/PASSWORD/TENANT_ID_*`, `ENV_FILE_*`, `AZ_STORAGE_*`, `YARN_BUILD/START_*`, `APP_NAME_*`, `APP_PREFIX`, `NPM_CONTENT_FILE`. |
| 3.1d | Variables nuevas en el `.env` compartido (`env-file-microservices`, QA y prod): URL interna de api (métodos de pago), orígenes CORS del dashboard y URL pública de GraphQL. Firebase admin y la DB ya vienen por el kernel. |
| 3.1e | **Exposición pública.** A diferencia de los otros 11 micros, a este lo llaman directo los SDKs, Vev y el webapp. Necesita un `Gateway` + `VirtualService` de Istio (en `vio-kubernetes-config`), DNS en Cloudflare y TLS. Propuesta de hosts: `campaigns.vio.live` (prod) y `campaigns-qa.vio.live` (QA). |
| 3.1f | Sumar el micro a la lista de dispatch de los 7 `kernel-release.yml`. |
| 3.1g | En el corte (F6): un `location` por cada ruta portada en el nginx de Oracle de `api.vio.live`, hacia el host nuevo (ADR-0028). |

**Claude: código.**

| # | Qué |
|---|---|
| 3.2 🟡 | (En el mismo PR draft #17, `535f5b1`: las 9 tablas con CHECK de fechas, UNIQUE de default por surface y de slot; validadas en MySQL local, up/down idénticos.) Entidades en `package-database`, familia `surface_*` (ADR-0029): `surface`, `surface_platform`, `surface_channel`, `surface_slot`, `surface_campaign`, `surface_campaign_sponsor`, `surface_campaign_slot`, `brand_profile`. Van en **la misma release que 2.1**. OK de Angelo dado el 13/10 para trabajarlo en una rama local, sin publicar ni migrar hasta revisarlo. |
| 3.3 ✅ | (Código hecho en local: `~/vio-commerce/worktrees/campaigns-microservice`, rama `feature/app`; 117 tests; [journal](../journal/2026-10/2026-10-13-micro-campanas-codigo.md). Espera el repo de Miguel y el adaptador TypeORM.) Auth propia: token de Firebase para el dashboard y key de surface para el SDK, sin pasar por el middleware. |
| 3.4 | Rutas iguales a las de vio-backend: `/api/client-apps…`, `/api/campaigns…`, `/api/sponsors…`, `/api/auth/me` (reexpone `accountType` de users), `/api/sponsor/me`, `/v2/mobile/config` (compatible + `campaigns[]`), `/v2/mobile/campaigns/:id/components`, `/v2/mobile/components/manifest` (con `platform` opcional), `/v2/web/brands`. El estado de campaña se calcula en un solo lugar, y se valida siempre que la campaña sea de la surface de la key. Los métodos de pago se le piden a api, con cache. |
| 3.5 | Tests unitarios y de contrato contra las respuestas actuales de vio-backend. **Para salir de F3:** `/v2/mobile/config` de la campaña Lyko en el editor de Vev, idéntico byte a byte al de vio-backend (ADR-0029). |
| 3.6 | Las rutas de vio-backend que no se portan responden **410** con un JSON explícito, desde un catálogo único (ADR-0029). |

### F4 — Front (webapp)

🟡 Desde el 2026-10-13 hay un agente de front en la rama local `feature/brand-publisher` del webapp, sin push. Construye Surfaces y Campañas contra el contrato actual de vio-backend, que el micro mantiene. Lo nuevo de ADR-0027 queda detrás de un flag.

**Primer corte hecho** (4 commits locales, `87e746f`..`af2c39f`, sin push). Incluye las listas,
las altas y los detalles de Surfaces y Campañas, la nav por features y el flag `VIO_CAMPAIGNS_V2`.
Faltan las vistas de solo lectura para business y los Channels como grupos de productos. Ver el
journal `2026-10-13-front-commerce-surfaces-y-campanas`.

**Segunda tanda** (`705017c`..`c079a0a`, sin push; PR #50 lo actualiza el coordinador):
- matriz de visibilidad por tipo de cuenta;
- publisher exento de suscripción;
- orders del publisher en solo lectura;
- Getting started del publisher;
- UI V2 contra el micro, probada de punta a punta contra el micro en local.

La propuesta para los pasos 1 y 2 del publisher (conectar con una brand y armar su channel)
está en el journal `2026-10-13-front-commerce-acceso-por-tipo-y-v2`. ⚠️ Deja **F2.3 (una key
por channel) en el camino crítico** para publishers con más de una brand.


Pantallas de Surfaces (con plataformas y slots), Channels (grupos de productos de una
brand, a partir de Connection + colecciones), Campañas (sponsors, channels, fechas y
slots) y Mi marca (`brand_profile`).

### F4b — Visibilidad por tipo de cuenta y flujo del publisher (Angelo, 13/10)

La matriz está en [cuentas-y-capacidades](../architecture/cuentas-y-capacidades.md). Se avanza
paso a paso, **primero el publisher**:
- 🟡 **P1:** la matriz en el webapp (nav, rutas y Settings) con una sola función, y el publisher
  sin el bloqueo por suscripción.
- 🟡 **P2:** el "getting started" del publisher en el Dashboard (connection → channel → surface →
  campaña).
- 🟡 **P3/P4:** inventario y propuesta de Connections (pedir y aceptar acceso) y de Channels
  como grupo de productos de una brand. En v1 el channel se crea por debajo con tipo "Vio SDK"
  (10), para que su key pase el middleware.
- ⬜ **P5/P6:** surface ↔ channels y campaña con sponsor conectado. Llegan con el micro (flag
  `VIO_CAMPAIGNS_V2`).
- ⬜ **Backend:** F2.2 (tipo de cuenta guardado y guards). Depende de la release del kernel.

### F5 — Clientes

- **web-sdk:** un build IIFE/CDN para el tipo `web` (snippet) y el atributo `slot` en los
  `<vio-*>`.
- **Vev:** el slot en el bloque de Vio.
- **SDK nativo:** el manifest por plataforma (Miguel y Alan). Quitar
  `DynamicComponentsService` de liveshow y rotar la API key de Commerce que está escrita en
  el código de Swift y Kotlin.

### F6 — Corte

✅ Cierre inmediato de vio-backend (Miguel, 13/10): `api.vio.live` a lista blanca y el dashboard
viejo de staging cerrado, con el loop de Vev intacto.

Corte, según [ADR-0029](../decisions/0029-corte-por-dns-keys-de-surface-y-nombres.md):
- **Antes del corte:** exportar a un fichero las surfaces, keys y campañas de VG/Lyko y Aller
  (Miguel), e importarlas tal cual al micro.
- **Prod:** `api.vio.live` pasa por DNS (Cloudflare) al ingress de AKS, y el micro responde 410
  en las rutas no portadas. Nada de proxy en Oracle.
- **Staging:** split por path en el nginx de Oracle, donde vive el loop de Vev.
- Reapuntar vio-analytics (ya en 2.3).
- Apagar vio-backend y su `client/`.

### F6b — Keys de surface en el checkout (después del corte)

Objetivo de ADR-0029: el cliente lleva solo la key de surface, y las de channel son de catálogo
en solo lectura.
1. graphql, middleware y shopcart aceptan la key de surface en el checkout y resuelven del lado
   del servidor el channel y la brand de cada carrito.
2. Se actualizan el web-sdk, Vev y los SDKs.
3. Se les quita el checkout a las keys de channel.

### F7 — Retiro de Shopify, Woo y Magento como channels

En este orden:

1. Medir (F1.2).
2. Cortar las altas: `channel.enabled=false`, guard en `createChannelUser`, y los ids
   fijos en el código (`users:1899` y `extensions:2917`).
3. Borrar el código de tienda de reseller en extensions, orders, products, collection,
   users, base-api, api y el webapp.
4. Cambiar la matriz del middleware al final.
5. En el kernel, el drop de las FKs.

El rol de origen de catálogo (vio-sync, `EcomUser` y las conexiones) **no se toca**.

### F8 — Después

- Placements completos: biblioteca de templates y config por slot.
- Channels con varias brands, que necesitan un carrito por sponsor en el web-sdk y la brand
  al crear el carrito.
- Operadores y viewers.
- Comisión (`referralFee`).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Órdenes en curso o por reembolsar si cambia la cuenta PSP de un user | No mover filas de `payment_method`. Si hiciera falta, drenar durante los 7 días de la ventana del reconcile. |
| 401 global a keys de channel 2/5/11 | El middleware va al final de F7, después de medir. |
| Prod de Commerce por detrás de QA, y sin `PAYMENT_SECRETS_KEY` | Verificar el estado de prod antes de cada release (memoria de pagos, journal 2026-10-12). |
| `api` corre con 1 réplica y cada deploy corta | Desplegar fuera de horario y de a un servicio. |
| Sin tests en `getAvailablePaymentMethods` ni en `postUptadeSettings` | Escribir los tests antes del cambio (2.3). |

## Quién (propuesto)

| Persona | Qué |
|---|---|
| **Angelo** | Decisiones, mediciones, publish del kernel, OK de push y merge |
| **Claude** | **El código**: la app del micro (F3.2–3.5), los ajustes de F2 y los PRs |
| **Miguel** | Revisión del plan, `access.log` de Oracle, **toda la configuración e infra del micro nuevo** (F3.1a–g) |
| **Alan** | SDK nativo y overlay de Kotlin |

## Revisión

### Agente revisor (2026-10-13)

Hizo una revisión adversarial de los ADR-0025/0026/0027 y de este plan contra el código
(`origin/develop`/`main`). Claude verificó a mano los puntos marcados con ✔.

**Bloqueantes (resueltos el 2026-10-13 en [ADR-0028](../decisions/0028-orden-fallback-suscripcion-y-corte.md))**

Angelo decidió:
- **B1:** los publishers quedan exentos de la suscripción.
- **B2:** se permite la cuenta de Vio, pero solo como opción explícita.
- **B3:** el publisher es el reseller y la brand cobra.
- **B4:** staging sigue en Oracle y el corte empieza por prod.

| # | Hallazgo | Qué cambia en el plan | Decisión de Angelo |
|---|---|---|---|
| B1 ✔ (corregido) | *Corrección del agente de middleware (13/10): el join de `verifyTokenGraph` ya filtraba por la FK, y `validateApiKey` del kernel también. Lo real era: con varios ChannelUser por key tomaba `[0]` sin orden, un channel sin tipo daba 500 en `/` y `/verifyToken`, y la key se logueaba en claro. Arreglado en la rama local `feature/brand-publisher` del middleware (`cdd932b`, sin push). Ver el journal `2026-10-13-middleware-channel-key-por-fk`.* Texto original: el middleware resuelve una key de channel **a través del tipo de channel**: `verifyTokenGraph` hace un join `userChannelApiKey.channel → channel.channelUser` (`middleware.service.ts:224-240`) y `verifyToken` compara con la matriz de tipos. Un channel sin tipo da 401 en toda la API. Además, el dueño de la key tiene que tener una suscripción activa. | El cambio del middleware y de `@vio-/service validateApiKey` (resolver el ChannelUser por su FK `user_channel_api_key`) pasa a F2, **antes** de 2.3. No se deja para F7. | ¿Los publishers (VG, Aller) necesitan plan o suscripción para que sus keys funcionen? |
| B2 | "Cobra la brand" + backfill por unión = cobrar en la cuenta de Vio sin querer. Los channels nacen con Klarna, Stripe y link en true, y Stripe, Klarna, Vipps, Qliro y Adyen caen a la credencial de plataforma si la brand no tiene la suya. Además, la consulta 1 del journal tiene dos fallos: el JOIN interno deja fuera a los channels sin settings, y `CONCAT_WS` se salta los NULL. | Antes de 2.1, un ADR corto sobre el fallback cuando vende la brand. Para los métodos con fallback, el backfill sería la unión ∩ la credencial propia activa. Sumar la medición "toggle ON sin credencial propia" por método y corregir la consulta 1. | ¿Una brand puede vender con la cuenta de Vio (fallback), o solo con la suya? |
| B3 | ADR-0026 no define cómo queda la **orden**. Hoy los `orders/save` mandan `reseller` = `cart.user`, el supplier es `product.user`, el `referralFee` sale del producto, y los listados, el profit y el revenue dependen de reseller/supplier. Si `reseller` pasa a ser la brand, el publisher deja de ver sus ventas. Surface y campaña no tienen columnas en la orden. | Antes de 2.4, un ADR sobre la orden: quién es el reseller, quién el vendedor de registro, qué ve cada uno, y si surface y campaña van en la orden o solo en analytics. El vendedor se persiste en el carrito al crear el checkout, y **no** se reescribe `cart.user` en los carritos viejos (payment-processors resuelve capture y refund por ahí). | Sí: el modelo de la orden. |
| B4 | "Mismas rutas y mover el DNS" deja afuera rutas que los clientes nativos llaman hoy: `/ws/:campaignId`, `register-device`, `/v1/sdk/broadcast`, `/v1/engagement/*`, `/v1/campaigns/:id/config`, `/v1/localization`, `lineup`, `/v2/tv/*` y `/objects/*`. El único tráfico real va a **`api-staging`**, no a `api.vio.live`. El cluster de QA se apaga de noche y los fines de semana; vio-backend en Oracle corre 24/7. | El corte se hace **por path** en el nginx de Oracle: las rutas portadas van al micro y el resto sigue en vio-backend hasta retirarlas. Así el rollback es revertir un `location`. Los hosts se mapean uno a uno (api-staging ↔ QA, api ↔ prod, api-dev como alias). | ¿QA tiene que estar arriba 24/7 para que VG y Aller tengan config, o el corte de staging apunta a prod? |

**Importantes**

| # | Hallazgo | Acción |
|---|---|---|
| I1 ✔ | **Contradicciones.** ADR-0027 dice que el web-sdk y Vev guardan un carrito por API key, pero en `main` el web-sdk lo guarda por `sponsorId` (`cart-manager.ts:34`, `vio.cart.v1`); `CartsByKey` solo existe en una rama de Vev. El channel es "de una o varias brands" (0026) y "una brand" (0027). `accountType`/`features` quedan en dos lados (users F2.2 y `/api/auth/me` del micro). ADR-0025 dice que el webapp va por base-api y 0027 lo revierte. | Esta tabla deja registradas las correcciones (los ADRs no se editan). Hay que mantener **ids de sponsor estables** en la config, porque el carrito guardado los usa. `accountType` sale de **users**; el `/api/auth/me` del micro lo reexpone. |
| I2 | **Hay tres juegos de markets.** Kustom y Adyen filtran por los markets del channel, en api y en shopcart (`MARKET_NOT_IN_CHANNEL`), pero la brand no tiene dónde guardar los suyos. | Una sola función de markets y su columna, dentro de F2. |
| I3 | **Nada obliga a "una brand por channel".** `ChannelGroup` no tiene supplier. | Validar al agregar productos y colecciones al channel. Validar que el sponsor de la campaña sea la brand de sus channels. |
| I4 | **Key por channel.** Hay tres caminos de creación, y `customApiToken` engancha cualquier key existente **sin comprobar el dueño** (`channel.service.ts:282-292`, bug de seguridad aparte). No se definió qué channel conserva el valor de una key compartida (la de Lyko está pegada en VG). vio-analytics mapea los sponsors por esa key. | Definir la migración de keys, y reapuntar analytics junto con 2.3, no en F6. |
| I5 | **El vendedor sale de 5 o más fuentes en shopcart.** Vipps arranca el pago con `ChannelUser.user` pero captura con `cart.user`. | Una sola fuente para init, capture, refund y webhooks (2.4). |
| I6 | **El manifest del SDK no manda la plataforma.** Registrarlo por plataforma obliga a cambiar el SDK o a tener keys por plataforma. Kotlin usa los `paymentMethods` de la config, así que el micro tendría que llamar a api o replicar `getAvailablePaymentMethods`. | Definir en F3: el micro le pide los métodos a api, con cache. El manifest acepta un `platform` opcional, y el default es la surface. |
| I7 | **Apple Pay.** Si cobra la brand, cada dominio de surface se registra en la cuenta Stripe de cada brand. | Documentarlo en el alta de surfaces. |
| I8 | **Reusar el nombre `campaign`** de liveshow es riesgoso con micros en kernels distintos. | Usar nombres nuevos, o este orden estricto: quitar llamadores, liberar el kernel, hacer el drop y recién ahí crear. |
| I9 | **Kernel.** F2.1 y F3.2 son dos releases con migraciones. Las de prod se van a acumular, y el backfill es una foto. | Hacer el backfill idempotente y re-ejecutable, y planificar la puesta al día de prod. |

**Menores**

- El audit decía que base-api `statsService` lee Postgres: no lo hace, pasa por el colector de analytics.
- `validateApiKey` y `verifyTokenGraph` loguean la key.
- `docs/architecture/vio-vev-integration.md` tiene keys en claro (líneas ~137 y ~242), que hay que rotar o quitar.
- Sobre F0.1: la conexión propia **sí** la borraba extensions. Las descripciones de los PRs ya se corrigieron.

### Kernel F2.1/F3.2 (agente, 2026-10-13)

- ⚠️ **Hay brands que venden a través de channels de otros y no tienen channels propios.** El
  backfill calcula la unión solo con los channels **propios** de cada cuenta, así que esas brands
  quedan con todo apagado. Si 2.4 cobra con la configuración de la brand, pierden el checkout.
  - **Propuesta:** que la unión cuente también los channels activos que publican productos de
    la brand (`ChannelGroup` / `ChannelUserProducts`). Hay que medirlo antes.
- **Las 202 migraciones históricas de `package-database` no corren desde cero:** 492 sentencias
  fallan, y `payment_method` no se crea por migración. Para validar hubo que armar la base desde
  las entidades.
- **El listado de "cuenta de Vio" sale de las columnas después de migrar**
  (`WHERE payment_*_use_vio_account = 1`), no de la consulta 6.
- **Antes de migrar QA o prod:** `SELECT * FROM role` (el id 3 tiene que estar libre) y
  `SHOW TABLES LIKE 'surface%'`.

### Miguel (2026-10-13)

Revisé el audit, los ADR-0025/0026/0027/0028 y este plan. Saqué el `access.log` de las dos VMs
de Oracle (15 días, 28/09–13/10, los 15 ficheros rotados) y verifiqué contra tráfico real, no
contra código. Lo que sigue son las dos cosas: la medición que me tocaba y mi opinión.

Antes de las objeciones: **el plan está bien armado.** El audit está verificado en código con
refs y marcado [V]/[I], tiene una revisión adversarial propia, y ADR-0028 cierra los cuatro
bloqueantes con decisiones explícitas en vez de dejarlos abiertos. Mis reparos son de orden y
de infra, no del diseño.

#### 1. `access.log` de Oracle — F1, hecho

**Trampa de lectura, primero.** Hay un scraper, `WebSiphon/next-0.1`, que descarga el bundle
JS del dashboard viejo y **reproduce todas las cadenas que encuentra dentro**, incluidas las
plantillas sin interpolar. De ahí salen los ~22-48 hits de `/api/campaigns`,
`/api/components`, `/api/sponsors`, `/api/broadcasts`, y rarezas como
`/api/campaigns/${e}/components` o `/ws/${t}`. Súmale ClaudeBot, GrokBot y Google-Extended.
**Quien lea esos contadores como "el dashboard se usa" se equivoca.** Para separar: descartar
los UA de bots y toda línea con `%7B`.

| Pregunta | Respuesta medida |
|---|---|
| `api.vio.live` (prod, 82.70.54.151) | **Cero tráfico real de clientes en 15 días.** Los 500 `2xx` de `/api|/v1|/v2` son del scraper; el resto, crawlers y escáneres de login. `/v2/mobile/config`: **0 peticiones**, ni una. |
| `api-staging` (129.151.196.99) | `/v2/mobile/config` es **el único endpoint con tráfico real**: 399 × 200, 233 × 304, 466 OPTIONS, 30 IPs distintas. Confirma el audit. |
| ¿Quién lo embebe? | **Todo es desarrollo nuestro**: `a-alan-local.vev.site` (482), `editor.vev.design` (276), `a-vio-dev.vev.site` (155), `localhost:5173` (30) y una URL de Replit (4). **Ni una petición desde un dominio de producción de VG o Aller.** |
| WebSocket | 57 upgrades (101) en staging, **todos `okhttp/4.12.0` desde 46.212.249.70** (la IP del equipo) + 1 `tv2demo/1 CFNetwork`. En prod hay 7 y son `node`/`rawgrab` del 28/09, o sea ruido. **`/ws` es el bucle de desarrollo de Alan, no una surface.** |
| `/v1/engagement/*`, `/v2/tv/*`, `/v1/sdk/broadcast`, `/v1/localization`, `lineup`, `/objects/*` | **Cero llamadas reales en 15 días, en las dos VMs.** |
| `register-device` y `manifest` | **1 llamada cada uno**, en staging, de la sesión de Kotlin. Nada más. |

Comando usado (solo lectura), por si hay que repetirlo:

```bash
zcat -f /var/log/nginx/access.log* \
 | grep -vE "WebSiphon|rawgrab|ClaudeBot|GrokBot|Google-Extended" | grep -v "%7B" \
 | awk '{print $6" "$7" "$9}' | cut -d? -f1 | sed -E 's#/[0-9]+#/:id#g' \
 | sort | uniq -c | sort -rn
```

**Qué cambia esto en el plan:**

- **El corte es mucho menos arriesgado de lo que el plan supone.** No hay usuario final en
  ningún lado: lo único vivo es el editor de Vev y nuestras máquinas.
- **Pero F6 no se puede validar con "el tráfico real sigue andando", porque no existe.** Hace
  falta una prueba explícita: abrir la campaña Lyko en el editor de Vev contra el micro nuevo
  y comparar la respuesta de `/v2/mobile/config` byte a byte con la de vio-backend. Lo pondría
  como criterio de salida de F3, no como paso de F6.
- **La premisa de ADR-0028 B4 ("los SDKs nativos llaman hoy rutas que no se portan") es cierta
  en el código y falsa en la red.** Nadie las llama salvo Alan, dos veces. Eso habilita algo
  más simple que mantener vio-backend detrás del split: esas rutas pueden responder **410 con
  un JSON explícito** desde el día del corte. Mejor que proxyear a un backend que ya nadie
  mira: si algún cliente las usa, falla fuerte y nos enteramos.

> **Respuesta de Angelo (2026-10-13):** (1) el corte se hace de inmediato; (2) el micro va dentro
> de los micros, en AKS; (3) una surface mantiene N channels.
> Lo de (1) ya está hecho en su parte de infra: **`api.vio.live` cerrado a lista blanca y el
> dashboard viejo de staging también**, con el loop de Vev intacto
> ([journal](../journal/2026-10/2026-10-13.md)). Lo que sigue de esta sección queda como registro
> de por qué, y los puntos 3 y 4 se releen con sus respuestas:
> - **Con prod cerrado y sin un solo cliente real, prod no necesita split por path.** Cuando el
>   micro exista en AKS: apuntar `api.vio.live` al ingress y que las rutas no portadas respondan
>   **410**. El split por path solo hace falta en **staging**, que es donde está el loop de Alan, y
>   ahí sí puede vivir en el nginx de Oracle sin poner a la VM en el camino crítico de producción.
>   Eso simplifica ADR-0028 #5 en vez de contradecirlo.
> - **Si la surface mantiene N channels, el reparo de las N+1 keys en el cliente sigue en pie** y de
>   hecho es cuando más pesa. El mínimo que propongo para v1: el cliente lleva **solo** la key de
>   surface; las keys de channel son de **catálogo en solo lectura**, rotables por channel sin
>   tocar la app, y nunca válidas para checkout. Puedo redactarlo como punto de ADR si querés.

#### 2. Lo que reordenaría (mi única objeción de peso al orden) — HECHO el 2026-10-13

**Los 7 agujeros de auth de vio-backend no pueden esperar a F6.** El audit los da por
verificados: `GET /api/campaigns/:id` público devolviendo `reachuApiKey` y `webhookUrl`, el
`{ campaignId, ...req.body }` que saltea el ownership, la lectura cruzada de la
`commerceApiKey` de otra surface con ids correlativos, `/api/analytics/*` y `/v2/commerce/*`
sin auth. La mitigación del plan es "vio-backend sigue vivo mientras no se corte", y el corte
está a F6. Mientras tanto **el host está siendo recorrido activamente** — el scraper del punto
1 no es teoría, enumera rutas y las reproduce.

Y acabo de medir que **prod no tiene ni un cliente real**. Entonces no hay razón para que
`api.vio.live` siga abierto a internet. Propuesta concreta, 20 minutos y no toca el plan:

- **prod:** `api.vio.live` solo para la IP del equipo y las de salida de AKS; todo lo demás, 403.
- **staging:** público solo `/v2/mobile/config` y `/ws`; el resto de `/api/*` (el dashboard
  viejo) a la IP del equipo.

Eso cierra la ventana sin depender del cronograma. Si te parece, lo hago y lo documento.

#### 3. Infra: dónde no estoy de acuerdo con ADR-0028 #5

**El split por path no debería vivir en el nginx de Oracle.** Estoy de acuerdo con *cortar por
path* (el rollback es revertir un `location`, es lo correcto), pero no con *dónde*. Si el micro
vive en AKS y el split está en Oracle, la VM pasa a ser **un proxy de Oracle a Azure** para
todo el API de producción. Esa máquina es una `E2.1.Micro` de 954 MB que ya corre vio-backend,
su Postgres y, desde ayer, el colector de analytics (444 MB usados de 954). Le estaríamos
poniendo el camino crítico del API encima, con un salto de red extra y un único punto de fallo
en el tier gratuito.

**Alternativa:** poner el split en **Cloudflare**, que ya está delante de `vio.live`. Mismo
rollback (revertir una regla), cero saltos extra, y `api.vio.live` puede apuntar al ingress de
AKS desde el primer día. Las rutas no portadas se mandan a Oracle o se contestan con 410 ahí
mismo. Tengo los dos tokens de Cloudflare (DNS y Cache/Rules) y el zone id.

Lo demás de la infra del micro lo asumo, con dos avisos:

- **El `.env` del blob no entra por reconstruir.** Lo que leen los pods es el Secret de k8s
  `env-sc-<svc>` montado en `/usr/src/app/.env`, que **tapa** el fichero horneado en la imagen.
  El micro nuevo nace con su Secret o no arranca con la config que uno cree
  ([lección](../lessons/env-del-blob-no-llega-a-la-imagen-al-reconstruir.md)).
- **El cert va por DNS-01 de Cloudflare**, no HTTP-01: en prod entra por Istio y el reto HTTP
  no se resuelve ([ADR / infra de certs](../infrastructure/overview.md)).

#### 4. Modelo: una cosa que cambiaría

**"Key general de surface + una key por channel" multiplica el problema de la key en el
bundle.** Una surface con N channels obliga al cliente público a llevar N+1 secretos. Ya nos
pasó: el audit encontró una API key de Commerce **escrita en el código** de Swift y Kotlin
(punto 2 del audit), y los SDKs nativos además la mandan en la *query string*, así que queda
en este mismo `access.log`. Escalarlo a N keys por surface va en la dirección contraria.

Propondría que **el cliente solo lleve la key de surface** y que el micro resuelva server-side
qué channels aplican, devolviendo o un token corto o directamente el catálogo. Si eso no entra
en v1, el mínimo es: las keys de channel son **solo lectura de catálogo**, rotables por channel
sin tocar la app, y nunca sirven para checkout. Es una propiedad de seguridad, merece una línea
en el ADR.

Del resto del modelo: de acuerdo con slots **por plataforma** (arregla la deprecación mutua),
con calcular "activa" al leer en vez de materializarla (evita el cron duplicado de base-api), y
con una sola función de markets (I2). Y sobre I8: **no reusaría el nombre `campaign`.** El ADR
deja la puerta a "o este orden estricto", y con dos micros en kernels distintos y `api` a 1
réplica alguien lo va a violar. Un nombre nuevo es gratis.

#### 5. Detalles operativos que el plan no contempla

- **F1 contra prod no se puede correr sin tocar el firewall.** Cerré el de la MySQL de prod el
  02/10 y el 12/10 quité `AllowAllAzureServices`: hoy solo entra la salida de AKS de prod.
  Quien corra las mediciones necesita que le agregue su IP, y hay que acordarse de quitarla
  después. Ojo con `20.127.155.58`, una conexión a la base que sigo sin identificar.
- **Dos releases del kernel con migración en el camino crítico** (F2.1 y F3.2) es el riesgo de
  cronograma, más que el runtime. Las migraciones son baratas de agregar; las releases de los 7
  paquetes, caras. Si se pueden diseñar las entidades de F3.2 a la vez que F2.1 y publicarlas
  juntas (aunque el micro llegue después), se ahorra una vuelta entera.
- **vio-analytics no se "reapunta" con una variable.** Resuelve api key → tenant leyendo
  **Postgres** (`src/auth.ts:38,92,133`), y hoy el colector de prod apunta al Postgres local de
  la VM. Pasar a MySQL es **cambio de código** en un repo cuyo CI está retirado (deploy manual).
  De acuerdo con I4 en adelantarlo a 2.3: si las keys cambian antes, la atribución se rompe en
  silencio. Lo hago yo, pero hay que ponerle número de fase.
- **Las surfaces y keys de VG/Lyko y Aller hay que exportarlas a un fichero antes del corte**,
  no recrearlas de memoria. F6 dice "las keys se importan tal como están": una key mal copiada
  es un 401 silencioso para el publisher. Son 4 o 5 filas.

#### 6. Dos cosas que encontré de paso (no son del plan)

- **`POST /api/campaign/payments/apikey/:key` de `api` → vio-backend devuelve 500 en
  producción**, 8 veces entre el 28/09 y el 12/10. O sea la propagación de métodos de pago que
  2.3 elimina **hoy ya no funciona**. No hace falta arreglarla; conviene saber que está rota y
  no andando.
- **El puente de stats del dashboard de Commerce llama al colector sin `channel_id` ni
  `sponsor_id` y se lleva un 400**: 6 peticiones desde la salida de AKS de prod
  (`4.223.89.241`) desde que el colector está vivo. Antes del 12/10 esas mismas llamadas
  recibían **200 con el HTML del dashboard viejo** (3133 bytes, idéntico en todos los
  endpoints), que es un falso éxito peor que el 400. Hay que mirar qué manda base-api.
