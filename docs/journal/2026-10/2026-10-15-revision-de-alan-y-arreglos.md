---
date: 2026-10-15
session: morning
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-10-15 — Los 5 reportes de Alan: qué eran de verdad y qué se arregló

## Goal
Alan (14/10, noche) probó el flujo completo de campañas en Commerce: checklist del flujo 10/10,
el de pagos 9/15, y dejó 5 reportes en su [tarjeta](https://trello.com/c/ftrrjOW0). Sin commits.
Angelo: "revisa lo que hizo Alan", y después "ve con todo… subimos todo a staging y reportamos a
Alan para que vuelva a probar".

## Done

### La revisión (código, logs y base de QA, antes de tocar nada)

| # | Reporte | Qué era |
|---|---|---|
| 1 | Cancelar/reembolsar desde Woo no llega a Stripe; Vipps sí | **Hueco de siempre, no de F2.** Para las órdenes del checkout de Vio solo existía el camino del dinero de Vipps: `refundedInShop` respondía `money: { ignored: true, reason: "no money hook for STRIPE" }` (literal en el log de la 4554); la cancelación comparaba `'STRIPE'` con lo guardado `'Stripe'`; y la 4554 tenía `channel_id` vacío (sin referencia del PaymentIntent). Las que Alan enseña reembolsadas (4555, 4556) eran de Vipps |
| 2 | Crear surface falla la primera vez, funciona la segunda | **Transitorio, no reproducible.** El alta es una sola llamada transaccional; sin duplicados en la base (la surface 5 se creó a las 21:58:34, en el segundo intento). Encaja con una conexión muerta en el pool de MySQL (el `mysql2` 1.5.2 del kernel ignora el keepalive) |
| 3 | Productos añadidos a una colección ya compartida se ven en el portal pero no en Vev; no puede quitar la colección del channel | **Bug real, bloqueante.** El portal expande la colección al leer; GraphQL (Vev) lee una **foto** (`channel_user_products`, products-ms) que solo se rehacía al añadir la colección al channel o al editar la colección. En la base: el channel 508 tenía filas de la colección nueva y ninguna de la vieja. El botón de quitar buscaba por la PK de la compartición en vez del id de la colección (404 en el log de api) |
| 4 | Pudo pagar con Qliro después de que el publisher lo apagara | **Diseño.** El método se valida **al iniciar el pago** (`PAYMENT_METHOD_NOT_AVAILABLE`, caché de 60 s); una sesión ya abierta en Qliro termina en Qliro. Se documenta, no se toca |
| 5 | No puede quitar el channel 508 de la surface para usarlo en otra (`CHANNEL_IN_USE`) | **No es bug: un channel puede estar en varias surfaces.** El bloqueo protege a la campaña 5. Faltaba decirlo y enlazar la campaña |

### Los arreglos (8 agentes en paralelo, revisados, mergeados y en QA)

| Repo | PR | Qué |
|---|---|---|
| products | [#24](https://github.com/vio-live/vio-products-microservice/pull/24) | La foto de una colección sigue a su contenido también con 0 items: `IN ()` con colecciones sin channel, `notNow` restringido a la colección (un producto en dos colecciones del mismo channel "parpadeaba"), items por iteración, items sin producto fuera |
| api | [#47](https://github.com/vio-live/vio-api-microservice/pull/47) | Quitar la colección busca por `collection.id` (y la PK), borra grupo y foto e invalida la caché; el alta toma la compartición **del dueño del channel** (`COLLECTION_NOT_SHARED_WITH_SELLER`) |
| collection | [#12](https://github.com/vio-live/vio-collection-microservice/pull/12) | `ChannelProjectionService`: la foto se rehace al añadir y quitar items y al re-compartir; re-compartir **restaura** la fila `collection_shared` en vez de crear otra |
| payment-processors | [#13](https://github.com/vio-live/vio-payment-processors-microservice/pull/13), [#14](https://github.com/vio-live/vio-payment-processors-microservice/pull/14) | `POST /stripe/refund/:pi`: por importe exacto (`amountMinor`) o por **total reembolsado objetivo** (`refundedTotalMinor`, lo que reporta la tienda), idempotente por `orderId`; `cancelPayment` devuelve la misma forma y no da 500 si ya está reembolsado; el seller se resuelve también para Payment Link y por `vio_seller_id` |
| orders | [#22](https://github.com/vio-live/vio-orders-microservice/pull/22) | `processorOf` normaliza mayúsculas; gancho de Stripe simétrico al de Vipps: total o todos los ítems cancelados → `cancelPayment`; parcial → `refund` con el acumulado de la tienda; sin `pi_` → `ignored` con razón; todo en try/catch con el mensaje real |
| micro | [#11](https://github.com/vio-live/vio-campaigns-microservice/pull/11) | `CHANNEL_IN_USE` con `details { channelId, campaignId, campaignName, campaigns }`; errores de conexión a MySQL → 503 `DB_UNAVAILABLE` con `Retry-After`; reintento único de la primera lectura; keepalive del servidor; `preStop` en el chart |
| webapp | [#59](https://github.com/vio-live/webapp-vio-commerce/pull/59) | Aviso en la tarjeta Channels con la campaña enlazada y la explicación de que un channel vive en varias surfaces; el selector de channel de la campaña ofrece los de la brand fuera de la surface; alta de surface con timeout, `mutate()` en el error y texto claro si Vio no contestó |
| shopcart | [#91](https://github.com/vio-live/vio-shopcart-microservice/pull/91) | En el flujo embebido el PaymentIntent se crea **antes** de `orders/save` y la orden nace con `channelId: pi_…` (como Vipps); `rememberStripeReference` idempotente; el webhook escribe la referencia que falte antes de avisar "pagado" |
| orders | [#23](https://github.com/vio-live/vio-orders-microservice/pull/23) | `POST /:orderId/update` respondía **500 a todas las llamadas** (`No entity column "customer"`): `update()` mandaba la relación `customer` y claves `undefined` al `repository.update`. Por eso ninguna orden de Stripe tuvo nunca su referencia (y el dashboard tampoco podía usar ese endpoint) |

**Verificado en QA al cierre (10:30 UTC):** todos los pipelines en verde y los pods reiniciados;
`POST /stripe/refund/pi_x` responde el 400 nuevo (ruta viva); `POST orders/4554/update` responde 200 y
la 4554 lleva ya su `pi_3UQXwACtc7XMW6Ft0GYmPoVJ` (antes, 500 y `channel_id` vacío); el channel 508 tiene
4 filas en la foto y GraphQL devuelve los dos productos de la colección vieja. Comentario a Alan en su
tarjeta con qué reprobar (15/10, 10:35 UTC).

**Un choque de contrato cazado a tiempo:** Woo reporta el **total acumulado** reembolsado, y el
endpoint nuevo reembolsaba exactamente lo recibido: un segundo parcial habría devuelto de más.
Decisión: `refundedTotalMinor` como objetivo ("deja el total reembolsado en X"), que además es
idempotente por construcción. orders lo manda tal cual.

**Otro hallazgo por el camino:** `orders/:id/update` llevaba roto desde que existe el write-back de la referencia de Stripe (28/09); el journal del 28/09 lo había visto (`rememberStripeReference … 500 ×3`) y lo atribuyó a caídas de orders.

**Lo que corrigió un agente del diagnóstico:** `insert().values([])` no revienta en TypeORM 0.2.41;
lo que tiraba la foto era `IN ()` con una colección que no está en ningún channel.

## Decisions
- **La foto del channel se rehace en cada cambio de items y de compartición**, desde collection-ms,
  con el proyector que ya existía (`/channel-process/collections/update`). No se cambia GraphQL
  para que expanda en vivo: `all-items` está montado entero sobre la foto (filtros, precios, caché).
- **Stripe mueve dinero desde la tienda con `cancelPayment` (total) y `refund` por total objetivo
  (parcial)**; nunca con `cancelPaymentItem`, que lee una metadata que el checkout no escribe.
- **El método de pago se valida al iniciar el pago**, no al completarlo (reporte 4). Es el
  comportamiento esperado; el único hueco es la caché de 60 s para iniciar. Documentado en
  [cuentas-y-capacidades](../../architecture/cuentas-y-capacidades.md).
- **Repararle el dato a Alan desde dentro del cluster** (`POST products/channel-process/collections/update`
  para su colección vieja) en vez de pedirle que la vuelva a compartir: es la misma llamada que ahora hace
  collection-ms sola. El channel 508 pasó de 2 a 4 filas y GraphQL devuelve los dos productos.
- **Un channel puede estar en varias surfaces** y `CHANNEL_IN_USE` solo protege a la campaña: se
  explica en la UI en vez de cambiar la regla.

## Blockers
- Nada probado de punta a punta con dinero de Stripe: hace falta una orden nueva del checkout (ya
  con `pi_` en `channelId`) para probar cancelación y reembolso parcial desde Woo.
- Las órdenes de Stripe anteriores siguen sin referencia; el backfill sale de
  `checkout.origin_payment_body.paymentIntentId` (foto desde el 22/09). No hecho.
- Apple/Google Pay y Payment Link escriben la referencia por `orders/:id/update`: funcionan en cuanto
  se despliegue el arreglo de orders.
- collection no tiene `node_modules` en ninguna copia local: sus tests no se ejecutaron; la build
  del pipeline fue la primera verificación.
- Klarna: al normalizar mayúsculas, una orden Partner con `'Klarna'` entra ahora en el camino legacy
  de Klarna (`cancelPaymentItem`/`cancelPayment`), que no está en try/catch. Klarna está en 401 en
  QA; vigilar.

## Next session
- Alan reprueba con la lista de su tarjeta (comentario del 15/10).
- Pendientes del [handoff](../../handoff/2026-10-14-campanas-handoff.md): release del kernel
  (privacidad), colector en Oracle (Miguel), rotación de secretos.
