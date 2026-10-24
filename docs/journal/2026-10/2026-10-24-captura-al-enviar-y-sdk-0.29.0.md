---
date: 2026-10-24
session: "Captura al enviar probada en prod, y la compra rápida que pagaba líneas ocultas (SDK 0.29.0)"
participants: [angelo, claude, miguel]
status: live
---

# Captura al enviar en prod, y SDK 0.29.0

## Done

- **Captura al enviar, de punta a punta en prod** (orden 4128 / Shopify #554756CL, Careless). El 360 marcó el envío a las
  09:58:53 UTC con seguimiento Helthjem 473325380101336979; a las 09:58:58 extensions recibió `orders/fulfilled`,
  reconoció la orden por su metafield, orders guardó el seguimiento y a las 09:58:59 **capturó 658 NOK en Vipps**
  (la reserva entera); el webhook `CAPTURED` de Vipps llegó un segundo después y no hubo doble captura; la orden quedó
  completada. El comprador recibió el aviso de envío de Careless y el de Helthjem (`send_fulfillment_receipt`, extensions #43).
  Con esto el flujo de Careless está probado entero: pago, pedido, confirmación, 3PL, envío, captura, cancelación con
  reposición de stock.
- **El «producto fantasma» del carrito** (la orden 4127 con dos líneas): «Kjøp nå med Vipps» de la ficha sumaba el
  producto al carrito y pagaba el carrito entero sin enseñarlo. Angelo eligió la opción B: [vio-web-sdk #98](https://github.com/vio-live/vio-web-sdk/pull/98),
  mergeado:
  - el checkout y el panel se construyen sobre el carrito del servidor;
  - las pestañas se enteran de un pago;
  - evento nuevo `vio:cart-updated`;
  - la compra rápida con Vipps **o Apple Pay** va directa solo con el carrito vacío; con productos abre el checkout con
    todas las líneas. Apple Pay enseñaba en la hoja un importe y cobraba otro: corregido igual.
- **Probado en navegador contra QA** (surface de Replit staging, Careless 1338, harness local con la rama):
  carrito vacío → Vipps de test directo con 599 NOK; carrito con Vilde → «Kjøp nå» en Sofie abre el checkout con las
  dos líneas, 1.308 NOK con el envío de Vio y Vipps elegido; Vipps pide 1.298 NOK porque con Vipps Express el envío se
  elige dentro de Vipps (como en prod).
- **Release 0.29.0** ([#99](https://github.com/vio-live/vio-web-sdk/pull/99)) en `main` `f2ffa66`; 808 tests, los 16
  fallos previos de siempre. **Publicar en npm: Angelo.**

## Open

- **Publicar 0.29.0** (`npm login --auth-type=web` y `npm publish` desde `vio-web-sdk` en `main`), y después:
  Replit sube a 0.29.0; **Vev necesita rebundle** (lleva el SDK vendorizado) y `vev deploy`.
- Detalle visto en la prueba: el checkout de Vio suma su envío por defecto (10 NOK en QA) al total, pero con Vipps
  Express el envío lo elige el comprador en Vipps y el importe pedido es sin él. El total que enseña Vio no coincide con
  el de Vipps hasta elegir envío. Preexistente; para revisar.
- **La 4128 sin `purchase` del navegador** (Miguel, 24/10): el panel de la marca no la cuenta (solo cuenta compras del
  navegador; el del publisher sí, como «no atribuida»). Pendiente: ver en el colector qué eventos llegaron de su checkout y
  añadir `charged` / `orders_unattributed` al panel de la marca.
