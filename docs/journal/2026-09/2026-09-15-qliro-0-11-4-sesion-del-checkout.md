# 2026-09-15 — 0.11.4: la regresión de la 0.11.3 que desmontaba Qliro al elegir envío

Continúa [2026-09-14 — Qliro: elegir el envío dentro del widget](./2026-09-14-qliro-envio-en-el-widget.md).

## Qué encontró Alan (noche del 14, tarjeta [IW0OSJp7](https://trello.com/c/IW0OSJp7))

Con la **0.11.3** (paquete Vev 0.297) Qliro no dejaba elegir envío con su producto 411896
(tarifas 200 / 100 kr, la cara primero en la base); con la 0.11.2 sí. Su diagnóstico —con
ayuda de su IA— acertó el mecanismo: el arreglo de la 0.11.3 desmontaba el widget.

## Causa (reproducida con tests)

La 0.11.3 decidía si un widget embebido estaba "viejo" comparando las **líneas del carrito**
con las del montaje (`cartFingerprint`). Dentro de la misma compra el backend **reescribe
esas líneas** —guardar la tarifa (`updateShippingsBySupplier` → `updateFromBackendCart`)
relee el carrito con el precio unitario y el id de variante tal como los devuelve el
backend—, así que el siguiente evento de Qliro (el cliente eligiendo envío) re-renderizaba,
las líneas ya no coincidían y **se desmontaba Qliro en plena compra**. Los tests de la 0.11.3
no lo vieron porque el montaje simulado nunca reescribía el carrito.

Probado sobre `main` con las dos formas en que el backend reescribe las líneas (precio
releído, variante normalizada): desmonte en ambas. No se pudo precisar qué campo cambiaba en
el caso concreto de Alan; el arreglo no depende de eso.

## Arreglo: 0.11.4

Cada `Vio.checkout.open()` abre una **sesión numerada** (`CheckoutState.session`) que todas
las actualizaciones posteriores conservan; un widget de una sesión anterior se rehace. Sigue
cubriendo la vista del carrito ("Til kassen" reabre = sesión nueva) y el cierre con la X,
sin mirar las líneas. Reabrir con el mismo carrito también crea pedido nuevo, como ya pasaba
al cerrar.

| Qué | Dónde | Resultado |
|---|---|---|
| SDK → `main`, **0.11.4** | [vio-web-sdk#49](https://github.com/vio-live/vio-web-sdk/pull/49) | merge `998c6c9`; los 2 casos de Alan fallan en 0.11.3 y pasan; 124/124 |
| Rebundle Vev | [vev#30](https://github.com/vio-live/vev/pull/30) | merge `dab0a3c`; `cartFingerprint` ausente del bundle |
| Paquete Vev `cq1lXld-TA9` | `vev deploy -m …` | **0.298** (0.296 = última buena conocida para elegir envío) |

## Lección

Un "¿cambió el carrito?" no puede leer datos que el backend reescribe durante la compra. Y un
test que simula el montaje tiene que simular también lo que el montaje real provoca (aquí:
`createCheckout` emitiendo y el carrito releído); si no, prueba otra cosa.

## Pendiente

- Probar en la página (Angelo + claude) y Alan en la suya, tras **republicar**.
- `npm publish` de la 0.11.4 (2FA de Angelo) cuando esté validado; npm sigue en 0.11.1.
- Nexi: al rebasar `feature/nexi-payment`, aplicar `unmountNexi` al cierre y la sesión al montaje.
