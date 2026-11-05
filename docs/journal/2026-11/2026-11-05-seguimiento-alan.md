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

## Decisions
- La evidencia para Pearlconvert sale de Kustom Order Management, como tabla y JSON. Las capturas quedan solo para lo
  que Kustom no guarda: qué opciones ofreció el widget.

## Blockers
- Pearlconvert: que importen las 4690–4693 y contesten las dos preguntas (después de que Angelo mande el correo).

## Next session
1. ~~#479~~: hecho. Pendiente de la respuesta de Pearlconvert (peso y respaldo) y `termsUrl` de Boots en prod.
2. Arreglo del tachado con precios sin IVA en api-ms (`formatPricesAndTax` y `formatVariantPricesAndTax`), a QA.
   **OK de Angelo (14:30): «arréglalo en QA cuando acabe Boots».** Prod, aparte.
3. Alan: #472 (escenarios 3, 5.7 y 6), #478 («Takk!»), #477 (repetir la compra interna) y #476.
