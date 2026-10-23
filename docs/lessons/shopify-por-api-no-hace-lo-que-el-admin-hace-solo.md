---
title: "Shopify por API no hace lo que el admin hace solo: ni avisa al comprador, ni repone stock al cancelar"
last-updated: 2026-10-24
author: claude
---

## Síntoma

Primer pedido real de Careless creado por Vio en su Shopify (23/10, 22:07 UTC): el comprador no recibió ningún correo de
confirmación. Diez minutos después se canceló desde el dashboard de Vio: Shopify canceló el pedido pero la unidad siguió
descontada del inventario.

## Causa

Lo que el admin de Shopify hace por defecto, la API no lo hace salvo que se le pida:

- `POST /orders.json` no envía la confirmación al cliente sin `send_receipt: true` (ni el aviso de envío sin
  `send_fulfillment_receipt: true`).
- `POST /orders/{id}/cancel.json` no repone inventario sin `restock: true`. La cancelación por ítem con `refund` y
  `restock_type: cancel` sí reponía, por eso nadie lo había notado.

Además el pedido se firmaba con `source_name: outshifter`, la marca antigua, visible como origen del pedido.

## Regla

Al escribir en la tienda de un comerciante, revisar los parámetros opcionales de la llamada contra lo que su admin haría a
mano: notificaciones, reposición de stock, origen. Y probarlo con un pedido real de punta a punta antes de un go-live,
mirando la línea de tiempo del pedido en Shopify (eventos `mail_sent`, `restock_line_items`), no solo el 200.

Arreglos: extensions [#41](https://github.com/vio-live/vio-extensions-microservice/pull/41),
[#43](https://github.com/vio-live/vio-extensions-microservice/pull/43),
[#45](https://github.com/vio-live/vio-extensions-microservice/pull/45). Journal:
[2026-10-23-product-category-p1-p2-p3-a-prod.md](../journal/2026-10/2026-10-23-product-category-p1-p2-p3-a-prod.md).
