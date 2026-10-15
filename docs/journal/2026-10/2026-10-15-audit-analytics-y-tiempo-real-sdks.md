---
date: 2026-10-15
session: afternoon
participants: [angelo, claude]
status: live
---

# Session — 2026-10-15 — Audit de analytics y de tiempo real para los SDKs; arreglos de analytics

## Goal
Angelo, tras el release del kernel: "me interesa que pulas analytics para que funcione. Los sockets, excepto
broadcasts, engagement, lineup, no es necesario; pero podemos ir añadiendo ya algo limpio con los sockets
cuando tomemos los SDKs de mobile, ideal que no rompa lo que hay en los SDKs, para activar campañas,
componentes. Haz un audit y pide a otros agentes que vean cómo migrar."

## Done

### El audit (cuatro agentes de solo lectura, en paralelo, sobre las ramas por defecto)
1. **Analytics de punta a punta** (contrato, web SDK, Vev, vio-backend, base-api, webapp, micro): 14 huecos.
2. **Inventario de los SDKs móviles** (Swift, Kotlin, Android TV, React Native, Flutter): cada ruta y evento,
   clasificado; qué pasa hoy con los 410.
3. **Protocolo real de vio-backend**: mensajes WS con payload, ciclo de vida del componente, scheduler.
4. **Lo que hay en Commerce** para tiempo real y opciones.

Resultado en el handbook:
- [sdks-moviles-y-tiempo-real](../../architecture/sdks-moviles-y-tiempo-real.md): el estado real, tabla por SDK,
  lo que se rompe hoy y el contrato mínimo.
- [ADR-0033](../../decisions/0033-activacion-en-tiempo-real-desde-el-micro.md) (**propuesto**, decide Angelo):
  estado + `reconcile` + outbox en el micro primero; WebSocket por surface después; polling como base.

**Lo que más cambia la foto:**
- En vio-backend **la activación por horario nunca funcionó** (el scheduler pasaba un slug como PK y no emitía
  nada); toda la activación real era manual desde el dashboard. Kotlin e iOS `main` solo entienden el evento
  legacy que ese scheduler roto emitía: para ellos la activación en vivo **no llegaba**.
- El micro anuncia `webSocketBase` y responde 410 en `/ws`: iOS y Kotlin reconectan cada 2–2,5 s sin tope.
- En el micro la activación es una lectura pura: no hay estado, ni eventos, ni pub/sub. "Componente" no existe;
  el equivalente es el slot con ventana. Sin campaña activa la config da 404 y Kotlin/RN pierden Commerce entero.
- El socket de base-api no tiene auth y emite a todos: no se reutiliza (y es un hallazgo de seguridad aparte).
- iOS `main` sigue entero en v1 (rutas borradas desde abril); `origin/develop` lleva 180 commits sin mergear.

### Analytics: lo que se arregló hoy (de los 14 huecos)

| Hueco | Repo / PR | Estado |
|---|---|---|
| 2 · `sponsor_id`/`campaign_id` del payload sin validar (con una key pública se inflan las stats de otra brand) | micro [#12](https://github.com/vio-live/vio-campaigns-microservice/pull/12): `/v2/mobile/surface` devuelve `sponsorIds` y `campaignIds` de **todas** las campañas de la surface (pertenencia, no vigencia) | ✅ QA |
| 3 · `campaign_id` siempre 0 (el SDK leía un `campaignId` que la config nunca tuvo) | vio-web-sdk [#80](https://github.com/vio-live/vio-web-sdk/pull/80) (**0.21.0**): `resolveCampaignId` | ✅ `main` |
| 6 · `order_id` incoherente en `purchase` (cuatro emisores, tres formas; mezclaba el id de checkout de Vio con el de orden del proveedor) | vio-web-sdk #80: `purchaseFromPaymentSuccess`, solo ids de Vio, `value` siempre del carrito | ✅ `main` |
| 13 · rate limit por IP (la key iba solo en el body) | vio-web-sdk #80: `X-Api-Key` en el fetch | ✅ `main` |
| 11 · Vev no reenviaba `remove_from_cart` ni `sdk_error`; sponsor persistido sin validar; su `purchase` no usaba la normalización | vev [#63](https://github.com/vio-live/vev/pull/63) + rebundle 0.21.0 | ✅ **desplegado como 0.328** en el compartido (OK de Angelo, 15/10 tarde); rollback `vev restore` 0.327 |
| 12 · KPIs "0.0M"/"0K" con cifras pequeñas | webapp [#60](https://github.com/vio-live/webapp-vio-commerce/pull/60): `compactParts` | ✅ staging |
| 4 · resolución de key frágil (QA apagado de noche → 503 y se pierde la ingesta) | vio-analytics [#17](https://github.com/vio-live/vio-analytics/pull/17): stale-if-error 72 h, hold tras fallo, dedupe, caché en disco por `sha256(key)`, `auth` en `/health` | ✅ `main` (`22458c2`); **despliegue: Miguel** |
| 8 · `minimal` no descartaba `external_user_id` ni `location_id` | vio-analytics #17 | ✅ `main` |
| 9 · `privacyModeFor` daba `standard` a una surface desconocida | vio-analytics #17: `minimal` por defecto | ✅ `main` |
| 10 · `content_id` se descartaba en silencio | vio-analytics #17: contrato + fila + columna | ✅ `main` |
| 14 · docs (DESPLIEGUE, EVENTS_CONTRACT, .env.example) | vio-analytics #17 | ✅ `main` |

**Lo que queda, con dueño:**
- 1 · Desplegar el colector en la VM de staging con `CAMPAIGNS_URL` (Miguel; lista exacta en el
  [handoff](../../handoff/2026-10-14-campanas-handoff.md)).
- 5 · El histórico de ClickHouse de staging lleva ids de vio-backend que colisionan con los nuevos: cortar el
  histórico al desplegar (Miguel; ADR-0025 ya daba por aceptado perder las ~3.600 filas de staging).
- 6b · `purchase` solo sale del navegador: hace falta un `order_paid` server-side desde orders (y que shopcart
  guarde surface, campaña y sesión en el checkout). Es el siguiente trabajo de analytics con peso.
- 7 · El publisher (dueño de la surface) no tiene analytics en el dashboard de Commerce: ruta nueva en base-api
  y una vista. Pendiente de decidir prioridad.

### Vev, web y Replit contra Commerce (tarde)
- Angelo: "el foco es Vev, web y Replit; que funcione y olvidarnos de vio-backend". Inventario: Vev (bundle), el CMS de
  Aller "Mote & Livsstil" en Replit (npm 0.19.0) y la demo de ventas `vio-web` (Replit/Vercel). El CMS usaba tres rutas
  de vio-backend; la del **catálogo del CMS** (`/v2/commerce/sponsors/:id/catalog`) daba 410 en el micro → micro
  [#13](https://github.com/vio-live/vio-campaigns-microservice/pull/13): misma respuesta, ahora con key de surface,
  plazo de 8 s y caché de 45 s. SDK **0.21.0 en npm** (Angelo) y Vev **0.328**. Handoff con el prompt para Replit:
  [replit-y-demo-web-a-commerce](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md). vio-backend PR #66 cerrado.

### Los dos hallazgos de seguridad (noche)
Angelo: "¿puede ir con estos dos?" (el socket de base-api sin auth y `/upload/*` sin auth).
- **Fase 1, en QA y verificada desde fuera** (base-api [#37](https://github.com/vio-live/vio-base-api/pull/37) + webapp
  [#61](https://github.com/vio-live/webapp-vio-commerce/pull/61)): el handshake de socket.io exige el token de Firebase
  (sin token → `connect_error: unauthorized`), cada socket se une a su sala `user:<id>` y los 16 emisores emiten solo a
  su dueño (nombres de evento intactos); fuera las cuatro rutas de prueba que publicaban sin auth (404);
  `authentication` en todo `/upload/*` (401) y producto propio en `/upload/:id`; `verifyMicroService` exige cabecera y
  env no vacías. El cliente del webapp manda `auth.token`, lo renueva en cada intento y, como socket.io-client no
  reintenta tras un rechazo del servidor, reconecta a mano con tope de 6 intentos y pausa hasta volver a la pestaña.
  Detalle por repo: [base-api](2026-10-15-base-api-socket-con-auth-y-uploads.md), [webapp](2026-10-15-front-commerce-socket-con-token.md).
- **Fase 2, hecha y verificada la misma noche:** los cinco micros que llaman a `POST /api/users/socket/:userId` y
  `GET …/counters/:userId` mandan ya `identification-microservice` (extensions [#23](https://github.com/vio-live/vio-extensions-microservice/pull/23),
  api [#48](https://github.com/vio-live/vio-api-microservice/pull/48), users [#22](https://github.com/vio-live/vio-users-microservice/pull/22),
  orders [#24](https://github.com/vio-live/vio-orders-microservice/pull/24), products [#25](https://github.com/vio-live/vio-products-microservice/pull/25);
  los cinco desplegados en QA), el `MICROSERVICE_TOKEN` es el mismo en los seis servicios (comparado por longitud y
  hash) y base-api aplica `requireMicroserviceOrSelf` ([#38](https://github.com/vio-live/vio-base-api/pull/38)): sin cabecera
  → 401, `:userId` no entero → 400. **Riesgo que queda apuntado:** en products, users y extensions esos avisos son
  `lastValueFrom(post)` sin `.catch` y no hay handler de `unhandledRejection`; si algún día el token difiere, un 401
  reinicia el pod. Blindarlos con `.catch` es una mejora aparte.
- **Una comprobación mal hecha, corregida:** dije que `MICROSERVICE_TOKEN` no estaba en ningún pod (patrón `^KEY=`
  estricto y un `node -e` que no carga dotenv). Está en los seis. Por eso el endurecimiento se quedó y la fase 2 es
  solo código.

## Decisions
- **La validación de tenancy en el colector es por pertenencia, no por vigencia** (revisión del PR #12): con
  "activa ahora" se rechazarían la cola offline del SDK tras `endsAt`, las conversiones tardías y el último
  tramo de una campaña pausada. Y ante un id desconocido el colector refresca la key una vez antes de descartar.
- **Tiempo real: primero el micro produce el evento, el transporte después** (ADR-0033, propuesto). No se
  construye el WebSocket hasta tomar los SDKs móviles; mientras, los bucles de 410 se toleran.
- **Los PRs se mergean con una revisión independiente** (agente revisor) además de la mía; el clasificador
  frenó un merge sin ella. Las revisiones cazaron dos cosas de fondo: la cascada de `order_id` mezclaba el id
  de checkout de Vio con el id de orden del proveedor, y una key revocada podía resucitar desde la caché en
  disco tras un reinicio con el micro caído.
- **`value` del `purchase` es siempre la suma de ítems del carrito, sin envío**; el total cobrado llegará por
  el evento server-side `order_paid` (pendiente). Antes variaba por método de pago.

## Blockers
- **SDK 0.21.0 publicado en npm por Angelo** (15/10 tarde); el CMS de Replit sigue en 0.19.0 hasta que su agente suba.
- `vev deploy` del compartido (0.328 con el SDK 0.20.5) necesita OK de Angelo.
- Sin e2e contra un colector real hasta que Miguel despliegue; la verificación en 12 pasos está en el informe
  del audit y se repite en [vio-analytics](../../architecture/vio-analytics.md).

## Next session
- Angelo decide ADR-0033 y la rama de iOS (`develop`).
- Miguel despliega el colector; después, e2e con la key de Vev y una surface en `minimal`.
- `order_paid` server-side (6b) y analytics del publisher (7).
