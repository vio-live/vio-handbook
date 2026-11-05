---
date: 2026-11-05
session: "Guardia de Alan, tarde del 05/11"
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan, 05/11

## Goal
Angelo (14:20 UTC): «y el resto del día de Alan, como habíamos acordado». Primero, las cuatro órdenes de Boots con el
Shipping Assistant de Kustom (#479), con el correo a Pearlconvert en borrador cuando estén bien.

## Done
- **#479 Boots × Kustom Shipping Assistant** (QA y cuenta de test de Kustom de Boots, PM47345027):
  - Pearlconvert (Artsiom, 12:58 UTC) no pudo importar la 4661 ni la 4662: salieron con nuestra tarifa de respaldo
    «Test to NO». Pidió cuatro órdenes nuevas con el Shipping Assistant: punto de recogida, domicilio, recogida en
    tienda (si se ofrece) y varios productos con cantidad mayor que 1. Todas con `vio_checkout` y autorizadas.
  - 14:05 UTC: «Boots test» (1342) pasa a `providerShipping: true` en QA. Vio deja de mandar `shipping_options` y el
    envío sale del Shipping Assistant dentro del widget. La captura ya era `account`, así que Vio nunca captura.
  - Comprobado en el código antes de activarlo:
    - la validación compara solo la mercancía (`matchesMeta`), así que un envío del Shipping Assistant no la rompe;
    - `createKustomOrder` toma el envío de `selected_shipping_option`;
    - la SDK muestra lo que diga Kustom.

    Nunca se había hecho una compra con el interruptor encendido.
  - Tarjeta [#479](https://trello.com/c/5pai3V16) a Alan (14:10). Angelo lo llamó y la tomó a las 14:16.
    - Evidencia: un comentario por orden. Solo hay captura de las opciones de envío en la prueba de recogida en tienda.
    - Los datos para el desarrollador salen de Order Management, no de capturas (decisión de Angelo).
  - Vigilancia: un script cada 45 s revisa en Kustom cada orden nueva de 1342, los errores de Kustom en shopcart y
    los comentarios de la tarjeta.
- **#472, escenario 5** (13:00–13:19), revisado en la base:
  - descripción `✔ Vegansk 🌿 Myk og varm` guardada tal cual en el 416041;
  - colección «Trello vAqIqpIi» con 3 productos, compartida con el publisher (13:04) y en el channel sin error (13:06).

  Falta el paso 7. Contestado a las 14:24, con el orden siguiente: escenario 3 con QA-D, usado también para el paso
  7, y después el 6.
- **Fallo de precio, visto en las capturas de #472** (no lo reportó Alan): en las tiendas Woo con precios **sin IVA**
  (`woo_connection.prices_include_tax = 0`), api-ms `formatPricesAndTax` suma al tachado el IVA del precio actual.
  - En el 416041 el tachado sale 120 + 25 = 145, cuando debería ser 150. Le pasa también a las variantes.
  - Una tarjeta de Vev sin país muestra el precio sin IVA (100) mientras la ficha muestra 125.
  - Prod: la tienda 1300 tiene precios sin IVA, y la 1303 y la 1321 no lo tienen guardado (se pregunta a Woo).
    QK (1302) y Faves (1301) usan precios con IVA y no están afectadas.

- **#479 cerrada (14:41–14:52 UTC): cuatro órdenes, todas autorizadas y sin capturar.** Todas llevan
  `vio_checkout` y `tms_reference`, y la orden de Vio cuadra con Kustom en envío, líneas y cantidades.
  - **4690:** «Utlevering i Boots Apotek» (`PICKUPSTORE`, Boots Apotek Oslo S, 0 kr). La recogida en tienda sí se
    ofrece.
  - **4691:** «Postnord – Utleveringssted» (`PICKUPPOINT`, 49 kr).
  - **4692:** «Postnord – Hjemlevering» (`HOME`, 89 kr).
  - **4693:** 999143 × 2 + 999874 × 1, punto de recogida (488,78 NOK).
  - En Order Management, el envío del Shipping Assistant lleva `carrier`, `carrier_product`, `method`, `type`,
    `tms_reference` y `location` (con dirección). La orden de Vio guarda la dirección del comprador, no la del punto
    de recogida: a Boots no le hace falta, porque lee de Kustom.
  - El widget mostraba los términos de Vio: «Boots test» no tiene `termsUrl`. En prod hay que poner
    `boots.no/generelle-vilkar`.
  - Borrador en Gmail a Artsiom (14:55), como respuesta en el hilo, con Michael y Thomas en copia: tabla, JSON de
    Order Management sin datos del comprador, y las preguntas de peso y respaldo. Lo manda Angelo. Tarjeta a Done.

- **Precios de las tiendas Woo sin IVA, arreglados en QA**
  ([vio-api-microservice#77](https://github.com/vio-live/vio-api-microservice/pull/77), merge `9982488`, desplegado
  15:12 UTC).
  - Al tirar del tachado salió algo peor. El carrito cobraba bien (125 = 100 + 25 %, tachado 150), pero
    `GetProductsByIds`, que usa la tarjeta de Vev, daba **100**. Solo selecciona `product.origin` si la consulta lo
    pide, y sin él la comprobación del IVA de Woo nunca se cumplía.
  - Tres commits:
    1. `vatOnTop()`: cada importe con su propio IVA. El tachado estaba mal en tres sitios.
    2. `origin` siempre seleccionado; se quita de la respuesta si no se pidió.
    3. Misma regla que el carrito (`cart.service`): solo la conexión Woo más reciente del vendedor, y con
       `originId`.
  - El tercer commit salió de una revisión independiente del diff. La regla anterior miraba cualquier conexión
    Woo del vendedor, así que una conexión vieja sin IVA habría hecho que la tarjeta y el carrito vuelvan a no
    cuadrar.
  - Verificado en QA por GraphQL: `GetProductsByIds` y `Products` dan p1 125/150, p2 350/375 y p3 375/400, como el
    carrito.
  - Tests: `jest.unit` 38 suites en verde; las 3 de `paymentMethod` fallan igual en `develop`. `tsc` sin errores
    nuevos.
  - Alan, avisado en #472 (15:14). **Prod, pendiente del OK de Angelo:** tienda 1300 (sin IVA), y la 1303 y la
    1321 si Woo responde «no».

- **#472, tarde:**
  - **Escenario 3 ✅** (15:28). Alan renombró a QA-D un producto que ya tenía (411962, Woo id 26) en vez de crear
    uno nuevo. El Sync puso «Serum», quitó la vieja «Activewear» y no duplicó Hudpleie ni Serum.
  - **Guardar en Woo ≠ Sync:** al pulsar «Actualizar» en Woo solo viajan la descripción y el SKU (`newUpdate`), sin
    categorías. Las categorías llegan con el Sync del plugin. Queda preguntado a Angelo si debe ser así.
  - **Tres niveles ✅:** con el Sync de p1 (16:25) se creó «QA-D» bajo Serum (6011) y p1 quedó solo con ella.
  - Falta el paso 7 del escenario 5: QA-D ya tiene emoji, pero sigue en Draft y fuera de la colección.
  - **Escenario 6 (Shopify):** Alan no podía conectar su app `vio-client-dev` porque apuntaba al Redis de staging,
    borrado el 03/11. La app solo usa Redis para la conexión automática (`LOGIN_TOKEN_<shop>`) y la auditoría: con
    `REDIS_URL` vacío se salta Redis y ofrece conectar pegando la API key. Instrucciones a Alan a las 16:51.

- **#472 completa (17:48):**
  - **Escenario 7 ✅** (4694 y 4695, enviadas desde Shopify). Vio guardó el seguimiento, la línea quedó en
    COMPLETED y no hizo un segundo envío («already fulfilled»).
  - **Escenario 6 ✅** (4696). Alan probó primero con el publisher (allermedia), que no puede añadir seguimiento;
    lo hizo después con la marca `Alan-brand-stg@vio.live`. Vio creó un envío en Shopify (fulfillment
    7327727943838), no lo duplicó al volver el aviso, y Vipps capturó al enviar (5.490 øre).
  - **Paso 5.7 ✅:** QA-D publicado y en la colección, y entró solo al channel 521 (17:12:52).
  - **Visto de paso, sin arreglar:** con un transportista de la lista de AfterShip, orders guarda como enlace de
    seguimiento `API_BASE_HOST`, no un enlace del transportista. Es un parche de Alan del 14/07 (`1e471e2`), también
    en `master`, en `orders saveTrackingNumber`, y el enlace llega a Shopify. Propuesto a Angelo.
  - Los WARN «webhook NOT created … ARN de EventBridge es de otra app» al reconectar `vio-client-dev` son esperados:
    sus avisos llegan por la suscripción de la app, y los `orders/fulfilled` llegaron bien.
  - Cola de Alan: #478 y después #477. Pedida la comprobación de precios de p1 (125/150) antes de pasar #472 a Done.

- **#472 a Done (18:13)**, tras ver los precios arreglados en su página: ficha de p1 a 125, tachado 150, y Vipps
  cobra 135 (125 + 10).
- **#478 «Takk!» tras Vipps, completa (18:20–18:51):**
  - Alan tuvo que volver a publicar su página para coger la SDK 0.37.8; antes de eso su bundle seguía en 0.37.7 y
    el «Takk!» de la 4697 salió sin líneas.
  - **4698**, Vipps con envío de pago: línea, «Frakt – Default Shipping 10 Kr» y Totalt 135.
  - **4699**, Stripe: igual.
  - **4700**, Vipps Express con envío gratis: «Frakt – Gratis frakt · Gratis» y Totalt 125.
  - **Vipps cancelado** (checkout de las 18:48): CANCEL sin orden, de vuelta en la caja con el aviso y sin recibo.
    Los campos de dirección vacíos están bien: era Express y el checkout nunca tuvo dirección.
  - Tarjeta a Done. Siguiente: #477.

- **#476 Estrés del alta (desde 19:03):**
  - **Parte A ✅ (A1–A6 marcados):**
    - Alta de la marca 1344 y conexión con el publisher 1346 (solicitud aceptada a las 20:33).
    - 6 productos de Woo publicados, tarifa de 10 kr y Stripe.
    - Colección «5 NOV» (yFo0We67x) compartida, y sus productos en el channel 523.
    - Campaña 27 en la surface 19, con 15 %. Perfil de marca con logo.
    - Orden 4701 con Stripe (1.260 kr) y el «Takk!» completo.
  - **Aviso falso al invitar:** «No Vio user with that username or ID — try their email instead», aunque en la base
    todas las invitaciones y comparticiones salieron bien (`validateExist` 200, `share-multiple-collection` 200). En
    el webapp (`src/lib/connections.js`) hay dos causas posibles:
    - `invitePartnerWithCollections` convierte en «not-found» cualquier 400/404 de `shareCollections`, que lanza
      cuando la colección no se pudo compartir;
    - con colecciones marcadas, un email que aún no existe no va a `inviteExternal` y pide «try their email».

    Preguntado a Alan qué escribió.
  - **Parte B:**
    - B1 ✅: un producto añadido a la colección entra en el channel en 1 s.
    - B2 ✅: el producto quitado sale del channel.
    - B5 ✅: compartir dos veces, colección vacía y mismo producto en dos colecciones, sin duplicados.
    - **B3, hallazgo:** no hay ninguna pantalla para dejar de compartir una colección. Existen `DELETE
      /collection/shared` y `stopUsingShared` en `src/lib/collections.js`, pero nada los usa.
    - B4, a medias: la colección borrada nunca estuvo en el channel.
    - B6, sin hacer: «Unsync» del plugin deja el producto en Vio a propósito (`class-ajax.php`); el borrado es
      «Delete from Vio».

    Pedido a Alan repetir B4 y B6. Visto también: «Showing 8 of 8» con paginación «1 / 2».

## Decisions
- La evidencia para Pearlconvert sale de Kustom Order Management, como tabla y JSON. Las capturas quedan solo para lo
  que Kustom no guarda: qué opciones ofreció el widget.

## Blockers
- Pearlconvert: que importen las 4690–4693 y contesten las dos preguntas (después de que Angelo mande el correo).

## Next session
1. ~~#479~~: hecho. Pendiente de la respuesta de Pearlconvert (peso y respaldo) y `termsUrl` de Boots en prod.
2. ~~Arreglo del tachado con precios sin IVA, a QA~~: hecho (#77). Prod: pedir el OK a Angelo.
3. Alan: ~~#472~~ y ~~#478~~ hechas; quedan #477 (repetir la compra interna) y #476.
