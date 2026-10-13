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
- **Ni `ApiCredential` ni `ChannelUser` sirven como surface.**
  - `ApiCredential` da acceso a todo el usuario, y terminaría embebida en una app pública.
  - Resuelto en [ADR-0026](../decisions/0026-brand-publisher-channel-surface.md): la
    surface es una entidad nueva con su propia key general. El channel es el grupo de
    productos del publisher, con su propia key, y se asigna a una o más surfaces.
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

## 4. Modelo de destino

El modelo de cuentas está fijado en
[ADR-0026](../decisions/0026-brand-publisher-channel-surface.md):

```
Brand (business)                          Publisher (VG, Aller)
 ├─ Catálogo + colecciones  ◄── Connection ──┤ recibe acceso al catálogo
 ├─ Pagos (credenciales + encendidos)        ├─ Channels = grupos de productos
 └─ Markets: a dónde envía                   │   (de una o varias brands) ── API key por channel
                                             ├─ Surfaces ── API key general
                                             │   ├─ plataformas iOS/Android/TV/Vev/web + slots
                                             │   ├─ markets: dónde se muestra
                                             │   └─ channels asignados (1..N)
                                             └─ Campañas (en una surface): sponsor + parámetros
SDK: key general (campañas) + keys de los channels de la surface (catálogo/checkout)
```

Entidades nuevas en el micro, en borrador. Los nombres de columnas se fijan al diseñar:

| Entidad | Contenido | Paso |
|---|---|---|
| `brand_profile` | 1:1 con el `User` brand: nombre visible, logo, avatar, colores | 1 |
| `surface` | publisher, nombre, descripción, icono, key general, status (que de verdad se aplique), markets | 1 |
| `surface_platform` | surface, tipo como enum, campos propios del tipo, identifier | 1 |
| `surface_channel` | surface ↔ `ChannelUser` del publisher (1..N) | 1 |
| `campaign` | publisher, surface (NOT NULL), sponsor primario (`User` brand), channel del que salen sus productos, inicio y fin en UTC, `paused` boolean | 1 |
| `campaign_sponsor` | solo los sponsors secundarios | 1 |
| `placement_location`, `placement`, catálogo de templates | slots que declara el SDK **por plataforma** y la tupla (template, slot, nombre) | después |
| `campaign_placement` (+ productos del channel) | placement + sponsor + status como enum; un solo activo por (campaña, placement) mediante columna generada + UNIQUE | después |

**Pagos:** las credenciales de la brand quedan en `payment_method`, y sus encendidos pasan
a `UserSettings`. El checkout de cada carrito cobra con la brand de sus productos.

**Endpoints:** el micro mantiene las rutas de vio-backend (`/api/client-apps…`,
`/api/campaigns…`, `/api/sponsors…`, `/v2/mobile/config`,
`/v2/mobile/campaigns/:id/components`, manifest) y se importan las keys de surface tal
como están. Así los SDKs, Vev y el web-sdk no cambian. La propuesta de host es
`api.vio.live`, moviendo el DNS el día del corte (por confirmar).

**Pendientes al pasar a MySQL:**

- **Arrays de Postgres:** pasan a `json` o a una tabla hija.
- **Índices parciales:** se reemplazan por una columna generada + UNIQUE.
- **Fechas:** `DATETIME` en UTC (el kernel ya usa `timezone 'Z'`).

## 5. Ajustes en Commerce

1. **`package-database`:**
   - entidades nuevas;
   - encendidos de pago en `UserSettings` y su backfill por unión;
   - una key por channel;
   - una fila de rol Publisher;
   - retiro de `campaign`/`component` de liveshow (si están vacías en prod);
   - más tarde, el drop de los tipos de channel y de las FKs de tienda de reseller.

   Requiere OK y release con los 7 paquetes juntos
   ([ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md)).
2. **shopcart:**
   - una sola función que resuelva al vendedor = la brand de los productos del carrito
     (hoy hay cuatro fuentes y el cliente puede elegir);
   - mandar el channel en los 12 `orders/save`;
   - validar del lado del servidor que el método esté encendido.
3. **`api`:**
   - los encendidos se leen de la brand;
   - el settings del channel se queda solo con lo que no es de pago;
   - el channel se crea sin tipo y con su propia key;
   - se retiran `campaign`/`components` de liveshow y la propagación a `VIO_BACKEND_URL`;
   - se arreglan los bugs de `postUptadeSettings`.
4. **middleware:** se rehace la matriz de rutas por tipo de channel. Va al final del retiro
   de 2/5/11, para no dar 401 a keys vivas.
5. **base-api:**
   - retirar los routers de liveshow y de tienda de reseller (Shopify salida, Woo salida,
     Magento channel);
   - cerrar los endpoints sin auth.
6. **extensions, orders, products, collection, users:** quitar los caminos de tienda de
   reseller. El de origen de catálogo (vio-sync, `EcomUser`, conexiones) se queda.
7. **`users`:** persistir el tipo de cuenta (Brand o Publisher) y devolver
   `accountType`/`features` en `/api/users/me`.
8. **Kernel:** sumar el micro nuevo a la lista de dispatch de los 7 `kernel-release.yml`.
9. **vio-analytics:** resolver surface y sponsor contra MySQL en vez del Postgres de
   vio-backend.
10. **SDKs:** quitar el `DynamicComponentsService` de liveshow (Swift y Kotlin) y rotar la
    key escrita en el código. Hay que hablarlo con Alan y Miguel.
11. **webapp:**
    - Settings › Payments gana los encendidos;
    - el channel muestra lo heredado en solo lectura;
    - Channels pasa a ser grupos de productos;
    - pantallas nuevas de Surfaces y Campañas;
    - Mi marca va a `brand_profile`.

## 6. Plan por pasos

Angelo (2026-10-13): *«vamos poco a poco; definir primero web, Vev, custom web, y ahí vemos
cómo lo vamos creando, los placements etc. Sí los quiero mantener, pero hay otras cosas que
arreglar primero»*.

0. **Fixes urgentes**, aprobados el 2026-10-13, cada uno en su PR:
   - `users disconnectShopifySalesChannel` hace `softDelete(userId)`, que borra la conexión
     cuyo id coincide con el userId;
   - `GET /api/channel/user/admin/by-shopify-url` no tiene auth y devuelve tokens de
     Shopify.
1. **Definición.** Hecho: cuentas y dueños (ADR-0026). Falta: los tipos de plataforma de
   surface y sus particularidades, los parámetros de campaña y el mapa de endpoints.
2. **Ajustes de Commerce:** pagos heredados, key por channel, vendedor = brand en shopcart,
   tipo de cuenta persistido.
3. **Micro nuevo** con el paso 1 del modelo y las mismas rutas que vio-backend.
4. **Front:** pantallas de Surfaces, Channels y Campañas en el webapp.
5. **Corte:**
   - migrar VG/Lyko y Aller al modelo nuevo (Connection, channel del publisher, surface);
   - mover el DNS;
   - reapuntar analytics;
   - apagar vio-backend y `client/`.
6. **Retiro de Shopify, Woo y Magento como channels:** medir, cortar altas, borrar código y
   dejar el middleware al final.
7. **Placements**, cuando el SDK nativo los necesite.

## 7. Preguntas abiertas

- **Tipos de plataforma de surface:** qué distingue a web, Vev y custom web, y qué
  particularidades tiene cada tipo.
- **Parámetros de campaña:** qué define el publisher al crearla.
- **Host:** ¿`api.vio.live` apunta al micro nuevo?
- **Operadores y viewers:** ¿v1 con un solo usuario por cuenta?
- **Comisión** (`referralFee`): quién la fija y cómo la cobra el publisher.
- **Mediciones de solo lectura** en la MySQL de QA y prod (las corre Angelo): conflictos de
  encendidos, channels 2/5/11 vivos, conexiones de reseller con token, víctimas del
  `softDelete(userId)` y filas de liveshow.
- Confirmar con Miguel, vía el `access.log` de nginx, que nada fuera de `/v2/mobile/config`
  recibe tráfico real.
