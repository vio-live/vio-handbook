---
date: 2026-11-13
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 13/11

## Goal
Repasar todo lo que Alan dejó en sus tarjetas abiertas, arreglar en QA lo que sea nuestro y contestarle. Angelo, 13/11:
«ve arreglando o comando lo que reporta alan y si tienes preguntas me las haces».

Las tres tarjetas abiertas:
- #480 [DiIsksLg](https://trello.com/c/DiIsksLg), códigos de descuento en Vev.
- #481 [zM6LN43p](https://trello.com/c/zM6LN43p), Boots × Kustom.
- #477 [BrkH9lRk](https://trello.com/c/BrkH9lRk), compra interna en Analytics.

## Done
- **08:30–09:20 UTC, repaso completo.** 107 capturas, el vídeo de la tarjeta y los dos que Alan subió a Drive. Todos sus
  comentarios tenían respuesta.
  - Lo de «el precio cambia sin aviso» del 12/11 (16:46–18:16) es anterior a
    [graphql#42](https://github.com/vio-live/graphql/pull/42), que llegó a QA a las 18:24. No es intermitente.
  - **«Borrar el cupón en Woo a mitad» se dio por bueno antes de ese arreglo.** El carrito decía 1 010 y Vipps cobró
    1 260 sin avisar: es el mismo reintento. Se le pidió a Alan que lo repita.
- **«Du handler hos» sin nombre de tienda:** es un dato, no un fallo. La marca 1331 tiene de logo
  `https://www.vio.live/vio-logo-white.svg` (tabla `brand_profile`). El SDK enseña el logo en vez del nombre, y un logo
  blanco no se ve sobre la cabecera blanca.
- **«…, eller velg en annen betalingsmåte» con un código en el carrito:** [vio-web-sdk#157](https://github.com/vio-live/vio-web-sdk/pull/157)
  (`05c3a0a`). Con código y como mucho un método que acepte descuentos, el error dice solo «Prøv igjen.».
  - Mergeado, sin release todavía.
  - En este Mac fallan 3 suites de `main` por el `localStorage` global de Node 26; no son del cambio.
- **«PROCTER &AMP; GAMBLE» en el carrusel de Boots.** El feed de Boots trae escapados el título y la marca.
  - [vio-products-microservice#65](https://github.com/vio-live/vio-products-microservice/pull/65) (`78b5f9b`):
    `decodeEntities` deshace un nivel en título, marca, tags, opciones y variantes. Mergeado y en QA desde las 09:12.
  - **Datos de QA:** 566 productos (487 de «Boots test» 1342, 79 del 1235) y 387 copias en `channel_user_products`,
    descodificados con la misma función.
  - **Ojo:** la reconstrucción de colecciones (`/channel-process/collections/update`) solo añade y quita filas; nunca
    reescribe el nombre de una fila que ya está.
  - Esos productos no salen de un `product_feed` (en QA solo existe el del 1299), así que una sincronización no los habría
    corregido.
- **Comentarios a Alan:**
  - **#480:** republicar la página de Vev, que estaba caducada; repetir el borrado del cupón; tres capturas que faltan; la
    causa del «Du handler hos»; ids en cada punto.
  - **#481:** confirmar que el artículo publicado de Careless sigue con su campaña; no más órdenes con la cuenta de Kustom
    de Boots (ya hubo al menos 5 de 2); el `&amp;` arreglado.
- **`shopcart-reconcile` en QA:** falló a las 06:30, 06:40 y 06:50 mientras QA arrancaba; desde entonces va bien.

- **Las respuestas de Angelo (13/11) y lo que se hizo:**
  - **El regalo comprado aparte, opción (a):** [vio-web-sdk#158](https://github.com/vio-live/vio-web-sdk/pull/158).
    - En la ficha, mientras el producto es el regalo del carrito, «Legg i handlekurv» queda desactivado con la nota
      «Produktet er allerede med som gave…».
    - El carrito ya no lo añadía (`addManual` devuelve la línea del regalo tal cual), pero la ficha decía «Lagt i
      handlekurven» y mandaba `vio:added-to-cart`.
    - Release 0.39.4 ([#159](https://github.com/vio-live/vio-web-sdk/pull/159), `478a5c9`) y desplegado en Vev
      ([vev#88](https://github.com/vio-live/vev/pull/88), paquete cq1lXld-TA9). En npm, cuando lo publique Angelo.
  - **#480:** se desmarca otra vez «Borrar el cupón en Woo a mitad» (lista 4) y se añade la prueba del regalo desde la
    ficha (lista 3).
  - **El logo claro:** no se toca el SDK; el logo lo sube Vio en el alta de la marca. Se añadió al playbook
    `alta-marca-en-articulo.md` (paso 7) que tiene que verse sobre blanco.
  - **La captura `1845fe`:** no se borra ni se rota nada.
  - **Las órdenes de más en la cuenta de Kustom de Boots:** Angelo ya avisó.

## Decisions
- El logo blanco de la 1331 es de la tienda de pruebas de Alan; se le explica la causa y él decide.
- Los arreglos para lo que reporta Alan se mergean y se despliegan en QA sin preguntar cada vez. Producción, no.

## Blockers
> [claude, 2026-11-13] Contestadas (ver Done) menos la 3, que Angelo pidió que se le explique.

Preguntas a Angelo (13/11):
1. **Captura `1845fe` en #480:** sale un fragmento de una credencial de Vipps en el editor SQL de Alan. ¿Se borra de la
   tarjeta? ¿Se rota la clave?
2. **El regalo comprado aparte:** si el producto de regalo se añade desde el carrusel, se suma a la línea del regalo y el
   pago se bloquea con `GIFT_MAX_ONE_UNIT`. Dos salidas:
   - que el SDK no deje añadirlo y lo explique;
   - partir la línea en el pedido.
3. **Pedidos en Woo con `payment_method: 'bacs'`:** la marca ve «Direct bank transfer». ¿Se cambia a un id propio? Puede
   afectar a integraciones contables que mapeen `bacs`.
4. **Logo claro en la caja:** ¿el SDK debería enseñar el nombre junto al logo?
5. **La cuenta de Kustom de Boots** tiene al menos 5 órdenes de prueba de Alan del 11/11. ¿Se avisa a Boots?

## Next session
- **Producción para products#65:** el release y el mismo arreglo de datos para el catálogo de Boots en producción
  (productos y `channel_user_products`). Necesita el OK de Angelo.
- **npm 0.39.4:** lo publica Angelo desde `478a5c9`.
