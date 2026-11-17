---
date: 2026-11-17
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-11-17 · webapp: el «Total» de una orden incluye el envío

## Goal

Bug de QA del 16/11: en la lista de órdenes del dashboard y en el CSV, el «Total» sumaba solo los productos. Con
envío de pago no cuadraba con lo que pagó el comprador ni con lo que cobró Vipps (VIO-4741: faltaban 10 NOK).
Angelo decidió que el «Total» incluye el envío.

## Done

- PR [vio-live/webapp-vio-commerce#115](https://github.com/vio-live/webapp-vio-commerce/pull/115), rama
  `fix/total-con-envio` (`282b419`, desde `develop` `849d6c2`), **sin mergear ni desplegar**.
- La lista (`src/views/orders/table.jsx`), el orden «highest total», el CSV (`ordersToCsv`) y la pestaña Orders del
  detalle de campaña (`src/views/campaign-detail/orders.jsx`, columna y CSV) usan ahora `orderPaid()` =
  `total_order_amount − total_discount + shippingPrice`, la misma cifra que «Total paid» del detalle y que la
  lista legacy (`OrdersTable.jsx` antes de `e301e1c`). La lista nueva (`15d09ff`) había cambiado a `orderTotal()`
  (suma de las líneas activas) y así perdió el envío.
- Los dos CSV conservan sus columnas y suman `shipping` justo después de `total`, con 2 decimales (el CSV usa la
  columna `currency` en vez de símbolo, como hasta ahora).
- `orderPaid()`: si la orden no trae `total_order_amount`, suma las líneas activas en vez de contarlo como 0.
  Nuevo `orderShipping()`. La cabecera de `src/lib/orders.js` documenta qué es cada campo de dinero.
- Tests: `orders-lib` (+5 casos), `orders-attribution` (cabecera del CSV), `orders-scope-filters` (fila de la
  lista), `campaign-orders-card` (columna y CSV). Sin el fix fallan 8. jest 111/1195 en verde; lint con los 2 de
  siempre (`src/views/shell/index.jsx:280`).

## Decisions

- **El Total sale de los campos de la orden, no se recalcula desde las líneas.** `total_discount` es lo que orders
  trae de shopcart (`checkout/by-orders-ids` → `totals.discounts`) y se resta una vez. Con líneas netas (Vipps con
  código, shopcart §8i) llega 0, así que el descuento no se resta dos veces.
- **El detalle de la orden ya incluía el envío**: la tarjeta Payment (Subtotal + Shipping − Discount = «Total
  paid») y la de líneas («You net» = `orderPaid − comisión`). No se tocó. Una inconsistencia menor que sigue ahí:
  en la vista de la brand, el «Subtotal» de la tarjeta de líneas es `orderTotal()` (líneas activas), mientras que
  el de la tarjeta Payment es `total_order_amount`. Con ítems cancelados los dos difieren.
- En la pantalla de órdenes no hay tiles de resumen con dinero. «Total transactions» del home viene del colector
  de analytics, no de las órdenes.

## Blockers

- No leí el código de orders-ms (regla del agente: solo su brief). Que `total_order_amount` sea «productos sin
  envío» lo deduje del legacy (lo rotulaba «Subtotal») y de los fixtures verificados en staging el 2026-08-20. Lo
  confirma que el bug fuera justo el envío.

## Next

- Merge a `develop` y deploy a staging (OK de Angelo). Comprobar en el navegador: la orden 4741 debe mostrar los
  10 NOK en el Total (lista y pestaña Orders de la campaña) y en la columna `shipping` del CSV.
- Una orden cancelada sigue mostrando lo que se cobró en su momento, no 0. Así funcionaba la lista legacy.
