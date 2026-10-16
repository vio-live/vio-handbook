---
date: 2026-10-16
session: morning
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-10-16 — Guardia: lo que probó Alan y el stepper del carrito

## Goal
Angelo: "quédate controlando, hoy no trabajo mucho; si comentan algo le escribes como que soy yo cuando esté listo;
te encargas de arreglar lo que él diga". Monitor de la actividad de Alan en Trello cada 2 minutos.

## Done
- **Lo que probó Alan el 15/10 por la tarde** (tarjeta [ftrrjOW0](https://trello.com/c/ftrrjOW0)): 15 de 16 de la
  checklist "Repruebas 15/10" y 13 de 15 de pagos en verde. Sin tildar: editar dirección o contacto de una orden desde
  el dashboard, y Kustom/Adyen con un market que no lo permite (preguntado en la tarjeta).
- **Reporte nuevo (21:01):** en el carrito de Vev, ráfagas de +/− descoordinaban la cantidad (en la ficha iba bien).
  Causa, leída en el código del web SDK: el stepper mandaba `item.quantity ± 1` del snapshot del render, cada clic
  abría un `UpdateItem` en paralelo, y cada respuesta reaplicaba el carrito entero con un guard que solo miraba la última
  respuesta aplicada, así que una respuesta vieja pisaba el estado local y el siguiente clic partía de ahí.
- **Arreglo** (vio-web-sdk [#81](https://github.com/vio-live/vio-web-sdk/pull/81), **0.22.0**; vev [#64](https://github.com/vio-live/vev/pull/64);
  **desplegado como 0.329** en el compartido): `adjustQuantity(lineItemId, sponsorId, delta)` sobre la cantidad viva; una
  sola mutación en vuelo por línea con coalescencia del último objetivo; una línea con sync activa conserva su cantidad
  optimista; si la respuesta final se descarta por el `seq` del sponsor, la línea se reconcilia con lo que dijo el servidor
  (stock clampado, precio); rechazo → `GetCart` + `error`, y una baja encolada se reenvía una vez; timeout de 15 s en
  `executeCartGraphQL`; `createCheckout`, `prepareRedirectPayment`, `startVippsPayment` y el Vipps Express del drawer
  esperan `waitForCartMutations`. 10 tests nuevos (369 en verde). Revisión independiente antes del merge; sus dos
  rondas de hallazgos están cerradas.
- Respuesta a Alan en la tarjeta (en nombre de Angelo): qué pasaba, qué cambió, qué volver a probar.

### Los 401 de Shopify de Alan (madrugada) y la caída de orders
- Reporte de Alan (00:23 UTC, tarjeta [W2NNShth](https://trello.com/c/W2NNShth)): pagos y órdenes bien, pero 401 en el
  flujo de Shopify; sospechaba del token del app.
- **Causa 1, en Vio:** `alan-test-supplier` tenía dos filas activas de supplier en `shopify_connection` (555, cuenta 1330,
  token caducado el 08/10 y refresh revocado; 556, cuenta 1335, vigente). extensions buscaba por `url` sin orden y cogía la
  555 → Shopify 401 → Pub/Sub reentregaba: 280 errores/min. En QA hay 11 tiendas con dos filas activas; en 5 es legítimo
  (una supplier y una reseller).
- **Causa 2, al reprocesar:** el pod de orders murió (exit 1) por un `@OnEvent` que posteaba a extensions sin `await`/`catch`
  justo cuando extensions se redesplegaba (503 `no healthy upstream`); las cancelaciones de 4571 y 4574 desde Shopify
  fallaron con 500/503.
- **Arreglos (todos en QA a las 02:10 UTC):** extensions [#24](https://github.com/vio-live/vio-extensions-microservice/pull/24)
  (`activeConnectionByShop(url, { role })`, la activa más reciente del rol correcto; marca de 10 min en Redis cuando Shopify
  revoca un refresh; tokens fuera de 7 logs), users [#23](https://github.com/vio-live/vio-users-microservice/pull/23) (prueba de
  propiedad con `getShopInfo` antes de persistir; retiro de las conexiones de supplier de otras cuentas; nunca la de reseller),
  products [#26](https://github.com/vio-live/vio-products-microservice/pull/26) (mismo helper para `products/update` y stock),
  orders [#25](https://github.com/vio-live/vio-orders-microservice/pull/25) (listeners que nunca lanzan, guards de proceso con
  `bootstrap().catch`, avisos de tracking best-effort con `warn` trazable). Cada uno con revisión independiente; la de users
  cazó un robo de conexión cross-tenant que el primer corte habría permitido.
- Detalle por repo: [extensions](2026-10-16-extensions-conexion-shopify-por-tienda.md), [users](2026-10-16-users-conexion-shopify-por-tienda.md),
  [products](2026-10-16-products-conexion-shopify-por-tienda.md), [orders](2026-10-16-orders-listeners-sin-caidas.md).
- Respuesta a Alan en su tarjeta (en nombre de Angelo) con qué pasaba, qué cambió, el aviso de usar el app **Vio Sync
  Staging** (el token `shpua_` solo lo renueva el app que lo emitió) y qué repetir.
- **Fallo mío:** al inspeccionar el `.env` de extensions en el pod, un enmascarado mal hecho dejó pasar dos
  `SHOPIFY_CLIENT_SECRET_*` de QA a la salida de la sesión. Avisado a Angelo. Regla: en un pod solo `nombre=<longitud>`.

## Decisions
- **La sincronización de cantidad es por línea y en serie**; el servidor manda cuando la respuesta final llega, aunque
  el `seq` global la descarte. Es la regla que faltaba para que el total del checkout coincida con el carrito.
- **La conexión de Shopify se resuelve por tienda, rol y recencia**, y una tienda solo puede ser supplier de una cuenta a la vez (puede ser además reseller de otra). Los avisos entre micros nunca tumban el proceso.
- **npm no se publica por esto**: la 0.22.0 añade API (`adjustQuantity`) y la publica Angelo cuando el CMS de Replit
  la necesite; Vev no depende de npm.

## Blockers
- Un límite preexistente sigue: quitar la **última** línea de un sponsor mientras su `AddItem` está en vuelo deja el
  carrito del backend con una línea huérfana (sin riesgo de cobro).

## Next session
- Alan reprueba el stepper sobre la 0.329 y contesta lo de editar la orden.
- Lo que salga del monitor entra en el mismo ciclo.
