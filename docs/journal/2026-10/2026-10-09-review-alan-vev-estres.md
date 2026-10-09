---
date: 2026-10-09
session: "Review de la prueba de estrés de Vev que hizo Alan el 08/10 (tarjeta CQIvMg89)"
participants: [angelo, claude]
status: live
---

# Lo que Alan encontró apretando Vev (0.321), contrastado con el código

## Goal

Alan dedicó el 08/10 entero a la tarjeta [CQIvMg89](https://trello.com/c/CQIvMg89) («Apriétalo
todo»): componentes de Vev, lo nuevo de 0.319–0.321, dispositivos, cuentas, métodos de pago,
Desktop first y Mobile first. Dejó 10 comentarios, 10 capturas y 2 vídeos. Este review contrasta
cada hallazgo con el código (plugin `vio-vev`, SDK web, shopcart) y lo ordena por impacto.

## Done — hallazgos, con causa en el código

| # | Hallazgo de Alan | Qué pasa en el código | Gravedad |
|---|---|---|---|
| 1 | **Dos pestañas con el mismo carrito: pagó dos veces** (captura de la BD: checkouts de las órdenes 4518 Stripe y 4519 Vipps con el mismo `cart_id`). También errores crudos: «[vipps] amount must be a positive integer… got 0» y «Produktene i handlekurven kan ikke sendes sammen». | `CreateCheckout` pone en `INACTIVE` el checkout anterior del carrito y crea otro, pero **ningún camino de pago mira `INACTIVE`** (solo `SUCCESS` del propio checkout) y **crear la orden no cierra el carrito ni los checkouts hermanos**. La pestaña vieja sigue pagando su checkout superseded; la nueva paga el suyo: dos órdenes, dos cobros. Los textos crudos son el wrapper del gateway («Payment Vipps not initialize: …») sin traducir. | **Alta** (dinero) |
| 2 | **Stripe intermitente**: «Payment Stripe not intent execute: Cannot read properties of undefined (reading 'id')». | En la creación del intent, el bloque de descuentos legacy hace `d.discountType.id` y `dp.product.id` sin comprobar nulos (`checkout.service.ts` ~1811–1845): un descuento del canal con relación sin cargar o con un producto borrado tumba el pago. Intermitente porque depende de los descuentos del canal. | **Alta** |
| 3 | **Teclado**: Tab no entra en la ficha; Enter la abre pero el foco sigue detrás; nunca pudo comprar. | Los tres diálogos del SDK (ficha, carrito, kasse) tienen `role="dialog"` y nada más: sin `focus()` al abrir, sin trampa de foco, sin Esc, sin devolver el foco al cerrar. | Media (accesibilidad; Schibsted lo pedirá) |
| 4 | **Tema → esquinas** (sharp/default/rounded) no cambian nada. | Vev manda los presets por `applyVioTheme` y el SDK los convierte en `--vio-radius-*`, pero los componentes usan radios fijos: ficha 4 fijos / 1 token, carrito 7 / 1, card de Vev 6 fijos, botón de carrito 3 fijos. Solo la kasse (10 tokens) obedece. | Media |
| 5 | **Cambiar de sponsor**: el carrusel se actualiza, la card individual no (sigue mostrando un producto que no es del canal). | El carrusel escucha `vio:sponsor-changed`; `card-view.tsx` usa el `sponsorId` de las props de Vev (por defecto 1) y no escucha el evento. | Media (editor) |
| 6 | **Mobile first vs Desktop first**: una card a ancho completo en escritorio es una imagen gigante; una card de escritorio en móvil queda minúscula sobre el texto. | La card llena el marco que Vev le da (`width:100%`, imagen 1:1) y Vev posiciona por breakpoint; no hay límites (max-width de una card sola, aviso del editor como el de alto fijo de 0.319). | Media (guardrails) |
| 7 | **Red lenta + Vipps**: el campo de e-mail «se queda cargando» porque la kasse redirige a Vipps. | UX: no hay estado «Sender deg til Vipps…»; el spinner cae sobre el formulario. | Baja |
| 8 | **Desconectar la API key** deja los productos hasta recargar. | Esperable (no se vacía el estado); mejora menor. | Baja |
| 9 | **Clics rápidos** (vídeo): cantidad 1→9 y sumas correctas; no se ve qué falló. | Pedir a Alan qué vio. | — |

Lo que confirmó bien: los 10 puntos de 0.319–0.321 (Vipps en la card, compacto, aviso amarillo,
alineación, custom image, «Bekrefter betalingen…», ordrenummer, recarga sin doble cobro, Company
name), carrusel, grid, ficha/carrito/kasse, página pesada. Checklist: **28/40**. Sin tildar: Vio
Config (6 de 7: país/moneda, dos bloques Config, analítica sin duplicados…), la matriz 4 layouts ×
4 botones × acción, editor ↔ publicado, y cuatro de estrés que comentó sin tildar.

**La crítica final está incompleta**: el comentario «Veredicto general» se corta en el punto 3 de
la sección 1; las secciones «lo que falta para vender mejor» y la lista de mejoras ordenada por
impacto con coste no están, aunque los tres ítems de «Crítica y mejoras» figuran tildados.

## Hecho (tarde): los seis puntos, mergeados y desplegados

Angelo: «ve con todos los puntos, mergeas, despliegas y cuando yo vuelva los probamos».

| # | Fix | PR | Estado |
|---|---|---|---|
| 1 | Un carrito, un pago: `checkout-guards.ts` (`assertPayable` / `paidSiblingOf`); todo inicio de pago exige checkout `ACTIVE` sin hermano `SUCCESS`; toda finalización descarta el duplicado (sin orden, checkout `CANCEL`, en Vipps libera la reserva); `CreateCheckout` rechaza un carrito pagado. Códigos `CHECKOUT_SUPERSEDED` / `CART_ALREADY_PAID` que el SDK traduce. | [shopcart#78](https://github.com/vio-live/vio-shopcart-microservice/pull/78) + [#79](https://github.com/vio-live/vio-shopcart-microservice/pull/79) | QA |
| 2 | Descuentos null-safe en los inits de Stripe (el bloque legacy copiado cinco veces) | shopcart#78 | QA |
| 3 | Foco, Tab y Esc en ficha, carrito y kasse (`dialog-focus.ts`, 21 tests) | [web-sdk#74](https://github.com/vio-live/vio-web-sdk/pull/74) (0.20.0) | bundle en Vev |
| 4 | Radios del tema en ficha y carrito (SDK) y en la card de Vev con variables propias (`--vio-card-radius` etc.): default idéntico, sharp/rounded llegan a la card | web-sdk#74 + [vev#56](https://github.com/vio-live/vev/pull/56) | bundle en Vev |
| 5 | La card individual sigue a `vio:sponsor-changed` (hook `useActiveSponsorId` compartido con carrusel y grid) | vev#56 | bundle en Vev |
| 6 | Card individual: tope 480 px centrado + avisos del editor (>480 / <120 px) con `useFrameWidth`/`EditorNotices` | vev#56 | bundle en Vev |
| — | Mensajes claros al no poder iniciar un pago (`friendlyPaymentError`): carrito vacío, cambiado en otra pestaña, ya pagado | web-sdk#74 | bundle en Vev |
| — | Rebundle del SDK 0.20.0 en el plugin (`vio-sdk/index.js`, receta esbuild del README) | [vev#57](https://github.com/vio-live/vev/pull/57) | **publicado como 0.322** (12:35); falta republicar cada página |

- **Incidente propio, 10 minutos**: #78 recargaba el checkout con `findOne(id, { relations: ['cart'] })` y la
  entidad ya trae el carrito eager → `Not unique table/alias: 'Checkout__cart'` en todo init de Vipps en QA.
  #79 lo recarga con el query builder (`leftJoin`), como `getCartIdByCheckoutId`. Lección: con entidades del
  kernel que declaran relaciones eager, nunca `relations:` en `findOne`.
- Comprobado antes de mergear que los tres SDK (web, Swift, Kotlin) abren un carrito nuevo tras cada orden
  (`clearSponsorCart` / `resetCartAndCreateNew`), así que «carrito pagado → sin checkout nuevo» no rompe una
  segunda compra.
- Decisión de diseño (agente + yo): los botones circulares no siguen el preset de esquinas; y la card usa
  variables propias porque el SDK inyecta valores por defecto para `--vio-radius-*` y el fallback nunca
  aplicaría (el aspecto «default» habría cambiado).
- Trello: seis tarjetas nuevas para Alan en To do con cómo probar y qué evidencia (SqfAhftq, HG2F9r4b,
  VIXYYn1u, kmRoWIwV, ebrwi4MI, BynkPCL1), enlazadas a CQIvMg89, y comentario en su tarjeta con lo que falta
  (crítica completa, 12 puntos, el vídeo de clics rápidos).
- **Verificado en QA tras #79** (script `two-tabs-smoke.py`, canal de Aller, 11:26): pagar el checkout
  reemplazado → `CHECKOUT_SUPERSEDED`; pagar el nuevo y aprobarlo → orden 4521 creada una vez; pedir otro
  checkout del carrito pagado → `CART_ALREADY_PAID`; volver a pagar el checkout pagado → `CART_ALREADY_PAID`.
- **`vev deploy` hecho por mí a petición explícita de Angelo («haz tú el vev deploy»)**, con las comprobaciones
  de la regla del 18/08: `vev versions` sin versiones indocumentadas por encima de la 0.321, `vev.json` en el
  paquete compartido `cq1lXld-TA9`, árbol limpio en `main` (de0e4e2), bundle byte a byte idéntico a un build
  fresco del `main` del SDK (600.965 bytes), `vev build` limpio. Resultado: **0.322** con mensaje. Las
  páginas publicadas siguen con su bundle hasta que se republiquen (Angelo y Alan).
- Seguimiento sin hacer (del agente del SDK): los diálogos cerrados siguen en el DOM fuera de pantalla y sus
  botones son alcanzables con Tab desde la página (`inert` o `visibility: hidden` al cerrar).

## Decisions

- Angelo: arreglar los seis puntos de una vez, mergear y desplegar sin esperar a su vuelta («cuando
  yo vuelva los probamos»). El trabajo se repartió: shopcart a mano (dinero), SDK y plugin de Vev con
  dos agentes con instrucciones cerradas y revisión del diff antes de mergear.
- La refusal «carrito ya pagado → sin checkout nuevo» se mantiene estricta: los tres SDK abren un
  carrito nuevo tras cada orden; un cliente que reutilizara el carrito pagado sería precisamente el
  bug del doble cobro.

## Blockers

- Republicar las páginas de Vev (Angelo y Alan). Alan: completar la crítica y los 12 puntos sin tildar; probar las seis tarjetas nuevas.

## Next session

- Probar con Angelo los seis puntos en QA sobre una página republicada con 0.322; revisar la evidencia de Alan en las seis tarjetas.
