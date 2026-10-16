---
date: 2026-10-16
session: quick-fix
participants: [angelo, claude]
agent: svc-orders
status: live
service: orders
---

# Session — 2026-10-16 — orders: los listeners no tumban el pod

## Goal
El 16/10 a las 01:05:34 UTC el pod de `orders` en QA murió con **exit 1** en
mitad del `orders/fulfilled` de la orden 4569 (extensions →
`POST /:orderId/saveTrackingNumber` → `completeOrderItem` →
`processOrderCompleted`). En los logs: una llamada HTTP a `extensions`
respondió **503 `no healthy upstream`** (extensions se estaba redesplegando)
y nadie capturó el rechazo → Node 22 (`Dockerfile FROM node:22`) termina el
proceso por `unhandledRejection`. Objetivo: que ningún aviso a otro micro
pueda tumbar el proceso ni cortar el flujo de una orden, y una red de
seguridad para lo que corra fuera del ciclo de una petición.

## Done
Rama `fix/listeners-sin-caidas` (worktree `~/vio-commerce/worktrees/orders-listeners`,
base `origin/develop` `cd81576` = PR #24), **3 commits locales, sin push** (ADR-0001):

1. `8612003 fix(listener): los @OnEvent nunca lanzan ni dejan promesas sueltas`
2. `993434a fix(main): registrar unhandledRejection y uncaughtException`
3. `bd31abd fix(order): los avisos a extensions no fallan la operación`

### La causa, confirmada en el código
`completeOrderItem` (`order.service.ts` ~L1287) emite `order-item:completed`;
`OrderCreatedListener.handleOrderItemCompleted`
(`created-order-listener.ts:64-73` en develop) hacía
`lastValueFrom(this._httpService.post(EXTENSIONS/shopify/handleOrderItemCompleted/:itemId))`
**sin `await` ni `catch`**. `EventEmitter2.emit` descarta el valor de retorno,
la promesa rechazada queda huérfana y, desde Node 15, eso es fatal. Los otros
nueve `@OnEvent` del micro tenían la misma forma (incluidos los dos con
`setTimeout`, y `Email.mailjet.send` también devuelve una promesa que
rechaza). Segundo camino fuera del request: `processInvalidStock` en
`process.nextTick` sin `.catch` (`save()`, ~L2073).

### Llamadas que cambiaron
**Listeners** (`src/modules/listener/providers/`): todos los handlers pasan a
`async` con el cuerpo entero en `try/catch` y `logger.error` con evento, id
de orden/ítem y `describeError(error)` (status, mensaje, detalle corto, método
+ URL; nunca el body).
- `created-order-listener.ts`: `shopify|magento|woo/handleOrderItemCanceled/:itemId` (×3),
  `shopify/handleOrderItemCompleted/:itemId`, `shopify|woo|magento/handleOrderPaid` (×3).
- `created-socket-listener.ts`: `api/socket/publish`.
- `created-notification-listener.ts`: `api/notifications/saveOrder` (el
  `setTimeout(delay)` pasa a `await wait(delay)` dentro del mismo try).
- `created-email-listener.ts`: `Email.mailjet.send` (ídem).

**`order.service.ts`** — avisos (no cambian lo que la orden es en Vio) →
nuevo `tellExtensions(process, orderId, path, body)`: devuelve `response.data`
o `undefined` + `logger.warn`:
- `updateTrackingInOriginOrder`: `shopify/setFulfillmentOrder/:channelId`
  (antes `.catch` que logueaba y luego `fulfillment.id` sobre `undefined` →
  TypeError, quirk #9 del brief) y `woo/setTrackingOrder` (antes sin catch).
  `userChannel?.wooConnection` por si no hay store channel.
- `updateTrackingInSupplierOrder`: `shopify/setFulfillmentOrder/:supplierShopifyOrderId`
  y `magento/shipOrder`; los ids solo se guardan si extensions respondió.
- `save()` → `scheduleInvalidStock()`: el `process.nextTick` ahora lleva
  `.catch` + `logger.error` (cubre `shopify/updateStock`, firebase, mail y
  `cancelOrderOnSalesChannel`).
- `cancelOrderOnSalesChannel`: channel sin función de cancelación (Partner/Vio)
  → `warn` + return, en vez de `TypeError`.
- `updateStatusItemOrder` catch: `describeError` en lugar de
  `JSON.stringify(error)` + `console.log('ERRROR', error)` (volcaban la config
  de axios con credenciales de tiendas).

**Se dejan como están** (determinan el resultado; `await` dentro del request,
el controller de `saveTrackingNumber` las convierte en 400 `Bad request`, el
resto llega como 500 por el filtro de Nest): `woo/cancelOrder` (×2),
`shopify/cancelOrder` (×2), `magento/cancelOrder`, `woo/closeOrder`,
`shopify|woo/get/ecom-user`.

**`src/main.ts`** → `installProcessGuards()` antes de `bootstrap()`
(`src/utils/process-guards.ts`): `unhandledRejection` → `logger.error` con
`describeError(reason)` y el proceso sigue; `uncaughtException` → log con
stack y `process.exit(1)` explícito (registrar el listener desactiva el
default de Node; el comentario del archivo explica por qué).

### Tests y verificación
- Nuevas suites (sin BD, `jest.unit.json`): `src/utils/tests/describe-error.unit.spec.ts`
  (5), `src/utils/tests/process-guards.unit.spec.ts` (4: 503 logueado sin
  `process.exit`; `uncaughtException` sale con 1; `installProcessGuards`
  registra ambos), `src/modules/listener/tests/listeners.unit.spec.ts` (14:
  cada handler con un error axios-like 503 no propaga, loguea evento+id+URL
  sin credenciales, y un vigilante de `unhandledRejection` del proceso
  comprueba que no queda ninguna promesa suelta; también a través de un
  `EventEmitter2` real), `src/modules/order/tests/order-extensions-notices.unit.spec.ts`
  (9: origen Shopify/Woo, supplier Shopify+Magento mixto, `scheduleInvalidStock`,
  `cancelOrderOnSalesChannel`).
- `npx jest --config ./jest.unit.json` → **8 suites, 103 tests OK** (antes 4/68).
- `npx tsc --noEmit -p tsconfig.json` → solo el error preexistente de
  `mockRequest` en `order.service.spec.ts`; `tsconfig.build.json` limpio.
- eslint sin errores en lo tocado (los `no-unused-vars` de `Injectable`/`OnEvent`
  son falso positivo del parser viejo, están igual en develop). `order.service.ts`
  no estaba prettier-clean en develop (L437-511, 1113, 1569, 2571, 2791+, código
  de #22/#23); no se reformateó nada ajeno.

### Ronda 2 — revisión de orders #25 (`4e9c8a6`, commit nuevo encima, sin push)
> [claude/svc-orders, 2026-10-16] La rama se pushó como **orders #25**; la revisión independiente pidió:

- **Blocker:** `bootstrap().catch(onBootstrapFailure)` en `src/main.ts` — con el guard de
  `unhandledRejection`, un fallo de arranque (`onModuleInit` del consumer del bus, `EADDRINUSE`)
  dejaba el pod vivo sin servir. `onBootstrapFailure` (en `process-guards.ts`, testeable sin Nest)
  loguea `[bootstrap] the service did not start, the process ends: …` con stack y hace `exit(1)`.
- `onUnhandledRejection` añade `reason.stack` si es un `Error` que no es de axios
  (`isAxiosError` o `config.url`); los de axios ya traen status y URL.
- `describeError` envuelve su cuerpo en `try/catch` → `'unprintable error'` (tests con
  `Object.create(null)` y getters de `message`/`response` que lanzan).
- `tellExtensions(operation, orderId, path, body, context)` responde `{ taken: true, data } |
  { taken: false }` (no `undefined`, que confundía "no lo tomó" con un body vacío) y el warn
  lleva `tracking <id> <número>` y la orden remota (`channelId` en origen,
  `supplierShopifyOrderId`/`supplierExternalOrderId` en el supplier). `updateTrackingIn{Origin,Supplier}Order`
  devuelven `boolean`; `saveTrackingNumber` solo loguea `success updateTrackingInOriginOrder` si
  extensions lo tomó, si no `partial: extensions did not take it in the origin order (Shopify 6001);
  the tracking is saved in Vio` (ídem para el supplier). En `updateTrackingInSupplierOrder`,
  `shopify/get/ecom-user` (también extensions) se pide solo si hay ítems Shopify del supplier y su
  fallo es el mismo warn — antes, con extensions caído, tiraba un 400 **después** de completar los ítems.
- `cancelOrderOnSalesChannel`: el warn nombra el channel real (`ChannelName` = Shopify, Woocommerce,
  Facebook, Squarespace, Wordpress, Magento; el mapa solo tiene shopify/squarespace/wordpress); test
  con `Woocommerce`, no `'Partner'`.
- **Corrección al cuerpo del PR:** `processInvalidStock` y `cancelOrderOnSalesChannel` **no** pasan
  por `tellExtensions`; lo único que los cubre es el `.catch` de `scheduleInvalidStock` (y la red de
  seguridad). `tellExtensions` solo envuelve los cuatro avisos de tracking.
- Listener de email: el log lleva `template <id> for order <id>`, nunca la dirección.
- Tests nuevos: cuerpos Woo/Magento en los avisos (service) y en el 200 de los listeners;
  `saveTrackingNumber` completo con extensions caído → Vio guarda el tracking, completa los ítems
  del supplier, responde el tracking (controller incluido, 201, no el 400 de una llamada que lanza)
  y deja 5 `warn` sin credenciales; `bootstrap().catch` no llega al guard de `unhandledRejection`.
- `jest.unit` → **8 suites / 116 tests OK**; `tsc` solo `mockRequest`; eslint limpio en lo tocado.

## Decisions
- Los listeners son **avisos**: nunca lanzan, nunca devuelven una promesa sin
  dueño. El fallo se dice con evento + id + status/URL; el flujo de la orden
  no se entera.
- `unhandledRejection` → log y seguir; `uncaughtException` → log y `exit(1)`
  (estado desconocido, K8s levanta uno limpio). No se usa `--unhandled-rejections=warn`
  en el `Dockerfile` para que el motivo quede en el log con el formato nuestro.
- `describeError` es el único resumen de errores para logs nuevos: nunca
  `JSON.stringify(error)` sobre un error de axios.

## Blockers / open questions
- El `node_modules` de `repos/orders` **no existe**; el worktree enlaza al
  overlay de `worktrees/orders-brand-publisher/node_modules` (como los otros
  dos worktrees de orders). Axios instalado es 0.21.3, no 0.24.
- Fuera de alcance, visto de paso: `OrderBusConsumerService.processDeadLetterQueue`
  llama `this.sendMessageToQueue(...)` **sin `await`** (un fallo de
  `sender.sendMessages` era otro `unhandledRejection`; ahora lo atrapa la red
  de seguridad, pero el mensaje de la DLQ se completa igual y se pierde). Y en
  `cancelOrderByReseller` (~L203) el `(data) => emit(...)` va como 2º argumento
  de `.map` (es `thisArg`), no como callback de `sendAsync`: ese email nunca
  sale por ahí.
- El brief decía Node 20; el `Dockerfile` es `node:22` desde antes de hoy.

## Next session
- La rama ya es orders #25; `4e9c8a6` (ronda 2) está **solo en local**, falta push con OK.
  Luego desplegar en QA y repetir un `orders/fulfilled` con extensions caído para ver el
  `warn`/`error` en vez del exit 1.
- Si se quiere, el `await` del DLQ en el bus consumer, en su propia rama.
