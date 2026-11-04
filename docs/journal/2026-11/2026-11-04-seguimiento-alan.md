---
date: 2026-11-04
session: seguimiento-alan
participants: [angelo, claude]
status: live
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

## Decisions
- La guardia es diaria mientras Alan trabaje; foco Replit, Vipps y Kustom (Angelo, 4/11).

## Blockers
- Ninguno.

## Next session
- Ver «Done» de las vueltas de la guardia de hoy, abajo.
