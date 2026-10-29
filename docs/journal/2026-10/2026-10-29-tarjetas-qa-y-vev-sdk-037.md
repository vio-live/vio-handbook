---
date: 2026-10-29
session: afternoon
participants: [angelo, claude]
status: live
---

# Tarjetas de QA para Alan, tres fallos de analytics a prod y Vev a la SDK 0.37

## Goal

1. Una tarjeta para Alan que pruebe dos artículos con dos marcas distintas: una con productos por feed y Kustom, otra con Vipps.
2. Tarjetas con lo que cambió desde el lunes 26/10.
3. Arreglar los fallos que salieron al prepararlas y llevar Vev a la SDK 0.37.

## Done

- **Tarjeta [XCvIRuhn](https://trello.com/c/XCvIRuhn) (#467):** dos artículos, uno con feed y Kustom (key de la tienda Test), otro con Vipps. Lleva adjunto un feed chico validado con el parser de `google-merchant-feed`. QA no tiene ninguna tienda Magento viva: las 10 conexiones apuntan a máquinas apagadas, por eso Magento entra por feed, como Boots. Alan la pasó a Doing a las 16:02 UTC.
- **Cinco tarjetas con lo de esta semana** (110 PRs mergeados desde el 26/10), todas en To do y asignadas a Alan:
  - [#468 Vipps y checkout](https://trello.com/c/EmvSQ9Gx);
  - [#469 promesas, logo del transportista y plazo de entrega](https://trello.com/c/P2qmBQ88);
  - [#470 ficha, channel de cada campaña, carrusel y descripción](https://trello.com/c/b38ZKxvj);
  - [#471 analytics en staging](https://trello.com/c/rmVnrXvJ);
  - [#472 integraciones](https://trello.com/c/vAqIqpIi).

  Las redactaron cinco agentes contra el código, y las revisé antes de crearlas. Quedaron fuera los cambios que no se ven (despliegue sin caída, logs sin credenciales) y las apps de Shopify de Villoid y Floyd. Lo que depende de la SDK nueva va marcado como bloqueado hasta que Vev tenga la 0.37.
- **Tres fallos de analytics, en prod y verificados en el bundle.** [webapp-vio-commerce#96](https://github.com/vio-live/webapp-vio-commerce/pull/96) (develop) y [#97](https://github.com/vio-live/webapp-vio-commerce/pull/97) (master):
  - Los botones de la ficha: la SDK y el colector usan `detail` y el dashboard esperaba `product_detail`.
  - La revisión del layout es un token de texto (`v2`). Leída como número, salía «—».
  - El aviso del plazo de entrega decía que vaciarlo lo conservaba, pero desde products #40 lo borra.
- **Colector:** [vio-analytics#40](https://github.com/vio-live/vio-analytics/pull/40) (`62dd1ca`). La lectura de botones devuelve `option_value`, así que ahora sale «Size chosen · M». Miguel lo desplegó en staging y en prod y lo verificó con datos reales ([journal](./2026-10-29-colector-62dd1ca-option-value-cta.md)).
- **Vev a la SDK 0.37:** [vio-live/vev#75](https://github.com/vio-live/vev/pull/75), abierto y sin desplegar.
  - **Bundle:** `b49ebbb`, igual a npm 0.37.0.
  - **`add_payment_info`:** ahora sale con `checkout_id`. Antes «Went to Vipps» y «Vipps payments» quedaban vacíos para Vev: la SDK anuncia el checkout en `window` y Vev escuchaba en `document`.
  - **`cta_click`:** se manda para los botones de la SDK y para los propios de Vev.
  - **`noAddedToast`:** el aviso nuevo tapaba el carrito lateral de Vev.
  - **Checkout rechazado:** ya no se muestra el cajón vacío.
  - **Productos por el channel de la campaña del bloque.**
  - **Cambio de key:** ya no borra los carritos, que ahora son por conexión.
  - **Verificación:** `vev build` OK; tsc con los mismos 3 errores de `@vev` que main.

## Decisions

- **Kustom con dos marcas** (Angelo): una marca con Kustom usando nuestra key de la tienda Test, la otra con Vipps. Los productos de la de Kustom vienen por feed; la de Vipps los carga a mano o los trae de su Woo o Shopify.
- **Release del webapp:** cherry-pick sobre master, que solo difería de develop en este cambio.

## Blockers

- **`vev deploy` de #75: lo hace Angelo**, porque aquí no hay credenciales de Vev. Primero en el sandbox (`npm run sandbox:on`), y después republicar las páginas. Hasta entonces quedan bloqueadas la parte B de #468, la D de #469, lo de la SDK en #470 y B1, B2 y B4 de #471.
- **Tienda Woo de Alan:** el 22 y 23/10 daba Cloudflare 1101 en las llamadas autenticadas. Nadie lo volvió a comprobar, y la parte de Woo de #472 depende de eso.

## Next session

- Cuando Vev esté desplegado, avisar a Alan en #468, #469, #470 y #471 de que ya puede hacer lo bloqueado.
- **No hecho en #75:**
  - la espera del número de orden en `purchase` (`getOrderReference`);
  - un aviso de «Betaler hele handlekurven» en el Vipps Express de la tarjeta de Vev, que es decisión de producto;
  - las opciones nuevas de la ficha en Vio Config.
