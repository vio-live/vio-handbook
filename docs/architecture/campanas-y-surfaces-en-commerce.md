---
title: "Campañas y surfaces en Commerce — audit de vio-backend y plan"
last-updated: 2026-10-13
owner: angelo
status: draft
---

# Campañas y surfaces en Commerce

Angelo (2026-10-13) dijo *«lo que quiero es toda la estructura de campañas pasarla a Vio
y conectarla al front; de vio-backend quiero hacer campañas, registrar surfaces y poco
más»*. La decisión está en
[ADR-0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md). Este
doc junta el audit que la sostiene y el plan por pasos.

**Base del audit:** se hizo solo con lectura, leyendo código. Refs:

- vio-backend: `main` @ `c79ae9a`.
- Commerce: `origin/develop` (api `6718d81`, package-database `e458e69` = 1.0.267,
  middleware `e1d0469`, users `7d68170`, base-api `bc77ecb`, graphql `85599c1`).
- webapp: `origin/develop` @ `dfb2b41`.
- SDKs: VioSwiftSDK `develop` (línea de Miguel, 10-06), VioKotlinSDK `main`, vev `main`
  (10-12).

Marcas: **[V]** verificado en código; **[I]** inferido. El diagnóstico detallado del servicio
`api` está en el journal
[2026-10-13-api-campanas-surfaces-diagnostico](../journal/2026-10/2026-10-13-api-campanas-surfaces-diagnostico.md).

---

## 1. Qué se usa hoy de vio-backend

vio-backend corre desde el 2026-09-28 en VMs de Oracle
([vio-backend-oracle](../infrastructure/vio-backend-oracle.md)), no en Azure.
`api.vio.live` apunta a 82.70.54.151 y `api-staging` a 129.151.196.99.

| Uso | Quién | Estado |
|---|---|---|
| `GET /v2/mobile/config`: surface por API key → campaña activa → sponsor primario y secundarios con `commerce {apiKey, channelId, paymentMethods}` | VG en Vev (campaña «Lyko») y la web de Aller / Mote & Livsstil (web-sdk 0.19.0, «Sommer test 2026»). Lo llaman todos los SDKs. | **Único uso real fuera del dashboard. Solo en staging.** [V código, tráfico según el handbook] |
| Dashboard viejo `client/` para dar de alta surfaces, sponsors y campañas, más el proxy de catálogo `/v2/commerce/...` y la subida de imágenes | Operación interna | Staging |
| `GET /api/auth/me`, `GET/PATCH /api/sponsor/me` | webapp (`src/lib/vio.js`), pantalla Settings › Mi marca | Solo staging: en prod el host no se deriva [V] |
| `POST /api/campaign/payments/apikey/:apiKey` | `vio-api-microservice` `channel.service.ts:5291-5323` (propaga los métodos de pago) | Acople; desaparece si los sponsors viven en MySQL [V] |
| Lectura directa del Postgres (`client_apps.api_key`, `sponsors.commerce_*`) | vio-analytics `src/auth.ts:38,92,133` y base-api `statsService.ts:13` | Acople; hay que reapuntarlo a MySQL [V] |
| Engagement (polls, contests, lineup), WebSocket `/ws/:campaignId`, TV (subscribe, cart-intent, session), manifest de slots, componentes por campaña, register-device, `/v1/sdk/broadcast` | Solo SDKs nativos en ramas `develop` y apps de demo contra `api-dev` | **Ninguna surface en producción.** [I: falta confirmarlo con el `access.log` de nginx] |

**Datos en prod:** unas 600 filas (12 users, 18 broadcasts, 85 cart_intents) y 0 filas en
ClickHouse `vio_production`. No hace falta migrar nada: las surfaces y campañas de staging
se recrean a mano.

**Tráfico por path:** no se pudo medir. El logger de la app solo registra `/api/*` y los Log
Analytics de Azure se borraron con el RG. La fuente real es el `access.log` de nginx en
Oracle, al que solo se entra con la key SSH de Miguel. Para pedírselo, este comando de
solo lectura quita las query strings:

```bash
awk '{print $7}' /var/log/nginx/access.log* | cut -d? -f1 | sed -E 's#/[0-9]+#/:id#g' | sort | uniq -c | sort -rn
```

**Otros datos:**

- VioSwiftSDK `main` (0.1.0-alpha) está roto contra el backend actual: llama a
  `/v1/sdk/config` y `/v1/sdk/campaigns`, que ya no existen [V].
- «Careless» es una app custom de vio-sync, del lado de oferta. No es una surface.

## 2. Errores de definición en vio-backend

Estos son los problemas que justifican reconstruir en lugar de portar. Todas las
referencias son a `vio-backend` @ `c79ae9a`.

**Modelo**

- **No hay estado de campaña.** Se deriva de pausa + fechas en 5 sitios con bordes
  distintos: `utils.ts:33` usa `now >= endDate` y `routes.ts:6444/6854/6900/6933` usa
  `endDate >= now`. Además «una activa por surface» no se obliga en ningún lado [V].
- **`/v2/mobile/config` toma la primera campaña activa**, y si no hay ninguna devuelve
  `appCampaigns[0]`, aunque esté pausada o terminada (`routes.ts:6902`) [V].
- **Hay booleanos guardados como varchar `'true'/'false'`**: `is_paused`, `is_segmented`,
  los de engagement y los 5 feature flags (`schema.ts:140,144,172,177,194-198`) [V].
- **La marca está repetida en tres sitios**: en campaigns (`logo`, `brand_*`), en sponsors
  (logo, avatar, colores) y en `campaign_ui_config` (colores). `/v2/mobile/config` usa
  `campaign.logo` [V].
- **La programación de placements está rota de punta a punta.** Hay tres pares de campos de
  fecha en `campaign_components` (`schema.ts:281-288`) y ningún endpoint los escribe. El
  dashboard manda `{scheduledTime, endTime}` a un PATCH que responde 400. El scheduler
  pasa un slug a `parseInt`, que da NaN (`scheduler.ts:69,90`).
  `scheduled_components` es un tercer modelo que nada ejecuta [V].
- **Campos de partido metidos en campaign** (`matchId`, `matchName`, `matchStartTime`):
  se escriben y no se leen [V].
- **`campaigns.clientAppId` es nullable**, pero sin él no se pueden agregar placements
  (`routes.ts:3718`) [V].
- **La tabla `channels` de vio-backend no tiene escritor** y su nombre choca con el Channel
  de Commerce. Además borrar un channel arrastra campañas por CASCADE [V].
- **TV tiene dos fuentes de verdad**: `/v2/tv` lee `tv_enabled`/`tv_platforms`, pero el
  dashboard solo escribe `surface_platforms` [V].
- **El manifest de slots se registra por surface, no por plataforma.** Si iOS y web
  declaran slots distintos, se deprecan mutuamente [V código / I impacto].
- **Status, role y kind son texto libre, sin enum ni CHECK.**
- **67 de 70 timestamps no tienen zona horaria.**
- **El schema y las migraciones no coinciden**: hay tablas creadas solo en
  `scripts/phase1-sql.sql` [V].
- **El soft-delete de placements choca con los UNIQUE totales**: recrear un placement
  borrado da 500 [V].
- **Hay columnas deprecadas vivas** (`reachu*`, `campaigns.payment_methods`), y `/v1`
  sirve la copia vieja de los métodos de pago [V].

**Seguridad (vio-backend sigue vivo mientras no se corte)**

1. **`/v2/mobile/campaigns/:id/components` no comprueba que la campaña sea de la surface
   de la key** (`routes.ts:7089-7160`). Con cualquier key válida se leen los placements de
   otra surface y la `commerceApiKey` de su sponsor, y como los ids son correlativos se
   pueden recorrer. Lo mismo pasa en `/broadcasts/:id/components`,
   `/v1/engagement/config` y `/v1/localization` [V].
2. **`GET /api/campaigns/:id` es público** (`authz.ts:266`) y devuelve la fila completa,
   con `reachuApiKey`, `webhookUrl` y `userId` [V].
3. **Los `PUT /api/campaigns/:id/{engagement,ui}-config|feature-flags` hacen
   `{ campaignId, ...req.body }`**: si el body trae `campaignId`, pisa al del path y se
   salta el guard de ownership (`routes.ts:3052,3091,3130`) [V].
4. **`PUT /api/campaigns/:id` permite cambiar `userId`/`clientAppId`**, es decir, mover
   la campaña a otro tenant (`schema.ts:1132`) [V].
5. **PATCH, regenerate-key y DELETE de client-apps validan al dueño contra el body o la
   query, no contra la sesión** (`routes.ts:2319-2409`) [V].
6. **`/api/analytics/*` y `/v2/commerce/*` no tienen auth** [V].
7. **Los SDKs Swift y Kotlin mandan `?apiKey=` en la query string**, así que
   probablemente queda en el `access.log` de nginx [I].

**En Commerce y en los SDKs**

- **Hay una API key válida de Commerce escrita en el código** de
  `VioSwiftSDK Sources/VioLiveUI/Components/DynamicComponentsService.swift:37` y
  `VioKotlinSDK .../VioLiveUI/Components/DynamicComponentsService.kt:20`. Hay que rotarla
  y sacarla [V].

## 3. Dónde encaja en Commerce

### Lo que ya existe y no sirve

- **`Campaign`/`Component` de `api`** (`package-database src/entity/modules/liveshow/`,
  tablas `campaign` y `component`): es un modelo de liveshow. La campaña es un `streamId`
  del channel del seller y no tiene surface, sponsor, fechas ni placements. Los únicos
  que lo llaman son base-api (proxy) y el overlay de Kotlin contra el host de dev.
  **Se retira**, y eso libera los nombres de las tablas [V].
- **Socket de Commerce**: lo único que hay es el Socket.IO de base-api. Emite todo a todos
  (`io.emit` global), sin rooms ni auth de handshake. El módulo `socket` de `api` es un
  proxy HTTP. No sirve para empujar activaciones a las apps [V].
- **Ni `ApiCredential` ni `ChannelUser`/`UserChannelApiKey` sirven como key de surface.**
  - `ApiCredential` da acceso a todo el usuario, y terminaría embebida en una app pública.
  - `ChannelUser` identifica el outlet de venta: con él vienen la atribución de órdenes, los
    métodos de pago, la cuota del plan y una key por par (user, tipo de channel). Usarlo
    haría al publisher reseller por accidente.
  - Lo que sí encaja es que el **sponsor tenga una FK real a su `ChannelUser`**, en lugar
    de la `commerceApiKey` pegada a mano [V modelo / I decisión].
- **Scheduler**: no hay `@nestjs/schedule` en ningún micro. El cron de base-api corre dos
  veces con 2 réplicas. El precedente bueno es el CronJob K8s de reconciliación de
  shopcart [V]. **Decisión: «activa» se calcula al leer**, no se materializa.

### Candidatos

| Hogar | Encaje | Riesgo |
|---|---|---|
| `users` | Bajo. Está en el camino de auth: middleware lo llama en cada request. | Alto. Solo debería llevar roles y límites de plan. |
| `products` | Nulo | Muy alto: 6.4k líneas y consumer de Service Bus. |
| `collection` | Adyacente. Sirve como pieza (la lista de productos de un placement), no como hogar. | Medio |
| `api` | Medio | 1 réplica, el deploy borra el pod, sin guards, 21k líneas. |
| base-api | No (legacy) | Solo como proxy, que hace falta igual. |
| **Micro nuevo** | **Alto, contexto limpio** | **Bajo en runtime; +1 servicio en cada release del kernel.** |

**Elegido: `vio-campaigns-microservice`** (ADR-0025).

## 4. Modelo de destino (borrador)

Tenancy: el publisher es dueño de surfaces y campañas, y es un `User` de Commerce con un
rol nuevo en `UserRole`. Hoy el seller existe solo como claim de Firebase y hay que
persistirlo. El brand/sponsor es un `User` business.

| Entidad | Contenido | Paso |
|---|---|---|
| `brand_profile` | 1:1 con el `User` brand: nombre visible, logo, avatar, colores | 1 |
| `surface` | publisher, nombre, descripción, icono, key, status (que de verdad se aplique) | 1 |
| `surface_platform` | surface, kind como enum (web, Vev, custom web primero), identifier | 1 |
| `campaign` | publisher, surface (NOT NULL), sponsor primario (FK al `User` brand + su `ChannelUser`), inicio y fin en UTC, `paused` boolean | 1 |
| `campaign_sponsor` | solo los sponsors secundarios | 1 |
| `placement_location`, `placement`, catálogo de templates | slots que declara el SDK y la tupla (template, slot, nombre) por surface | después |
| `campaign_placement` (+ productos con FK a `Product`, validados contra el sponsor) | placement + sponsor + status como enum; un solo activo por (campaña, placement) mediante columna generada + UNIQUE | después |

**Métodos de pago:** se leen de `ChannelUserSettings` del sponsor. Con eso no queda nada
que propagar.

**Pendientes al pasar a MySQL:**

- **Arrays de Postgres:** pasan a `json` o a una tabla hija.
- **Índices parciales:** se reemplazan por una columna generada + UNIQUE.
- **Fechas:** `DATETIME` en UTC (el kernel ya usa `timezone 'Z'`).

## 5. Ajustes en Commerce

1. **`package-database`:** entidades nuevas + migración + una fila de rol, y retiro de
   `campaign`/`component` de liveshow después de confirmar que están vacías en prod.
   Requiere OK y release con los 7 paquetes juntos
   ([ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md)).
2. **`api`:** retirar los módulos `campaign` y `components` y la propagación a
   `VIO_BACKEND_URL` (`channel.service.ts:5291-5323`, más las llamadas en `:5349` y
   `:5420`). Esa llamada además no tiene timeout.
3. **base-api:** retirar `campaignRouter` y `componentsRouter` de liveshow y crear los
   routers proxy del micro nuevo (dashboard y SDK).
4. **`users`:** persistir el tipo de cuenta en `doSave` (hoy solo pone el claim), rellenar
   las cuentas existentes y devolver `accountType`/`features` en `/api/users/me`.
5. **Kernel:** sumar el micro nuevo a la lista de dispatch de los 7 `kernel-release.yml`.
6. **vio-analytics:** resolver surface y sponsor contra MySQL en vez del Postgres de
   vio-backend.
7. **SDKs:** quitar el `DynamicComponentsService` de liveshow (Swift y Kotlin), rotar la key
   escrita en el código, y cambiar el host. Hay que hablarlo con Alan y Miguel.
8. **webapp:** pasar de `vioApi` a `api()`, y la pantalla Mi marca a `brand_profile`.
   `CHANNEL_DASHBOARD_URL` deja de apuntar al dashboard viejo.

## 6. Plan por pasos

Angelo (2026-10-13): *«vamos poco a poco; definir primero web, Vev, custom web, y ahí vemos
cómo lo vamos creando, los placements etc. Sí los quiero mantener, pero hay otras cosas que
arreglar primero»*.

1. **Definir las surfaces web: web, Vev y custom web.** Qué distingue a cada una, qué
   identifica a cada plataforma y qué necesita cada una de Commerce. ← *siguiente paso*
2. **Diseñar la key única por surface.** Commerce resuelve el sponsor y el `ChannelUser` de
   cada carrito a partir de la surface y la campaña, del lado del servidor. Así el SDK deja de
   recibir la `commerceApiKey` de cada sponsor y el carrito sigue siendo por sponsor
   ([ADR-0006](../decisions/0006-storage-is-always-multi-sponsor-cart.md)). Toca middleware,
   graphql y shopcart.
3. **Micro nuevo con el paso 1 del modelo**, más una `/v2/mobile/config` compatible con el
   web-sdk.
4. **Front:** pantallas de Surfaces y Campañas en el webapp.
5. **Corte:** recrear VG/Lyko y Aller en el servicio nuevo, cambiar el host en Vev, el
   web-sdk y vio-web, reapuntar analytics, y apagar vio-backend y `client/`.
6. **Placements**, cuando el SDK nativo los necesite.

## 7. Preguntas abiertas

- ¿Qué distingue a **web**, **Vev** y **custom web**? (paso 1)
- Diseño de la key única (paso 2).
- **Operadores y viewers:** ¿v1 con un solo usuario por tenant?
- Confirmar con Miguel, vía el `access.log` de nginx, que nada fuera de `/v2/mobile/config`
  recibe tráfico real.
- ¿Las tablas `campaign`/`component` de liveshow están vacías en prod?
- Los agujeros de seguridad de vio-backend: ¿se arreglan o se aceptan hasta el corte?
