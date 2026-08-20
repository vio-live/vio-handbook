# Vio Analytics — arquitectura y estado (v1)

> Estado: **EN IMPLEMENTACIÓN — F1+F4 construidos, F2 en PR** (2026-08-20; plan
> original aprobado 2026-07-27). Servicio propio de telemetría para toda la
> plataforma: impresiones, clicks, funnel de compra y performance de campañas, desde
> todos los SDKs (web en Vev/Replit/custom, iOS, tvOS, Android, Android TV),
> coordinado con el modelo dinámico de vio-backend.

> Métricas por surface (definiciones + fórmulas + backlog de endpoints):
> [`vio-analytics-metrics.md`](./vio-analytics-metrics.md).
> Conocimiento durable relacionado: [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md)
> (arquitectura y contrato) · [ADR-0010](../decisions/0010-clickhouse-oss-self-hosted.md)
> (store self-hosted) · [playbook de operación](../playbooks/operate-vio-analytics.md)
> (salud, secrets, backups, gotchas) · lessons
> [`stale-instances-steal-outbox-rows`](../lessons/stale-instances-steal-outbox-rows.md) y
> [`container-apps-first-deploy-gotchas`](../lessons/container-apps-first-deploy-gotchas.md).

## Estado de implementación (sesión 2026-08-19/20)

| Pieza | Estado | Dónde |
|---|---|---|
| Contrato v1 (Zod + doc canónico) | ✅ Congelado | `vio-analytics/src/contract/analytics-schema.ts` + `docs/EVENTS_CONTRACT.md` |
| F1 — Colector | ✅ Implementado + e2e local | repo **`vio-live/vio-analytics`** (main) |
| F2 — `Vio.analytics` web SDK | ✅ En PR | [vio-web-sdk#18](https://github.com/vio-live/vio-web-sdk/pull/18) |
| F4 — Espejo server-side (outbox) | ✅ En PR | [vio-backend#43](https://github.com/tipiodevelopment/vio-backend/pull/43) |
| F3 — Vev consume el core | ⬜ Pendiente (tras merge de F2 + rebundle con OK) | `vio-vev` |
| F5 — Paridad iOS/tvOS/Android/TV | ⬜ Pendiente | mismo contrato, re-declaración nativa |
| F6 — API de agregados + dashboards | ⬜ Pendiente (Mixpanel cubre mientras) | multi-tenant por rol (publisher/brand) |
| Infra Azure (Terraform) | ✅ Escrita, sin aplicar | `vio-analytics/infra/` |
| Provisioning (ClickHouse Cloud EU, CNAMEs, secrets, 1er apply) | ⬜ Angelo | `vio-analytics/infra/README.md` |

## Qué tocó esta iniciativa en cada repo (mapa durable)

| Repo | Qué se agregó | Dónde mirar |
|---|---|---|
| **`vio-live/vio-analytics`** (nuevo) | El servicio entero: contrato v1 (Zod), colector Fastify (`POST /v1/events`), sinks (ClickHouse writer + `VendorSink` Mixpanel), API de agregados multi-tenant (`GET /v1/stats/*`), CI/CD (OIDC, subjects inmutables), y TODA la infra en Terraform (`infra/`): VM ClickHouse OSS (`vm-clickhouse-vio`, TLS Caddy, backups nocturnos a `saapivio`), 3 Container Apps (`ca-analytics-vio-*`) con identity user-assigned `id-analytics-vio` | `README.md` · `docs/EVENTS_CONTRACT.md` (canónico wire) · `infra/README.md` |
| **`vio-live/vio-web-sdk`** | `Vio.analytics` (F2): cola pre-init, anon/sesión rolling 30min, batch+sendBeacon, auto-funnel de comercio con snapshot pre-clear, `observeImpression`, sinks colector/GA4/DOM; `Configuration.eventsBase`; opción `autoTrack:false` para hosts con choke point propio; `VioCart.show()` emite `vio:open-cart`. **UI auto-instrumentada** (PR #20): `<vio-product-carousel>` trackea `component_impression`+`view_item_list` solo, `<vio-product-detail>` trackea `view_item`, `vio:product-click`→`select_item` — un host npm/Replit tiene el mismo auto-tracking que Vev sin escribir código | `src/core/analytics/analytics-manager.ts` (+ PRs #18/#19/#20) |
| **`vio-live/vev`** | F3: `analytics.ts` forwarda TODO por su choke point `trackEvent()` → `Vio.analytics` (core con `autoTrack:false` = cero doble conteo); GA4/inspector intactos; toggle "Send to Vio Analytics" en el Config; bundle vendored rebundleado. **El `vev deploy` del package sigue pendiente de OK explícito** | `src/components/analytics.ts` (+ PR #7) |
| **`tipiodevelopment/vio-backend`** | F4: espejo server-side vía outbox transaccional. **F6 read-side (PR #45)**: proxy `/api/analytics/vio/*` (authz de operador server-side → colector con token interno; el colector sigue ciego a roles de Vio) + cache TTL 60s/10s en `validateApiKey` (antes: 1 query PG por request de SDK) (`server/events/analytics-mirror.ts`, módulo `analytics` que el worker despacha por HTTP ANTES del switch de scope — nunca WS); `createShoppableAdActivation`/`createCartIntent` en transacción con el enqueue; dispatch exige `accepted===1` (202-con-rechazo = retry→dead-letter). Config: `ANALYTICS_EVENTS_URL` + `ANALYTICS_INTERNAL_TOKEN` (ya seteadas en los 3 `ca-api-vio-*`) | `server/events/analytics-mirror.ts` (+ PRs #43/#44) |
| **`vio-live/VioSwiftSDK`** | F5 iOS/tvOS: `VioAnalyticsClient` (contrato v1: UserDefaults ids, cola offline en Application Support, batch 20/5s+background, retries dedupe-safe, surface por target); `AnalyticsManager` conserva su API pública y forwarda mapeado; guard de PII (emails del checkout NUNCA al colector); Mixpanel-directo legacy queda para deprecar | `Sources/VioCore/Analytics/` (+ PR #15, base `develop`) |
| **`vio-live/VioKotlinSDK`** | F5 Android/Android TV: espejo 1:1 del cliente Swift (SharedPreferences, filesDir, coroutines, surface por leanback); mismo patrón de forwards en `AnalyticsManager` | `library/.../VioCore/analytics/` (+ PR #1) |
| Azure (sin repo) | VM ClickHouse viva con bases `vio_{development,staging,production}` · colector en 3 envs `ready` · espejo encendido en los 3 backends · Mixpanel: proyectos "Vio Analytics" (4055947, prod) y "Vio Analytics - Staging" (4055964; staging + pruebas locales) | Portal / `infra/` |

**Decisiones que superseden al plan original (con Angelo, 2026-08-19/20):**

1. **Repo propio `vio-live/vio-analytics`** — NO `vio-backend/analytics-server/`.
   El único argumento para colocarlo (compartir tipos) era débil: los demás SDKs
   están en otros repos y re-declaran igual; el backend solo necesita construir
   JSON (el colector valida todo). Independencia total de deploy/deps/fallos.
2. **Stack "lo mejor desde el principio"**: Fastify 5 (no Express) + TS estricto +
   Zod + `@clickhouse/client` (async inserts) + pino + pnpm + Vitest + Biome +
   Node 22. Rate-limit por api key, config fail-fast, liveness/readiness.
3. **`surface` + `host` separados**: `surface:'web', host:'vev'|'replit'|'custom'`
   (el plan decía `surface:'vev'`). Un SDK web, N hosts, sin bump de contrato.
   Nuevos campos: `sdk_version`, `context.variant` (A/B).
4. **Abstracción `VendorSink`**: Mixpanel es UNA implementación flag-gated;
   quitar/cambiar vendor = cambio server-side, cero releases de clientes, con
   backfill histórico posible desde ClickHouse.
5. **Infra nace en Terraform** (`infra/` en el repo, state propio en `viotfstate`)
   — primera pieza de plataforma en IaC; `ignore_changes` en imagen (CI es dueño
   de los deploys). Pendiente follow-up: importar `ca-api-vio-*` al mismo patrón.
6. **Requisito nuevo para F6**: API de agregados **multi-tenant** — mismos
   endpoints para el dashboard Vio y el de commerce, scope por rol
   (publisher ve sus surfaces, brand/sponsor solo su catálogo/participación).

Lo que sigue del doc es el plan original (2026-07-27) con el detalle del
contrato, DDL, mapeos y fases — sigue siendo la referencia de diseño, con las
6 correcciones de arriba.

## 0. Decisiones tomadas (con Angelo, 2026-07-27)

| Decisión | Elección |
|---|---|
| Dónde vive el código | **`vio-backend/analytics-server/`** — carpeta hermana de `socket-server/` (comparte tipos/schema para auth) |
| Store propio | **ClickHouse Cloud** (región EU). El dato crudo es de Vio desde el día 1 |
| Dashboards hoy | **Mixpanel vía fan-out server-side** — visualización inmediata sin construir UI; el dashboard de Vio se conecta después leyendo ClickHouse |
| GA4 | NO es parte del pipeline. Queda solo como feature client-side opcional para publishers (dataLayer, ya hecho en Vev) |
| Arquitectura | Los SDKs **nunca** hablan con Mixpanel/vendors: siempre `POST /v1/events` al colector propio, que reenvía. Cambiar vendor = cero cambios en clientes |
| Primer surface | Vev (web-sdk) → luego paridad iOS/tvOS/Android/Android TV |

## 1. Hechos del reconocimiento que condicionan el diseño

**vio-backend (socket-server):**
- Deploy real = **Azure Container Apps** (workflow `deploy.yml`: ACR `reachuprod2` → `az containerapp update ca-socket-server-<env>`), NO AKS — el chart Helm del repo es legado muerto. **No hay ingress compartido en git** → path-routing `/v1/events` requeriría Front Door/APIM en Azure. **Decisión: el analytics-server sale como Container App propio con su hostname** (p.ej. `events.vio.live`), y los SDKs lo reciben en config/bootstrap.
- Auth SDK: `validateApiKey` (routes.ts:5229) valida `X-Api-Key` contra `client_apps.api_key` **sin cache** (1 query/request). El analytics-server replica el lookup + cache TTL en memoria.
- **El contexto dinámico ya existe** en los endpoints v2: `GET /v2/mobile/campaigns/:id/components` devuelve por componente `campaignComponentId` (**la instancia**, clave para telemetría), `appPlacementId`, `locationId`, `componentTemplateId` (`id`), `sponsorId`, `commerce{}`. El SDK ya tiene en mano todo lo que un evento debe cargar — cero trabajo extra backend para el contexto.
- `broadcastId` = PK interna varchar (no el externalId). Canal WS es por campaña.
- Identidad canónica end-user: `(client_app_id, external_user_id)` → `end_users.id`. TV: además `tv_sessions.id`.
- **Outbox transaccional reusable** (`server/events/`): worker con `FOR UPDATE SKIP LOCKED`, retries, dead-letter. Extensible con `module:'analytics'` + un case HTTP en `dispatchOne` → espejo fiable de eventos server-side (activaciones, cart intents) hacia analytics. `shoppable_ad_activations` y `cart_intents` hoy se insertan SIN outbox; envolver en `db.transaction` + `enqueueEvent` es el cambio mínimo.
- DB principal: driver híbrido (localhost→`pg`, cloud→`@neondatabase/serverless`). El analytics-server usa `pg` directo solo para el lookup de api keys (read-only).

**Infra Azure verificada en vivo (az cli, 2026-07-27, tenant angelotipio / sub Sponsorship):**
- Plataforma Vio = 3 Container Apps `ca-api-vio-{development,staging,production}` en environments
  `cae-api-vio-*` (norwayeast), dominios `api-dev.vio.live` / `api-staging.vio.live` / `api.vio.live`.
  **`api-staging.vio.live` (el backend del demo Vev) ES el socket-server** — plataforma y demo
  comparten backend.
- Postgres **por environment**: `pg-api-vio-*` (Flexible Server PG16; dev/staging B1ms 32 GB, prod
  D2s_v3 64 GB), database `socket_server`. **Neon ya no existe** (el código híbrido de db.ts es
  vestigial). Config del app mínima: `NODE_ENV, PORT, DATABASE_URL, SESSION_SECRET` — **sin Redis
  en cloud** (fallback in-memory activo).
- Registry limpio: `acrvioapi.azurecr.io` (rg-vio-shared) — única imagen: `socket-server`. Los ACR
  `reachuprod2`/`reachuqa2` son legacy del stack commerce (⚠️ deploy.yml aún referencia reachuprod2
  pero la app viva corre de acrvioapi — task chip creado para migrarlo).
- Terraform (`viotfstate`) cubre SOLO vio-commerce (AKS + MySQL `vio-ecom-db-*`) — los Container
  Apps de plataforma se gestionan por CLI/workflow → crear `ca-analytics-vio-*` por CLI no genera drift.
- DNS de `vio.live` NO está en Azure DNS (registrar externo) → CNAMEs los agrega Angelo.
- Consecuencia para analytics-server: validar api keys contra el PG del env correspondiente
  (dev→`pg-api-vio-development`, etc.); como el demo Vev corre contra staging, el primer deploy
  útil es `ca-analytics-vio-staging`.

**vio-web-sdk:**
- Patrón para `Vio.analytics`: getter lazy en `VioFacade` (como `Vio.cart`/`Vio.checkout`), `AnalyticsManager extends EventTarget`, singleton anclado en `globalThis.__VIO_FACADE__` (garantiza una sola cola cross-chunk en Vev).
- `VioApi` es GET-only → hay que añadir `post()`. `sendBeacon` no permite headers → apiKey va en el body del beacon.
- **No existe session/anon id** en el SDK → crear `vio.anon.v1` (localStorage) + `vio.session.v1` (rolling 30 min), con guards SSR.
- `Configuration.get()` lanza pre-init → la cola debe aceptar eventos antes de `Vio.init` y resolver transporte al flush.
- El core debe seguir side-effect-free (contrato tsup/tree-shaking) → los listeners se instalan con llamada explícita (`Vio.analytics.start()`), no al importar.
- `vio:open-cart` NO existe en el SDK (lo inventó Vev) → emitirlo desde `VioCart.show()` para que `view_cart` funcione en cualquier host.
- Gotcha `purchase`: en Apple Pay el carrito se limpia ANTES del `vio:payment-success` → mantener snapshot pre-clear (ya resuelto en el módulo de Vev, replicar).
- Precedente: `vio-vev/src/components/analytics.ts` (337 líneas, 2026-07-27) ya implementa trackEvent + sinks + listeners + snapshot. Migrar al core ≈ mover ese archivo + añadir cola/batch/beacon/session.
- No hay entorno "staging" en `DEFAULT_URLS` → pasar `apiBase`/`eventsBase` override o añadir entrada.

## 2. Contrato de eventos v1 (el artefacto de portabilidad)

Un solo spec, N implementaciones (TS/Swift/Kotlin). Fuente de verdad: este doc +
tipos Zod en `vio-backend/shared/analytics-schema.ts`.

**Transporte:** `POST https://<events-host>/v1/events` — body `{ apiKey?, events: AnalyticsEvent[] }`
(≤500 por batch). Auth: header `X-Api-Key` o `apiKey` en body (beacon). Respuesta `202 {accepted:n}`.

**AnalyticsEvent:**
```jsonc
{
  "event_id": "uuid",              // generado por el cliente (dedupe server-side)
  "name": "add_to_cart",           // taxonomía cerrada v1 (abajo)
  "ts": "2026-07-27T12:00:00.000Z",// reloj cliente; el server añade received_at
  "surface": "vev",                // vev | web | ios | tvos | android | androidtv
  "session_id": "uuid",            // rolling session del SDK
  "anon_id": "uuid",               // persistente por dispositivo/navegador
  "external_user_id": null,        // si el partner identificó al usuario
  "context": {                     // TODO opcional — lo que se tenga en mano
    "campaign_id": 36,
    "broadcast_id": "abc-123",     // PK interna, no externalId
    "campaign_component_id": 512,  // LA instancia (clave de atribución)
    "app_placement_id": 20,
    "location_id": "home_top",
    "component_template_id": "banner-x",
    "sponsor_id": 1,
    "activation_id": 991,          // shoppable_ad_activations.id si vino de un ad
    "tv_session_id": 77,
    "content_url": "https://vg.no/artikkel"
  },
  "commerce": {                    // solo eventos de comercio
    "items": [{ "product_id": "408948", "name": "…", "brand": "…", "variant_id": "…", "price": 299, "quantity": 1 }],
    "value": 299, "currency": "NOK",
    "order_id": "…", "payment_method": "apple-pay"
  },
  "props": {}                      // extensión libre, no indexada
}
```

**Taxonomía v1:**
- Comercio (GA4-compatible, ya implementada en Vev): `view_item_list`, `select_item`,
  `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `purchase`.
- Engagement (lo nuevo, la mitad que al backend le falta): `component_impression`,
  `component_click`, `ad_impression`, `ad_click`, `poll_impression`, `contest_impression`.
- Sesión: `session_start`, `session_end` (con `duration_ms`).
- Server-side (espejo vía outbox, `surface:'server'`): `ad_activation`, `cart_intent`.

**Principio anti-doble-conteo:** el cliente solo reporta lo que el servidor no ve.
Votos/participaciones ya son verdad del servidor — no se re-trackean del cliente.

**El join de atribución** (la razón de ser de todo):
`ad_activation (server) × ad_impression (cliente) × cart_intent (server) × purchase (cliente/commerce)`
por `activation_id` / `campaign_component_id` / `session_id` = funnel completo por
campaña/sponsor/broadcast/placement. CTR e impresiones por campaña salen de
`component_impression` vs `component_click` por `campaign_component_id`.

## 3. Fases

### Fase 1 — Contrato + scaffold del servicio *(desbloquea todo lo demás)*
1. `shared/analytics-schema.ts` en vio-backend: tipos Zod del evento + taxonomía (validación server, tipos client via export).
2. `analytics-server/`: Express TS mínimo. `POST /v1/events`: valida Zod → auth api key (lookup `client_apps` por `pg` + cache TTL 60s) → 202 inmediato → buffer.
3. Writer ClickHouse: tabla `events` (MergeTree, `ORDER BY (client_app_id, ts)`, columnas tipadas para context + `props` JSON), insert batched (flush 1s/1000 rows). `docker-compose.dev.yml` con ClickHouse local.
4. Fan-out Mixpanel: cola en memoria → `import` batch API, async, nunca bloquea la ingesta, drop-with-log si Mixpanel cae.
5. `/health`, Dockerfile, workflow GH Actions (`ca-analytics-server-<env>`), Jest para validación/auth/batching.

### Fase 2 — `Vio.analytics` en vio-web-sdk *(paralelizable con F1 una vez fijado el contrato)*
1. `core/analytics/analytics-manager.ts`: cola pre-init, anon+session ids, enriquecimiento desde `bootstrapCache`, batch flush (5s / 20 eventos / `pagehide`→sendBeacon con apiKey en body), reintentos con backoff.
2. Sinks: colector (default on), dataLayer GA4 (toggle, para publishers), evento DOM `vio:analytics` (siempre, alimenta inspector).
3. `start()` explícito instala listeners internos (`vio:payment-success`, `vio:added-to-cart`, `vio:checkout-open`, cart `change`) — sin side-effects de módulo. Snapshot pre-clear para `purchase`.
4. Emitir `vio:open-cart` desde `VioCart.show()` (hoy solo existe en Vev).
5. `VioApi.post()`, export en `core/index.ts`, `tsc --noEmit`, primeros tests (`Configuration.reset()` ya está pensado para tests).

### Fase 3 — Vev consume el core
1. `vio-vev/src/components/analytics.ts` pasa de implementación a **adapter fino** sobre `Vio.analytics` (mantiene inspector + props del Config; añade toggle "Send to Vio").
2. Rebundle esbuild → `vio-sdk/index.js`, `vev build`, validación en editor con inspector, deploy del paquete **con OK de Angelo**.
3. Vev manda `surface:'vev'` + `content_url` del artículo. Datos fluyen: editor → colector → ClickHouse + Mixpanel. **Primer milestone demostrable.**

### Fase 4 — Espejo server-side (coordinación con el backend dinámico)
1. Envolver `createShoppableAdActivation` y `createCartIntent` en `db.transaction` + `enqueueEvent(module:'analytics')`.
2. Case nuevo en `dispatchOne` del outbox worker: POST al analytics-server (service token interno), reusa retries/dead-letter existentes.
3. Con esto ClickHouse tiene las DOS mitades del funnel y Mixpanel muestra atribución completa.

### Fase 5 — Paridad móvil/TV *(el "lo llevamos a todos")*
1. Spec v1 → `VioAnalytics` en VioSwiftSDK (iOS/tvOS) y VioKotlinSDK (Android/Android TV): misma taxonomía, cola persistida en disco (offline), batch al mismo endpoint, contexto de los endpoints v2 (`campaignComponentId` etc.) que los SDKs ya consumen.
2. Cae en el dominio de paridad iOS↔Kotlin (Angelo) — tarjetas Trello para Alan según playbook si corresponde.

### Fase 6 — Dashboard de Vio *(cuando haya tiempo; Mixpanel cubre mientras)*
1. API de agregados en analytics-server (funnel por campaña/sponsor/broadcast/placement, CTR, GMV atribuido) leyendo ClickHouse.
2. El dashboard SPA de socket-server consume esos endpoints.

## 4. Transversales
- **GDPR:** ClickHouse región EU; sin PII (anon_id aleatorio, external_user_id ya es opaco del partner); no loggear IPs completas; retención definible por partner.
- **Versionado:** spec v1 aditivo; campo nuevo = opcional; breaking → `/v2/events`.
- **Provisioning (Angelo):** cuenta ClickHouse Cloud (EU) · proyecto Mixpanel nuevo ("Vio Platform") · hostname (`events.vio.live` o similar) + creación del Container App (una vez; el workflow queda en git).

## 5. Ejecución con agentes
- Recon (hecho, 2 agentes Explore): condiciona §1.
- F1 y F2 en paralelo (agentes separados) una vez congelado §2.
- Review adversarial del contrato antes de implementar (un agente crítico: cardinalidad ClickHouse, dedupe, tamaño batch, clock skew).
- Code-review de cada fase antes de commit.

## 6. Estructura de datos — campo por campo

Quién llena cada campo (el criterio: **el host app no debe llenar casi nada** — el SDK
lo resuelve solo con lo que ya tiene):

| Campo | Tipo | Req | Quién lo llena | Fuente |
|---|---|---|---|---|
| `event_id` | uuid | ✔ | SDK | uuid v4 al crear el evento (dedupe) |
| `name` | enum | ✔ | SDK / call-site | taxonomía v1 cerrada |
| `ts` | ISO-8601 UTC ms | ✔ | SDK | reloj del cliente |
| `surface` | enum | ✔ | SDK | constante compilada (`vev`, `ios`, `tvos`, `android`, `androidtv`, `server`) |
| `session_id` | uuid | ✔ | SDK | rolling 30 min (se renueva con inactividad) |
| `anon_id` | uuid | ✔ | SDK | persistente por dispositivo/navegador |
| `external_user_id` | string | – | host app | `Vio.analytics.identify(id)` — las TV apps ya lo pasan al subscribe |
| `context.campaign_id` | int | – | SDK | bootstrap / response v2 |
| `context.broadcast_id` | string | – | SDK | PK interna (no externalId) |
| `context.campaign_component_id` | int | – | SDK | **response v2 — la clave de instancia** |
| `context.app_placement_id` | int | – | SDK | response v2 |
| `context.location_id` | string | – | SDK | slot declarado en el manifest |
| `context.component_template_id` | string | – | SDK | response v2 |
| `context.sponsor_id` | int | – | SDK | bootstrap / response v2 |
| `context.activation_id` | int | – | SDK | payload WS del shoppable ad |
| `context.tv_session_id` | int | – | SDK TV | response de `/v2/tv/broadcast/subscribe` |
| `context.content_url` | string | – | SDK web | `location.href`; en TV/mobile: contentId |
| `commerce.items[]` | array | comercio | SDK | cart/checkout (product_id, name, brand, variant_id, price, quantity) |
| `commerce.value` / `currency` | num / str | comercio | SDK | total + ISO-4217 |
| `commerce.order_id` | string | purchase | SDK | result del checkout |
| `commerce.payment_method` | enum | purchase | SDK | `apple-pay` \| `klarna` \| `vipps` \| … |
| `props` | objeto | – | libre | extensión no indexada |

**Server añade al ingerir:** `received_at` (reloj servidor), `client_app_id` (resuelto de
la api key — el cliente NUNCA manda su propio tenant id). Si `external_user_id` viene,
el server puede resolver `end_user_id` (join diferido, no en el hot path).

### 6.1 DDL ClickHouse (tabla única de eventos)

```sql
CREATE TABLE vio.events (
  event_id              UUID,
  name                  LowCardinality(String),
  ts                    DateTime64(3, 'UTC'),
  received_at           DateTime64(3, 'UTC') DEFAULT now64(3),
  surface               LowCardinality(String),

  client_app_id         UInt32,          -- resuelto server-side de la api key
  anon_id               String,
  session_id            String,
  external_user_id      String DEFAULT '',

  campaign_id           UInt32 DEFAULT 0,
  broadcast_id          String DEFAULT '',
  campaign_component_id UInt32 DEFAULT 0,
  app_placement_id      UInt32 DEFAULT 0,
  location_id           LowCardinality(String) DEFAULT '',
  component_template_id String DEFAULT '',
  sponsor_id            UInt32 DEFAULT 0,
  activation_id         UInt64 DEFAULT 0,
  tv_session_id         UInt64 DEFAULT 0,
  content_url           String DEFAULT '',

  items Nested(
    product_id String, name String, brand String,
    variant_id String, price Float64, quantity UInt16
  ),
  value                 Float64 DEFAULT 0,
  currency              LowCardinality(String) DEFAULT '',
  order_id              String DEFAULT '',
  payment_method        LowCardinality(String) DEFAULT '',

  props                 String DEFAULT '{}'   -- JSON crudo, no indexado
)
ENGINE = ReplacingMergeTree                    -- dedupe por sort key en merges
PARTITION BY toYYYYMM(ts)
ORDER BY (client_app_id, ts, event_id)
TTL toDateTime(ts) + INTERVAL 2 YEAR;          -- retención, ajustable por contrato
```

Decisiones: una sola tabla ancha (no una por tipo de evento — los funnels cruzan tipos);
`LowCardinality` en los enums; ids de contexto como columnas tipadas (no JSON) porque
son las dimensiones de TODA query; `props` como JSON string para lo no previsto;
`ReplacingMergeTree` + `event_id` en la sort key = reintentos del SDK no duplican.

### 6.2 Mapeo a Mixpanel (fan-out server-side)

Cada evento se aplana a una fila del batch `import` API:

```json
{
  "event": "add_to_cart",
  "properties": {
    "time": 1785150000123,
    "distinct_id": "anon-9f2c41ab",
    "$insert_id": "5f8a1e9c-…",
    "surface": "vev",
    "campaign_id": 36, "sponsor_id": 1,
    "campaign_component_id": 512,
    "content_url": "https://www.vg.no/artikkel-x",
    "product_id": "408948", "value": 299, "currency": "NOK"
  }
}
```

`distinct_id` = `external_user_id` si existe, si no `anon_id`. `$insert_id` = `event_id`
→ Mixpanel deduplica solo. Items multi-producto se aplanan al primero + `item_count`
(Mixpanel no modela arrays; el detalle fino vive en ClickHouse).

## 7. El mismo evento en las 4 plataformas

El wire-format es idéntico (snake_case JSON). Cada SDK lo tipa nativo:

**TypeScript (vio-web-sdk / Vev):**
```ts
export interface AnalyticsEvent {
  event_id: string
  name: EventName
  ts: string                       // ISO-8601 UTC
  surface: 'vev' | 'web'
  session_id: string
  anon_id: string
  external_user_id?: string
  context?: EventContext
  commerce?: CommercePayload
  props?: Record<string, unknown>
}
```

**Swift (VioSwiftSDK — iOS/tvOS):**
```swift
struct AnalyticsEvent: Codable {
  let eventId: UUID
  let name: EventName
  let ts: Date
  let surface: Surface             // .ios | .tvos
  let sessionId: String
  let anonId: String
  var externalUserId: String?
  var context: EventContext?
  var commerce: CommercePayload?
  // JSONEncoder con .convertToSnakeCase + .iso8601 → mismo wire format
}
```

**Kotlin (VioKotlinSDK — Android/Android TV):**
```kotlin
@Serializable
data class AnalyticsEvent(
  @SerialName("event_id") val eventId: String,
  val name: EventName,
  val ts: String,
  val surface: Surface,            // ANDROID | ANDROID_TV
  @SerialName("session_id") val sessionId: String,
  @SerialName("anon_id") val anonId: String,
  @SerialName("external_user_id") val externalUserId: String? = null,
  val context: EventContext? = null,
  val commerce: CommercePayload? = null,
)
```

**Mecánica por plataforma** (lo único que difiere — el contrato no cambia):

| Aspecto | web/Vev | iOS/tvOS | Android/Android TV |
|---|---|---|---|
| `anon_id` persiste en | `localStorage vio.anon.v1` | UserDefaults | SharedPreferences/DataStore |
| Sesión (30 min rolling) | localStorage + timers | UserDefaults + reset al foreground | idem + ProcessLifecycleOwner |
| Cola offline | memoria + respaldo localStorage (cap 500, drop oldest) | archivo JSONL en Application Support | Room/archivo + WorkManager |
| Triggers de flush | 20 eventos / 5 s / `pagehide`→sendBeacon | 20 / 5 s / `didEnterBackground` (URLSession background) | 20 / 5 s / `onStop` + WorkManager retry |
| Detección de impresión | IntersectionObserver ≥50 % ≥1 s | `onAppear` + timer 1 s | ViewTreeObserver / Compose `LaunchedEffect` |
| Contexto dinámico | `bootstrapCache` + props del bloque | response `/v2/.../components` (ya lo consumen) | idem |

**Reglas finas (iguales en todos):**
- `component_impression`: visible ≥50 % durante ≥1 s, **una vez por (session_id, campaign_component_id)**. Scroll-back no re-cuenta.
- Reintento de batch: backoff 2s/4s/8s, máx 3; el batch conserva los mismos `event_id` → el server deduplica.
- Clock skew: se guarda `ts` (cliente) y `received_at` (server); si difieren >5 min, las queries usan `received_at`.
- El batch va con `sent_at` top-level para medir el skew.

## 8. Dos escenarios end-to-end (ejemplos reales)

### Escenario A — artículo VG con bloques Vev (compra web)

Marte abre el artículo, scrollea hasta el carousel, toca el Olaplex, elige variante,
paga con Apple Pay. Eventos emitidos (campos clave):

```jsonc
// 1. El carousel entra al viewport (≥50 %, 1 s)
{ "name": "view_item_list", "surface": "vev",
  "session_id": "s-01", "anon_id": "a-77",
  "context": { "sponsor_id": 1, "content_url": "https://www.vg.no/artikkel-x" },
  "commerce": { "items": [ { "product_id": "408948", "price": 299 },
                           { "product_id": "408912", "price": 199 } ] },
  "props": { "list_name": "Sommerfavoritter" } }

// 2. Click en el card → abre detalle
{ "name": "select_item", "commerce": { "items": [{ "product_id": "408948" }] } }
{ "name": "view_item",  "commerce": { "items": [{ "product_id": "408948" }], "value": 299, "currency": "NOK" } }

// 3. Agrega la variante 100 ml
{ "name": "add_to_cart",
  "commerce": { "items": [{ "product_id": "408948", "variant_id": "100ml", "price": 299, "quantity": 1 }],
                "value": 299, "currency": "NOK" } }

// 4. Apple Pay desde el cart
{ "name": "begin_checkout", "commerce": { "value": 299, "currency": "NOK" },
  "props": { "payment_type": "apple-pay" } }
{ "name": "purchase",
  "commerce": { "items": [{ "product_id": "408948", "variant_id": "100ml", "price": 299, "quantity": 1 }],
                "value": 299, "currency": "NOK", "order_id": "ord_8812", "payment_method": "apple-pay" } }
```

Todos comparten `session_id: "s-01"` → el funnel se arma solo. La pregunta "¿este
artículo convierte?" se responde:

```sql
SELECT
  uniqIf(session_id, name = 'view_item_list') AS vieron,
  uniqIf(session_id, name = 'add_to_cart')    AS agregaron,
  uniqIf(session_id, name = 'purchase')       AS compraron,
  sumIf(value,       name = 'purchase')       AS gmv_nok
FROM vio.events
WHERE content_url = 'https://www.vg.no/artikkel-x'
  AND ts >= now() - INTERVAL 30 DAY;
```

### Escenario B — shoppable ad en Android TV durante un partido (funnel mixto cliente+servidor)

Minuto 63, el slot-scheduler dispara el ad del sponsor. La TV lo muestra, el usuario
marca "comprar" con el control.

```jsonc
// 1. SERVIDOR (outbox → analytics): el ad se disparó
{ "name": "ad_activation", "surface": "server",
  "context": { "campaign_id": 36, "broadcast_id": "match-778", "sponsor_id": 4,
               "activation_id": 991, "campaign_component_id": 512 },
  "commerce": { "items": [{ "product_id": "50221", "name": "Trikot 2026", "price": 899 }] },
  "props": { "source": "slot-scheduler", "trigger": "match_minute:63" } }

// 2. CLIENTE (Kotlin TV SDK): el ad se vio en pantalla
{ "name": "ad_impression", "surface": "androidtv",
  "session_id": "s-tv-31", "anon_id": "a-tv-90", "external_user_id": "viaplay-8823",
  "context": { "campaign_id": 36, "broadcast_id": "match-778",
               "activation_id": 991, "tv_session_id": 77 } }

// 3. SERVIDOR: el usuario marcó intención de compra (ya existe en cart_intents; espejo)
{ "name": "cart_intent", "surface": "server",
  "external_user_id": "viaplay-8823",
  "context": { "campaign_id": 36, "activation_id": 991, "tv_session_id": 77 },
  "commerce": { "items": [{ "product_id": "50221" }] },
  "props": { "delivery_mode": "websocket" } }
```

Performance del ad — cliente y servidor unidos por `activation_id`:

```sql
SELECT
  countIf(name = 'ad_impression') AS impresiones,
  countIf(name = 'cart_intent')   AS intents,
  round(intents / impresiones * 100, 1) AS intent_rate_pct
FROM vio.events
WHERE activation_id = 991;
```

Y el CTR por componente de campaña que el dashboard mostrará:

```sql
SELECT campaign_id, campaign_component_id,
  countIf(name = 'component_impression') AS impressions,
  countIf(name = 'component_click')      AS clicks,
  round(clicks / impressions * 100, 2)   AS ctr_pct
FROM vio.events
WHERE client_app_id = 12 AND ts >= now() - INTERVAL 7 DAY
GROUP BY campaign_id, campaign_component_id
ORDER BY impressions DESC;
```

## 9. API del SDK (developer experience)

```ts
// El host (Vev Config, app iOS, app TV) hace UNA cosa:
Vio.init({ apiKey })            // como siempre
Vio.analytics.start()           // instala listeners + abre sesión (explícito, sin side-effects)

// Identificación opcional (apps de partner con login):
Vio.analytics.identify("viaplay-8823")

// Eventos automáticos (sin código del host):
//   comercio: add_to_cart / begin_checkout / purchase (de los eventos internos del SDK)
//   sesión:   session_start / session_end

// Eventos manuales (los surfaces los llaman donde renderizan):
Vio.analytics.track("component_impression", { context: { campaignComponentId: 512, ... } })

// Helper de impresiones (web): observa el elemento y trackea solo
Vio.analytics.observeImpression(element, { campaignComponentId: 512 })
```
