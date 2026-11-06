---
date: 2026-11-05
session: SDK web — el purchase tras Vipps sale del checkout pagado, nunca vacío (vio-web-sdk#143)
participants: [angelo]
status: live
---

## Qué pidió Angelo

Causa raíz en la SDK web del `purchase` vacío al volver de Vipps: Faves (surface 1, campaña 4, prod) tuvo
**4136, 4139 y 4142** en el colector con `value: 0`, `items: []`, sin `location_id` y
`order_id_kind: "checkout"`, mientras que el `order_paid` de los mismos checkouts llevaba importe y línea.
El colector ya se había protegido ([vio-analytics#43](https://github.com/vio-live/vio-analytics/pull/43),
ver [journal de Faves](2026-11-05-faves-primeros-pedidos-y-trafico.md)); faltaba que la SDK dejara de
mandarlo.

## Causa

- El `purchase` se arma en `src/core/analytics/analytics-manager.ts` (listener de `vio:payment-success`)
  con el **carrito de la pestaña** (o la foto previa al vaciado, `lastCartSnapshot`).
- De vuelta de Vipps, `applyReturnOutcome` (`vio-checkout.ts`) **vacía el carrito del sponsor y después**
  emite el evento. En una página recién cargada no hay foto previa → purchase sin líneas.
- El comprador de Faves hizo varias compras seguidas, un producto por checkout: en cada vuelta el carrito
  ya estaba vacío (otra vuelta lo limpió) o tenía **la compra siguiente**. Ese segundo caso era peor y
  silencioso: el purchase habría reportado el otro producto como este pedido (reproducido en test: 499 en
  vez de 1.797). Las compras de la misma sesión que salieron bien (4137, 4138, 4141) son las que aún
  tenían el carrito pagado en memoria.

## Arreglo — [vio-web-sdk#143](https://github.com/vio-live/vio-web-sdk/pull/143) (rama `fix/purchase-sin-lineas-tras-vipps`, abierto)

- Los emisores de vuelta (redirect de Vipps/Stripe/Adyen y recibo del proveedor tras una vuelta: Kustom,
  Qliro, Walley) marcan `vio:payment-success` con **`returned: true`**.
- En una vuelta, o con el carrito vacío, las líneas se leen del **checkout pagado** (`Vio.checkout.getCheckout`,
  la misma lectura que el recibo de 0.37.8; `receiptFromCheckout` se mueve a `src/core/checkout/`). Las del
  carrito solo se usan si tienen exactamente los mismos productos y cantidades (conservan slot y campaña).
- Checkout ilegible, sin líneas, o página oculta mientras se lee → **no sale `purchase`**: manda solo el
  `order_paid`, y el `add_payment_info` del checkout enlaza la sesión.
- `reportPurchase` descarta cualquier parte sin `items`.
- Sin `returned` y con carrito (pago en la página o un host propio): igual que antes.

Verificación: 3 tests DOM de la vuelta real de Vipps que **fallan en `main`** y pasan con el arreglo, más 8
unitarios en `analytics-manager.test.ts`. `tsc` limpio, build OK. Suite completa: los únicos 16 fallos son
los mismos que ya fallan hoy en `main` (`cart-manager.quantity`, `klarna-confirm`, `vio-cart.stepper`),
ajenos a este cambio. El repo no tiene CI.

## Pendiente

- ~~Mergear #143~~ **Mergeado a `main` el 2026-11-06 11:25 UTC (`6b1efcc`) con OK de Angelo.** Falta publicar en npm (lo publica Angelo); entra en `Unreleased` del CHANGELOG.
- Coste conocido: el purchase de una vuelta espera un `GetCheckout` (una petición más que la del recibo); si
  la página se oculta justo entonces, ese pedido queda solo con `order_paid`.
- Fuera de alcance, para mirar: la vuelta de Vipps vacía el carrito del sponsor entero, también si el
  comprador ya había metido el producto siguiente en otra pestaña.
- Los 16 tests rotos en `main` de vio-web-sdk.
