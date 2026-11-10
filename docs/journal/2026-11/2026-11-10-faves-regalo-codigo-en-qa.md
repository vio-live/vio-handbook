---
date: 2026-11-10
session: "faves: regalo con cupón de Woo por Vipps — de ramas locales a QA"
participants: [angelo, claude]
status: live
---

# faves: regalo con cupón de Woo, en QA y listo para el estrés de Alan

## Goal
faves.no quiere ofrecer en su campaña de Vio el regalo que ya da en su tienda: el cupón de Woo `gratis_face_mask`
(Smart Coupons) añade una mascarilla gratis al carrito. Hay que hacerlo con Vipps. Alcance y diseño:
[handoff](../../handoff/faves-regalo-gratis-vipps.md). Hoy, Angelo: «mergear a QA todo y dejarlo listo para Alan
mañana».

## Done
- **Backend mergeado a `develop` (QA)** a las 22:28 UTC; los 6 deploys en verde y los pods en marcha a las 22:34:
  - shopcart [#116](https://github.com/vio-live/vio-shopcart-microservice/pull/116):
    - cálculo por unidad en øre;
    - orden con precios netos (el regalo a 0) y foto del descuento al pagar;
    - resolver de cupones de Woo, revalidado antes de cobrar;
    - Stripe, Qliro, Walley y Nexi rechazan un carrito con código;
    - caché negativa y tope de códigos desconocidos por canal.
  - extensions [#72](https://github.com/vio-live/vio-extensions-microservice/pull/72): `POST /woo/coupons/resolve`.
    Entiende el núcleo de Woo (`percent`, `fixed_product` que regala el producto) y los regalos de Smart Coupons
    (`wc_sc_add_product_details`, 1 unidad al 100 %). El pedido vuelve a Woo con `coupon_lines`.
  - extensions [#73](https://github.com/vio-live/vio-extensions-microservice/pull/73): el envío viaja como texto.
  - graphql [#40](https://github.com/vio-live/graphql/pull/40): `ApplyDiscount` devuelve `gifts[]` y el contrato
    de rechazos.
  - graphql [#39](https://github.com/vio-live/graphql/pull/39) y base-api
    [#68](https://github.com/vio-live/vio-base-api/pull/68): endurecimiento de permisos de descuentos.
  - Smoke en QA: los permisos responden como se espera y `ApplyDiscount` funciona.
- **SDK**: [vio-web-sdk#145](https://github.com/vio-live/vio-web-sdk/pull/145) a `main`, **sin mergear ni
  publicar**.
  - El código de página (`discountCode` / `?vio_discount=`) se aplica solo; el campo «Rabattkode» es opcional.
  - El regalo sale como «Gratis» y el descuento en una fila «Rabatt»; se cobra lo neto.
  - «Kjøp nå med Vipps» espera a que el regalo esté en el carrito.
  - Con un código en el carrito solo se ofrece Vipps.
  - Página de QA en `examples/`, configurable por URL. Admite un túnel https para la vuelta de Vipps y para el móvil.
- **Producto de regalo de faves** (Vio 421306) en la colección de su campaña y en el canal del publisher. **No
  se publica en el artículo**: el SDK pinta productos por id, y el carrito lo añade como regalo.
- **Tarjeta de estrés para Alan:** [DiIsksLg](https://trello.com/c/DiIsksLg), 8 checklists y 56 casos
  (entradas × origen, tipos de cupón, manipular el carrito, tiempo y fallos, métodos de pago, después de pagar,
  regresión, permisos).
  - Banco: marca de QA 1331 con una TasteWP nueva que crea Alan; campaña 18, canal 516.

## Decisions
- **Los códigos de este escenario los crea la marca en su Woo**, y Woo es la fuente de verdad para ellos. Vio
  **conserva** sus códigos propios: primero busca uno de Vio en el canal y, si no hay, pregunta a la tienda.
- **Opción A para faves:** regalo auto-aplicado con `discountCode: 'gratis_face_mask'` en Replit, sin campo.
- **El SDK no sale en beta:** Alan lo estresa desde la rama en local. Se publica en npm cuando dé el «OK para
  publicar».
- No se copia a Vipps el truco «http en localhost» de Adyen: no está verificado que Vipps acepte una vuelta http.
  Para probar en local se usa un túnel https.

## Blockers
- La TasteWP anterior de la marca 1331 caducó. Hasta que Alan conecte la nueva, los cupones de Woo de esa marca
  responden `COUPON_UNAVAILABLE`.
- La tienda nueva puede repetir ids de Woo de productos viejos de la misma marca. El resolver (`origin_id`, sin
  orden) podría elegir el producto viejo. Se revisa al montar el banco; si pasa, se ataja en el dato de QA.
- Tests del SDK en local con Node 26: `cart-manager.quantity` y `vio-cart.stepper` fallan también en `main`
  (`localStorage.clear`). No son de la rama.

## Next session
1. Alan conecta su TasteWP como 1331 (SKU `QA-P1`…`QA-G2`) y crea `qa20`. Después Claude crea el resto de cupones
   y el código de Vio `qa_vio10`, mete los productos en la campaña 18 y le pasa los ids para `productIds=`.
2. Estrés de Alan, hasta el «OK para publicar».
3. Mergear #145, bump + CHANGELOG, `npm publish`, snippet de Replit para faves (campaña 4).
4. Release de los micros a prod, con los pasos de la nota privada de Angelo. El cupón de faves vale hasta el 30/11.
