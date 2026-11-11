---
title: "Un carrito, un pago: el lock es del carrito, y la validación del PSP también pregunta"
last-updated: 2026-11-11
owner: angelo
---

# Un carrito, un pago: el lock es del carrito, y la validación del PSP también pregunta

**Qué pasó (11/11, Kustom en el Replit de staging).** Alan abrió el mismo carrito en dos artículos (dos pestañas),
levantó el formulario de Kustom en las dos y pagó a la vez. Salieron dos órdenes del mismo carrito, **VIO-4710 y
4711** (y otra vez 4716/4717), completadas con 23 ms de diferencia. Las guardas de «un carrito, un pago» existían
desde el 09/10 (QA 4518/4519, [journal](../journal/2026-10/2026-10-09-review-alan-vev-estres.md)) y no lo pararon,
por dos huecos:

1. **La validación del PSP no preguntaba por el estado del checkout.** Cada `CreateCheckout` deja el anterior del
   mismo carrito en INACTIVE, pero el widget de Kustom de esa pestaña sigue en pantalla y Kustom lo sigue cobrando.
   Su callback de validación (lo último que Kustom nos pregunta antes de cobrar) solo comparaba la orden con su foto.
2. **La pregunta «¿ya se pagó por otro checkout?» se hacía bajo un lock con el nombre del checkout.** Dos pestañas
   tienen dos checkouts, así que dos locks distintos: las dos finalizaciones entraron a la vez y las dos oyeron «no».

**La regla.**
- Una comprobación de tipo «comprobar y luego actuar» necesita el lock **del recurso que protege**. Aquí ese recurso
  es el carrito, no el checkout (`vio:cart:<id>`, y siempre antes del lock del checkout).
- En los PSP que preguntan antes de cobrar (validación de Kustom y equivalentes), esa pregunta tiene que rechazar un
  checkout que no esté ACTIVE o un carrito que ya se pagó. Es el único momento en que aún se puede decir que no
  sin dinero movido.

**Cómo se ve:** dos checkouts SUCCESS con el mismo `cart_id`, creados con segundos de diferencia y completados
con milisegundos. Arreglo para Kustom: [vio-shopcart-microservice#119](https://github.com/vio-live/vio-shopcart-microservice/pull/119).

**Aplica a** cualquier finalización que dependa de «no se pagó ya por otro lado»: Vipps, Qliro, Walley y los
futuros. Todos usan hoy el lock por checkout.
