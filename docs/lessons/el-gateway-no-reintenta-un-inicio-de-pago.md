---
title: "El gateway no reintenta un inicio de pago"
last-updated: 2026-11-12
owner: angelo
---

# El gateway no reintenta un inicio de pago

## Qué pasó (12/11, QA, códigos de descuento con Vipps)

Shopcart rechaza **una sola vez** el primer pago de un carrito cuyo cupón cambió en la tienda desde que se aplicó.
Responde `COUPON_CHANGED` para que el comprador vea el precio nuevo antes de pagar. Alan nunca vio el aviso: el
carrito abría Vipps con el precio nuevo, sin decir nada.

**El fallo estaba en el gateway GraphQL.** Su fetcher reintenta cualquier llamada que falle, incluidos los 4xx
(`axios-retry` con `retryCondition: () => true`). Así se veía en los logs de shopcart:
- 18:10:09.678: `COUPON_CHANGED`;
- 18:10:09.899: el mismo `PostInitPaymentVipps` otra vez;
- el segundo intento ya pasaba.

Por la misma razón, cada 503 o 429 de Vipps se convertía en unas 4 llamadas por toque. Eso agravó el límite de
peticiones de Vipps esa tarde (19 × 503 y 3 × 429 en ocho minutos).

## La regla

- **Un inicio de pago (crear sesión, crear pago o enlace) se envía una vez.** Va con `retries: 0` en
  `fetch.request`, como ya hacían las llamadas de descuento de `ApiRestSdkDiscountService`. El comprador vuelve a
  tocar el botón y el SDK le dice por qué cuando hay motivo.
- **Un 4xx es una respuesta, no un fallo transitorio.** Reintentarlo cambia el significado de los rechazos que están
  pensados para darse una sola vez (`COUPON_CHANGED`). Con los demás no se gana nada: se repite el mismo rechazo.
- **Un 5xx o un timeout en un POST que crea algo** puede dejar dos pagos si se repite. Si de verdad hace falta
  reintentar, que sea en el cliente, con el comprador delante.

## Cómo se ve

En los logs de shopcart, el mismo inicio de pago dos veces, con 200 ms o 1 s de diferencia y sin que el usuario
haya tocado nada. También ráfagas de cuatro llamadas al proveedor por cada error.

## Estado

- **Vipps:** arreglado en [graphql#42](https://github.com/vio-live/graphql/pull/42).
- **El resto de inicios de pago** del mismo servicio (Stripe, Klarna, Kustom, Qliro, Walley, Nexi, Adyen) siguen con
  el reintento por defecto. El 12/11 se vio el rechazo de Stripe tres veces en el log.
