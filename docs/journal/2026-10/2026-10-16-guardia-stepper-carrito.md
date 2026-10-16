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

### Segunda ronda de Alan (02:37–02:45 UTC): 4576–4581
- Tras el redespliegue Alan creó 4576–4581 (Vipps y Stripe) sin un solo 401: Shopify recibe las órdenes y Vio recibe
  `orders/fulfilled`, `orders/cancelled` y `products/update` de `alan-test-supplier`. 4577 cancelada desde Shopify →
  Vipps `CANCELLED` (reserva liberada); 4580 (Stripe) cancelada → `re_…` devuelto.
- **4578 «completada pero Vipps sigue AUTHORIZED»: no es bug.** orders avisa a shopcart (`…/vipps/order/4578/shipped`) y
  shopcart responde `{"skipped":"account"}`: la fila Vipps del supplier 1335 tiene `mode: own` y `captureMode: account`
  (el vendedor captura desde su portal al enviar; es el default documentado en `vipps-config.ts`, decisión de Angelo del
  2026-09-24). Para probar F1–F5 (captura al enviar) hay que poner la captura en «al enviar» (`shipment`) en los ajustes de
  Vipps de esa cuenta.
- **Refunds desde Shopify (4576, 4579): a Vio no le llega nada.** extensions enruta `refunds/create` → `refundInShop` →
  orders `/refunded-in-shop`, pero en los logs no entró ningún `refunds/create`: el app con el que Alan conectó la tienda
  (`shopify.app.vio-client-dev.toml`, suscripciones que él mismo pegó en la tarjeta) no incluye ese topic. Es configuración
  del app, no código: añadir `"refunds/create"` y `shopify app deploy`. Los tomls de `vio-sync-staging` y `vio-sync` ya lo
  traen.
- 02:46 Alan añade que los refunds Shopify → Stripe también fallan: misma causa (0 `refunds/create` en extensions y 0
  `refunded-in-shop` en orders desde las 02:40, con Vipps y con Stripe). Respondido en la tarjeta con el nombre exacto del
  campo del dashboard («When the money is taken» → «Authorize now, capture when it ships») y el topic que falta en su app.
- **02:52, hallazgo de Alan que sube de nivel:** en `vio-sync` rama `custom/client-app` (la de los apps custom, último commit
  de Angelo 12/10, 26 adelante / 118 detrás de `master`) **ningún app de cliente suscribe `refunds/create`**: careless,
  gladkokken, makeupmekka, demo y vio-client traen los topics de órdenes pero no ese; `vio-client-dev` solo los tres de
  productos. En producción, una devolución hecha en la Shopify de Careless/Gladkokken/Makeupmekka no llega a Vio.
  Arreglo preparado en la rama `fix/refunds-create-en-apps-de-clientes` (worktree en el scratchpad, **commit local, sin
  push**: el clasificador bloqueó push+PR y además es ADR-0001): los seis tomls con `refunds/create`; `vio-client-dev` con
  los siete topics y el Pub/Sub de staging. Falta: push + PR contra `custom/client-app` y `shopify app deploy` de cada app de
  cliente desde la cuenta dueña (Angelo). Avisado a Angelo por push y a Alan en la tarjeta.
- **10:50 UTC, con Angelo ya despierto («esto debemos arreglarlo sí o sí ya»):** rama subida y PR abierto en
  [vio-shopify-sync #124](https://github.com/vio-live/vio-shopify-sync/pull/124) contra `custom/client-app`. Comprobado antes de
  tocar los apps: el flujo de refunds **ya está en producción** desde el 12/10 (extensions `master` 15c7b3f, orders `master`
  2a6da29, shopcart `main` c1c38d6, deploys en verde), el Shopify CLI 4.7 de la laptop tiene sesión sobre los apps de cliente
  (versión activa `vio-client-careless-1` del 12/10) y el repo no tiene extensiones de Shopify que se arrastren con la config.
  Los clústeres de prod (`vio-commerce-prod*`) no se resuelven desde la laptop: los interruptores de devolución de los
  vendedores no se pudieron leer. El `shopify app deploy` lo bloqueó el clasificador como despliegue a producción: queda para
  Angelo desde su terminal (comandos en el chat), app por app, con `--no-build`.
- **~11:00 UTC: Angelo publicó los tres apps de cliente desde su terminal** (`shopify app deploy --no-build`, confirmando el
  resumen: solo `webhooks (updated)`, sin cambios en scopes, auth ni URLs): Careless (app 434547228673), Gladkokken
  (426105274369) y Makeupmekka (426736517121), los tres como versión `vio-sync-3` «Suscribe refunds/create». Desde ese
  momento una devolución en la Shopify de esos clientes llega a Vio: con Vipps mueve dinero según «Let Vio refund these
  payments»; con Stripe u otros solo registra el estado (orders `master`, `refundedInShop`). Verificación en prod pendiente de
  que llegue el primer `refunds/create` (los clústeres de prod no se ven desde la laptop; mirar con Miguel o desde el
  dashboard).
- Cada webhook de esa tienda llega dos veces (dos ids de Pub/Sub distintos → dos suscripciones): inocuo (el segundo
  intento de devolver en Stripe queda en `warn: already refunded`), pero conviene que Alan mire si tiene dos apps
  instaladas o dos suscripciones del mismo topic.
- Lectura de la BD de QA desde el pod de orders con un script efímero (secretos enmascarados también dentro del JSON de
  `payment_method.options`), borrado al terminar.

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
- **Angelo/Miguel:** confirmar en extensions de prod el primer `webhook refunds/create from <tienda>` de Careless/Gladkokken/Makeupmekka; mirar los interruptores de Vipps de cada cliente; mergear [vio-shopify-sync #124](https://github.com/vio-live/vio-shopify-sync/pull/124) para que la rama refleje lo publicado; `vio-client-dev` con los siete topics para que Alan pruebe refunds en QA.
- Alan reprueba el stepper sobre la 0.329 y contesta lo de editar la orden.
- Lo que salga del monitor entra en el mismo ciclo.
