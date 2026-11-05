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

- **«Takk!» publicado (tarde):**
  - Release 0.37.8 ([vio-web-sdk#140](https://github.com/vio-live/vio-web-sdk/pull/140), `66cd826`).
  - Vev **0.346** ([vev#84](https://github.com/vio-live/vev/pull/84), `16fd29d`). Para volver atrás, restaurar la 0.345.
  - npm: `latest` 0.37.8 desde las 13:10 UTC, publicado por Angelo. Comprobado que el paquete es el de `main` (mismo
    shasum, `2922723c…`).
  - Tarjeta de QA para Alan: **#478** (su página de Vev; Vipps con envío gratis y de pago, Stripe, Vipps cancelado y
    Express).
  - Replit sigue en 0.37.7 hasta que Angelo lo pida.
- **#477 desplegado:** Miguel lo puso en staging y prod a las 13:33 UTC
  ([journal](./2026-11-05-colector-477-staging-y-prod.md)). Alan, avisado en la tarjeta: las dos compras internas de
  ayer deben salir de las cifras, una compra interna nueva no debe mover nada, y una desde una ventana privada sí debe
  contar.
- **Tests de pagos del webapp en verde**
  ([webapp-vio-commerce#99](https://github.com/vio-live/webapp-vio-commerce/pull/99), `f1eb9d8`):
  - Dos tests de `develop` describían el Vipps de antes de la partnership: sin respaldo de la plataforma y con solo
    cuatro credenciales. Ahora cubren claves propias, partnership y Express apagado.
  - Solo cambian tests. `jest`: 98 suites y 965 tests en verde.
  - De paso, comprobado que guardar el formulario en modo partner no borra el MSN: api-ms conserva el que asignó Vio
    (`withVippsServerFields`).
- **Kernel 1.0.290 en `develop` de los micros** (bump de vio-reel):
  - products, extensions, api y orders ya lo llevan en `develop`; en `master` siguen entre la 1.0.282 y la 1.0.287.
  - Trae la columna `surface.management_api_key`, que prod todavía no tiene.
  - Ninguno de esos micros consulta `surface` con la entidad del kernel: base-api tiene la suya, y shopcart y orders
    solo guardan `surfaceId`. Sus releases a prod no se rompen por eso; **solo campaigns necesita antes la migración**.

## Decisions
- Para los productos de Woo, **Woo es la fuente de verdad de las categorías** (Angelo, 05/11). Pisa lo que se haya
  puesto a mano en el dashboard, salvo cuando Woo no da ninguna.

## Blockers
- Replit con la 0.37.8: cuando Angelo lo pida.

## Next session
1. Replit: `npm install @vio-live/web-sdk@0.37.8 --save-exact` y redeploy con su agente; después, comprobar que el
   artículo de Faves carga la 0.37.8.
2. Alan: #478 («Takk!»), la prueba de #477, #472 (escenarios 3, 5 y 6; antes, reconectar su Shopify) y #476.
3. Abiertos de ayer ([journal del 04/11](./2026-11-04-products-oom-imagenes-borradas.md)):
   - la cascada `nullify` en opciones y variantes;
   - los pedidos de Villoid sin datos de Ingrid;
   - la transacción de Shopify de 1.199 contra el pedido de 1.228;
   - la descripción perdida del 412002 en QA.
