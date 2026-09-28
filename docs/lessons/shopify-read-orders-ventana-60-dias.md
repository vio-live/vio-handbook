---
title: "Shopify contesta 404 (no 403) a órdenes fuera de la ventana de `read_orders`"
date: 2026-09-28
owner: miguel
---

## Síntoma

Dos mensajes de Google Pub/Sub de gladkokken (`wxuxre-tf.myshopify.com`) llevaban días
reintregándose en loop en `extensions` de prod: 658 y 623 redeliveries en 24h, ~1.281
reintentos inútiles por día. En los logs, siempre el mismo par de líneas:

```
[ERROR]: Error 404(Not Found) with {"errors":"Not Found"}
  by GET(https://wxuxre-tf.myshopify.com/admin/api/2024-04/orders/12591130411343.json)
[ERROR]: [PubSubService.subscribeToSupplierTopic]
  Error processing message 21262430616438297: {"errors":"Not Found"}
```

Lo confuso: el resto del flujo estaba perfecto. De 1.721 webhooks procesados en 24h,
1.719 salían bien. Sólo esos dos mensajes estaban trabados.

## Causa real

La app custom tiene el scope `read_orders`, pero **no** `read_all_orders`.

Con `read_orders` a secas, Shopify sólo deja leer órdenes de los **últimos 60 días**.
Para el resto devuelve **404 `{"errors":"Not Found"}`**, no 403. O sea: parece que la
orden no existe, cuando en realidad existe y lo que falta es permiso.

`read_all_orders` requiere aprobación manual de Shopify y una justificación de negocio.

Se confirma en vivo pidiendo la orden más vieja que el token puede leer:

```bash
curl -s -H "X-Shopify-Access-Token: $TOK" \
  "https://<shop>.myshopify.com/admin/api/2024-04/orders.json?status=any&limit=1&order=created_at%20asc"
```

El 2026-09-28 devolvió `#GK75603` del **2026-07-30** — exactamente 60 días atrás. Las dos
órdenes trabadas tenían IDs más bajos, o sea anteriores a ese corte.

El disparador es que un `fulfillments/update` **llega igual** para una orden vieja: basta
con que alguien le actualice el tracking en el Admin. El webhook trae el `order_id`, el
código va a leer la orden, y ahí se come el 404.

## Por qué quedó en loop infinito

El handler ya tenía un camino elegante para "esta orden no es de Vio" (loguea
`isnt from outshifter` y sigue), pero nunca llegaba: la excepción del 404 saltaba antes en
`findOrderById`, subía hasta `PubSubService.subscribeToSupplierTopic`, y ahí el `message.ack()`
está **después** del `await` del handler. Si el handler tira, no hay ack, y Pub/Sub reintrega.

La suscripción **no tiene dead-letter queue**, así que reintrega para siempre.

## Cómo se evita

1. Tratar el 404 de Shopify como "no la podemos ver", no como error recuperable. Reintentar
   no va a hacer aparecer una orden que está fuera de la ventana de permisos.
   Fix en [vio-extensions-microservice#10](https://github.com/vio-live/vio-extensions-microservice/pull/10):
   `findOrderByIdOrNull()` devuelve `null` en 404 y los handlers caen en el camino ya existente.
2. `call()` ahora adjunta el status HTTP al error. Antes tiraba `new Error(JSON.stringify(data))`
   y se perdía el código, así que río abajo era imposible distinguir un 404 de un fallo real.
3. **Poner dead-letter queue en las suscripciones de Pub/Sub.** Sin DLQ, un solo mensaje
   venenoso reintenta indefinidamente y nadie se entera. Con DLQ a los N intentos, esto se
   hubiera visto solo en vez de pasar días en silencio. Pendiente.

## Gotcha relacionado

Al revisar esto apareció que la suite de tests de `vio-extensions-microservice` **no corre
en un checkout limpio**: `@vio-/database` tiene `Component.data` con `@Column({ type: 'json' })`
y los tests usan sqlite (`DB_TYPE="sqlite"` en `.env.test`). TypeORM tira
`DataTypeNotSupportedError` y ninguna conexión se establece, así que ningún test del repo
puede correr. `simple-json` funcionaría en los dos motores. Ver el PR para el detalle.
