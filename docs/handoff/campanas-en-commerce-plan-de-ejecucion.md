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

Son de solo lectura, en la MySQL de QA y de prod; las corre Angelo con el `.env` del kernel.
Las consultas están en el [journal del 2026-10-13](../journal/2026-10/2026-10-13-campanas-en-commerce.md).
Miden:

1. Los conflictos de encendidos de pago por business (insumo de la unión).
2. Los channels 2/5/11 vivos, sus keys y sus órdenes de los últimos 90 días.
3. Las conexiones Shopify de reseller que tienen token (alcance de 0.2).
4. Las candidatas a víctima del `softDelete(userId)` (alcance de 0.1).
5. Las filas de `campaign`/`component` de liveshow.

Además, **Miguel** saca el `access.log` de nginx de las VMs de Oracle para confirmar que nada
fuera de `/v2/mobile/config` tiene tráfico real.

### F2 — Ajustes de Commerce (rama `feature/brand-publisher` en cada repo)

| # | Qué | Repo | Depende de |
|---|---|---|---|
| 2.1 | Columnas de encendidos de pago en `UserSettings` (stripePaymentIntent, stripePaymentLink, klarna, vipps, kustom, qliro, walley, nexi, adyen, googlePay, applePay); migración con **backfill por unión** de los channels activos; fila de rol **Publisher**. | package-database | F1.1 + OK |
| 2.2 | Persistir el tipo de cuenta (Brand/Publisher) en el alta (`doSave`, hoy solo pone el claim) y rellenar las cuentas existentes desde los claims. `/api/users/me` devuelve `accountType` y `features`. | users | 2.1 |
| 2.3 | `getAvailablePaymentMethods` lee los encendidos de la **brand**. Endpoint nuevo para los encendidos de la cuenta, que invalida las caches de todos sus channels. El settings del channel se queda sin pagos (markets, condiciones, email). **Una key por channel** (hoy es una por usuario y tipo). Se borra la propagación a `VIO_BACKEND_URL` y se arreglan los bugs de `postUptadeSettings`. | api | 2.1 |
| 2.4 | `sellerOfCart` único = la brand de los productos del carrito, que se valida como una sola. Reemplaza las 4 fuentes de hoy, que incluyen `userId` del body y del path. Los 12 `orders/save` mandan `channelUserId`. Se valida del lado del servidor que el método esté encendido. | shopcart | 2.3 |
| 2.5 | `ChannelDTO.settings` sigue lleno (desde la brand) para no romper el schema de los SDKs. | graphql | 2.3 |
| 2.6 | Proxies y docs de los endpoints nuevos de encendidos. | base-api | 2.3 |
| 2.7 | Settings › Payments gana los encendidos. El detalle del channel muestra los pagos heredados en solo lectura. "Channel" pasa a ser grupo de productos, y la cuenta "Channel" se llama **Publisher**. | webapp | 2.3, 2.6 |

### F3 — Microservicio `vio-campaigns-microservice`

| # | Qué |
|---|---|
| 3.1 | Scaffold desde `vio-template-microservice`, más chart, pipeline y env (con el fix del registry por `$ACR`), y sumarlo al dispatch de los 7 `kernel-release.yml`. |
| 3.2 | Entidades en `package-database`: `surface`, `surface_platform`, `surface_channel`, `slot` (por plataforma), `campaign`, `campaign_sponsor`, `campaign_slot`, `brand_profile`. Las de liveshow se retiran si F1.5 da 0 filas. |
| 3.3 | Auth propia: token de Firebase para el dashboard y key de surface para el SDK, sin pasar por el middleware. |
| 3.4 | Rutas iguales a las de vio-backend: `/api/client-apps…`, `/api/campaigns…`, `/api/sponsors…`, `/api/auth/me`, `/api/sponsor/me`, `/v2/mobile/config` (compatible + `campaigns[]`), `/v2/mobile/campaigns/:id/components`, `/v2/mobile/components/manifest` (por plataforma), `/v2/web/brands`. El estado de campaña se calcula en un solo lugar, y se valida siempre que la campaña sea de la surface de la key. |

### F4 — Front (webapp)

Pantallas de Surfaces (con plataformas y slots), Channels (grupos de productos de una
brand, a partir de Connection + colecciones), Campañas (sponsors, channels, fechas y
slots) y Mi marca (`brand_profile`).

### F5 — Clientes

- **web-sdk:** un build IIFE/CDN para el tipo `web` (snippet) y el atributo `slot` en los
  `<vio-*>`.
- **Vev:** el slot en el bloque de Vio.
- **SDK nativo:** el manifest por plataforma (Miguel y Alan). Quitar
  `DynamicComponentsService` de liveshow y rotar la API key de Commerce que está escrita en
  el código de Swift y Kotlin.

### F6 — Corte

- Migrar VG/Lyko y Aller al modelo nuevo: el publisher se conecta al catálogo, arma su
  channel y lo asigna a la surface. Las keys de surface se importan tal como están.
- Mover el DNS de `api.vio.live` al micro.
- Reapuntar vio-analytics a MySQL.
- Apagar vio-backend y su `client/`.

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
| **Claude** | Implementación y PRs |
| **Miguel** | Revisión del plan, `access.log` de Oracle, infra del micro nuevo (chart, pipeline, DNS) |
| **Alan** | SDK nativo y overlay de Kotlin |

## Revisión

### Agente revisor (2026-10-13)

Hizo una revisión adversarial de los ADR-0025/0026/0027 y de este plan contra el código
(`origin/develop`/`main`). Claude verificó a mano los puntos marcados con ✔.

**Bloqueantes: hay que resolverlos antes de F2**

| # | Hallazgo | Qué cambia en el plan | Decisión de Angelo |
|---|---|---|---|
| B1 ✔ | El middleware resuelve una key de channel **a través del tipo de channel**: `verifyTokenGraph` hace un join `userChannelApiKey.channel → channel.channelUser` (`middleware.service.ts:224-240`) y `verifyToken` compara con la matriz de tipos. Un channel sin tipo da 401 en toda la API. Además, el dueño de la key tiene que tener una suscripción activa. | El cambio del middleware y de `@vio-/service validateApiKey` (resolver el ChannelUser por su FK `user_channel_api_key`) pasa a F2, **antes** de 2.3. No se deja para F7. | ¿Los publishers (VG, Aller) necesitan plan o suscripción para que sus keys funcionen? |
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

### Miguel

*(Pendiente. Se le pidió revisar la infra del micro, el `access.log` y el modelo.)*
