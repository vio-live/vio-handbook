---
title: "SDKs móviles y tiempo real: qué usan de la Vio API, qué les da el micro y qué se rompe hoy"
last-updated: 2026-10-15
owner: angelo
status: live
---

# SDKs móviles y tiempo real

Auditoría del 15/10 (cuatro agentes de solo lectura sobre las ramas por defecto de cada repo).
Contexto: vio-backend se retira; el micro de campañas (`api(-staging).vio.live`) sirve
`/v2/mobile/config` y `/v2/mobile/surface` y responde **410** a todo lo demás
(`src/http/retired-routes.ts`). Decisión de Angelo (15/10): broadcasts, engagement (polls,
contests, chat) y lineup **no se migran**; lo que sí hace falta es que los SDKs móviles puedan
**activar campañas y componentes**, con tiempo real limpio cuando se tomen los SDKs, **sin romper
lo que hacen hoy**. La propuesta de cómo hacerlo está en [ADR-0033](../decisions/0033-activacion-en-tiempo-real-desde-el-micro.md).

## 1. Lo que cada SDK usa hoy

| SDK (rama por defecto) | Config / activación | Tiempo real | Otros | Estado contra el micro |
|---|---|---|---|---|
| **iOS** `VioSwiftSDK` main (29/09) | `/v1/sdk/config`, `/v1/sdk/campaigns`, `/v1/offers` (borrados de vio-backend el **29/04**: 404 desde entonces), `/v1/campaigns/:id/config` | WS `{webSocketBase}/ws/:campaignId` con `X-API-Key` = key de **commerce**; entiende `campaign_*`, `component_status_changed`, `component_config_updated`; **no contesta `ping`** | `/v1/sdk/broadcast` (su 410 aborta también la configuración de campañas), `/v1/engagement/*`, GraphQL `graph-ql-dev` en todos los entornos, Mixpanel directo | Todo 404/410. Reconecta el WS **cada ~2,5 s sin tope** (`CampaignWebSocketManager.swift:69`) y otro WS legacy a replit cada 5 s. `origin/develop` (20/08, 180 commits sin mergear) ya habla v2 (`/v2/mobile/config`, `/components`, `placement_*`, `subscribe`) |
| **Android** `VioKotlinSDK` main (29/09) | `/v2/mobile/config` (caché 5 min; si falla conserva el estado viejo), `/v2/mobile/campaigns/:id/components` (vacía los componentes antes: "el WS es la fuente"), `POST /v2/mobile/components/manifest` | WS `{endpoints.webSocketBase}/ws/:id?userId&contentId` con `X-API-Key`, manda `identify` y `pong`; entiende `campaign_*` y los `component_*` legacy, **ignora `placement_*`**; fuera de PRODUCTION fuerza `ws://` | `register-device` (410), `/v1/sdk/broadcast` y `/v1/engagement/*` (degradan a `false`/`[]`), analytics a `events(-staging)/v1/events` | Config OK; `components: []`; WS 410 → **bucle cada 2 s sin tope** (`CampaignWebSocketManager.kt:203`) |
| **React Native** (beta, 29/09) | `/v2/mobile/config`, `/components` | WS sin header, `identify` + `subscribe{placements,cart_intent}`, `pong`; solo `placement_*` → refetch REST; **máximo 5 reintentos** | `register-device`, `cart-intent` (lanzan error), `/v2/mobile/broadcasts/*` (410), GraphQL | Config OK; carrusel vacío; WS se rinde a los 5 intentos |
| **Flutter** (abril) | — | — | Solo GraphQL con `Authorization: apiKey` | No toca la Vio API |
| **Android TV** (abril) | — | WS de `/v2/tv/broadcast/subscribe` (`shoppable_ad`, `product`) | `/v2/tv/cart-intent`, `session/heartbeat`, host por defecto `api-dev` | Todo es broadcast/TV: retirado |
| **Web** `vio-web-sdk` (para comparar) | `/v2/mobile/config`, `/components` | ninguno (sin WS) | analytics a `/v1/events` | Funciona (Vev y Aller) |

**Ningún SDK hace polling**: todos toman una foto REST al arrancar y después dependen del WS.
Swift elige la variante del componente por las **claves** del `config`, no por `type`
(`productIds` tiene que ir como `[String]`; un número rompe el decode y el componente se descarta).

## 2. Cómo era la activación en vio-backend (lo que los SDKs esperan)

- **Socket**: upgrade en `/ws/:campaignId` (o `/ws`, sala 0), `?userId=`, **sin auth**. `{type:'ping'}` JSON
  cada 20 s; a los 3 sin `pong`, `terminate()` (~80 s). Frames del cliente: `pong`, `identify`, `subscribe{modules}`;
  sin `subscribe` se recibe todo (Kotlin no lo manda).
- **Eventos de activación**: `placement_status_changed {module:'placements', serverTimestamp, campaignId, appPlacementId,
  campaignComponentId, status}` (dashboard, por outbox), `placement_activation_swapped`, `placement_config_updated`,
  `campaign_paused/resumed {campaignId, timestamp}` (directo), `campaign_started/ended` (polling cada 30 s con
  ventana de 60 s, en cada réplica; `campaign_ended` también al conectar).
- **Modelo híbrido**: el evento es delgado (ids + estado) y el SDK hace **refetch** de
  `GET /v2/mobile/campaigns/:id/components`; al reconectar, refetch completo.
- **La programación por horario de componentes nunca funcionó**: `scheduler.ts` pasaba el slug de la plantilla
  como PK numérica (NaN) y no actualizaba ni emitía nada; nadie escribía `scheduled_time`/`end_time`. Toda la
  activación real era manual desde el dashboard. El legacy `component_status_changed` (el único que entienden
  Kotlin e iOS main) **solo lo emitía ese scheduler roto**: en esos SDKs la activación en vivo no llegaba.
- **El outbox garantizaba encolar, no entregar**: el `publish` a Redis iba sin `await` y se tragaba errores; sin
  Redis y con 2 réplicas, solo los sockets del nodo que procesaba la fila recibían el evento.
- Push (`register-device`, APNs) era solo para `cart_intent`; no tiene relación con la activación.

## 3. Lo que hay en Commerce

- **El micro de campañas no tiene tiempo real**: la activación es una **lectura** (`campaignStatus(now)`:
  `ended` > `paused` > `scheduled` > `active`, ventana `[startsAt, endsAt)`), sin estado guardado, sin cron,
  sin eventos, sin pub/sub. En Commerce no existe el "componente": lo equivalente es la asignación
  **slot → campaña** con ventana (`surface_campaign_slot`). `components[]` va siempre vacío.
- El micro **anuncia `endpoints.webSocketBase`** y responde **410** en `/ws` y `/ws/:id` (test que lo fija:
  `test/contract/security-and-routes.spec.ts:524`). De ahí los bucles de reconexión.
- Sin campaña activa, `/v2/mobile/config` responde **404 `NO_ACTIVE_CAMPAIGN`**; vio-backend respondía 200 con
  la primera campaña y sus flags. En Kotlin y RN, sin bootstrap la key de commerce no llega y GraphQL cae a la
  key de la surface: **se pierde el catálogo y el checkout**, no solo la campaña.
- El socket de `api-ecom` (socket.io en **base-api**; el "módulo socket" de `api` es un relay HTTP) **no sirve
  para esto**: no tiene auth, emite a todos los conectados y tres `POST` sin auth pueden inyectar eventos
  (`socketRouter.js:15-19,31`, `userRouter.js:791`). Es un hallazgo de seguridad aparte.
- Azure Service Bus solo se usa como **colas** (productos y pedidos); Redis del kernel no tiene pub/sub.
- Istio deja pasar el upgrade a WebSocket; falta verificar el `timeout` del VirtualService (vive en
  `vio-kubernetes-config`). El LB de Azure corta idle a los 4 min: ping ≤ 30 s.

## 4. Lo que se rompe hoy y lo que no

| Qué | Efecto | Gravedad |
|---|---|---|
| WS 410 | iOS y Kotlin reconectan cada 2–2,5 s para siempre (batería, tráfico). Solo el equipo usa los SDKs móviles en staging | Media, crece con cada instalación |
| `components: []` | Kotlin, RN e iOS develop no pintan placements | Alta cuando se tomen los SDKs; hoy nadie los usa en real |
| 404 `NO_ACTIVE_CAMPAIGN` | Kotlin y RN pierden Commerce entero, no solo la campaña | Alta |
| iOS main en v1 | Todo 404/410; degrada en silencio con `isCampaignActive=true` | Hay que decidir la rama antes de fijar el contrato |
| `component_config_updated` sin `status` | iOS main y Kotlin lo leen como inactivo y ocultan el componente | A tener en cuenta al emitir |
| `/v1/sdk/broadcast` 410 | En iOS aborta también la configuración de campañas | Solo iOS main |

## 5. Contrato mínimo para que los SDKs actuales activen (sin release de SDK)

1. `/v2/mobile/config`: conservar la forma; decidir el caso sin campaña activa (200 con flags en vez de 404);
   `endpoints.webSocketBase` tiene que apuntar a un host que **sí** sirva WS.
2. `/v2/mobile/campaigns/:id/components` con `components[]` derivado de los slots: `id` (string),
   `campaignComponentId`, `type`/`componentType`, `name`, `status:'active'`, `locationId` (= nombre del slot),
   `sponsorId`, `sponsor{…}`, `commerce{apiKey, channelId}`, `config` mergeado con `productIds` como strings.
3. WS `/ws/:campaignId` en el host de `webSocketBase`: `?userId&contentId`, header `X-API-Key` opcional
   (RN no manda nada; iOS main manda la key de commerce), `identify`/`subscribe`/`pong`, `ping` sin cortar.
4. Eventos: `campaign_started/ended/paused/resumed`; para Kotlin e iOS main los legacy `component_status_changed`
   y `component_config_updated` **con `status`**; para RN e iOS develop los `placement_*`.
5. `POST /v2/mobile/components/manifest` ya es compatible.

**Nuevo (con release de SDK):** leer `campaigns[]`/`slots[]`, `locationId` en los eventos, un WS **por surface**
(para enterarse de `campaign_activated` aunque la config haya dado 404), un sustituto del flujo `contentId`,
tope de reintentos en el WS, y decidir la rama de iOS (`develop`).

## Fuentes
- Informes de los cuatro agentes (15/10): inventario de SDKs, protocolo de vio-backend, dominio del micro y
  opciones en Commerce. Repos: `VioSwiftSDK`, `VioKotlinSDK`, `react-native-sdk`, `flutter-sdk`, `AndroidTV-Vio`,
  `vio-web-sdk`, `vio-backend`, `vio-campaigns-microservice`, `vio-api-microservice`, `vio-base-api`.
