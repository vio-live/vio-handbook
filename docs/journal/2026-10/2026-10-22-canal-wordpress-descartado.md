---
date: 2026-10-22
session: "El canal WordPress no se va a usar (decisión de Angelo)"
participants: [angelo, miguel]
status: live
---

# El canal WordPress no se va a usar

## Goal

Al pasar `VIPPS_API_URL` a producción en `payment-processors` conté que el plan de go-live decía que
`orders` usaba Vipps «en pedidos de canal WordPress». Angelo (22/10 12:43): «wordpress como canal no
vamos a usar».

## Qué es exactamente, y qué no

- **Canal WordPress** = el tipo de canal `Wordpress` (id **7**) de la tabla `channel`, con su rama en
  `orders` (`order.service.ts:2857`, `wordpress: () => {…}`). Esa rama es la que cancela el pago
  delegando en `payment-processors`: `/klarna/cancelPayment`, `/stripe/cancelPayment` y
  `/vipps/cancelPayment`. **Esto es lo que Angelo descarta.**
- **No es** el plugin `vio-sync-for-woocommerce`, que está publicado en WordPress.org y **sí está en
  uso**: hoy mismo vi webhooks reales de `qkoreancosmetics.no` entrando por
  `wooController/receiveWebhook` en `base-api`. Son dos cosas distintas con nombres parecidos; no
  confundirlas al retirar nada.

## Estado medido en producción (22/10, lectura desde un pod de users)

- 12 tipos de canal en `channel`. `Wordpress` está `enabled = 1`, **pero con 0 instalaciones** en
  `channel_user`.
- Las **únicas 3 instalaciones** de producción son del canal **`GraphQl`** (id 12). Todos los demás
  canales, `Woocommerce` (id 5) y `Shopify` (id 2) incluidos, están a 0.
- **0 órdenes** por cualquier canal.

O sea: la decisión **no pide ninguna acción**. No hay nada que apagar, migrar ni limpiar.

## Consecuencia que sí importa

El handler `wordpress` de `orders` era el **único consumidor conocido** de las rutas Vipps legacy de
`payment-processors` (`/vipps/capturePayment`, `/captureFullPayment`, `/cancelPayment`). Descartado el
canal, esas rutas quedan **sin consumidor conocido**, lo que confirma por una segunda vía lo que ya
había medido: tráfico cero. Refuerza que pasarlas a `api.vipps.no` el 22/10 fue inocuo.

No las retiro: eso es decisión de Angelo y no lo ha pedido. Queda anotado para cuando se limpie.

## Pendiente, si Angelo quiere

`Wordpress` sigue `enabled = 1` en `channel`, así que un vendedor lo vería como opción en el
dashboard aunque nadie lo use. Ponerlo a `0` es un `UPDATE` de una fila, pero es un cambio de
producto, no de infraestructura: no lo toco sin que lo pida.
