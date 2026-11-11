---
date: 2026-11-11
session: "Códigos de descuento como funcionalidad de la plataforma: Woo, Shopify, códigos de Vio por colección, selector por sponsor; en QA"
participants: [angelo, claude]
status: live
---

# Códigos de descuento de la plataforma, en QA

## Goal
Por la mañana el código de descuento pasó a configurarse por campaña y sponsor
([journal](2026-11-11-faves-codigo-por-campana-en-qa.md)). Angelo corrigió el enfoque: no es algo de faves. Tiene que
ser el flujo estándar para todas las marcas:
- cupones de **WooCommerce** y códigos de **Shopify**;
- **códigos de Vio** que la marca crea sobre sus **colecciones**;
- en la campaña, **elegir el código de una lista** de lo disponible;
- **solo con Vipps por ahora**, y después Kustom y el resto.

Además, el código no puede quedar público en el bootstrap: un cupón de la tienda también vale en la web de la marca.

## Done
- **Diseño:**
  1. 4 agentes de lectura: cupones de tienda, códigos de Vio por colección, dashboard y métodos de pago.
  2. Contrato común.
  3. 10 agentes de implementación en paralelo, uno por repo.
  4. Revisión cruzada de contratos.
- **Mergeado a QA (11/11, tarde):**
  - **kernel** [package-database#33](https://github.com/vio-live/package-database/pull/33), release **1.0.292**: código
    de marca con nombre único por marca, `discount_collection`, `source` y `ref` en el código de campaña, y
    `discount_cart.campaign_id`. Migración `1793100000000` aplicada en QA antes de los micros.
  - **api** [vio-api-microservice#78](https://github.com/vio-live/vio-api-microservice/pull/78): indicador `discounts`
    en cada método ofrecido. La lista vive en un único sitio: hoy solo `vipps`.
  - **extensions** [vio-extensions-microservice#74](https://github.com/vio-live/vio-extensions-microservice/pull/74):
    `POST /coupons/resolve` y `POST /coupons/list` para Woo y **Shopify** (Admin GraphQL en la versión actual). Cada
    cupón dice si Vio lo soporta y qué hace.
  - **shopcart**:
    - [#117](https://github.com/vio-live/vio-shopcart-microservice/pull/117): una sola guarda de métodos de pago con
      descuento, en lugar de tres listas que no coincidían;
    - [#118](https://github.com/vio-live/vio-shopcart-microservice/pull/118): orden de búsqueda canal → marca →
      tienda; códigos de marca por colección, resueltos al leer el carrito; aplicar por campaña con sus
      comprobaciones; quitar por carrito; el código de una campaña no sale en las respuestas al comprador.
  - **graphql** [graphql#41](https://github.com/vio-live/graphql/pull/41): `ApplyDiscount(cart_id, campaign_id)`,
    `DeleteAppliedDiscount(cart_id)` sin código y `discount_source`.
  - **base-api** [vio-base-api#69](https://github.com/vio-live/vio-base-api/pull/69): `/api/discount/brand`. La marca,
    o un admin por ella, gestiona sus códigos solo sobre sus colecciones.
  - **campaigns** [vio-campaigns-microservice#33](https://github.com/vio-live/vio-campaigns-microservice/pull/33):
    opciones del selector (códigos de Vio + cupones de la tienda + si hay método de pago apto) y validación al guardar.
    El bootstrap lleva `discount: {ref}`, nunca el código.
  - **dashboard** [webapp-vio-commerce#109](https://github.com/vio-live/webapp-vio-commerce/pull/109): página
    **Discount codes**, atajo desde las colecciones y selector por sponsor en la campaña. Sin variables de entorno
    nuevas.
- **SDK** [vio-web-sdk#148](https://github.com/vio-live/vio-web-sdk/pull/148) en `main`, sin publicar:
  - aplica el código de campaña por referencia;
  - no aplica códigos automáticos a una marca sin método de pago apto;
  - muestra «Fjern» en vez de dejar al comprador sin poder pagar.
- **App de Shopify** [vio-shopify-sync#135](https://github.com/vio-live/vio-shopify-sync/pull/135): scope
  `read_discounts`.
- **Smoke en QA, de punta a punta**:
  - código de marca creado sobre una colección («15 % on collection …»);
  - el bootstrap trae la referencia, `discountCode: null` y `discountMethods: ["vipps"]`, y el código no aparece en
    ningún lado;
  - por GraphQL, `ApplyDiscount(campaign_id)` aplica el 15 %, `GetCart` devuelve `discount_code: null` y
    `discount_source: CAMPAIGN`, otra campaña responde `COUPON_NOT_FOUND`, y quitar por carrito funciona.
- **Tarjeta de Alan** [DiIsksLg](https://trello.com/c/DiIsksLg): checklist 9 reescrito y checklist 10 nuevo.

## Decisions
- **Estándar para todas las marcas.** Nada nombra a un cliente, una campaña ni un código, ni en el código ni en los
  textos para publishers.
- **El código no sale del servidor.** El SDK aplica por campaña y el checkout lo busca. El pedido a la tienda sí lo
  lleva, para que cuente el uso.
- **Pagos:** códigos solo con métodos marcados `discounts` (Vipps). Siguiente fase: Apple/Google Pay y Kustom; después
  Klarna, Stripe, Qliro, Walley, Nexi y Adyen.
- **Shopify v1:**
  - soportado: porcentaje sobre todo, productos o colecciones; importe fijo por artículo que cubre el precio; mínimo
    de subtotal;
  - no soportado: un uso por cliente, BXGY, envío gratis, descuentos de apps y mínimo por cantidad.
- **Códigos de Vio v1:**
  - 1–90 % sobre 1–20 colecciones propias;
  - fin obligatorio, como mucho a 12 meses;
  - sin límite de usos;
  - `availableToCampaigns`: el publisher solo ve esos.
- **Sin variables de entorno nuevas** (Angelo): la página de códigos sigue la matriz de acceso.
- **Bumps del kernel en tandas de 4**, para no repetir los deploys rojos por descargar todas las imágenes a la vez
  (ver el playbook de cambios con migración).

## Blockers
- **Shopify:**
  - hay que desplegar la configuración de la app con el scope nuevo, y cada tienda tiene que aprobarlo;
  - falta comprobar en la dev store que Shopify cuenta el uso del código en los pedidos que crea Vio.
- **La tienda Woo de QA** de la marca de pruebas no responde. El selector lo dice («no responde»).
- **SDK:** la 0.38.0 publicada ya no recibe el código de campaña del backend nuevo. Hace falta publicar la versión
  siguiente.

## Next session
1. Alan estresa los checklists 9 y 10.
2. Desplegar la app de Shopify con `read_discounts` y probar un código real en la dev store.
3. Publicar la siguiente versión del SDK y pedir el bump a Replit (sin código en la página).
4. Prod, siguiendo los pasos de la nota privada de Angelo: migración antes que los micros, y después los micros en
   orden.
5. Fase 2 de pagos.
