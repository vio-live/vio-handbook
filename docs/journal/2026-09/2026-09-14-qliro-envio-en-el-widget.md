# 2026-09-14 — Qliro: elegir el envío dentro del widget, y el widget viejo al cerrar

Dos hallazgos de QA del mismo día, arreglados en ramas **sin mergear**.

## Alan — cerrar con la X deja el pedido viejo

Tarjeta [IW0OSJp7](https://trello.com/c/IW0OSJp7): con Qliro abierto, cerrar el checkout con la
X o con un clic afuera, cambiar el carrito y volver a abrir → Qliro pedía el **total viejo**.
Por "Endre" salía bien.

Causa, reproducida con un test sobre `main` del SDK (2100 → 3300, el widget seguía en 2100):
al cerrar solo se desmontaba Klarna. Los widgets de Qliro y Walley quedaban en el light DOM
con su pedido, y al reabrir el guard de "ya montado" los reutilizaba. Pagar ahí cobra el
carrito viejo. Nexi (rama `feature/nexi-payment`) tiene el mismo patrón: al rebasarla sobre
este arreglo, añadir `this.unmountNexi()` al reset del cierre.

## Angelo — Qliro ofrecía una sola tarifa, la más cara

Detalle y causa en [`architecture/qliro-configuraciones.md`](../../architecture/qliro-configuraciones.md)
(sección del 2026-09-14). En corto: el SDK guardaba en el carrito la primera tarifa (orden de
base de datos) y shopcart, al ver una guardada, mandaba solo esa a Qliro.

Decisión de Angelo: el envío **se elige en Qliro**, porque así funcionará con nShift. Por eso
el arreglo principal está en shopcart: el SDK no puede meterle opciones a Qliro
(`CreatePaymentQliro` no lleva envíos).

## Ramas

| Repo | Rama | Commit | Qué |
|---|---|---|---|
| shopcart | `fix/qliro-shipping-choices` | `4449a65` | `resolveShippingChoices`: todas las tarifas en los modos donde elige Qliro (guardada primero, resto de más barata a más cara) + test unitario |
| vio-web-sdk | `fix/qliro-checkout-shipping-and-close` | `573d2ae` | tarifas de más barata a más cara; el resumen sigue a Qliro; cerrar quita los widgets embebidos. 8 tests nuevos, 119/119 en verde, typecheck limpio |

Para verlo en QA: merge de shopcart a `develop`, publicar el SDK, rebundle de Vev y
**republicar la página** (una página ya publicada queda clavada a su bundle). El seller en
modo `vio-methods`.

## Para probar

- La edición masiva de productos con "Shipping class" **reemplaza** las tarifas del
  producto: deja solo la elegida. Para ver dos opciones en Qliro, el producto tiene que tener
  las dos vinculadas (ficha del producto → Shipping). El 411731 quedó solo con Express el
  2026-09-14, a las 17:55.
- Con Qliro y otro método activos: elegir una tarifa en nuestro formulario con el otro
  método y pasar a Qliro → Qliro abre con esa tarifa preseleccionada.
