---
date: 2026-11-05
session: "Revisión de Alan del 04/11 y cuatro arreglos que pidió Angelo"
participants: [angelo, claude]
status: live
---

# Categorías de Woo, compra interna en analítica y recibo tras Vipps

## Goal
Angelo pidió revisar contra el código el trabajo de Alan del 04/11 y después cerrar lo pendiente: products#61 a prod,
#477 (compra interna), que «Woo mande» en categorías y el «Takk!» tras Vipps (Angelo, 05/11: «es importante»).

## Done
- **Revisión de Alan (04/11):**
  - #470, #471 y #475: hechas y comprobadas. La regla «la orden cuenta para la marca que vende» está en prod
    desde shopcart#114, y el SDK 0.37.7 en Vev 0.345.
  - #472: a medias. Le faltan los escenarios 3, 5 y 6.
  - #477: sin arreglar hasta hoy.
  - #476: sin empezar.
  - El 05/11 Alan no tiene actividad (ni Trello ni QA a las 12:16 UTC).
- **products#61 en prod** ([#62](https://github.com/vio-live/vio-products-microservice/pull/62)): la categoría por
  defecto de Woo se reconoce en cualquier idioma («Sin categorizar») y no se importa.
- **Woo manda en categorías:** en cada sync, un producto de Woo queda con exactamente las categorías de su tienda.
  Primero se enlazan las nuevas y luego se quitan las viejas con borrado lógico. Si Woo no le da ninguna, se queda con
  las que tenga; si el árbol de la tienda está incompleto, no se quita nada.
  - [vio-products-microservice#63](https://github.com/vio-live/vio-products-microservice/pull/63) (develop) y
    [#64](https://github.com/vio-live/vio-products-microservice/pull/64) (prod, `e5fb34a`).
  - QA: el 411963 de Alan pasó de «Activewear» a «Serum» y una segunda pasada no cambió nada.
- **#477, compra interna** ([vio-analytics#42](https://github.com/vio-live/vio-analytics/pull/42), mergeado): el colector
  ignoraba la marca del navegador para los pedidos. Ahora un navegador marcado saca su pedido de las cuentas solo por el
  UUID de su checkout, nunca por un número, para que nadie pueda ocultar un pedido ajeno.
  - Despliegue pedido a Miguel en el handoff (primero staging y luego prod).
- **«Takk!» tras Vipps** ([vio-web-sdk#139](https://github.com/vio-live/vio-web-sdk/pull/139), mergeado en `main`, sin
  release): el recibo de vuelta de Vipps, de un enlace de Stripe o de Adyen se rellena con `GetCheckout`, usando el
  checkout de la URL. Página de prueba de QA en `vio-web-dev.vio.live/qa-gratis.html`.

## Decisions
- Para los productos de Woo, **Woo es la fuente de verdad de las categorías** (Angelo, 05/11). Pisa lo que se haya
  puesto a mano en el dashboard, salvo cuando Woo no da ninguna.

## Blockers
- #477: despliegue del colector (Miguel).
- «Takk!»: prueba de Angelo desde el móvil con Vipps antes de la release 0.37.8, Vev y npm.

## Next session
1. Si la prueba del «Takk!» sale bien: release 0.37.8 del SDK, Vev, npm (Angelo) y Replit.
2. Cuando Miguel despliegue el colector: que Alan repita la compra con `?vio_internal=1` (#477).
3. Alan: #472 (escenarios 3, 5 y 6; antes, reconectar su Shopify) y #476.
