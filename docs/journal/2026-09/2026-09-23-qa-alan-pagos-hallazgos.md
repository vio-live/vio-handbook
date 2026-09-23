---
date: 2026-09-23
session: "Revisión del QA completo de pagos de Alan y apertura de tarjetas"
participants: [angelo, claude]
status: live
---

# QA completo de pagos (Alan, 22/09): hallazgos y causa del fallo de Kustom

## Goal

Alan probó todos los métodos de pago con el SDK 0.15.0, forzando errores, y dejó capturas y vídeo
en sus tarjetas. Angelo pidió revisarlo y abrir una tarjeta por hallazgo.

## Done

**Causa raíz del fallo de Kustom** (lo más grave: "falla más de lo que funciona"):

- El aviso de Kustom llega y Kustom confirma el pago. Al crear la orden, `orders-ms` la rechaza con
  `[orderService.isAvailable] variant <test> not found in product 409323`.
- `orders-ms` busca la variante **por título** (`product.variants.find(v => v.title === item.variantTitle)`).
  shopcart le manda el título del **producto**: en `kustom.service.ts`, `merchantData.variantTitle = i.title`.
- Falla, entonces, con productos **con variantes**, y funciona sin ellas: de ahí lo "intermitente".
- shopcart responde 500 y Kustom reintenta 48 h. Reproducido el 23/09 a las 07:46 reenviando el
  aviso de un pedido de Alan.
- Arreglo propuesto: resolver el título de la variante **por su id**, como ya hace `paymentQliroOk`,
  y mandar el título real en los datos del comercio.

**Un problema de fondo que lo escondía:** `orders-ms` expone `/save` con `@HttpCode(200)` y en el
`catch` **devuelve** `new BadRequestException(...)`. Responde 200 con el error en el cuerpo, así que
quien llama solo puede mirar si vino `id`, y el motivo nunca llega a sus logs.

**Verificado en código** de las observaciones de Alan sobre Stripe:
- Sin clave propia del vendedor, la clave pública sale vacía y no hay respaldo a la de plataforma,
  aunque el dashboard promete que Stripe cae en la cuenta de Vio.
- La lista de métodos solo añade Stripe si está activo `stripePaymentIntent`; con solo Link, no sale.

**Confirmado como arreglado** por Alan: Vipps con varios métodos y el formulario doble de Nexi, con
el SDK 0.15.0.

**Tarjetas abiertas** (Backlog): [Kustom](https://trello.com/c/8jMNMofp),
[orders-ms 200](https://trello.com/c/hxJKTPwp), [Adyen](https://trello.com/c/GhITOCaJ),
[Vipps móvil](https://trello.com/c/ulx3CmfX), [Stripe sin claves](https://trello.com/c/DrEd5upJ),
[Stripe Link](https://trello.com/c/3InMbKiw), [webhook de Stripe por API](https://trello.com/c/tGxeYY9k).

**Arreglo de Kustom hecho el mismo día**:
[shopcart #35](https://github.com/vio-live/vio-shopcart-microservice/pull/35), rama
`fix/kustom-variant-title`, pendiente de merge.
- El cierre del pago resuelve el título de la variante **por su id**, como ya hacía `paymentQliroOk`.
  Eso repara también los pedidos pagados antes del arreglo, que Kustom sigue reintentando.
- Una línea sin variante ya no manda el título del producto.
- El pedido que se manda a Kustom lleva el título real de la variante, resuelto en una consulta.
- Dos tests nuevos que fallan sin el arreglo; suite 268/268 y `tsc` limpio.

## Decisions

Ninguna todavía: Angelo decide cuáles se toman y en qué orden.

## Blockers

- Los pagos de prueba de Kustom de Alan siguen sin orden en Commerce. Se crearán al arreglar el
  título de la variante, por el reintento de Kustom o por el barrido.
- El rechazo de Adyen necesita el motivo exacto del Customer Area y saber qué tarjeta usó Alan.
- Vipps en móvil solo se ha visto en el vídeo de Alan; falta reproducirlo.

## Next session

1. Mergear shopcart #35 y comprobar en QA que los pedidos pagados de Alan se convierten en órdenes.
2. Elegir las demás tarjetas.
3. Pedirle a Alan la hora de un rechazo de Adyen y la tarjeta usada.
