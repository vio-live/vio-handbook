---
date: 2026-10-13
session: "orders: el channel de la orden en /save (F2.4, parte orders)"
participants: [angelo, claude, svc-orders]
status: live
---

# orders: el channel de la orden en `/save`

## Goal

Parte orders de F2.4 del [plan de ejecución](../../handoff/campanas-en-commerce-plan-de-ejecucion.md),
según [ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md) punto 1. shopcart ya
manda `data.channelUserId` en sus 12 `orders/save` (journal
[shopcart-brand-sells](2026-10-13-shopcart-brand-sells.md)). Había que ver si orders lo lee,
validarlo y comprobar si engancharlo dispara la sincronización con una tienda.

## Done

Tres commits locales en `feature/brand-publisher` de vio-orders-microservice, encima de `bec9a9e`
(`origin/develop`), en el worktree `~/vio-commerce/worktrees/orders-brand-publisher`. **Sin push**
(ADR-0001). El kernel no cambia (1.0.267, service 1.0.268).

- **Lo que ya había:** el controller pasa `channelUserId` a `save()` (`order.controller.ts:112-122`),
  y `save()` lo enganchaba con un `findOne` y sin validar nada. Si el id no existía, la orden quedaba
  sin channel y nadie se enteraba.
- `c7d9359` **El channel de la orden**, ajustado por `ac3251b` a pedido del coordinador.
  - `save()` resuelve el channel al principio (`channelUserOfOrder`, `order.service.ts:1930`).
  - Si es del `reseller`, lo engancha.
  - Si no existe, no se puede leer o es de otro dueño, **la orden se guarda igual, sin
    `channelUser`**. Queda un `logger.error` con los ids (channel, dueño y reseller), sin datos
    personales, para investigarlo.
  - **Nunca devuelve 400.** `/save` corre después del cobro, y el channel es solo atribución.
  - Un channel borrado (soft-delete) después de abrir el carrito **cuenta**.
  - Sin `channelUserId`, todo sigue igual.
  - `create()`, que es el bus de las tiendas que se retiran, mantiene el lookup laxo de antes
    (`{ channelOfReseller: false }`, `:3116`). Un rechazo ahí rebotaría por la DLQ sin fin, porque el
    consumer reencola cada mensaje muerto con un timestamp nuevo.
  - `getSellerDataByOrderId` (`:3495`) devuelve el channel solo si es de tienda
    (`STORE_CHANNEL_IDS = [2, 5, 11]`, `staticData/index.ts:73`). Si no, devuelve lo mismo que una
    orden sin channel: nada.
- `1c9bcdc` **Tests.**
  - `yarn test:unit` (`jest.unit.json`, `*.unit.spec.ts`) corre sin base, como en shopcart.
  - Son 17 tests en `order-channel-user.unit.spec.ts`. Se comprobó que fallan si se quita la
    comprobación del dueño, si se vuelve al 400 o si se quita el filtro de tienda.
  - `tsc -p tsconfig.build.json` está limpio. Con `tsconfig.json` queda solo el error viejo del
    spec de siempre.

## Qué dispara enganchar `order.channelUser`

- **Dentro de orders, una sola cosa:** `getSellerDataByOrderId`. Lo llaman tres ramas, todas
  condicionadas a `order.channel === 'Woocommerce'`:
  - `cancelOrderInShop` (`woo/cancelOrder`);
  - `processOrderCompleted` (`woo/closeOrder`);
  - `updateTrackingInOriginOrder` (`woo/setTrackingOrder`).
- **No cambian:** los listeners (`order:paid` sale de `findById`, que no carga `channelUser`), el
  Service Bus (orders solo consume), sockets, mails, el webhook de orden y analytics (que usa
  `cart.channelUser`).
- **El riesgo era una conexión Woo colgada de un channel que no es de tienda.** Si la orden tiene
  `channel = 'Woocommerce'`, cancelar, cerrar o trackear le habría hablado a esa tienda. Ahora no
  pasa.
- **No se verificó qué `order.channel` manda shopcart.** La regla del workspace impide leer su
  código.

## Decisions

Las tomó el agente; Angelo puede objetarlas.

- **El channel nunca rechaza la orden** (coordinador, `ac3251b`). Si el channel no es del
  reseller, la orden se guarda sin channel y queda un error en el log. La primera versión
  (`c7d9359`) devolvía 400, y eso dejaba un pago sin orden.
- **La comprobación del dueño solo corre en `/save`.** El bus queda como estaba, porque está en
  retiro.
- **Un channel borrado es válido para `/save`.**
- **El guard de tienda va al leer la orden, no al guardarla.** Así `order.channelUser` queda
  siempre puesto, para la atribución al publisher.

## Blockers / open questions

- **Si `cart.user` no es el dueño de `cart.channelUser`, la orden queda sin channel** (y un
  `logger.error`). Conviene medir cuántos carritos hay así:

  ```sql
  SELECT COUNT(*) FROM cart c JOIN channel_user cu ON cu.id = c.channel_user_id
  WHERE c.user_id <> cu.user_id AND c.created_at > NOW() - INTERVAL 30 DAY;
  ```

- **Órdenes Woo viejas con un channel que no es 2/5/11** perderían la sincronización. Hay que
  medirlo:

  ```sql
  SELECT cu.channel_id, COUNT(*) FROM `order` o
  JOIN channel_user cu ON cu.id = o.channel_user_id
  WHERE o.channel = 'Woocommerce' GROUP BY cu.channel_id;
  ```

  Si se hace soft-delete de los channels 2/5/11 al retirarlos, también se corta la sincronización
  de sus órdenes en curso.
- **La suite de jest vieja (`yarn test`) no corre en develop.**
  - `e681ea2` dejó `DATADOG_API_KEY=   # ...` en `.env.test`, y dotenv 10 toma el comentario como
    valor. Eso es de Miguel y no se tocó.
  - Además, jest 27 no lee los `exports` de `@typespec/ts-http-runtime`.
  - Y el spec importa `mockRequest` con un tipo que no existe.
- **No se verificó si extensions u otros servicios leen `order.channel_user_id`** de la base
  compartida.

## Next session

- OK de Angelo y PR de `feature/brand-publisher` en orders.
- Correr las dos mediciones de arriba antes de desplegar shopcart F2.4.
