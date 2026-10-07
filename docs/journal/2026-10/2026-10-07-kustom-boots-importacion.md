---
date: 2026-10-07
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-10-07 — Boots: cómo importar nuestras órdenes en su Magento

## Goal

El desarrollador de Boots ofreció importar las órdenes de Vio en su Magento si le pasamos "un
archivo o algo", sin decir formato. Definir qué proponerle y mandarle un ejemplo concreto.

## Done

- **Leído el plugin de Kustom para Magento** (v12.0.23) y el código oficial de Magento: cómo crea
  el plugin una orden nativa, por qué nunca trae órdenes desde Kustom, y que el stock depende del
  camino (por el carrito sí, con `POST /V1/orders` no). Todo en
  [`architecture/kustom.md` §Importación por el desarrollador del comercio](../../architecture/kustom.md#importación-por-el-desarrollador-del-comercio-boots-2026-10-07).
- **Propuesta: entregar en el formato del pedido de Kustom** (Order Management), por dos vías: que
  Kustom le avise directo con el webhook de cuenta (`order.created`, filtrando `vio_checkout`), o
  mandarle el JSON nosotros.
- **Ejemplo** con la estructura exacta de un pedido pagado del playground y valores ilustrativos:
  [`architecture/assets/kustom-order-example.json`](../../architecture/assets/kustom-order-example.json).
  Mensaje corto en noruego listo para que lo mande Angelo.

También en estos días (06/10):

- **Walley IVA ×100 arreglado:** [shopcart#55](https://github.com/vio-live/vio-shopcart-microservice/pull/55)
  mergeado a `develop` (`taxRateAsFraction`, como Qliro). `tsc` limpio y 469/469 tests. Sale a prod
  con el próximo release.
- **Customer vacío de Stripe:** verificado que está arreglado en `develop` (`stripeCustomerFrom`,
  con test). Prod sigue creando el customer vacío hasta el release.
- **El kernel `@vio-/*` se instala en local:** los paquetes son privados en npmjs (sin token, 404).
  Con un token de npm con lectura del scope en `~/.npmrc`
  (`@vio-:registry=https://registry.npmjs.org/` y `//registry.npmjs.org/:_authToken=…`) corren
  `yarn install`, `tsc` y jest en los repos de Commerce. El token no va a ningún repo.

## Decisions

- Para la demo: **orden offline** creada por el desarrollador del comercio **por el carrito**
  (stock automático), con un método offline y el `order_id` de Kustom guardado en la orden. Nunca
  `klarna_kco` sin el link.
- Mensaje al comercio **simple y en noruego** (Angelo): "¿se puede importar sin una integración?
  ¿qué formato les sirve? ¿funciona este, falta algo?".

## Blockers

- La respuesta del desarrollador de Boots: formato, y qué identificador usa como SKU.
- Publicar los 3.821 productos del feed de Boots sigue esperando la decisión sobre la clase de envío
  de los productos de feed ([30/09](../2026-09/2026-09-30-feed-precios-origin-url-y-lekekassen.md)).

## Next session

- Si confirman `g:id` como SKU: cambiar el orden en `reference` (`kustom.service.ts`) y en
  `order.paid`.
- Según su respuesta, definir la entrega: webhook de Kustom (sin nosotros) o archivo/POST nuestro.
- El próximo release a prod lleva Walley (#55) y el customer de Stripe.
