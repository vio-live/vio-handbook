---
date: 2026-09-24
session: "Kustom: webhooks de cuenta probados en el portal del playground"
participants: [angelo, claude]
status: live
---

# Kustom: probar el portal para cerrar el círculo

## Goal

Del estudio del 22/09 quedaba una pregunta sin responder: si el webhook de cuenta de Kustom
dispara con un pedido creado por otro integrador. De eso depende que un comercio con sistema
propio se entere de nuestras ventas sin que construyamos nada.

## Done

- **Probado en el portal del playground**, con contraste contra su documentación. Resultado y
  detalle en [`architecture/kustom.md`](../../architecture/kustom.md#webhooks-de-cuenta-probados-el-2026-09-24).
  - El webhook de cuenta **sí dispara** con un pedido creado por API, y llega **a todos los
    destinos a la vez**: se creó uno de prueba junto al que ya existía y los dos recibieron lo mismo.
  - Salta **al pagarse**, no al crear el pedido. Llegan `order.created` y `capture.created` unos
    tres segundos después, firmados con el estándar de webhooks, y solo con identificadores.
  - Ya existía un destino «Vio Webhook» apuntando a nuestro QA, creado el 22/09, con 46 entregas
    en 200. **No hacemos nada con ellas**: el relay lee el id del pedido de la query string y el
    webhook de cuenta lo manda en el cuerpo.
- **Guía para el comercio** en el mismo doc, con los pasos del portal. Faltan las capturas.
- Compra de prueba completa en el playground con tarjeta de prueba y la persona de ejemplo de
  Noruega de su documentación.
- Limpieza: el destino de prueba se borró y el portal quedó como estaba.

- **Implementado el mismo día**, en cuatro PR contra develop, ninguno mergeado:
  [shopcart#37](https://github.com/vio-live/vio-shopcart-microservice/pull/37),
  [base-api#16](https://github.com/vio-live/vio-base-api/pull/16),
  [api#25](https://github.com/vio-live/vio-api-microservice/pull/25) y
  [webapp#33](https://github.com/vio-live/webapp-vio-commerce/pull/33). shopcart queda con 326
  tests en verde. Hasta que un vendedor tenga secreto, el comportamiento es el de hoy: se acepta
  y se descarta.

## Decisions

Ninguna nueva. Confirma la propuesta del 23/09: para Kustom no hace falta construir el reenvío del
aviso, porque su portal ya admite el destino del comercio.

## Blockers

- Capturas de la guía: no se pueden tomar desde aquí sin capturar la pantalla del usuario.
- Falta recorrer las pantallas de pedidos, captura y devolución del portal.
- Sigue pendiente lo mismo para el webhook de tienda de Walley.

## Next session

1. Leer el cuerpo en el relay de Kustom, verificar la firma y enrutar por tipo, para no tirar
   capturas y devoluciones.
2. Repetir la prueba en Walley.
