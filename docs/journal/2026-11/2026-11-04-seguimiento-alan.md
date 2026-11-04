---
date: 2026-11-04
session: seguimiento-alan
participants: [angelo, claude]
status: closed
---

# Seguimiento de Alan — 04/11

Sigue el [03/11](./2026-11-03-seguimiento-alan.md). Alan vuelve hoy tras no trabajar el 3/11.

## Goal
Dejarle la cola clara y hacer guardia: verificar lo que reporte, arreglar en QA, subir y contestarle.
Foco de Angelo desde hoy: **Replit, Vipps y Kustom**.

## Done
- **~11:50 UTC, cola de Alan puesta al día en Trello** (como Angelo): #474 Boots → Done; #470 con lo único que
  falta (escenario 1) y el aviso de republicar sobre Vev 0.345; #471 y #472 con su estado (B1/B2/B4
  desbloqueados; tienda Shopify de Alan en QA con 401, reconectar antes del escenario 6; 412002 con descripción «QA»).
- **#475 creada:** envío gratis («Gratis») y «Avbryt» en Vipps con la SDK 0.37.7 ([tarjeta](https://trello.com/c/gcAL4NjH)).
- **#476 creada:** estrés del alta de un cliente, 8 bloques y 35 puntos sobre el playbook
  [alta-marca-en-articulo](../../playbooks/alta-marca-en-articulo.md) ([tarjeta](https://trello.com/c/SekdFcq5)).
- **#445 y #453 archivadas** (superadas / escritas contra un estado viejo).
- Cola: #470 (escenario 1) → #471 → #472 → #475 → #476.
- **Guardia convertida en rutina:** playbook [guardia-alan](../../playbooks/guardia-alan.md) y skill local
  `/guardia-alan` (bucle sobre la actividad de Alan en Trello).
- Prod, de paso: Faves (1301) y QKC (1302) tienen un solo envío vivo a 0 NOK en todos sus productos, y el mapeo
  Woo de extensions coincide. `_db.js` del playbook de alta corregido (`ENV_FILE` relativo en el pod).

- **13:28 UTC, Alan (#470):** «escenario 1 con campañas nuevas y limpias», órdenes **4673** y **4674**. Verificado en QA:
  surface 18 «Escenario 1», campañas 22 (default) y 23, **las dos de la marca 1333**, canal 508, Stripe; 4673 desde
  `/woo-origin` → campaña 22 y 4674 desde `/test` → campaña 23. Es el caso «cada artículo vende por su campaña» (escenario
  6), no el cruce entre marcas. Las campañas 13 y 15 ya no existen en QA. Contestado en la tarjeta: cómo montar el
  escenario 1 con dos marcas, pedir ids, y que 1333 no tiene nombre de marca (el recibo muestra el username). Alan pasó
  #471 a Doing (13:42).
- **14:11 UTC, Alan (#470):** borró él las campañas 13 y 15 («limpiar usuarios»); marca nueva 1343 y campaña 24 en la
  surface 18; órdenes **4675** (1343, pagada en `/test`, que ahora lleva la campaña 24) y **4676** (1333, pagada en
  `/woo-origin`, sin campaña → default 22). Las dos pagadas desde el artículo de su propia marca: sigue sin ser el cruce.
  Contestado con tabla y las dos compras exactas (añadir en un artículo, pagar en el otro; se verifica por `content_url`).
- **14:37 UTC, Villoid (prod, aviso de Angelo «Vipps de Villoid parece activo»):** unidad 1188223 asignada a 1323 por
  api-ms (ayer 403); canal 485 → `["Vipps"]`; config pública: campaña 5 con `["vipps"]`. Detalle en el
  [journal de Villoid](./2026-11-03-villoid-piloto-un-producto.md). Falta el pedido de prueba.
- **14:38–15:14 UTC, Alan (#470):** 4678/4679 también pagadas desde el artículo propio (lo dice la `attribution` del checkout;
  `content_url` de la orden es la página del origen del carrito, no la del pago). Le di el protocolo exacto con vídeo. A las 15:14,
  **4680**: producto de 1343 añadido en `/test`, caja abierta en `/woo-origin`, orden en la campaña 24 → **cruce correcto**. Falta
  el sentido contrario para cerrar.
- **14:46 UTC, Villoid prod, pedido de prueba de Michael (orden 4131, Vipps, campaña 5):** no se creó en Shopify, 422
  `customer.phone_number: has already been taken`; el reintento de `createOrder` solo reconocía el texto viejo y tragaba el error.
  Arreglo [extensions#64](https://github.com/vio-live/vio-extensions-microservice/pull/64) mergeado a develop y en QA (15:12). La suite
  de extensions no arranca en sqlite (`Checkout.attribution` es `json`, kernel 1.0.289): solo pudo correrse el test unitario del helper,
  en un pod aparte con la imagen de QA. Pendiente: OK de Angelo para la release a prod y el reenvío del `handleOrderPaid` de la 4131.
- **15:04 UTC, Alan (#471):** capturas del funnel de la campaña 24 (coherentes: 5/5/4/2/1, Today/Yesterday/Custom) y pregunta qué falta;
  contestado con la lista: protocolo de 3 visitas, escenario 2, desgloses, Product funnel, Click rate, B1/B2/B4.
- **15:25 UTC, Alan (#471): «¿hay problemas en staging?»** (`502 analytics collector unreachable` en `timeseries`). Causa: base-api
  (`statsService`, timeout 15 s) contra el colector de staging, que se satura cuando la vista general del dashboard pide el
  `timeseries` de 14 d de las 8 surfaces del publisher 1332 a la vez: 81 timeouts a las 13:11 y ~640 entre 15:16 y 15:23; el
  `/health` del colector responde en 0,06–0,2 s. No es de los pods de QA. Contestado en la tarjeta; anotado para Miguel (VM del colector).
- **16:01 UTC, Alan (#471):** ocho capturas: tiles antes/después de 3 clics (Click rate 13/14 ✅, tiles por eventos vs embudo por
  visitas ✅), desgloses Device y Article (cuadran con Overall), Products, Over time 14 d y Buttons (B4) ✅. Faltan: fila `qa-alan` en
  Source (utm), B2 Vipps pagado + cancelado, horas de Oslo en Today, y B1 `?vio_internal=1` al final. Contestado.
- **16:12 UTC, Alan (#471 / #470):** la **4681** (15:26) era el sentido contrario del cruce (1333 añadido en `/woo-origin`, caja en
  `/test`, campaña 23) → **#470 a Done**. En #471: fila `qa-alan` ✅, Vipps pagado (4682) con «Went to Vipps» y «Paid» ✅, horas de
  Oslo ✅; falta un Vipps **cancelado** y la captura de después de la compra interna 4683 (B1).
- **16:22 UTC, Alan (#471), hallazgo B1:** con `?vio_internal=1` la visita queda fuera del funnel (17/16/11/4/4 igual), pero la
  **orden 4683 cuenta**: «Orders with no visit» 0→1 y «Buyers & payment · Today» 5→6. El `order_paid` del servidor (ADR-0038) no sabe
  que la sesión era interna. Pendiente de decidir dueño y arreglo (colector/shopcart). Falta el Vipps cancelado para cerrar #471.
- **16:54 UTC, Alan (#471):** Vipps cancelado verificado (checkout `1f4e4721` en CANCEL a las 16:53; shopcart emitió `payment_cancelled`,
  aceptado por el colector) → **#471 a Done**. El hallazgo de la compra interna queda en una tarjeta de bug propia (To do, sin dueño).
- **17:10 UTC, Alan (#475, saltándose #472):** tarifa «Zero» a 0 en 1343; envío gratis OK con Stripe (4684) y Vipps (4685, 4686):
  caja «Gratis», app de Vipps «0 NOK», `shipping_price` 0,00. Marcó también los dos «Avbryt» sin evidencia (los dos checkouts de Vipps
  fueron a SUCCESS en <1 min, ningún CANCEL): desmarcados y pedidos en vídeo. **Visto de paso:** la pantalla «Takk!» tras Vipps no
  muestra las líneas ni el envío; tras Stripe sí (SDK 0.37.7). Sin tocar.
- **17:57 UTC, Alan (#475):** cuatro vídeos de los «Avbryt». En la base: 5 checkouts de Vipps en CANCEL (17:45–17:54, `ABORTED` en
  Vipps, `payment_cancelled` aceptado por el colector) y después las órdenes 4687 y 4688 con envío 0 → **#475 a Done**. Nota: tras el
  «Avbryt» de la pantalla de espera el pago queda `ABORTED` en Vipps (no se puede aprobar después), distinto de lo anotado el 3/11.
- **18:24 UTC, Alan (#477):** se llevó la tarjeta del bug a Doing y lo reprodujo otra vez (antes/después + vídeo). Devuelta a To do:
  es tarjeta de arreglo sin dueño; se le pasará para confirmar cuando esté en QA.
- **19:56 UTC, Alan (#472), hallazgo real:** su tienda Woo (`fencemine.s3-tastewp.com`, en español) llama «Sin categorizar»
  (`sin-categorizar`) a la categoría por defecto; `woo-categories.ts` solo descartaba `uncategorized`/`ukategorisert`, así que se
  importó como categoría real (5914) y se asignó a los productos sin categoría. Arreglo
  [products#61](https://github.com/vio-live/vio-products-microservice/pull/61) (slugs por idioma, por slug y por nombre normalizados,
  solo nivel superior; 12/12 tests en verde en local), mergeado a develop a las 20:08, desplegándose en QA. **Segundo punto, de diseño:**
  un producto que ya tenía categorías no las actualiza al re-sincronizar (`assignWooCategories` sale si `already > 0`); dos de sus
  productos eran de octubre. Pendiente de decidir (Angelo). Contestado en la tarjeta: que repita el escenario 1 con productos nuevos.
- **20:01 UTC, Villoid prod:** Michael repitió la compra: orden **4132** → Shopify **#1757827** a los 5 s, con el reintento del teléfono
  (mismo 422), `brn-pip`/Vio 29 NOK, `Posten_PIP`, correo enviado. Falta el despacho de Business Central.
- **20:27–20:36 UTC, Alan (#472) con products#61 en QA:** escenario 1 ✅ (p1 → Serum bajo Hudpleie; p2 → Serum **y** Skin & Care;
  p3 sin categoría), escenario 2 ✅, escenario 4 ✅ (pedido propio 25 de su Woo descartado: `has no Vio products: ignored`; Alan lo
  reportó como «no llega a Vio», que es lo esperado). Visto de paso: al guardar la ficha de p2 (`newUpdate`, 20:26:22) las categorías se
  reescriben a **una** (la ficha tiene un solo selector); límite del formulario, no del import. Quedan 3, 5 y 6.
- **21:45 UTC, QA, demo (pedido de Angelo):** los 17 productos de la colección de Faves de prod (`pxCAIn2x5`) copiados a Careless QA
  (1338) como productos nativos (ids 416043–416059, marca «Faves», precio NOK, imágenes, SKU, tope de stock 100), con las tarifas
  «Default Shipping» 10 y «Gratis frakt» 0, publicados y añadidos a la colección `CVs9DoYPX` → canal 513 **22/22**, copias 22/22, el
  canal entrega los 22 (`channel/all-items/1312?channelUserId=513`). Campaña 14 «WEb test» (surface 15) **termina el 5/11 13:40 UTC**:
  avisado a Angelo por si la demo es después. Scripts: scratchpad `qa-faves-to-careless.js` + volcado `faves-collection-prod.json`
  (datos de producto, sin PII).

## Decisions
- La guardia es diaria mientras Alan trabaje; foco Replit, Vipps y Kustom (Angelo, 4/11).

## Blockers
- Ninguno propio. Esperan decisión de Angelo: #477, el «Takk!» de Vipps, la re-sincronización de categorías de Woo.

## Next session
1. `/guardia-alan` al abrir QA (06:30 UTC). Cola de Alan: **#472** (quedan escenarios 3, 5 y 6; reconectar su Shopify antes del 6) →
   **#476** (estrés del alta). Cerradas hoy: #470, #471, #475, #474.
2. **Villoid:** vigilar en prod si Business Central despacha el pedido 4132 / Shopify #1757827 (fulfillment + tracking de Posten) y que Vio
   lo marque enviado y capture Vipps. Avisar a Angelo.
3. **Demo Faves en Careless QA:** la campaña 14 termina el 5/11 13:40 UTC; mover la fecha si Angelo lo pide.
4. Decisiones de Angelo pendientes: dueño del bug **#477** (compra interna cuenta como pedido), el «Takk!» de Vipps sin líneas (SDK
   0.37.7), y si la re-sincronización de Woo debe actualizar categorías de productos existentes (products#61 solo cubre el alta).
5. Suite de tests de extensions rota en sqlite (`Checkout.attribution` es `json`, kernel 1.0.289): decidir con Miguel.
