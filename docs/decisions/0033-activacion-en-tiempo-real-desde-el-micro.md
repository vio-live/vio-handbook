---
title: "0033 — Activación de campañas en tiempo real desde el micro: estado + outbox primero, WebSocket por surface después"
date: 2026-10-15
status: proposed
owner: angelo
deciders: [angelo]
---

# 0033 — Activación de campañas en tiempo real desde el micro

## Contexto

Los SDKs móviles se enteraban de que una campaña o un componente se activa por el WebSocket de
vio-backend (`/ws/:campaignId`). Ese backend se retira. El micro de campañas de Commerce anuncia un
`webSocketBase` pero responde 410 en `/ws`, y en él la activación es una **lectura** (`campaignStatus(now)`):
no hay estado guardado, ni scheduler, ni eventos. Estado completo en
[sdks-moviles-y-tiempo-real](../architecture/sdks-moviles-y-tiempo-real.md).

Angelo (15/10): broadcasts, engagement y lineup no se migran. Hace falta algo **limpio** para activar
campañas y componentes desde los SDKs móviles cuando se tomen, y que **no rompa lo que ya hacen**.

Restricciones que salen de la auditoría:
- Sin campaña activa la config da 404, así que un SDK en ese estado no tiene `campaignId`: el canal tiene
  que ser **por surface** (la key), no por campaña.
- El micro corre con 1 réplica en QA y 2 en prod, con rolling `maxUnavailable: 0`: cualquier emisor
  necesita fan-out entre réplicas y reconexión limpia.
- vio-backend emitía "lo que cambió en el último minuto" con un `setInterval` por réplica: si se perdía un
  tick (pod reiniciado, QA apagado), se perdía el evento. No se copia.
- Las tablas nuevas pasan por el kernel (`package-database`) y un release de los 7.

## Alternativas

| Opción | Compatibilidad con los SDKs | Infra | Riesgo |
|---|---|---|---|
| **(a) WebSocket nativo en el micro** (`/ws` por surface + `/ws/:campaignId` como alias) | La más alta: misma URL y mismo header que ya construyen Kotlin, iOS y RN | Nada nuevo en Istio (verificar `timeout`); fan-out por outbox en MySQL o Redis pub/sub | Reconexión en masa en cada deploy; `ws://` de Kotlin fuera de prod; QA apagado de noche |
| (b) SSE `GET /v2/mobile/events` | Cliente nuevo en cada SDK | HTTP normal, sin upgrade | Bajo |
| (c) Reutilizar socket.io de base-api | Nula (otro host, otro protocolo) | Ya existe | **Alto**: sin auth ni rooms, cualquiera recibe e inyecta eventos de todas las surfaces |
| (d) Polling de `/v2/mobile/config` con ETag | Los SDKs ya leen la config; falta el refetch periódico y al volver a foreground | Ninguna | Latencia = intervalo; carga de DB con muchos dispositivos |
| (e) Push APNs/FCM | No sirve para UI en foreground | APNs/FCM | Descartada |

## Decisión (propuesta)

**(a) WebSocket nativo en el micro, alimentado por eventos propios del micro, con (d) como base y
fallback.** El transporte es lo último: primero el micro tiene que **producir** el evento.

### Lo que hace falta en el micro, sea cual sea el transporte

1. **Estado y outbox** (vía kernel): `surface_campaign_state(campaign_id, surface_id, status, updated_at)`,
   `surface_slot_state(assignment_id, open)` y `surface_event(id AI, surface_id, campaign_id, type, payload, created_at)`
   con purga a las 24 h. **La config no los lee**: sigue calculando con `campaignStatus(now)`.
2. **Un único `reconcile(surfaceId)`**, idempotente y sin líder: en una transacción,
   `UPDATE …state SET status=? WHERE id=? AND status=<anterior>` y, solo si afecta una fila, `INSERT` en el outbox.
   Usa las mismas funciones que la config (`campaignStatus`, `isWindowOpen`).
3. **Disparadores**: tras el commit de cada escritura (create/update/remove/togglePause/replaceSlots de campaña;
   update/remove/regenerateKey/replaceChannels de surface; `PATCH /api/sponsor/me`) → `reconcile` + `config_changed`;
   un ticker de 15–30 s en cada pod y un reconcile completo al arrancar (recupera lo perdido con QA apagado).
4. **Eventos**: `campaign_activated`, `campaign_deactivated{reason: paused|ended|scheduled|deleted}`,
   `slot_activated`/`slot_deactivated` (el antiguo "componente"), `config_changed`, `surface_disabled`.
   Payload mínimo: ids, estado y fechas; el SDK vuelve a pedir la config. **Nunca keys de channel por WS.**
5. **Compatibilidad**: los SDKs actuales entienden `campaign_started/ended/paused/resumed`, `component_status_changed`
   (Kotlin, iOS main) y `placement_*` (RN, iOS develop). El emisor traduce los eventos nuevos a esos nombres
   mientras haya SDKs que los necesiten; `/v2/mobile/config` conserva sus claves top-level (lo nuevo va dentro de
   `endpoints`, por ejemplo `endpoints.events`).

### Fases

| Fase | Qué | Cuándo |
|---|---|---|
| F0 | Documentar el polling (refetch al volver a foreground y cada 60 s con `If-None-Match`); caché de 5–10 s por surface en `/v2/mobile/config`; decidir 200-con-flags en vez de 404 sin campaña activa | Ya, sin tocar SDKs |
| F1 | Estado + `reconcile` + outbox en el micro, con tests; los eventos solo a log y métricas | Antes de tocar los SDKs |
| F2 | `/ws` (por surface) y `/ws/:campaignId` (alias) con snapshot al conectar + tail del outbox, `ping` cada 25 s, cierre 1012 en SIGTERM; quitar el 410 y el test que lo fija; `components[]` derivado de los slots | Al tomar los SDKs móviles |
| F3 | Los SDKs conectan **por surface**, con tope de reintentos; polling como fallback; se decide la rama de iOS (`develop`) | Con los SDKs |
| F4 | Redis pub/sub en lugar del tail del outbox, solo si la latencia o la escala lo piden | Si hace falta |

## Consecuencias

- Hasta F2, iOS y Kotlin siguen reconectando contra el 410 cada 2–2,5 s. Nadie los usa en real hoy; si molesta
  antes, un `/ws` que acepte la conexión y solo haga `ping` corta el bucle sin comprometer el diseño.
- El backend de F1 sirve igual para SSE: la elección de transporte es reversible.
- Un release del kernel (tablas nuevas) y, en Istio, verificar el `timeout` de la ruta y mantener `ping ≤ 30 s`.
- El socket de base-api queda como está, pero su falta de auth es un hallazgo de seguridad que hay que tratar aparte.

## Lo que no se hace

- No se portan el scheduler, la presencia en Redis, `cart_intent`, `register-device`, APNs, `config:updated`,
  `scheduled_components`, shoppable ads, lineup, polls, contests ni chat.
- No se reutiliza el socket.io de base-api.
