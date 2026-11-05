---
date: 2026-11-04
session: products OOM e imágenes retiradas; Redis de staging
participants: [angelo, claude]
status: live
---

# products: los abortos de memoria eran las imágenes borradas, y staging no importaba de Shopify

## Goal

Angelo (03/11, noche): «arregla todo staging y las caídas de prod», coordinando con Miguel por el
[handoff](../../handoff/2026-10-19-coordinacion-claude-miguel.md) hasta dejarlo en prod.

## Done

- **Causa de los abortos de `products`** (10 en 12 h el 03/11): el import de Shopify buscaba el producto anterior con
  `withDeleted` y sus relaciones eager. Eso arrastraba todas las imágenes retiradas multiplicadas por los JOIN
  («Stella»: ~200.000 filas). Lección: [withDeleted con relaciones eager](../../lessons/withdeleted-con-relaciones-eager-carga-los-hijos-borrados.md).
  El mismo import era también el origen de las huérfanas que Miguel barre cada hora (la cascada ponía a NULL el
  `product_id` de las imágenes antiguas).
- **Código** (`vio-products-microservice`):
  - [#52](https://github.com/vio-live/vio-products-microservice/pull/52):
    - producto anterior sin relaciones eager;
    - imágenes de producto emparejadas por URL;
    - webp subido con un nombre fijo y en la misma fila;
    - purga de retiradas tras cada import.
  - [#54](https://github.com/vio-live/vio-products-microservice/pull/54): tope de 500 por import.
  - Release a prod: [#53](https://github.com/vio-live/vio-products-microservice/pull/53) (`e876a2c`, ~07:15 UTC).
- **Purga en prod** (OK de Miguel a las 00:23):
  - Se borraron 174.976 imágenes con borrado lógico, exportadas antes a NDJSON; `image` pasó de 212.434 a 37.167 filas.
  - Las vivas no se tocaron: 29.898 de producto y 5.453 de variante.
  - **Incidente mío, 00:15–00:25:** el primer intento disparó el trigger por fila de `image`, bloqueó los INSERT,
    tumbó 28 imports y el barrido de las 00:20. Lo paré con `KILL` y relancé los 8 productos afectados.
    Lección: [borrar en `image` dispara un trigger por fila](../../lessons/borrar-filas-de-image-dispara-un-trigger-por-fila.md).
- **Staging:** el cliente Redis propio de extensions forzaba TLS e ignoraba `CACHE_TLS`. Con el Redis del clúster
  (sin TLS, cambio de Miguel del 03/11) ningún import de Shopify terminaba. Arreglado en
  [vio-extensions-microservice#61](https://github.com/vio-live/vio-extensions-microservice/pull/61), en QA. Prod no
  cambia (TLS por defecto).
- **Verificación:**
  - QA: `importShopifyProduct` real contra la base de QA en tres pasadas (misma imagen, una extra, sin la extra):
    filas conservadas, la extra insertada y luego borrada, y 0 huérfanas.
  - Prod, 10 min después del despliegue: 222 imports, 0 errores, **0 huérfanas nuevas**, 25 filas nuevas, y las
    retiradas bajando (1.508 → 928).
  - Products lleva sin caerse desde las 22:01 UTC del 03/11.

- **Token de Shopify en los logs** (08:30–08:55): `handleShopifyProductListingUpdated` imprimía con `console.log` el
  error de axios, que lleva el `accessToken` en el cuerpo de la petición. Quitado en
  [vio-products-microservice#55](https://github.com/vio-live/vio-products-microservice/pull/55) (develop) y en prod con
  [#56](https://github.com/vio-live/vio-products-microservice/pull/56) (`7cde48c`). Verificado en los pods nuevos: sin
  el `console.log`, sin tokens en el log y con los imports sin errores.
- **OK de Angelo** (08:40) para el índice, el `CHECK` y el #55: «Lo tienes desde anoche», por su encargo de anoche.
  Se lo pasé a Miguel; el índice y el `CHECK` los pone él.

- **Woo también soltaba imágenes** (09:05, aviso de Miguel con el índice ya puesto; 54 huérfanas de
  qkoreancosmetics.no en 40 min): `save()` → `newUpdate` mandaba las imágenes sin id a `calculateImages` en los
  productos en borrador. Arreglado en [vio-products-microservice#57](https://github.com/vio-live/vio-products-microservice/pull/57)
  (emparejar por URL, retirar las que ya no vienen y purgar) y en prod con
  [#58](https://github.com/vio-live/vio-products-microservice/pull/58) (`9717144`).
  - QA: `newUpdate` real en el producto Woo en borrador 387827, sin huérfanas y sin tocar otros campos.
  - Prod, 15 min: 381 imports, 0 huérfanas nuevas, 0 filas nuevas.
- **Índice `image (product_id, deleted_at)`** creado por Miguel (09:05, 99 ms). El `CHECK` lo pone cuando vea
  limpia su consulta tras una sync de QK.

- **Pedido de prueba de Faves (11:40 UTC, prod):** pedido 4130 (canal 484, campaña 4, Vipps MSN 1187978, «Posten - Pakke i
  postkassen» a 0 kr, 299 NOK). Llegó a su Woo como el pedido **142088**: «Under behandling», `free_shipping` instancia
  5, pago «Vio», stock descontado y los correos «Ny ordre» y «Ordrebekreftelse» enviados.
  - **Fallo:** justo después de crear el pedido en Woo, `handleOrderPaid` dio un 500
    (`expectedTotal.toFixed is not a function`): la comprobación del total del 02/11 sumaba el envío como texto
    (299 + "0.00"). Vio no guardó el id del pedido de Woo ni escribió la nota.
  - **Arreglo:** [vio-extensions-microservice#62](https://github.com/vio-live/vio-extensions-microservice/pull/62)
    (develop) y [#63](https://github.com/vio-live/vio-extensions-microservice/pull/63) (prod, mergeado por Angelo).
  - **Pedido 4130 arreglado a mano** (OK de Angelo): `order_item` 4610 → `supplier_woo_order_id` 142088, y la nota
    «order id: 4130 -> aller» en Woo. Era el primer pedido de Woo desde el 02/11; no hay más afectados.
  - **Cómo despacha Faves** (visto en sus pedidos): sin 3PL. Marcan «Fullført» a mano, por tandas por la mañana, y eso
    dispara el cobro (Dintero o Vipps) y el correo «Ordre fullført». Casi nunca ponen seguimiento.
  - **05/11 06:55 UTC, cerrado:** Faves pasó el 142088 a «Fullført» en su tanda de la mañana. Vio lo marcó enviado
    (COMPLETED, seguimiento 11930) y shopcart cobró Vipps: `capture` → 200, **299,00 NOK** en el MSN 1187978, con el
    webhook CAPTURED de vuelta. De punta a punta, bien.

- **Artículo de Faves, día de salida** («16 skjønnhetsfavoritter…», `article-192`, campaña 4): revisado con el
  playbook (scripts 1 y 4).
  - Lista: 16 bloques con `data-vio-campaign="4"`, Replit con el SDK 0.37.7, canal 484 17/17, Vipps partner con cobro
    al enviar, envío gratis en los 63 productos y las promesas.
  - Creado `~/vio-reportes/mote-livsstil/campaigns/faves.json` (no se manda solo).
  - **Títulos con `&amp;` literal** (WordPress manda el nombre escapado): arreglado el import en
    [vio-products-microservice#59](https://github.com/vio-live/vio-products-microservice/pull/59) (develop) y
    [#60](https://github.com/vio-live/vio-products-microservice/pull/60) (prod), con OK de Angelo.
  - Corregidos en prod los 8 títulos (7 de Faves y 1 de QK) en una transacción con ensayo, y vaciadas sus cachés.
    Comprobado en el artículo: ya no sale ningún `&amp;`.

- **Villoid, pedido de prueba de Michael (orden 4131), en Shopify** (OK de Angelo):
  - El arreglo del teléfono ya usado ([vio-extensions-microservice#64](https://github.com/vio-live/vio-extensions-microservice/pull/64),
    de la guardia de Alan) llegó a prod con [#65](https://github.com/vio-live/vio-extensions-microservice/pull/65).
  - Reenviado solo su `shopify/handleOrderPaid`: el pedido se lee de orders (`POST /4131`, solo lectura) y se agrupa
    por proveedor como en `processOrderPaidByCustomer`. No se repiten correos ni analítica. Antes se comprobó que el
    Shopify de Villoid no tenía ningún pedido `source_name:vio`.
  - Shopify volvió a dar el 422; extensions reintentó sin el teléfono y creó el pedido **#1757451** (`14340310499668`):
    `source: vio`, PAID, 1.228 NOK, `brn-pip`/`Vio`, `vio_order_id`.
  - Su cadena le puso **`piopal, Posten_PIP`** (como a sus pedidos de la web) y la orden de envío está abierta en
    «Main Warehouse».
  - `order_item` 4611 enlazado.
  - Pendiente: cuando lo despachen, comprobar el envío en Vio y el cobro de Vipps. A diferencia de los de su web, el
    pedido no lleva datos de Ingrid.

## Decisions

- Purga por id desde la lista exportada, de menor a mayor producto, en sentencias de 100 filas en los grandes, en vez
  de añadir un índice esa noche. El índice es un cambio de esquema: Miguel no lo hace sin el OK de Angelo.
- El arreglo de extensions se queda en develop/QA: prod no lo necesita.

## Blockers

- `CHECK` en `image`: con el OK de Angelo; Miguel lo pone cuando vea limpia una sync de QK (el índice ya está).
- En QA no hay ninguna tienda de Shopify con token válido (cosmed, la de Alan y la dev store dan 401), así que no se
  puede probar una sync real de punta a punta.

## Next session

1. Miguel: `CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)` en `image`, y retirar el barrido cuando el
   CHECK lleve unos días sin rechazar nada.
2. La misma cascada `nullify` afecta a opciones y variantes: en QA hay «Pakning» sueltas de un mismo producto.
3. ~~El token en los logs~~: hecho (#55/#56).
4. QA 412002 (tienda de Alan): mi prueba dejó su descripción en «<p>QA</p>». Variantes, opción y precio están
   restaurados; la descripción no se puede recuperar mientras la tienda no autentique.
