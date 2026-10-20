---
title: Vercel desbloqueado, colector #25 en staging y variables del espejo de compensaciones en QA
date: 2026-10-20
author: miguel
---

## Vercel: el deploy de staging del webapp estaba BLOCKED por membresía del team — miguel

- Quién: Miguel (petición de Angelo vía la "Lista para Miguel" del handoff del 19/10).
- Dónde: Vercel, team `tipio-2`, proyecto `vio-commerce-webapp`; dominio
  `dashboard-staging.ecom.vio.live`.
- Cuándo: 20/10 11:05–11:08 UTC.
- Contexto: los 5 deploys de hoy (10:15, 10:24, 10:49, 10:51 y el de `develop` `62583c4` de las
  10:53, merge del PR #68 "dinero neto") salieron **BLOCKED**. Claude sospechaba cuota o una regla
  de proyecto y no tiene acceso al panel.
- Hecho:
  - Descartada la cuota con datos: team en plan **pro**, `status: active`, `blocked: null`,
    `softBlock: null`, sin spend limit tocado. El `errorLink` del deployment apunta a
    *troubleshoot-project-collaboration#team-configuration*, o sea colaboración.
  - **Causa:** hoy a las 10:15 UTC se creó la cuenta de Vercel `angelosv`
    (`angelo.sv@iqplus.no`, ligada al login de GitHub `angelosv`) y pidió acceso al team
    (`joinedFrom.origin: nsnb-request-access`, `confirmed: false`). En Pro el autor del commit debe
    ser miembro del team; desde que existe esa cuenta, todo push firmado por ese login de GitHub se
    resuelve a un usuario **no confirmado** y Vercel bloquea. Antes no había cuenta que resolver y
    los mismos commits pasaban.
  - **Desbloqueado** con un redeploy lanzado con el token del owner:
    `dpl_C5zruuCSS37A1CutGzPa9DVsm6Rq`, READY 11:08 UTC, `aliasAssigned: true`.
    `https://dashboard-staging.ecom.vio.live/` → **200** sirviendo `62583c4`.
- **Corrección del mecanismo (13:55 CEST, sobre lo escrito arriba a las 11:08).** Angelo preguntó
  por qué se rompió «si ya teníamos acceso». Al releer el API: **no había acceso previo, el acceso
  se pidió hoy, y pedirlo a medias es lo que bloqueó**.
  - El miembro `angelosv` se **creó hoy 20/10 a las 10:15:26Z** (`createdAt 1792491326450`), el
    mismo minuto del primer BLOCKED. Hasta el 19/10 19:51Z todos los deploys de ese mismo login
    salían READY porque **no existía usuario del team al que resolver el autor del commit**.
  - El redeploy con el token del owner (11:06Z) no solo desbloqueó ese build: **confirmó la
    membresía**. El miembro figura ahora `confirmed: true` con `joinedFrom.origin: nsnb-redeploy`
    (ya no `nsnb-request-access`). Es decir, **los pushes a `develop` ya NO salen BLOCKED**: lo que
    escribí arriba — «cada push seguirá saliendo BLOCKED» — quedó obsoleto en el momento mismo del
    redeploy.
  - Coste: `billing.invoiceItems.teamSeats` = `price 2000` (20 USD), **`quantity: 2`** con
    **`highestQuantity: 1`** en el periodo 02/10–02/11. El segundo asiento es de hoy: **20 → 40
    USD/mes**.
  - No sé explicar por qué `alanvsimpson` (confirmado desde el 13/04) no aparecía ya como segundo
    asiento; el periodo venía facturando 1. No lo verifiqué, queda como duda abierta.
- **Decisión de Angelo (20/10 13:54): se queda en 40 USD/mes.** El borrado del otro usuario lo hace
  él más tarde. **No hay acción pendiente para mí en Vercel** y no hay que desbloquear deploys a
  mano. Lección (corregida):
  [`vercel-blocked-es-membresia-del-team-no-cuota.md`](../../lessons/vercel-blocked-es-membresia-del-team-no-cuota.md).

## Colector de analytics: PR #25 (compensaciones, ADR-0036) desplegado en staging — miguel

- Quién: Miguel.
- Dónde: VM de staging `129.151.196.99`, `/opt/vio-analytics` (systemd `vio-analytics`, puerto
  5100, `events-staging.vio.live`); ClickHouse `analytics.vio.live`, base `vio_staging`.
- Cuándo: 20/10 11:09–11:12 UTC. `main` = **`bd61209`** (merge de
  [vio-analytics#25](https://github.com/vio-live/vio-analytics/pull/25) a las 11:07:49Z).
- Contexto: el handoff daba por hecho que "mi cron" lo desplegaba. **No existe tal cron** (el bucle
  de 15 min del 19/10 ya no está en el scheduler), así que lo desplegué a mano en cuanto vi el merge.
- Hecho: respaldo (`/home/ubuntu/vio-analytics-backup-20261020-110921.tgz`: `src`, `dist`,
  `package.json`, `pnpm-lock.yaml`) → tarball sin `.env*`/`node_modules`/`dist`/`.git` →
  `pnpm install --prod=false` → `pnpm build` (`dist/index.js` 151,9 kB) →
  `systemctl restart`. Arranque 11:10:07 UTC.
  - **Verificado que corre el código nuevo**, no el viejo: sha256 de `src/stats.ts`,
    `src/stats-compensation.ts`, `src/app.ts` y `src/sinks/clickhouse.ts` **idénticos** a los del
    commit, y `uptime_s` bajo tras el restart.
  - `[clickhouse] schema ready (vio_staging.events)` **sin errores de `ALTER`**; las dos columnas
    nuevas están: `items.campaign_id Array(UInt32)` e `items.location_id Array(String)`, ambas con
    `DEFAULT arrayResize(...)` (las filas viejas no se rompen).
  - `/health`: `ready: true`, `clickhouse.lastError: null`, `sinks.mixpanel.enabled: true` y el
    bloque nuevo **`compensation: { resolved: 0, unmatched: 0, refused: 0 }`**.
  - `GET /v1/stats/surface/overview?client_app_id=3` → **200** con los campos netos:
    `gmv 127411`, `gmv_gross 127411`, `refunded_value 0`, `cancelled_orders 0`, `purchases 147`,
    `purchases_net 147`. Coherente con que aún no hay compensaciones.
  - Las **12 lecturas internas** (7 de surface + 4 de campaña + `campaigns/summary`) → 200.
- Cambio de contrato detectado: `campaigns/{id}/*` **ahora también exige `?client_app_id=`**
  (ayer no); sin él, `400 {"error":"internal reads must set ?client_app_id= (UInt32)"}`.
  Comprobado que **base-api no se rompe**: `src/service/statsService.ts:459` añade el parámetro en
  los dos caminos.
- Fallo propio, documentado: el tarball armado en macOS llevaba uid 501 y modos 700/600 y al
  extraerlo como root dejó `/opt/vio-analytics` ilegible para `ubuntu` durante ~1 minuto. Corregido
  (dueño `ubuntu`, dirs 755, ficheros 644, `.env*` 600) antes de construir; el servicio no se cayó
  por eso. Lección:
  [`tar-de-macos-deja-el-destino-con-uid-501-y-modos-700.md`](../../lessons/tar-de-macos-deja-el-destino-con-uid-501-y-modos-700.md).

## Espejo de compensaciones: las dos variables de orders, cargadas en el blob de QA — miguel

- Quién: Miguel.
- Dónde: blob `containerqasc` / `env-file-microservices` / `.env.local` (el que el Dockerfile
  hornea en las imágenes de QA).
- Cuándo: 20/10 11:12 UTC.
- Contexto: el punto 4 de la lista pedía "poner las dos variables en el deployment de orders en QA".
  **En QA ese deployment no tiene `env` ni `envFrom`**: todo sale del `.env.local` horneado. Ponerlas
  en el deployment sería un `kubectl patch`, que luego rompe el `helm upgrade` del CI/CD.
- Hecho: cargadas en el blob, con respaldo
  `.env.local.backup-pre-analytics-mirror-20261020-111247` (15762 → 16267 bytes) y **verificado
  releyendo el blob** (`cmp` idéntico):
  - `ANALYTICS_EVENTS_URL=https://events-staging.vio.live` — **sin path**; el micro le añade
    `/v1/events` (confirmado en el diff de orders#28, `ANALYTICS_EVENTS_PATH`).
  - `ANALYTICS_INTERNAL_TOKEN` = el `INTERNAL_EVENTS_TOKEN` **full** (escritura) del colector de
    staging, 64 hex. **No** el de solo lectura que usa base-api. Valor en el `TOOLS.md` de Miguel.
  - Salida de red comprobada desde el pod de orders de QA:
    `https://events-staging.vio.live/health` → **200** (el sidecar de Istio no estorba).
- Pendiente: con esto, el build que dispare el merge de orders#28 las hornea solo; no hay que
  reiniciar nada a mano. Al mergear quedan por comprobar los tres pods (extensions, shopcart,
  orders), que en el arranque **no** salga `[analyticsMirror] ... not set`, y una cancelación de
  prueba con `order_cancelled` en el colector + `compensation.resolved` subiendo.
- Prod: **nada tocado**.

## Espejo de compensaciones activo en QA: emite, pero la compensación no casa con su compra — miguel

- Quién: Miguel.
- Dónde: `kubernetesqa-sc` (pods `extensions`, `shopcart`, `orders`), colector de staging
  `129.151.196.99`, MySQL de QA (`outshifter` por IP privada), ClickHouse `vio_staging`.
- Cuándo: 20/10 11:45–11:56 UTC.
- Contexto: tras mergear extensions#27 (`5158350`), orders#28 (`57fdf23`) y shopcart#95 (`695e383`),
  tocaba comprobar los tres pods y verificar el espejo de compensaciones con una cancelación real.
- Hecho:
  - **Pods:** los tres **2/2 Running** y nuevos, `Nest application successfully started`, **0**
    `Unknown column` / `QueryFailedError`.
  - **Variables en la imagen:** en el pod de orders (digest `sha256:3edfec5b…`) están
    `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` (64 hex) horneadas desde el blob, y en el
    arranque **no** sale `[analyticsMirror] ... not set`. No hizo falta reiniciar a mano: las puse
    en el blob antes del merge y el build del merge las horneó.
  - **Cancelación de prueba:** orden **4415** de QA (1000 NOK, 1 línea, canal `Partner`, procesador
    `Other` **elegido a propósito** para no disparar la cancelación en Shopify/Woo ni el reembolso
    de Vipps/Stripe). `POST /4415/cancel` contra el propio micro, 11:53:05 UTC → 200.
    - orders emitió: `order_cancelled 6ac11941-c373-5bb5-8b20-9534055eaac1`, 1000 NOK, `full=true`,
      `source=dashboard`.
    - **Llegó al colector y autenticado** (`POST /v1/events` en su journal, sin 401): la URL y el
      token funcionan. Eso es lo que yo tenía que probar.
    - El colector lo **descartó**: `compensation.unmatched: no purchase with that order_id —
      discarded`, `order_ids: ["4415"]`; `/health` → `compensation {resolved:0, unmatched:1,
      refused:0}`; `recent?name=order_cancelled` → `count: 0`; `surface/overview` sin cambio.
      La orden quedó CANCELED en la DB y orders registró el rechazo como **WARN**: la cancelación
      no se rompe por el espejo, que es el diseño.
- Hallazgo (medido, no deducido): **con los datos de hoy ninguna compensación puede casar.**
  1. orders manda `order_id = String(order.id)` (el número de Vio) y **todas** las compras de
     staging llevan el **UUID del checkout**. En ClickHouse no hay **ni una** compra con `order_id`
     numérico de ≤6 cifras. El par que lo prueba: orden **4582** (179 NOK, 19/10 14:26:02) y compra
     **`8cea273b-08c4-41fd-9747-ab037ab123b1`** (179 NOK, 14:26:13, surface 3, campaña 9) son la
     misma compra con dos claves. Viene de `purchaseFromPaymentSuccess` en la SDK:
     `firstId(d.orderId, r.confirmation?.orderId, d.checkoutId)` cae al `checkoutId` cuando el
     número de Vio no está listo al pagar (la SDK ya sabe pedirlo — `order_id` de `GetCheckout`,
     08/10 — pero para el recibo, no para el evento).
  2. **Ningún pedido de QA trae su surface:** `surface_id`, `campaign_id` y `buyer_ref` están a NULL
     en **los 2309** pedidos. Sin surface en el pedido ni compra con el mismo `order_id`, el
     colector no puede atribuir la compensación y la tira. Para pedidos nuevos el `surface_id`
     debería venir y el evento se guardaría, pero con `clientAppId` puesto el colector **no cuenta
     `resolved`** y las lecturas netas unen compensación y compra por `(client_app_id, order_id)`:
     **el dinero neto sigue exigiendo que la clave coincida**.
- No hecho a propósito: fabricar un `order_cancelled` contra una compra real de staging para
  ejercitar el camino bueno. Probaría la resolución, pero mete un dato falso en las métricas con las
  que se está verificando el webapp. Queda ofrecido en el canal del handoff.
- Hallazgo colateral, ajeno a este cambio: `[orderService.cancelOrder] order ... found` imprime la
  orden entera y con ella los `apiCredentials` del vendedor (`apiKey` y `apiToken`) **en claro** en
  el log. Es el mismo código en producción. Misma familia que los tokens de Shopify en claro que
  Angelo dejó diferido; anotado, no tocado.
- Prod: **nada**.
