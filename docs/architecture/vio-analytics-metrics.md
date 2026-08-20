---
title: "Vio Analytics — métricas por surface (definiciones v1)"
last-updated: 2026-08-21
owner: angelo
status: draft
---

# Vio Analytics — métricas por surface (definiciones v1)

Qué medimos en cada tipo de surface, con fórmula exacta sobre `vio.events`
(las dimensiones son las columnas tipadas del contrato — [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md)).
Este doc es la fuente para los endpoints de `/v1/stats` que faltan y para
las vistas de los dashboards (F6, en pausa).

**Mapeo surface (plataforma técnica) ↔ tipo de surface del modelo de
plataforma** (platform-definition): `web`+`host=vev` = Vev · `web`+otros
hosts = web/editorial · `ios`/`android` = app móvil · `tvos`/`androidtv` =
TV · `server` no es surface de usuario (alimenta atribución). Cuando el
backend materialice Surfaces como entidad con id, se agrega
`context.surface_id` al contrato (aditivo) y estas métricas ganan esa
dimensión sin cambiar fórmulas.

## Núcleo común (toda surface, la base de todo dashboard)

| Métrica | Fórmula (sobre `events FINAL`, filtrado por surface/período) |
|---|---|
| Sesiones | `uniqExact(session_id)` |
| Usuarios (dispositivos) | `uniqExact(anon_id)` — identificados: `uniqExact(external_user_id) WHERE != ''` |
| Impresiones | `countIf(name IN ('component_impression','ad_impression'))` |
| Clicks | `countIf(name IN ('component_click','ad_click','select_item'))` |
| **CTR** | clicks / impresiones |
| Funnel comercio | `view_item → add_to_cart → begin_checkout → purchase` (tasa por etapa = countIf etapa N / countIf etapa N−1) |
| **Conversión de sesión** | `uniqExactIf(session_id, name='purchase') / uniqExact(session_id)` |
| GMV | `sumIf(value, name='purchase')` |
| AOV | GMV / `countIf(name='purchase')` |
| Por componente | todo lo anterior `GROUP BY campaign_component_id` (la instancia — CTR y conversión por placement) |

## Web / editorial (surface `web`, host ≠ vev) y Vev (host `vev`)

La pregunta de negocio: **¿qué contenido convierte?** (el argumento para el
publisher).

| Métrica | Fórmula / dimensión |
|---|---|
| Funnel por artículo | núcleo común `GROUP BY content_url` — la vista estrella editorial |
| CTR de lista | `countIf(select_item) / countIf(view_item_list)` (por `props.list_name` cuando exista) |
| Comparativa de hosts | núcleo común `GROUP BY host` (vev vs replit vs custom — mismo SDK, ¿dónde rinde más?) |
| Profundidad de sesión | `count() / uniqExact(session_id)` (eventos por sesión) |

## Apps móviles (`ios`, `android`)

La pregunta: **¿el commerce embebido funciona dentro de la app del
partner?** Único surface con funnel de compra nativo completo (Apple Pay).

| Métrica | Fórmula |
|---|---|
| Funnel nativo completo | núcleo común + `payment_method` como dimensión del purchase |
| Retención D1/D7 | cohorte por `anon_id`: primer `session_start` en día D, actividad en D+1/D+7 (`uniqExact(anon_id)` interseccionado) — necesita endpoint nuevo |
| Usuarios identificados | % de sesiones con `external_user_id` (mide adopción del `identify()` del partner) |

## TV (`tvos`, `androidtv`) — el funnel mixto cliente+servidor

La pregunta: **¿el shoppable ad del minuto 63 vendió?** Acá los eventos del
espejo server (`ad_activation`, `cart_intent`) son la mitad del cuento.

| Métrica | Fórmula |
|---|---|
| Fill rate del ad | `countIf(ad_impression) / countIf(ad_activation)` por `activation_id` — ads disparados que llegaron a pantalla |
| **Intent rate** | `countIf(cart_intent) / countIf(ad_impression)` — la métrica que se le vende al sponsor |
| **Conversión cross-device** | `cart_intent` (TV) → `purchase` (móvil/web) unidos por `external_user_id` en ventana de 24–48h — LA métrica diferencial de Vio; necesita endpoint nuevo con join por usuario |
| Por broadcast/minuto | todo lo anterior `GROUP BY broadcast_id` (+ `props.trigger` del activation para el minuto) |

## Reglas transversales (no negociables, ya cableadas)

- Impresión = regla del contrato (≥50% ≥1s, 1×/sesión+componente) — los
  números son comparables ENTRE surfaces por construcción.
- Votos/participaciones de engagement NO salen de events (son verdad del
  Postgres del backend); los dashboards los mezclan desde su propia DB.
- Lecturas con `FINAL` (dedupe) y fallback a `received_at` si el skew de
  reloj supera 5 min.

## Cómo se ajusta una métrica (las tres capas, de la más barata a la más profunda)

1. **Query param, sin deploy** — cada endpoint expone sus perillas:
   `?windowHours=` (ventana de atribución cross-device, default 48h, tope
   14d) · `?cohortDays=` y `?surface=` (retention) · `?limit=` y
   `?minImpressions=` (content) · `?days=` (todos). Para experimentar.
2. **`vio-analytics/src/stats-definitions.ts`** — el archivo ÚNICO con los
   defaults y las agrupaciones de eventos (qué cuenta como impresión, qué
   cuenta como click, las etapas del funnel). Un edit + deploy retunea todos
   los dashboards de forma consistente. Al cambiar algo acá, actualizar
   ESTE doc (son espejo).
3. **Redefinición retroactiva** — como el crudo vive en ClickHouse propio,
   una fórmula nueva se recalcula sobre TODO el histórico, no solo hacia
   adelante (imposible en herramientas vendor). Cambiar de opinión es
   barato: por eso el contrato de EVENTOS es estricto y las MÉTRICAS son
   blandas.

## Estado de los endpoints (2026-08-21)

| Endpoint | Estado | Perillas |
|---|---|---|
| `/v1/stats/overview` · `components` · `campaigns/:id/funnel` | ✅ | `days` |
| `/v1/stats/content` (web/Vev) | ✅ | `days`, `limit`, `minImpressions` |
| `/v1/stats/campaigns/:id/ads` (TV) | ✅ | `days` |
| `/v1/stats/cross-device` (TV→móvil) | ✅ | `days`, `windowHours` |
| `/v1/stats/retention` (apps) | ✅ | `cohortDays`, `surface` |
| `context.surface_id` en el contrato | ⬜ cuando Surfaces sea entidad (aditivo) |
| `context.content_title` (snapshot legible) | ✅ 2026-08-21 — el borrado es permanente sin papelera: el título capturado en el evento mantiene los reportes legibles aunque el artículo muera. Auto en web (`document.title`); nativos lo pasan en context (pendiente en Swift/Kotlin, aditivo) |

El proxy del dashboard (vio-backend#45, **en pausa** por revisión de Angelo)
expone los tres primeros; al retomarse F6 se extiende a los nuevos.
