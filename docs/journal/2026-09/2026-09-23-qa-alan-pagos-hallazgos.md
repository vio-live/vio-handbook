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
- **Mergeado y verificado en QA el mismo día**: reenviando los avisos de los tres pedidos que
  quedaron pagados sin orden, se crearon las órdenes **4325, 4326 y 4327**, con referencia y
  acuse en Kustom. Sin rastro del error de la variante.

**Segunda tarjeta hecha: los errores del servicio de órdenes se ven** (tarjeta
[hxJKTPwp](https://trello.com/c/hxJKTPwp)), en dos PRs pendientes de merge:
- [orders-ms #10](https://github.com/vio-live/vio-orders-microservice/pull/10): `/save` lanza la
  excepción en vez de devolverla, así que responde 400 con el motivo. No se pudo probar en local
  (sin archivo de bloqueo, kernel privado no instalable, y su CI no corre tests en PRs).
- [shopcart #36](https://github.com/vio-live/vio-shopcart-microservice/pull/36): Kustom, Qliro,
  Walley, Nexi y Adyen registran el motivo del rechazo; Adyen no registraba nada. Suite 268/268.

Mergeadas y verificadas en QA el mismo día: el servicio de órdenes responde **400** con el motivo
ante un guardado rechazado, comprobado con una llamada directa que no crea nada, y la imagen
desplegada de shopcart trae los registros de los cinco proveedores. Falta ver el mensaje con un
rechazo real: desde el despliegue no ha fallado ninguna orden.

**Encontrado de paso**, tarjeta [dBzwSnav](https://trello.com/c/dBzwSnav): con Qliro, Walley y Nexi
un guardado rechazado se traga el error, así que el proveedor recibe un OK y no reintenta, y el
comprador paga sin orden. Kustom y Adyen sí lanzan, y por eso sus pagos se recuperan.

## Decisions

Ninguna todavía: Angelo decide cuáles se toman y en qué orden.

## Blockers

- El rechazo de Adyen necesita el motivo exacto del Customer Area y saber qué tarjeta usó Alan.
- Vipps en móvil solo se ha visto en el vídeo de Alan; falta reproducirlo.

## Next session

1. Que Alan repita el QA de Kustom en su canal, con productos con variantes.
2. Elegir las demás tarjetas.
3. Pedirle a Alan la hora de un rechazo de Adyen y la tarjeta usada.
